"""Validate one Rhombus pipeline run against the data contract.

    python data-validation/validate.py --run baseline \
        --input datasets/baseline.csv --output gs://bucket/orders/ \
        [--after 2026-09-29T10:00:00Z] [--baseline-report data-validation/reports/baseline.json] \
        [--compare-hash data-validation/reports/baseline.json ...] [--reference-output out.csv]

--input is a local CSV or s3://bucket/key. --output is a local CSV, a local
directory, gs://bucket/key, or gs://bucket/prefix/ (newest object wins, only
those updated after --after if given). Writes data-validation/reports/<run>.json, prints a
table and exits 1 if any check fails.
"""

from __future__ import annotations

import argparse
import json
import sys
from datetime import date, datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

import checks  # noqa: E402
from common import (Check, canonical_hash, load_contract, read_csv_bytes,  # noqa: E402
                    sha256_bytes)
from drift_detectors import build_profile, run_detectors  # noqa: E402
from reference_clean import clean_with_stats  # noqa: E402
from storage import fetch, load_env  # noqa: E402

REPO = Path(__file__).resolve().parent.parent
COLOURS = {"pass": "green", "warn": "yellow", "fail": "red"}
ANSI = {"pass": "\033[32m", "warn": "\033[33m", "fail": "\033[31m"}


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    p = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    p.add_argument("--run", required=True, help="name for this run (report file name)")
    p.add_argument("--input", required=True, help="local CSV or s3://bucket/key")
    p.add_argument("--output", required=True,
                   help="local CSV/dir, gs://bucket/key or gs://bucket/prefix/")
    p.add_argument("--after", type=_utc, help="only output objects updated after this "
                   "ISO timestamp")
    p.add_argument("--baseline-report", type=Path,
                   help="baseline report JSON; enables the semantic drift detectors")
    p.add_argument("--compare-hash", type=Path, nargs="+", default=[],
                   help="earlier reports whose canonical output hash must match")
    p.add_argument("--reference-output", type=Path,
                   help="also write the oracle's cleaned CSV here")
    p.add_argument("--reports-dir", type=Path, default=REPO / "data-validation" / "reports")
    p.add_argument("--as-of", type=date.fromisoformat, default=date.today(),
                   help="date used by the future-dates detector (default today)")
    return p.parse_args(argv)


def _utc(text: str) -> datetime:
    value = datetime.fromisoformat(text.replace("Z", "+00:00"))
    return value if value.tzinfo else value.replace(tzinfo=timezone.utc)


def _previous_hashes(paths: list[Path]) -> list[tuple[str, str]]:
    return [(str(p), json.loads(p.read_text())["output"]["sha256_canonical"])
            for p in paths]


def run_checks(raw_input, output, contract, args) -> tuple[list[Check], dict, dict]:
    """All checks in report order, plus the oracle stats and this run's profile."""
    expected, stats = clean_with_stats(raw_input, contract)
    profile = build_profile(output, raw_input,
                            contract["semantic"]["amount_max_plausible"])
    found = [
        checks.check_input_schema(raw_input, contract),
        checks.check_schema(output, raw_input, contract),
        checks.check_row_reconciliation(output, expected, stats, contract),
        checks.check_row_loss(output, raw_input, contract),
        *checks.check_rules(output, contract),
        checks.check_null_inflation(output, expected, contract),
        checks.check_empty_columns(output, contract),
        checks.check_oracle_diff(output, expected, contract),
        checks.check_marker(output, expected, contract),
    ]
    if args.compare_hash:
        found.append(checks.check_determinism(canonical_hash(output, contract),
                                              _previous_hashes(args.compare_hash)))
    if args.baseline_report:
        baseline = json.loads(args.baseline_report.read_text())["profile"]
        found += run_detectors(profile, baseline, contract["semantic"], args.as_of)
    return found, {"stats": stats, "expected": expected}, profile


def build_report(args, fetched_in, fetched_out, raw_input, output, found, oracle,
                 profile, contract) -> dict:
    summary = {s: sum(c.status == s for c in found) for s in ("pass", "fail", "warn")}
    verdict = "fail" if summary["fail"] else ("pass_with_warnings"
                                              if summary["warn"] else "pass")
    return {
        "run": args.run,
        "timestamp": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "input": {"uri": fetched_in.uri, "sha256": sha256_bytes(fetched_in.data),
                  "rows": len(raw_input)},
        "output": {"uri": fetched_out.uri, "object": fetched_out.object,
                   "updated": fetched_out.updated, "rows": len(output),
                   "sha256_canonical": canonical_hash(output, contract)},
        "reference": {"rows": len(oracle["expected"]),
                      "sha256_canonical": canonical_hash(oracle["expected"], contract),
                      "breakdown": oracle["stats"]},
        "profile": profile,
        "checks": [c.to_dict() for c in found],
        "summary": summary,
        "verdict": verdict,
    }


def print_report(report: dict) -> None:
    title = (f"{report['run']}: {report['verdict'].upper()}  "
             f"(pass {report['summary']['pass']}, warn {report['summary']['warn']}, "
             f"fail {report['summary']['fail']})")
    try:
        from rich.console import Console
        from rich.table import Table
    except ImportError:
        print(title)
        for c in report["checks"]:
            print(f"{ANSI[c['status']]}{c['status'].upper():5}\033[0m "
                  f"{c['id']:28} {c['detail']}")
        return
    table = Table(title=title, show_lines=False)
    table.add_column("status")
    table.add_column("check")
    table.add_column("detail", overflow="fold")
    for c in report["checks"]:
        colour = COLOURS[c["status"]]
        table.add_row(f"[{colour}]{c['status'].upper()}[/]", c["id"], c["detail"])
    Console().print(table)


def main(argv: list[str] | None = None) -> int:
    args = parse_args(argv)
    load_env()
    contract = load_contract()
    fetched_in = fetch(args.input)
    fetched_out = fetch(args.output, args.after)
    raw_input = read_csv_bytes(fetched_in.data)
    output = read_csv_bytes(fetched_out.data)

    found, oracle, profile = run_checks(raw_input, output, contract, args)
    report = build_report(args, fetched_in, fetched_out, raw_input, output, found,
                          oracle, profile, contract)

    args.reports_dir.mkdir(parents=True, exist_ok=True)
    path = args.reports_dir / f"{args.run}.json"
    path.write_text(json.dumps(report, indent=2, default=str) + "\n")
    if args.reference_output:
        oracle["expected"].to_csv(args.reference_output, index=False)
    print_report(report)
    print(f"report: {path}  output object: {fetched_out.object}")
    return 1 if report["summary"]["fail"] else 0


if __name__ == "__main__":
    sys.exit(main())

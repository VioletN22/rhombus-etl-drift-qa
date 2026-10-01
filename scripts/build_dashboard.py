"""Build dashboard/data.json from the validator reports, the run ledger and the matrix.

    python scripts/build_dashboard.py           # real: data-validation/reports + runs.csv
    python scripts/build_dashboard.py --demo    # offline practice reports (practice/)

Inputs:
  datasets/manifest.json           the case list
  observations/matrix.yaml         hand-filled observations per case (pending until run)
  observations/runs.csv            ledger appended by scripts/run_scenario.py
  data-validation/reports/*.json   validator reports (or practice/*.json with --demo)

Nothing is invented: a case with no observation stays "pending" and every number
on the dashboard traces back to one of the files above.
"""

from __future__ import annotations

import argparse
import csv
import json
import sys
from datetime import datetime, timezone
from pathlib import Path

import yaml

ROOT = Path(__file__).resolve().parent.parent
MANIFEST = ROOT / "datasets" / "manifest.json"
MATRIX = ROOT / "observations" / "matrix.yaml"
LEDGER = ROOT / "observations" / "runs.csv"
REPORTS = ROOT / "data-validation" / "reports"
PRACTICE = ROOT / "practice"
OUT = ROOT / "dashboard" / "data.json"

ALLOWED = {
    "status": {"pending", "done"},
    "rhombus_status": {"Success", "Failure"},
    "platform_behaviour": {"stopped", "warned", "carried_on"},
    "gcs_output": {"yes", "no"},
    "logs_clear": {"clear", "partial", "misleading"},
    "chatbot_diagnosis": {"correct", "partial", "wrong", "na"},
    "chatbot_fix_worked": {"yes", "no", "na"},
    "severity": {"Critical", "High", "Medium", "Low", "na"},
    "capability": {"handled", "warned", "broke", "missed"},
}
GROUPS = [("baseline", "Baseline"), ("schema", "Schema drift"),
          ("combined", "All schema changes"), ("semantic", "Semantic drift"),
          ("edge", "Edge cases")]


def group_of(case: str) -> str:
    if case == "baseline":
        return "baseline"
    if case == "schema-all-combined":
        return "combined"
    return case.split("-", 1)[0]


def warn(msg: str) -> None:
    print(f"warning: {msg}", file=sys.stderr)


# --- loading ------------------------------------------------------------------

def load_matrix() -> dict:
    data = yaml.safe_load(MATRIX.read_text()) or {}
    for entry in data.get("cases", []):
        for field, allowed in ALLOWED.items():
            value = entry.get(field)
            if value is not None and str(value) not in allowed:
                warn(f"matrix {entry.get('case')}: {field}={value!r} not in {sorted(allowed)}")
    return data


def load_ledger() -> list[dict]:
    if not LEDGER.exists():
        return []
    with LEDGER.open(newline="") as fh:
        return list(csv.DictReader(fh))


def case_for_report(report: dict, cases: list[str]) -> str | None:
    """Run name prefix first (run_scenario names runs <case>-<stamp>), then the marker row."""
    name = report["run"].removeprefix("practice-")
    for case in sorted(cases, key=len, reverse=True):
        if name == case or name.startswith(case + "-"):
            return case
    for check in report["checks"]:
        if check["id"] == "marker_row":
            variant = check.get("evidence", {}).get("variant_expected")
            if variant in cases:
                return variant
    stem = Path(report["input"]["uri"]).stem
    return stem if stem in cases else None


def slim_report(report: dict, case: str | None, path: Path) -> dict:
    checks = {c["id"]: c for c in report["checks"]}
    oracle = checks.get("oracle_diff", {}).get("evidence", {})
    return {
        "run": report["run"],
        "case": case,
        "path": str(path.relative_to(ROOT)),
        "timestamp": report["timestamp"],
        "input_rows": report["input"]["rows"],
        "input_sha256": report["input"]["sha256"],
        "output_object": report["output"]["object"],
        "output_updated": report["output"]["updated"],
        "output_rows": report["output"]["rows"],
        "output_sha256": report["output"]["sha256_canonical"],
        "reference_rows": report["reference"]["rows"],
        "reference_sha256": report["reference"]["sha256_canonical"],
        "matches_oracle": report["output"]["sha256_canonical"]
        == report["reference"]["sha256_canonical"],
        "verdict": report["verdict"],
        "summary": report["summary"],
        "checks": [{"id": c["id"], "status": c["status"], "detail": c["detail"]}
                   for c in report["checks"]],
        "oracle_mismatches": oracle.get("mismatches", {}),
        "oracle_examples": oracle.get("examples", [])[:6],
    }


def load_reports(folder: Path, cases: list[str]) -> list[dict]:
    reports = []
    for path in sorted(folder.glob("*.json")):
        try:
            raw = json.loads(path.read_text())
            if "checks" not in raw or "output" not in raw:
                continue
        except (json.JSONDecodeError, OSError) as exc:
            warn(f"skipping {path.name}: {exc}")
            continue
        case = case_for_report(raw, cases)
        if case is None:
            warn(f"{path.name}: cannot tell which case it belongs to")
        reports.append(slim_report(raw, case, path))
    return sorted(reports, key=lambda r: r["timestamp"])


# --- derived views --------------------------------------------------------------

def runs_from_ledger(ledger: list[dict], reports: dict[str, dict]) -> list[dict]:
    runs = []
    for row in ledger:
        report_path = row.get("report") or ""
        run_name = Path(report_path).stem if report_path else None
        if row.get("gcs_object"):
            outcome = "output"
        elif row.get("validator_verdict") == "no-output":
            outcome = "no-output"
        else:
            outcome = "upload-only"
        report = reports.get(run_name) if run_name else None
        runs.append({
            "run": run_name, "case": row.get("case"), "source": "ledger",
            "uploaded_at": row.get("uploaded_at_utc"), "output_object": row.get("gcs_object"),
            "output_updated": row.get("object_updated_utc"), "outcome": outcome,
            "verdict": report["verdict"] if report else (row.get("validator_verdict") or None),
            "report": report_path or None, "notes": row.get("notes") or "",
        })
    return runs


def runs_from_reports(reports: list[dict], known: set[str], demo: bool) -> list[dict]:
    """Reports with no ledger line (validator run by hand, or practice runs).

    Practice runs never touched Rhombus, so they get outcome "practice" and are
    left out of pipeline health."""
    return [{
        "run": r["run"], "case": r["case"], "source": "report",
        "uploaded_at": None, "output_object": r["output_object"],
        "output_updated": r["output_updated"] or r["timestamp"],
        "outcome": "practice" if demo else "output",
        "verdict": r["verdict"], "report": r["path"], "notes": "",
    } for r in reports if r["run"] not in known]


def capability(entry: dict, latest: dict | None) -> str:
    """handled / warned / broke / missed / unverified / pending, from the matrix + report."""
    if entry.get("status") != "done":
        return "pending"
    if entry.get("capability"):
        return entry["capability"]
    if entry.get("platform_behaviour") == "warned":
        return "warned"
    if entry.get("rhombus_status") == "Failure" or entry.get("platform_behaviour") == "stopped":
        return "broke"
    if latest is None:
        return "unverified"
    return "missed" if latest["verdict"] == "fail" else "handled"


def build_cases(manifest: dict, matrix: dict, runs: list[dict],
                reports: list[dict]) -> list[dict]:
    by_case = {e["case"]: e for e in matrix.get("cases", [])}
    out = []
    for case, meta in manifest["files"].items():
        entry = by_case.get(case, {"case": case, "status": "pending"})
        case_runs = [r for r in runs if r["case"] == case
                     and r["outcome"] in ("output", "no-output")]
        case_reports = [r for r in reports if r["case"] == case]
        latest = case_reports[-1] if case_reports else None
        out.append({
            "case": case, "group": group_of(case), "file": meta["file"],
            "rows": meta["rows"], "change": entry.get("change") or meta["note"],
            "status": entry.get("status", "pending"),
            "observation": entry.get("observation") or f"observations/{case}.md",
            "matrix": {k: entry.get(k) for k in (
                "run_ids", "rhombus_status", "platform_behaviour", "gcs_output",
                "logs_clear", "chatbot_diagnosis", "chatbot_fix_worked", "schedule_after",
                "severity", "execution_seconds", "credits_used")},
            "runs_total": len(case_runs),
            "runs_with_output": sum(r["outcome"] == "output" for r in case_runs),
            "runs_without_output": sum(r["outcome"] == "no-output" for r in case_runs),
            "validator": None if latest is None else {
                "run": latest["run"], "verdict": latest["verdict"],
                "summary": latest["summary"],
                "failed": [c["id"] for c in latest["checks"] if c["status"] == "fail"]},
            "capability": capability(entry, latest),
        })
    return out


def compare_runs(runs: list[dict]) -> dict:
    hashes = {r["output_sha256"] for r in runs}
    check_ids = list(dict.fromkeys(c["id"] for r in runs for c in r["checks"]))
    status = {r["run"]: {c["id"]: c["status"] for c in r["checks"]} for r in runs}
    differing = [cid for cid in check_ids
                 if len({status[r["run"]].get(cid) for r in runs}) > 1]
    cols = list(dict.fromkeys(k for r in runs for k in r["oracle_mismatches"]))
    return {
        "all_match": len(runs) > 1 and len(hashes) == 1,
        "distinct_hashes": len(hashes),
        "differing_checks": differing,
        "mismatch_columns": cols,
    }


def build_consistency(matrix: dict, reports: list[dict], demo: bool) -> list[dict]:
    by_run = {r["run"]: r for r in reports}
    trials = []
    if demo:
        # No real trials offline: group the practice reports by case so the view has data.
        cases = list(dict.fromkeys(r["case"] for r in reports if r["case"]))
        source = [{"id": f"{c}-practice", "case": c, "pipeline": "validator oracle (practice)",
                   "status": "done", "run_ids": [r["run"] for r in reports if r["case"] == c],
                   "notes": "Practice: output is the oracle's own cleaned CSV."} for c in cases]
    else:
        source = matrix.get("consistency_trials", [])
    for t in source:
        found = [by_run[rid] for rid in t.get("run_ids") or [] if rid in by_run]
        missing = [rid for rid in t.get("run_ids") or [] if rid not in by_run]
        runs = [{k: r[k] for k in ("run", "timestamp", "output_rows", "output_sha256",
                                   "verdict", "summary", "checks", "oracle_mismatches",
                                   "matches_oracle")} for r in found]
        trials.append({
            "id": t["id"], "case": t.get("case"), "pipeline": t.get("pipeline", ""),
            "status": t.get("status", "pending") if found else "pending",
            "target_runs": 3, "runs": runs, "missing_reports": missing,
            "notes": t.get("notes", ""),
            "comparison": compare_runs(runs) if runs else None,
        })
    return trials


def build_ai_builder(matrix: dict) -> dict:
    attempts = matrix.get("ai_builder_runs", [])
    done = [a for a in attempts if a.get("status") == "done" and a.get("nodes")]
    longest = max((len(a["nodes"]) for a in done), default=0)
    positions = []
    for i in range(longest):
        names = [a["nodes"][i] if i < len(a["nodes"]) else None for a in done]
        positions.append({"index": i + 1, "same": len(set(names)) == 1})
    return {
        "attempts": [{k: a.get(k) for k in ("attempt", "prompt_file", "status", "date",
                                              "credits_used", "nodes", "follow_up_prompts",
                                              "notes")} for a in attempts],
        "compared": len(done),
        "identical": len(done) > 1 and all(p["same"] for p in positions),
        "positions": positions,
    }


def build_health(cases: list[dict]) -> list[dict]:
    rows = []
    for key, label in GROUPS:
        members = [c for c in cases if c["group"] == key]
        total = sum(c["runs_total"] for c in members)
        ok = sum(c["runs_with_output"] for c in members)
        failed = sum(c["runs_without_output"] for c in members)
        rows.append({
            "group": key, "label": label, "cases": len(members),
            "cases_run": sum(c["runs_total"] > 0 or c["status"] == "done" for c in members),
            "runs": total, "succeeded": ok, "failed": failed,
            "success_rate": round(ok / total, 3) if total else None,
        })
    return rows


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    ap.add_argument("--demo", action="store_true",
                    help="build from practice/ reports (offline, not Rhombus results)")
    ap.add_argument("--out", type=Path, default=OUT)
    args = ap.parse_args(argv)

    manifest = json.loads(MANIFEST.read_text())
    matrix = load_matrix()
    case_ids = list(manifest["files"])
    folder = PRACTICE if args.demo else REPORTS
    reports = load_reports(folder, case_ids) if folder.exists() else []
    by_run = {r["run"]: r for r in reports}

    runs = [] if args.demo else runs_from_ledger(load_ledger(), by_run)
    runs += runs_from_reports(reports, {r["run"] for r in runs if r["run"]}, args.demo)
    runs.sort(key=lambda r: r["uploaded_at"] or r["output_updated"] or "")

    cases = build_cases(manifest, matrix, runs, reports)
    data = {
        "demo": args.demo,
        "built_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "sources": {
            "reports": str(folder.relative_to(ROOT)),
            "ledger": None if args.demo else str(LEDGER.relative_to(ROOT)),
            "matrix": str(MATRIX.relative_to(ROOT)),
            "report_count": len(reports), "ledger_rows": 0 if args.demo else len(load_ledger()),
        },
        "health": build_health(cases),
        "cases": cases,
        "consistency": build_consistency(matrix, reports, args.demo),
        "ai_builder": build_ai_builder(matrix),
        "runs": runs,
        "reports": reports,
    }
    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(json.dumps(data, indent=1) + "\n")
    done = sum(c["status"] == "done" for c in cases)
    print(f"wrote {args.out.relative_to(ROOT)}: {'DEMO, ' if args.demo else ''}"
          f"{len(reports)} report(s), {len(runs)} run(s), {done}/{len(cases)} cases observed")
    return 0


if __name__ == "__main__":
    sys.exit(main())

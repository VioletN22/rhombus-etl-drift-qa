"""Build dashboard/data.json from the validator reports, the run ledger and the matrix.

    python scripts/build_dashboard.py           # real: data-validation/reports + runs.csv
    python scripts/build_dashboard.py --demo    # offline practice reports (practice/)

Inputs:
  datasets/manifest.json           the case list
  observations/matrix.yaml         hand-filled observations per case (pending until run)
  observations/runs.csv            ledger appended by scripts/run_scenario.py
  data-validation/reports/*.json   validator reports (or practice/*.json with --demo)
  observations/<case>.md           per-case write-ups, copied into data.json for case.html
  observations/evidence/*          screenshots and logs, copied to dashboard/evidence/

Nothing is invented: a case with no observation stays "pending" and every number
on the dashboard traces back to one of the files above.
"""

from __future__ import annotations

import argparse
import csv
import json
import re
import shutil
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
EVIDENCE = ROOT / "observations" / "evidence"
EVIDENCE_OUT = ROOT / "dashboard" / "evidence"
EVIDENCE_TYPES = {".png", ".jpg", ".jpeg", ".gif", ".webp", ".txt", ".json", ".py", ".md"}
SECRET_PATTERNS = re.compile(r"private_key|BEGIN [A-Z ]*PRIVATE KEY|aws_secret_access_key|"
                             r"\"type\":\s*\"service_account\"", re.I)
GROUP_PREFIXES = ("schema-", "semantic-", "edge-")

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


# --- case pages -----------------------------------------------------------------

def is_publishable(path: Path) -> bool:
    """Only plain evidence types, never anything that could hold a credential."""
    if path.suffix.lower() not in EVIDENCE_TYPES or path.name.startswith("."):
        return False
    if "key" in path.name.lower() and path.suffix.lower() not in {".png", ".jpg", ".jpeg"}:
        return False
    if path.suffix.lower() in {".json", ".txt", ".py", ".md"}:
        if SECRET_PATTERNS.search(path.read_text(errors="replace")):
            warn(f"evidence {path.name}: looks like it holds a credential, not published")
            return False
    return True


def publish_evidence() -> list[str]:
    """Copy observations/evidence into dashboard/evidence (a clean copy each build)."""
    if EVIDENCE_OUT.exists():
        shutil.rmtree(EVIDENCE_OUT)
    if not EVIDENCE.exists():
        return []
    EVIDENCE_OUT.mkdir(parents=True)
    names = []
    for path in sorted(EVIDENCE.iterdir()):
        if path.is_file() and is_publishable(path):
            shutil.copy2(path, EVIDENCE_OUT / path.name)
            names.append(path.name)
    return names


def evidence_keywords(case: str, entry: dict) -> list[str]:
    if entry.get("evidence_keywords"):
        return [str(k).lower() for k in entry["evidence_keywords"]]
    rest = case
    for prefix in GROUP_PREFIXES:
        rest = rest.removeprefix(prefix)
    words = [rest]
    first = rest.split("-", 1)[0]
    if first != rest and len(first) >= 4:
        words.append(first)
    return words


def evidence_for(case: str, entry: dict, published: list[str]) -> list[dict]:
    pats = [re.compile(rf"(?<![a-z0-9]){re.escape(k)}(?![a-z0-9])")
            for k in evidence_keywords(case, entry)]
    out = []
    for name in published:
        if any(p.search(name.lower()) for p in pats):
            ext = Path(name).suffix.lower().lstrip(".")
            kind = "image" if ext in {"png", "jpg", "jpeg", "gif", "webp"} else "text"
            out.append({"name": name, "path": f"evidence/{name}", "kind": kind, "ext": ext})
    return out


def read_md(rel: str | None) -> str | None:
    if not rel:
        return None
    path = ROOT / rel
    return path.read_text() if path.exists() else None


def as_list(value) -> list:
    if value is None or value == "":
        return []
    return value if isinstance(value, list) else [value]


def build_cases(manifest: dict, matrix: dict, runs: list[dict],
                reports: list[dict], published: list[str] | None = None) -> list[dict]:
    by_case = {e["case"]: e for e in matrix.get("cases", [])}
    out = []
    for case, meta in manifest["files"].items():
        entry = by_case.get(case, {"case": case, "status": "pending"})
        case_runs = [r for r in runs if r["case"] == case
                     and r["outcome"] in ("output", "no-output")]
        case_reports = [r for r in reports if r["case"] == case]
        latest = case_reports[-1] if case_reports else None
        observation = entry.get("observation") or f"observations/{case}.md"
        wanted = [str(r) for r in as_list(entry.get("run_ids"))]
        by_run = {r["run"]: r for r in reports}
        page_reports = [by_run[r] for r in wanted if r in by_run]
        page_reports += [r for r in case_reports if r["run"] not in wanted]
        out.append({
            "case": case, "group": group_of(case), "file": meta["file"],
            "rows": meta["rows"], "change": entry.get("change") or meta["note"],
            "status": entry.get("status", "pending"),
            "headline": entry.get("headline") or "",
            "observation": observation,
            "observation_md": read_md(observation),
            "extra_md": [{"path": rel, "md": read_md(rel)} for rel in as_list(entry.get("extra_md"))
                         if read_md(rel)],
            "evidence": evidence_for(case, entry, published or []),
            "video": ({"src": f"videos/{case}.mp4",
                       "captions": f"videos/{case}.vtt" if (ROOT / "dashboard" / "videos" / f"{case}.vtt").exists() else None}
                      if (ROOT / "dashboard" / "videos" / f"{case}.mp4").exists() else None),
            "page_reports": [{
                "run": r["run"], "path": r["path"], "timestamp": r["timestamp"],
                "verdict": r["verdict"], "summary": r["summary"], "checks": r["checks"],
                "output_rows": r["output_rows"], "input_rows": r["input_rows"],
                "listed": r["run"] in wanted,
            } for r in page_reports],
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


def build_summary(matrix: dict, cases: list[dict], consistency: list[dict],
                  ai_builder: dict) -> dict:
    s = matrix.get("summary") or {}
    by_case = {c["case"]: c for c in cases}
    required = [r for r in as_list(s.get("required")) if r in by_case]
    if not required:
        required = [c["case"] for c in cases if c["case"] != "baseline"]
    unknown = [r for r in as_list(s.get("required")) if r not in by_case]
    if unknown:
        warn(f"summary.required: unknown case(s) {unknown}")
    det = next((t for t in consistency if t["runs"]), None)
    determinism = None
    if det:
        hashes = {r["output_sha256"] for r in det["runs"]}
        same = max(sum(r["output_sha256"] == h for r in det["runs"]) for h in hashes)
        determinism = {"identical": same, "runs": len(det["runs"]), "target": det["target_runs"],
                       "case": det["case"]}
    credits = s.get("credits_used")
    if credits is None:
        credits = sum(c["matrix"]["credits_used"] or 0 for c in cases) + sum(
            a.get("credits_used") or 0 for a in ai_builder["attempts"])
    learnings = []
    for item in as_list(s.get("learnings")):
        cs = [c for c in as_list(item.get("cases")) if c in by_case]
        if len(cs) != len(as_list(item.get("cases"))):
            warn(f"learning {item.get('title')!r}: unknown case in {item.get('cases')}")
        learnings.append({"title": item.get("title", ""), "line": item.get("line", ""),
                          "detail": item.get("detail", ""), "severity": item.get("severity"),
                          "cases": cs})
    return {
        "verdict": s.get("verdict") or "",
        "required": required,
        "required_done": sum(by_case[r]["status"] == "done" for r in required),
        "critical": sum(c["status"] == "done" and c["matrix"]["severity"] == "Critical"
                        for c in cases),
        "determinism": determinism,
        "credits_used": credits,
        "credits_note": s.get("credits_note") or "",
        "learnings": learnings,
    }



SUITES_DOC = ROOT / "docs" / "suites.yaml"
PW_JSON = ROOT / "reports" / "playwright.json"
PYTEST_XML = ROOT / "reports" / "pytest.xml"
SUITE_EVIDENCE = ROOT / "reports" / "evidence"
ANSI = re.compile(r"\x1b\[[0-9;]*m")


def _slug(text: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", text.lower()).strip("-")[:60]


def playwright_tests() -> dict[str, list[dict]]:
    """Latest Playwright results per project. Videos and screenshots are copied into
    reports/evidence so they survive test-results/ being cleared between runs."""
    if not PW_JSON.exists():
        return {}
    report = json.loads(PW_JSON.read_text())
    SUITE_EVIDENCE.mkdir(parents=True, exist_ok=True)
    out: dict[str, list[dict]] = {}

    def walk(suite: dict, file: str) -> None:
        file = suite.get("file") or file
        for spec in suite.get("specs", []):
            for t in spec["tests"]:
                r = t["results"][-1]
                status = {"expected": "pass", "unexpected": "fail", "skipped": "skip", "flaky": "pass"}[t["status"]]
                if status == "pass" and t["expectedStatus"] == "failed":
                    status = "expected-fail"
                item = {"title": spec["title"], "file": file, "status": status,
                        "duration_ms": r["duration"], "video": None, "screenshot": None, "error": None}
                if r.get("errors"):
                    item["error"] = ANSI.sub("", r["errors"][0].get("message", "")).strip().splitlines()[0][:240]
                base = f"{t['projectName']}-{_slug(spec['title'])}"
                for a in r.get("attachments", []):
                    kind = {"video": "video", "screenshot": "screenshot"}.get(a["name"])
                    if not kind or not a.get("path"):
                        continue
                    target = SUITE_EVIDENCE / f"{base}{Path(a['path']).suffix}"
                    if Path(a["path"]).exists():
                        shutil.copy2(a["path"], target)
                    if target.exists():
                        item[kind] = f"evidence/suites/{target.name}"
                out.setdefault(t["projectName"], []).append(item)
        for child in suite.get("suites", []):
            walk(child, file)

    for suite in report["suites"]:
        walk(suite, suite.get("file", ""))
    out["_meta"] = [{"run_at": report["stats"]["startTime"], "duration_ms": report["stats"]["duration"]}]
    return out


def pytest_tests() -> list[dict]:
    if not PYTEST_XML.exists():
        return []
    import xml.etree.ElementTree as ET
    tests = []
    for case in ET.parse(PYTEST_XML).iter("testcase"):
        failed = case.find("failure") is not None or case.find("error") is not None
        skipped = case.find("skipped") is not None
        tests.append({"title": case.get("name"), "file": case.get("classname", "").replace(".", "/") + ".py",
                      "status": "fail" if failed else "skip" if skipped else "pass",
                      "duration_ms": round(float(case.get("time", 0)) * 1000)})
    return tests


def build_suites() -> list[dict]:
    if not SUITES_DOC.exists():
        return []
    pw = playwright_tests()
    meta = (pw.get("_meta") or [{}])[0]
    out = []
    for doc in yaml.safe_load(SUITES_DOC.read_text()):
        explain = doc.get("tests") or {}
        if doc["id"] == "data":
            tests, run_at = pytest_tests(), (datetime.fromtimestamp(PYTEST_XML.stat().st_mtime, timezone.utc).isoformat(timespec="seconds") if PYTEST_XML.exists() else None)
        else:
            tests, run_at = pw.get(doc["id"], []), meta.get("run_at")
        for t in tests:
            t["explain"] = explain.get(t["title"], "")
        counts = {k: sum(t["status"] == k for t in tests) for k in ("pass", "expected-fail", "fail", "skip")}
        out.append({**{k: v for k, v in doc.items() if k != "tests"}, "tests": tests, "counts": counts,
                    "total": len(tests), "run_at": run_at,
                    "ok": bool(tests) and counts["fail"] == 0})
    if SUITE_EVIDENCE.exists():
        dest = ROOT / "dashboard" / "evidence" / "suites"
        dest.mkdir(parents=True, exist_ok=True)
        for f in SUITE_EVIDENCE.iterdir():
            shutil.copy2(f, dest / f.name)
    return out


def bust_cache(out_dir: Path, stamp: str) -> None:
    """Version the JS/CSS links so browsers never mix a new page with a cached script."""
    import re as _re
    for page in ("index.html", "case.html", "suite.html"):
        f = out_dir / page
        if f.exists():
            html = f.read_text()
            html = _re.sub(r'(app\.js|data\.js|styles\.css)(?![\w.])(\?v=[0-9]+)?', lambda m: f"{m.group(1)}?v={stamp}", html)
            f.write_text(html)


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

    published = publish_evidence()
    cases = build_cases(manifest, matrix, runs, reports, published)
    consistency = build_consistency(matrix, reports, args.demo)
    ai_builder = build_ai_builder(matrix)
    summary = build_summary(matrix, cases, consistency, ai_builder)
    data = {
        "demo": args.demo,
        "verdict": summary.pop("verdict"),
        "learnings": summary.pop("learnings"),
        "summary": summary,
        "suites": build_suites(),
        "evidence_files": published,
        "built_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "sources": {
            "reports": str(folder.relative_to(ROOT)),
            "ledger": None if args.demo else str(LEDGER.relative_to(ROOT)),
            "matrix": str(MATRIX.relative_to(ROOT)),
            "report_count": len(reports), "ledger_rows": 0 if args.demo else len(load_ledger()),
        },
        "health": build_health(cases),
        "cases": cases,
        "consistency": consistency,
        "ai_builder": ai_builder,
        "runs": runs,
        "reports": reports,
    }
    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(json.dumps(data, indent=1) + "\n")
    # Same data as a script, so pages render on first paint instead of after a fetch.
    (args.out.parent / "data.js").write_text("window.DASH_DATA = " + json.dumps(data) + ";\n")
    import time as _t
    bust_cache(args.out.parent, str(int(_t.time())))
    done = sum(c["status"] == "done" for c in cases)
    print(f"wrote {args.out.relative_to(ROOT)}: {'DEMO, ' if args.demo else ''}"
          f"{len(reports)} report(s), {len(runs)} run(s), {done}/{len(cases)} cases observed, "
          f"{len(published)} evidence file(s) published")
    return 0


if __name__ == "__main__":
    sys.exit(main())

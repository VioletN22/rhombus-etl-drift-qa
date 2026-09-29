"""Run one drift scenario end to end against the real scheduled pipeline.

    python scripts/run_scenario.py schema-rename-column
    python scripts/run_scenario.py baseline --no-wait      # upload only
    python scripts/run_scenario.py --restore               # put baseline back

Steps:
  1. upload datasets/<case>.csv to s3://$S3_BUCKET/$S3_KEY (same key every time,
     so the pipeline and schedule never change: only the data does)
  2. wait for the next scheduled run to write a NEW object to gs://$GCS_BUCKET/$GCS_PREFIX
     (polls GCS; no fixed sleeps beyond the poll interval)
  3. run the validator on input vs that object
  4. append a line to observations/runs.csv (the experiment ledger)

If the run fails in Rhombus there is no new object: the script times out, records
"no-output" in the ledger, and tells you to capture the run history + logs.
"""

from __future__ import annotations

import argparse
import csv
import datetime as dt
import os
import subprocess
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
LEDGER = ROOT / "observations" / "runs.csv"
LEDGER_FIELDS = ["uploaded_at_utc", "case", "s3_uri", "gcs_object", "object_updated_utc",
                 "validator_verdict", "report", "notes"]


def _env(name: str) -> str:
    value = os.environ.get(name)
    if not value:
        sys.exit(f"missing env var {name} (see .env.example)")
    return value


def _load_dotenv() -> None:
    try:
        from dotenv import load_dotenv
    except ImportError:
        return
    load_dotenv(ROOT / ".env")


def upload(case: str) -> tuple[str, dt.datetime]:
    import boto3

    src = ROOT / "datasets" / f"{case}.csv"
    if not src.exists():
        sys.exit(f"no dataset {src}; run scripts/make_datasets.py")
    bucket, key = _env("S3_BUCKET"), os.environ.get("S3_KEY", "input/orders.csv")
    started = dt.datetime.now(dt.timezone.utc)
    boto3.client("s3", region_name=os.environ.get("AWS_REGION")).upload_file(
        str(src), bucket, key, ExtraArgs={"ContentType": "text/csv"})
    uri = f"s3://{bucket}/{key}"
    print(f"uploaded {src.name} -> {uri} at {started.isoformat()}")
    return uri, started


def wait_for_output(after: dt.datetime, timeout_min: float, poll_s: float):
    from google.cloud import storage

    bucket = storage.Client().bucket(_env("GCS_BUCKET"))
    prefix = os.environ.get("GCS_PREFIX", "")
    deadline = time.monotonic() + timeout_min * 60
    print(f"waiting up to {timeout_min:g} min for a new object in gs://{bucket.name}/{prefix}")
    while time.monotonic() < deadline:
        fresh = [b for b in bucket.list_blobs(prefix=prefix) if b.updated and b.updated > after]
        if fresh:
            newest = max(fresh, key=lambda b: b.updated)
            print(f"new output: {newest.name} ({newest.updated.isoformat()})")
            return newest
        time.sleep(poll_s)
    return None


def append_ledger(row: dict[str, str]) -> None:
    new = not LEDGER.exists()
    with LEDGER.open("a", newline="") as fh:
        writer = csv.DictWriter(fh, fieldnames=LEDGER_FIELDS)
        if new:
            writer.writeheader()
        writer.writerow(row)


def main() -> None:
    _load_dotenv()
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("case", nargs="?", help="dataset name, e.g. schema-drop-column")
    ap.add_argument("--restore", action="store_true", help="upload the baseline and stop")
    ap.add_argument("--no-wait", action="store_true", help="upload only")
    ap.add_argument("--timeout-min", type=float, default=75)
    ap.add_argument("--poll-s", type=float, default=30)
    ap.add_argument("--notes", default="")
    args = ap.parse_args()

    case = "baseline" if args.restore else args.case
    if not case:
        ap.error("give a case name or --restore")

    s3_uri, started = upload(case)
    if args.restore or args.no_wait:
        append_ledger({"uploaded_at_utc": started.isoformat(), "case": case, "s3_uri": s3_uri,
                       "notes": "upload only" + (f"; {args.notes}" if args.notes else "")})
        return

    blob = wait_for_output(started, args.timeout_min, args.poll_s)
    if blob is None:
        append_ledger({"uploaded_at_utc": started.isoformat(), "case": case, "s3_uri": s3_uri,
                       "validator_verdict": "no-output", "notes": args.notes})
        sys.exit("no new output object: the run failed or has not happened. "
                 "Capture Rhombus run history, the error text and the failure email now.")

    stamp = started.strftime("%Y%m%dT%H%M%SZ")
    run_name = f"{case}-{stamp}"
    cmd = [sys.executable, str(ROOT / "data-validation" / "validate.py"),
           "--run", run_name, "--input", s3_uri,
           "--output", f"gs://{blob.bucket.name}/{blob.name}"]
    baseline_report = ROOT / "data-validation" / "reports" / "baseline.json"
    if case != "baseline" and baseline_report.exists():
        cmd += ["--baseline-report", str(baseline_report)]
    code = subprocess.call(cmd)

    append_ledger({
        "uploaded_at_utc": started.isoformat(), "case": case, "s3_uri": s3_uri,
        "gcs_object": blob.name, "object_updated_utc": blob.updated.isoformat(),
        "validator_verdict": "pass" if code == 0 else "fail",
        "report": f"data-validation/reports/{run_name}.json", "notes": args.notes,
    })
    print(f"\nnext: write observations/{case}.md, then `python scripts/run_scenario.py --restore`")


if __name__ == "__main__":
    main()

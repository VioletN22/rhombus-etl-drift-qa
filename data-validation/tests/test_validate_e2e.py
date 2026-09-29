"""validate.py end to end, with local files standing in for S3 and GCS."""

from __future__ import annotations

import json
import os
import subprocess
import sys
from pathlib import Path

import pytest

import validate
from conftest import DATASETS, HERE
from naive_clean import naive_clean
from reference_clean import clean
from storage import fetch_local

BASELINE = str(DATASETS / "baseline.csv")


def run(tmp_path, name, input_csv, output, *extra) -> tuple[int, dict]:
    code = validate.main(["--run", name, "--input", str(input_csv),
                          "--output", str(output), "--reports-dir",
                          str(tmp_path / "reports"), "--as-of", "2026-09-29", *extra])
    report = json.loads((tmp_path / "reports" / f"{name}.json").read_text())
    return code, report


def by_id(report: dict) -> dict[str, dict]:
    return {c["id"]: c for c in report["checks"]}


def write(tmp_path, name, df) -> Path:
    path = tmp_path / f"{name}.csv"
    df.to_csv(path, index=False)
    return path


@pytest.fixture
def baseline_report(tmp_path, dataset):
    out = write(tmp_path, "baseline-out", clean(dataset("baseline")))
    code, report = run(tmp_path, "baseline", BASELINE, out)
    return code, report, tmp_path / "reports" / "baseline.json", out


# --- baseline -----------------------------------------------------------------

def test_oracle_output_passes_every_check(baseline_report):
    code, report, _, _ = baseline_report
    assert code == 0
    assert report["summary"]["fail"] == 0
    assert report["verdict"] == "pass_with_warnings"
    # The only warnings are the contract's warnings_only items.
    warns = {c["id"] for c in report["checks"] if c["status"] == "warn"}
    assert warns == {"rule_amount_non_negative", "rule_status_allowed", "rule_quantity"}
    assert report["output"]["sha256_canonical"] == report["reference"]["sha256_canonical"]
    assert report["input"]["rows"] == 425 and report["output"]["rows"] == 390
    assert by_id(report)["marker_row"]["evidence"]["variant_read"] == "baseline"


def test_report_shape(baseline_report):
    report = baseline_report[1]
    assert {"run", "timestamp", "input", "output", "checks", "summary",
            "verdict"} <= set(report)
    assert set(report["input"]) >= {"uri", "sha256", "rows"}
    assert set(report["output"]) >= {"uri", "object", "rows", "sha256_canonical"}
    for check in report["checks"]:
        assert set(check) == {"id", "status", "detail", "evidence"}
        assert check["status"] in {"pass", "fail", "warn"}


# --- schema drift, naive pipeline ---------------------------------------------

def test_naive_pipeline_on_baseline_only_loses_the_word_quantities(tmp_path, dataset):
    """Control for the type-change case: casting quantity blanks 'three' only."""
    out = write(tmp_path, "naive-baseline", naive_clean(dataset("baseline")))
    _, report = run(tmp_path, "naive-baseline", BASELINE, out)
    checks = by_id(report)
    assert checks["schema"]["status"] == "pass"
    assert checks["row_reconciliation"]["status"] == "pass"
    inflated = {c: v["inflated"] for c, v in
                checks["null_inflation"]["evidence"]["columns"].items() if v["inflated"]}
    assert set(inflated) == {"quantity"} and inflated["quantity"] < 10


def _schema(c):
    return c["schema"]


SCHEMA_CASES = {
    "schema-drop-column": lambda c: (
        _schema(c)["status"] == "fail"
        and _schema(c)["evidence"]["missing"] == ["country"]
        and _schema(c)["evidence"]["extra"] == []),
    "schema-rename-column": lambda c: (
        _schema(c)["status"] == "fail"
        and [(r["expected"], r["found"]) for r in _schema(c)["evidence"]["likely_renamed"]]
        == [("amount_usd", "total_amount")]
        and _schema(c)["evidence"]["likely_renamed"][0]["value_match_share"] >= 0.9),
    "schema-add-column": lambda c: (
        _schema(c)["status"] == "fail"
        and _schema(c)["evidence"]["extra"] == ["discount_code"]
        and _schema(c)["evidence"]["missing"] == []),
    "schema-type-change": lambda c: (
        _schema(c)["status"] == "pass"
        and c["null_inflation"]["status"] == "fail"
        and c["null_inflation"]["evidence"]["columns"]["quantity"]["inflated"] > 300),
    "schema-all-combined": lambda c: (
        _schema(c)["status"] == "fail"
        and set(_schema(c)["evidence"]["missing"]) == {"amount_usd", "country"}
        and set(_schema(c)["evidence"]["extra"]) == {"total_amount", "discount_code"}
        and any(r["found"] == "total_amount"
                for r in _schema(c)["evidence"]["likely_renamed"])),
}


@pytest.mark.parametrize("variant", sorted(SCHEMA_CASES))
def test_schema_drift_fails_in_the_expected_check(tmp_path, dataset, variant):
    out = write(tmp_path, variant, naive_clean(dataset(variant)))
    code, report = run(tmp_path, variant, DATASETS / f"{variant}.csv", out)
    checks = by_id(report)
    assert code == 1
    assert SCHEMA_CASES[variant](checks), json.dumps(
        {k: checks[k] for k in ("schema", "null_inflation")}, indent=1)
    assert checks["input_schema"]["status"] == (
        "pass" if variant == "schema-type-change" else "warn")


def test_rename_to_a_similar_name_is_caught_by_name(tmp_path, dataset):
    """Data Input turns 'amount.usd' into 'amount usd': fuzzy name match."""
    raw = dataset("edge-dotted-header").rename(columns={"amount.usd": "amount usd"})
    out = write(tmp_path, "dotted", naive_clean(raw))
    _, report = run(tmp_path, "dotted", DATASETS / "edge-dotted-header.csv", out)
    renamed = by_id(report)["schema"]["evidence"]["likely_renamed"]
    assert renamed[0]["found"] == "amount usd" and renamed[0]["name_ratio"] > 0.9


# --- which file, which object -------------------------------------------------

def test_marker_detects_output_built_from_the_wrong_input(tmp_path, dataset):
    stale = write(tmp_path, "stale", clean(dataset("schema-add-column")))
    code, report = run(tmp_path, "stale", BASELINE, stale)
    marker = by_id(report)["marker_row"]
    assert code == 1 and marker["status"] == "fail"
    assert marker["evidence"]["variant_read"] == "schema-add-column"
    assert marker["evidence"]["variant_expected"] == "baseline"


def test_prefix_picks_newest_object_and_respects_after(tmp_path, dataset):
    bucket = tmp_path / "bucket"
    bucket.mkdir()
    old = write(bucket, "run-old", clean(dataset("schema-add-column")))
    new = write(bucket, "run-new", clean(dataset("baseline")))
    os.utime(old, (1_790_000_000, 1_790_000_000))
    os.utime(new, (1_790_000_600, 1_790_000_600))
    code, report = run(tmp_path, "prefix", BASELINE, bucket)
    assert code == 0 and report["output"]["object"] == str(new)
    with pytest.raises(FileNotFoundError):
        from datetime import datetime, timezone
        fetch_local(str(bucket), datetime.fromtimestamp(1_790_001_000, timezone.utc))


# --- determinism --------------------------------------------------------------

def test_hash_ignores_row_order_and_number_formatting(tmp_path, dataset,
                                                      baseline_report):
    _, _, base_json, _ = baseline_report
    shuffled = clean(dataset("baseline")).sample(frac=1, random_state=1)
    shuffled["amount_usd"] = shuffled["amount_usd"].map(lambda v: f"{v:.3f}")
    out = write(tmp_path, "shuffled", shuffled)
    code, report = run(tmp_path, "rerun", BASELINE, out, "--compare-hash", str(base_json))
    assert code == 0 and by_id(report)["determinism"]["status"] == "pass"


def test_hash_catches_a_single_changed_cell(tmp_path, dataset, baseline_report):
    _, _, base_json, _ = baseline_report
    changed = clean(dataset("baseline"))
    changed.loc[10, "amount_usd"] += 0.01
    out = write(tmp_path, "changed", changed)
    code, report = run(tmp_path, "rerun", BASELINE, out, "--compare-hash", str(base_json))
    checks = by_id(report)
    assert code == 1 and checks["determinism"]["status"] == "fail"
    assert checks["oracle_diff"]["evidence"]["mismatches"]["amount_usd"] == 1


# --- oracle diff and null inflation on a hand-broken output -------------------

def test_oracle_diff_and_null_inflation_pinpoint_cells(tmp_path, dataset):
    broken = clean(dataset("baseline"))
    broken.loc[0:2, "email"] = ""                     # silent blanking
    broken.loc[3, "country"] = "Australia"            # rule not applied
    out = write(tmp_path, "broken", broken)
    _, report = run(tmp_path, "broken", BASELINE, out)
    checks = by_id(report)
    assert checks["null_inflation"]["evidence"]["columns"]["email"]["inflated"] == 3
    assert checks["oracle_diff"]["evidence"]["mismatches"] == {
        **{c: 0 for c in checks["oracle_diff"]["evidence"]["mismatches"]},
        "email": 3, "country": 1}
    assert checks["rule_country"]["status"] == "fail"
    assert checks["row_reconciliation"]["status"] == "pass"


def test_row_reconciliation_names_the_missing_ids(tmp_path, dataset):
    short = clean(dataset("baseline")).iloc[5:]
    out = write(tmp_path, "short", short)
    _, report = run(tmp_path, "short", BASELINE, out)
    rec = by_id(report)["row_reconciliation"]
    assert rec["status"] == "fail" and rec["evidence"]["missing_count"] == 5
    assert rec["evidence"]["missing_ids"] == sorted(
        clean(dataset("baseline"))["order_id"].iloc[:5].tolist(), key=str)


# --- semantic drift through the CLI -------------------------------------------

def test_cli_cents_output_passes_rules_but_fires_scale_detector(tmp_path, dataset,
                                                                baseline_report):
    """A perfectly cleaned cents file satisfies every rule: only the detector
    comparing against the baseline run can tell."""
    _, _, base_json, _ = baseline_report
    variant = "semantic-dollars-to-cents"
    out = write(tmp_path, variant, clean(dataset(variant)))
    ref = tmp_path / "reference.csv"
    proc = subprocess.run(
        [sys.executable, str(HERE.parent / "validate.py"), "--run", variant,
         "--input", str(DATASETS / f"{variant}.csv"), "--output", str(out),
         "--baseline-report", str(base_json), "--reports-dir", str(tmp_path / "reports"),
         "--reference-output", str(ref), "--as-of", "2026-09-29"],
        capture_output=True, text=True)
    assert proc.returncode == 1, proc.stderr
    report = json.loads((tmp_path / "reports" / f"{variant}.json").read_text())
    checks = by_id(report)
    assert checks["oracle_diff"]["status"] == "pass"
    assert checks["drift_amount_scale"]["status"] == "fail"
    fails = {c["id"] for c in report["checks"] if c["status"] == "fail"}
    assert fails == {"drift_amount_scale"}
    assert ref.read_text() == out.read_text()
    assert "drift_amount_scale" in proc.stdout

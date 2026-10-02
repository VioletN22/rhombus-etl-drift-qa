"""The oracle, one rule at a time, on hand-made frames."""

from __future__ import annotations

import pandas as pd
import pytest

from common import canonical_hash, read_csv_bytes
from conftest import DATASETS, frame
from reference_clean import (clean, clean_country, clean_date, clean_email,
                             clean_name, clean_with_stats, parse_amount)


# --- row rules ----------------------------------------------------------------

def test_exact_duplicates_then_first_per_order_id_wins():
    raw = frame([
        {"order_id": "1", "amount_usd": "10"},
        {"order_id": "1", "amount_usd": "10"},          # exact duplicate
        {"order_id": "1", "amount_usd": "999.99", "status": "Cancelled"},  # clash
        {"order_id": "2", "amount_usd": "20"},
    ])
    out, stats = clean_with_stats(raw)
    assert out["order_id"].tolist() == ["1", "2"]
    assert out.loc[0, "amount_usd"] == 10.0 and out.loc[0, "status"] == "pending"
    assert stats["exact_duplicates"] == 1 and stats["duplicate_ids"] == 1


def test_order_id_whitespace_does_not_create_a_second_order():
    out = clean(frame([{"order_id": "7"}, {"order_id": " 7 ", "amount_usd": "99"}]))
    assert out["order_id"].tolist() == ["7"]
    assert out.loc[0, "amount_usd"] == 10.0


def test_rows_missing_key_or_amount_are_dropped():
    raw = frame([
        {"order_id": "", "amount_usd": "5"},
        {"order_id": "2", "amount_usd": ""},
        {"order_id": "3", "amount_usd": "abc"},     # non-numeric counts as missing
        {"order_id": "4", "amount_usd": "4"},
    ])
    out, stats = clean_with_stats(raw)
    assert out["order_id"].tolist() == ["4"]
    assert stats["missing_key_or_amount"] == 3


def test_first_row_per_id_is_chosen_before_missing_amounts_are_dropped():
    """Prompt order: dedupe on order_id (rule 1) before dropping (rule 2)."""
    out = clean(frame([{"order_id": "5", "amount_usd": ""},
                       {"order_id": "5", "amount_usd": "12"}]))
    assert out.empty


def test_reconciliation_identity_holds_on_the_real_baseline(dataset):
    out, s = clean_with_stats(dataset("baseline"))
    removed = s["exact_duplicates"] + s["duplicate_ids"] + s["missing_key_or_amount"]
    assert s["input_rows"] - removed == s["output_rows"] == len(out)
    assert out["order_id"].is_unique
    assert s["exact_duplicates"] == 20 and s["duplicate_ids"] >= 4


# --- column rules -------------------------------------------------------------

@pytest.mark.parametrize("raw,want", [
    ("  mIa jOnEs ", "Mia Jones"), ("WILLIAM WILLIAMS", "William Williams"),
    ("josé smith", "José Smith"), ("", ""),
])
def test_name_trimmed_title_case(raw, want):
    assert clean_name(raw) == want


@pytest.mark.parametrize("raw,want", [
    (" GRACE.LEE76@EXAMPLE.COM ", "grace.lee76@example.com"),
    ("bob@", ""), ("n/a", ""), ("not-an-email", ""), ("@example.com", ""),
    ("a b@c.com", ""), ("", ""),
])
def test_email_lowercase_valid_or_blank(raw, want):
    assert clean_email(raw) == want


@pytest.mark.parametrize("raw,want", [
    ("04/20/2026", "2026-04-20"), ("2026-03-05", "2026-03-05"),
    ("Aug 14 2026", "2026-08-14"), ("Aug 4 2026", "2026-08-04"),
    ("02/30/2026", ""),               # impossible date -> blank
    ("20/04/2026", ""),               # DD/MM is not accepted
    ("yesterday", ""), ("", ""),
])
def test_dates_to_iso_or_blank(raw, want):
    assert clean_date(raw) == want


@pytest.mark.parametrize("raw,want", [
    ("$1,234.50", 1234.5), ("81.99", 81.99), ("-12.30", -12.3), (" $5 ", 5.0),
    ("", None), ("three", None),
])
def test_amount_strip_and_parse(raw, want):
    assert parse_amount(raw) == want


@pytest.mark.parametrize("raw,want", [
    ("Australia", "AU"), ("aus", "AU"), (" au ", "AU"), ("New Zealand", "NZ"),
    ("nz", "NZ"), ("usa", "US"), ("United States", "US"), ("uk", "GB"),
    ("United Kingdom", "GB"), ("GB", "GB"),
    ("Austria", "AUSTRIA"), ("AT", "AT"),   # unknown: kept, upper-cased
    ("", ""),
])
def test_country_iso2_unknown_kept(raw, want):
    assert clean_country(raw) == want


def test_status_lowercased_typo_kept_quantity_untouched():
    out = clean(frame([
        {"order_id": "1", "status": " SHIPPED ", "quantity": "three"},
        {"order_id": "2", "status": "shipd", "quantity": ""},
    ]))
    assert out["status"].tolist() == ["shipped", "shipd"]
    assert out["quantity"].tolist() == ["three", ""]


# --- shape --------------------------------------------------------------------

def test_output_has_contract_columns_in_order(contract):
    raw = frame([{"order_id": "1"}])[["status", "order_id", "amount_usd"]]
    raw["discount_code"] = "VIP"
    out = clean(raw)
    assert list(out.columns) == list(contract["columns"])
    assert out.loc[0, "country"] == "" and out.loc[0, "customer_name"] == ""


def test_missing_amount_column_means_no_rows_survive():
    """Strict reading of the contract: a renamed amount_usd is a missing one."""
    raw = frame([{"order_id": "1"}]).rename(columns={"amount_usd": "total_amount"})
    assert clean(raw).empty


def test_empty_input_gives_empty_output(dataset):
    out = clean(dataset("edge-header-only"))
    assert out.empty


def test_deterministic_across_runs(dataset, contract):
    raw = dataset("baseline")
    assert canonical_hash(clean(raw), contract) == canonical_hash(clean(raw.copy()),
                                                                  contract)


@pytest.mark.parametrize("variant", ["edge-bom-utf8", "edge-semicolon"])
def test_encoding_and_delimiter_variants_parse_to_the_same_data(dataset, variant):
    """The oracle reads a BOM file or a ';' file as what it means."""
    base = clean(dataset("baseline"))
    other = clean(read_csv_bytes((DATASETS / f"{variant}.csv").read_bytes()))
    assert list(other.columns) == list(base.columns)
    pd.testing.assert_frame_equal(other.drop(columns="customer_name"),
                                  base.drop(columns="customer_name"))


def test_empty_columns_flags_fully_blank_column():
    """Regression for the drop-column chatbot fix: country present but all blank."""
    import pandas as pd
    import yaml
    from pathlib import Path
    from checks import check_empty_columns
    contract = yaml.safe_load((Path(__file__).resolve().parents[1] / "contract.yaml").read_text())
    cols = list(contract["columns"])
    out = pd.DataFrame([{c: "x" for c in cols}, {c: "y" for c in cols}])
    assert check_empty_columns(out, contract).status == "pass"
    out["country"] = ""
    res = check_empty_columns(out, contract)
    assert res.status == "fail" and res.evidence["empty_columns"] == ["country"]


def test_empty_output_reports_instead_of_crashing(tmp_path):
    """Regression: header-only output (rename case after chatbot fix) crashed the validator."""
    import subprocess, sys, json
    from pathlib import Path
    root = Path(__file__).resolve().parents[2]
    out = tmp_path / "empty.csv"
    out.write_text("order_id,customer_name,email,order_date,amount_usd,quantity,country,status\n")
    r = subprocess.run([sys.executable, str(root / "data-validation/validate.py"), "--run", "t-empty",
                        "--input", str(root / "datasets/baseline.csv"), "--output", str(out),
                        "--reports-dir", str(tmp_path)], capture_output=True, text=True)
    assert r.returncode == 1, r.stderr
    rep = json.loads((tmp_path / "t-empty.json").read_text())
    rows = next(c for c in rep["checks"] if c["id"] == "row_reconciliation")
    assert rows["status"] == "fail"

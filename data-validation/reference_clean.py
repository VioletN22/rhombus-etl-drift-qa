"""The oracle: a plain-pandas implementation of contract.yaml's cleaning_rules.

The Rhombus output is compared cell by cell against clean(input). Each rule is
a small public function so tests can pin it down on its own.

Decisions where the contract is silent:
- Exact duplicates are judged on the raw strings, before any normalisation.
- "First row per order_id" means first in file order, after exact dedupe and
  before dropping rows with a missing amount (the prompt's order).
- An amount that is not a number after stripping "$" and "," counts as missing.
- Unknown countries are kept as their stripped upper-case value, so they
  surface as contract violations instead of silently becoming blank.
- quantity is passed through untouched: the prompt never asks to clean it.
- Strict on schema: a contract column missing from the input is treated as
  all-blank. A renamed amount_usd therefore means every row should be dropped;
  the validator reports the rename separately.
"""

from __future__ import annotations

import re
import sys
from datetime import datetime
from pathlib import Path

import pandas as pd

from common import contract_columns, load_contract, read_csv_path

EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
DATE_FORMATS = ["%m/%d/%Y", "%Y-%m-%d", "%b %d %Y"]

# Prompt rule 7, keyed by lower-cased stripped input.
COUNTRY_ALIASES = {
    "au": "AU", "aus": "AU", "australia": "AU",
    "nz": "NZ", "new zealand": "NZ",
    "us": "US", "usa": "US", "united states": "US",
    "gb": "GB", "uk": "GB", "united kingdom": "GB",
}


def clean_name(value: str) -> str:
    return value.strip().title()


def clean_email(value: str) -> str:
    email = value.strip().lower()
    return email if EMAIL_RE.match(email) else ""


def clean_date(value: str) -> str:
    text = value.strip()
    for fmt in DATE_FORMATS:
        try:
            return datetime.strptime(text, fmt).strftime("%Y-%m-%d")
        except ValueError:
            continue
    return ""


def parse_amount(value: str) -> float | None:
    """'$1,234.50' -> 1234.5; blank or non-numeric -> None (row is dropped)."""
    text = value.strip().replace("$", "").replace(",", "")
    try:
        return float(text)
    except ValueError:
        return None


def clean_country(value: str) -> str:
    text = value.strip()
    return COUNTRY_ALIASES.get(text.lower(), text.upper())


def clean_status(value: str) -> str:
    return value.strip().lower()


def clean_with_stats(df: pd.DataFrame, contract: dict | None = None
                     ) -> tuple[pd.DataFrame, dict]:
    """Apply the rules; also return how many rows each step removed."""
    contract = contract or load_contract()
    columns = contract_columns(contract)
    raw = df.fillna("").astype(str)
    for col in columns:
        if col not in raw.columns:
            raw[col] = ""
    raw = raw[columns]
    stats = {"input_rows": len(raw)}

    out = raw.drop_duplicates(keep="first")
    stats["exact_duplicates"] = stats["input_rows"] - len(out)

    out = out.assign(order_id=out["order_id"].str.strip())
    before = len(out)
    out = out.drop_duplicates(subset="order_id", keep="first")
    stats["duplicate_ids"] = before - len(out)

    amounts = out["amount_usd"].map(parse_amount)
    keep = (out["order_id"] != "") & amounts.notna()
    stats["missing_key_or_amount"] = int((~keep).sum())
    out = out[keep].copy()
    out["amount_usd"] = amounts[keep].astype(float)

    out["customer_name"] = out["customer_name"].map(clean_name)
    out["email"] = out["email"].map(clean_email)
    out["order_date"] = out["order_date"].map(clean_date)
    out["country"] = out["country"].map(clean_country)
    out["status"] = out["status"].map(clean_status)

    out = out.reset_index(drop=True)
    stats["output_rows"] = len(out)
    return out, stats


def clean(df: pd.DataFrame, contract: dict | None = None) -> pd.DataFrame:
    return clean_with_stats(df, contract)[0]


if __name__ == "__main__":
    if len(sys.argv) != 3:
        sys.exit("usage: python reference_clean.py <input.csv> <output.csv>")
    clean(read_csv_path(sys.argv[1])).to_csv(Path(sys.argv[2]), index=False)

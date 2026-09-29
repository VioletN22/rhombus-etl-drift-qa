"""Shared helpers: the contract, CSV parsing and canonical cell values.

Everything that decides "are these two values the same" lives here, so the
oracle diff, the null counts and the determinism hash all agree on it.
"""

from __future__ import annotations

import csv
import hashlib
import io
import math
from dataclasses import asdict, dataclass, field
from pathlib import Path

import pandas as pd
import yaml

HERE = Path(__file__).resolve().parent
CONTRACT_PATH = HERE / "contract.yaml"
DELIMITERS = [",", ";", "\t", "|"]


@dataclass
class Check:
    """One line of the report: what was checked, the verdict and the numbers."""

    id: str
    status: str  # pass | fail | warn
    detail: str
    evidence: dict = field(default_factory=dict)

    def to_dict(self) -> dict:
        return asdict(self)


def load_contract(path: Path = CONTRACT_PATH) -> dict:
    return yaml.safe_load(path.read_text())


def contract_columns(contract: dict) -> list[str]:
    return list(contract["columns"])


def read_csv_bytes(data: bytes) -> pd.DataFrame:
    """Parse CSV bytes into an all-string frame; blanks stay "" (never NaN).

    Handles a UTF-8 BOM and sniffs the delimiter from the header line, so the
    oracle reads what the file *means*, not how a naive reader would see it.
    """
    text = data.decode("utf-8-sig")
    if not text.strip():
        return pd.DataFrame()
    header = text.splitlines()[0]
    delimiter = max(DELIMITERS, key=header.count)
    return pd.read_csv(io.StringIO(text), dtype=str, keep_default_na=False,
                       sep=delimiter)


def read_csv_path(path: str | Path) -> pd.DataFrame:
    return read_csv_bytes(Path(path).read_bytes())


def sha256_bytes(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


# --- canonical values -------------------------------------------------------

def is_blank(value) -> bool:
    if value is None:
        return True
    if isinstance(value, float) and math.isnan(value):
        return True
    return str(value).strip().lower() in {"", "nan", "none", "<na>", "nat"}


def _as_float(value) -> float | None:
    try:
        return float(str(value).strip())
    except ValueError:
        return None


def canonical(value, col_type: str) -> str:
    """One comparable string per cell: blanks "", floats 2dp, ints without .0."""
    if is_blank(value):
        return ""
    text = str(value).strip()
    number = _as_float(text) if col_type in {"int", "float"} else None
    if number is None or math.isinf(number):
        return text
    if col_type == "float":
        return f"{round(number, 2):.2f}"
    return str(int(number)) if number.is_integer() else text


def canonical_frame(df: pd.DataFrame, contract: dict) -> pd.DataFrame:
    """Canonicalise every cell; columns in contract order, extras after (sorted)."""
    types = {c: spec["type"] for c, spec in contract["columns"].items()}
    known = [c for c in contract["columns"] if c in df.columns]
    extras = sorted(c for c in df.columns if c not in types)
    out = pd.DataFrame(index=df.index)
    for col in known + extras:
        out[col] = df[col].map(lambda v, t=types.get(col, "string"): canonical(v, t))
    return out


def _sort_key(value: str):
    return (0, int(value), "") if value.lstrip("-").isdigit() else (1, 0, value)


def canonical_hash(df: pd.DataFrame, contract: dict) -> str:
    """SHA-256 of the canonical table: rows sorted by key, fixed column order.

    Two outputs with the same content hash the same even if the platform
    reorders rows, writes 12.5 vs 12.50, or pads strings.
    """
    canon = canonical_frame(df, contract)
    key = contract["key"]
    rows = [tuple(r) for r in canon.itertuples(index=False)]
    if key in canon.columns:
        k = list(canon.columns).index(key)
        rows.sort(key=lambda r: (_sort_key(r[k]), r))
    else:
        rows.sort()
    buf = io.StringIO()
    writer = csv.writer(buf, lineterminator="\n")
    writer.writerow(canon.columns)
    writer.writerows(rows)
    return sha256_bytes(buf.getvalue().encode("utf-8"))

"""Shared fixtures: put data-validation/ on the path and expose the datasets."""

from __future__ import annotations

import sys
from pathlib import Path

import pandas as pd
import pytest

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent))

from common import load_contract, read_csv_path  # noqa: E402

DATASETS = HERE.parent.parent / "datasets"


@pytest.fixture(scope="session")
def contract() -> dict:
    return load_contract()


@pytest.fixture(scope="session")
def dataset():
    """Load datasets/<name>.csv as an all-string frame."""
    def load(name: str) -> pd.DataFrame:
        return read_csv_path(DATASETS / f"{name}.csv")
    return load


def frame(rows: list[dict]) -> pd.DataFrame:
    """A tiny raw input with every contract column defaulting to a valid value."""
    base = {"order_id": "1", "customer_name": "ann lee", "email": "a@b.co",
            "order_date": "01/02/2026", "amount_usd": "10", "quantity": "1",
            "country": "AU", "status": "pending"}
    return pd.DataFrame([{**base, **r} for r in rows], dtype=str)

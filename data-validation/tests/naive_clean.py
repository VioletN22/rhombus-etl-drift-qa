"""A deliberately naive pipeline, standing in for an AI-built one that does not
notice schema drift: it applies the rules to whatever columns it finds, passes
unknown columns through, and casts quantity to the contract's int type."""

from __future__ import annotations

import pandas as pd

import reference_clean as rc

CLEANERS = {"customer_name": rc.clean_name, "email": rc.clean_email,
            "order_date": rc.clean_date, "country": rc.clean_country,
            "status": rc.clean_status}


def naive_clean(raw: pd.DataFrame) -> pd.DataFrame:
    df = raw.drop_duplicates().copy()
    df["order_id"] = df["order_id"].str.strip()
    df = df.drop_duplicates(subset="order_id")
    df = df[df["order_id"] != ""]
    if "amount_usd" in df.columns:
        df["amount_usd"] = df["amount_usd"].map(rc.parse_amount)
        df = df[df["amount_usd"].notna()]
    for col, fn in CLEANERS.items():
        if col in df.columns:
            df[col] = df[col].map(fn)
    df["quantity"] = pd.to_numeric(df["quantity"], errors="coerce").astype("Int64")
    return df

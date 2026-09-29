"""Semantic drift detectors: same schema, different meaning.

A schema check cannot see dollars turning into cents or MM/DD turning into
DD/MM, because the columns and types are unchanged. These detectors compare a
run's *profile* (a few summary numbers written into every report) against the
baseline run's profile, using the thresholds in contract.yaml's `semantic`
block. Each detector returns a Check with the numbers it used.
"""

from __future__ import annotations

from datetime import date

import pandas as pd

from common import Check, is_blank
from reference_clean import parse_amount


# --- profile ------------------------------------------------------------------

def _amounts(df: pd.DataFrame) -> pd.Series:
    if "amount_usd" not in df.columns:
        return pd.Series(dtype=float)
    return df["amount_usd"].astype(str).map(parse_amount).dropna().astype(float)


def _iso_dates(df: pd.DataFrame) -> pd.Series:
    if "order_date" not in df.columns:
        return pd.Series(dtype="datetime64[ns]")
    return pd.to_datetime(df["order_date"].astype(str), format="%Y-%m-%d",
                          errors="coerce").dropna()


def distribution(values: pd.Series) -> dict[str, float]:
    """Share of each non-blank value, rounded for a stable report."""
    values = values[~values.map(is_blank)].astype(str).str.strip()
    if values.empty:
        return {}
    shares = values.value_counts(normalize=True).sort_index()
    return {k: round(float(v), 6) for k, v in shares.items()}


def slash_first_field_gt12(raw_dates: pd.Series) -> dict:
    """Among raw 'a/b/yyyy' dates, how many have a > 12 (impossible as a month)."""
    parts = raw_dates.astype(str).str.strip().str.split("/")
    slash = parts[parts.map(len) == 3]
    first = pd.to_numeric(slash.str[0], errors="coerce")
    n = int(first.notna().sum())
    over = int((first > 12).sum())
    return {"slash_dates": n, "first_gt12": over,
            "share": round(over / n, 6) if n else 0.0}


def build_profile(output: pd.DataFrame, raw_input: pd.DataFrame,
                  max_plausible: float) -> dict:
    """The numbers every report records so a later run can be compared to it."""
    amounts = _amounts(output)
    dates = _iso_dates(output)
    raw_dates = raw_input["order_date"] if "order_date" in raw_input.columns \
        else pd.Series(dtype=str)
    return {
        "amount_median": round(float(amounts.median()), 4) if len(amounts) else None,
        "amount_max": round(float(amounts.max()), 4) if len(amounts) else None,
        "amount_over_max_plausible": int((amounts > max_plausible).sum()),
        "month_distribution": distribution(dates.dt.strftime("%m")),
        "country_distribution": distribution(output["country"])
        if "country" in output.columns else {},
        "input_slash_dates": slash_first_field_gt12(raw_dates),
        "max_order_date": dates.max().strftime("%Y-%m-%d") if len(dates) else None,
    }


# --- detectors ----------------------------------------------------------------

def tvd(p: dict[str, float], q: dict[str, float]) -> float:
    """Total variation distance: half the L1 distance between two distributions."""
    keys = set(p) | set(q)
    return round(0.5 * sum(abs(p.get(k, 0.0) - q.get(k, 0.0)) for k in keys), 6)


def amount_scale(cur: dict, base: dict, semantic: dict) -> Check:
    limit = semantic["amount_scale_ratio_alert"]
    if not cur["amount_median"] or not base.get("amount_median"):
        return Check("drift_amount_scale", "warn", "not computable: no amounts")
    ratio = cur["amount_median"] / base["amount_median"]
    ev = {"median": cur["amount_median"], "baseline_median": base["amount_median"],
          "ratio": round(ratio, 4), "alert_above": limit}
    if ratio > limit or ratio < 1 / limit:
        return Check("drift_amount_scale", "fail",
                     f"median amount is {ratio:.1f}x baseline: likely a unit change "
                     "(e.g. cents)", ev)
    return Check("drift_amount_scale", "pass", f"median amount {ratio:.2f}x baseline", ev)


def amount_max_plausible(cur: dict, base: dict, semantic: dict) -> Check:
    limit = semantic["amount_max_plausible"]
    over = cur["amount_over_max_plausible"]
    ev = {"max": cur["amount_max"], "rows_over": over, "limit": limit,
          "baseline_rows_over": base.get("amount_over_max_plausible")}
    if over:
        return Check("drift_amount_max", "warn",
                     f"{over} order(s) above {limit:,}", ev)
    return Check("drift_amount_max", "pass", f"no order above {limit:,}", ev)


def date_day_month_swap(cur: dict, base: dict, semantic: dict) -> Check:
    """Computed on the INPUT: after cleaning, DD/MM dates are blank or wrong."""
    limit = semantic["date_day_gt_12_share_alert"]
    s = cur["input_slash_dates"]
    ev = {**s, "baseline_share": base.get("input_slash_dates", {}).get("share"),
          "alert_above": limit}
    if s["share"] > limit:
        return Check("drift_date_ddmm", "fail",
                     f"{s['share']:.0%} of input slash dates start with a day > 12: "
                     "input is likely DD/MM/YYYY", ev)
    return Check("drift_date_ddmm", "pass",
                 f"{s['share']:.0%} of input slash dates start above 12", ev)


def month_distribution(cur: dict, base: dict, semantic: dict) -> Check:
    limit = semantic["month_distribution_tvd_alert"]
    d = tvd(cur["month_distribution"], base.get("month_distribution", {}))
    ev = {"tvd": d, "alert_above": limit, "months": cur["month_distribution"]}
    status = "fail" if d > limit else "pass"
    return Check("drift_month_distribution", status,
                 f"month mix TVD {d:.3f} vs baseline (alert > {limit})", ev)


def country_distribution(cur: dict, base: dict, semantic: dict) -> Check:
    limit = semantic["category_distribution_tvd_alert"]
    d = tvd(cur["country_distribution"], base.get("country_distribution", {}))
    ev = {"tvd": d, "alert_above": limit, "countries": cur["country_distribution"]}
    status = "fail" if d > limit else "pass"
    return Check("drift_country_distribution", status,
                 f"country mix TVD {d:.3f} vs baseline (alert > {limit})", ev)


def future_dates(cur: dict, as_of: date) -> Check:
    latest = cur["max_order_date"]
    ev = {"max_order_date": latest, "as_of": as_of.isoformat()}
    if latest and latest > as_of.isoformat():
        return Check("drift_future_dates", "warn",
                     f"order dated {latest}, after {as_of}: day/month may be swapped", ev)
    return Check("drift_future_dates", "pass", "no order dated in the future", ev)


def run_detectors(cur: dict, base: dict, semantic: dict, as_of: date) -> list[Check]:
    return [
        amount_scale(cur, base, semantic),
        amount_max_plausible(cur, base, semantic),
        date_day_month_swap(cur, base, semantic),
        month_distribution(cur, base, semantic),
        country_distribution(cur, base, semantic),
        future_dates(cur, as_of),
    ]

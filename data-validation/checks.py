"""Contract checks on the Rhombus output.

Every function takes plain DataFrames (all cells as strings, as read from the
CSV) and returns a Check. `expected` is always reference_clean.clean(input), so
"what should be there" comes from the oracle, never from the output itself.
"""

from __future__ import annotations

import difflib
import re
from datetime import datetime

import pandas as pd

from common import Check, canonical, canonical_frame, contract_columns, is_blank
from reference_clean import EMAIL_RE, clean, parse_amount

MAX_IDS = 20
MAX_EXAMPLES = 10
MARKER_ID = "99999"
RENAME_NAME_RATIO = 0.6
RENAME_VALUE_SHARE = 0.9


# --- helpers ------------------------------------------------------------------

def _types(contract: dict) -> dict[str, str]:
    return {c: spec["type"] for c, spec in contract["columns"].items()}


def _keyed(df: pd.DataFrame, contract: dict) -> pd.DataFrame:
    """Canonical frame indexed by order_id (first occurrence wins)."""
    canon = canonical_frame(df, contract)
    key = contract["key"]
    canon = canon[~canon[key].duplicated(keep="first")]
    return canon.set_index(key, drop=False)


def _examples(df: pd.DataFrame, mask: pd.Series, col: str, key: str) -> list[dict]:
    rows = df[mask].head(5)
    return [{key: r[key] if key in rows.columns else None, col: r[col]}
            for _, r in rows.iterrows()]


def _missing_column(check_id: str, col: str) -> Check:
    return Check(check_id, "warn", f"not checked: column {col!r} missing "
                 "(see schema)", {"column": col})


# --- schema -------------------------------------------------------------------

def _loose(value, col_type: str) -> str:
    """Canonical value that forgives an un-applied '$'/',' strip on amounts."""
    if col_type == "float" and not is_blank(value):
        amount = parse_amount(str(value))
        return f"{amount:.2f}" if amount is not None else str(value).strip()
    return canonical(value, col_type)


def _value_share(output: pd.DataFrame, extra: str, missing: str,
                 raw_input: pd.DataFrame, contract: dict) -> float | None:
    """Share of rows where output[extra] equals what the contract would put in
    `missing` if the input column `extra` had been named `missing`."""
    key = contract["key"]
    if extra not in raw_input.columns or key not in output.columns:
        return None
    oracle = clean(raw_input.rename(columns={extra: missing}), contract)
    col_type = _types(contract)[missing]
    want = dict(zip(oracle[key].map(lambda v: canonical(v, "int")),
                    oracle[missing].map(lambda v: _loose(v, col_type))))
    got = zip(output[key].map(lambda v: canonical(v, "int")),
              output[extra].map(lambda v: _loose(v, col_type)))
    pairs = [(want[k], v) for k, v in got if k in want]
    if not pairs:
        return None
    return round(sum(a == b for a, b in pairs) / len(pairs), 4)


def likely_renames(missing: list[str], extra: list[str], output: pd.DataFrame,
                   raw_input: pd.DataFrame, contract: dict) -> list[dict]:
    """Pair each missing contract column with its best-matching extra column."""
    found = []
    for m in missing:
        best = None
        for e in extra:
            name_ratio = round(difflib.SequenceMatcher(
                None, re.sub(r"[\W_]+", " ", m.lower()),
                re.sub(r"[\W_]+", " ", e.lower())).ratio(), 4)
            share = _value_share(output, e, m, raw_input, contract)
            if name_ratio >= RENAME_NAME_RATIO or (share or 0) >= RENAME_VALUE_SHARE:
                score = max(name_ratio, share or 0)
                if best is None or score > best["score"]:
                    best = {"expected": m, "found": e, "name_ratio": name_ratio,
                            "value_match_share": share, "score": score}
        if best:
            found.append(best)
    return found


def check_schema(output: pd.DataFrame, raw_input: pd.DataFrame, contract: dict,
                 check_id: str = "schema") -> Check:
    expected = contract_columns(contract)
    actual = list(output.columns)
    missing = [c for c in expected if c not in actual]
    extra = [c for c in actual if c not in expected]
    shared = [c for c in actual if c in expected]
    order_ok = shared == [c for c in expected if c in actual]
    renamed = likely_renames(missing, extra, output, raw_input, contract)
    ev = {"expected": expected, "actual": actual, "missing": missing,
          "extra": extra, "order_ok": order_ok, "likely_renamed": renamed}
    if not (missing or extra or not order_ok):
        return Check(check_id, "pass", "columns and order match the contract", ev)
    parts = []
    if missing:
        parts.append(f"missing {missing}")
    if extra:
        parts.append(f"extra {extra}")
    if renamed:
        parts.append("likely renamed " + ", ".join(
            f"{r['expected']}->{r['found']}" for r in renamed))
    if not order_ok:
        parts.append("column order differs")
    return Check(check_id, "fail", "; ".join(parts), ev)


def check_input_schema(raw_input: pd.DataFrame, contract: dict) -> Check:
    """The input's own drift. Warn only: it explains output failures, it is
    not something the platform did wrong."""
    result = check_schema(raw_input, raw_input, contract, "input_schema")
    if result.status == "fail":
        result.status = "warn"
        result.detail = "input drifted from contract: " + result.detail
    return result


# --- rows ---------------------------------------------------------------------

def check_row_reconciliation(output: pd.DataFrame, expected: pd.DataFrame,
                             stats: dict, contract: dict) -> Check:
    key = contract["key"]
    tolerance = contract["reconciliation"]["tolerance_rows"]
    if key not in output.columns:
        return Check("row_reconciliation", "fail", f"output has no {key!r} column",
                     {"expected_rows": len(expected), "actual_rows": len(output)})
    want = expected[key].map(lambda v: canonical(v, "int"))
    got = output[key].map(lambda v: canonical(v, "int"))
    missing = sorted(set(want) - set(got), key=str)
    unexpected = sorted(set(got) - set(want), key=str)
    ev = {"expected_rows": len(expected), "actual_rows": len(output),
          "breakdown": stats, "missing_count": len(missing),
          "unexpected_count": len(unexpected), "missing_ids": missing[:MAX_IDS],
          "unexpected_ids": unexpected[:MAX_IDS]}
    diff = len(output) - len(expected)
    if abs(diff) > tolerance or missing or unexpected:
        return Check("row_reconciliation", "fail",
                     f"expected {len(expected)} rows, got {len(output)} "
                     f"({len(missing)} missing, {len(unexpected)} unexpected ids)", ev)
    return Check("row_reconciliation", "pass",
                 f"{len(output)} rows, same order_ids as the oracle", ev)


def check_unique_key(output: pd.DataFrame, contract: dict) -> Check:
    key = contract["key"]
    if key not in output.columns:
        return _missing_column("rule_unique_order_id", key)
    ids = output[key].map(lambda v: canonical(v, "int"))
    dupes = sorted(set(ids[ids.duplicated() & (ids != "")]), key=str)
    blanks = int((ids == "").sum())
    ev = {"duplicate_ids": dupes[:MAX_IDS], "duplicate_count": len(dupes),
          "blank_ids": blanks}
    if dupes or blanks:
        return Check("rule_unique_order_id", "fail",
                     f"{len(dupes)} duplicated and {blanks} blank order_id(s)", ev)
    return Check("rule_unique_order_id", "pass", "order_id unique and present", ev)


# --- per-rule checks ----------------------------------------------------------

def _rule(output: pd.DataFrame, contract: dict, check_id: str, col: str,
          bad, message: str, status_if_bad: str = "fail") -> Check:
    """Shared shape: count values that break a rule and show a few."""
    if col not in output.columns:
        return _missing_column(check_id, col)
    values = output[col].astype(str)
    mask = values.map(bad)
    n = int(mask.sum())
    ev = {"violations": n, "rows": len(values),
          "examples": _examples(output, mask, col, contract["key"])}
    if n:
        return Check(check_id, status_if_bad, f"{n} value(s) {message}", ev)
    return Check(check_id, "pass", f"all {len(values)} values ok", ev)


def _is_iso_date(v: str) -> bool:
    try:
        return datetime.strptime(v, "%Y-%m-%d").strftime("%Y-%m-%d") == v
    except ValueError:
        return False


def check_rules(output: pd.DataFrame, contract: dict) -> list[Check]:
    cols = contract["columns"]
    allowed_country = set(cols["country"]["allowed"])
    allowed_status = set(cols["status"]["allowed"])
    checks = [
        check_unique_key(output, contract),
        _rule(output, contract, "rule_customer_name", "customer_name",
              lambda v: v != v.strip().title(), "not trimmed Title Case"),
        _rule(output, contract, "rule_email", "email",
              lambda v: v != "" and (v != v.strip().lower() or not EMAIL_RE.match(v)),
              "not lowercase valid-or-blank"),
        _rule(output, contract, "rule_order_date", "order_date",
              lambda v: v != "" and not _is_iso_date(v), "not YYYY-MM-DD"),
        _rule(output, contract, "rule_amount_numeric", "amount_usd",
              lambda v: _as_number(v) is None, "blank or non-numeric"),
        _rule(output, contract, "rule_amount_non_negative", "amount_usd",
              lambda v: (_as_number(v) or 0) < 0,
              "negative (passed through by design)", "warn"),
        _rule(output, contract, "rule_country", "country",
              lambda v: v != "" and v not in allowed_country,
              f"outside {sorted(allowed_country)}"),
        _rule(output, contract, "rule_status_lowercase", "status",
              lambda v: v != v.strip().lower(), "not trimmed lowercase"),
        _rule(output, contract, "rule_status_allowed", "status",
              lambda v: v.strip().lower() not in allowed_status | {""},
              f"outside {sorted(allowed_status)}", "warn"),
        _rule(output, contract, "rule_quantity", "quantity",
              lambda v: v.strip() != "" and not _pos_int(v),
              "not a positive integer (not cleaned by design)", "warn"),
    ]
    return checks


def _as_number(v: str) -> float | None:
    try:
        return float(str(v).strip())
    except ValueError:
        return None


def _pos_int(v: str) -> bool:
    n = _as_number(v)
    return n is not None and n >= 1 and float(n).is_integer()


# --- comparisons with the oracle ----------------------------------------------

def check_null_inflation(output: pd.DataFrame, expected: pd.DataFrame,
                         contract: dict) -> Check:
    """Cells blank in the output where the oracle has a value (same order_id).

    This is how a silent type cast shows up: '3 units' -> NaN -> blank.
    """
    key = contract["key"]
    if key not in output.columns:
        return _missing_column("null_inflation", key)
    got, want = _keyed(output, contract), _keyed(expected, contract)
    ids = got.index.intersection(want.index)
    per_col, inflated_total = {}, 0
    for col in [c for c in want.columns if c in got.columns and c != key]:
        g, w = got.loc[ids, col], want.loc[ids, col]
        inflated = int(((g == "") & (w != "")).sum())
        inflated_total += inflated
        per_col[col] = {"output_blank": int((got[col] == "").sum()),
                        "expected_blank": int((want[col] == "").sum()),
                        "inflated": inflated}
    ev = {"compared_rows": len(ids), "columns": per_col}
    bad = {c: v["inflated"] for c, v in per_col.items() if v["inflated"]}
    if bad:
        return Check("null_inflation", "fail",
                     f"{inflated_total} cell(s) blank where the oracle has a value: {bad}",
                     ev)
    return Check("null_inflation", "pass", "no unexpected blanks", ev)


def check_oracle_diff(output: pd.DataFrame, expected: pd.DataFrame,
                      contract: dict) -> Check:
    key = contract["key"]
    if key not in output.columns:
        return _missing_column("oracle_diff", key)
    got, want = _keyed(output, contract), _keyed(expected, contract)
    ids = got.index.intersection(want.index)
    cols = [c for c in want.columns if c in got.columns and c != key]
    mismatches, examples = {}, []
    for col in cols:
        diff = got.loc[ids, col] != want.loc[ids, col]
        mismatches[col] = int(diff.sum())
        for oid in list(diff[diff].index)[:MAX_EXAMPLES - len(examples)]:
            examples.append({key: oid, "column": col, "expected": want.at[oid, col],
                             "actual": got.at[oid, col]})
    total = sum(mismatches.values())
    ev = {"compared_rows": len(ids), "compared_columns": cols,
          "mismatches": mismatches, "examples": examples}
    if len(want) and not len(ids):
        return Check("oracle_diff", "fail", "no order_id in common with the oracle", ev)
    if total:
        worst = {c: n for c, n in mismatches.items() if n}
        return Check("oracle_diff", "fail",
                     f"{total} cell(s) differ from the oracle: {worst}", ev)
    return Check("oracle_diff", "pass",
                 f"{len(ids)} rows x {len(cols)} columns identical to the oracle", ev)


def _variant(name: str) -> str | None:
    return name[len("Marker "):].lower() if name.startswith("Marker ") else None


def check_marker(output: pd.DataFrame, expected: pd.DataFrame,
                 contract: dict) -> Check:
    """order_id 99999 carries the input variant's name: proves which file was read."""
    key = contract["key"]
    want = _keyed(expected, contract)
    want_name = want.at[MARKER_ID, "customer_name"] if MARKER_ID in want.index else None
    if key not in output.columns or "customer_name" not in output.columns:
        return Check("marker_row", "fail", "cannot read marker: key or name missing",
                     {"expected_name": want_name})
    got = _keyed(output, contract)
    if MARKER_ID not in got.index:
        status = "fail" if want_name else "warn"
        return Check("marker_row", status, f"marker order {MARKER_ID} not in output",
                     {"expected_name": want_name})
    got_name = got.at[MARKER_ID, "customer_name"]
    ev = {"expected_name": want_name, "actual_name": got_name,
          "variant_read": _variant(got_name), "variant_expected":
          _variant(want_name) if want_name else None}
    if want_name is None:
        return Check("marker_row", "warn", "input has no marker row", ev)
    if got_name != want_name:
        return Check("marker_row", "fail",
                     f"output came from a different input: marker says "
                     f"{ev['variant_read']!r}, expected {ev['variant_expected']!r}", ev)
    return Check("marker_row", "pass", f"output was built from {ev['variant_read']!r}", ev)


def check_determinism(current: str, previous: list[tuple[str, str]]) -> Check:
    """Compare this output's canonical hash with earlier reports' hashes."""
    ev = {"sha256_canonical": current,
          "compared": [{"report": r, "sha256_canonical": h, "same": h == current}
                       for r, h in previous]}
    differ = [r for r, h in previous if h != current]
    if differ:
        return Check("determinism", "fail",
                     f"canonical output differs from {len(differ)} earlier run(s): "
                     f"{differ}", ev)
    return Check("determinism", "pass",
                 f"canonical output identical to {len(previous)} earlier run(s)", ev)

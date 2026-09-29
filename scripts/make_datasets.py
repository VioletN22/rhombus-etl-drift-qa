"""Generate the baseline orders dataset and every drift variant.

Seeded, stdlib only, so anyone can regenerate byte-identical files:

    python scripts/make_datasets.py

Each variant changes exactly one thing relative to the baseline (except
schema-all-combined, which is the deliberate combination). A manifest with
SHA-256 hashes is written to datasets/manifest.json.
"""

from __future__ import annotations

import csv
import hashlib
import io
import json
import random
import unicodedata
from pathlib import Path

SEED = 20260929
ROWS = 400
OUT = Path(__file__).resolve().parent.parent / "datasets"

COLUMNS = [
    "order_id",
    "customer_name",
    "email",
    "order_date",
    "amount_usd",
    "quantity",
    "country",
    "status",
]

FIRST = ["olivia", "noah", "amelia", "jack", "isla", "william", "mia", "oliver",
         "charlotte", "leo", "ava", "henry", "grace", "lucas", "chloe", "thomas",
         "josé", "zoë", "ngoc", "aarav"]
LAST = ["smith", "nguyen", "williams", "brown", "wilson", "taylor", "jones",
        "martin", "lee", "patel", "walker", "white", "harris", "kelly", "chen"]

# (messy spelling, ISO-2 it should become)
COUNTRIES = [
    ("AU", "AU"), ("Australia", "AU"), ("aus", "AU"), (" au ", "AU"),
    ("NZ", "NZ"), ("New Zealand", "NZ"), ("nz", "NZ"),
    ("US", "US"), ("United States", "US"), ("usa", "US"),
    ("GB", "GB"), ("United Kingdom", "GB"), ("uk", "GB"),
]
STATUSES = ["Shipped", "SHIPPED", "shipped", "Pending", "pending", "Delivered",
            "delivered", "Cancelled", "CANCELLED"]
# Planted typo: the contract flags it, the prompt only asks for lowercase.
TYPO_STATUS = "shipd"


def _name(rng: random.Random) -> str:
    name = f"{rng.choice(FIRST)} {rng.choice(LAST)}"
    style = rng.random()
    if style < 0.25:
        name = name.upper()
    elif style < 0.5:
        name = "".join(c.upper() if i % 2 else c for i, c in enumerate(name))
    if rng.random() < 0.2:
        name = f"  {name} "
    if rng.random() < 0.03:
        name = ""
    return name


def _email(rng: random.Random, name: str) -> str:
    folded = unicodedata.normalize("NFKD", name).encode("ascii", "ignore").decode()
    local = (folded.strip().lower().replace(" ", ".") or "anon")
    roll = rng.random()
    if roll < 0.05:
        return rng.choice(["bob@", "n/a", "not-an-email", "@example.com"])
    if roll < 0.08:
        return ""
    email = f"{local}{rng.randint(1, 99)}@example.com"
    return email.upper() if roll < 0.2 else email


def _date(rng: random.Random) -> tuple[int, int, int, str]:
    """Return (year, month, day, rendered string). Mostly MM/DD/YYYY."""
    y = 2026
    m = rng.randint(1, 9)
    d = rng.randint(1, 28)
    roll = rng.random()
    if roll < 0.08:
        s = f"{y}-{m:02d}-{d:02d}"                  # ISO already
    elif roll < 0.14:
        s = f"{['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep'][m-1]} {d} {y}"
    elif roll < 0.16:
        return y, 2, 30, "02/30/2026"               # impossible date
    else:
        s = f"{m:02d}/{d:02d}/{y}"
    return y, m, d, s


def _amount(rng: random.Random) -> str:
    value = round(rng.lognormvariate(3.6, 0.7), 2)
    roll = rng.random()
    if roll < 0.02:
        return ""                                   # missing: row must be dropped
    if roll < 0.04:
        return f"-{value:.2f}"                      # refund / bad sign
    if roll < 0.05:
        value = round(value * 250, 2)               # outlier
    if roll < 0.25:
        return f"${value:,.2f}"
    if roll < 0.30 and value >= 1000:
        return f"{value:,.2f}"
    return f"{value:.2f}"


def _quantity(rng: random.Random) -> str:
    roll = rng.random()
    if roll < 0.02:
        return "three"
    if roll < 0.04:
        return ""
    if roll < 0.05:
        return "0"
    return str(rng.randint(1, 6))


def build_baseline() -> list[dict[str, str]]:
    rng = random.Random(SEED)
    rows: list[dict[str, str]] = []
    for i in range(ROWS):
        name = _name(rng)
        *_, date = _date(rng)
        country, _ = rng.choice(COUNTRIES)
        status = TYPO_STATUS if rng.random() < 0.02 else rng.choice(STATUSES)
        rows.append({
            "order_id": str(10001 + i),
            "customer_name": name,
            "email": _email(rng, name),
            "order_date": date,
            "amount_usd": _amount(rng),
            "quantity": _quantity(rng),
            "country": country,
            "status": status,
        })

    # Missing order_id rows (must be dropped).
    for idx in rng.sample(range(len(rows)), 4):
        rows[idx]["order_id"] = ""

    # ~5% exact duplicates.
    for src in rng.sample(rows, ROWS // 20):
        rows.insert(rng.randrange(len(rows)), dict(src))

    # A few duplicate IDs with conflicting data: first occurrence must win.
    for src in rng.sample([r for r in rows if r["order_id"]], 4):
        clash = dict(src)
        clash["amount_usd"] = "999.99"
        clash["status"] = "Cancelled"
        pos = rows.index(src) + rng.randint(1, 30)
        rows.insert(min(pos, len(rows)), clash)

    # Marker row: proves which file version a run actually read.
    rows.append({
        "order_id": "99999", "customer_name": "Marker Row", "email": "marker@example.com",
        "order_date": "01/01/2026", "amount_usd": "1.00", "quantity": "1",
        "country": "AU", "status": "pending",
    })
    return rows


def _to_csv(rows: list[dict[str, str]], columns: list[str], *, delimiter: str = ",",
            bom: bool = False) -> bytes:
    buf = io.StringIO()
    writer = csv.DictWriter(buf, fieldnames=columns, delimiter=delimiter,
                            lineterminator="\n", extrasaction="ignore")
    writer.writeheader()
    writer.writerows(rows)
    data = buf.getvalue().encode("utf-8")
    return (b"\xef\xbb\xbf" + data) if bom else data


def _marker(rows: list[dict[str, str]], tag: str) -> list[dict[str, str]]:
    """Stamp the marker row so each variant is identifiable in the output."""
    out = [dict(r) for r in rows]
    for r in out:
        if r.get("order_id") == "99999":
            r["customer_name"] = f"Marker {tag}"
    return out


def _rename(rows, old, new):
    return [{(new if k == old else k): v for k, v in r.items()} for r in rows]


def _drop(rows, col):
    return [{k: v for k, v in r.items() if k != col} for r in rows]


def _type_change(rows):
    out = []
    for r in rows:
        r = dict(r)
        q = r["quantity"]
        r["quantity"] = f"{q} units" if q.isdigit() else q
        out.append(r)
    return out


def _add_column(rows, rng):
    out = []
    for r in rows:
        r = dict(r)
        r["discount_code"] = rng.choice(["", "", "SPRING10", "VIP", "FREESHIP"])
        out.append(r)
    return out


def _cents(rows):
    out = []
    for r in rows:
        r = dict(r)
        raw = r["amount_usd"].replace("$", "").replace(",", "")
        try:
            r["amount_usd"] = str(round(float(raw) * 100))
        except ValueError:
            pass
        out.append(r)
    return out


def _ddmm(rows):
    """Swap MM/DD to DD/MM for slash dates. Other formats left alone."""
    out = []
    for r in rows:
        r = dict(r)
        parts = r["order_date"].split("/")
        if len(parts) == 3:
            r["order_date"] = f"{parts[1]}/{parts[0]}/{parts[2]}"
        out.append(r)
    return out


def _country_swap(rows):
    """'AU' now means Austria: same codes, different meaning."""
    out = []
    for r in rows:
        r = dict(r)
        if r["country"].strip().lower() in {"au", "aus", "australia"}:
            r["country"] = "AT" if r["country"].strip() == "AU" else "Austria"
        out.append(r)
    return out


def main() -> None:
    OUT.mkdir(exist_ok=True)
    base = build_baseline()
    rng = random.Random(SEED + 1)
    cols = COLUMNS

    variants: dict[str, tuple[bytes, str]] = {}

    def add(name, rows, columns, note, **kw):
        variants[name] = (_to_csv(_marker(rows, name), columns, **kw), note)

    add("baseline", base, cols, "Known-good input the pipeline is built against.")

    # Required schema drift: one change each, then combined.
    add("schema-drop-column", _drop(base, "country"),
        [c for c in cols if c != "country"], "country column removed.")
    add("schema-rename-column", _rename(base, "amount_usd", "total_amount"),
        [("total_amount" if c == "amount_usd" else c) for c in cols],
        "amount_usd renamed to total_amount; values identical.")
    add("schema-type-change", _type_change(base), cols,
        "quantity int -> text ('3 units').")
    add("schema-add-column", _add_column(base, random.Random(SEED + 2)),
        cols + ["discount_code"], "New discount_code column appended.")
    combined = _add_column(_type_change(_rename(_drop(base, "country"),
                                                 "amount_usd", "total_amount")),
                           random.Random(SEED + 2))
    add("schema-all-combined", combined,
        [("total_amount" if c == "amount_usd" else c) for c in cols if c != "country"]
        + ["discount_code"], "All four schema changes at once.")

    # Required semantic drift: structure identical, meaning changed.
    add("semantic-dollars-to-cents", _cents(base), cols,
        "amount_usd values x100 (cents), header unchanged.")
    add("semantic-date-mmdd-to-ddmm", _ddmm(base), cols,
        "Slash dates switched from MM/DD/YYYY to DD/MM/YYYY.")
    add("semantic-country-code-swap", _country_swap(base), cols,
        "Bonus: Australia rows relabelled as Austria (AT).")

    # Extra-credit edge cases.
    dotted = _rename(base, "amount_usd", "amount.usd")
    add("edge-dotted-header", dotted,
        [("amount.usd" if c == "amount_usd" else c) for c in cols],
        "Docs: Data Input converts '.' in headers to spaces.")
    add("edge-header-only", [], cols, "Header row, zero data rows.")
    add("edge-bom-utf8", base, cols, "UTF-8 BOM prefix.", bom=True)
    add("edge-semicolon", base, cols, "Delimiter switched to ';'.", delimiter=";")

    manifest = {"seed": SEED, "rows_generated": ROWS, "files": {}}
    for name, (data, note) in variants.items():
        path = OUT / f"{name}.csv"
        path.write_bytes(data)
        manifest["files"][name] = {
            "file": path.name,
            "sha256": hashlib.sha256(data).hexdigest(),
            "rows": data.count(b"\n") - 1,
            "note": note,
        }
    (OUT / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n")
    print(f"wrote {len(variants)} files to {OUT}")


if __name__ == "__main__":
    main()

"""Small helper: set fields on a case / trial / AI-builder attempt in observations/matrix.yaml.

    python scripts/update_matrix.py case schema-drop-column status=done severity=Critical ...
Values: comma lists become lists (run_ids=a,b), numbers become numbers, 'null' becomes None.
"""
import sys
from pathlib import Path
import yaml

ROOT = Path(__file__).resolve().parent.parent
PATH = ROOT / "observations" / "matrix.yaml"


def parse(v):
    if v == "null":
        return None
    if "," in v or v.startswith("["):
        return [x for x in v.strip("[]").split(",") if x]
    try:
        return int(v)
    except ValueError:
        try:
            return float(v)
        except ValueError:
            return v


def main():
    kind, key, *pairs = sys.argv[1:]
    text = PATH.read_text()
    data = yaml.safe_load(text)
    section, field = {"case": ("cases", "case"), "trial": ("consistency_trials", "id"),
                      "ai": ("ai_builder_runs", "attempt")}[kind]
    item = next(x for x in data[section] if str(x[field]) == key)
    for p in pairs:
        k, v = p.split("=", 1)
        item[k] = parse(v)
    header = "".join(l for l in text.splitlines(True) if l.startswith("#") and text.index(l) < text.index("cases:"))
    PATH.write_text(header + "\n" + yaml.safe_dump(data, sort_keys=False, allow_unicode=True, width=100))
    print(f"updated {kind} {key}")


if __name__ == "__main__":
    main()

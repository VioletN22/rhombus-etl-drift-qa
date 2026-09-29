#!/usr/bin/env bash
# Practice run with NO cloud: pretend Rhombus cleaned the data perfectly (the
# oracle's output), then validate the baseline (green) and a cents drift (red).
# Nothing here is real Rhombus evidence; it all goes to practice/ (gitignored).
set -euo pipefail
cd "$(dirname "$0")/.."
PY=.venv/bin/python
OUT=practice
mkdir -p "$OUT"

echo "== 1. baseline: a perfect pipeline should pass =="
$PY data-validation/validate.py --run practice-baseline --input datasets/baseline.csv \
  --output datasets/baseline.csv --reference-output "$OUT/baseline-clean.csv" \
  --reports-dir "$OUT" >/dev/null || true
$PY data-validation/validate.py --run practice-baseline --input datasets/baseline.csv \
  --output "$OUT/baseline-clean.csv" --reports-dir "$OUT"

echo; echo "== 2. semantic drift: dollars became cents, pipeline 'succeeds' =="
$PY data-validation/validate.py --run practice-cents --input datasets/semantic-dollars-to-cents.csv \
  --output datasets/semantic-dollars-to-cents.csv --reference-output "$OUT/cents-clean.csv" \
  --reports-dir "$OUT" >/dev/null || true
$PY data-validation/validate.py --run practice-cents --input datasets/semantic-dollars-to-cents.csv \
  --output "$OUT/cents-clean.csv" --baseline-report "$OUT/practice-baseline.json" \
  --reports-dir "$OUT" || echo "(exit code $? = validator caught it)"

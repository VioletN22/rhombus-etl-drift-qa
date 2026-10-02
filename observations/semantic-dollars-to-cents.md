# Semantic drift: amounts sent in cents instead of dollars

| | |
|---|---|
| Case file | `datasets/semantic-dollars-to-cents.csv` (uploaded as `input/orders.csv`) |
| S3 version | `rtOoGcJTbJXsCbBFcP7Hpa87D.4BJqaZ`, uploaded 2026-10-02 17:11:44 AEST, 31.7 KB |
| Pipeline | Original AI-built code (restore verified by `code_sha=831d36d0703c`) |
| Run | Manual run (▶) ~17:11 AEST |
| Severity | **High** (green run, every order's amount 100× too big, no warning) |
| Pipeline stopped? | **No.** Green, output written |
| Chatbot fix worked? | Not applicable (no error, so no Ask Chatbot button) |

## What I changed
Every `amount_usd` value multiplied by 100, as if the source system switched to cents (`30.83` → `3083`). Column names, types and every other value are unchanged. Marker row: "Marker semantic-dollars-to-cents".

## Expected
Best: notice that amounts jumped ~100× compared with previous runs and warn or pause. Acceptable: run, but flag the shift. Worst: run green and ship the wrong money silently.

## What happened
- Run **green**; GCS received `orders_cleaned_1790925115589.csv` (30.4 KB, 390 rows).
- **Every amount is 100× the baseline.** Compared row by row with the baseline output, `amount_usd` is the only column that changed (plus the marker name).

| | Baseline | This run |
|---|---|---|
| Median order | $36.94 | $3,693.50 |
| Largest order | $15,052.50 | $1,505,250.00 |
| Total revenue | $40,905.92 | $4,090,592.00 |
| Orders over $10,000 | 1 | 35 |

- No warning, no log line, no difference in the run summary. The step is told to "convert amount to a number", and 3083 already is one, so from the pipeline's point of view nothing is wrong.
- Validator: same 3 known baseline bugs (email, quantity), plus **`drift_amount_scale` fail: "median amount is 100.0x baseline: likely a unit change (e.g. cents)"** and `drift_amount_max` warn: 35 orders above $10,000. Our detector caught what Rhombus didn't, using only one number from the previous run (the median amount).

## Logs
Same as a normal run: "Pipeline completed successfully", "Applied 3 transformations…". Screenshot: `evidence/2026-10-02_dollars-to-cents-run-green.png`.

## Chatbot diagnosis
Not applicable. With no error there's no "Ask Chatbot" button, so a user would have no prompt to ask.

## Reproduce
1. Upload `datasets/semantic-dollars-to-cents.csv` as `input/orders.csv`
2. Run drift-qa with the original code
3. Compare `amount_usd` with the baseline output: every value ×100

## Impact and suggestion
This is the kind of drift that does real damage: revenue reports jump 100× and nobody is told. It's not really an AI bug: a schema check can't see it, because the shape is fine. Suggest Rhombus keep simple per-column stats from the last good run (median, min, max) and warn when a new run moves far outside them (e.g. median ×10 or more). That's a few numbers per column and would catch this in one line: "amount_usd median is 100× the last run".

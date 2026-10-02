# Schema drift: add a column (`discount_code`)

| | |
|---|---|
| Case file | `datasets/schema-add-column.csv` (uploaded as `input/orders.csv`) |
| S3 version | `CFDR3eDky80pHiylkxeAAUcSR_MPhZsm`, uploaded 2026-10-02 16:11:26 AEST, 34.2 KB |
| Pipeline | Original AI-built code |
| Run | Manual run (▶) ~16:13 AEST |
| Severity | Low (handled; the new column is dropped without notice) |
| Pipeline stopped? | **No.** Green, output written |
| Chatbot fix worked? | Not applicable (no error) |

## What I changed
Appended a 9th column, `discount_code` (SPRING10 / VIP / FREESHIP / blank). All 8 original columns and every row are unchanged. Marker row: "Marker schema-add-column".

## Expected
Best: carry on, clean the 8 known columns exactly as before, and either pass the new column through or tell the user it was ignored. Worst: crash on an unexpected column, or let the new column disturb the existing rules.

## What happened
- Run **green**; GCS received `orders_cleaned_1790921587660.csv` (29.9 KB, 390 rows).
- Output is **identical to the baseline output** on every row except the marker row's name (byte-for-byte comparison). The new column had no side effects on the 8 known columns.
- `discount_code` is **not in the output**: the AI-built step ends with "return only these 8 columns", so the new column is dropped. No warning, no log line saying a column was ignored.
- Validator: same 3 known baseline bugs; `input_schema` warns "extra ['discount_code']". (The `determinism` fail is expected here: the marker row differs by design, so this input isn't the same as the baseline's.)

## Logs
Nothing about the new column. Screenshot: `evidence/2026-10-02_add-column-run-green.png`.

## Chatbot diagnosis
Not applicable; there was no error.

## Reproduce
1. Upload `datasets/schema-add-column.csv` as `input/orders.csv`
2. Run drift-qa with the original code
3. Compare the GCS output with the baseline output (only the marker row differs; no `discount_code`)

## Impact and suggestion
This is the behaviour most customers would want from a fixed-output pipeline, so I rate it handled. The gap is visibility: if a supplier starts sending a field the business needs, nobody is told it's being discarded. Suggest a one-line info log, "Input has 1 new column (`discount_code`) not used by this pipeline".

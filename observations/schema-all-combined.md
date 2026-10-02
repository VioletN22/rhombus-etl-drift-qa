# Schema drift: all four changes at once

| | |
|---|---|
| Case file | `datasets/schema-all-combined.csv` (uploaded as `input/orders.csv`) |
| S3 version | `FwxOAybxjU7_Vb.sebyVXKw9SVr_0SBx`, uploaded 2026-10-02 16:36:53 AEST, 33.9 KB |
| Pipeline | Original AI-built code |
| Run | Manual run (▶) 16:37:40 AEST |
| Severity | Medium (stopped safely; error reports 1 of 4 problems; logs contradict themselves) — draft |
| Pipeline stopped? | **Yes**, at `orders_cleaned` |
| Chatbot fix worked? | _pending_ |

## What I changed
All four schema changes in one file: `country` removed, `amount_usd` renamed to `total_amount`, `quantity` values turned into text ("6 units"), and a new `discount_code` column. Marker row: "Marker schema-all-combined".

## Expected
Best: stop before running, listing all four problems. OK: stop on the first problem. Worst: run green and ship partly broken data.

## What happened
- Pipeline **failed at `orders_cleaned`** at 16:37:45; nothing reached GCS.
- The error names **one** problem: `'amount_usd'` (the rename). Nothing about the missing `country`, the text `quantity` or the new column. A user would fix the rename, re-run, hit `'country'`, fix that, re-run, and never be told quantity became text (case 3 showed that one doesn't error at all).
- **Contradictory logs:** the same second (16:37:45) shows both "Pipeline failed at orders_cleaned …" (error) and "Pipeline execution completed successfully." (success). The run-level summary contradicts the node failure.

## Logs
> Pipeline failed at orders_cleaned: LLM execution failed (code_sha=831d36d0703c): 'amount_usd' --- Generated code --- …

followed immediately by
> Pipeline execution completed successfully.

Clear? **Partially / misleading**: one of four problems reported, and a success message for a failed run. Screenshot: `evidence/2026-10-02_all-combined-error-log-panel.png`. Full JSON: `evidence/2026-10-02_schema-all-combined-error-log.json`.

## Chatbot diagnosis
_pending_

## Reproduce
1. Upload `datasets/schema-all-combined.csv` as `input/orders.csv`
2. Run drift-qa with the original code
3. Read the Logs panel (error plus success line at the same timestamp)

## Impact and suggestion
Safe, but slow to diagnose: problems surface one at a time. Suggest validating the input schema against the pipeline's expected columns before execution and listing every mismatch in one message. The "completed successfully" line on a failed run should be fixed: monitoring keyed on that line would record a failure as a success.

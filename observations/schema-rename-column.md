# Schema drift: rename a column (`amount_usd` → `total_amount`)

| | |
|---|---|
| Case file | `datasets/schema-rename-column.csv` (uploaded as `input/orders.csv`) |
| S3 version | `EfHU9zLaR5Ay1uqPvXotbtWFsiHolxaI`, uploaded 2026-10-02 15:22:07 AEST, 32.2 KB |
| Pipeline | Original AI-built code (restored after case 1; same `code_sha=831d36d0703c` as before the chatbot patch) |
| Run | Manual run (▶) 15:23 AEST (scheduled runs don't execute on this account) |
| Severity | Medium (stopped correctly, error doesn't mention the rename) — draft |
| Pipeline stopped? | **Yes**, at `orders_cleaned` |
| Chatbot fix worked? | _pending_ |

## What I changed
Renamed the header `amount_usd` to `total_amount`. Values in that column and every other cell are identical to the baseline. Marker row: "Marker schema-rename-column".

## Expected
`orders_cleaned` uses `amount_usd` twice (drop rows with a missing amount; strip `$`/`,` and convert to a number). A careful platform should stop with "column `amount_usd` not found", and ideally notice that `total_amount` is new, holds the same kind of values, and suggest it as a rename.

## What happened
- Pipeline **failed at `orders_cleaned`** at 15:23:08. Logs: 5 visible, 4 OK, 1 error.
- **No output reached GCS** (newest object is from 15:18:11, before this upload).
- Error, verbatim (full JSON: `evidence/2026-10-02_schema-rename-column-error-log.json`):
  > Pipeline failed at orders_cleaned: LLM execution failed (code_sha=831d36d0703c): 'amount_usd' --- Generated code --- import pandas as pd ...
- Same shape as the drop-column error: the cause is only the bare word `'amount_usd'` (a pandas KeyError). No mention that `total_amount` appeared, so no rename hint.
- `code_sha` is identical to the drop-column failure, which independently confirms the restore put back the exact original code.

## Logs
Clear? **Partially.** Names the failing step; doesn't say "missing column", doesn't notice the new column, and the "LLM execution failed" wording points at the AI rather than the data. Screenshot: `evidence/2026-10-02_rename-column-error-log-panel.png`.

## Chatbot diagnosis
_pending_

## Schedule afterwards
Not testable on this account (scheduled runs don't execute; reported to Rhombus 14:39).

## Reproduce
1. Upload `datasets/schema-rename-column.csv` to `s3://violet-rhombus-drift-in/input/orders.csv`
2. Run the drift-qa pipeline with the original code
3. Check Logs and GCS

## Impact and suggestion
Safe (nothing shipped), but a rename is the most common real-world schema drift and the easiest to auto-detect: same position, same value pattern, similar name. Suggest a rename hint ("`amount_usd` missing; new column `total_amount` looks like it — map it?").

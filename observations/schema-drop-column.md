# Schema drift: drop a column (`country`)

| | |
|---|---|
| Case file | `datasets/schema-drop-column.csv` (uploaded as `input/orders.csv`) |
| S3 version | `83k9nJAdqftt9BP6sG_CNbcfZGCwhEwG`, uploaded 2026-10-02 14:55:36 AEST, 29.5 KB |
| Run | Manual run (▶) ~14:57 AEST. Scheduled runs don't execute on this account; see `FINDINGS.md` and the email to Rhombus |
| Severity | Medium (stopped correctly, error hard to read) — draft |
| Pipeline stopped? | **Yes**, at `orders_cleaned` |
| Chatbot fix worked? | _pending_ |

## What I changed
Removed the `country` column from the baseline. Every other column and row is identical; marker row reads "Marker schema-drop-column".

## Expected
The AI-built `orders_cleaned` step standardises `country` (rule 7), so it references the column by name. A careful platform should stop or warn with a clear "column `country` not found" message and not write output.

## What happened
- Pipeline **failed at `orders_cleaned`** at 14:57:04. Logs: 13 entries, 12 OK, 1 error.
- **No output reached GCS** (newest object is still the 14:50:28 baseline run). Good: no partial or wrong data shipped.
- The generated code is unchanged after the failure (diff against the pre-drift copy: identical, 94 lines). The failing line is `df['country'] = df['country'].apply(standardize_country)` (line 86), a plain pandas `KeyError`.
- After the failure the Transform panel showed "Generating code… Starting code generation. The live transcript will appear shortly." but the saved code didn't change.

## Logs
Exact error (full JSON in `evidence/2026-10-02_schema-drop-column-error-log.json`):

> Pipeline failed at orders_cleaned: LLM execution failed (code_sha=831d36d0703c): 'country' --- Generated code --- import pandas as pd ...

Clear? **Partially.** It names the failing step, which is useful, but the cause is shown only as `'country'` (a raw Python KeyError, no "missing column" wording), followed by a dump of generated code. A non-developer wouldn't know the input file lost a column. "LLM execution failed" also suggests the AI failed, not the data.

Screenshots: `evidence/2026-10-02_drop-column-run-regenerating-code.png`, `evidence/2026-10-02_drop-column-error-log-panel.png`.

## Chatbot diagnosis
_Pending: click "Ask Chatbot" on the error, record the diagnosis verbatim, rate correct / partial / wrong, apply the fix via `/pipeline`, re-run, re-validate, then re-run the baseline to check the fix didn't break it._

## Schedule afterwards
Not testable on this account (scheduled runs never execute; reported to Rhombus 14:39).

## Reproduce
1. Upload `datasets/schema-drop-column.csv` to `s3://violet-rhombus-drift-in/input/orders.csv`
2. Run the drift-qa pipeline
3. Check Logs and the GCS bucket for a new object

## Impact and suggestion
Good outcome on safety: it failed loudly and shipped nothing. Weak on explanation. Suggest translating `KeyError: 'col'` in AI-generated steps into "Input is missing column `country`, which step `orders_cleaned` uses (rule: standardise country)", plus a schema check on Data Input that flags missing columns before any step runs.

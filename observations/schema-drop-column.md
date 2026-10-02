# Schema drift: drop a column (`country`)

| | |
|---|---|
| Case file | `datasets/schema-drop-column.csv` (uploaded as `input/orders.csv`) |
| S3 version | `83k9nJAdqftt9BP6sG_CNbcfZGCwhEwG`, uploaded 2026-10-02 14:55:36 AEST, 29.5 KB |
| Run | Manual run (▶) ~14:57 AEST. Scheduled runs don't execute on this account; see `FINDINGS.md` and the email to Rhombus |
| Severity | **Critical** after the chatbot fix (silent blank column shipped). Before the fix: Medium (stopped, cryptic error) |
| Pipeline stopped? | **Yes**, at `orders_cleaned` |
| Chatbot fix worked? | **No.** Wrong diagnosis; the "fix" made the run green by shipping a blank `country` column |

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
- Prompt: clicked **Ask Chatbot** on the error; no text added. Transcript: `evidence/2026-10-02_drop-column-chatbot-transcript.txt`.
- Diagnosis: **wrong.** "The column name in the source CSV likely differs in casing or has extra whitespace." It didn't inspect the input; the column is absent.
- It **edited the pipeline without asking**: lowercased and trimmed headers, skipped rules whose column is missing, and "ensure[d] all 8 required columns are present before the final select". Cost 5 credits.
- Re-run (▶, 15:05:56): **green**, wrote `orders_cleaned_1790917556079.csv` (29.1 KB) to GCS with **`country` blank on all 390 rows**. Marker row confirms it read the drop-column file.
- Validator (`reports/drop-column-after-fix.json`): fails `empty_columns` (country blank on every row) plus the 3 known baseline bugs.
- **Fix worked? No.** It converted a loud, safe failure into a silent success that ships wrong data. A downstream report grouped by country would quietly show everything as "unknown".
- Regression on the baseline: re-uploaded the baseline (S3 version `9OU4TBDc...`, 15:09:56) and re-ran at 15:11. Output is **byte-identical** to the pre-patch baseline runs (sha256 df95576e...). The patch didn't change how normal data is cleaned; it only changes behaviour when a column is missing.

Validator note: the first version of my validator passed this output on `rule_country`, because blank is allowed and the oracle (built from an input with no country) is also blank. I added `empty_columns` (fail if a contract column is blank on every row) with a regression test. My own tooling had a blind spot that this case exposed.

## Schedule afterwards
Not testable on this account (scheduled runs never execute; reported to Rhombus 14:39).

## Reproduce
1. Upload `datasets/schema-drop-column.csv` to `s3://violet-rhombus-drift-in/input/orders.csv`
2. Run the drift-qa pipeline
3. Check Logs and the GCS bucket for a new object

## Impact and suggestion
Good outcome on safety: it failed loudly and shipped nothing. Weak on explanation. Suggest translating `KeyError: 'col'` in AI-generated steps into "Input is missing column `country`, which step `orders_cleaned` uses (rule: standardise country)", plus a schema check on Data Input that flags missing columns before any step runs.

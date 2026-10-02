# Schema drift: all four changes at once

| | |
|---|---|
| Case file | `datasets/schema-all-combined.csv` (uploaded as `input/orders.csv`) |
| S3 version | `FwxOAybxjU7_Vb.sebyVXKw9SVr_0SBx`, uploaded 2026-10-02 16:36:53 AEST, 33.9 KB |
| Pipeline | Original AI-built code |
| Run | Manual run (▶) 16:37:40 AEST |
| Severity | **Critical** after the chatbot fix (first left unrunnable, then shipped a blank country column and 2 junk columns, all green). Before the fix: Medium (stopped safely; 1 of 4 problems reported; contradictory logs) |
| Pipeline stopped? | **Yes**, at `orders_cleaned` |
| Chatbot fix worked? | **No.** First it left the pipeline unrunnable; a 4th chatbot request rewired it, and the run went green with `country` blank on all 390 rows |

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
- Prompt: **Ask Chatbot** on the 16:37:45 error, no text added (same chat thread as cases 1-2). Transcript: `evidence/2026-10-02_all-combined-chatbot-transcript.txt`.
- Diagnosis: **wrong.** It doubled down on the invented theory that "the execution engine is still running the original cached code" because the `code_sha` matched across runs. The sha matched because I deliberately restored the original code before each case. It never inspected the input, so none of the four real problems was named.
- What it did, without asking (1m 15s, 5 credits): rewrote the node "to force a fresh hash", then **deleted `orders_cleaned` and re-added it as `llm_node_2`** with the code embedded in its instruction (header normalisation, fuzzy aliases, blank fallback).
- Its closing message: "Run the pipeline again — it will now execute fresh code rather than the stale cached version."
- Re-run attempt: **▶ refuses to run.** Toasts: "output_64e957de… : missing upstream dataframe input". The canvas now has `dedup_order_id → llm_node_2` but **no edge from `llm_node_2` to Data Output**; the old node's outgoing connection was lost when it was deleted.
- **Fix worked? No. It broke the pipeline**, from a hallucinated cause, while telling the user it was fixed. Screenshot: `evidence/2026-10-02_all-combined-after-chatbot-cannot-run.png`.

### 4th chatbot request: repair its own break
- Prompt (typed, 16:53): "The pipeline won't run now. I get "missing upstream dataframe input" on the Data Output node."
- Reply (6s, 5 credits): correctly saw "the output node is still wired to the deleted llm_node_1" and reconnected it. Diagnosis of **its own** break: **correct**.
- Re-run 16:54:12 → **"Pipeline completed successfully"** 16:55:04. New GCS object `orders_cleaned_1790924103326.csv` (33.3 KB, 390 rows). Saved as `runs/2026-10-02-drift/all-combined-after-chatbot-fix.csv`. Screenshots: `evidence/2026-10-02_all-combined-chatbot-rewire-fix.png`, `evidence/2026-10-02_all-combined-chatbot-fix-run-green.png`.

### What the "fixed" output contains (validator: 15 pass, 5 fail, 6 warn)
| Problem in input | What shipped |
|---|---|
| `country` removed | `country` column present but **blank on all 390 rows** (validator `empty_columns` fail; country mix TVD 0.50) |
| `amount_usd` renamed to `total_amount` | `amount_usd` filled correctly, **and** `total_amount` also shipped as an extra column |
| `quantity` as text ("6 units") | parsed to numbers (6.0). Better than case 3, where text shipped |
| new `discount_code` | **shipped** as an extra column (case 4's code dropped it) |

- Output has **10 columns, not the contract's 8**. Why, from the node's Edit Code → Transcript: the chatbot wrote a prompt that selects 8 columns, but layer 2 **regenerated the code against this file**, and Rhombus's own sandbox rule ("Table-preserving transformation dropped input columns") rejected the 8-column version twice. The final code keeps every input column and copies `total_amount` into a new `amount_usd`. The canvas card and run log show none of this; it's only in the transcript. Full write-up: `evidence/2026-10-02_all-combined-codegen-transcript.md`; final code: `evidence/2026-10-02_all-combined-chatbot-final-code.py`.
- Green status, no warning. Downstream gets a blank country for every order and two columns nobody asked for.
- Report: `data-validation/reports/all-combined-after-fix.json`.

### Why the code "adapted" only in this case
- Layer 2 (the code writer) always looks at the current input and test-runs its code in a sandbox, but **it only writes code when the node's instructions change**. A normal re-run reuses the saved code (verified earlier: identical code across runs).
- Earlier cases: the code was written once on the clean baseline, and my restores pasted that code directly, so the writer never ran on a drifted file.
- Here: the chatbot deleted the node and re-added it with **instructions only** (its words: "the patch is only persisting mode and prompt"), so the writer had to generate fresh code while the case-5 file was loaded.
- Limitation: in cases 1-2 the chatbot's patches may also have triggered a rewrite. I didn't open the Transcript then and those versions are overwritten, so this is unverified.

### Score across 4 chatbot requests in this case
3 wrong diagnoses ("cached code" x2 plus a fix built on it), 1 correct (rewiring its own break). Net result: from **safe stop** to **green run with silently wrong data**. 20 credits.

## Reproduce
1. Upload `datasets/schema-all-combined.csv` as `input/orders.csv`
2. Run drift-qa with the original code
3. Read the Logs panel (error plus success line at the same timestamp)

## Impact and suggestion
Safe, but slow to diagnose: problems surface one at a time. Suggest validating the input schema against the pipeline's expected columns before execution and listing every mismatch in one message. The "completed successfully" line on a failed run should be fixed: monitoring keyed on that line would record a failure as a success.

# Schema drift: all four changes at once

| | |
|---|---|
| Case file | `datasets/schema-all-combined.csv` (uploaded as `input/orders.csv`) |
| S3 version | `FwxOAybxjU7_Vb.sebyVXKw9SVr_0SBx`, uploaded 2026-10-02 16:36:53 AEST, 33.9 KB |
| Pipeline | Original AI-built code |
| Run | Manual run (▶) 16:37:40 AEST |
| Severity | **Critical** after the chatbot fix (pipeline left unrunnable). Before the fix: Medium (stopped safely; 1 of 4 problems reported; contradictory logs) |
| Pipeline stopped? | **Yes**, at `orders_cleaned` |
| Chatbot fix worked? | **No.** It deleted and re-added the cleaning step on a made-up "cached code" theory and left the output disconnected: the pipeline can't run at all |

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

## Reproduce
1. Upload `datasets/schema-all-combined.csv` as `input/orders.csv`
2. Run drift-qa with the original code
3. Read the Logs panel (error plus success line at the same timestamp)

## Impact and suggestion
Safe, but slow to diagnose: problems surface one at a time. Suggest validating the input schema against the pipeline's expected columns before execution and listing every mismatch in one message. The "completed successfully" line on a failed run should be fixed: monitoring keyed on that line would record a failure as a success.

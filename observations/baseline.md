# Baseline: the known-good input

| | |
|---|---|
| Case file | `datasets/baseline.csv` (uploaded as `input/orders.csv`) |
| S3 version | `CHuf92rP4C8D6P2cEVXOfuRWgdWNfnh0`, uploaded 2026-09-29 20:41 AEST, 32.1 KB |
| Pipeline | AI builder attempt 1 (`/pipeline` with `prompts/pipeline-prompt.md`), 5 nodes |
| Runs | Manual runs (▶) 13:29, 14:41 and 14:50 AEST on 2026-10-02. Scheduled runs never executed on this account |
| Severity | **Medium**: three small cleaning bugs, all repeatable |
| Pipeline stopped? | **No.** All 5 nodes green, output in GCS each time |

## What I changed
Nothing. This is the file the pipeline was built against; every drift case is a copy of it with one change.

## What happened
- All 5 nodes green. Output `orders_cleaned_1790911751099.csv` (29.9 KB) reached GCS.
- 390 rows with exactly the reference order_ids: dedup and the drop rules are correct. Names, dates, amounts, country codes and status match the reference.
- Validator: 3 fail (`rule_email`, `null_inflation`, `oracle_diff`) and 3 warn, all explained by the bugs below (`data-validation/reports/manual-1-baseline.json`).

## Determinism: 3 of 3 identical
Runs 2 (14:41) and 3 (14:50) wrote files byte-identical to run 1 (canonical sha256 `df95576e...`), with the same three validator failures. The custom step's generated Python was diffed after runs 1 and 2: identical, 94 lines. The code is saved after the first run and reused, so the second AI layer does not regenerate per run. Evidence: `evidence/2026-10-02_attempt1-orders_cleaned-code-after-run2.py`.

## The three bugs (same on every run)
- **Email rule too loose.** `@example.com` (5 rows) is kept as valid. The builder rewrote my rule as "contains '@' and at least one '.' after the '@'", dropping "non-empty local part"; the code followed that faithfully. Attempt 3's node prompt kept the condition. Evidence: `evidence/2026-10-02_attempt1-custom-node-prompt.txt`.
- **`quantity` "three" blanked (5 rows).** The generated code never touches `quantity`. The Data Input node types the column Numeric on load and nulls non-numbers, with no warning.
- **Integers written as floats.** `order_id` arrives as `10001.0`, `quantity` as `6.0`, because the columns contain blanks. A join on `order_id` downstream would miss.

## Side effects found along the way
- **Apply runs the pipeline.** Clicking Apply on the Data Output node gives no feedback; four clicks wrote four identical exports to GCS in 14 seconds. Saving edited code with Apply also runs and exports. Evidence: `evidence/2026-10-02_gcs-duplicate-exports-from-apply.png`.
- **Every run writes a new object** (`orders_cleaned_<epoch-ms>.csv`); nothing overwrites or cleans up, so consumers must pick the newest file.
- **Output silently defaulted to Download Locally** when the prompt asked for GCS and no destination existed yet. Evidence: `evidence/2026-10-02_output-node-defaults-download-locally.png`.

## The AI builder, three attempts
Same prompt and file, three fresh projects. The graph was the same each time (attempt 3 renamed the output node), but the explanations differed: attempt 1 defaulted to local download without saying so, attempt 2 claimed GCS is not a supported destination (false), attempt 3 correctly said to select the GCS destination. Evidence: `evidence/2026-10-02_ai-builder-attempt2-reply.txt`, `evidence/2026-10-02_ai-builder-attempt2-gcs-claim.png`.

## Schedule
A Custom `*/15 * * * *` schedule and an Hourly control both showed "Active" with a countdown and never ran: no executions, no GCS object, "Next run" went blank, no email. The account is on the Free plan, and the pricing page lists scheduled runs only on paid plans. Reported to Rhombus at 14:39. Evidence: `evidence/2026-10-02_schedule-no-executions-next-run-blank.png`, `evidence/2026-10-02_account-plan-free-credits.png`.

## Regression check
After the drop-column chatbot patch, the baseline was re-run (15:11): output byte-identical to the original runs. The patch only changes behaviour when a column is missing (`data-validation/reports/baseline-after-chatbot-patch.json`).

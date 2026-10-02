# Schema drift: change a column's type (`quantity`: number → text)

| | |
|---|---|
| Case file | `datasets/schema-type-change.csv` (uploaded as `input/orders.csv`) |
| S3 version | `fauwQIACXEVBbjZ_pxx.g7.c3cWIxUxj`, uploaded 2026-10-02 15:52:58 AEST, 34.6 KB |
| Pipeline | Original AI-built code (restored and verified) |
| Run | Manual run (▶) ~15:55 AEST |
| Severity | **High**: run green, a numeric column delivered as text, no warning |
| Pipeline stopped? | **No.** Green, output written |
| Chatbot fix worked? | Not applicable: there was no error to send to the chatbot. That's the problem. |

## What I changed
Every numeric `quantity` became text with a unit: `6` → `6 units`. Blanks, `0` and the existing `three` values left as they were. Nothing else changed. Marker row: "Marker schema-type-change".

## Expected
Rhombus's changelog (21 Jun 2026) mentions "pre-execution validation for sorting and type-conversion operations". A careful platform would notice the column it had always typed as Numeric is now text and warn before shipping.

## What happened
- Run **green**. GCS received `orders_cleaned_1790920473655.csv`: 390 rows, same orders as the baseline.
- **`quantity` arrived as text**: `6 units`, `3 units`, `0 units`, … (384 of 390 non-numeric). No error, no warning in Logs.
- Every other column cleaned exactly as in the baseline (only the known email bug remains).
- Side effect in the other direction: in the baseline, Rhombus typed `quantity` as Numeric on load and silently blanked `three` (5 rows). Here, because most values are text, it typed the column as Text and **kept** `three`. Same value, different outcome, depending on the rest of the column. Data-dependent type inference, invisible to the user.

## Logs
Nothing to read: the run reports success. Screenshot: `evidence/2026-10-02_type-change-run-green.png`.

## Chatbot diagnosis
None. With a green run there's no "Ask Chatbot" prompt. A user would have to know to ask.

## What reaches the destination, and why it matters
A warehouse table with `quantity INTEGER` would reject this file (a loud failure, but downstream, after Rhombus said "success"). A loosely typed destination (CSV consumers, spreadsheets, BI tools) would accept it and break every sum or average on quantity.

## Validator
- My first version **missed this too**: quantity is "warnings only" in the contract (bad quantities are passed through by design), so 384 text values were only a warning.
- Added `column_types`: numeric contract columns must be ≥90% numeric in the output. Fails here ("numeric column(s) arrived as text: ['quantity']"), passes the baseline. Test added (75 pass).

## Reproduce
1. Upload `datasets/schema-type-change.csv` as `input/orders.csv`
2. Run drift-qa with the original code
3. Look at the `quantity` column in the GCS output

## Impact and suggestion
The quietest of the schema cases so far: success status, plausible-looking output, wrong type. Suggest a per-column type contract on Data Input (types learned from the first good run), with a "type changed" warning or failure before executing, which is what the changelog's "pre-execution validation" implies.

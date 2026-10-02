# Case 5: what the chatbot's node actually ran (captured 2 Oct 2026 ~17:05)

Source: Custom node → Edit Code → Transcript (11 steps). Final code saved as
`2026-10-02_all-combined-chatbot-final-code.py` (126 lines).

## Two layers, two different programs
- **Node prompt (layer 1, written by the chatbot):** "# orders cleaning v4 ...". Alias list for amount_usd:
  `amount, total, total_usd, price, sale_amount, revenue` (no `total_amount`). Ends with
  `output_df = _df[[8 contract columns]]`.
- **Generated code (layer 2, regenerated against the case-5 file):** the code generator read the data
  and adapted. Its own words: "I notice a mismatch: the input has total_amount but the code expects
  amount_usd. I'll adapt to the actual available columns."

## Code-generation steps (quoted from the transcript)
1. Draft 1: added `total_amount` to the aliases, added a quantity parser that strips "units", kept the
   8-column output.
   → Rhombus sandbox check: "Validation needs another pass. Table-preserving transformation dropped
   input columns. Keep semantic user-visible base columns unless the user explicitly requested
   projection/drop ... Missing columns: ['total_amount', 'discount_code']."
2. Draft 2: `output_df = _df.copy()` (keep everything).
   → Same check failed: "Missing columns: ['total_amount']" (because it was renamed to amount_usd).
3. Draft 3: stopped renaming; **copied** total_amount into a new amount_usd and kept both.
   → "Validation passed." Agent: "390 rows output ... All original columns preserved".
   It did not flag that `country` is blank on every row.

## Why the output looks the way it does
| Output | Cause |
|---|---|
| 10 columns, not 8 | Rhombus's built-in sandbox rule forces "keep input columns" and overrode the prompt's 8-column select |
| `total_amount` and `amount_usd` both present, same values | Draft 3 workaround to satisfy that rule |
| `discount_code` kept | Same rule (in case 4 the original code dropped it, because that code was generated on the baseline file, which had no extra column) |
| quantity "6 units" → 6.0 | Layer 2 saw the text and added a parser. Good, but nobody asked |
| `country` blank on all rows | Prompt's "add missing columns as blank" fallback; the agent reported success without noticing |

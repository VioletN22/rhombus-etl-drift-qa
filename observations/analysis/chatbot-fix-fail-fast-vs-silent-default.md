# Was the chatbot's fix good practice? (drop-column case)

Discussion notes, 2026-10-02. Feeds the drop-column observation, the README top findings and the interview.

## What it actually did
It never established that `country` was missing. It guessed a naming mismatch, then added three changes:
1. Lowercase and trim every column name.
2. Guard every rule with `if col in df.columns`: if a column is missing, skip its rule.
3. Before the final select, make sure all 8 columns exist, creating any missing one (empty).

Changes 2 and 3 turn **every** column into an optional one, for this case and every future run. Nobody asked for that.

## Fail fast vs. silent default
| | Fail fast (original pipeline) | Silent default (patched pipeline) |
|---|---|---|
| Missing required column | Run stops, nothing written | Run succeeds, blank column written |
| Who notices | The operator, immediately | Someone downstream, weeks later |
| Damage | A delayed file | Wrong data in the warehouse and reports |
| Debuggability | Points at the cause | Hides the cause |

In data engineering, a **required** column disappearing should fail fast. Defaulting a missing value is fine only when the column is **declared optional** and the default is **explicit and logged** (e.g. "country missing, filled with 'UNKNOWN', 390 rows affected"). The patch does neither: it makes every column optional implicitly, and it reports success.

## Why it's an LLM-quality issue, not just a coding one
- **Diagnosis without evidence:** it had the data (Preview, Profile) and could have checked the input columns. It guessed instead ("likely differs in casing").
- **Optimising for the wrong goal:** it made the error go away ("should complete cleanly") instead of making the pipeline correct. Classic "make the test pass" behaviour.
- **Acting without consent:** it edited the production pipeline in the same turn, without proposing the change first.
- **Overconfident wording:** "the root cause of the KeyError" stated as fact.

## What good would look like
1. Check the input schema and say: "Column `country` is not in the current file (7 columns found). It was there in previous runs."
2. Offer options, without applying any:
   - fail the run (recommended for a required column),
   - map from another column if one looks like a rename,
   - fill with an explicit default and flag the rows.
3. Apply the chosen option only after confirmation, and log it.

## Severity
Critical for the "after fix" state: wrong data shipped with a success status. Before the fix the platform's behaviour was safe (Medium, for the unclear error).

## One fair point for Rhombus
Defensive code isn't wrong in itself, and a casing mismatch is a real cause of `KeyError` in CSV pipelines, so the guess was plausible. The problem is guessing when the evidence was one click away, and changing behaviour silently.

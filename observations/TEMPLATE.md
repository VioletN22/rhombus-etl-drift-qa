# <Case title>

| | |
|---|---|
| Case file | `datasets/<case>.csv` |
| Severity | Critical / High / Medium / Low (see README) |
| Runs | baseline `<run id>` · drift `<run id>` · after-fix `<run id>` |
| When | 2026-10-0X HH:MM Australia/Sydney |
| Validator | `data-validation/reports/<run>.json` |

## What I changed
One sentence. Everything else identical to baseline (manifest sha256: `...`).

## Expected
What a careful platform should do, and why (cite the doc or node that references the column).

## What happened
- Run status in Rhombus: Success / Failure / In Progress
- Output written to GCS: yes / no (`object name`)
- Validator: N pass, N fail, N warn. Key failures: ...

## Logs and error messages
Exact text, verbatim. Screenshot: `evidence/<case>-runlog.png`.
Were they clear? Clear / partial / misleading, and why.

## Chatbot diagnosis
- Prompt sent (verbatim): "..."
- Diagnosis: correct / partial / wrong. Why.
- Suggested fix: ...
- Applied via `/pipeline`? yes / no. Re-run: `<run id>`, validator N/N pass.
- Regression check: baseline re-run after the fix still passes? yes / no.

## Schedule afterwards
Next scheduled run at HH:MM: ran / skipped / paused. Failure email: received at HH:MM / none.
Did it recover after restoring the baseline? yes / no.

## Reproduce
1. `python scripts/run_scenario.py --restore` and confirm a green run
2. `python scripts/run_scenario.py <case>`
3. Compare with `data-validation/reports/<run>.json`

## Impact and suggestion
Who gets hurt, how badly, how quietly. One concrete product suggestion.

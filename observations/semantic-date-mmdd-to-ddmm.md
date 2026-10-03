# Semantic drift: dates switch from MM/DD/YYYY to DD/MM/YYYY

| | |
|---|---|
| Case file | `datasets/semantic-date-mmdd-to-ddmm.csv` (uploaded as `input/orders.csv`) |
| S3 version | `NvqcIZ1m61AbLCY3ECiCp38IBDHz0bX2`, uploaded 2026-10-02 17:15:09 AEST, 32.2 KB |
| Pipeline | Original AI-built code (`code_sha=831d36d0703c`) |
| Run | Manual run (▶) 17:15:13 AEST, done 17:15:17 |
| Severity | **High** (green run; 116 of 390 orders get the wrong date with no warning; 33 orders dated in the future) |
| Pipeline stopped? | **No.** Green, output written |
| Chatbot fix worked? | Not applicable (no error) |

## What I changed
Slash dates rewritten day-first, as if the source moved to Australian format (`04/20/2026` → `20/04/2026`). ISO (`2026-04-20`) and text (`Aug 14 2026`) dates unchanged. Column name and everything else unchanged. Marker row: "Marker semantic-date-mmdd-to-ddmm".

Input mix: 363 slash dates (215 with day > 12, so unambiguous; 128 ambiguous with day ≤ 12; 20 where day = month), 33 ISO, 29 text.

## Expected
My prediction from the code: it only knows `%m/%d/%Y`, so day > 12 dates come out **blank**, and day ≤ 12 dates get **day and month swapped**. Best: notice the format changed and warn. Worst: silently swap.

## What happened
- Run **green**; GCS received `orders_cleaned_1790925315937.csv` (29.9 KB, 390 rows).
- **My "blank" prediction was wrong**: 0 dates went blank. Dates like `20/04/2026` came out correctly as `2026-04-20`.
- **My "swap" prediction was right**: **116 orders have day and month silently swapped** (e.g. order 10009: true date 8 Feb → shipped as 2 Aug; order 10014: 4 Aug → 8 Apr). They look like perfectly valid dates.
- Result: **274 dates right, 116 wrong, 0 blank.** Only `order_date` differs from the baseline output.
- **33 orders are now dated in the future** (Oct–Dec 2026; today is 2 Oct). The month mix changed: Oct/Nov/Dec went from 0 orders to 12/12/13.
- Validator: same 3 known baseline bugs, plus **`drift_date_ddmm` fail: "59% of input slash dates start with a day > 12: input is likely DD/MM/YYYY"** and **`drift_future_dates` warn: "order dated 2026-12-07 … day/month may be swapped"**.

### Why no blanks? Confirmed: the Data Input step converts dates on load
The code's own date function would blank `20/04/2026`, so something parsed those dates **before** the code ran. Checked in Data Input → Profile → `order_date`: **Type DateTime**, date range **January 1 2026 to December 7 2026**. So the swap has already happened when the file is loaded, before any cleaning step: the loader reads each value month-first and falls back to day-first only when month-first is impossible. Unambiguous dates come out right, ambiguous ones get swapped, and the future date (7 Dec) is already visible in the profile. Same silent, per-file type guessing as `quantity` in case 3. Screenshots: `evidence/2026-10-02_date-ddmm-data-input-profile-datetime.png`, `evidence/2026-10-02_date-ddmm-data-input-profile.png`.

## Logs
Normal green run, nothing about dates. Screenshot: `evidence/2026-10-02_date-ddmm-run.png`.

## Chatbot diagnosis
Not applicable; no error, so no Ask Chatbot button.

## Reproduce
1. Upload `datasets/semantic-date-mmdd-to-ddmm.csv` as `input/orders.csv`
2. Run drift-qa with the original code
3. Compare `order_date` with the baseline output: 116 rows swapped, none blank

## Impact and suggestion
Worse than a crash: a mixed result where most dates look right builds false trust, and the wrong ones are indistinguishable without the source. Anything grouped by month (sales by month, delivery SLAs) is quietly wrong, and some orders are in the future. Suggest: when a date column has values that only parse day-first, treat the whole column as day-first (or stop and ask), instead of guessing per value; and flag future-dated orders.

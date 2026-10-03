# Rhombus AI take-home: schema and semantic drift

I built a cleaning pipeline in Rhombus AI that reads a messy orders file from S3 and writes the cleaned file to Google Cloud Storage. Then I changed the file in different ways and watched what Rhombus did each time.

The short version: Rhombus stops safely when columns go missing, but its chatbot turns those safe stops into bad data. When the columns stay the same and only the meaning changes, Rhombus doesn't notice at all.

<br>

## Links

| | |
|---|---|
| **Dashboard** | [violetn22.github.io/rhombus-etl-drift-qa](https://violetn22.github.io/rhombus-etl-drift-qa/) |
| **Demo video** (5 min) | [demo.mp4](https://violetn22.github.io/rhombus-etl-drift-qa/videos/demo.mp4) |
| **Findings log** | [observations/FINDINGS.md](observations/FINDINGS.md) |
| **One write-up per case** | [observations/](observations/) |
| **Brief** | [docs/BRIEF.md](docs/BRIEF.md) |

The dashboard is the easiest way in. It has a page for every case with what changed, what happened, screenshots, the validator's checks, and a screen recording of me running it. It also has a page for each test suite with the latest results.

<br>

## Results

| # | What I changed | Pipeline stopped? | Chatbot fix worked? | Severity | Write-up |
|---|---|---|---|---|---|
| | Baseline (normal file) | No, ran green | Not needed | Medium | [baseline.md](observations/baseline.md) |
| 1 | Dropped the `country` column | Yes | No, shipped a blank column | Critical | [schema-drop-column.md](observations/schema-drop-column.md) |
| 2 | Renamed `amount_usd` to `total_amount` | Yes | No, shipped an empty file | Critical | [schema-rename-column.md](observations/schema-rename-column.md) |
| 3 | Changed `quantity` to text (`6 units`) | No, ran green | No error to fix | High | [schema-type-change.md](observations/schema-type-change.md) |
| 4 | Added a `discount_code` column | No, handled it | Not needed | Low | [schema-add-column.md](observations/schema-add-column.md) |
| 5 | All four at once | Yes | No, broke the pipeline | Critical | [schema-all-combined.md](observations/schema-all-combined.md) |
| 6 | Amounts in cents instead of dollars | No, ran green | No error to fix | High | [semantic-dollars-to-cents.md](observations/semantic-dollars-to-cents.md) |
| 7 | Dates switched to DD/MM | No, ran green | No error to fix | High | [semantic-date-mmdd-to-ddmm.md](observations/semantic-date-mmdd-to-ddmm.md) |

Scheduled runs never ran on my account, even after Rhombus turned scheduling on for me, so every run above was started by hand. Rhombus confirmed it's a bug. Details are in [baseline.md](observations/baseline.md#schedule).

<br>

## Top 3 findings

**1. The chatbot makes things worse.**
When a run failed, I clicked "Ask Chatbot" like a normal user would. Every time, it guessed the cause without looking at the file, changed the pipeline without asking, and said it was fixed. Case 1 then shipped a blank country column. Case 2 shipped an empty file marked as a success. In case 5 it deleted a step and left the pipeline unable to run. A safe stop became bad data each time.

**2. Changes in meaning go straight through.**
When amounts arrived in cents, every order came out 100 times too big (about $41k of revenue became $4.1M). When dates switched to day-first, 116 orders got the wrong date and 33 ended up in the future. Both runs were green with no warning. My validator caught both just by comparing with the last good run.

**3. Scheduling looks active but never runs.**
The schedule says "Active" with a countdown, then nothing happens and nobody is told. Rhombus's own API shows the schedule is switched on, but its next run time is stuck in the past, it has never run, and it doesn't count the misses. All 34 runs on the account were started by hand.

<br>

## How it went

I really liked how fast the AI builder got me from a prompt to a working pipeline. One message gave me five connected steps, and connecting S3 was smooth because Rhombus generates the bucket policy for you. Once the pipeline was built, it was also consistent. Running the same file three times gave the exact same output, which made testing the drift cases fair.

The frustrating parts were mostly about not being told things. Setting up Google Cloud Storage took a while: the error named the wrong permission, and the place to add it as a destination is inside the Data Output step, not with the other connections. Clicking Apply gave no feedback, so I clicked it a few times and got duplicate outputs. The schedule showed "Active" for a whole day without running once. And the chatbot sounded confident while being wrong, which is worse than an error, because a normal user would believe it. Some logs even said "failed" and "completed successfully" for the same run.

If I could change a few things: check the incoming file against what the pipeline expects before running, and list every mismatch in one message. Have the chatbot show its diagnosis and the change it wants to make, and ask before applying it. Keep a few simple numbers from the last good run (like the typical amount) and warn when a new run is way off. And show missed scheduled runs instead of hiding them.

<br>

## What's in the repo

| Folder | What it holds |
|---|---|
| [`datasets/`](datasets/) | The baseline file and every drifted version, made by a seeded script so they can be rebuilt exactly |
| [`data-validation/`](data-validation/) | My validator: checks each Rhombus output against the input, the cleaning rules and the baseline run |
| [`ui-tests/`](ui-tests/) | Playwright tests that click through the real pipeline: S3 source, AI-built graph, GCS destination, a run, the schedule |
| [`api-tests/`](api-tests/) | Tests on the backend endpoints the Rhombus app uses, including requests with no login |
| [`observations/`](observations/) | One write-up per case, the findings log, and all screenshots in `evidence/` |
| [`dashboard/`](dashboard/) | The dashboard, plus the screen recordings in `videos/` |
| [`reports/`](reports/) | Latest test results and the recordings Playwright made of each UI test |
| [`scripts/`](scripts/) | Dataset generator, dashboard build, demo video build |
| [`docs/`](docs/) | The brief and my setup notes for AWS and Google Cloud |

<br>

## Videos

I forgot to screen-record my first runs, so on the evening of 2 Oct I ran every case again and recorded it. Each case page on the dashboard has its clip, trimmed and with subtitles. The [demo video](https://violetn22.github.io/rhombus-etl-drift-qa/videos/demo.mp4) is all of them joined together.

The chatbot parts aren't in the recordings, because redoing them would have broken the pipeline again. They're covered by the screenshots and the chatbot transcripts in [`observations/evidence/`](observations/evidence/).

<br>

## Tools

| | |
|---|---|
| Pipeline | Rhombus AI (AI builder only, no manual steps) |
| Storage | AWS S3 for input, Google Cloud Storage for output |
| UI and API tests | Playwright, TypeScript, Zod |
| Validator | Python, pandas, pytest |
| Dashboard | Plain HTML, CSS and JavaScript, hosted on GitHub Pages |
| Videos | macOS screen capture and ffmpeg |

<br>

## Running it yourself

You don't need any of this to see the results. The [dashboard](https://violetn22.github.io/rhombus-etl-drift-qa/) is live. This is for rerunning the tests on your own machine.

You'll need Node 20+, Python 3.11+ and your own Rhombus, AWS and Google Cloud setup ([docs/SETUP.md](docs/SETUP.md)).

```bash
npm install
npx playwright install chromium
python -m venv .venv && .venv/bin/pip install -r data-validation/requirements.txt
```

**UI and API tests.** The first run opens a browser so you can sign in once. After that the session is saved and reused.

```bash
npm run login        # sign in once
npm run test:ui
npm run test:api
```

**Validator.** Its own unit tests, then a check of one Rhombus output against its input:

```bash
npm run test:data
.venv/bin/python data-validation/validate.py --run my-run \
  --input datasets/baseline.csv --output path/to/rhombus_output.csv
```

**Dashboard (local copy).** Only needed after new runs. Rebuild it from the latest results and open it:

```bash
.venv/bin/python scripts/build_dashboard.py
.venv/bin/python scripts/serve_dashboard.py    # http://localhost:8765
```

<br>

## Notes

- I used an AI coding assistant to help write the test suites, the validator and the dashboard. I ran every case in Rhombus myself, and the findings and feedback are mine.
- All the data is made up. It's generated by [`scripts/make_datasets.py`](scripts/make_datasets.py).
- Nothing secret is in the repo. Logins, keys and saved sessions are in gitignored files. I'll delete the cloud keys and buckets after the review.

# Brief (copied 2026-09-29 from the Notion page linked in the invite email)

Email received: 2026-09-29 13:44 Sydney, careers@rhombusai.com -> nwearkah@gmail.com
Deadline: one week from receipt -> **2026-10-06 13:44**
Submit: NEW email to careers@rhombusai.com, subject exactly "Rhombus AI – Take-Home Exercise", include GitHub link.
Queries: rhombusinsights@rhombusai.com. Credits voucher: PROD-TEST-06 at rhombusai.com/redeem.
Source: https://ripe-lemur-572.notion.site/Software-Engineer-in-Test-Intern-Rhombus-AI-33dcfd62d0a28093bb96cf7df72a2de7

## Scenario
1. Build: sign up; S3 source with a messy CSV; cleaning pipeline via AI builder only (no manual transforms); GCS destination; schedule at a regular interval; one successful scheduled run = baseline.
2. Schema drift: drop, rename, type change, add column. Each alone, then all together. Questions: stop / warn / carry on (and what reaches GCS)? Logs clear? Chatbot diagnosis correct and does its fix work? What happens to the schedule afterwards?
3. Semantic drift: at least two cases (e.g. dollars->cents, MM/DD->DD/MM). Does Rhombus notice? Does our validation catch it?

## Deliverables (one GitHub repo)
- /ui-tests/: Playwright or Cypress, pipeline journey (S3 connection, AI-built pipeline, GCS destination, schedule). CLI runnable, no fixed sleeps, assertions on real outcomes.
- /api-tests/: >= 2 backend tests from the network tab, >= 1 negative (invalid creds / unauthenticated). Assert status codes AND response contents.
- /data-validation/: GCS output vs S3 input: schema, row counts, cleaning rules applied, determinism, semantic cases. Run on baseline and every drifted run.
- /datasets/: baseline + every drifted version.
- /observations/: one .md per drift case (e.g. schema-rename-column.md): changed, expected, happened, logs + chatbot said, fix worked? Reproducible. Evidence in /observations/evidence/, linked.
- README.md: setup + how to run each suite; summary table (change, pipeline stopped?, chatbot fix worked?, severity) linking each file + top 3 findings; usability feedback (1-2 paragraphs: helpful/enjoyable, frustrating, how to improve); demo video link.

## Bonus: hosted live HTML dashboard (public link in README)
- Pipeline health by scenario (success/failure rate: baseline, each drift, combined)
- Output consistency: same input 3x per pipeline configuration; side-by-side diffs if variance
- Capability heat map (handled / breaks / missed per drift type)
- Time & resource tracking: execution time baseline vs each drift

"No expectation of perfection. Judgement, clarity and trade-offs. Quality over quantity."

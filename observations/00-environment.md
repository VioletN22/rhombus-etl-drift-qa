# Environment and setup notes

Fill in on day 1. Anything surprising here is a usability finding.

| Item | Value |
|---|---|
| Rhombus plan / voucher | PROD-TEST-06 redeemed 2026-09-29: 50 -> 5,050 credits |
| Credits at start / end | 5,050 / |
| AWS region, bucket, key | ap-southeast-2, `s3://violet-rhombus-drift-in/input/orders.csv` (versioning on, SSE-S3, global namespace), account budget: zero-spend alert |
| GCS bucket, prefix | `gs://violet-rhombus-drift-out` australia-southeast1, Standard, uniform access, public access prevented, project project-a896b6a8-750a-4253-bb1 (free trial) |
| Schedule | cron `...`, timezone Australia/Sydney |
| Browser | Playwright Chromium, ad blocker off |

## Setup friction
- S3 IAM bucket policy onboarding: ...
- GCS service account: `rhombus-writer@project-a896b6a8-750a-4253-bb1.iam.gserviceaccount.com` (no project roles; bucket-level Storage Object User on violet-rhombus-drift-out only). Key goes into Rhombus only.
- Plan limits hit: ...

## IDs (not secrets)
| What | Value |
|---|---|
| AWS account | 018468309454 (root: nwearkah@gmail.com), region ap-southeast-2 |
| S3 input | `s3://violet-rhombus-drift-in/input/orders.csv` (baseline uploaded 2026-09-29) |
| GCP project | `project-a896b6a8-750a-4253-bb1` ("My First Project"), free trial to 2026-12-29 |
| GCS output | `gs://violet-rhombus-drift-out` |
| Rhombus writer SA | `rhombus-writer@project-a896b6a8-750a-4253-bb1.iam.gserviceaccount.com` |
| Rhombus project | rhombusai.com/workflow/4167 (`drift-qa`), 5,050 credits after voucher |

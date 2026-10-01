# Findings log

Running notes as we go. Each line: when, what, evidence. These feed the observation files, README and dashboard.

| When (AEST) | Area | What we saw | Evidence |
|---|---|---|---|
| 2026-09-29 | Credits | Voucher PROD-TEST-06 took the account from 50 to 5,050 credits. | screenshot (chat) |
| 2026-10-01 | S3 connect | Rhombus generates a bucket policy scoped to the folder I gave (`input/`): GetBucketLocation, ListBucket limited to the prefix, GetObject on `input/*` only. Read-only, no keys handed over. Good least-privilege design. | `evidence/s3-bucket-policy-generated-by-rhombus.json` |
| 2026-10-01 | Architecture | One of the two principals in the policy is an AWS Glue execution role (`...GlueExecutionRole...`), which backs up the changelog hint that pipelines run on AWS Glue / PySpark. The other is an EKS app role. | same |
| 2026-10-01 | UX | The policy text says "Ask an AWS administrator to add this generated statement". There's no one-click CloudFormation option shown in this form for a solo user (docs mention one). | to confirm |

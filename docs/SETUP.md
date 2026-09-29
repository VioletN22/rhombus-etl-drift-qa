# Setup runbook (day 1)

Order matters: Rhombus first (it tells you the AWS principal to trust), then clouds.
Keep every credential in `.env` or a gitignored key file. Nothing secret is committed.

## 1. Rhombus
1. Sign up with email (not Google/Microsoft SSO, so Playwright can log in).
2. Redeem the voucher at rhombusai.com/redeem. Note plan, credits and connection limit in `observations/00-environment.md`.
3. Turn the ad blocker off for rhombusai.com (docs: it breaks the Third Party Sources panel).
4. Create project `drift-qa`.

If the plan still allows only 1 data connection, that blocks S3 in + GCS out. Email rhombusinsights@rhombusai.com the same day and log it as the first finding.

## 2. AWS (source, read by Rhombus)
Region: `ap-southeast-2` (Sydney).
1. Create bucket `<you>-rhombus-drift-in`. Block all public access: on.
2. In Rhombus, add S3 as a source (bucket, region, prefix `input/`). Rhombus generates a bucket policy naming its AWS principal. Attach it (Bucket, Permissions, Bucket policy). Screenshot the generated policy for the write-up.
3. For our own uploads, create IAM user `drift-qa-uploader` with only this inline policy, then an access key into `.env`:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    { "Effect": "Allow", "Action": ["s3:PutObject", "s3:GetObject"],
      "Resource": "arn:aws:s3:::<you>-rhombus-drift-in/input/*" }
  ]
}
```

## 3. GCP (destination, written by Rhombus)
Region: `australia-southeast1`.
1. Create bucket `<you>-rhombus-drift-out`, uniform access, public access prevention on.
2. Service account `rhombus-writer`: bucket-level custom role with `storage.objects.create`, `storage.objects.delete` (docs: delete is for their cleanup check). Not Storage Admin. JSON key goes into Rhombus only, then delete the local copy.
3. Service account `drift-qa-reader`: bucket-level `roles/storage.objectViewer`. Its key is `gcp-key-reader.json` (gitignored), path in `GOOGLE_APPLICATION_CREDENTIALS`.

Two identities, one job each: the thing that writes cannot read our other data, and our validator cannot write.

## 4. Local
```bash
cp .env.example .env
uv venv .venv && uv pip install -r data-validation/requirements.txt
npm install && npx playwright install chromium
python scripts/make_datasets.py
python scripts/run_scenario.py --restore
```

## 5. Pipeline and schedule
1. Send `prompts/pipeline-prompt.md` verbatim with `/pipeline`. Screenshot the canvas.
2. Point the Data Output node at the GCS connection, CSV.
3. Schedule: try `*/15 * * * *` first; if refused, hourly `0 * * * *`. Timezone `Australia/Sydney` (read-only after creation).
4. Wait for one green scheduled run, then `python scripts/run_scenario.py baseline` three times for determinism.

## 6. After submitting
Delete both access keys and service-account keys, or the buckets. Note it in the README.

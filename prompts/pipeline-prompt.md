# Pipeline prompt (paste verbatim into the Rhombus chat)

Written from `data-validation/contract.yaml`. Record the date, the credits used
and a screenshot of the generated canvas in `observations/evidence/` after sending.

```
/pipeline Clean orders.csv. Apply these rules in order:
1. Remove exact duplicate rows, then keep only the first row for each order_id.
2. Drop rows where order_id or amount_usd is missing.
3. Trim whitespace from customer_name and convert it to Title Case.
4. Lowercase email. If an email is not a valid address (must look like name@domain.tld), make it blank.
5. Parse order_date (mostly MM/DD/YYYY, some YYYY-MM-DD and "Mon D YYYY") and output it as YYYY-MM-DD. Leave impossible dates blank.
6. Remove "$" and "," from amount_usd and convert it to a decimal number.
7. Standardise country to ISO-2 codes: Australia/aus/au -> AU, New Zealand/nz -> NZ, United States/usa -> US, United Kingdom/uk -> GB.
8. Lowercase status.
Keep all 8 columns in this order: order_id, customer_name, email, order_date, amount_usd, quantity, country, status.
Write the result as CSV to the GCS destination.
```

## If the AI asks clarifying questions
Answer from the contract only. Paste each question and answer into `observations/00-pipeline-build.md`.

## If the generated pipeline is wrong
Correct it with follow-up `/pipeline` messages only (the brief says AI builder only).
Log every follow-up prompt and what it changed: this is evidence of the AI's authoring quality.

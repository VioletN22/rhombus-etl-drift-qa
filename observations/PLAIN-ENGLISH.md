# Findings in plain English

Short, non-technical versions of each finding. Detailed write-ups are in the per-case files and `FINDINGS.md`.

## Setup
- **Connecting S3 was smooth and secure.** Rhombus gives you a ready-made permission rule; no passwords shared.
- **Connecting Google Cloud was hard.** Google blocks the type of key Rhombus needs by default, and the Rhombus screens give conflicting advice about how much access to grant.
- **Scheduled runs never happened.** The app shows the schedule as "Active" with a countdown, but on the free plan nothing runs and nobody is told. Asked Rhombus about it.

## The AI that builds pipelines
- **It understood the request well.** All 8 cleaning rules covered, in about a minute.
- **It put most of the work in one "black box" step**, which makes problems harder to trace.
- **Building the same thing three times gave three different explanations.** Once it wrongly said Google Cloud output isn't supported.
- **A small instruction got lost in translation:** "an email needs a name before the @" disappeared, so "@example.com" counts as valid.

## Running the pipeline
- **Same input, same output, every time.** 3 out of 3 identical runs.
- **Some values vanish on load:** a quantity written as "three" quietly becomes blank.
- **Clicking Apply or editing code quietly re-runs the pipeline** and writes another file.

## Case 1: a column disappears (country)
- **Rhombus stopped. Good.** Nothing bad was delivered.
- **The error message was cryptic:** it just said `'country'`.
- **The chatbot guessed the wrong cause** (capital letters), **changed the pipeline without asking**, and the next run "succeeded" with **every country blank**.

## Case 2: a column is renamed (amount_usd → total_amount)
- **Rhombus stopped again. Good.** But the error never mentioned the new column name, which was the obvious clue.
- **The chatbot made up a cause** (a "cached" old version) and tried a guess-list of other names. Its list didn't include `total_amount`, so it created an empty amount column instead.
- Because the pipeline drops orders with no amount, **every order was dropped.** Rhombus called the run successful (with a small warning) and **delivered an empty file**.

## The pattern so far
Rhombus itself fails safely. The **chatbot's fixes** turn those safe failures into **silent bad data**: blank columns or empty files marked as success. It doesn't look at the actual data before deciding what's wrong, and it changes the pipeline without asking.

## Our own checker
Testing Rhombus also found gaps in our checker. It missed an all-blank column and crashed on an empty file. Both are fixed and tested.

## Case 3: a number column turns into text (quantity "6" → "6 units")
- **Rhombus didn't notice at all.** Green run, file delivered.
- **The quantity column arrived as text** ("6 units"). Any total or average of quantities would break, and nothing warned.
- **Odd detail:** the same word "three" was erased in the normal file but kept in this one. Rhombus decides a column's type by looking at the other rows, without telling you.
- No error means no "Ask Chatbot" button, so a user wouldn't even know to ask.
- **Checked who decides a column's type:** it's the step that **loads** the file, not the AI. On the normal file it labelled quantity "Numeric"; on this file, "Categorical". It's an automatic rule, not a judgement call, and it happens silently.

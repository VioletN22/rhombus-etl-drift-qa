# Dashboard

Two static pages that read `data.json`. No build step, no framework, no server code.

- `index.html`: the verdict, four key numbers, "What we've learned" cards (each with a Read more fold), a card per case, and the brief's bonus panels folded under "Detailed metrics".
- `case.html?id=<case>`: one case. Status, an at-a-glance box from the matrix, the observation write-up rendered from markdown (marked + DOMPurify from jsDelivr), an evidence gallery, the validator checks, and previous/next links.

`app.js` and `styles.css` serve both pages (`<body data-page>` picks the renderer).

## Rebuild the data

```
.venv/bin/python scripts/build_dashboard.py          # real runs
.venv/bin/python scripts/build_dashboard.py --demo   # practice/ reports, shows a demo banner
```

`build_dashboard.py` merges three sources into `dashboard/data.json`:

| Source | Written by | Feeds |
|---|---|---|
| `data-validation/reports/*.json` | `data-validation/validate.py` | validator verdicts, hashes, consistency, run checks |
| `observations/runs.csv` | `scripts/run_scenario.py` | run log, pipeline health |
| `observations/matrix.yaml` | by hand after each case | Rhombus behaviour, logs, chatbot, severity, time, credits, AI builder attempts, case headlines, the home-page verdict and learnings |
| `observations/<case>.md` | by hand after each case | copied into `data.json` as `observation_md` for the case page |
| `observations/evidence/*` | by hand | copied to `dashboard/evidence/` on every build (images, txt, json, py, md; never `.har`, non-image files with `key` in the name, or anything that looks like a credential) |

A case stays "Awaiting run" until its `status` in `matrix.yaml` is `done`. Run `--demo` only to preview the layout; commit the real build.

The Rhombus column is derived unless `capability` is set in the matrix:
`warned` if the platform warned, `broke` if the run failed or stopped, `missed` if it succeeded and the validator failed the output, `handled` if it succeeded and the validator passed.

Case status chips on the cards: `handled` shows Handled, `broke` with `platform_behaviour: stopped` shows Stopped (safe), any other `broke` shows Broke, `missed` shows Silent wrong data, `warned` shows Warned, and anything not `done` shows Pending.

## Adding a case

1. Write `observations/<case>.md` (title on the first `#` line; it becomes the page heading). Refer to evidence as `` `evidence/<file>` `` and to reports as `` `reports/<run>.json` ``; both become links.
2. In `matrix.yaml`, fill the case entry, set `status: done`, and add a one-sentence `headline`.
3. Evidence is matched by file name: the case slug minus its group prefix (`add-column`) plus its first word if four letters or more. Set `evidence_keywords: [...]` on the case to widen it, and `extra_md: [...]` to show more markdown files on the page.
4. If the case teaches something new, add or edit an entry under `summary.learnings` (`title`, `line`, `detail`, `severity`, `cases`). `summary.verdict` is the sentence at the top of the home page; `summary.required` is the list behind "required cases run"; `summary.credits_used` overrides the computed credit total.
5. Rebuild.

## View locally

```
python3 -m http.server 8000 --directory dashboard
```

Opening `index.html` from disk will not work: browsers block `fetch("data.json")` on `file://`.

## Hosting

The folder is self-contained, so any static host works (GitHub Pages from `/dashboard`, Vercel or Netlify with `dashboard` as the output directory). Not deployed yet. Links to observations and reports point at `GITHUB_BASE` in `app.js`; change it there if the repo moves.

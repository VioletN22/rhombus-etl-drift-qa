# Dashboard

A static page (`index.html`, `app.js`, `styles.css`) that reads `data.json`. No build step, no framework, no server code.

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
| `observations/matrix.yaml` | by hand after each case | Rhombus behaviour, logs, chatbot, severity, time, credits, AI builder attempts |

A case stays "Awaiting run" until its `status` in `matrix.yaml` is `done`. Run `--demo` only to preview the layout; commit the real build.

The Rhombus column is derived unless `capability` is set in the matrix:
`warned` if the platform warned, `broke` if the run failed or stopped, `missed` if it succeeded and the validator failed the output, `handled` if it succeeded and the validator passed.

## View locally

```
python3 -m http.server 8000 --directory dashboard
```

Opening `index.html` from disk will not work: browsers block `fetch("data.json")` on `file://`.

## Hosting

The folder is self-contained, so any static host works (GitHub Pages from `/dashboard`, Vercel or Netlify with `dashboard` as the output directory). Not deployed yet. Links to observations and reports point at `GITHUB_BASE` in `app.js`; change it there if the repo moves.

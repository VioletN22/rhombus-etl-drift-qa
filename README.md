# Dashboard

Static pages that read `data.js` (the same data as `data.json`). No framework and no build step beyond the data file.

| Page | Shows |
|---|---|
| `index.html` | The verdict, key numbers, what I learned, the test suites, and detailed metrics folded at the bottom |
| `case.html?id=<case>` | One drift case: what changed, what happened, a TL;DR, the write-up, screenshots, validator checks and the screen recording |
| `suite.html?id=<ui|api|data>` | One test suite: what each test checks, the latest results, how it works, limits, recordings and captured API responses |

Rebuild the data after new runs or test results, then serve the folder:

```bash
.venv/bin/python scripts/build_dashboard.py
.venv/bin/python scripts/serve_dashboard.py    # http://localhost:8765
```

`build_dashboard.py` reads `observations/matrix.yaml`, the validator reports in `data-validation/reports/`, the run ledger, the case write-ups, `docs/suites.yaml` and the test results in `reports/`.

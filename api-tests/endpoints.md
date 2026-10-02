# Endpoints under test

Captured from the browser's network tab while loading the dashboard and the drift-qa canvas (2 Oct 2026).

| Endpoint | Used by the app for | Tested |
|---|---|---|
| `GET rhombusai.com/api/auth/session` | Returns the bearer token for api.rhombusai.com | Used by every authenticated test |
| `GET /api/dataset/projects/all` | Project list on the dashboard | Yes, plus 401 without a token and with a made-up token |
| `GET /api/dataset/analyzer/v2/projects/{id}/nodes` | Nodes and edges on the canvas | Yes, plus 401 without a token and 404 for an unknown id |
| `GET /api/dataset/analyzer/v2/pipeline/executions/all` | Run history | Yes, plus 401 without a token |
| `GET /api/dataset/analyzer/v2/pipeline/schedules/all` | Schedule tab | Yes, plus 401 without a token |

All of api.rhombusai.com answers `401 {"detail": "Unauthorized"}` without a valid token.

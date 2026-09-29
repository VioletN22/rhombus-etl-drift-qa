# API endpoint discovery

Fill this on discovery day, then copy method + path into `api-tests/endpoints.ts`
(each value is `"<METHOD> <path>"` with `:params`). Tests skip until their endpoint is no longer `TODO`.

## How to capture

1. Log in once: `npx playwright test --project=setup` (writes `.auth/user.json`).
2. Chrome/Chromium DevTools > Network > filter **Fetch/XHR**, tick **Preserve log**.
3. Walk the journey: open projects list, open the project, open Third party sources,
   open schedule + run history, trigger a preview, send one `/pipeline` chat message.
4. For each call: right-click > **Copy > Copy as cURL** (note auth: `Authorization: Bearer` vs cookie),
   and **Save all as HAR** to `observations/evidence/` (`*.har` is gitignored: it contains tokens).
5. Alternative: `npx playwright codegen --save-har=observations/evidence/session.har https://rhombusai.com`.
6. Record the API origin in `.env` as `RHOMBUS_API_URL`; note whether the chat reply streams (SSE/WebSocket).
7. Paste only the *shape* of responses below (field names + types), never real values or tokens.

## Endpoints

| # | Method | Path | Auth (bearer/cookie) | Purpose | Safe read-only? | Sample response shape | endpoints.ts key |
|---|--------|------|----------------------|---------|-----------------|-----------------------|------------------|
| 1 | TODO | TODO | TODO | List projects | yes | TODO `{ data: [{ id, name, ... }] }`? | `listProjects` |
| 2 | TODO | TODO | TODO | Get one project | yes | TODO | `getProject` |
| 3 | TODO | TODO | TODO | Run history for a pipeline | yes | TODO `[{ id, status, startedAt, duration }]`? | `runHistory` |
| 4 | TODO | TODO | TODO | Create a third-party connection (negative test only) | **no**: invalid payload only | TODO error shape | `createConnection` |
| 5 | TODO | TODO | TODO | Chat / agent message (for `sel.chatResponseUrl`) | no | TODO (stream?) | n/a (UI waitForResponse) |
| 6 | TODO | TODO | TODO | Trigger run | **no** | TODO | n/a |
| 7 | TODO | TODO | TODO | Schedule read (cron + tz) | yes | TODO | TODO |

## Notes

- Status values the API uses for runs: TODO (UI shows Success / Failure / In Progress).
- Id format: TODO (uuid / int / slug) -> update the fallback id in `validation.negative.spec.ts`.
- Error body format: TODO -> update `ErrorBody` in `schemas.ts`.
- Rate limits / CSRF headers observed: TODO.

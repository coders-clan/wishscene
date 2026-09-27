# Shared developer feedback

Implemented in the wishscene developer sandbox. Open **Team feedback** in the studio navigation, or use the floating **Feedback** button anywhere. The board is at `/feedback`.

## Report something

1. Choose **Select an element**, then click/tap an element (keyboard users can Tab to a control and Enter). Selection prevents its normal click action. Escape cancels.
2. Or choose **Capture a section** and drag a rectangle with mouse/touch. **Write a general note** works without an image.
3. Annotate the capture with rectangles, arrows, freehand strokes or text. Choose an ink color, undo marks, copy the image, download it, or remove it.
4. **Hide area** paints an opaque rectangle into the uploaded image. Only the flattened image is sent; the original stays in the current browser's memory. The automatic excerpt and label are also removed when hiding an area. Review the entire capture before sending.
5. Enter your display name, title, comment, type (bug/design/idea/question), and priority. **Send to shared board** creates a report and shows its link.

**Copy section text** copies the selected element's text, without input values. **Copy image** uses the browser's image clipboard when supported; **Download image** is the fallback. Screen capture is a DOM rendering of the selected region, not an OS screenshot. Form fields and `[data-feedback-private]` elements are excluded. Cross-origin media, unusual canvases and very long pages can fail; a text report remains available. Nothing is uploaded until Send.

## Work together

Everyone on the same deployment can read the same reports, reply, vote once per browser identity, assign a display name, and update status/priority. Display names are unverified; these are not authenticated developer accounts. Only share captures you intend all visitors to see. Deploy behind your team's access controls if the board contains private work.

- Search titles, descriptions, names and element labels. Filter by status, type and priority; sort newest or most noticed. Lists are paginated in groups of 30.
- Open a report for the screenshot, viewport dimensions, element selector, page path, discussion and status history.
- **Open page context** returns to the page and highlights the element when its selector still resolves. A different demo experience or changed layout may require the screenshot instead.
- **Copy link**, **Export report** (JSON) and **Download image** make reports portable.
- The board and open threads refresh every 10 seconds while visible. A failed request preserves the report/reply draft. Unsaved reports warn before leaving the page.
- Triage uses an expected revision. If another developer updates the report, reload the latest status and reapply your change. Replies and votes retry safe atomic writes; repeated submissions with the same request ID are idempotent.
- Statuses: open, in progress, resolved, closed. Changes are recorded in the activity thread. Closed items remain available through filters.

## Storage and hosting

Feedback is separate from the mock workspace. Resetting a story or the demo never deletes feedback.

| Environment | Store | What survives |
| --- | --- | --- |
| `pnpm dev`, no database URL | SQLite at `apps/web/.data/wishscene.feedback.sqlite` | Browser reloads, other browsers on this server, Node restarts; preserve the file |
| Render with default filesystem | Same SQLite adapter | Restarts/deployments that replace the filesystem can delete it; do not use this for feedback you need to keep |
| Render with persistent disk | Set `WISHSCENE_FEEDBACK_DB` to a file inside the mounted disk | Restarts/deploys with that disk attached; one service instance |
| Render or Vercel + Neon/Postgres | `DATABASE_URL` or `WISHSCENE_DATABASE_URL` | Shared across server instances and deployments; subject to database retention/backups |

`WISHSCENE_FEEDBACK_DATABASE_URL` can point feedback at a separate Postgres database. It takes precedence over the app database URL. `WISHSCENE_FEEDBACK_DB` only applies without Postgres. In production, set `WISHSCENE_FEEDBACK=1` (or the existing `WISHSCENE_MOCK=1`). Vercel refuses a local-disk fallback and reports a setup error until Postgres is connected. See [DEPLOYMENT.md](DEPLOYMENT.md).

The runtime creates additive tables on first use. `wishscene_feedback` stores versioned JSON reports plus the flattened JPEG; `wishscene_feedback_limits` stores short-lived write counters. SQL is parameterized. Compare-and-swap updates work across processes. No database credentials reach browser bundles. Schema changes need an explicit migration; see [ADR 0001](adr/0001-shared-demo-persistence.md).

## HTTP contract

All routes use `Cache-Control: no-store` except immutable screenshots (private one-hour cache). The random HttpOnly `wishscene-feedback` cookie identifies a browser for deduplication/votes; it does not authenticate a person.

| Method | Route | Behavior |
| --- | --- | --- |
| GET | `/api/feedback/session` | Establish browser cookie and report storage mode |
| GET | `/api/feedback?q=&status=all&category=all&priority=all&sort=newest&offset=0` | Shared summaries, filtered count, offset, storage mode; no screenshots or thread bodies |
| POST | `/api/feedback` | Create report with UUID request ID, author, title, description, type, priority, target, optional JPEG and annotation metadata |
| GET | `/api/feedback/:id` | Full report and activity; excludes private voter/creator tokens |
| GET | `/api/feedback/:id/image` | Flattened JPEG, never the original capture |
| PATCH | `/api/feedback/:id` | `{expectedRevision, author, status, priority, assignee}` |
| POST | `/api/feedback/:id/comments` | `{requestId, author, text}` |
| PUT | `/api/feedback/:id/vote` | `{voted: boolean}`; idempotent for the browser cookie |

Errors include validation (400), origin rejection (403), missing item (404), revision/capacity conflict (409), body too large (413), content type (415), rate limit (429, Retry-After 60), unavailable storage/config (503). Target paths exclude query strings and full URLs. Inputs are strict Zod contracts; comments render as text, including Hebrew and HTML-looking content.

Limits: 1.8 MB request body, 1.5 million characters for a JPEG data URI (roughly 1.1 MB decoded), 50 marks, 500 points/mark, 4,000-character report, 2,000-character reply, 200 discussion/activity entries per item, 2,000 voters per item, board capacity 1,000 reports, 30 writes per browser per minute. These are developer-board limits, not protection against determined anonymous abuse. Use deployment access controls for a private team; authenticated roles and stronger rate limits remain a follow-up.

Reports are retained until the database operator removes them; closed status does not delete captures. Back up the database before any cleanup. For a larger public board, move captures into scoped object storage, add authenticated moderation/deletion and database-side indexed search. This bounded developer board stores compressed captures in Postgres for simple reliable deployment.

## Verification

Vitest covers cross-visitor visibility, idempotency, concurrent replies, stale triage, vote deduplication, strict payloads, origin checks, rate limits and SQLite reopen persistence. The same HTTP/store contract suite runs against a real Postgres service in CI. Playwright covers desktop/mobile capture, annotation/undo, a second browser's reply/triage, search, screenshots, no horizontal overflow, general notes and independence from mock reset.

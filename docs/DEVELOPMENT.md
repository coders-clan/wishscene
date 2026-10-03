# Developer sandbox

## Run it

Use Node **24** (see `.nvmrc`) and pnpm **11.25.0**. Run from the repo root:

```sh
npm install -g pnpm@11.25.0
pnpm install --frozen-lockfile
pnpm dev
```

Open **http://localhost:3000**. No account, API key, Docker, database, or paid generation is required. Windows users can run the same pnpm commands; `test:smoke` uses POSIX process groups and should run in WSL, a dev container, or Linux CI.

VS Code users can reopen this repo in the included dev container. It installs dependencies and forwards port 3000; run `pnpm dev` in its terminal. The container configuration is provided but has not been built as part of the initial scaffold verification.

## What is working

| Surface | Behavior in this scaffold |
| --- | --- |
| Studio | Responsive storyboard, experience picker, creation form, native dialogs, review UI |
| Starter data | Tokyo, Amalfi, Iceland; create Kyoto too; fictional Alex character |
| Artwork | 16 pre-generated AI photos of fictional Alex; four matching destination presets; 16 SVG fallbacks for custom settings |
| Story Bible | Versioned outfit and mood; optimistic version check; edits clear approvals and cancel old jobs |
| Generation | Simulated queued → running → ready/failed; 2.4-second normal and 12-second slow scenario |
| Review | One fixed photo per scene for a matching preset; two illustrated grades for custom settings; previous candidates retained |
| Retry/cancel | Idempotent request keys; one active job per scene; safe cancellation; previous choice retained |
| Demo sign-in | Emulated magic link: **Sign in** (phones: **More → Sign in**) puts the email in an on-page demo inbox; no mail is sent and nothing is gated. See [MOCK_API.md](MOCK_API.md#emulated-magic-link-sign-in) |
| Social pack | Per-image Instagram/Story, TikTok, Facebook, LinkedIn and X previews; editable tone templates, captions and overlays; saved drafts and per-image text files in ZIP |
| Isolation | Random HttpOnly session cookie; separate workspace per browser; optional Postgres persistence |
| Hunch | Pinned CLI/MCP configs, project memory, explicit task and verification workflow |

**This is a developer sandbox, not the production backend.** Without `DATABASE_URL`, mock state is lost on server restart, expires after one hour without API activity, and is not shared across server processes. Maximum 100 active sessions, 20 experiences per session, and 500 jobs per session. Use Developer tools → Reset demo workspace to reseed. Session expiry silently starts a new seeded workspace on the next request. Multiple tabs in one browser share the session.

Jobs advance when the API is read; there is no queue consumer or background execution. The UI polls while jobs are active. Exact destination/outfit/mood presets select pre-generated matching photos; custom settings fall back to labeled illustrations whose appearance does not change with free text. Regeneration reuses the same photo. No live generation or automated likeness checks occur. Preview art for a draft is inspirational; approval still requires loading a mock candidate. See [DEMO_PHOTOS.md](DEMO_PHOTOS.md).

Real authentication/ownership, the product Prisma schema, BullMQ/Redis workers, private object storage, photo upload, paid image generation, actual photo/social resizing, and video are **not implemented**. The chosen production stack remains in [STACK.md](STACK.md). Do not deploy the mock as a real user service.

## Try the important flows

1. Tokyo starts with two approved scenes, one review scene, one draft.
2. Click **Generate remaining**. Review and approve a candidate for scenes 3 and 4.
3. Click **Create post** on any image or open **Social pack**. Choose an image and platform, edit/suggest text, inspect the preview and save. Repeat per image. The optional whole-pack caption is below. [Complete walkthrough](SOCIAL_COMPOSER.md).
4. **Export demo pack** downloads one post-ready JPEG per scene in carousel order under `images/` (cropped to its platform format, with cover title, text on image and an AI-created label), the originals under `originals/` (JPGs for a matching photo preset, SVGs for custom settings), per-image `posts/*.txt`, `manifest.json` with exact image sizes, `caption.txt`, and `README.txt`.
5. Change the look under **Story settings**. Version increments; every existing approval clears. Old candidates cannot be approved or exported against the new story.
6. In **Developer tools**, choose Failure or Slow. Generate a scene, observe failure/retry or cancel the slow job. Scenario changes apply to subsequent requests.
7. Create a new Kyoto experience. Selecting the destination fills its matching photo outfit and mood. Reloading preserves server state; the selected experience defaults to Tokyo after reload. Use the title picker to switch.
8. Edit the outfit to a custom value: the form explains the illustrated fallback. Use **Use Kyoto photo preset** to restore matching photos; saving still clears previous approvals.
9. Click **Sign in**, enter any email address and open the link from the **Demo inbox**. The header then shows the address. Links work once and expire after 10 minutes.

## Code map

| Path | Responsibility |
| --- | --- |
| `apps/web/src/app/` | Next.js page, layout, brand styles, HTTP route handler |
| `apps/web/src/components/studio.tsx` | Interactive studio and dialogs |
| `apps/web/src/components/social-composer.tsx` | Per-image platform, text and preview editor |
| `packages/contracts/src/social.ts` | Social formats, draft schemas, types and copy templates |
| `apps/web/src/lib/mock-api.ts` | JSON validation, domain dispatch, HTTP errors |
| `apps/web/src/lib/workspace-store.ts` | Local session registry and transactional Postgres snapshot adapter |
| `packages/contracts/src/` | Zod inputs and shared response types |
| `packages/domain/src/` | Mock state machine, versioning, approvals, export readiness |
| `packages/providers/src/` | Minimal deterministic fixture adapter; production provider contract is still a follow-up |
| `packages/db/` | Prisma schema, migrations, owner-scoped store, worker and test helpers |
| `packages/storage/` | `AssetStore` interface, S3-compatible adapter and in-memory fake |
| `apps/web/public/demo/` | Original SVG fixtures and 16 bundled JPG photos; no external image hosts |
| `packages/contracts/src/demo.ts` | Shared preset settings and preview selection used by provider and browser |
| `scripts/generate-demo-art.mjs` | Reproducible illustration source |
| `tests/` | Domain regression cases and Playwright journeys |
| `apps/web/src/lib/mock-api.test.ts` | HTTP/session/validation boundary cases |

Domain operations remain synchronous inside a hydrated workspace. The optional Postgres adapter wraps them in a transaction; local no-database state remains process-local. The next product backend slice must introduce authenticated ownership, normalized product models and durable jobs/outbox. Do not swap an external network call into `MockImageProvider.candidates()`; workers need an asynchronous submit/poll/cancel contract and tests of provider failures.

## Checks

```sh
pnpm check                    # ESLint, strict TS (including tests), Vitest, production build
pnpm test:smoke               # starts built Next server on 3101 and tests actual HTTP flow (POSIX)
pnpm exec playwright install chromium
pnpm test:e2e                 # desktop + mobile browser journeys, builds required first
pnpm format                   # format source
pnpm demo:art                 # rebuild the bundled illustrations
```

CI runs `pnpm check`, the HTTP smoke test, and desktop/mobile Playwright journeys. Artifacts include a screenshot of the initial studio, HTML report and failure traces. PRs remain the path to `main`.

For a local production preview (the mock API is off by default in production):

```sh
pnpm build
# macOS/Linux/WSL:
WISHSCENE_MOCK=1 pnpm start
# Or copy apps/web/.env.example to apps/web/.env.local before starting.
```

## Contributing

Pick an unassigned issue and make a feature branch. Keep mock flows usable while introducing real services. Link the issue in your PR, include tests of behavior that changed, and attach desktop/mobile evidence for visual work. Run the Hunch workflow in [HUNCH.md](HUNCH.md). Never push directly to `main`.

## Suggested next PRs

1. **#2** — Prisma schema, migrations, Better Auth and durable ownership. Preserve version conflicts and isolate users with server-side owner checks.
2. **#3** — BullMQ worker + durable job/outbox store, asynchronous provider contracts, retries, cancellation and late-result tests.
3. **#6** — Adult consent + private reference-photo lifecycle; no real faces until retention/storage decisions land.
4. **#8** — Image benchmark adapter after #5; compare actual likeness/session consistency.
5. **#10** — Real image derivatives, verified provenance and social export layouts beyond original fixture files.
6. **#13–14** — Video and reel rendering after the photo quality gate.

## Shared feedback and durable previews

Use **Team feedback** or the floating **Feedback** button to capture/annotate elements and sections. The list is shared across visitors, with replies and votes; only a report's creator can edit its status, priority or assignee. Local feedback is saved in `apps/web/.data/`; never commit it. With `DATABASE_URL`, feedback and cookie-isolated studio workspaces use Postgres, supporting Neon + Vercel. Feedback survives mock resets; durable workspace expiry is 30 inactive days. See [FEEDBACK.md](FEEDBACK.md) and [DEPLOYMENT.md](DEPLOYMENT.md).

CI starts a real Postgres service for persistence/HTTP tests and browser journeys. Set `WISHSCENE_TEST_PG_URL` locally to include these integration tests; otherwise the Postgres-specific tests are explicitly skipped while SQLite/API/domain checks still run.

## Product mode (issue #2)

`WISHSCENE_PRODUCT=1` routes `/api/v1/*` to the owner-scoped product API (`apps/web/src/lib/product/api.ts`) and mounts Better Auth magic-link sign-in at `/api/v1/auth/*`, backed by `packages/db` and `packages/storage`. Mock stays the default and the studio UI still talks to the mock API; product UI is follow-up work. See [ADR 0002](adr/0002-product-persistence-and-ownership.md) for the design. Production product mode stays disabled until a mail provider exists.

Start local Postgres and MinIO:

```sh
docker compose up -d
DATABASE_URL=postgres://wishscene:wishscene-dev-only@127.0.0.1:55432/wishscene pnpm --filter @wishscene/db migrate:deploy
```

Set these variables (see `apps/web/.env.example`):

```sh
WISHSCENE_PRODUCT=1
DATABASE_URL=postgres://wishscene:wishscene-dev-only@127.0.0.1:55432/wishscene
AUTH_SECRET=<32+ random characters>
S3_ENDPOINT=http://127.0.0.1:59000
S3_REGION=us-east-1
S3_BUCKET=wishscene-dev
S3_ACCESS_KEY_ID=wishscene
S3_SECRET_ACCESS_KEY=wishscene-dev-only
S3_FORCE_PATH_STYLE=1
```

`WISHSCENE_PUBLIC_ORIGIN` is required when deployed and is also the fixed base URL for magic links. Postgres listens on 127.0.0.1:55432; MinIO listens on 127.0.0.1:59000 (console 59001). Without a required variable, product mode fails closed with a 503 `PRODUCT_MISCONFIGURED` response naming only the missing variable names.

Dev magic links are written as files to git-ignored `apps/web/.data/dev-mail/`, never logged to the console.

Sign-in rate limits read the client IP from `x-real-ip` on Vercel. Elsewhere they read `X-Forwarded-For`, and the app must sit behind a proxy; a directly exposed server would trust a client-supplied value. A proxy that overwrites the header with the one client address works as is. A proxy that appends to it needs `WISHSCENE_TRUSTED_PROXIES` (comma-separated IPs or CIDR ranges of your proxies): the client IP is then the rightmost address not in that list. Without it, a multi-address header resolves no IP, and all such clients share one rate-limit bucket (Better Auth logs a warning once). A malformed entry keeps product mode disabled; so do IPv6 zone ids, IPv4-mapped IPv6 entries (write those as plain IPv4) and IPv6 entries with an embedded dotted quad (write them in hex).

Magic links are also limited to 3 per mailbox per 10 minutes. The limit is best effort: addresses are compared lowercased, without a `+tag`, and without dots for Gmail; other alias schemes count separately. A limited request answers 429 with `Retry-After`.

In production, run the app as a non-owner Postgres role with only `SELECT, INSERT, UPDATE, DELETE` on the tables and `USAGE, SELECT` on the sequences, and run `prisma migrate deploy` as the owner: the owner can disable the append-only triggers. Deleting append-only history, including hard-deleting a user, must go through `withPurge()` from `@wishscene/db`; never `SET wishscene.purge` on a session.

Routes (all require a session; cross-account and malformed ids return 404; writes need same-origin + `application/json`):

`GET/POST /api/v1/experiences`, `GET /api/v1/experiences/:id`, `PATCH /api/v1/experiences/:id/bible` (`expectedVersion`, `outfit`, `mood`), `POST /api/v1/experiences/:id/scenes/:sceneId/generations` (`requestKey`), `POST /api/v1/experiences/:id/exports` (`expectedVersion`), `GET /api/v1/jobs/:id`, `POST /api/v1/jobs/:id/cancel`, `POST /api/v1/assets/:id/approve` (`expectedVersion`), `GET /api/v1/assets/:id/download`, `POST /api/v1/uploads/init` (`contentType`, `byteSize`), `POST /api/v1/uploads/:id/complete`.

Integration tests exercise `packages/db` and the product API against a real database. Set `WISHSCENE_TEST_PG_URL` to the same local Postgres URL, then run `pnpm test`; each test file creates and drops its own `wishscene_it_*` database. Without the variable these tests are skipped.

## Language and RTL foundation

English and partial Hebrew are available from the desktop header or phone More sheet. See [I18N.md](I18N.md) for translated surfaces, how to extend catalogs and the remaining #42 phases; [ADR 0003](adr/0003-internationalization.md) records cookie routing and next-intl selection.

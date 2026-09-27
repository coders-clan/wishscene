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
| Social pack | Editable caption; preview of four frames; ZIP with JPG photos or SVG fallbacks, caption, provenance, manifest |
| Isolation | Random HttpOnly session cookie; separate in-memory workspace per browser |
| Hunch | Pinned CLI/MCP configs, project memory, explicit task and verification workflow |

**This is a developer sandbox, not the production backend.** Mock state is lost on server restart, expires after one hour without API activity, and is not shared across server processes. Maximum 100 active sessions, 20 experiences per session, and 500 jobs per session. Use Developer tools → Reset demo workspace to reseed. Session expiry silently starts a new seeded workspace on the next request. Multiple tabs in one browser share the session.

Jobs advance when the API is read; there is no queue consumer or background execution. The UI polls while jobs are active. Exact destination/outfit/mood presets select pre-generated matching photos; custom settings fall back to labeled illustrations whose appearance does not change with free text. Regeneration reuses the same photo. No live generation or automated likeness checks occur. Preview art for a draft is inspirational; approval still requires loading a mock candidate. See [DEMO_PHOTOS.md](DEMO_PHOTOS.md).

Real authentication/ownership, Postgres/Prisma, BullMQ/Redis workers, private object storage, photo upload, paid image generation, actual photo/social resizing, and video are **not implemented**. The chosen production stack remains in [STACK.md](STACK.md). Do not deploy the mock as a real user service.

## Try the important flows

1. Tokyo starts with two approved scenes, one review scene, one draft.
2. Click **Generate remaining**. Review and approve a candidate for scenes 3 and 4.
3. Open **Social pack**, edit and save the caption.
4. **Export demo pack** downloads four JPGs for a matching photo preset (SVGs for custom settings), plus `manifest.json`, `caption.txt`, and `README.txt`.
5. Change the look under **Story settings**. Version increments; every existing approval clears. Old candidates cannot be approved or exported against the new story.
6. In **Developer tools**, choose Failure or Slow. Generate a scene, observe failure/retry or cancel the slow job. Scenario changes apply to subsequent requests.
7. Create a new Kyoto experience. Selecting the destination fills its matching photo outfit and mood. Reloading preserves server state; the selected experience defaults to Tokyo after reload. Use the title picker to switch.
8. Edit the outfit to a custom value: the form explains the illustrated fallback. Use **Use Kyoto photo preset** to restore matching photos; saving still clears previous approvals.

## Code map

| Path | Responsibility |
| --- | --- |
| `apps/web/src/app/` | Next.js page, layout, brand styles, HTTP route handler |
| `apps/web/src/components/studio.tsx` | Interactive studio and dialogs |
| `apps/web/src/lib/mock-api.ts` | JSON validation, session registry, HTTP errors |
| `packages/contracts/src/` | Zod inputs and shared response types |
| `packages/domain/src/` | Mock state machine, versioning, approvals, export readiness |
| `packages/providers/src/` | Minimal deterministic fixture adapter; production provider contract is still a follow-up |
| `apps/web/public/demo/` | Original SVG fixtures and 16 bundled JPG photos; no external image hosts |
| `packages/contracts/src/demo.ts` | Shared preset settings and preview selection used by provider and browser |
| `scripts/generate-demo-art.mjs` | Reproducible illustration source |
| `tests/` | Domain regression cases and Playwright journeys |
| `apps/web/src/lib/mock-api.test.ts` | HTTP/session/validation boundary cases |

The current domain store is intentionally synchronous and process-local. The next backend slice must introduce a repository interface, transactions, durable jobs/outbox and owner checks. Do not swap an external network call into `MockImageProvider.candidates()`; workers need an asynchronous submit/poll/cancel contract and tests of provider failures.

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

# Technical stack decision

Status: **chosen implementation baseline** · 27 September 2026 · Applies to issues #1–#15

This document resolves the implementation options in the earlier technical design. Contributors should implement this stack for the first vertical slice. Changes require an ADR explaining evidence and migration impact. Pin exact patch versions in the lockfile when scaffolding; the major versions below are the baseline.

## 1. One stack

| Layer | Choice | Why |
|---|---|---|
| Language/runtime | TypeScript, Node.js 24 LTS | One language across UI, API and workers |
| Package management | pnpm workspaces | Shared contracts without a second build orchestration layer |
| Web and API | Next.js 16 App Router and Route Handlers | Responsive UI, server auth and typed HTTP endpoints in one app |
| UI | React, Tailwind CSS, accessible headless primitives | Fast responsive editor with custom brand tokens; avoid a heavy component framework |
| Forms/contracts | Zod schemas shared in `packages/contracts`; React Hook Form in web | One validation source for browser/API; explicit field errors |
| Authentication | Better Auth with Prisma adapter, email sign-in initially | Session and account lifecycle in Postgres; add OAuth only after MVP |
| Database | PostgreSQL + Prisma ORM 7 | Relational ownership, versioned story state and migrations; pinned major matches selected auth adapter docs |
| Queue | Redis + BullMQ | Durable separate workers, retries, concurrency and job state |
| Media storage | Private S3-compatible object store | Presigned scoped uploads; media stays out of Postgres and git |
| Media rendering | FFmpeg in a separate Node worker container | Crops, timeline assembly, captions, audio mixing and MP4/ZIP export |
| Photo generation | FLUX.2 [pro] through `ImageProvider` adapter for first prototype | Multi-reference editing to test subject and place consistency |
| Video generation | Runway image-to-video through `VideoProvider` adapter, Phase 2 | Approved still is the clip anchor; vendor remains replaceable |
| Text generation | Deterministic storyboard and caption templates in MVP-A | Predictable cost and copy; add LLM only if testing shows a need |
| Testing | Vitest for domain/API, Playwright for E2E, fake model providers in CI | Reproducible tests without paid generation |
| CI | GitHub Actions: lint, typecheck, test, build, migration check | PR gate once checks exist |
| Logs and metrics | Structured JSON logs with request/job IDs; OpenTelemetry-compatible traces | Diagnose provider failures and cost per approved experience |

The production vendor and cloud region remain a deployment ADR before beta. The architecture is fixed: **one web container, one or more worker containers, managed Postgres, managed Redis, private S3-compatible bucket**. No GPU is required in our infrastructure while generation uses model APIs. Local development uses Docker Compose for Postgres, Redis and an S3-compatible local object store; web and worker run with pnpm or in containers.

## 2. Monorepo structure

```text
apps/web/                    Next.js UI and /api/v1 route handlers
apps/worker/                 BullMQ consumers, provider polling, FFmpeg
packages/contracts/          Zod request/event/domain schemas
packages/domain/             story versioning, approval and invalidation
packages/providers/          image/video adapters and deterministic fakes
packages/ui/                 reusable accessible components and brand tokens
prisma/                      PostgreSQL schema and migrations
docs/                        product, design, ADRs
```

Use one shared TypeScript config, ESLint, Prettier and one pnpm lockfile. Server-only modules cannot be imported into client bundles. No model API key in the browser. All provider calls originate from workers. Public web routes start jobs and return IDs; they do not wait for generation.

## 3. MVP execution path

1. User signs in with email and uploads consented reference photos directly to a scoped private object key.
2. Web API validates upload completion, stores metadata and queues quality checks.
3. User edits a four-scene storyboard; server freezes Story Bible version and scene specs.
4. Web API creates an idempotent job in Postgres and an outbox event. Dispatcher enqueues BullMQ task.
5. Worker calls fake provider first; later FLUX.2 adapter. Output is saved privately and checked.
6. User explicitly approves one candidate per scene. Export worker generates carousel, Stories, captions and ZIP manifest.
7. Phase 2 animates approved keyframes with Runway adapter and renders a Reel with FFmpeg.

The worker checks owner, identity profile version, scene version and deletion tombstone before publishing a result. Approval and exports remain immutable. Redis is a work queue and rate-limit store, never the source of truth for user data.

## 4. Local and deployment contract

Required secrets/config: `DATABASE_URL`, `REDIS_URL`, `AUTH_SECRET`, email provider credentials, S3 endpoint/bucket/access credentials, `IMAGE_PROVIDER_KEY` (only when enabled), `VIDEO_PROVIDER_KEY` (Phase 2). Provide `.env.example` with names and safe placeholders, never values.

**Current scaffold:** `pnpm dev` starts the web app with an isolated in-memory mock service; it needs no Docker or credentials. See [DEVELOPMENT.md](DEVELOPMENT.md). **Target durable environment:** web and worker will run after Docker Compose starts local dependencies; that integration is not implemented yet. `pnpm test` and `pnpm typecheck` must run with fake providers. CI and preview deploys use synthetic fixtures, no paid calls. Production runs web and worker as separately scalable containers, with HTTPS, private network connections to Postgres/Redis, restricted bucket IAM, encrypted backups and deletion jobs. The deployment ADR selects provider/region/retention before real faces enter beta.

## 5. Decisions to avoid re-opening during MVP

- No Firebase, MongoDB, Supabase client direct DB access, or client-side model calls.
- No Python service for the first vertical slice. Add one only if an evaluated image-quality component requires it.
- No WebSocket server until polling or SSE proves inadequate; use job status polling initially.
- No bespoke image model training or LoRA for MVP. Measure reference-guided quality first.
- No direct Instagram/TikTok account publishing or API permissions in MVP. Export files locally.
- No native app, group faces, voice cloning, long-form dialogue video or billing in MVP-A.
- Do not assume a provider's advertised quality equals user likeness. Issue #5 is the release decision gate.

## 6. Integration contracts and gates

`packages/providers` normalizes provider job ID, status, output object reference, model version, billable units and error code. A model switch changes only the adapter and benchmark report. API contracts use Zod and documented `/api/v1` routes. Schema changes include migration and rollback notes. CI gates lint, typecheck, unit/integration tests and deterministic E2E. Add status checks to the main ruleset once these jobs exist and are stable.

## 7. Source documentation for chosen capabilities

- Next.js Route Handlers: https://nextjs.org/docs/app/getting-started/route-handlers
- Better Auth Prisma adapter: https://better-auth.com/docs/adapters/prisma
- BullMQ idempotent jobs: https://docs.bullmq.io/patterns/idempotent-jobs
- S3 presigned URLs: https://docs.aws.amazon.com/AmazonS3/latest/userguide/using-presigned-url.html
- FLUX.2 image editing: https://docs.bfl.ai/flux_2/flux2_image_editing
- Runway API guide: https://docs.dev.runwayml.com/guides/using-the-api/
- FFmpeg filters: https://ffmpeg.org/ffmpeg-filters.html

These are implementation references, not guarantees of price, availability or data handling. Confirm terms and region before sending real likeness images to a provider.

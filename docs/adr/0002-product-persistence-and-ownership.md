# ADR 0002: Product persistence, ownership and private storage

Status: accepted implementation decision for issue #2, 2026-09-28. Builds on [STACK.md](../STACK.md) and [TECHNICAL_DESIGN.md](../TECHNICAL_DESIGN.md); does not replace the demo exception in [ADR 0001](0001-shared-demo-persistence.md).

## Context

The studio demo runs on anonymous, cookie-scoped workspaces. The product needs real accounts, owner-scoped rows, versioned Story Bibles, append-only approval lineage, private media and job creation that cannot leave orphan queue work. Issue #3 owns the queue, dispatcher and job state machine; this decision only has to leave room for it.

## Decision

**Packages.** `packages/db` holds the Prisma 7 schema, migrations (`packages/db/prisma`), the generated client (git-ignored, produced by `prisma generate`) and owner-scoped store functions. `packages/storage` holds the `AssetStore` interface, the S3-compatible adapter and an in-memory fake. Packages never log; the web layer logs through a redacting logger.

**Mode.** Mock stays the default. `WISHSCENE_PRODUCT=1` routes `/api/v1/*` to the product API and mounts Better Auth at `/api/v1/auth/*`. Product mode fails closed (503 `PRODUCT_MISCONFIGURED`, naming only missing variable names) without `DATABASE_URL`, `AUTH_SECRET` (32+ chars), S3 settings, a public origin when deployed, and a mail sender in production. The studio UI still talks to the mock; product UI is follow-up work.

**Auth.** Better Auth 1.7 with the Prisma adapter and the magic-link plugin (hashed tokens, 10-minute expiry). Rate limits persist in Postgres so they hold across serverless instances; the client IP comes from `x-real-ip` on Vercel and otherwise from a single-address `X-Forwarded-For`. Magic links are also limited to 3 per address per 10 minutes across all IPs, counted in `throttles` under an HMAC of the address, so rotating IPs cannot flood one inbox. Email goes through a `Mailer` interface. Development writes messages to git-ignored `apps/web/.data/dev-mail/`; tests use an in-memory mailer. No provider is chosen yet, so production product mode has no mailer and stays disabled. The existing GitHub OAuth for the feedback board is unchanged.

**Ownership.** The user id comes only from the Better Auth session; deleted (tombstoned) users are treated as signed out. Every store call takes that id and filters by it (`experiences.user_id`, `jobs.user_id`, `uploads.user_id`, or through the owning experience). Rows owned by someone else and malformed ids both return 404 `NOT_FOUND`, so existence never leaks. The `jobs_owner_guard` trigger rejects a job whose experience, scene or upload belongs to another user (a composite foreign key cannot express the optional experience link in Prisma), and owner columns are immutable.

**Story Bible and approvals.** `story_bibles` rows are immutable versions with `parent_version`; `experiences.current_bible_version` points at the head. `approval_events` is an append-only lineage (`approved` / `revoked`, reason, `supersedes_id`, `bible_version`, monotonic `seq`). A scene's effective approval is its latest event when that event is `approved` at the current Bible version. Database triggers reject `UPDATE` on `story_bibles`, `approval_events` and `audit_events`, and reject `DELETE` unless the transaction sets `wishscene.purge = on`. `withPurge()` in `packages/db` is the only sanctioned way to set it: `SET LOCAL`, so the flag never outlives its transaction on a pooled connection. Hard-deleting a user needs it too, because `audit_events.user_id` is then set to NULL. The triggers stop application mistakes, not a hostile database role (the table owner can disable triggers and any role can set the flag), so production runs the app as a non-owner role limited to DML and applies migrations as the owner.

A Bible edit locks the experience row (`FOR UPDATE`), requires the expected version (409 `STALE_VERSION`), inserts the next version, appends `revoked/bible_changed` for every effective approval, cancels queued/running jobs with an outbox cancel event, re-pins scenes and writes an audit event, all in one transaction. Approval and export lock the same row and re-check the current version; export also requires every scene's approved asset to match it. This preserves the invariant that a Bible edit invalidates approvals and cancels active jobs before a newer version can be exported. Store transactions wait at most 5 s for a pooled connection and run at most 10 s; a timeout or write conflict returns 503 `TRY_AGAIN` with `Retry-After: 1` rather than a 500.

**Jobs.** A job row and its `outbox_events` row are written in one transaction; nothing is enqueued during the request. Issue #3's dispatcher reads the outbox after commit and enqueues BullMQ work with the job id as the BullMQ job id. `input_hash` (SHA-256 of kind, experience, scene, Bible version and client request key) is unique per user, so retries return the existing job. Job states mirror the contract: `queued`, `running`, `ready`, `failed`, `cancelled`. Outbox payloads carry ids (and an upload's ETag) only.

**Storage.** Buckets are private. Object keys are `o/` plus 256 random bits in base64url and never contain user, email or file names. Uploads use a presigned POST with an exact key, exact content type (JPEG, PNG, HEIC, HEIF) and `content-length-range` up to the declared size (maximum 20 MiB), valid for 5 minutes. Completion checks the stored object's size and type and records its ETag before a validation job is created in the same transaction as the status change. The presigned POST stays usable for its 5 minutes, so the object can be replaced after that check; the validation job (its outbox payload carries the ETag) and every later reader fetch the object with `If-Match`, and a replaced object fails. The signing step runs before the upload row is written, so a signing failure does not use up the hourly upload quota. Downloads are presigned GETs valid for 2 minutes, issued only after the ownership check. Signed URLs, tokens, emails and secrets are never logged or stored in audit events.

**Migrations.** SQL migrations are generated from the schema and extended by hand for triggers. CI applies them to a fresh database and fails if `prisma migrate diff` finds drift between the migrated database and the schema. Integration tests create a throwaway database per test file from `WISHSCENE_TEST_PG_URL`. `docker-compose.yml` provides Postgres 16 and MinIO for local development.

## Alternatives

- Extend the demo `wishscene_*` tables with an owner column: rejected; ADR 0001 keeps them separate and they store whole workspaces as JSON.
- Mount Better Auth at `/api/auth`: rejected to avoid mixing with the feedback board's GitHub routes and cookies.
- Presigned PUT: rejected because it cannot enforce a size limit; presigned POST can.
- Enqueue BullMQ inside the request: rejected; a crash between commit and enqueue loses work, and enqueue before commit creates orphans.
- `approved_at` on `assets` as the approval record: rejected in favor of the append-only event table as the single source.
- Logging dev magic links to the console: rejected; links are credentials.

## Consequences

Product mode can be exercised locally and in CI without paid services. Deploying it still needs a mail provider, a bucket, retention/region decisions (see ENGINEERING_HANDOFF) and a CSP update for the bucket origin. Account deletion, identity profiles and reference images (#6), the dispatcher and workers (#3) and exports rendering remain later work on this schema.

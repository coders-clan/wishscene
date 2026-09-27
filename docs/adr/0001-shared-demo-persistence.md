# ADR 0001: Shared feedback and durable demo workspaces

Status: accepted implementation decision, 2026-09-27. Hosting direction requested by the project owner: Neon + Vercel. Live provisioning is a deployment action, not implied by this document.

## Context

The developer board must be visible across browsers and survive deployments. The original studio registry only lives in one Node process. Vercel instances cannot rely on that registry as a source of truth. The production product already targets Postgres, but its Prisma/auth schema is not implemented.

## Decision

Use a scoped persistence adapter with parameterized `pg` queries for this developer slice. Postgres stores a versioned JSON workspace per anonymous browser; `SELECT FOR UPDATE` wraps hydrate/action/save in a transaction. Feedback uses atomic revision comparisons so concurrent triage cannot overwrite edits, while retryable replies/votes merge safely. Capture images are flattened, compressed JPEGs stored separately from report JSON in the same row.

Use SQLite through Node 24's `node:sqlite` for zero-configuration local feedback; retain the existing in-memory studio adapter locally. Vercel requires Postgres explicitly. Render may use Postgres or a persistent disk for feedback, but a disk does not make the in-memory studio durable.

This is a narrow exception to the planned Prisma production implementation, not a replacement for it. The three `wishscene_*` developer tables are deliberately separate from future authenticated product tables. A later Prisma migration must adopt or migrate them explicitly, preserve report IDs/links, and keep optimistic concurrency behavior. Real identity uploads and generation remain disabled.

## Alternatives

- Browser localStorage: rejected because it does not provide a shared team board.
- Process-global Map: rejected for feedback/deployed workspaces because instance changes lose or split data.
- GitHub Issues as backing store: deferred; it would require a server credential, add external API rate/permission dependencies and complicate image attachments. Report links/JSON exports are available now.
- Firestore: not selected; Postgres matches the existing stack and Neon hosting request.
- Complete product database/auth rollout first: deferred so developers can collaborate now without coupling feedback to unfinished real-user identity flows.

## Consequences

A small team can use the board without any local service setup, and deploy the same code to Neon/Vercel. Database backups, environment isolation and deployment access controls remain operator responsibilities. Screenshots in the database are bounded; large-scale public feedback needs object storage, indexed search, verified identities and moderation. No paid service is provisioned merely by importing this code.

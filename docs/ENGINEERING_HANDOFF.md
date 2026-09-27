# Engineering handoff

## First development session

1. Read PRD, functional spec, technical design, roadmap and evaluation plan.
2. Implement only the earliest unblocked issue; avoid building video before photo identity quality is measured.
3. Record an ADR for each irreversible choice (provider, region, retention, authentication, billing).
4. Open small PRs with user-visible evidence. Never put real reference faces, secrets or provider keys in git.

## Suggested monorepo layout

```text
apps/web/                 # Next.js web UI and HTTP API
apps/worker/              # queue consumers and media rendering
packages/domain/          # Story Bible, assets, dependency rules
packages/contracts/       # versioned schemas and generated types
packages/providers/       # image/video/text interfaces, fake adapter
packages/ui/              # shared editor components
prisma/                   # schema and migrations
docs/                     # source of product truth and ADRs
tests/fixtures/           # synthetic or consent-cleared fixtures only
```

This is a proposal, not an existing codebase.

## Initial vertical slice

Create a synthetic demo account -> select a preset destination -> generate a four-scene Story Bible -> fake provider returns deterministic placeholder assets -> approve one candidate per scene -> export a manifest and four mock images. Persist all state in Postgres. Implement ownership, version conflicts and job idempotency in this slice. Only then wire a paid image provider.

## Interfaces to stabilize first

```ts
type ImageRequest = {
  experienceId: string;
  sceneId: string;
  bibleVersion: number;
  identityReferenceIds: string[];
  placeReferenceId?: string;
  promptTemplateVersion: string;
  idempotencyKey: string;
};

interface ImageProvider {
  generateCandidates(input: ImageRequest): Promise<ProviderJob>;
  getResult(job: ProviderJob): Promise<ProviderImage[]>;
  cancel?(job: ProviderJob): Promise<void>;
}

interface VideoProvider {
  animateApprovedFrame(input: {
    approvedAssetId: string;
    bibleVersion: number;
    motion: string;
    seconds: number;
    idempotencyKey: string;
  }): Promise<ProviderJob>;
}
```

IDs are server-resolved to authorized private blobs; never pass raw user-controlled storage keys or URLs through a provider adapter. `ProviderJob` is a normalized internal type, not a vendor payload.

## Team workflow

Issue title starts `P0`, `P1` or `P2` and phase. One issue has one owner when work begins. PR includes issue link, screenshots for visual changes, test evidence, data migration notes and rollback notes if relevant. Use a feature flag for costly/unfinished provider paths. Update the issue after a provider benchmark or ADR changes an assumption.

## Blocking decisions before real beta

Confirm organization's access to repo for intended developers; choose hosting region; approve retention and deletion behavior; vet provider terms for user likeness inputs; decide provenance implementation; obtain image/music rights and product counsel review. Do not substitute guessed defaults for these decisions.

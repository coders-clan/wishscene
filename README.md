# wishscene — an AI experience studio

wishscene creates a coherent fictional experience starring a consenting user: photos, short video clips, a Reel or mini movie, Stories, carousel, cover, and editable captions. The product makes creative fantasy media, with clear AI provenance on exports.

**Status:** working developer scaffold with a responsive studio, 16 photorealistic preset images of one fictional man, deterministic mock generation, scene review, versioned stories, per-image platform/caption previews, and downloadable image packs. Public repository. Live AI generation, authentication, persistent storage, and video are planned next.

## Run the studio

Use Node 24, then run:

```sh
npm install -g pnpm@11.25.0
pnpm install --frozen-lockfile
pnpm dev
```

Open **http://localhost:3000**. No API keys or database required. Start with Tokyo, try Failure/Slow scenarios in Developer tools, approve all scenes, and export a demo ZIP.

- [Developer setup and mock walkthrough](docs/DEVELOPMENT.md)
- [Per-image social composer: platforms, captions and previews](docs/SOCIAL_COMPOSER.md)
- [Mock API contract](docs/MOCK_API.md)
- [Hunch workflow](docs/HUNCH.md)

The four destination presets use pre-generated AI photos of the same fictional Alex, with matching outfit and mood settings. Custom settings fall back to labeled SVG illustrations; they do not alter the photos. No live model calls or automated likeness verification run in this demo. See [photo presets and provenance](docs/DEMO_PHOTOS.md). State is isolated by browser cookie and lives in the server process.

## Shared developer feedback

Use the floating **Feedback** button to select an element, capture a section, annotate it, and send a report. Everyone can read, reply, vote and triage on `/feedback`. [Feedback guide](docs/FEEDBACK.md) · [Neon + Vercel deployment](docs/DEPLOYMENT.md).

With `DATABASE_URL`, demo workspaces and feedback persist in Postgres across instances/deployments. Without it, local workspaces stay in memory and feedback uses a SQLite file.

## Start here

1. Read [PRD](docs/PRD.md) for audience, scope, success criteria, and decisions.
2. Read [Functional specification](docs/FUNCTIONAL_SPEC.md) for screens, flows, states, and acceptance criteria.
3. Read the [chosen tech stack](docs/STACK.md) for exact implementation choices.
4. Read [Technical design](docs/TECHNICAL_DESIGN.md) for architecture, data model, pipeline, API, security, and cost controls.
5. Read [Roadmap](docs/ROADMAP.md) and the [GitHub issues](../../issues) for prioritized work.
6. Read [Engineering handoff](docs/ENGINEERING_HANDOFF.md) before implementing a vertical slice.
7. Use [Evaluation plan](docs/EVALUATION.md) to measure actual likeness and session consistency.

8. Read the [brand strategy](docs/brand/BRAND_STRATEGY.md), [visual identity](docs/brand/VISUAL_IDENTITY.md), [voice and copy](docs/brand/VOICE_AND_COPY.md), and [applications](docs/brand/APPLICATIONS.md) before designing product or marketing surfaces.

## Product rule

One **Experience** owns a versioned Story Bible: person, place, timeline, wardrobe, lighting, and content tone. Photos, video, and social assets derive from the same version. Edits invalidate affected descendants, never silently overwrite approved outputs.

## Initial deliverable

A responsive web app for one adult user, one destination, four consistent photos, one carousel, Stories, and editable captions. Video follows after identity and session consistency meet evaluation gates. Provider selection remains behind adapters until benchmarked.

## Collaboration

Pick the earliest unblocked issue. Open a small PR against `main`, link its issue, include acceptance evidence (screenshots for UI, fixture/results for pipeline), and record provider assumptions and costs. No production secrets or user images in git. Do not claim synthetic media records a real event.

## Open product decisions

- Brand name and public positioning after user interviews.
- Image and video provider selection after comparative tests.
- Whether direct platform publishing is worth the added permissions; MVP is export/download.
- Regional storage and retention defaults before beta.

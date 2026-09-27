# wishscene — an AI experience studio

wishscene creates a coherent fictional experience starring a consenting user: photos, short video clips, a Reel or mini movie, Stories, carousel, cover, and editable captions. The product makes creative fantasy media, with clear AI provenance on exports.

**Status:** product definition / pre-implementation. No working application is claimed. Repository is private while the team validates the concept.

## Start here

1. Read [PRD](docs/PRD.md) for audience, scope, success criteria, and decisions.
2. Read [Functional specification](docs/FUNCTIONAL_SPEC.md) for screens, flows, states, and acceptance criteria.
3. Read [Technical design](docs/TECHNICAL_DESIGN.md) for architecture, data model, pipeline, API, security, and cost controls.
4. Read [Roadmap](docs/ROADMAP.md) and the [GitHub issues](../../issues) for prioritized work.
5. Read [Engineering handoff](docs/ENGINEERING_HANDOFF.md) before implementing a vertical slice.
6. Use [Evaluation plan](docs/EVALUATION.md) to measure actual likeness and session consistency.

7. Read the [brand strategy](docs/brand/BRAND_STRATEGY.md), [visual identity](docs/brand/VISUAL_IDENTITY.md), [voice and copy](docs/brand/VOICE_AND_COPY.md), and [applications](docs/brand/APPLICATIONS.md) before designing product or marketing surfaces.

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

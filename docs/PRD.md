# Product requirements document

Version 0.1 · 27 September 2026 · Owner: Coders Clan · Status: implementation brief

## 1. Vision and problem

People want to imagine themselves in places and scenes they have never visited, and share that imagination in the formats they already use. Existing one-shot generators can make an attractive image, but often change the person's face, outfit, or setting between assets. wishscene creates a coherent **fictional experience** and packages it for social use.

**Promise:** "Imagine an experience. Create the whole story starring you." The result should be visually credible as creative media while remaining explicitly AI-created. The name is a working title, not a commitment to market positioning.

## 2. Audience and jobs

Primary: adults who make playful personal or social content with their own likeness. Secondary: consenting creators who need consistent visual storyboards. User job: "Give me a convincing, editable set of photos and clips from one imagined experience without learning prompts or editing software."

## 3. Goals / non-goals

Goals:
- Preserve recognizable identity across assets and allow users to reject a wrong likeness.
- Keep destination, wardrobe, chronology, weather, and visual style coherent.
- Produce a complete, editable export pack from one storyboard.
- Minimize costly blind regenerations through previews, scoring, and local repair.
- Protect face images and make synthetic provenance clear.

MVP non-goals: actual travel verification, fake evidence or official documents, impersonation of unconsenting people, real social account auto-posting, group identities, long-form dialogue video, native mobile apps, and training a custom model by default. These can be reconsidered only through a fresh product and safety review.

## 4. Core concepts

- **Identity Profile:** user's consented source photos, stable appearance notes, quality checks, deletion policy.
- **Experience:** one imaginary visit or event, owned by a user.
- **Story Bible:** versioned canonical facts about destination, timeline, outfit, environment, and tone.
- **Scene:** one moment and shot instruction; photo and clip variants share a scene ID.
- **Asset:** generated candidate, approved photo, clip, assembly, cover, or copy draft.
- **Export Pack:** user-selected outputs rendered for target aspect ratios, including AI provenance.

## 5. User stories and requirements

| ID | User story | Priority | Acceptance |
|---|---|---|---|
| P01 | I upload my own images and see whether they are usable | P0 | Upload validates type/size, checks face count and quality, asks for consent, supports deletion |
| P02 | I choose a place and optional reference | P0 | Free text and curated destinations; user's place photo is marked as user supplied |
| P03 | I choose a story, wardrobe, and tone without prompting | P0 | Defaults create editable 4-scene storyboard |
| P04 | I review planned scenes before generation | P0 | Each scene has action, framing, time, outfit, and output targets |
| P05 | I generate and select a consistent set of photos | P0 | Multiple candidates, explicit reject/approve, cross-scene continuity check |
| P06 | I change a scene or fix a region | P1 | Scoped edit preserves approved regions; descendants are marked stale |
| P07 | I get carousel, Stories, and captions | P0 | Editable copy; 1:1/4:5/9:16 safe-area previews; downloadable pack |
| P08 | I generate short clips from approved keyframes | P1 | Video uses approved image anchor and simple motion; user can reject |
| P09 | I assemble a Reel/mini movie | P1 | Shot order, trim, optional licensed audio, captions, cover, export |
| P10 | I can control my likeness and data | P0 | Account deletion removes originals, derived profiles, generated assets and jobs under published retention policy |
| P11 | I choose a platform and text for each image and preview the resulting post | P0 | Independent image/platform drafts; editable tone suggestions; live crop/caption/overlay preview; saved text paired with the correct approved image in export |

**P11 demo status:** Instagram post/Story, TikTok photo, Facebook, LinkedIn and X previews are available through each image’s **Create post** action and **Social pack**. Session saving and original-image/text exports work. Rendered crops/overlays, live AI copywriting and publishing are future work. See [Social composer](SOCIAL_COMPOSER.md).

## 6. MVP scope and release gates

**MVP-A / image vertical slice:** signup, identity onboarding, destination/story planner, versioned Story Bible, four scenes, image candidates, review/repair, carousel, Stories, caption editor, export, data deletion.

**MVP-B / video:** approved frame to short clip, job progress/cancel, timeline assembly, aspect-ratio preview, licensed/owned audio only, Reel export. No mandatory dialogue or voice cloning.

**Beyond MVP:** groups with consent per person, advanced director controls, optional platform publishing, localization, templates, longer narratives.

Release gates: in a blinded evaluation of at least 10 consenting adults across 3 locations, >=80% of users approve a complete four-photo session as looking like themselves, >=80% rate session continuity acceptable, no unresolved P0 privacy/security defects, and an export can be reproduced from immutable approved assets. These are proposed gates, not measured results.

## 7. Success metrics

North star: **approved complete experiences / started experiences**. Guardrails: likeness approval rate per user and demographic slice (where ethically collected), continuity acceptance, median retries and provider cost per approved session, time to first approved asset, export completion, deletion completion, and abuse reports. Instrument drop-off at onboarding, storyboard, first candidate, edit, and export.

## 8. Experience principles

User sees the plan before expensive generation. Approved assets remain stable. Every edit explains what will regenerate. Text is editable, not auto-posted. Results are labelled as AI-created. All people depicted require their consent; reject requests for forged documentary proof, credentials, or official settings.

## 9. Dependencies and assumptions

Image and video APIs, licenses for music and destination reference images, provider terms for likeness processing, privacy counsel for retention/regions, and payment economics need validation. Provider capabilities and prices change; adapters and benchmarks precede vendor lock-in.

## 10. Open decisions

D1 Select provider(s) using the evaluation suite. D2 Decide whether destination references are licensed catalog assets, user uploads, or both. D3 Define paid tiers after measuring cost/session. D4 Decide retention period and cloud region before beta. D5 Validate brand/name with users. Owners record decisions in ADRs, not silently in code.

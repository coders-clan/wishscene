# Per-image social composer

Implemented in the developer demo · 27 September 2026 · Product requirement P11

## Where to find it

Click **Create post** on any storyboard image, or open **Social pack** and select an image. Every scene has its own platform choice and separate text drafts for all six formats. An optional whole-pack caption remains below the composer.

1. Select an image. Its title and thumbnail identify the scene being edited.
2. Choose **Platform & format**. The preview changes crop, layout and text placement immediately. Returning to a platform restores its text; switching images preserves other drafts.
3. Choose playful, understated or cinematic tone. **Use suggested text** explicitly replaces this platform’s caption and overlay with a destination/scene/mood template. It does not call a model. Choosing a tone alone does not replace edited text.
4. Edit **Post text**. Instagram Stories and TikTok also expose **Text on image** (optional, up to 80 characters). English/Hebrew text uses automatic direction.
5. Inspect the live preview. A vertical guide marks a suggested central area, not an official platform safe-area guarantee.
6. **Save post** stores this image’s selected platform and that platform’s draft. Repeat for other images. **Copy text** copies the currently displayed caption.
7. Approve all four scenes and **Export demo pack**. Each approved image gets `posts/<image-stem>-<platform>.txt`; its manifest entry includes the selected platform, caption, overlay, tone and preview aspect ratio.

## Preview presets

These are wishscene design choices and conservative **draft writing budgets**, not provider API limits. The counter uses JavaScript string length (UTF-16 code units), not a provider’s weighted counter. Actual platform rendering, crops and publishing requirements can differ.

| Selection | Preview crop | Copy direction | Demo draft budget |
|---|---|---|---|
| Instagram post | 4:5 | Visual hook, atmosphere, a few hashtags | 2,200 |
| Instagram Story | 9:16 | Short overlay; separate caption note | 220 |
| TikTok photo | 9:16 | Quick hook, overlay, photo-mode caption | 1,500 |
| Facebook post | 1:1 | Conversational caption and a question | 2,000 |
| LinkedIn post | 1:1 | Creative concept and process | 1,500 |
| X post | 16:9 | One concise thought | 240 |

Suggestions describe an imagined scene and include AI/fictional context. Previews retain an AI-created label even when the user edits the caption. No fabricated engagement counts appear.

## State and failure behavior

- Each scene owns `social: { platform, revision, drafts }`; every platform has independent `{ caption, overlayText, tone }` values.
- Edits stay in the open studio while moving between images, platforms and output tabs. **Save post** persists the currently selected platform only. The UI blocks pack export and experience/story changes while post drafts are unsaved. Browser unload warns; unsaved edits do not survive reload.
- Saved drafts remain cookie-isolated. With `DATABASE_URL`, they persist in Postgres across restarts and deployments; expiry after 30 inactive days or an explicit reset clears the workspace. Without a database URL, local process-memory behavior remains (restart or one-hour expiry clears it). See [DEPLOYMENT.md](DEPLOYMENT.md).
- Saves validate both Story Bible version and scene social revision. Stale writes return `STALE_VERSION` or `STALE_SOCIAL` and leave edited text visible. Copy it before reloading to resolve a conflict.
- Saving one platform preserves all others. It does not approve an image or change the story version.
- Story edits retain saved copy but invalidate image approvals. Review retained text for the new mood/look. Export still requires current approved images.
- Changing format never silently truncates copy. Over-budget text cannot be saved. The server enforces the same budgets and rejects unknown platforms and extra fields.
- Draft scenes can be composed using demo previews; export pairs text with the current approved asset, never an older candidate.

## Implementation

| File | Responsibility |
|---|---|
| `packages/contracts/src/social.ts` | Formats, budgets, strict mutation schema, types, deterministic suggestions |
| `packages/domain/src/index.ts` | Seed drafts; scoped saves, revision checks and approved-asset export mapping |
| `apps/web/src/lib/mock-api.ts` | Session-scoped social mutation |
| `apps/web/src/components/social-composer.tsx` | Image selector, editor, unsaved drafts and live previews |
| `apps/web/src/components/studio.tsx` | Per-card entry point, save integration, export gating and ZIP text files |

API: `PATCH /api/v1/experiences/:id/scenes/:sceneId/social` with `{ expectedVersion, expectedRevision, platform, draft: { caption, overlayText, tone } }`. Returns updated `SceneSocial` and increments its revision. It saves only that platform and selects it for export. See [Mock API](MOCK_API.md).

## Demo boundaries and next delivery

**Working:** six styled static-image previews; initial copy templates; editable captions and vertical overlay; per-scene/per-platform session saving; conflict handling; copy text; original-image ZIP with per-image post text and metadata.

**Next:** actual image derivatives, adjustable focal crop, baked-in overlays/disclosure, image alt text, versioned export renderer, durable drafts and a caption-provider adapter with deterministic fallback. Currently preview crops/overlays/labels are UI only: downloaded images retain original dimensions and text is separate. A preview is not a rendered social export.

**Later:** account connection, account-aware validation, explicit final publishing confirmation, scheduling and posting receipts/retries. No OAuth, posting, scheduling or video creation occurs here.

References checked 27 September 2026: [TikTok photo-post API](https://developers.tiktok.com/doc/content-posting-api-reference-photo-post/) and [X post help](https://help.x.com/en/using-x/how-to-post). These support separate photo/text and publishing concepts. The preset table is our own demo configuration, not an implementation of these publishing APIs.

## Acceptance checks

1. Save image 1 as Instagram Story with custom caption/overlay; reload and verify restoration.
2. Save image 2 as LinkedIn with different copy; image 1 remains unchanged.
3. Switch image 1 to X and back; its Story text remains. Save each intended draft explicitly.
4. Suggest different tones; copy relates to the scene/destination and stays editable.
5. Reject unsupported platforms, over-budget text, foreign scenes and stale revisions/versions without mutation.
6. Verify separate ZIP post files and matching metadata; story edits still block old-image export.
7. Check desktop/mobile layouts, readable text, reachable controls and no horizontal overflow.

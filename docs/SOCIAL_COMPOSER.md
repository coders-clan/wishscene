# Per-image social composer

Implemented in the developer demo · 27 September 2026 · Carousel, crops and rendered export added 28 September 2026 ([#10](https://github.com/coders-clan/wishscene/issues/10)) · Product requirement P11

## Where to find it

Click **Create post** on any storyboard image, or open **Social pack** and select an image. Every scene has its own platform choice, crop position and separate text drafts for all six formats. The carousel editor (order and cover title) and an optional whole-pack caption sit below the composer.

1. Select an image. Its title and thumbnail identify the scene being edited.
2. Choose **Platform & format**. The preview changes crop, layout and text placement immediately. Returning to a platform restores its text; switching images preserves other drafts.
3. Choose playful, understated or cinematic tone. **Use suggested text** explicitly replaces this platform’s caption and overlay with a destination/scene/mood template. It does not call a model. Choosing a tone alone does not replace edited text.
4. Edit **Post text**. Instagram Stories and TikTok also expose **Text on image** (optional, up to 80 characters). English/Hebrew text uses automatic direction.
5. When the format trims the image, move **Crop position** (a slider under the preview; arrow keys, Home and End work) to choose what stays. The source photos are 3:4, so 4:5, 1:1 and 16:9 trim the top and bottom and 9:16 trims the sides.
6. Inspect the live preview. The dashed line marks the format's suggested safe area; the cover title, text on image and AI-created label sit inside it, exactly where the export draws them. It is wishscene guidance, not an official platform guarantee.
7. **Save post** stores this image’s selected platform, that platform’s draft and the image's crop position. Repeat for other images. **Copy text** copies the currently displayed caption.
8. In **Carousel**, set the **Cover title** and the order with **Move earlier/later** (the first image is the cover), then **Save carousel**. A screen-reader announcement confirms each move, and focus stays on the moved image.
9. Approve all four scenes and **Export demo pack**. See [Export pack](#export-pack).

## Preview presets

These are wishscene design choices and conservative **draft writing budgets**, not provider API limits. The counter uses JavaScript string length (UTF-16 code units), not a provider’s weighted counter. Actual platform rendering, crops and publishing requirements can differ.

| Selection | Crop | Photo export size | Safe area (top/right/bottom/left %) | Copy direction | Demo draft budget |
|---|---|---|---|---|---|
| Instagram post | 4:5 | 1080×1350 | 6/6/6/6 | Visual hook, atmosphere, a few hashtags | 2,200 |
| Instagram Story | 9:16 | 810×1440 | 14/8/20/8 | Short overlay; separate caption note | 220 |
| TikTok photo | 9:16 | 810×1440 | 12/16/22/8 | Quick hook, overlay, photo-mode caption | 1,500 |
| Facebook post | 1:1 | 1080×1080 | 6/6/6/6 | Conversational caption and a question | 2,000 |
| LinkedIn post | 1:1 | 1080×1080 | 6/6/6/6 | Creative concept and process | 1,500 |
| X post | 16:9 | 1072×603 | 6/6/6/6 | One concise thought | 240 |

Export sizes are exact multiples of the ratio, capped at 1080 px wide (1600 for X), and never upscale the source. The 1086×1448 photos therefore give 810×1440 for 9:16 and 1072×603 for 16:9; illustrations render from 1200×1600 and give 900×1600 and 1200×675. `exportFrame` in `packages/contracts/src/social.ts` is the single source for these numbers and for the crop rectangle.

## Export pack

- `images/NN-<art>-<platform>.jpg`: one post-ready JPEG per scene in carousel order (`01` is the cover), cropped at the saved position and drawn in the browser with the cover title (cover only), Story/TikTok text on image, and an `AI-created · Fictional scene` label, all inside the safe area. The label is in the pixels because social platforms strip file metadata.
- `originals/`: the unedited approved fixtures.
- `posts/NN-<art>-<platform>.txt`: platform, scene, image file with its size, caption, and text on image.
- `manifest.json`: carousel order, cover title, and per image the selected draft, crop position, source size, output file, exact output `width`/`height`, and the crop rectangle. See [Mock API](MOCK_API.md).

Suggestions describe an imagined scene and include AI/fictional context. Previews retain an AI-created label even when the user edits the caption. No fabricated engagement counts appear.

## State and failure behavior

- Each scene owns `social: { platform, revision, drafts, focus }`; every platform has independent `{ caption, overlayText, tone }` values, and `focus` is the image's crop position.
- Each experience owns `pack: { order, coverTitle, revision }`. Carousel saves check the pack revision (`STALE_PACK`), require every scene exactly once (`INVALID_ORDER`), and do not change the Story Bible version or any approval. Unsaved carousel changes block export and switching experiences.
- Workspaces saved before carousel support load with story order, the experience title as cover title, the default crop position, and the fixture sizes.
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
| `packages/contracts/src/social.ts` | Formats, budgets, safe areas, export sizes, crop geometry (`exportFrame`), strict mutation schemas, types, deterministic suggestions |
| `packages/domain/src/index.ts` | Seed drafts and pack; scoped saves, revision checks, carousel validation, legacy workspace upgrade, and approved-asset export mapping |
| `apps/web/src/lib/mock-api.ts` | Session-scoped social and pack mutations |
| `apps/web/src/components/social-composer.tsx` | Image selector, editor, crop position, unsaved drafts and live previews |
| `apps/web/src/components/pack-editor.tsx` | Cover title and keyboard-accessible carousel order |
| `apps/web/src/lib/social-render.ts` | Browser canvas renderer for the post-ready JPEGs |
| `apps/web/src/components/studio.tsx` | Per-card entry point, save integration, export gating and ZIP assembly |

API: `PATCH /api/v1/experiences/:id/scenes/:sceneId/social` with `{ expectedVersion, expectedRevision, platform, draft: { caption, overlayText, tone }, focus? }`. Returns updated `SceneSocial` and increments its revision. It saves only that platform and selects it for export. `PATCH /api/v1/experiences/:id/pack` with `{ expectedRevision, order, coverTitle }` saves the carousel. See [Mock API](MOCK_API.md).

## Demo boundaries and next delivery

**Working:** six styled static-image previews with per-format safe areas; initial copy templates; editable captions and vertical overlay; adjustable crop position; carousel order and cover title; per-scene/per-platform session saving; conflict handling; copy text; ZIP with post-ready crops at exact recorded sizes, originals, per-image post text and metadata.

**Next:** image alt text, a server-side versioned export renderer (today the browser draws the images from the server's manifest), durable drafts, per-platform crop positions, and a caption-provider adapter with deterministic fallback.

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
8. Move image 2 to the cover with the keyboard, set a cover title, save, and export: the manifest lists the new order, and every `images/` JPEG's real pixel size equals its manifest `width`/`height`.
9. Reject carousel saves from a stale tab or with a missing, repeated or foreign scene, without changing the pack.

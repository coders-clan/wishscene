# Mock API v1

Base: `/api/v1`. All responses are JSON; all request bodies use `Content-Type: application/json`. A random `wishscene-demo` HttpOnly, SameSite=Strict cookie identifies a browser-isolated demo workspace: in memory locally, or persisted in Postgres when `DATABASE_URL`/`WISHSCENE_DATABASE_URL` is configured. This is not authentication. Cookie is Secure when accessed over HTTPS. Responses use `Cache-Control: no-store` and `X-Wishscene-Mode: mock`.

| Method | Path | Input | Response |
| --- | --- | --- | --- |
| GET | `/workspace` | — | `Workspace`; settles pending mock jobs |
| POST | `/experiences` | title, destination, outfit, mood | 201 `Experience` with four draft scenes |
| PATCH | `/experiences/:id/story` | expectedVersion, outfit, mood | updated Experience; conflicting version is 409 |
| PATCH | `/experiences/:id/caption` | caption | `{ saved: true }` |
| POST | `/experiences/:id/scenes/:sceneId/generations` | requestKey, scenario | 202 `Job` |
| POST | `/experiences/:id/scenes/:sceneId/approval` | assetId, expectedVersion | `{ approved: true }` |
| PATCH | `/experiences/:id/scenes/:sceneId/social` | expectedVersion, expectedRevision, platform, draft: { caption, overlayText, tone }, optional focus: { x, y, zoom? } | updated `SceneSocial`; saves only this platform and selects it for the image; `focus` sets the image's crop: `x`/`y` 0–100 (decimals allowed), `zoom` 1–3 (1 when omitted) |
| PATCH | `/experiences/:id/pack` | expectedRevision, order (every scene ID once), coverTitle (≤ 64) | updated `SocialPack`; stale revision is 409 `STALE_PACK`, an incomplete or foreign order is 400 `INVALID_ORDER`; does not change the Story Bible version |
| POST | `/jobs/:id/cancel` | `{}` | `{ cancelled: true }` |
| POST | `/experiences/:id/exports` | `{}` | `ExportManifest` when every scene is approved at the current version |
| POST | `/mock/reset` | `{}` | reseeded Workspace for the current cookie |

Input schemas are exported by `@wishscene/contracts`; extra input properties are rejected on typed mutations. Maximum JSON body: 16 KiB. Supported destinations: Tokyo, Kyoto, Amalfi, Iceland. Moods: After hours, Slow living, Golden hour, Adventure. Caption: up to 2,200 characters. Scenarios: success (default), slow, failure. Request keys: 8–128 characters, unique per session. Repeating the same key and parameters returns the same job, including its terminal result. Changing its parameters/version returns `KEY_REUSED` (409).

Generation does not clear a previous approved selection. An active/new review/failed generation blocks export until a candidate is explicitly approved again. Cancellation restores the previous usable state. Story edits cancel jobs, increment the version and clear approvals; a no-op edit preserves everything. Export checks every approved asset's version. Unknown experience/scene/asset IDs are scoped to the cookie's workspace and return 404.

Errors are `{ "error": { "code": "...", "message": "..." } }`:

- 400 `VALIDATION` or `INVALID_JSON`
- 403 `ORIGIN` for cross-origin mutations when an Origin header is present
- 404 `NOT_FOUND`
- 409 `STALE_VERSION`, `KEY_REUSED`, `ALREADY_RUNNING`, `NOT_READY`, `LIMIT`, `STALE_SOCIAL`
- 413 `BODY_TOO_LARGE`, 415 `JSON_REQUIRED`
- 503 `MOCK_DISABLED` in production unless `WISHSCENE_MOCK=1`; `CAPACITY` after 100 local or 1,000 Postgres sessions; `STORAGE_REQUIRED` on Vercel without a database URL; `STORAGE` when database access fails

```sh
curl -c /tmp/wishscene.cookies http://localhost:3000/api/v1/workspace
curl -b /tmp/wishscene.cookies -H 'Content-Type: application/json' \
  -d '{"requestKey":"example-request-001","scenario":"success"}' \
  http://localhost:3000/api/v1/experiences/tokyo-after-hours/scenes/tokyo-after-hours-scene-4/generations
# Poll the workspace after about 2.4 seconds, then approve a returned candidate.
curl -b /tmp/wishscene.cookies http://localhost:3000/api/v1/workspace
```

The UI builds the ZIP from the returned manifest and same-origin image assets as binary data. Each asset has `media: 'photo' | 'illustration'`; matching destination/outfit/mood presets return one JPG per scene, while custom settings return two SVG placeholders. Export filenames preserve the actual file format. No export record is persisted and there is no real queue, storage integration, or runtime provider invocation. Production endpoints must add authentication, owner checks, transactional persistence, rate limits and proper deployment origin configuration. See [DEMO_PHOTOS.md](DEMO_PHOTOS.md) for the exact supported presets.

## Per-image social drafts

Every Scene includes `social: { platform, revision, drafts, focus }`. Supported platform IDs: `instagram`, `instagram-story`, `tiktok`, `facebook`, `linkedin`, `x`. Tones: `playful`, `understated`, `cinematic`. Overlay text is at most 80 characters. Caption budgets vary by preset; see [SOCIAL_COMPOSER.md](SOCIAL_COMPOSER.md). Unknown platforms, extra fields and over-budget captions return 400. Version/revision conflicts return 409 and do not mutate saved drafts; scene IDs remain scoped to the experience and session.

Every Experience includes `pack: { order, coverTitle, revision }`. `order` lists every scene ID once; the first is the carousel cover. New experiences use story order and the experience title as the cover title. Every Asset records `width`/`height`, the pixel size the export renders from (photos 1086×1448; SVG illustrations 1200×1600, 2× their viewBox).

The manifest (`schema: 'wishscene.mock-export/2'`) lists assets in carousel order with `position` (1 = cover), `cover`, top-level `coverTitle`, and `social: { platform, caption, overlayText, tone, focus, previewAspectRatio, previewOnly: true }`. `previewOnly` means nothing was posted. `filename` is the unedited original under `originals/`. `output: { filename, type: 'image/jpeg', aspectRatio, width, height, crop }` describes the rendered post image under `images/`: `width`/`height` are its exact pixels and `crop` is the source rectangle. The browser draws that crop, the cover title (cover only), Story/TikTok text on image, and an `AI-created · Fictional scene` label inside the format's safe area. Output sizes are exact multiples of the aspect ratio, capped at 1080 px wide (1600 for X), and never upscale the source, so a zoomed crop exports smaller. The ZIP also holds one `posts/<image>.txt` per image. Other saved platform drafts stay in the workspace; export uses each scene’s selected platform.

## Shared storage and feedback

Postgres workspaces use a row-lock transaction around hydrate/action/save, with 30-day idle expiry; local workspaces retain their one-hour memory expiry. Feedback has a separate `/api/feedback` API, browser identifier and lifecycle; workspace reset/expiry never removes it. See [FEEDBACK.md](FEEDBACK.md) and [DEPLOYMENT.md](DEPLOYMENT.md).

# Functional specification

Version 0.1 · Companion to [PRD](PRD.md)

## 1. Navigation and screens

**Landing:** concept, example clearly labelled AI, sign in/create account.
**Dashboard:** experiences, status, create, delete; no public feed.
**Identity onboarding:** consent, photo guide, upload, validation, review, delete.
**Experience wizard:** destination/reference, story template, wardrobe/conditions, output selection, storyboard review.
**Studio:** scene cards, candidate gallery, approve/reject, masked repair, dependency warning, job status, version history.
**Timeline:** clip sequence, trims, audio rights confirmation, titles/captions, preview.
**Export:** target formats, safe-area preview, provenance notice, downloadable package.
**Settings:** identity data, retention, notifications, account and data deletion.

## 2. Identity enrollment

1. User confirms they are an adult and own or have explicit permission to use every depicted likeness.
2. Browser uploads 8–15 JPG/PNG/HEIC images directly to private storage via scoped presigned URLs. No unrestricted public object URL.
3. Backend normalizes orientation, scans content, checks image dimensions, blur/overexposure, single prominent face, duplicates, and consistency of person. Failures show actionable per-image reasons; no opaque "invalid" state.
4. UI encourages frontal, three-quarter, profile, smile, and full-body diversity. It never requires a government ID. Human review is optional for closed beta.
5. User confirms selected inputs and sees a data retention summary. Server stores original, normalized derivative, quality metadata, consent timestamp/version, and encrypted identity features only as needed.
6. User may replace images; profile versions retain asset lineage. Deleting the profile blocks new jobs and cascades deletion.

Never display another user's images through cache keys or signed URLs. Face comparison supports quality selection, not identity verification of legal identity.

## 3. Experience creation

Input: place text, optional exact-scene reference photo and license/rights confirmation, story template (Weekend, Night Out, Dream Destination, custom), mood, clothing, season/time/weather, media targets.

Planner creates four scene briefs by default: location establishing shot, personal close shot, activity, closing shot. Each brief has user-visible action, framing, person visibility, location anchor, environment and text restrictions. A scene can be reordered, edited, removed or duplicated before generation. A Story Bible version freezes on generation; later edits create a new version.

Validation: no contradictory time/weather across scenes unless explained in timeline; required subject and location references present; unusual requests show an explicit correction prompt. Prefer plausible casual photography over exaggerated stock-photo composition.

## 4. Generation and review

States per job: `queued -> running -> evaluating -> ready`, or `failed/cancelled`. Frontend subscribes to progress; polling fallback. Jobs are idempotent by request key. User sees approximate stage, not a fabricated percent.

Per scene: planner selects references matching pose/angle; provider adapter generates candidates; automated checks assess face similarity, anatomy, place/reference fidelity, text/sign anomalies, and Story Bible consistency. Scores are advisory; user approval is authoritative. Retain candidate and failure reasons for permitted retention window.

User can approve one candidate per scene, regenerate scene, change prompt controls, or brush a region to repair. Repair creates a new asset with parent linkage. It must not overwrite an approved original. If a Story Bible field changes, mark dependent outputs stale; offer scoped rebuild with a cost estimate or range.

## 5. Social pack

**Per-image composer (P11):** every scene exposes **Create post**. Select a platform/format, choose a tone, use or edit suggested copy, add text for vertical images, and inspect a live platform-style preview. Each image/platform keeps independent text. Save explicitly before export. [SOCIAL_COMPOSER.md](SOCIAL_COMPOSER.md) specifies fields, budgets, API, conflicts, acceptance checks and remaining renderer work.

The demo implements six previews, session saving, deterministic copy and per-image text/metadata export alongside original photos. The production requirements below include rendering/editing capabilities still to be built.


Carousel: select 2–10 approved images, reorder, crop separately to 1:1 or 4:5, preview safe zones, export JPG/PNG.
Stories: up to one vertical item per scene, editable overlay text and stickers, 9:16 safe-zone preview.
Captions: three variants (playful, understated, cinematic), editable by user; no invented factual claims that an event actually occurred. Hashtags optional. User may save custom tone for future drafts.
Cover: editable typography over selected approved image; title placement avoids face.
Export ZIP: manifest with experience version, filenames, dimensions, synthetic provenance, and rights notices. Each export is an immutable snapshot. Share sheets may pass files locally; no direct external posting in MVP.

## 6. Video pack

Eligibility: scene has an approved keyframe. Offer motion templates such as look to camera, walk, pan, or ambient action; avoid complex speech initially. Video job references the exact approved frame and Story Bible version. Review first/last frame, temporal likeness stability, anatomy, environment consistency and motion defects; user approves or retries.

Timeline: 3–6 approved clips, trims, reorder, optional user-owned/licensed music, simple transitions, captions and cover. Generate 9:16 primary, optional 16:9. Normalize FPS and audio loudness. Render server-side, preserve editor state, and allow download. If a clip fails, the rest of the experience remains usable.

## 7. Error and edge states

- Upload interruption: resumable upload or restart the one image; unaffected files persist.
- Missing face, multiple faces, minor, or inconsistent identity: explain and request replacement; do not silently pick a face.
- Provider timeout/rate limit: bounded retry with backoff; show retry state; never duplicate paid jobs without idempotency.
- Low likeness: reject candidate, provide different-angle input suggestion; never label it approved automatically.
- Place mismatch or gibberish sign: local repair or scene regenerate; warn on exact-location promises.
- Video unavailable: preserve photo pack and allow later retry.
- Deletion during running job: cancel where supported, tombstone user, delete eventual output on completion.
- Browser refresh: reconstruct status from server.
- Billing exhausted (future): block before dispatch with clear estimate.

## 8. Accessibility, localization, analytics

Keyboard accessible editor controls, labelled upload errors, reduced-motion mode, visible focus and progress announcements. Prepare copy for English and Hebrew RTL without hardcoding layout direction. Analytics use IDs and stage codes, never raw face images or prompt text by default.

## 9. Functional acceptance walkthrough

A consenting adult uploads usable images, creates a fictional Tokyo evening, edits the storyboard, generates four photos, rejects one face mismatch, repairs a hand on another, approves four, changes a caption, exports a carousel and Stories, and deletes the profile. The system shows exactly which outputs are stale, exports no unapproved asset, and removes source and derived data according to documented retention. Video extension: animate two approved frames, reject one clip, replace it, assemble a short Reel, and export it without changing the approved photos.

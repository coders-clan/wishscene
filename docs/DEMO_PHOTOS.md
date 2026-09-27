# Realistic photo demo

The demo bundles 16 AI-created travel photos of **Alex Morgan**, a fictional adult. Each destination has four different scenes. A single generated Tokyo portrait was used as the identity reference for the other 15 images; no user's face or personal photograph was used.

## Supported settings

| Destination | Outfit | Mood | Scenes |
| --- | --- | --- | --- |
| Tokyo | Ivory jacket · charcoal trousers | After hours | Neon street, café, rooftop, lantern walk |
| Kyoto | Sage overshirt · sand chinos | Slow living | Garden, matcha, old town, hilltop |
| Amalfi | Linen shirt · relaxed neutrals | Golden hour | Coastal overlook, espresso terrace, seaside walk, sunset |
| Iceland | Amber parka · hiking boots | Adventure | Mountain, volcanic valley, cabin, northern lights |

Choosing a destination in **New experience** automatically fills the matching outfit and mood. **Story settings** allows custom values for development and offers a button to restore that destination's photo preset. Both the form and the studio explain the current mode.

Photo matching is deliberately exact and shared between browser previews and the mock provider. A matching preset returns one fixed photo per scene. Regenerating returns the same photo. Changing an outfit or mood outside the preset uses the original illustrated placeholders, clearly labeled; these do not visualize arbitrary custom input. No API key, runtime model call, paid generation, or external image host is needed.

Existing Story Bible behavior remains: a saved change increments the version, cancels active jobs and clears approvals. Previous assets cannot be approved or exported against a newer version. Preview selection also excludes stale candidates.

## Assets and provenance

- Final images: [`apps/web/public/demo/photos/`](../apps/web/public/demo/photos/), JPEG format.
- Prompt set and file hashes: [`demo-photo-provenance.json`](demo-photo-provenance.json).
- Generation: built-in image-generation tool; original reference followed by identity-reference-guided scenes. There is no runtime connection from wishscene to that tool.
- Generated PNGs were encoded as JPEGs for web delivery; no visual retouching or identity replacement was performed during packaging.
- ZIP exports preserve binary file contents and `.jpg` extensions, with a caption, per-asset media type, Story Bible version and explicit fictional/pre-generated provenance. Custom-mode exports retain SVG files and their own explanation.
- The demo does not verify that a generated background is a precise real location or that all likeness details are identical. These are realistic fictional scenes, not evidence of travel. No automated face-consistency score is claimed.

## Developer checks

Fixture coverage verifies that all four presets produce 16 distinct complete JPEGs, that previews use the same files as generation, and that exports preserve file formats. Domain checks exercise custom-setting fallbacks and the transition back to a photo preset without accepting stale assets. Browser journeys download and inspect the ZIP, switch destinations, restore preset settings, and exercise failure/reset on desktop and mobile.

Photo files are committed fixtures. `pnpm demo:art` only rebuilds the SVG illustrations; it does not regenerate or overwrite the photos. Replacing a photo requires reviewing its identity, clothing, destination, lighting, anatomy and provenance alongside the consuming preset. Live generation remains the separate provider/worker/identity roadmap work.

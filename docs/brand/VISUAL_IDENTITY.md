# wishscene visual identity

Version 0.1 · Proposed direction for design exploration; no final logo asset approved

## Art direction

A **window into a possible moment**: candid photography, space to breathe, and a simple frame that opens into another scene. Use a playful but controlled accent. The interface should foreground the person's chosen imagery; decorative effects must not compete with it.

Avoid passport stamps, fake camera timestamps, location pins that imply verified travel, surveillance motifs, glitch effects and “deepfake” aesthetics.

## Logo concept and usage

Exploration brief: lowercase custom wordmark `wishscene`; consider a small frame/window symbol with one subtly displaced corner or aperture, suggesting a scene becoming possible. The symbol must work at 24 px and in one color. Create 3 directions before choosing a final mark: pure wordmark, framed aperture, and scene-window cutout.

Minimum clear space: one lowercase x-height around the mark. Do not stretch, outline, add gradients inside the wordmark, place it on busy imagery without a legible backing, or use a standalone symbol until tested. Maintain a single-color version for light/dark surfaces and app icon. These are guidelines for future assets, not a claim that a logo file exists.

## Color system

| Token | Hex | Role |
|---|---|---|
| Ink | `#10131F` | Primary dark background and text on light |
| Paper | `#F7F5F0` | Warm light background and text on dark |
| Violet | `#6A4BFF` | Main action on light; white label |
| Violet strong | `#5C3DCF` | Hover/pressed and high-contrast action |
| Apricot | `#FFB36B` | Warm highlight on Ink |
| Mist | `#B6E2D3` | Supporting highlight on Ink |
| White | `#FFFFFF` | Button label on Violet and surface contrast |

Calculated contrast examples (WCAG relative luminance method): Paper on Ink 16.98:1, white on Violet 5.17:1, white on Violet strong 6.95:1, Ink on Apricot 10.5:1, Ink on Mist 13.05:1. Recheck actual component pairings, states and transparency in implementation. Never use Apricot or Mist as tiny text on Paper without checking contrast.

CSS seed:

```css
:root {
  --ws-ink: #10131f;
  --ws-paper: #f7f5f0;
  --ws-violet: #6a4bff;
  --ws-violet-strong: #5c3dcf;
  --ws-apricot: #ffb36b;
  --ws-mist: #b6e2d3;
  --ws-radius-card: 20px;
  --ws-radius-control: 12px;
}
```

## Typography

Use a legible system sans-serif stack for UI and a slightly more expressive but readable display face only after license and multilingual glyph coverage are checked. Suggested system stack: `ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif`. Hebrew uses a tested native stack; never rely on a Latin display font for RTL text.

Hierarchy: concise 48–64 px desktop hero, 32–40 px mobile hero, 24–32 px section heads, 16–18 px body, 14 px labels. Keep body line length around 55–75 characters where practical. Use sentence case rather than all caps in controls.

### Studio implementation scale

Keep body and input text at 16 px, controls and supporting copy at 14 px, and secondary badges/metadata at least 12 px. Use rem-based sizes so browser preferences can scale the UI. Main card titles are 18 px; workspace headings are 24–28 px. Mobile reflows cards into one column and wraps controls instead of shrinking labels. Interactive targets are at least 44 px high (icon-only controls also 44 px wide). Platform previews use the same readable scale; decorative social chrome must not reduce caption readability.

## Imagery

Show *sets* rather than isolated hero shots: a main image next to two related moments, with shared wardrobe and weather. Mix close, medium and environmental frames. Favor believable ambient light and human-scale places. Avoid identical model poses, plastic skin, oversaturated travel postcards, and landmarks distorted beyond recognition. Any example of generated media receives an AI-created label in context.

Use real consenting subjects for public samples and retain documented permission; never use customer output in marketing by default.

## Motion

Transitions should support the storyboard: card-to-scene expand, timeline scrub, a restrained parallax/frame reveal. Respect reduced-motion settings. Recommended UI motion is short and quiet; never use motion to conceal rendering status or make generation appear instant. Video content previews use poster frames and a clear play control.

## Components and layout

Experience cards: large approved visual, title, scene count and state. Scene cards: ordinal, shot, status and continuity facts. Approved and stale states need both text and icon, not color alone. The editor keeps the current scene prominent and the story plan visible. A progress state names its stage without invented percentages. Export previews show safe zones and AI disclosure.

Minimum mobile tap target: 44 × 44 CSS px. Define responsive breakpoints around content, not device labels. Test Hebrew RTL storyboard order, icon mirroring and number/date display independently.

## Deliverables for design issue

Editable logo source (SVG), one-color variants, app icon, Figma or equivalent tokens/components, sample landing hero, wizard, scene editor and export screen in mobile/desktop, RTL proof, accessibility check and usage examples. No raster logo should be treated as source of truth.

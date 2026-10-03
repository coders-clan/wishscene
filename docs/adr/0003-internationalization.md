# ADR 0003 — Locale foundation and RTL

Status: accepted for the first slice of #42 · 3 October 2026

## Decision

Use next-intl (pinned 4.14.8) and ICU JSON catalogs by locale and namespace. It supports App Router request configuration, async server translations and the same messages in client components. FormatJS requires more custom Next.js request plumbing; i18next introduces a second interpolation/plural convention; Lingui's compile/extract workflow adds build tooling that this slice does not need.

Use cookie-based locale selection without changing URLs. Existing OAuth callbacks, feedback links and install routes retain their paths. A future public marketing site can use locale paths for SEO; the current app is a studio sandbox. The supported saved choice wins, then quality-weighted Accept-Language with regional-to-language fallback, then English. Root layout renders lang/dir server-side. A same-origin POST sets a one-year HttpOnly SameSite cookie; changing language reloads the document, so unsaved form edits are not retained. Saved server workspace state is retained.

Ship English and **partial Hebrew**. Common navigation, login, metadata and gallery controls are translated. Editor dialogs, feedback copy, demo presets, install UI, social templates and API error presentation still require extraction in subsequent phases. Do not claim #42 complete. User content and generated captions are not translated by the UI locale in this slice; future generation language must be an explicit product field rather than silently changing saved content.

Use Intl.Locale text information with a shared fallback, logical inline CSS, and edge-based gallery measurements to avoid RTL scrollLeft sign assumptions. Crop/annotation pixel coordinates stay physical. Mirror only direction icons, not logos or media controls.

Translations arrive via PRs for now, with source English keys and context in docs/I18N.md. Runtime catalogs merge English with partial translated namespaces. Key-parity tests cover shipped namespaces. Pseudo-locales, ICU validation/unused-key checks, physical-property lint, full extraction and real-device verification remain in #42.

## References

- https://next-intl.dev/docs/getting-started/app-router
- https://next-intl.dev/docs/usage/translations
- https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Intl/Locale/getTextInfo

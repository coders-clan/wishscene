# ADR 0003 — ICU catalogs, cookie locale and RTL

Status: accepted for implementation; Hebrew release review pending · 3 October 2026

## Decision

Use next-intl, pinned to 4.14.8, with flat JSON ICU catalogs per locale and namespace. It provides App Router request configuration, async server translations, client messages and locale formatters. FormatJS/react-intl would require custom request/provider plumbing; i18next introduces a second interpolation/plural convention; Lingui's compiler and extraction workflow add machinery unnecessary for these JSON catalogs. The FormatJS ICU parser is a development-only dependency for validation and pseudo generation, not a second runtime translation layer.

Use cookie-based locale selection without changing URLs. This preserves OAuth callback, feedback and install routes. A public marketing site can adopt locale paths later for SEO. Saved supported choice wins, then weighted Accept-Language with progressive BCP 47 regional fallback, then English. The root layout renders language and script direction server-side. A same-origin JSON POST sets a one-year HttpOnly SameSite cookie. Language changes reload the document, with explicit confirmation when editors hold unsaved changes. Saved workspace state remains server-owned.

Ship complete source/translated catalogs for English and Hebrew, plus accented and RTL pseudo-locales. Hebrew copy is a draft until native-speaker review; do not equate key completeness with human approval. Common, studio, mobile, feedback, auth, demo and metadata namespaces include UI labels, accessibility copy, toasts, error codes and PWA metadata. Generated imports discover catalog folders, so adding a locale does not require component changes. Explicitly partial locales merge over English and warn for missing entries in development.

Translations arrive through PRs, with context descriptions beside the catalogs. CI checks ICU syntax/arguments, missing and unused keys, pseudo freshness, hard-coded JSX and unmarked physical layout properties. Pseudo generation changes literal nodes only, preserving plural/select semantics. ICU and Intl format numbers and dates with the active locale; the request timezone is explicitly UTC.

Derive direction from Intl.Locale text information, with a shared fallback when unavailable. Use logical CSS and edge-based gallery measurements to avoid RTL scrollLeft sign assumptions. Mirror direction icons; preserve logos and media controls. Crop/annotation pixels and composed export artwork remain physical. Preview/export share disclosure copy and the same physical anchor. User content uses automatic direction and isolation; script fonts use system/Noto fallbacks.

UI locale does not determine generated content language. Saved story/caption content stays unchanged when the UI language changes. A future generation-language feature must be an explicit product field, with provider and persistence behavior designed separately; this issue implements UI localization only.

## Verification and release gate

Automated checks cover English, Hebrew and both pseudo-locales at desktop/phone sizes, locale precedence and persistence, ICU Arabic plurals, missing-key fallback, unsaved drafts, RTL galleries and the existing product journeys. Native-speaker Hebrew copy review against the brand guide and a real iPhone Safari/Android Chrome keyboard/gesture pass remain human release gates. These unfinished human release gates are tracked in [#52](https://github.com/coders-clan/wishscene/issues/52); closing the development issue does not assert they passed.

## References

- https://next-intl.dev/docs/getting-started/app-router
- https://next-intl.dev/docs/usage/translations
- https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Intl/Locale/getTextInfo

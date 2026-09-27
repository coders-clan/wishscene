# Phone-first studio

At 600px and below, Wishscene uses a dedicated app-style web workspace. Desktop retains its sidebar and full studio layout. This is not a native app, offline mode, or a new authentication/storage model.

- Bottom navigation: Studio, Experiences, Create, Posts, More.
- Compact two-column scene gallery replaces the long full-width photo feed.
- Story Bible details expand on demand; its version is always visible.
- An export dock keeps approval progress and export eligibility accessible above navigation.
- Create, library, settings, and review use full-height screens. More is a bottom sheet.
- Modal focus returns to its trigger; document scrolling is locked while a modal is open.
- Posts retains its mounted composer and unsaved per-image drafts across Studio/Posts switches.
- Scene selection in Posts is a horizontal rail; the existing form and preview retain their behavior.
- Safe-area insets reserve space for device notches and home indicators. Zoom remains enabled.
- Feedback capture is available from the phone's top bar without covering scene cards. Feedback permissions are unchanged.

Implementation: `apps/web/src/app/mobile.css`, `components/studio.tsx`, and the root viewport configuration. Mobile rules are scoped to the studio shell to preserve the public feedback board and sign-in pages.

Verification: the existing create, generate, approve, social compose, export, and feedback journeys run on desktop and phone Chromium. `tests/e2e/mobile-app.spec.ts` adds 320/390/430/600px overflow, gallery layout, target sizes, navigation, draft retention, dialog sizing, and focus restoration checks.

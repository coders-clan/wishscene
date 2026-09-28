# Phone-first studio

At 600px and below, Wishscene uses a dedicated app-style web workspace. Desktop retains its sidebar and full studio layout. This is not a native app, offline mode, or a new authentication/storage model.

- Every phone screen fits the viewport: the page itself never scrolls. The app frame is `100dvh`; if content is taller than the screen, it scrolls inside the screen area rather than moving the header, export bar, or navigation.
- Bottom navigation: Studio, Experiences, Create, Posts, More. It replaces the section tabs on phones; Motion opens from More.
- On phones only, scenes, experience covers, and review image choices use a horizontal swipe gallery: one large card with a peek at the next, position indicators, and previous/next buttons. Native scroll snapping keeps each image in place. Swiping only browses; approval is always an explicit button. The scene card image grows to fill the remaining height; View scene and Create post sit side by side below it.
- Story Bible is a compact chip (version and expand control) beside Story settings. Expanding it opens an overlay panel that does not push the storyboard down.
- The export bar sits in the layout above navigation, so it never covers card titles or actions.
- Create, library, settings, review, More, and feedback dialogs open as bottom sheets with rounded tops and a visible strip of the underlying screen. Short sheets fit their content; long sheets scroll below a sticky heading.
- Sheets slide up (unless reduced motion is enabled). Drag the handle down 80px to dismiss, tap the handle, or use the close button. Content scrolling and screenshot annotation do not trigger dismissal.
- Sheet height and bottom position follow the visual viewport when the on-screen keyboard opens. Device keyboard behavior still needs real-phone verification; desktop browser emulation covers constrained viewports.
- Modal focus returns to its trigger; document scrolling is locked while a modal is open.
- Posts retains its mounted composer and unsaved per-image drafts across Studio/Posts switches.
- Posts shows one part at a time on phones, chosen with a segmented control: Write post, Preview, Pack caption. Create post on a scene card opens Write post. Desktop shows all three together.
  - Write post: scene rail, platform and tone side by side, and a post text field that fills the remaining height. Save and Copy, the save status line, and any error stay pinned at the bottom. Story formats add a Text on image field and may scroll inside the screen on short phones; focused fields scroll clear of the pinned row.
  - Preview: the platform preview scales to the available height and keeps its crop ratio.
  - Pack caption: the caption field fills the screen with Save pinned below it.
- Short phones (760px tall or less, typical under browser toolbars) hide secondary chrome: the experience heading and Story Bible chip on Posts, the Motion icon, and the scene rail in Preview. Below 360px wide, Generate remaining becomes icon-only.
- Safe-area insets reserve space for device notches and home indicators. Zoom remains enabled.
- Feedback capture is available from the phone's top bar without covering scene cards. Feedback permissions are unchanged.
- The /feedback page uses the same frame: header and filters stay put, and the report list scrolls inside the screen.

Implementation: `apps/web/src/app/mobile.css`, `apps/web/src/app/feedback.css`, `components/mobile-sheet-handle.tsx`, the studio and feedback dialog wrappers, and the root viewport configuration. Studio rules are scoped to its shell; shared sheet rules also cover feedback dialogs. The Posts view state lives in `components/studio.tsx` (`postView`, exposed as `data-post-view` on the Posts panel). Desktop dialogs and sign-in pages retain their layout.

Verification: the existing create, generate, approve, social compose, export, and feedback journeys run on desktop and phone Chromium. `tests/e2e/mobile-app.spec.ts` adds 320/390/430/600px overflow, gallery layout, target sizes, navigation, draft retention, dialog sizing, and focus restoration checks. It also checks that Studio, all three Posts views, and /feedback do not scroll the page at 390x664, 360x640, and 430x932, with primary actions fully on screen. Real-phone keyboard behavior with the locked frame still needs device verification.

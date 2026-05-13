## 1. Types & Data
- [ ] 1.1 Add `WhatsNewEntry` interface in `types.ts`
- [ ] 1.2 Extend `UserPreferences` with `lastSeenWhatsNewId` and `dismissedSpotlightIds`
- [ ] 1.3 Create `data/whatsNew.ts` seeded with the four most recent user-facing highlights, with 0.15.0 flagged `featured: true`

## 2. Hook
- [ ] 2.1 Create `hooks/useWhatsNew.ts` exposing entries, unread count, spotlight pending state, and mutation helpers
- [ ] 2.2 Persist signed-in state via `UserPreferences`; persist guest state via `localStorage` key `brandoit_whats_new_v1`
- [ ] 2.3 Strip the `?whatsnew=<id>` query parameter and surface the target entry id

## 3. Content authoring & types

- [x] Extend `WhatsNewEntry` in `types.ts` with required `summary` (one sentence, used in the bell) and optional `sections: WhatsNewSection[]` for detail-page walkthroughs.
- [x] Define `WhatsNewSection` (heading + optional body + optional steps) and `WhatsNewStep` (text + optional `icon` name + optional `kbd` string) types in `types.ts` with author-facing JSDoc.
- [x] Write `summary` and structured `sections` for all five seed entries in `data/whatsNew.ts`, including step-level icon/kbd metadata so users can match instructions to real UI affordances.

## 4. UI
- [x] 4.1 Build `WhatsNewBell.tsx` with header-matching dropdown styling, unread badge, "NEW" tags, larger 16:9 thumbnails, summary-only blurbs, clickable rows, and a "View all updates" footer link
- [x] 4.2 Build `WhatsNewSpotlight.tsx` modal with Escape/backdrop/close/dismiss, primary "Read the guide →" CTA that lands on the entry's detail page, and secondary "Got it" dismiss-only action
- [x] 4.3 Build `WhatsNewPage.tsx` as a list-or-detail switch: list view = hero card + image-top card grid (every card clickable), detail view = hero image + version pill + blurb intro + numbered step walkthroughs with icon pills and kbd chips. Reset scroll on list↔detail transitions.
- [x] 4.4 Wire the bell next to the avatar in `App.tsx`; mount the spotlight near the layout root; add `whatsNewMode` + `whatsNewEntryId` state with an `openWhatsNewPage(entryId?)` helper; add a lazy-loaded route branch for the page

## 5. Assets & Authoring
- [x] 5.1 Generate hero illustrations per entry into `public/whats-new/` and wire `image` paths into `data/whatsNew.ts`
- [x] 5.2 Record the new feature in `CHANGELOG.md` under `[Unreleased]`

## 6. Verification
- [x] 6.1 Build passes (`npm run build`)
- [ ] 6.2 Local smoke test: bell renders for signed-in and guest; spotlight fires once for the featured entry and never re-fires after dismiss; "Read the guide" opens the detail page for the spotlighted entry; clicking any bell row or grid card lands on its detail; "Back to all updates" returns to the list view without exiting the page; chrome back arrow fully exits

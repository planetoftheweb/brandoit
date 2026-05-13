# Change: Add What's New Surface

## Why
Users have no way to discover new features shipped between visits. The CHANGELOG is engineering-voiced and lives in the repo, not in the app. Releases like Cmd+K search, BYOK analysis, or prompt image drop went largely unseen because there is no in-app announcement surface.

## What Changes
- A bell icon in the header opens a dropdown listing every user-facing release entry in reverse-chronological order. An unread dot/badge appears when there are entries newer than the last id the user has seen.
- A spotlight modal auto-opens on app load when the newest entry flagged `featured: true` has not yet been dismissed by the current user. Dismissing it (or signing in on a new device) persists per-user so the same modal never re-fires.
- A curated content file `data/whatsNew.ts` is the single source of truth for both surfaces. CHANGELOG.md stays as the engineering source of truth; `whatsNew.ts` is the user-facing slice authored alongside it.
- Per-user state (last seen id, dismissed spotlight ids) persists to `UserPreferences` for signed-in users and `localStorage` for guests.
- `?whatsnew=<id>` deep links open the bell with the matching entry scrolled into view.

## Impact
- Affected types: `WhatsNewEntry` interface added; `UserPreferences` gains `lastSeenWhatsNewId` and `dismissedSpotlightIds` in `types.ts`.
- Affected components: new `WhatsNewBell.tsx` and `WhatsNewSpotlight.tsx`; header in `App.tsx` mounts the bell next to the avatar and the spotlight overlay near the layout root.
- Affected hooks: new `hooks/useWhatsNew.ts` encapsulates persistence and selection logic.
- Affected services: writes flow through the existing `authService.updateUserProfile` preference-save path; no new collections or Storage paths.
- Affected data: new `data/whatsNew.ts` array, seeded with the four most recent user-facing highlights.
- Authoring workflow: when shipping a feature you want surfaced, append an entry to `whatsNew.ts` and set `featured: true` only for releases worth a homepage modal interrupt.

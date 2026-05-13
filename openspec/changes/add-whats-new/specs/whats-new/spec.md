## ADDED Requirements

### Requirement: Curated What's New Entries
The system SHALL maintain a curated list of user-facing release entries as the single source of truth for the bell dropdown, the spotlight modal, the discovery-page grid, and the per-release detail page.

#### Scenario: Entry shape
- **WHEN** an entry is added to `data/whatsNew.ts`
- **THEN** it has a stable `id`, a `title`, a one-sentence `summary`, a one-paragraph `blurb`, a `publishedAt` timestamp, and optionally a `version`, `image`, `featured` flag, `learnMoreHref`, and `sections`
- **AND** the array stays sorted descending by `publishedAt`

#### Scenario: Rich section content
- **WHEN** an entry includes `sections`
- **THEN** each section has a `heading`, an optional `body`, and an optional ordered `steps` array
- **AND** each step has `text` and may carry an `icon` (Lucide icon name) and/or `kbd` (keyboard-shortcut string)
- **AND** the detail view renders steps as a numbered list, resolves the `icon` against an allowlist (falling back to a help glyph for unknown names), and splits `kbd` on `+` into styled key chips

#### Scenario: Featured entry
- **WHEN** an entry has `featured: true`
- **THEN** it is eligible for the spotlight modal
- **AND** entries without `featured: true` appear only in the bell dropdown

### Requirement: Header Bell With Unread Badge
The system SHALL render a bell icon in the header that opens a dropdown of every entry and shows an unread indicator when there is something new for the current user.

#### Scenario: Unread badge visible
- **WHEN** the newest entry's id differs from the user's `lastSeenWhatsNewId`
- **THEN** the bell shows an unread badge

#### Scenario: Opening clears unread
- **WHEN** the user opens the bell
- **THEN** the system records the newest entry id as `lastSeenWhatsNewId`
- **AND** the badge clears
- **AND** entries that were unseen before the open keep a "NEW" tag for the remainder of the session so the user can identify what changed

#### Scenario: Bell row preview
- **WHEN** the bell dropdown is open
- **THEN** each row renders a hero thumbnail in a 16:9 aspect, the title, the one-sentence `summary`, and version/time meta
- **AND** the `blurb` is NOT shown in the dropdown to keep each row scannable

#### Scenario: Clicking a row opens the detail page
- **WHEN** the user clicks any row in the dropdown
- **THEN** the bell closes and the full-page detail view opens for that entry

#### Scenario: Bell available to guests
- **WHEN** an anonymous (non-signed-in) user visits the app
- **THEN** the bell is rendered
- **AND** unread state persists in `localStorage` under `brandoit_whats_new_v1`

### Requirement: Spotlight Modal
The system SHALL auto-open a spotlight modal on app load for the newest featured entry the current user has not dismissed.

#### Scenario: Spotlight fires once
- **WHEN** the newest `featured: true` entry's id is not in `dismissedSpotlightIds`
- **THEN** the modal opens on app load
- **AND** dismissing the modal adds that id to `dismissedSpotlightIds`
- **AND** the modal never re-fires for that user on subsequent loads

#### Scenario: Dismiss interactions
- **WHEN** the user presses Escape, clicks the backdrop, clicks the close affordance, or clicks the primary "Got it" button
- **THEN** the modal closes
- **AND** the spotlight id is recorded as dismissed

#### Scenario: Read the guide
- **WHEN** the user clicks the primary "Read the guide" button inside the spotlight modal
- **THEN** the modal closes and records the spotlight as dismissed
- **AND** the full-page `WhatsNewPage` detail view opens for the *spotlighted entry* (not the discovery list)

#### Scenario: No featured entry
- **WHEN** no entry has `featured: true`, or the newest featured entry is already dismissed
- **THEN** no spotlight modal opens

### Requirement: Per-User Persistence
The system SHALL persist what's-new state per user without creating new Firestore collections or Storage paths.

#### Scenario: Signed-in persistence
- **WHEN** a signed-in user marks all seen or dismisses a spotlight
- **THEN** `lastSeenWhatsNewId` and `dismissedSpotlightIds` are written to `UserPreferences` via the existing profile-save path

#### Scenario: Guest persistence
- **WHEN** a guest marks all seen or dismisses a spotlight
- **THEN** the same fields persist to `localStorage` under `brandoit_whats_new_v1`

### Requirement: Deep Link Support
The system SHALL allow linking to a specific entry via a `?whatsnew=<id>` query parameter.

#### Scenario: Valid deep link
- **WHEN** the app loads with `?whatsnew=<id>` and an entry with that id exists
- **THEN** the bell dropdown opens with that entry scrolled into view and visually highlighted
- **AND** the `whatsnew` query parameter is removed from the URL without a full reload

#### Scenario: Unknown deep link id
- **WHEN** the app loads with `?whatsnew=<id>` and no entry with that id exists
- **THEN** the bell does not auto-open
- **AND** the `whatsnew` query parameter is removed from the URL

### Requirement: Full-Page Discovery View
The system SHALL provide a full-page `WhatsNewPage` blog-style view that toggles between a discovery list and a per-release detail walkthrough, reachable from the bell rows, the bell footer link, and the spotlight modal's "Read the guide" button.

#### Scenario: Page chrome
- **WHEN** the user navigates to the What's New page
- **THEN** it renders as a top-level page (sibling to `SettingsPage`, `AdminPage`, `CatalogPage`) with a header row that includes a back button, an icon, and the title "What's new"

#### Scenario: Hero entry
- **WHEN** at least one entry exists AND no entry is selected
- **THEN** the newest entry renders as a full-width hero card with its hero image, version pill, title, blurb, and release date
- **AND** the hero card is clickable; clicking it opens the detail view for that entry

#### Scenario: Earlier updates
- **WHEN** more than one entry exists AND no entry is selected
- **THEN** every remaining entry renders below the hero as an image-top card in a responsive grid
- **AND** each card is clickable; clicking it opens the detail view for that entry

#### Scenario: Detail view per release
- **WHEN** the user selects an entry (via the bell, the hero card, a grid card, or the spotlight's "Read the guide")
- **THEN** the page renders the hero image, version pill, title, release date, and `blurb` introduction
- **AND** each section is rendered as a heading + optional body + numbered steps
- **AND** each step renders its `icon` as a pill mirroring the actual app button styling, and/or splits its `kbd` on `+` to render styled key chips
- **AND** a "Back to all updates" affordance returns the page to the discovery list (without exiting the page)

#### Scenario: Scroll reset on switch
- **WHEN** the page switches between list and detail (in either direction)
- **THEN** the scroll position resets to the top so the user doesn't land mid-content

#### Scenario: Bell footer link
- **WHEN** the bell dropdown is open with at least one entry
- **THEN** a "View all updates" footer affordance is rendered
- **AND** clicking it closes the bell and opens the discovery-list view

#### Scenario: Empty state
- **WHEN** there are no entries
- **THEN** the page renders a graceful empty state instead of the hero/grid

#### Scenario: Missing sections
- **WHEN** an entry has no `sections` defined and the user opens its detail view
- **THEN** the page renders the hero image + blurb only and shows a friendly "no walkthrough yet" placeholder instead of throwing

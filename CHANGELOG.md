# Changelog

All notable changes to BranDoIt Studio are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.4.0] - 2026-04-21
### Added
- **GPT Image 2 and GPT Image Mini** are now available as first-class models. The previous single "GPT Image" entry is split into three tiers in `SUPPORTED_MODELS`:
  - `openai-2` → **GPT Image 2** (`gpt-image-2`) — OpenAI's flagship image model with 2K/4K resolutions and aspect ratios from 3:1 to 1:3.
  - `openai-mini` → **GPT Image Mini** (`gpt-image-1-mini`) — budget tier.
  - `openai` → **GPT Image 1.5** (`gpt-image-1.5`) — retained for backwards compatibility with existing user preferences.
  All three share a single `apiKeys.openai` slot, so existing keys keep working without re-entry.
- **Quality control for OpenAI models.** New toolbar dropdown (visible only when `openai-2` or `openai-mini` is selected) with `Auto` / `Low` / `Medium` / `High`. Persisted per-user as `settings.openaiImageQuality` via `UserSettings`, and passed through to both generation and refinement calls. `gpt-image-1.5` ignores this parameter (it doesn't support quality).
- **Expanded aspect ratios for GPT Image 2.** New `OPENAI_2_ALLOWED_ASPECT_RATIOS` adds `16:9`, `9:16`, `3:1` (banner), and `1:3` (skyscraper) on top of the legacy three. Concrete pixel sizes (e.g. `2048x2048` for 2K square, `2304x768` for 3:1) are picked to satisfy OpenAI's constraints (edges multiples of 16, long:short ≤ 3:1).
- **Admin users table redesign.** The 11-column table is collapsed to a scannable 4-column layout:
  - **User** — display name with a rotating chevron that expands an inline details panel showing username, email, and created date (with hover-for-full-timestamp on the shortened date).
  - **Last seen** — relative time (`2 days ago`, `3 months ago`, `Never`) with a hover popover showing the exact timestamp.
  - **Status** — row of five 40×40 circular icon pills with hover tooltips for model, Gemini key, OpenAI key, admin role, and suspension state. Active pills are tinted (teal / amber / red); inactive are ghost-dim.
  - **Actions** — sticky to the right edge with a visible bordered `⋯` button so it's always in view regardless of horizontal scroll.

### Changed
- `services/openaiService.ts` signature is now `generateOpenAIImage(prompt, config, apiKey, { modelId, quality, systemPrompt })`. `modelId` maps UI ids (`openai-2` / `openai-mini` / `openai`) to OpenAI API model names, and `quality` is only sent to models that actually accept it.
- `getApiKeyForModel` in `App.tsx` now routes all three OpenAI ids to `apiKeys.openai` — no schema change, no re-entry required.
- Settings page description for the OpenAI API key now reads "Used by GPT Image 2, GPT Image Mini, and GPT Image 1.5" so the shared-key behaviour is obvious.
- `services/aspectRatioService.ts` splits the OpenAI allowed-ratio logic by model id so `openai-2` gets the expanded set while `openai` and `openai-mini` stay pinned to the legacy three.
- Model labels updated across `ControlPanel`, `ImageDisplay`, `RecentGenerations`, and the admin stats service: `openai-2` → "GPT Image 2", `openai-mini` → "GPT Image Mini", `openai` → "GPT Image 1.5".
- Admin action button is now a bordered pill (`w-11 h-11`), meeting the 44×44 touch-target rule and making the previously-ghosted `⋯` actually discoverable.

## [0.3.0] - 2026-04-21
### Added
- **Admin usage-stats dashboard.** New `Stats` tab on the Admin page with live metrics aggregated directly from Firestore:
  - Top-line tiles: total images generated (generation-type marks), total refinements, total users, active-last-7d, active-last-30d, admin signals, suspended users, users with an API key, and average images per user.
  - Time-series charts for "images generated per day" (stacked images + refinements with peak-day callout) and "new signups per day" over the last 30 days.
  - Breakdown bar charts by **model**, **graphic type**, **visual style (top 10)**, and **aspect ratio**, with per-row count and percent-of-total.
  - Top 10 users leaderboard by images generated (with refinement and tile counts).
  - One-click refresh with "computed Xs ago" relative-time labels.
- **`services/statsService.ts`**: does a single `collectionGroup('history')` scan + one `users/` read + one catalog read, then aggregates in memory. Correctly handles every timestamp shape the codebase has ever used (Firestore `Timestamp`, `serverTimestamp()`, ms epoch, ISO string) and counts batch marks correctly (a tile with 3 variations = 3 images).
- **Admin page now has a `Users | Stats` tab switcher**; the existing Users panel and all row actions are unchanged.
- **Hand-rolled SVG/CSS chart primitives** (`StatTile`, `HorizontalBarList`, `DailyBarChart`) — no chart library dependency, keeps the bundle small (+5 KB gzipped).
- **Firebase Analytics (GA4)** now actually loads in production. The `measurementId` (`G-FH2TCLP7BP`) has been in the Firebase config since initial setup, but `getAnalytics(app)` was never called — so `gtag.js` never loaded and no hits ever reached GA4. The `services/firebase.ts` module now calls `getAnalytics(app)` behind `isSupported()`, skips emulator dev sessions, and no-ops when `measurementId` is absent.

### Changed
- `firestore.rules`: added a collection-group admin-read rule (`match /{path=**}/history/{docId} { allow read: if isAdmin(); }`) so the Stats dashboard can run `collectionGroup('history')` queries. The nested per-user history rule is unchanged; this new block is the one that applies to group queries.
- `setAdminRole` Cloud Function now surfaces the underlying Firebase Admin SDK error code and message instead of a bare `"internal"` error, so failures are actually actionable.

### Fixed
- Google Analytics (`G-FH2TCLP7BP`) was showing "Data collection isn't active" because the GA4 SDK was never initialized — see "Changed" above. Page-view and default events now flow to GA4 on every production page load (ad-blocker behaviour notwithstanding).

## [0.2.0] - 2026-04-21
### Added
- **Admin panel** (`components/AdminPage.tsx`): paginated user table with client-side search, row-level action menu (clear API keys, wipe system prompt, suspend/unsuspend, promote/demote admin, delete account), inline destructive-action confirmations, and status/error banners matching the existing Settings page styling.
- **Claims-based admin identity.** Admin privileges are now a Firebase Auth custom claim (`admin: true`) surfaced on `User.isAdmin`, read on every sign-in. The legacy `planetoftheweb` username is kept as a bootstrap fallback so the first admin can self-promote without a lockout; after that, admin is a real claim.
- **Cloud Functions** (`functions/src/admin.ts`): `setAdminRole` and `deleteUserAccount` callables. `setAdminRole` is admin-gated with a one-time bootstrap path for `planetoftheweb`. `deleteUserAccount` performs conservative removal — Firestore `users/{uid}` + `history` subcollection, Storage `users/{uid}/*`, and the Auth record — and leaves team/catalog documents owned by that user intact.
- **User suspension.** New `isDisabled` flag on user documents. Suspended users are hard-blocked at app start with a clear notice and a sign-out button; rules forbid them from doing anything until an admin re-enables the account.
- **Sign-in auditing.** `authService` writes `lastSignInAt: serverTimestamp()` on every successful sign-in for admin-side visibility.
- **Firebase project scaffolding.** `firebase.json`, `.firebaserc`, `firestore.indexes.json`, and a TypeScript `functions/` project (Node 20) so rules and functions can be versioned and deployed from the repo.
- **Codified security rules.** `firestore.rules` and `storage.rules` now live in the repo with `isSignedIn()`, `isOwner(uid)`, `isAdmin()` helpers, per-collection scoping, and a default-deny tail.
- **Local emulator wiring.** `services/firebase.ts` connects to the Firebase Emulator Suite (Auth 9099, Firestore 8080, Storage 9199, Functions 5001) when `VITE_USE_FIREBASE_EMULATORS=true`, so Cloud Functions can be exercised end-to-end without touching production.
- Avatar menu gains an **Admin** entry (gated on `user.isAdmin` or the bootstrap username).

### Changed
- `services/structureSeeder.ts`, `services/batchGenerationService.ts`, `components/ControlPanel.tsx`, and `App.tsx` now check `user.isAdmin` first and fall back to the `planetoftheweb` username only as a legacy bridge.
- `services/authService.ts` reads the admin claim from the ID token result on every auth state change and strips any `isAdmin` fields out of preferences before writing to Firestore, so claim state can never be spoofed from the client.
- **Settings page** redesigned for clarity (`components/SettingsPage.tsx`): tidier sectioning, reliable per-provider API key persistence, and removal of the old custom toolbar label controls.
- `setAdminRole` now surfaces the underlying Firebase Admin SDK error code and message in its `HttpsError`, so callers see actionable failures instead of a bare `internal`.
- User system prompt is now passed through the Gemini SDK's native `systemInstruction` channel and also applied during prompt expansion, so one saved system prompt genuinely steers both generation and expansion.

### Fixed
- Firestore user-profile writes could fail when optional preference fields were `undefined`. All `undefined` values are now stripped before the write.
- API keys could drop out of Settings state after a round-trip save; persistence is now provider-scoped and reliable across reloads.
- Removed an unused custom toolbar labels pathway that was fighting the model-label UI and could leave stale labels in the toolbar.

## [0.1.3] - 2026-04-17
### Added
- Batch generation: a single Generate click can now produce multiple variations in one go. Combine a numeric `QTY` (1–5 for regular users, unlimited for admins) with Midjourney-style brace expansion in the prompt, e.g. `A { red, blue } logo on { white, black }` — totals multiply across all brace groups.
- Pre-send estimate of batch size and expected duration, plus a live batch progress banner with elapsed time, estimated time remaining, and the number of jobs currently running in parallel.
- Stop button on the batch progress banner. Cancels pending jobs via `AbortController` while letting in-flight generations finish and save, so partial batches aren't lost.
- Unified `DownloadMenu` on the main preview and in Recent Generations. Replaces the old scattered SVG / HTML / PNG / WebP action buttons with a single Download control that offers "Download this" (current mark) and "Download all" (every visible or selected tile) in PNG, WebP, SVG, or HTML formats.
- Export selected generations from Recent Generations as a single ZIP (batch download of chosen tiles).
- Left-side thumbnail rail on the main viewport whenever a tile has multiple versions. Hover a thumbnail to preview that mark in the large viewport without committing; click to commit. The rail scrolls when a batch outgrows the viewport height.
- Footer with copyright and links to the changelog and GitHub releases.
- New shared services: `promptExpansionService` (brace Cartesian expansion with `\{`/`\}` escapes), `batchGenerationService` (concurrency-limited batch runner), `timeEstimationService` (rolling per-model duration averages in `localStorage`), and `imageFormatService` (shared raster/SVG export helpers).

### Changed
- Every job submitted from a single Generate click — whether from numeric `QTY`, brace expansion, or both multiplied together — is now consolidated onto one history tile as Mark I, Mark II, Mark III, … mirroring how manual refinements are grouped. No more sprawling across N tiles per batch.
- Each batch mark now stores its own expanded prompt (in `refinementPrompt`) so brace variations remain attributable per-mark in the info overlay and download filenames.
- Variations count control redesigned as a compact `QTY` button in the toolbar: typable numeric input with a small chevron dropdown for 1–5 presets, centered number, tight spacing, consistent with other toolbar controls.
- Batch progress banner moved down (`top-24`) so it no longer covers toolbar buttons.
- "Download all" zips now fan out over every `type: 'generation'` version per tile instead of only the latest, so batched tiles export every mark. Filenames use each mark's own expanded prompt when available.

### Fixed
- Race condition when multiple concurrent batch jobs tried to persist into the same Generation: persistence is now serialized through a single promise queue, so create-vs-update and mark-number collisions can't happen even with parallel API calls.
- Batch history UI now replaces the existing tile by ID on every progress update (rather than appending duplicates), so the mark count and thumbnail stay current during a running batch.

## [0.1.2]
### Added
- Nano Banana 2 (`gemini-3.1-flash-image-preview`) as a first-class model option alongside Nano Banana Pro and GPT Image.
- Correction-analysis workflow in refine: the wand action now generates a structured, readable correction plan prompt (summary / issues / fixes).
- Top version dropdown refinement deletion (remove specific refinement marks, renumber marks, persist history updates).
- Per-version `aspectRatio` tracking so follow-up edits keep the correct size.

### Changed
- Reworked the refine panel with rich dropdowns, per-image model and size controls, square action buttons, and prompt editor improvements (expandable modal + `Cmd/Ctrl + Enter` submit).
- Improved resize/recompose pipeline with stricter preservation prompts, an automatic anti-padding second pass, and a style-reference-only fallback when recomposes stay boxed.
- Improved dropdown usability in constrained layouts (auto open upward when needed, adaptive menu height, higher overlay layering).
- Cloud history persistence now auto-trims older versions when approaching Firestore document size limits while preserving the full local chain.

### Fixed
- Aspect-ratio regression where refinements could revert to the toolbar/default size (now uses the active-version ratio for subsequent edits).

## [0.1.1]
### Added
- OpenAI GPT-Image 1.5 generation with supported size mapping and structured prompts that include type, style, colors, and aspect ratio.
- Customizable per-model labels (e.g. "GPT Image", "Nano Banana") applied across toolbar, previews, and history tags.
- Overlays and tags now show model, type, style, size, prompt, colors, and timestamps (MM-DD HH:MM AM/PM) with unified outlined styling.
- History items store `modelId`, `timestamp`, and config so tags render correctly after restore/generate/refine.

### Changed
- Model selector refreshed with fancy dropdown styling; restore now re-applies the model to the toolbar.
- Clipboard UX hardened: copy image bitmap / URL / prompt with centered toasts; option analysis accepts system prompt.
- Settings: per-model labels, model/key saving keeps confirmation settings in sync, clearer model sections with dividers.

## [0.1.0]
### Added
- Initial release with Gemini-based image generation, prompt expansion, brand guideline analysis, and Firestore-backed history.
- Core UI: ControlPanel for type/style/colors/aspect, recent generations gallery, large image preview, auth, and settings.
- BYOK for Gemini, teams/catalog/resource management, and normalized Firestore structure.

## [0.0.1]
### Added
- First public version of BranDoIt.
- Basic Gemini image generation, prompt entry, and initial project scaffold.

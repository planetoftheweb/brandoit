# Changelog

All notable changes to BranDoIt Studio are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.7.1] - 2026-04-28
### Removed
- **"Mark" version badge on Recent Generations tiles.** The orange `Mark I/II/III` pill that overlaid the top-left corner of every multi-version thumbnail in the gallery has been removed; the gallery now reads as a clean image grid. The version label is still surfaced on the main viewer (top-center version dropdown, version menu rows, thumbnail-rail hover preview, and Info overlay) so refinement context is preserved where it matters. The Compare badge stacking logic was simplified accordingly — it now anchors at `top-2` instead of conditionally moving to `top-8` when the Mark pill was present (`components/RecentGenerations.tsx`).

## [0.7.0] - 2026-04-27
### Added
- **Carousel navigation on the main viewer.** `ImageDisplay` now exposes prev/next arrow buttons that step the main image through the recent-generations history one tile at a time. Arrows are positioned at the left and right edges of the image card (desktop) and rendered as an inline row with a `currentIdx / total` counter on mobile. The same navigation is bound to global ←/→ keyboard shortcuts that respect inputs/textareas/contenteditables and the prompt-editor modal so they don't fire mid-typing. The arrow buttons are disabled at the ends of the history list and hidden whenever the comparison slider is on screen so they can't fight with its own controls (`components/ImageDisplay.tsx`, `App.tsx`).
- **Recent-generations gallery jumps to the top on empty viewer.** When the user has prior history but nothing is loaded into the main viewer, `App.tsx` now suppresses the "Ready to Create" placeholder so `RecentGenerations` lands at the top of the page on load. True first-run users (no current generation _and_ no history) still see the original empty-state hint (`App.tsx`).
- **Show/Hide details toggle for the gallery.** New eye-icon toggle in the `RecentGenerations` toolbar collapses the per-tile prompt + tag-chip panel beneath each thumbnail. Default is **off** so the gallery reads as a clean image grid. Choice persists to `localStorage` under `recentGenerations.showDetails` (`components/RecentGenerations.tsx`).
- **Thumbnail size selector for the gallery.** New `RichSelect` dropdown in the `RecentGenerations` toolbar lets users pick `X-Small` / `Small` / `Medium` / `Large` density. Each maps to a different responsive `grid-cols-*` configuration (3→10 cols at X-Small, 2→5 at Large). Defaults to `Small` so the grid is tighter out of the box, and the choice persists to `localStorage` under `recentGenerations.thumbnailSize` (`components/RecentGenerations.tsx`).
- **`triggerLabelClassName` prop on `DownloadMenu`.** Lets callers responsively hide the trigger label `<span>` (e.g. `hidden xl:inline`) without losing the accessible name, which keeps reading via `triggerTitle`/`aria-label` (`components/DownloadMenu.tsx`).

### Changed
- **Tile action buttons hide until hover on hover-capable devices.** The per-tile toolbar (Download / Copy image / Copy URL / Copy prompt / Delete) on `RecentGenerations` thumbnails now uses `[@media(hover:hover)]:opacity-0 ... :group-hover:opacity-100` instead of the old `lg:` breakpoint carve-out. Hover-capable devices at any width get a clean image grid that reveals controls on hover/focus-within; touch-only devices keep the toolbar always visible since they have no hover state. Buttons remain in the DOM (opacity-only) so keyboard tab-focus and screen readers still see them (`components/RecentGenerations.tsx`).
- **Recent-generations toolbar collapses to icons instead of wrapping.** The gallery toolbar (Size / Show details / Download all / Select for export) was wrapping onto a second row at narrow desktop widths because `flex-wrap` let the buttons drop down. The container is now `flex-nowrap`, all buttons get `shrink-0`, and the text labels on the three action buttons hide below `xl` (1280px) via `hidden xl:inline`, leaving the icons + accessible names. The size dropdown keeps its selected value visible at all widths so users can still see which density is active (`components/RecentGenerations.tsx`).

## [0.6.0] - 2026-04-27
### Added
- **Concurrent background generations.** Each Generate click now mints its own `ActiveGenerationJob` with an `id`, dedicated `AbortController`, snapshotted run context (user, prompt, system prompt, OpenAI quality), and per-model progress, all tracked in a single `activeGenerationJobs` array. The toolbar is no longer blocked while a run is in flight, multiple runs can coexist, and each is independently stoppable and dismissable (`App.tsx`).
- **Floating "Active Generations" monitor.** New top-right card surfaces every running, completed, failed, or stopped job with: per-job spinner / status dot, `done/total` counter, in-flight count, prompt, color-coded progress bar (teal running, red failed, slate stopped), elapsed time, throughput-based ETA (falls back to per-model concurrency estimates when nothing has completed yet), up to three currently-running `{model, prompt}` rows, per-model chips for compare runs, a "View latest result" arrow that jumps to whichever image just landed, and a per-job Stop button. Settled jobs auto-dismiss after 9s on success / 14s on failure but can be cleared manually with the X (`App.tsx`).
- **Setup-aware Generate button.** `ControlPanel` accepts `setupRequired`, `setupActionLabel`, `setupActionDescription`, and `onSetupAction` props. When the user has no account or no API key, the Send icon swaps to a `KeyRound` / `UserPlus` glyph and clicking it opens the right setup modal instead of trying to generate (`components/ControlPanel.tsx`).
- **Storage-backed generation history.** Raster image bytes now upload to Firebase Storage at `users/{uid}/history/{generationId}/{versionId}.{ext}` via the new `uploadGenerationImage` / `deleteGenerationImages` helpers (`services/imageService.ts`). Firestore documents keep only metadata plus a `imageStoragePath` and download URL — generated tiles no longer threaten the 1 MiB Firestore document limit, and removing a generation tile cleans up its Storage folder (`services/historyService.ts`, `types.ts`).
- **`imageStoragePath` on `GenerationVersion`.** New optional field so versions can round-trip their Storage object location for cleanup. Old documents without it continue to work via fallback to `imageUrl` / `imageData` (`types.ts`, `services/historyService.ts`).

### Changed
- **Prompt input row redesigned as compact icon actions.** The previous `sm:flex-row` row with an in-input "Prompt" label and pill-shaped buttons becomes a single 12×12 row of icon buttons (Qty / Expand / Generate) using the `Send` glyph; the variations input is the icon button itself, with a chevron exposing the 1–5 quick-pick. Container uses `w-full max-w-5xl mx-auto` so the row stays centered with the toolbar above at every breakpoint (`components/ControlPanel.tsx`).
- **Tile-overlay buttons are touch-friendly and stay visible on small screens.** Hover-to-reveal action clusters in `ImageDisplay` and `RecentGenerations` now wrap with `flex-wrap`, clamp width via `max-w-[calc(100%-Xrem)]`, drop to `h-8 w-8` / `p-2.5` below `lg`, and use `opacity-100 lg:opacity-0 lg:group-hover:opacity-100 lg:group-focus-within:opacity-100` so they're always reachable on mobile while preserving the desktop hover-fade (`components/ImageDisplay.tsx`, `components/RecentGenerations.tsx`).
- **`isGenerating` is now derived from `activeGenerationJobs`** (`hasRunningGenerationJobs`) rather than a separate boolean, removing several stale-state slots from the previous batch implementation (`batchProgress`, `batchModelProgress`, `activeBatchModelIds`, `batchVisualBars`, `batchStartedAt`, `isBatchStopping`, `batchAbortRef`, `batchModelJobsRef`, `batchVisualBarTimersRef`).
- **History serialization is async** so it can upload images before writing the Firestore doc (`historyService.saveToRemote`, `historyService.updateGeneration`). Remote payloads now exclude raw base64 entirely; reads continue to merge local cache + remote URL transparently.

### Fixed
- **Prompt row left-aligned at 768–1535px viewports.** The new compact prompt row was wrapped in a `mx-auto` container with `width: calc(100vw - 2rem)` and the input had `max-w-[30rem] xl:max-w-[44rem]` caps, which combined with fixed-size `shrink-0` action buttons left a gap on the right and made the row visually fall off-center from the toolbar above. Restored a `w-full max-w-5xl mx-auto` shell and removed the input max-width caps so `flex-1` properly fills the centered row (`components/ControlPanel.tsx`).
- **Stale generations no longer leak fetches or timers on unmount.** The cleanup effect now aborts every in-flight `AbortController` and clears every dismiss timer registered in `generationJobAbortControllersRef` / `generationJobDismissTimersRef`.

## [0.5.1] - 2026-04-22
### Changed
- **Toolbar redesigned as a tiered responsive menu bar.** Replaced the previous bordered-button toolbar (`components/ControlPanel.tsx`) with a ghost menu-style row that adapts across three breakpoints:
  - `< lg` (1024px): icon-only, 44×44 tap targets, label surfaced via tooltip.
  - `lg+`: icon + truncated label (≤100px, label still truncates cleanly).
  - `xl+` (1280px): icon + stacked SUBLABEL/label + chevron.
  - `2xl+` (1536px): adds the color-palette preview strip under Colors.
  Reset and Upload actions adopted the same ghost treatment with a vertical separator between the config and action groups so the grouping is obvious without borders.
- `Download all` inside a generation-tile viewer is now scoped to **that tile only** (all marks/versions in the current `Generation`) instead of the full history gallery (`components/ImageDisplay.tsx`). The label now reads "Download all in this tile" to match the scope.

### Fixed
- **Toolbar dropdowns no longer get clipped.** The toolbar container had `overflow-x-auto`, which per CSS spec implicitly sets `overflow-y: auto` as well — silently chopping off every absolute-positioned dropdown panel as soon as it rendered. Removed the overflow wrapper, pushed the text tier from `md` to `lg` so 768–1023px stays icon-only (no overflow possible), and kept `flex-wrap` as a final safety net.
- Resolved several regressions introduced while iterating on the toolbar: uneven vertical padding, tiny mobile icons, single-row scroll clipping, and dropdown panels that visually appeared then vanished on click.

## [0.5.0] - 2026-04-21
### Added
- **Cross-model comparison workflow with an inline swipe slider.** Users can now select multiple models for one generation run and compare results directly in the main preview surface (no cramped modal), with an A/B slider (`components/JuxtaposeSlider.tsx`) and side-by-side export options.
- **Grouped model selector UX for Gemini and OpenAI families.** The model menu now organizes options by provider, supports shift-click compare-entry behavior, and surfaces clearer selected-state feedback for compare picks.
- **Per-mark model identity across shared generation tiles.** Each generated version now carries its originating `modelId`, allowing mixed-model runs to remain grouped in one tile while keeping accurate model tags in previews/history and comparison picks.
- **Per-job batch progress lanes.** Multi-generation runs now render one progress row per active generation job (with prompt + model context), instead of a single aggregate bar, and fade rows out as jobs finish.
- **Toolbar preference durability upgrades.** Local toolbar cache now includes OpenAI image quality and improved fallback hydration for signed-out and returning sessions, so defaults persist more reliably between reloads.

### Changed
- Comparison mode now uses the existing viewport and thumbnail rail flow instead of a separate modal, with controls overlaid on the slider surface to preserve image real estate.
- Shift-click compare behavior now treats the currently selected mark as A and the shift-clicked mark as B when entering compare, matching expected "compare this against current" intent.
- Starting a new generation now exits compare mode immediately so the workspace returns to normal generation context.
- Control bar spacing and sizing were rebalanced for larger screens (`components/ControlPanel.tsx`), improving legibility and reducing cramped dropdown/button layouts.
- Multi-model batch ETA now reflects parallel wall-clock behavior using observed throughput and per-model concurrency assumptions.
- OpenAI integration path expanded: model labels, quality routing, and aspect-ratio handling were aligned across controls, generation services, history, and settings views.

### Fixed
- Resolved repeated compare-layout regressions where the preview area could collapse or left-align when entering comparison mode.
- Prevented top-right action buttons from covering compare controls while the slider is active.
- Corrected compare-entry seeding so users no longer need to reselect the first mark after entering picker mode.
- Improved per-job progress readability: larger metadata text and active bars no longer appear fully complete while generations are still in flight.
- Improved persistence defaults for first-load preferences (model/type/style/colors/size/quality) so user-selected settings survive reloads and sync more consistently.

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

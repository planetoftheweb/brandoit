# Changelog

All notable changes to BranDoIt Studio are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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

# Release Notes

## 0.1.2
- Added Nano Banana 2 (`gemini-3.1-flash-image-preview`) as a first-class model option alongside Nano Banana Pro and GPT Image.
- Reworked the refine panel with rich dropdowns, per-image model and size controls, square action buttons, and prompt editor improvements (expandable modal + `Cmd/Ctrl + Enter` submit).
- Added correction-analysis workflow in refine: wand action now generates a structured, readable correction plan prompt (summary/issues/fixes).
- Improved resize/recompose pipeline with stricter preservation prompts, automatic anti-padding second pass, and style-reference-only fallback generation when recomposes stay boxed.
- Fixed aspect-ratio regression where refinements could revert to toolbar/default size by introducing per-version `aspectRatio` tracking and using active-version ratio for subsequent edits.
- Added top version dropdown refinement deletion (remove specific refinement marks, renumber marks, persist history updates).
- Improved dropdown usability in constrained layouts (auto open upward when needed, adaptive menu height, higher overlay layering).
- Improved cloud history persistence: remote payload auto-trims older versions when approaching Firestore document size limits while preserving full local chains.

## 0.1.1
- Added OpenAI GPT-Image 1.5 generation with supported size mapping and structured prompts that include type, style, colors, and aspect ratio selections.
- Model selector refreshed with fancy dropdown styling, customizable per-model labels (e.g., “GPT Image”, “Nano Banana”), and restore now re-applies the model to the toolbar.
- Overlays and tags now show model, type, style, size, prompt, colors, and timestamps (MM-DD HH:MM AM/PM) with unified outlined styling; large preview overlay displays full prompt and metadata.
- Clipboard UX hardened: copy image bitmap/URL/prompt with centered toasts; option analysis accepts system prompt.
- Settings refinements: per-model labels, model/key saving keeps confirmation settings in sync, clearer model sections with dividers.
- History items store `modelId`, `timestamp`, and config to render tags after restore/generate/refine.

## 0.1.0
- Initial release with Gemini-based image generation, prompt expansion, brand guideline analysis, and Firestore-backed history.
- Core UI: ControlPanel for type/style/colors/aspect, recent generations gallery, large image preview, auth, and settings.
- BYOK for Gemini, teams/catalog/resource management, and normalized Firestore structure.

## 0.0.1
- First public version of BranDoIt.
- Basic Gemini image generation, prompt entry, and initial project scaffold.

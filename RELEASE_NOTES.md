# Release Notes

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


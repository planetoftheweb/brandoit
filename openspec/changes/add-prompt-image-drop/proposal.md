# Change: Add Prompt Image Drop

## Why
Users often have an image that captures either the desired content or a useful visual style. Today the prompt box accepts only text, so users must manually describe the image or create a custom style elsewhere before generating.

## What Changes
- The prompt textarea accepts dropped image files and opens a small choice dialog.
- Users can turn the image into a content-only prompt. The analysis excludes layout, camera/composition, color palette, rendering style, and other concerns already covered by the toolbar menus.
- Users can attach the image as a style reference for the next generation run.
- Style-reference mode exposes two choices:
  - **Use image style:** the image-derived style replaces the current Style menu for the generated output.
  - **Keep menu style:** the current Style menu remains authoritative; the image is used only as a soft reference.
- A removable chip near the prompt shows when an image style reference is active.

## Impact
- Affected services: `geminiService.ts` adds a content-only image description helper and style-reference generation gets an explicit style influence mode.
- Affected components: `ControlPanel.tsx` handles prompt-image drag/drop, choice dialog, style-reference chip, and image-to-prompt analysis state.
- Affected app orchestration: `App.tsx` stores the temporary style-reference image and routes Gemini generation through the style-reference path when active.
- Persistence: no new Firestore collections or Storage paths. The dropped image is temporary client state only.
- Model support: image analysis uses the user's Gemini key. Style-reference image input is applied to Gemini image models; non-Gemini models fall back to the analyzed style text in the prompt.

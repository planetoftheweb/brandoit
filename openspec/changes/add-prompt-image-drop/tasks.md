## 1. Prompt Image Drop UX
- [x] 1.1 Add drag/drop handling to the prompt textarea for image files
- [x] 1.2 Show a choice dialog with content-prompt and style-reference actions
- [x] 1.3 Show a removable style-reference chip when an image style is attached

## 2. Image Analysis
- [x] 2.1 Add a content-only image prompt helper that excludes menu-controlled style/layout details
- [x] 2.2 Reuse existing image style analysis for style-reference labels and descriptions
- [x] 2.3 Require a Gemini key for image analysis and show user-friendly errors when missing

## 3. Generation Routing
- [x] 3.1 Store temporary style-reference state in `App.tsx`
- [x] 3.2 Use image style as the authoritative style when requested
- [x] 3.3 Keep menu style authoritative when requested
- [x] 3.4 Preserve existing plain, brace, JSON prompt-list, and multi-model generation behavior

## 4. Verification
- [x] 4.1 Build passes
- [x] 4.2 Local UI smoke test covers app render and prompt field discoverability

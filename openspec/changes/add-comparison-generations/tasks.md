## 1. Types & Constants
- [ ] 1.1 Add `HistoryItem.comparisonBatchId?: string` to `types.ts`
- [ ] 1.2 Preserve `comparisonBatchId` in `sanitizeHistoryItem` / history save path so it round-trips

## 2. Multi-Select Model Dropdown
- [ ] 2.1 `ControlPanel.tsx`: add `compareModelsMode: boolean` local state to the model dropdown
- [ ] 2.2 Header row inside the menu with a `GitCompare` toggle ("Compare models") + inline hint
- [ ] 2.3 In multi mode, render a checkbox next to each model row; clicking toggles membership in `selectedModelIds`
- [ ] 2.4 Button label in multi mode: "2 models" / "Nano Banana Pro + GPT Image 2" (≤2 shown inline, else "N models")
- [ ] 2.5 Prop surface: new `selectedModelIds: string[]` + `onModelIdsChange`; keep existing `selectedModel`/`onModelChange` as the primary-model accessor (derived from `selectedModelIds[0]` when in multi mode)
- [ ] 2.6 Switching back to single mode collapses `selectedModelIds` to `[selectedModel]`
- [ ] 2.7 Persist `compareModelsMode` and `selectedModelIds` in component state only — not in user preferences — to match how `QTY` works

## 3. Fan-Out Generation
- [ ] 3.1 `services/batchGenerationService.ts`: accept `modelIds: string[]` alongside the existing single-model signature; preserve single-model behaviour when `modelIds.length === 1`
- [ ] 3.2 When `modelIds.length > 1`: produce one tile per model, running the existing batch runner for each model sequentially (parallel across models is risky for rate limits on the same API key — keep sequential for v1)
- [ ] 3.3 Generate `comparisonBatchId` as a short random string once per Generate click (e.g. `cmp-` + 8 hex chars)
- [ ] 3.4 Stamp `comparisonBatchId` on every history doc produced by the multi-model run
- [ ] 3.5 `App.tsx`: route `Generate` click through the multi-model path when `selectedModelIds.length > 1`

## 4. Pre-Send Estimate
- [ ] 4.1 `ControlPanel.tsx` (or wherever the pre-send estimate banner is computed): multiply job count by `modelIds.length`
- [ ] 4.2 Duration estimate: for each model sum its per-job rolling average from `timeEstimationService`; display the total
- [ ] 4.3 Banner copy: "Generating 6 images across 2 models — ~45s"

## 5. Comparison State Machine (App-Level)
- [ ] 5.1 Add `comparisonState` to `App.tsx`: `{ mode: 'idle' | 'picking'; a: MarkRef | null; b: MarkRef | null }`
- [ ] 5.2 `MarkRef = { generationId: string; versionId: string }` (covers every mark in every tile)
- [ ] 5.3 Expose `enterComparePickerMode`, `exitComparePickerMode`, `pickMarkForComparison(ref)` helpers
- [ ] 5.4 Auto-exit picker mode and open the slider when both `a` and `b` are set
- [ ] 5.5 `Escape` key exits picker mode; clicking an already-picked ref deselects it

## 6. Compare Toggle Button & Shift-Click
- [ ] 6.1 Add a `Compare` pill button to the main viewport toolbar in `ImageDisplay.tsx` (icon `GitCompare`, hover `title` reads "Click two marks to open a before/after slider (or Shift-click any mark)")
- [ ] 6.2 Clicking the toggle calls `enterComparePickerMode`; a second click exits
- [ ] 6.3 Picker-mode styling: subtle teal cursor + "Pick 2 marks to compare" sticky banner at the top of the viewport
- [ ] 6.4 Wire `onClickWithModifiers(event, markRef)` on every mark thumbnail (thumbnail rail, Recent Generations tile body, and the main viewport's active mark) — when `event.shiftKey` OR `comparisonState.mode === 'picking'`, call `pickMarkForComparison(ref)` and suppress the default click

## 7. Juxtapose Slider Component
- [ ] 7.1 Create `components/JuxtaposeSlider.tsx`
- [ ] 7.2 Props: `{ imageA: string; imageB: string; labelA: string; labelB: string; aspectRatio?: string; onSwap?: () => void; onClose?: () => void }`
- [ ] 7.3 Layout: a container with `aspect-ratio` lock; image A fills the container; image B stacked on top with `clip-path: inset(0 0 0 X%)`
- [ ] 7.4 Draggable vertical handle (`absolute left-[X%]`); pointer events drive X; keyboard arrows nudge ±1%, `Home`/`End` jump to 0% / 100%
- [ ] 7.5 Corner chips showing `labelA` (top-left) and `labelB` (top-right), each with model + mark
- [ ] 7.6 A/B swap button (double-arrow icon), `Close` button (X icon)
- [ ] 7.7 "Download side-by-side" button using `imageFormatService` — draw both images onto one canvas and save PNG
- [ ] 7.8 Handle mismatched source aspect ratios by letterboxing the smaller one with a small note chip ("Sizes differ")

## 8. Viewport Routing
- [ ] 8.1 Case A — same tile: `ImageDisplay.tsx` renders `<JuxtaposeSlider />` inline in place of the current mark when `comparisonState.a.generationId === comparisonState.b.generationId`
- [ ] 8.2 Case B — cross-tile: render `<ComparisonModal>` at the app shell level (above routes)
- [ ] 8.3 `ComparisonModal` closes on `Escape`, on the `Close` button, and on click-outside

## 9. Recent Generations Badge
- [ ] 9.1 `RecentGenerations.tsx`: group tiles by `comparisonBatchId`; compute a colour per batch id (hash → hue)
- [ ] 9.2 Tiles in a comparison batch show a small coloured chip "Compare run · N tiles"
- [ ] 9.3 Hovering the chip outlines all sibling tiles in the same batch

## 10. Verification
- [ ] 10.1 Single-model flow unchanged: a normal generation still produces one tile, no `comparisonBatchId`
- [ ] 10.2 Multi-model flow: 2 models × QTY 2 × 2 brace variants = 2 tiles, 4 marks each, all sharing the same `comparisonBatchId`
- [ ] 10.3 Compare toggle + click-click opens the slider with the correct A/B
- [ ] 10.4 Shift-click outside picker mode picks A; next click picks B and opens the slider
- [ ] 10.5 Slider drag, keyboard arrows, and swap all work; `Escape` closes
- [ ] 10.6 Side-by-side PNG export downloads at the expected dimensions
- [ ] 10.7 Mismatched aspect ratios letterbox cleanly with the note
- [ ] 10.8 Recent Generations chip links tiles in the same batch and hover highlights siblings
- [ ] 10.9 `npm run check:no-native-selects` and `npm run build` pass

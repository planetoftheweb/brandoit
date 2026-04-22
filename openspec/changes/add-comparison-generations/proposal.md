# Change: Add Comparison Generations

## Why
Today the model picker is single-select. To evaluate one model against another (say Nano Banana Pro vs. GPT Image 2 on the same prompt) a user has to generate once, remember the result, switch the model, generate again, and flip between tiles manually. There is no way to visually compare two outputs in the same viewport, and no mental model that links "these two tiles came from the same prompt, different models" anywhere in the UI.

Adding multi-model fan-out generation plus a Juxtapose-style before/after slider turns this into a first-class flow. The slider also incidentally serves a second use case users have never been able to address: compare a generation's Mark I to Mark III after two refinements, or compare a regenerated variation against a historical one from last week — any two marks, from anywhere.

## What Changes
- The toolbar model dropdown gains a secondary **multi-select mode**. A small toggle (icon `GitCompare`) above the grouped list switches the picker from "one model" to "compare models"; in multi mode each row renders a checkbox and the button label becomes "N models" / "A + B".
- When `selectedModelIds.length > 1`, the existing batch runner **fans out per model**. For each selected model a normal tile is produced (respecting `QTY` and brace-expansion per-model, i.e. the total job count is `models × qty × braceVariants`). Every resulting tile is tagged with a shared `comparisonBatchId` string so the UI can later link them.
- A new toolbar button **Compare** (icon `GitCompare`, hover tooltip explains the gesture) puts the app into **compare-picker mode**. In compare-picker mode clicking any mark (thumbnail rail, tile in Recent Generations, or the main viewport's current mark) selects it as side A or side B of a comparison. Holding `Shift` while clicking activates compare-picker mode for a single click without the toggle, matching the normal shift-to-extend gesture.
- Picking two marks opens a hand-rolled **Juxtapose slider** viewer. The slider renders both images absolutely positioned with a draggable vertical handle whose position drives a `clip-path: inset(0 0 0 X%)` on side B. Drag, pointer tap, and arrow-key nudges all move the handle. A/B swap, model/mark label chips in each corner, and a "download side-by-side" export are built in.
- **Routing rules:** if both picked marks live in the same tile the slider takes over the main viewport inline (already the tile's context); if they come from different tiles it opens as a full-screen modal above the app shell.
- Comparisons are **live-only** — no Firestore collection, no new persisted object. `comparisonBatchId` is the only persisted crumb and it exists purely so the `Recent Generations` panel can show a subtle "Part of compare run" link-badge between tiles that were generated together.
- Pre-send batch estimate multiplies by `modelIds.length` so the pre-generate duration/count banner stays accurate.

## Impact
- Affected types: `types.ts` adds `HistoryItem.comparisonBatchId?: string` (persisted, optional). No schema migration needed — absence is the default state.
- Affected constants: none; `SUPPORTED_MODELS` + `MODEL_GROUP_ORDER` stay as-is.
- Affected services: `services/batchGenerationService.ts` grows a `modelIds: string[]` input and a per-model loop that stamps `comparisonBatchId` on every produced history doc. `services/promptExpansionService.ts` is unaffected; the multi-model fan-out happens one level up.
- Affected components:
  - New `components/JuxtaposeSlider.tsx` — stateless viewer taking `{ imageA, imageB, labelA, labelB, aspectRatio }`.
  - New `components/ComparisonModal.tsx` — full-screen wrapper that hosts the slider when A and B are cross-tile.
  - `components/ControlPanel.tsx` — model dropdown becomes dual-mode (single / multi). Pre-send estimate banner updates its math.
  - `components/ImageDisplay.tsx` — shows the inline slider when the app's comparison state has both picks from the current tile; adds a small "A" / "B" badge on the active thumbnail-rail thumbnail when it's one of the picked marks. Compare toggle button lives here in the viewport toolbar.
  - `components/RecentGenerations.tsx` — tiles with a matching `comparisonBatchId` get a subtle "Compare run" chip that, when hovered, highlights the other tiles in the same run.
- Affected call sites: `App.tsx` owns the generation orchestration and the new `comparisonState` (idle / picking / paired) state machine. Shift-click handlers are wired through the same props that thumbnails already use, gated on `comparisonState !== 'idle'`.
- Affected Firestore rules: none. `comparisonBatchId` is just another field on `users/{uid}/history/{doc}`; existing owner/admin rules cover it.
- Deployment & storage cost: zero additional storage, zero additional Cloud Functions, zero new collections. Bundle grows by roughly the size of `JuxtaposeSlider.tsx` + `ComparisonModal.tsx` (~6 KB gzipped).

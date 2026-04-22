## ADDED Requirements

### Requirement: Multi-Select Model Dropdown
The system SHALL allow a user to select more than one image model for a single Generate click via a dual-mode dropdown.

#### Scenario: Single mode is the default
- **WHEN** the model dropdown opens
- **THEN** it shows one checkable radio-style selection per model
- **AND** picking a model dismisses the menu and updates `selectedModel`

#### Scenario: Switching to compare mode
- **WHEN** a user clicks the "Compare models" toggle inside the open menu
- **THEN** every model row renders a checkbox
- **AND** the current `selectedModel` is pre-checked
- **AND** the dropdown button label changes from the single model name to either `"{A} + {B}"` (when exactly two are checked) or `"{N} models"` (when more than two)

#### Scenario: Leaving compare mode collapses the selection
- **WHEN** the user toggles "Compare models" off
- **THEN** `selectedModelIds` collapses to `[selectedModel]`
- **AND** subsequent generations run in single-model mode

### Requirement: Multi-Model Fan-Out Generation
The system SHALL run the existing batch generation pipeline once per selected model when more than one model is selected, producing a separate tile per model.

#### Scenario: Two models, qty 1, no brace expansion
- **WHEN** `selectedModelIds = ['gemini', 'openai-2']`, `QTY = 1`, and the prompt contains no brace expansion
- **AND** the user clicks Generate
- **THEN** the system produces exactly 2 history tiles — one from each model
- **AND** each tile is stamped with the same `comparisonBatchId`

#### Scenario: Quantity and brace expansion multiply per model
- **WHEN** `selectedModelIds.length = 2`, `QTY = 3`, and the prompt has a 2-way brace expansion
- **THEN** 12 total images are generated (2 × 3 × 2)
- **AND** they land as 2 tiles of 6 marks each (one per model)

#### Scenario: Single-model generation is unchanged
- **WHEN** `selectedModelIds.length === 1`
- **THEN** the generation path behaves identically to the pre-change single-model batch flow
- **AND** no `comparisonBatchId` is written

### Requirement: Pre-Send Estimate Accounts for Models
The system SHALL multiply the pre-send job count and duration estimate by the number of selected models.

#### Scenario: Estimate reflects model count
- **WHEN** `selectedModelIds.length = 2`, `QTY = 3`, and no brace expansion
- **THEN** the pre-send banner reports `"Generating 6 images across 2 models"`
- **AND** the duration estimate is the sum of each model's rolling per-job average times its per-model job count

### Requirement: Compare Picker Activation
The system SHALL allow the user to enter compare-picker mode either by clicking a `Compare` toggle button or by holding `Shift` while clicking a mark.

#### Scenario: Toggle button activates picker
- **WHEN** the user clicks the `Compare` toolbar button
- **THEN** the app enters `comparisonState.mode === 'picking'`
- **AND** the main viewport shows a sticky "Pick 2 marks to compare" banner
- **AND** the button exposes a `title` tooltip reading "Click two marks to open a before/after slider (or Shift-click any mark)"

#### Scenario: Shift-click activates picker implicitly
- **WHEN** the user holds `Shift` and clicks any mark while `comparisonState.mode === 'idle'`
- **THEN** the app transitions to `picking` and the clicked mark is recorded as side A
- **AND** the next unmodified click on any mark records side B

#### Scenario: Escape cancels picking
- **WHEN** the user presses `Escape` while picking
- **THEN** `comparisonState` resets to `{ mode: 'idle', a: null, b: null }`
- **AND** any transient "pick 2 marks" UI is removed

#### Scenario: Deselection via re-click
- **WHEN** the user clicks a mark that is already `comparisonState.a`
- **THEN** side A is cleared but picker mode remains active

### Requirement: Juxtapose Slider Viewer
The system SHALL render a hand-rolled before/after slider when two marks have been picked, with no third-party library dependency.

#### Scenario: Drag the handle
- **WHEN** the user drags the vertical handle across the slider
- **THEN** side B's `clip-path` updates to match the handle position in real time

#### Scenario: Keyboard control
- **WHEN** the slider has focus and the user presses `ArrowLeft` or `ArrowRight`
- **THEN** the handle moves by 1%
- **AND** `Home`/`End` jump to 0%/100% respectively

#### Scenario: Swap A and B
- **WHEN** the user clicks the A/B swap button
- **THEN** the two images and their corner chip labels swap

#### Scenario: Download side-by-side
- **WHEN** the user clicks "Download side-by-side"
- **THEN** a PNG is saved containing image A on the left and image B on the right at the larger of the two native sizes, letterboxed if their aspect ratios differ

#### Scenario: Mismatched aspect ratios
- **WHEN** image A and image B have different source aspect ratios
- **THEN** the slider container locks to the larger of the two ratios
- **AND** the smaller image is letterboxed with a small "Sizes differ" chip

### Requirement: Viewport Routing for Comparison Viewer
The system SHALL route the slider inline when both picked marks share a tile and to a full-screen modal when they do not.

#### Scenario: Same-tile comparison
- **WHEN** both `comparisonState.a` and `comparisonState.b` share the same `generationId`
- **THEN** the slider renders inline inside `ImageDisplay` in place of the current mark

#### Scenario: Cross-tile comparison
- **WHEN** `comparisonState.a.generationId !== comparisonState.b.generationId`
- **THEN** a full-screen `ComparisonModal` opens above the app shell
- **AND** it closes on `Escape`, the close button, or a click on the backdrop

### Requirement: Comparisons Are Live-Only
The system SHALL NOT persist comparisons as a standalone entity in Firestore.

#### Scenario: No comparison collection
- **WHEN** a user performs any comparison action (pick A, pick B, open slider, close slider)
- **THEN** no reads or writes are made to a `comparisons` collection
- **AND** the slider's state lives entirely in in-memory component state

#### Scenario: Only `comparisonBatchId` is persisted
- **WHEN** a multi-model fan-out generation succeeds
- **THEN** each produced `users/{uid}/history/{doc}` carries a `comparisonBatchId` string
- **AND** no other comparison-related field is written to Firestore

### Requirement: Recent Generations Comparison Badge
The system SHALL visually link tiles that share a `comparisonBatchId`.

#### Scenario: Badge appears on siblings
- **WHEN** two or more tiles share a `comparisonBatchId`
- **THEN** each sibling tile in `RecentGenerations` shows a "Compare run · N tiles" chip
- **AND** hovering the chip outlines every sibling tile

#### Scenario: Legacy tiles stay silent
- **WHEN** a tile has no `comparisonBatchId`
- **THEN** no chip is rendered and no visual grouping behaviour applies

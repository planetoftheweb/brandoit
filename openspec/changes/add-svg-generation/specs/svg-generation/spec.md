## ADDED Requirements

### Requirement: SVG Generation Model
The system SHALL support a "Gemini SVG" model option that generates SVG code using Gemini 3.1 Pro's text generation endpoint.

#### Scenario: Generate SVG
- **WHEN** user selects "Gemini SVG" model and clicks Generate
- **THEN** the system sends a text prompt to Gemini 3.1 Pro requesting SVG code
- **AND** extracts the SVG from the text response
- **AND** sanitizes the SVG (removes scripts and event handlers)
- **AND** renders it inline in the display area

#### Scenario: Reuse Gemini API key
- **WHEN** user has a Gemini API key configured
- **THEN** the same key is used for both Nano Banana (image generation) and Gemini SVG (text generation)

### Requirement: SVG Output Modes
The system SHALL support three SVG output modes: Static, Animated, and Interactive.

#### Scenario: Static mode
- **WHEN** user selects Static mode
- **THEN** the generated SVG contains no animations or interactive elements

#### Scenario: Animated mode
- **WHEN** user selects Animated mode
- **THEN** the generated SVG includes CSS animations and/or SMIL `<animate>` elements

#### Scenario: Interactive mode
- **WHEN** user selects Interactive mode
- **THEN** the generated SVG includes CSS `:hover` and `:focus` states for visual interactivity
- **AND** no JavaScript is included

### Requirement: SVG Animation Controls
The system SHALL provide animation playback controls for animated SVGs.

#### Scenario: Play/Pause toggle
- **WHEN** an animated SVG is displayed
- **THEN** a play/pause button is visible
- **AND** clicking pause freezes all animations via CSS `animation-play-state: paused`

#### Scenario: Speed control
- **WHEN** an animated SVG is displayed
- **THEN** a speed slider is available (0.5x to 3x)
- **AND** adjusting it changes animation speed via CSS custom property

### Requirement: SVG Sanitization
The system SHALL sanitize all generated SVGs before rendering to prevent security risks.

#### Scenario: Strip dangerous content
- **WHEN** an SVG is received from the API
- **THEN** all `<script>` elements are removed
- **AND** all event handler attributes (`onload`, `onclick`, `onerror`, etc.) are removed
- **AND** all `<foreignObject>` elements are removed

### Requirement: Vector Visual Styles
The system SHALL categorize visual styles by format support (raster, vector, or both) and filter them based on the selected model.

#### Scenario: Filter styles for SVG model
- **WHEN** user selects Gemini SVG model
- **THEN** only styles with vector support are shown in the style dropdown

#### Scenario: Filter styles for raster models
- **WHEN** user selects Nano Banana or GPT Image model
- **THEN** only styles with raster support are shown in the style dropdown

#### Scenario: Style format indicators
- **WHEN** viewing the style dropdown
- **THEN** each style shows an icon indicating its format support (raster, vector, or both)

### Requirement: SVG Refinement
The system SHALL support conversational SVG refinement by sending the current SVG code and a modification prompt back to Gemini 3.1 Pro.

#### Scenario: Refine SVG
- **WHEN** user submits a refinement prompt for an SVG generation
- **THEN** the current SVG code and prompt are sent to Gemini 3.1 Pro
- **AND** a new version (Mark) is created with the modified SVG

#### Scenario: Quick action refinement
- **WHEN** user clicks a quick action chip (Simplify, Add Detail, Make Bolder, etc.)
- **THEN** the corresponding pre-built prompt is submitted as a refinement

### Requirement: SVG Export
The system SHALL support exporting SVGs as `.svg` files and rasterized `.png` files.

#### Scenario: Download as SVG
- **WHEN** user clicks "Download SVG"
- **THEN** the raw SVG code is downloaded as a `.svg` file
- **AND** the filename includes the version Roman numeral

#### Scenario: Export as PNG
- **WHEN** user clicks "Export as PNG" for an SVG generation
- **THEN** the SVG is rendered to a canvas at high resolution
- **AND** converted to PNG for download

#### Scenario: Copy SVG code
- **WHEN** user clicks "Copy SVG Code"
- **THEN** the raw SVG code string is copied to the clipboard

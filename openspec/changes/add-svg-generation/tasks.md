## 1. SVG Service Layer
- [ ] 1.1 Create `svgService.ts` with `generateSVG(prompt, config, apiKey)` using Gemini 3.1 Pro text generation
- [ ] 1.2 Implement SVG extraction from text response (find `<svg>...</svg>`)
- [ ] 1.3 Implement SVG sanitization (strip scripts, event handlers, foreign objects)
- [ ] 1.4 Implement SVG validation (well-formed XML check)
- [ ] 1.5 Implement `refineSVG(svgCode, prompt, apiKey)` for conversational refinement
- [ ] 1.6 Add prompt construction with SVG-specific instructions (output mode, viewBox, style)

## 2. Model Configuration
- [ ] 2.1 Add `gemini-svg` to `SUPPORTED_MODELS` in `constants.ts`
- [ ] 2.2 Configure API key resolution to reuse Gemini key for `gemini-svg`
- [ ] 2.3 Add model label default: "Gemini SVG"
- [ ] 2.4 Configure aspect ratio support for SVG (maps to viewBox dimensions)

## 3. SVG Output Modes
- [ ] 3.1 Add SVG mode type: `'static' | 'animated' | 'interactive'`
- [ ] 3.2 Add mode selector UI in ControlPanel (only visible when gemini-svg selected)
- [ ] 3.3 Include mode in prompt construction
- [ ] 3.4 Update `GenerationConfig` type with optional `svgMode` field

## 4. Visual Style Updates
- [ ] 4.1 Add `supportedFormats: ('raster' | 'vector')[]` to `VisualStyle` interface
- [ ] 4.2 Tag existing styles with format support
- [ ] 4.3 Add new vector-specific styles (Line Art, Geometric, Isometric, Duotone, Blueprint, Art Deco, Neon Glow, Low Poly, Paper Cut, Stained Glass, Wireframe, Gradient Mesh)
- [ ] 4.4 Add raster/vector/both icon indicator to style dropdown items
- [ ] 4.5 Filter styles by selected model's format in ControlPanel dropdown
- [ ] 4.6 Seed new styles to Firestore (structureSeeder update)

## 5. Inline SVG Display
- [ ] 5.1 Add SVG renderer component in ImageDisplay (inline rendering via sanitized HTML)
- [ ] 5.2 Scope SVG in container with controlled dimensions and overflow
- [ ] 5.3 Add animation play/pause toggle button
- [ ] 5.4 Add animation speed slider (0.5x to 3x via CSS custom property)
- [ ] 5.5 Handle SVG viewBox → container sizing
- [ ] 5.6 Detect SVG vs raster in ImageDisplay and render accordingly

## 6. SVG Refinement Panel
- [ ] 6.1 Detect SVG generation and show enhanced refinement panel
- [ ] 6.2 Add quick action chips (Simplify, Add Detail, Make Bolder, Make Lighter, Change Palette, Add/Remove Animation)
- [ ] 6.3 Implement conversational refinement (send SVG code + prompt to Gemini 3.1)
- [ ] 6.4 Integrate with versioning system (each refinement = new Mark)

## 7. SVG in History
- [ ] 7.1 Update history card rendering to handle SVG thumbnails (inline mini SVG)
- [ ] 7.2 Ensure SVG versions store `svgCode` instead of `imageData`
- [ ] 7.3 Update version navigator to show SVG content

## 8. Export
- [ ] 8.1 Add "Download SVG" button (direct .svg file download)
- [ ] 8.2 Add "Export as PNG" for SVG (render to canvas → PNG at configurable resolution)
- [ ] 8.3 Add "Copy SVG Code" button (copy raw SVG to clipboard)
- [ ] 8.4 Version-aware filenames: `{slug}-mark-{numeral}.svg`

## 9. Verification
- [ ] 9.1 Test SVG generation with Static, Animated, Interactive modes
- [ ] 9.2 Test animation toggle and speed controls
- [ ] 9.3 Test SVG refinement creates new versions
- [ ] 9.4 Test visual style filtering (vector styles only for SVG model)
- [ ] 9.5 Test SVG export (.svg and .png)
- [ ] 9.6 Test Copy SVG Code
- [ ] 9.7 Test SVG sanitization (verify script tags are stripped)
- [ ] 9.8 Test SVG display in both light and dark mode
- [ ] 9.9 Test SVG thumbnails in history grid

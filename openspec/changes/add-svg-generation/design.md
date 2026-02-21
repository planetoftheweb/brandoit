## Context
Gemini 3.1 Pro generates SVG as text/code output, not binary images. This is fundamentally different from the existing raster pipeline (Gemini Image Preview, OpenAI GPT Image) which return base64-encoded PNG/JPEG. SVG generation requires a separate API call pattern, response parser, display renderer, and storage approach.

## Goals
- Add "Gemini SVG" as a third model option reusing the existing Gemini API key
- Inline SVG rendering with animation support and controls
- Vector-specific visual styles with clear raster/vector/both categorization
- Rich refinement experience tailored to SVG's conversational editing strength
- Tiny storage footprint (SVG code strings instead of base64 blobs)

## Non-Goals
- SVG code editing (users can copy code, but no in-app editor)
- SVG import/upload (only AI-generated SVGs)
- Real-time collaborative SVG editing
- Complex interactive SVGs with JavaScript logic (CSS-only interactivity)

## API Integration

### Model
- Model ID: `gemini-svg` (internal), maps to `gemini-3.1-pro-preview` API model
- Endpoint: Standard `generateContent` (text generation), NOT image generation
- API key: Reuses the existing Gemini API key from `user.preferences.apiKeys.gemini`

### Prompt Construction
```
Generate an SVG graphic.
Type: {graphicType}
Visual Style: {styleDescription}
Color Palette: {colorName} - {hexCodes}
Dimensions: {width}x{height} viewBox (based on aspect ratio)
Output Mode: {static|animated|interactive}
Content: {userPrompt}

Output ONLY the SVG code. No explanation, no markdown fences.
For animated mode, use CSS animations and SMIL <animate> elements.
For interactive mode, use CSS :hover and :focus states only (no JavaScript).
```

### Response Parsing
- Extract SVG from text response (find `<svg` to `</svg>`)
- Sanitize: strip `<script>`, `onload`, `onclick`, and other event handler attributes
- Validate: check for well-formed SVG (basic XML validation)
- Store raw SVG code string in `GenerationVersion.svgCode`

## Display

### Inline SVG Rendering
- Render SVG inside a container `<div>` using `dangerouslySetInnerHTML` after sanitization
- Wrap in a scoped container with `overflow: hidden` and controlled dimensions
- Apply aspect ratio from viewBox

### Animation Controls
- **Play/Pause toggle**: Add/remove CSS class `animation-paused` which sets `animation-play-state: paused` and `* { animation-play-state: paused !important; }` on the container
- **Speed slider**: Override `animation-duration` via CSS custom property `--svg-animation-speed` (0.5x to 3x)
- Controls appear below the SVG when the output mode is Animated or Interactive

### Animation Toggle in Refinement
- Quick action: "Convert to Animated" / "Convert to Static"
- Sends the SVG code back to Gemini 3.1 with the instruction to add/remove animations

## Visual Styles

### Style Type Indicators
Each visual style gets a `supportedFormats` field:
```typescript
interface VisualStyle extends BaseResource {
  description: string;
  supportedFormats: ('raster' | 'vector')[];
}
```

### Style Categorization
| Style | Raster | Vector | Notes |
|-------|--------|--------|-------|
| Minimalist Vector | Yes | Yes | Excellent for both |
| Corporate Flat | Yes | Yes | Clean shapes work in both |
| Hand Drawn Sketch | Yes | Partial | Vector version uses rough strokes |
| Soft 3D Render | Yes | No | Requires raster lighting/shadows |
| **Line Art** | No | Yes | Pure vector, clean strokes |
| **Geometric** | Yes | Yes | Shapes and patterns |
| **Isometric** | Yes | Yes | 3D perspective with flat fills |
| **Duotone** | Yes | Yes | Two-color compositions |
| **Blueprint** | No | Yes | Technical drawing style |
| **Art Deco** | Yes | Yes | Ornamental geometric patterns |
| **Neon Glow** | Partial | Yes | CSS glow filters in SVG |
| **Low Poly** | Yes | Yes | Triangulated surfaces |
| **Paper Cut** | Partial | Yes | Layered shapes with shadows |
| **Stained Glass** | Partial | Yes | Bold outlines, colored fills |
| **Wireframe** | No | Yes | Structural outlines only |
| **Gradient Mesh** | No | Yes | Complex SVG gradients |

### Filtering Logic
- When model is `gemini-svg`: show only styles where `supportedFormats` includes `'vector'`
- When model is `gemini` or `openai`: show only styles where `supportedFormats` includes `'raster'`
- Icon indicator on each style: small vector/raster/both badge

## SVG-Specific Refinement

### Conversational Chain
SVG refinement sends the previous SVG code + new prompt back to Gemini 3.1 Pro:
```
Here is the current SVG:
{svgCode}

Please modify it: {refinementPrompt}
Output ONLY the modified SVG code.
```

### Quick Action Chips
| Chip | Prompt Sent |
|------|-------------|
| Simplify | "Simplify this SVG, reduce complexity and number of elements" |
| Add Detail | "Add more detail and visual complexity to this SVG" |
| Make Bolder | "Make strokes thicker and fills more opaque" |
| Make Lighter | "Make strokes thinner and reduce visual weight" |
| Change Palette | "Replace the current colors with: {selectedPalette}" |
| Add Animation | "Add smooth CSS animations to key elements" |
| Remove Animation | "Remove all animations, make it fully static" |

## Storage

### Version Storage for SVG
```typescript
interface GenerationVersion {
  // ... existing fields
  svgCode?: string;      // Raw SVG code (for vector versions)
  imageData?: string;     // WebP base64 (for raster versions)
  mimeType: string;       // 'image/svg+xml' | 'image/webp'
}
```

- SVG code stored directly as string (typically 2-20KB)
- No base64 encoding needed for SVG — it's already text
- History thumbnails: render SVG inline at small size

## Export

### SVG Export
- Direct download of SVG code as `.svg` file
- Filename: `{slug}-mark-{numeral}.svg`

### PNG Export from SVG
- Render SVG to `<canvas>` at user-chosen resolution
- Convert canvas to PNG blob
- Default resolution: 2x the viewBox dimensions
- Filename: `{slug}-mark-{numeral}.png`

## Risks / Trade-offs
- **SVG quality variance**: Gemini 3.1 may produce inconsistent SVG quality → refinement helps iterate
- **Sanitization completeness**: Must be thorough to prevent XSS → use allowlist approach for SVG elements/attributes
- **Animation complexity**: SMIL + CSS animations can conflict → prefer CSS animations, use SMIL as fallback
- **Style compatibility**: Some visual styles produce weak SVG results → filtering mitigates this, user can still experiment

## Open Questions
- Should Interactive mode SVGs support hover tooltips or just visual hover effects?
- Should we add a resolution picker for PNG export from SVG? (1x, 2x, 4x)

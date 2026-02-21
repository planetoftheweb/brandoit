# Change: Add Gemini SVG Generation

**Depends on**: `add-generation-versioning` (versioning system must be in place first)

## Why
BranDoIt currently generates only raster images. Gemini 3.1 Pro can generate high-quality SVG code as text output, enabling vector graphics that are infinitely scalable, tiny in file size, and can include animations and interactivity. This opens up a new class of brand assets (animated logos, icons, illustrations) that raster generation cannot produce.

## What Changes
- New model option "Gemini SVG" in the model selector (third model alongside Nano Banana and GPT Image)
- New service for SVG generation using Gemini 3.1 Pro's text generation endpoint (not image generation)
- Inline SVG rendering with sanitization (strip `<script>` tags and event handlers)
- Animation toggle (play/pause) and speed control for animated SVGs
- Three SVG output modes: Static, Animated, Interactive
- Vector-specific visual styles with raster/vector/both icon indicators on style definitions
- SVG-aware refinement: conversational chain with quick actions (Simplify, Add Detail, Toggle Animation, Change Palette, Make Bolder)
- Copy SVG code button
- Export as `.svg` or rasterize to `.png` at chosen resolution
- SVG versions stored as code strings (2-20KB vs 500KB+ for raster)

## Impact
- Affected types: `types.ts` (GenerationVersion.svgCode, SVG mode types)
- New service: `svgService.ts` (Gemini 3.1 Pro text generation for SVG)
- Affected constants: `constants.ts` (SUPPORTED_MODELS, VISUAL_STYLES with type indicators)
- Affected components: `ImageDisplay.tsx` (inline SVG renderer, animation controls), `ControlPanel.tsx` (SVG mode selector, vector style filtering), `RecentGenerations.tsx` (SVG thumbnail rendering)
- Affected services: `historyService.ts` (SVG version storage), `aspectRatioService.ts` (SVG viewport mapping)
- New visual styles: Vector-optimized styles added to constants and seeded to Firestore

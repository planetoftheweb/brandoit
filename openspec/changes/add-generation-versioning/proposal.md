# Change: Add Generation Versioning

## Why
Currently, every refinement and annotation creates a separate, disconnected history item. Users lose the creative lineage between an original generation and its iterations. A versioning system groups related generations together, preserving the full evolution of an asset from first draft through final annotation.

## What Changes
- **BREAKING**: `GenerationHistoryItem` type replaced by `Generation` with nested `Version[]`
- New data model: each generation contains ordered versions (Mark I, Mark II, Mark III...)
- Refinements create a new version under the same generation instead of a new history entry
- Annotations (Fabric.js) treated as overlay layers per version, not as separate versions — base image stays clean, layers toggle on/off, edit in place
- Version navigator UI in ImageDisplay (dropdown to walk through Marks)
- History cards show the latest version thumbnail with a Mark badge
- WebP storage format for ~40% size reduction over PNG (with PNG export support)
- Conversational refinement history visible in the refinement panel
- Admin-only Firestore persistence; generous localStorage limits for all users
- Export filenames include Roman numeral version: `{name}-mark-ii.png`

## Impact
- Affected types: `types.ts` (GenerationHistoryItem → Generation + Version)
- Affected services: `historyService.ts` (version CRUD, migration), `imageService.ts` (WebP conversion)
- Affected components: `ImageDisplay.tsx` (version navigator, annotation layer toggle/rendering), `RecentGenerations.tsx` (Mark badges, grouped display), `ControlPanel.tsx` (refinement panel upgrade), `App.tsx` (generation flow, refinement flow)
- Affected services: `geminiService.ts`, `openaiService.ts` (return format changes)
- Storage: localStorage schema change (migration needed), Firestore schema change (admin only)

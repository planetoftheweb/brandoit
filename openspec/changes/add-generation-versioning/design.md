## Context
BranDoIt currently stores each generation as a flat, independent history item. Refinements and annotations produce new standalone items with no relationship to the original. This loses the creative lineage and clutters the history grid. The versioning system introduces a parent–child relationship: one Generation contains multiple Versions (Marks).

## Goals
- Group refinements under a single generation entity as versioned Marks
- Non-destructive annotations as a layer overlay (not a version) — base image stays clean
- Version navigation: users can walk through Mark I → Mark II → Mark III
- Annotation layer toggleable on/off per version, editable in place
- Smaller storage footprint with WebP format
- Clean export with Roman numeral naming (flatten base + annotation layer at export time)
- Backward-compatible migration of existing history items

## Non-Goals
- Branching/forking (versions are linear, not a tree)
- Collaborative editing (single-user version history)
- Undo/redo within annotations (Fabric.js handles this internally per session)
- Diff view between versions

## Data Model

### Generation (replaces GenerationHistoryItem)
```typescript
interface Generation {
  id: string;
  createdAt: number;
  config: GenerationConfig;
  modelId: string;
  versions: GenerationVersion[];
  currentVersionIndex: number;
}

interface GenerationVersion {
  id: string;
  number: number;           // 1, 2, 3...
  label: string;            // "Mark I", "Mark II"
  timestamp: number;
  type: 'generation' | 'refinement';

  // Content
  imageData: string;        // WebP base64 for raster (or SVG code in future)
  mimeType: string;         // 'image/webp' | 'image/svg+xml' (future)

  // Context
  refinementPrompt?: string;    // What was asked to create this version
  parentVersionId?: string;     // Which version this was derived from

  // Annotation layer (overlay, not a version)
  annotationLayer?: string;     // Fabric.js JSON — composited on top at render time
  annotationVisible?: boolean;  // Toggle layer visibility (default: true if layer exists)
}
```

### Roman Numeral Labels
- Version 1 → Mark I
- Version 2 → Mark II
- Version 10 → Mark X
- Export: `sunset-logo-mark-iii.webp` or `sunset-logo-mark-iii.png`

## Decisions

### Storage Strategy
- **localStorage (all users)**: Full generation objects with base64 in versions. Generous limits — let the browser's ~5-10MB quota be the natural constraint. Store WebP to maximize what fits.
- **Firestore (admin only)**: Generation metadata + Firebase Storage URLs for image data. Admin detection via a flag on the user document or a hardcoded UID check initially.
- **Decision**: Start with localStorage only. Add Firestore/Storage persistence for admin accounts as a follow-up within this change.

### WebP Conversion
- Convert raster images to WebP client-side using `<canvas>.toBlob('image/webp', 0.90)` before storing.
- Original API response (PNG) is received, displayed immediately, then converted to WebP for persistence.
- Export as PNG: re-render from WebP via canvas → PNG blob. Quality loss is negligible for AI-generated images.
- Export as WebP: direct download of stored data.

### Annotation Layer Architecture
Current Fabric.js annotations are destructive (drawn on canvas, exported as flat image). New approach treats annotations as an **overlay layer**, not a version:

1. Each version can optionally have ONE annotation layer (`annotationLayer` field)
2. The annotation layer is Fabric.js JSON (~1-5KB) stored alongside the version
3. At render time, the base image renders first, then the annotation layer composites on top
4. The annotation layer can be **toggled on/off** without affecting the base image
5. The annotation layer can be **edited in place** (updates the JSON, no new Mark created)
6. At export time, base + layer are flattened to a single image for download
7. If the user wants a clean export, they toggle annotations off before downloading

**Why layers, not versions:**
- Storage: ~1-5KB of JSON vs ~200-500KB duplicate WebP per annotation
- Editing: Live editing of the layer vs frozen copies requiring new Marks
- Semantics: Annotations decorate content, they don't create new content
- Flexibility: Toggle annotations on/off on any version

### Version Types
| Type | Trigger | What's Stored |
|------|---------|---------------|
| `generation` | Initial "Generate" click | Full image from API |
| `refinement` | Refinement prompt submitted | New image from API + prompt |

Annotations are NOT a version type. They are an optional overlay layer per version.

### History Card Display
- Each card = one Generation (not one version)
- Thumbnail shows the latest version
- Small badge: "Mark III" (or just "III") in corner
- Clicking restores to ImageDisplay with version navigator
- Version navigator: dropdown or horizontal pill bar showing Mark I, II, III...

### Migration
- On first load after update, detect old format (`GenerationHistoryItem[]` without `versions` property)
- Wrap each old item into a `Generation` with a single `GenerationVersion` (Mark I, type: 'generation')
- Convert existing base64 PNG to WebP during migration
- Migration runs once, replaces localStorage key

## Risks / Trade-offs
- **localStorage size**: WebP helps but heavy users may still hit limits → show a warning when nearing quota, suggest clearing old generations
- **WebP quality**: Lossy at 0.90 quality is imperceptible for AI art, but technically not lossless → acceptable trade-off for 40% size savings
- **Annotation state size**: Fabric.js JSON can be large with many objects → compress with LZ-string if needed (defer until proven necessary)
- **Migration**: One-time conversion could be slow with many items → show loading indicator during migration

## Open Questions
- Should there be a maximum version count per generation? (Current answer: no, let storage limits be the constraint)
- Admin detection: hardcoded UID or Firestore role field? (Start with hardcoded, formalize later)

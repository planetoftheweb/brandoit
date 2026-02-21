## 1. Data Model & Types
- [ ] 1.1 Define `Generation` and `GenerationVersion` interfaces in `types.ts`
- [ ] 1.2 Add Roman numeral utility function (number → "Mark I", "Mark II", etc.)
- [ ] 1.3 Add version type enum: `'generation' | 'refinement'` (annotations are layers, not versions)
- [ ] 1.4 Update `GeneratedImage` to include format metadata for WebP support
- [ ] 1.5 Deprecate `GenerationHistoryItem` (keep temporarily for migration reference)

## 2. WebP Conversion
- [ ] 2.1 Create `imageConversionService.ts` with `toWebP(base64Png): Promise<string>` using canvas
- [ ] 2.2 Add `toPng(base64Webp): Promise<Blob>` for PNG export
- [ ] 2.3 Add `toDataUrl(base64, mimeType): string` helper
- [ ] 2.4 Integrate WebP conversion into generation pipeline (convert before storing)

## 3. History Service Refactor
- [ ] 3.1 Refactor `historyService.ts` to use `Generation[]` instead of `GenerationHistoryItem[]`
- [ ] 3.2 Add `addVersion(generationId, version)` method
- [ ] 3.3 Add `getGeneration(id)` method
- [ ] 3.4 Add `getCurrentVersion(generationId)` helper
- [ ] 3.5 Write migration function: detect old format → convert to versioned format
- [ ] 3.6 Run migration automatically on first load (with loading state)
- [ ] 3.7 Update localStorage key/schema (bump version identifier)

## 4. Generation Pipeline Update
- [ ] 4.1 Update `App.tsx` generation flow: create `Generation` with Mark I on first generate
- [ ] 4.2 Update refinement flow: add new `GenerationVersion` (type: 'refinement') to existing generation
- [ ] 4.3 Pass `refinementPrompt` into version metadata
- [ ] 4.4 Update `geminiService.ts` response handling for WebP conversion
- [ ] 4.5 Update `openaiService.ts` response handling for WebP conversion

## 5. Annotation Layer System
- [ ] 5.1 Modify annotation save flow: serialize Fabric.js state to JSON, store as `annotationLayer` on the current version
- [ ] 5.2 Render annotations as a composited overlay on top of the base image (not flattened into imageData)
- [ ] 5.3 Add annotation layer visibility toggle (show/hide annotations without losing them)
- [ ] 5.4 Support editing existing annotation layer in place (update JSON, no new Mark)
- [ ] 5.5 When restoring a version with an annotation layer, reload Fabric.js state for continued editing
- [ ] 5.6 At export time, flatten base image + annotation layer into final output (if annotations visible)

## 6. ImageDisplay Version Navigator
- [ ] 6.1 Add version dropdown/pill bar to ImageDisplay component
- [ ] 6.2 Show current Mark label (e.g., "Mark III")
- [ ] 6.3 Navigate between versions (update displayed image)
- [ ] 6.4 Show version type icon (generation/refinement) and annotation layer indicator if present
- [ ] 6.5 Show refinement prompt for refinement versions on hover/click

## 7. Refinement Panel Upgrade
- [ ] 7.1 Show conversational refinement history (mini thread of prompt → result pairs)
- [ ] 7.2 Each entry shows the prompt and links to its Mark
- [ ] 7.3 Quick action chips for common refinements (Simplify, Bolder, Change Palette)
- [ ] 7.4 Maintain same text input + send pattern for custom refinements

## 8. History Grid Update
- [ ] 8.1 Update `RecentGenerations.tsx` to display `Generation` objects
- [ ] 8.2 Show latest version as thumbnail
- [ ] 8.3 Add Mark badge to card corner (e.g., "III" or "Mark III")
- [ ] 8.4 Single card per generation (not per version)
- [ ] 8.5 Restore loads generation with all versions into ImageDisplay

## 9. Export Updates
- [ ] 9.1 Update download to use Roman numeral filename: `{slug}-mark-{numeral}.{ext}`
- [ ] 9.2 Add "Export as PNG" option (converts WebP → PNG via canvas)
- [ ] 9.3 Add "Export as WebP" option (direct download)
- [ ] 9.4 Preserve export for specific versions (not just latest)

## 10. Admin Firestore Persistence (Stretch)
- [ ] 10.1 Add admin detection (hardcoded UID or user role field)
- [ ] 10.2 For admin: sync generations to Firestore `users/{userId}/generations` collection
- [ ] 10.3 Store image data in Firebase Storage, references in Firestore
- [ ] 10.4 Load from Firestore on login (admin only)
- [ ] 10.5 Merge local + remote on login (similar to current history merge)

## 11. Verification
- [ ] 11.1 Test generation → refinement flow creates proper version chain (Mark I → Mark II)
- [ ] 11.2 Test annotation layer: draw on Mark I, save, verify base image untouched
- [ ] 11.3 Test annotation toggle: show/hide layer, verify base image renders correctly both ways
- [ ] 11.4 Test annotation editing: reopen layer, modify, save — verify no new Mark created
- [ ] 11.5 Test export with annotations visible (flattened) and hidden (clean base)
- [ ] 11.6 Test version navigation (forward/backward through Marks)
- [ ] 11.7 Test migration of existing localStorage history
- [ ] 11.8 Test export with Roman numeral filenames
- [ ] 11.9 Test WebP conversion quality and size savings
- [ ] 11.10 Test both light and dark mode for all new UI elements

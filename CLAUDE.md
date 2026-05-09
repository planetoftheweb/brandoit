# BranDolt – Developer Notes

## VPN / Corporate Proxy – Image Cache Contract

**History of regressions**: VPN-blocking of `firebasestorage.googleapis.com` has caused image failures at least 3 times (08d54a2, f41d8ac, and the current session). Each time the fix involved the IndexedDB blob cache in `services/imageCache.ts`.

### How it works

Images are stored in Firebase Storage after upload. On VPN, the Storage domain is blocked, so `<img src="https://firebasestorage...">` fails. The fallback chain:

1. `onError` fires on the `<img>` element (see `handleImageLoadError` in `RecentGenerations.tsx`, `handleImageError` / `handleVersionImageError` in `ImageDisplay.tsx`)
2. Falls back to inline `imageData` (base64) if present (new generations not yet uploaded)
3. Falls back to `getCachedImageBlobUrl(generationId, versionId)` in IndexedDB

### The critical invariant (easy to break)

**`cacheImageFromBase64` MUST be called BEFORE `uploadGenerationImage`** inside `serializeGenerationForRemote` in `services/historyService.ts`.

If cache seeding comes AFTER the upload and the upload throws (VPN blocks Storage), the cache is never populated and the image is unrecoverable on VPN.

Current safe ordering (do NOT reverse):
```
void cacheImageFromBase64(...)   // 1. seed IDB — fire-and-forget, no network
const uploaded = await uploadGenerationImage(...)   // 2. upload to Storage (may throw on VPN)
```

### Regression checklist

Run this before shipping any change to `historyService.ts`, `imageCache.ts`, `ImageDisplay.tsx`, or `RecentGenerations.tsx`:

1. **Off-VPN priming**: Open the app, generate or load 3+ images, confirm they display.
2. **Enable VPN** (anything that blocks `firebasestorage.googleapis.com`).
3. **Hard-reload** the page (Cmd+Shift+R) — bypass browser cache.
4. **Confirm**: All gallery thumbnails still display (served from IndexedDB).
5. **Confirm**: Clicking a tile shows the full preview image.
6. **Generate a new image on VPN**: It should display immediately (inline base64 fallback), and the tile should still show after a hard-reload on VPN (served from IDB — because the IDB was seeded BEFORE the upload was attempted).
7. **Turn VPN off** and hard-reload — Storage URL loads; IDB entries survive (no spurious pruning).

### Diagnostics (browser DevTools)

- Application → IndexedDB → `brandoit_image_cache_v1` → `images`: check entry count and sizes.
- Console: `[imageCache]` warn lines indicate cache read/write failures.
- Console: `[ImageDisplay]` / `[RecentGenerations]` warn lines indicate fallback failures.
- Network tab: filter `firebasestorage` — on VPN these requests should fail; confirm `blob:` URLs appear in the img `src` afterwards.

### Files involved

| File | Role |
|---|---|
| `services/imageCache.ts` | IndexedDB store, `cacheImageFromBase64`, `getCachedImageBlobUrl`, `backfillImageCache` |
| `services/historyService.ts` | `serializeGenerationForRemote` (seeds cache at save), `primeImageCacheForHistory` (backfills + prunes) |
| `components/RecentGenerations.tsx` | `handleImageLoadError` — gallery tile `onError` recovery |
| `components/ImageDisplay.tsx` | `handleImageError`, `handleVersionImageError` — main preview + rail recovery |
| `components/CachedImage.tsx` | Avatar image with IDB fallback (profile photos) |

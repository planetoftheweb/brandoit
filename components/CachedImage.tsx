import React, { useEffect, useRef, useState } from 'react';
import { backfillBlobByKey, getCachedBlobUrlByKey } from '../services/imageCache';

// Drop-in replacement for `<img>` that survives the remote URL going dark.
//
// Two failure modes we care about:
//   1. Network blocks the host (VPN / corp proxy / Firebase Storage outage).
//      Default `<img>` shows broken state with no recovery path.
//   2. Cold-cache reload while offline. Same outcome.
//
// Strategy:
//   - If the remote `src` succeeds, browse it as normal AND opportunistically
//     cache it via `backfillBlobByKey` so future reloads have a local copy.
//   - If the remote `src` errors, swap to a `blob:` URL produced from
//     IndexedDB. If nothing is cached yet, fall back to the consumer's
//     `onError` handler (or render nothing further).
//
// `cacheKey` MUST be a stable identifier for this asset (e.g.
// `buildProfileImageCacheKey(userId)`) so different views see the same blob.
export interface CachedImageProps
  extends Omit<React.ImgHTMLAttributes<HTMLImageElement>, 'src'> {
  src?: string | null;
  cacheKey: string;
}

export const CachedImage: React.FC<CachedImageProps> = ({
  src,
  cacheKey,
  onError,
  ...rest
}) => {
  const [renderSrc, setRenderSrc] = useState<string | undefined>(src ?? undefined);
  const blobUrlRef = useRef<string | null>(null);

  useEffect(() => {
    setRenderSrc(src ?? undefined);
    if (src && /^https?:/i.test(src)) {
      void backfillBlobByKey(cacheKey, src);
    }
  }, [src, cacheKey]);

  useEffect(() => () => {
    if (blobUrlRef.current) {
      URL.revokeObjectURL(blobUrlRef.current);
      blobUrlRef.current = null;
    }
  }, []);

  const handleError = async (e: React.SyntheticEvent<HTMLImageElement, Event>) => {
    // Already on a blob URL — nothing left to fall back to.
    if (renderSrc?.startsWith('blob:')) {
      onError?.(e);
      return;
    }
    try {
      const cachedBlobUrl = await getCachedBlobUrlByKey(cacheKey);
      if (cachedBlobUrl) {
        if (blobUrlRef.current) URL.revokeObjectURL(blobUrlRef.current);
        blobUrlRef.current = cachedBlobUrl;
        setRenderSrc(cachedBlobUrl);
        return;
      }
    } catch {
      // Swallow — falling through to the consumer's onError below.
    }
    onError?.(e);
  };

  if (!renderSrc) return null;

  return <img src={renderSrc} onError={handleError} {...rest} />;
};

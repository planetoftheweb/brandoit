const WEBP_QUALITY = 0.90;

const loadImage = (src: string): Promise<HTMLImageElement> =>
  new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });

const toDataUrl = (base64: string, mimeType: string): string =>
  `data:${mimeType};base64,${base64}`;

export const convertToWebP = async (
  base64Data: string,
  sourceMimeType: string
): Promise<{ base64Data: string; mimeType: string }> => {
  try {
    const dataUrl = toDataUrl(base64Data, sourceMimeType);
    const img = await loadImage(dataUrl);
    const canvas = document.createElement('canvas');
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas context unavailable');
    ctx.drawImage(img, 0, 0);

    const blob: Blob = await new Promise((resolve, reject) => {
      canvas.toBlob(
        (b) => (b ? resolve(b) : reject(new Error('WebP conversion failed'))),
        'image/webp',
        WEBP_QUALITY
      );
    });

    const buffer = await blob.arrayBuffer();
    const bytes = new Uint8Array(buffer);
    let binary = '';
    for (let i = 0; i < bytes.length; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return { base64Data: btoa(binary), mimeType: 'image/webp' };
  } catch (err) {
    console.warn('WebP conversion failed, keeping original format:', err);
    return { base64Data, mimeType: sourceMimeType };
  }
};

export const webpToPngBlob = async (base64Data: string): Promise<Blob> => {
  const dataUrl = toDataUrl(base64Data, 'image/webp');
  const img = await loadImage(dataUrl);
  const canvas = document.createElement('canvas');
  canvas.width = img.naturalWidth;
  canvas.height = img.naturalHeight;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas context unavailable');
  ctx.drawImage(img, 0, 0);
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error('PNG conversion failed'))),
      'image/png'
    );
  });
};

export const makeImageUrl = (base64Data: string, mimeType: string): string =>
  toDataUrl(base64Data, mimeType);

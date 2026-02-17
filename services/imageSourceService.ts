import { GeneratedImage } from "../types";

type ImageSource = Pick<GeneratedImage, "imageUrl" | "base64Data" | "mimeType">;

const DATA_URL_REGEX = /^data:([^;,]+)?(?:;[^,]*)?;base64,(.+)$/i;

const parseDataUrl = (value?: string): { mimeType: string; base64Data: string } | null => {
  if (!value) return null;
  const match = value.match(DATA_URL_REGEX);
  if (!match) return null;
  return {
    mimeType: (match[1] || "").toLowerCase(),
    base64Data: match[2]
  };
};

const decodeBase64ToBytes = (rawBase64: string): Uint8Array => {
  const base64 = rawBase64.replace(/\s+/g, "");
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
};

export const getImagePayload = (
  image: ImageSource
): { mimeType: string; base64Data: string } | null => {
  const rawBase64 = (image.base64Data || "").trim();
  const rawMimeType = (image.mimeType || "").trim().toLowerCase();

  const parsedInline = parseDataUrl(rawBase64);
  if (parsedInline?.base64Data) {
    return {
      base64Data: parsedInline.base64Data,
      mimeType: parsedInline.mimeType || rawMimeType || "image/png"
    };
  }

  if (rawBase64) {
    return {
      base64Data: rawBase64,
      mimeType: rawMimeType || "image/png"
    };
  }

  const parsedUrl = parseDataUrl((image.imageUrl || "").trim());
  if (parsedUrl?.base64Data) {
    return {
      base64Data: parsedUrl.base64Data,
      mimeType: parsedUrl.mimeType || rawMimeType || "image/png"
    };
  }

  return null;
};

export const createBlobUrlFromImage = (image: ImageSource): string | null => {
  try {
    const payload = getImagePayload(image);
    if (!payload) return null;
    const bytes = decodeBase64ToBytes(payload.base64Data);
    const blob = new Blob([bytes], { type: payload.mimeType || "image/png" });
    return URL.createObjectURL(blob);
  } catch (error) {
    console.warn("Failed to create blob URL from image payload:", error);
    return null;
  }
};

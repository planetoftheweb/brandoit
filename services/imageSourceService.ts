import { GeneratedImage } from "../types";

type ImageSource = Pick<GeneratedImage, "imageUrl" | "base64Data" | "mimeType"> & Record<string, unknown>;

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
  const rawBase64 = (
    image.base64Data ||
    (typeof image.base64 === "string" ? image.base64 : "") ||
    (typeof image.b64_json === "string" ? image.b64_json : "") ||
    (typeof image.b64Json === "string" ? image.b64Json : "") ||
    (typeof image.imageBytes === "string" ? image.imageBytes : "")
  ).trim();

  const rawMimeType = (
    image.mimeType ||
    (typeof image.mime === "string" ? image.mime : "") ||
    (typeof image.contentType === "string" ? image.contentType : "")
  ).trim().toLowerCase();

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

export const getBlobFromImageSource = (image: ImageSource): Blob | null => {
  try {
    const payload = getImagePayload(image);
    if (!payload) return null;
    const bytes = decodeBase64ToBytes(payload.base64Data);
    return new Blob([bytes], { type: payload.mimeType || "image/png" });
  } catch (error) {
    console.warn("Failed to build blob from image payload:", error);
    return null;
  }
};

export const createBlobUrlFromImage = (image: ImageSource): string | null => {
  try {
    const blob = getBlobFromImageSource(image);
    if (!blob) return null;
    return URL.createObjectURL(blob);
  } catch (error) {
    console.warn("Failed to create blob URL from image payload:", error);
    return null;
  }
};

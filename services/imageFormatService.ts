import { Generation, GenerationVersion } from "../types";
import { buildExportFilename } from "./versionUtils";
import { webpToPngBlob, makeImageUrl } from "./imageConversionService";
import { getBlobFromImageSource } from "./imageSourceService";

/**
 * Supported download targets.
 *   - "png"      -> PNG raster. SVG sources are rasterized.
 *   - "webp"     -> WebP raster. SVG sources are rasterized to PNG fallback.
 *   - "svg"      -> SVG markup (only valid for SVG versions).
 *   - "html"     -> HTML page wrapping SVG markup (only valid for SVG versions).
 *   - "original" -> Use the version's native format as-is.
 */
export type DownloadFormat = "png" | "webp" | "svg" | "html" | "original";

export interface DownloadPayload {
  blob: Blob;
  filename: string;
  mimeType: string;
}

export const isSvgVersion = (version: GenerationVersion | null | undefined): boolean =>
  !!version && version.mimeType === "image/svg+xml";

export const extensionForMime = (mime: string): string => {
  const m = (mime || "").toLowerCase();
  if (m === "image/svg+xml") return "svg";
  if (m === "image/png") return "png";
  if (m === "image/jpeg" || m === "image/jpg") return "jpg";
  if (m === "image/webp") return "webp";
  if (m === "image/gif") return "gif";
  return "png";
};

const loadImageFromSrc = (src: string): Promise<HTMLImageElement> =>
  new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = (e) => reject(e);
    img.src = src;
  });

/**
 * Rasterize an SVG string to PNG at 2x the intrinsic size.
 */
export const svgCodeToPngBlob = async (svgCode: string): Promise<Blob> => {
  const svgBlob = new Blob([svgCode], { type: "image/svg+xml;charset=utf-8" });
  const url = URL.createObjectURL(svgBlob);
  try {
    const img = await loadImageFromSrc(url);
    const scale = 2;
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, img.naturalWidth * scale);
    canvas.height = Math.max(1, img.naturalHeight * scale);
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas context unavailable");
    ctx.scale(scale, scale);
    ctx.drawImage(img, 0, 0);
    return await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (b) => (b ? resolve(b) : reject(new Error("PNG conversion failed"))),
        "image/png"
      );
    });
  } finally {
    URL.revokeObjectURL(url);
  }
};

/**
 * Build an HTML page that displays the SVG full-bleed on a dark background.
 */
export const buildSvgHtmlPage = (svgCode: string, title: string): string => {
  const safeTitle = (title || "SVG Graphic")
    .slice(0, 120)
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${safeTitle}</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { min-height: 100vh; display: flex; align-items: center; justify-content: center; background: #0d1117; }
  svg { max-width: 100vw; max-height: 100vh; width: auto; height: auto; }
</style>
</head>
<body>
${svgCode}
</body>
</html>`;
};

/**
 * Convert a raster HTMLImageElement to a Blob of the requested mime.
 */
const canvasBlobFromImage = async (
  img: HTMLImageElement,
  mime: "image/png" | "image/webp"
): Promise<Blob> => {
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, img.naturalWidth);
  canvas.height = Math.max(1, img.naturalHeight);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas context unavailable");
  ctx.drawImage(img, 0, 0);
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error(`${mime} conversion failed`))),
      mime,
      mime === "image/webp" ? 0.9 : undefined
    );
  });
};

/**
 * Produce a Blob in the requested format for a single version.
 *
 * - SVG version + target svg/html: direct markup.
 * - SVG version + target png/webp/original: rasterize to PNG (WebP falls back to PNG
 *   because rasterizing SVG is simpler via PNG and visually lossless enough for
 *   export purposes).
 * - Raster version + target webp: return the native webp bytes (input is webp
 *   throughout the app per historyService.createVersionFromImage).
 * - Raster version + target png: decode webp and re-encode as PNG.
 * - Raster version + target svg/html: not supported; caller should check.
 */
export const buildVersionBlob = async (
  version: GenerationVersion,
  format: DownloadFormat
): Promise<{ blob: Blob; mimeType: string; extension: string }> => {
  const svg = isSvgVersion(version);

  if (svg) {
    const svgCode = version.svgCode || "";
    if (!svgCode) throw new Error("SVG markup unavailable for this version.");
    if (format === "svg" || format === "original") {
      return {
        blob: new Blob([svgCode], { type: "image/svg+xml" }),
        mimeType: "image/svg+xml",
        extension: "svg",
      };
    }
    if (format === "html") {
      const html = buildSvgHtmlPage(svgCode, version.refinementPrompt || "SVG Graphic");
      return {
        blob: new Blob([html], { type: "text/html" }),
        mimeType: "text/html",
        extension: "html",
      };
    }
    // png / webp for SVG: rasterize to PNG.
    const png = await svgCodeToPngBlob(svgCode);
    return { blob: png, mimeType: "image/png", extension: "png" };
  }

  // Raster versions.
  if (format === "svg" || format === "html") {
    throw new Error("SVG/HTML export is only available for SVG generations.");
  }

  const nativeMime = version.mimeType || "image/webp";

  if (format === "original") {
    const blob = getBlobFromImageSource({
      imageUrl: version.imageUrl,
      base64Data: version.imageData,
      mimeType: nativeMime,
    });
    if (blob) {
      return { blob, mimeType: nativeMime, extension: extensionForMime(nativeMime) };
    }
    if (version.imageUrl) {
      const res = await fetch(version.imageUrl);
      const fetched = await res.blob();
      return { blob: fetched, mimeType: nativeMime, extension: extensionForMime(nativeMime) };
    }
    throw new Error("No image data available for export.");
  }

  if (format === "webp") {
    if (nativeMime === "image/webp") {
      const blob = getBlobFromImageSource({
        imageUrl: version.imageUrl,
        base64Data: version.imageData,
        mimeType: nativeMime,
      });
      if (blob) return { blob, mimeType: "image/webp", extension: "webp" };
    }
    // Re-encode to webp via canvas.
    const src = version.imageData
      ? makeImageUrl(version.imageData, nativeMime)
      : version.imageUrl;
    const img = await loadImageFromSrc(src);
    const webp = await canvasBlobFromImage(img, "image/webp");
    return { blob: webp, mimeType: "image/webp", extension: "webp" };
  }

  // PNG from raster: prefer dedicated webp->png for speed/fidelity.
  if (nativeMime === "image/webp" && version.imageData) {
    const png = await webpToPngBlob(version.imageData);
    return { blob: png, mimeType: "image/png", extension: "png" };
  }
  const src = version.imageData
    ? makeImageUrl(version.imageData, nativeMime)
    : version.imageUrl;
  const img = await loadImageFromSrc(src);
  const png = await canvasBlobFromImage(img, "image/png");
  return { blob: png, mimeType: "image/png", extension: "png" };
};

export const buildVersionDownload = async (
  generation: Generation,
  version: GenerationVersion,
  format: DownloadFormat
): Promise<DownloadPayload> => {
  const { blob, mimeType, extension } = await buildVersionBlob(version, format);
  const filename = buildExportFilename(
    generation.config.prompt,
    version.number,
    extension
  );
  return { blob, mimeType, filename };
};

export const downloadBlob = (blob: Blob, filename: string): void => {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
};

/**
 * List of format options available for a given version.
 */
export interface FormatOption {
  id: DownloadFormat;
  label: string;
  description?: string;
}

export const singleDownloadOptions = (
  version: GenerationVersion | null | undefined
): FormatOption[] => {
  if (!version) return [];
  if (isSvgVersion(version)) {
    return [
      { id: "svg", label: "SVG", description: "Vector markup" },
      { id: "png", label: "PNG", description: "Rasterized 2x" },
      { id: "html", label: "HTML page", description: "Self-contained page" },
    ];
  }
  return [
    { id: "png", label: "PNG" },
    { id: "webp", label: "WebP", description: "Smaller file" },
  ];
};

/**
 * Format options for batch ZIP output. SVGs always stay SVG inside the ZIP;
 * this list only affects raster items.
 */
export const batchFormatOptions: FormatOption[] = [
  { id: "original", label: "Original (WebP + SVG)", description: "No re-encoding" },
  { id: "png", label: "PNG (+ SVG kept)", description: "Re-encode rasters to PNG" },
  { id: "webp", label: "WebP (+ SVG kept)", description: "Re-encode rasters to WebP" },
];

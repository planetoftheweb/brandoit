import JSZip from "jszip";
import { Generation, GenerationVersion } from "../types";
import { getLatestVersion } from "./historyService";
import { buildExportFilename } from "./versionUtils";
import { getBlobFromImageSource } from "./imageSourceService";
import {
  buildVersionBlob,
  DownloadFormat,
  extensionForMime,
} from "./imageFormatService";

const blobForVersionOriginal = async (v: GenerationVersion): Promise<Blob> => {
  if (v.mimeType === "image/svg+xml" && v.svgCode) {
    return new Blob([v.svgCode], { type: "image/svg+xml" });
  }
  const fromMemory = getBlobFromImageSource({
    imageUrl: v.imageUrl,
    base64Data: v.imageData,
    mimeType: v.mimeType,
  });
  if (fromMemory) return fromMemory;
  if (!v.imageUrl) {
    throw new Error("No image data available for export.");
  }
  const res = await fetch(v.imageUrl);
  if (!res.ok) {
    throw new Error("Failed to load image for export.");
  }
  return res.blob();
};

const uniqueZipEntryName = (base: string, used: Set<string>, genId: string): string => {
  if (!used.has(base)) return base;
  const dot = base.lastIndexOf(".");
  const stem = dot >= 0 ? base.slice(0, dot) : base;
  const ext = dot >= 0 ? base.slice(dot) : "";
  return `${stem}-${genId.slice(0, 8)}${ext}`;
};

interface BuildZipOptions {
  /** Output format for raster items; SVGs always stay SVG. Defaults to "original". */
  format?: DownloadFormat;
}

export const buildGenerationsZipBlob = async (
  generations: Generation[],
  options: BuildZipOptions = {}
): Promise<Blob> => {
  if (generations.length === 0) {
    throw new Error("No generations selected.");
  }
  const format: DownloadFormat = options.format || "original";
  const zip = new JSZip();
  const usedNames = new Set<string>();

  for (const gen of generations) {
    // Batch-generated tiles stack every variation on one Generation as
    // Mark I, Mark II, Mark III… Exporting only the latest would silently
    // drop the rest, so fan out over every "generation"-type version and
    // fall back to the latest for tiles that only have refinements.
    const generationVersions = gen.versions.filter((v) => v.type === "generation");
    const versionsToExport: GenerationVersion[] =
      generationVersions.length > 0 ? generationVersions : [getLatestVersion(gen)];

    for (const v of versionsToExport) {
      let blob: Blob;
      let extension: string;

      if (format === "original") {
        blob = await blobForVersionOriginal(v);
        extension =
          v.mimeType === "image/svg+xml" && v.svgCode
            ? "svg"
            : extensionForMime(v.mimeType || "image/png");
      } else {
        // Delegate to the shared format service so SVG stays SVG and rasters
        // re-encode consistently with the single-image download flow.
        const built = await buildVersionBlob(v, format);
        blob = built.blob;
        extension = built.extension;
      }

      // Prefer the per-mark prompt stashed in refinementPrompt when batching
      // brace expansions so each file's name reflects what produced it.
      const promptForName = v.refinementPrompt || gen.config.prompt;
      const baseName = buildExportFilename(promptForName, v.number, extension);
      const entryName = uniqueZipEntryName(baseName, usedNames, `${gen.id}-${v.id}`);
      usedNames.add(entryName);
      const buf = await blob.arrayBuffer();
      zip.file(entryName, buf);
    }
  }

  return zip.generateAsync({ type: "blob" });
};

export const downloadBlobAsFile = (blob: Blob, filename: string): void => {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
};

export const defaultBatchExportFilename = (): string => {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `brandoit-export-${y}-${m}-${day}.zip`;
};

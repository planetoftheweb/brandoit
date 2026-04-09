import JSZip from "jszip";
import { Generation } from "../types";
import { getLatestVersion } from "./historyService";
import { buildExportFilename } from "./versionUtils";
import { getBlobFromImageSource } from "./imageSourceService";

const extensionForMime = (mime: string): string => {
  const m = mime.toLowerCase();
  if (m === "image/svg+xml") return "svg";
  if (m === "image/png") return "png";
  if (m === "image/jpeg" || m === "image/jpg") return "jpg";
  if (m === "image/webp") return "webp";
  if (m === "image/gif") return "gif";
  return "png";
};

const blobForLatestVersion = async (gen: Generation): Promise<Blob> => {
  const v = getLatestVersion(gen);
  if (v.mimeType === "image/svg+xml" && v.svgCode) {
    return new Blob([v.svgCode], { type: "image/svg+xml" });
  }
  const fromMemory = getBlobFromImageSource({
    imageUrl: v.imageUrl,
    base64Data: v.imageData,
    mimeType: v.mimeType
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

export const buildGenerationsZipBlob = async (generations: Generation[]): Promise<Blob> => {
  if (generations.length === 0) {
    throw new Error("No generations selected.");
  }
  const zip = new JSZip();
  const usedNames = new Set<string>();

  for (const gen of generations) {
    const v = getLatestVersion(gen);
    const ext =
      v.mimeType === "image/svg+xml" && v.svgCode
        ? "svg"
        : extensionForMime(v.mimeType || "image/png");
    const baseName = buildExportFilename(gen.config.prompt, v.number, ext);
    const entryName = uniqueZipEntryName(baseName, usedNames, gen.id);
    usedNames.add(entryName);
    const blob = await blobForLatestVersion(gen);
    const buf = await blob.arrayBuffer();
    zip.file(entryName, buf);
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

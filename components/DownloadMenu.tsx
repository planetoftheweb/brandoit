import React, { useRef, useState, useEffect } from "react";
import {
  Download,
  Loader2,
  Archive,
  ChevronDown,
  Image as ImageIcon,
  FileCode,
} from "lucide-react";
import { Generation } from "../types";
import { getCurrentVersion } from "../services/historyService";
import {
  DownloadFormat,
  buildVersionDownload,
  downloadBlob,
  singleDownloadOptions,
  batchFormatOptions,
} from "../services/imageFormatService";
import {
  buildGenerationsZipBlob,
  downloadBlobAsFile,
  defaultBatchExportFilename,
} from "../services/batchExportService";

export type DownloadMenuMode = "this-and-all" | "all-only";

interface DownloadMenuProps {
  mode: DownloadMenuMode;
  currentGeneration?: Generation | null;
  allGenerations?: Generation[];
  allLabel?: string;
  triggerClassName?: string;
  triggerLabel?: string;
  triggerTitle?: string;
  icon?: React.ReactNode;
  disabled?: boolean;
  align?: "left" | "right";
  onNotify?: (message: string) => void;
}

export const DownloadMenu: React.FC<DownloadMenuProps> = ({
  mode,
  currentGeneration,
  allGenerations,
  allLabel,
  triggerClassName,
  triggerLabel,
  triggerTitle,
  icon,
  disabled = false,
  align = "right",
  onNotify,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [isOpen]);

  const version = currentGeneration ? getCurrentVersion(currentGeneration) : null;
  const thisFormats = singleDownloadOptions(version);
  const allCount = allGenerations?.length ?? 0;

  const notify = (message: string) => {
    onNotify?.(message);
  };

  const runThis = async (format: DownloadFormat) => {
    if (!currentGeneration || !version) return;
    setBusy(true);
    setIsOpen(false);
    try {
      const payload = await buildVersionDownload(currentGeneration, version, format);
      downloadBlob(payload.blob, payload.filename);
      notify(`${format.toUpperCase()} download started`);
    } catch (err) {
      console.error("Download failed:", err);
      notify("Download failed");
    } finally {
      setBusy(false);
    }
  };

  const runAll = async (format: DownloadFormat) => {
    if (!allGenerations || allGenerations.length === 0) return;
    setBusy(true);
    setIsOpen(false);
    try {
      const zip = await buildGenerationsZipBlob(allGenerations, { format });
      downloadBlobAsFile(zip, defaultBatchExportFilename());
      const n = allGenerations.length;
      notify(`ZIP download started (${n} item${n === 1 ? "" : "s"})`);
    } catch (err) {
      console.error("ZIP failed:", err);
      notify("ZIP download failed");
    } finally {
      setBusy(false);
    }
  };

  const canThis = mode !== "all-only" && !!currentGeneration && !!version;
  const canAll = allCount > 0;
  const isDisabled = disabled || busy || (!canThis && !canAll);

  const defaultTriggerClasses =
    "inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-gray-200 dark:border-[#30363d] bg-white dark:bg-[#0d1117] text-slate-800 dark:text-slate-100 hover:bg-brand-teal hover:border-brand-teal hover:text-white transition text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed";

  const triggerIcon = busy ? (
    <Loader2 size={16} className="animate-spin" />
  ) : (
    icon ?? <Download size={16} />
  );

  const showTriggerText = !!triggerLabel || (mode === "all-only" && canAll);
  const resolvedLabel =
    triggerLabel ?? (mode === "all-only" ? allLabel || `Download (${allCount})` : undefined);

  return (
    <div ref={wrapperRef} className="relative inline-block">
      <button
        type="button"
        onClick={() => !isDisabled && setIsOpen((v) => !v)}
        disabled={isDisabled}
        title={triggerTitle || "Download"}
        aria-haspopup="menu"
        aria-expanded={isOpen}
        aria-label={triggerTitle || resolvedLabel || "Download"}
        className={triggerClassName || defaultTriggerClasses}
      >
        {triggerIcon}
        {showTriggerText && resolvedLabel ? <span>{resolvedLabel}</span> : null}
        <ChevronDown size={14} className="opacity-70" aria-hidden="true" />
      </button>

      {isOpen && (
        <div
          role="menu"
          className={`absolute ${
            align === "left" ? "left-0" : "right-0"
          } top-full mt-2 z-50 w-64 bg-white dark:bg-[#161b22] border border-gray-200 dark:border-[#30363d] rounded-xl shadow-xl overflow-hidden text-sm`}
        >
          {canThis && thisFormats.length > 0 && (
            <div className="p-1">
              <div className="px-3 pt-2 pb-1 text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                Download this
              </div>
              {thisFormats.map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  role="menuitem"
                  onClick={() => runThis(opt.id)}
                  className="w-full flex items-center justify-between gap-2 px-3 py-2 rounded-md hover:bg-gray-100 dark:hover:bg-[#21262d] text-slate-800 dark:text-slate-100 transition text-left"
                >
                  <span className="flex items-center gap-2">
                    {opt.id === "svg" || opt.id === "html" ? (
                      <FileCode size={14} aria-hidden="true" />
                    ) : (
                      <ImageIcon size={14} aria-hidden="true" />
                    )}
                    <span className="font-medium">{opt.label}</span>
                  </span>
                  {opt.description && (
                    <span className="text-xs text-slate-500 dark:text-slate-400">
                      {opt.description}
                    </span>
                  )}
                </button>
              ))}
            </div>
          )}

          {canThis && canAll && (
            <div
              className="border-t border-gray-200 dark:border-[#30363d]"
              aria-hidden="true"
            />
          )}

          {canAll && (
            <div className="p-1">
              <div className="px-3 pt-2 pb-1 text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                {allLabel || `Download all (${allCount})`}
              </div>
              {batchFormatOptions.map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  role="menuitem"
                  onClick={() => runAll(opt.id)}
                  className="w-full flex items-center justify-between gap-2 px-3 py-2 rounded-md hover:bg-gray-100 dark:hover:bg-[#21262d] text-slate-800 dark:text-slate-100 transition text-left"
                >
                  <span className="flex items-center gap-2">
                    <Archive size={14} aria-hidden="true" />
                    <span className="font-medium">{opt.label}</span>
                  </span>
                  {opt.description && (
                    <span className="text-xs text-slate-500 dark:text-slate-400">
                      {opt.description}
                    </span>
                  )}
                </button>
              ))}
            </div>
          )}

          {!canThis && !canAll && (
            <div className="p-3 text-xs text-slate-500 dark:text-slate-400">
              Nothing available to download yet.
            </div>
          )}
        </div>
      )}
    </div>
  );
};

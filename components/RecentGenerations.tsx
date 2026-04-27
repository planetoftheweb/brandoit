import React from 'react';
import { Generation, BrandColor, VisualStyle, GraphicType, AspectRatioOption } from '../types';
import { Clock, Copy, ArrowUpRight, Trash2, Download, Link, Image as ImageIcon, FileCode, Archive, CheckSquare, Square, GitCompare } from 'lucide-react';
import { sanitizeSvg } from '../services/svgService';
import { describeImagePrompt } from '../services/geminiService';
import { createBlobUrlFromImage } from '../services/imageSourceService';
import { getLatestVersion } from '../services/historyService';
import { buildExportFilename } from '../services/versionUtils';
import { DownloadMenu } from './DownloadMenu';

interface RecentGenerationsMarkRef {
  generationId: string;
  versionId: string;
  imageUrl: string;
  mimeType: string;
  modelId: string;
  markLabel: string;
  aspectRatio?: string;
}

interface RecentGenerationsProps {
  history: Generation[];
  onSelect: (gen: Generation) => void;
  onDelete: (generationId: string) => void;
  options: {
    brandColors: BrandColor[];
    visualStyles: VisualStyle[];
    graphicTypes: GraphicType[];
    aspectRatios: AspectRatioOption[];
  };
  /** True when the app is in compare-pick mode — tile clicks should pick marks. */
  isComparePicking?: boolean;
  /** Pick the latest mark of a tile as an A/B for comparison. */
  onPickMark?: (ref: RecentGenerationsMarkRef) => void;
  /** Batch ids for currently-picked A/B marks, used to render "picked" badge. */
  pickedMarkIds?: { a?: string; b?: string };
}

export const RecentGenerations: React.FC<RecentGenerationsProps> = ({ 
  history, 
  onSelect,
  onDelete,
  options,
  isComparePicking,
  onPickMark,
  pickedMarkIds
}) => {
  const [copyLoadingId, setCopyLoadingId] = React.useState<string | null>(null);
  const [toastMessage, setToastMessage] = React.useState<string | null>(null);
  const [imageSrcById, setImageSrcById] = React.useState<Record<string, string>>({});
  const [selectionMode, setSelectionMode] = React.useState(false);
  const [selectedIds, setSelectedIds] = React.useState<string[]>([]);
  const toastTimerRef = React.useRef<number | null>(null);
  const blobUrlsRef = React.useRef<Record<string, string>>({});

  const exitSelectionMode = React.useCallback(() => {
    setSelectionMode(false);
    setSelectedIds([]);
  }, []);

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  React.useEffect(() => {
    if (!selectionMode) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') exitSelectionMode();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selectionMode, exitSelectionMode]);

  React.useEffect(() => {
    const valid = new Set(history.map((g) => g.id));
    setSelectedIds((prev) => prev.filter((id) => valid.has(id)));
  }, [history]);

  // Items that the "download all" menu operates on: selected items when the
  // user has made a selection; otherwise the full visible history.
  const downloadScope = React.useMemo(() => {
    if (selectedIds.length === 0) return history;
    return history.filter((g) => selectedIds.includes(g.id));
  }, [history, selectedIds]);
  const downloadScopeLabel =
    selectedIds.length > 0
      ? `Download selected (${selectedIds.length})`
      : `Download all (${history.length})`;

  React.useEffect(() => {
    return () => {
      if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current);
    };
  }, []);

  React.useEffect(() => {
    return () => {
      Object.values(blobUrlsRef.current).forEach((url) => URL.revokeObjectURL(url));
      blobUrlsRef.current = {};
    };
  }, []);

  React.useEffect(() => {
    const activeIds = new Set(history.map((gen) => gen.id));
    const staleIds = Object.keys(blobUrlsRef.current).filter((id) => !activeIds.has(id));
    if (staleIds.length === 0) return;

    staleIds.forEach((id) => {
      URL.revokeObjectURL(blobUrlsRef.current[id]);
      delete blobUrlsRef.current[id];
    });

    setImageSrcById((prev) => {
      const next = { ...prev };
      staleIds.forEach((id) => delete next[id]);
      return next;
    });
  }, [history]);

  if (history.length === 0) return null;

  const getLabel = (id: string, list: any[]) => {
    const item = list.find(i => i.id === id || i.value === id);
    return item?.name || item?.label || id;
  };

  const getColors = (id: string) => {
    const palette = options.brandColors.find(c => c.id === id);
    if (!palette) return '';
    return `${palette.name}: ${palette.colors.join(', ')}`;
  };

  const buildFullPrompt = (gen: Generation) => {
    const cfg = gen.config;
    const typeLabel = getLabel(cfg.graphicTypeId, options.graphicTypes);
    const styleLabel = getLabel(cfg.visualStyleId, options.visualStyles);
    const styleDesc = options.visualStyles.find(s => s.id === cfg.visualStyleId)?.description || '';
    const colorsLabel = getColors(cfg.colorSchemeId);
    const colorsHex = options.brandColors.find(c => c.id === cfg.colorSchemeId)?.colors?.join(', ') || '';
    const aspectLabel = getLabel(cfg.aspectRatio, options.aspectRatios);
    const expanded = [
      `Generate a ${typeLabel}`,
      aspectLabel ? `at ${aspectLabel} aspect ratio` : '',
      styleLabel ? `in the ${styleLabel} style${styleDesc ? ` (${styleDesc})` : ''}` : '',
      colorsLabel ? `using palette ${colorsLabel}` : '',
      colorsHex ? `Use these exact hex colors: ${colorsHex}` : '',
      `Subject/Content: ${cfg.prompt}`
    ].filter(Boolean).join('. ');

    return [
      `Original Prompt: ${cfg.prompt}`,
      `Structured Prompt: ${expanded}`,
      `Type: ${typeLabel}`,
      `Style: ${styleLabel}${styleDesc ? ` (${styleDesc})` : ''}`,
      colorsLabel ? `Colors: ${colorsLabel}` : '',
      aspectLabel ? `Size: ${aspectLabel}` : ''
    ].filter(Boolean).join('\n');
  };

  const fetchImageAsBase64 = async (url: string): Promise<{ base64: string; mime: string }> => {
    const res = await fetch(url);
    const blob = await res.blob();
    const mime = blob.type || 'image/png';
    const buffer = await blob.arrayBuffer();
    const base64 = btoa(String.fromCharCode(...new Uint8Array(buffer)));
    return { base64, mime };
  };

  const copyImageToClipboard = async (url: string) => {
    try {
      const res = await fetch(url, { mode: 'cors' });
      const blob = await res.blob();
      if (navigator.clipboard && 'write' in navigator.clipboard && typeof ClipboardItem !== 'undefined') {
        await navigator.clipboard.write([new ClipboardItem({ [blob.type]: blob })]);
        showToast('Image copied');
      } else {
        await navigator.clipboard.writeText(url);
        showToast('Image URL copied');
      }
    } catch {
      try {
        await navigator.clipboard.writeText(url);
        showToast('Copied image URL (image copy blocked by browser/CORS)');
      } catch {
        showToast('Copy failed (browser/CORS permissions)');
      }
    }
  };

  const showToast = (msg: string) => {
    if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current);
    setToastMessage(msg);
    toastTimerRef.current = window.setTimeout(() => setToastMessage(null), 1800);
  };

  const getModelLabel = (modelId?: string) => {
    if (modelId === 'openai-2') return 'GPT Image 2';
    if (modelId === 'openai-mini') return 'GPT Image Mini';
    if (modelId === 'openai') return 'GPT Image 1.5';
    if (modelId === 'gemini-svg') return 'Gemini SVG';
    if (modelId === 'gemini-3.1-flash-image-preview') return 'Nano Banana 2';
    return 'Nano Banana Pro';
  };

  const formatTimestamp = (ts: number) => {
    const d = new Date(ts);
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    const rawH = d.getHours();
    const hh = String(rawH % 12 === 0 ? 12 : rawH % 12).padStart(2, '0');
    const mi = String(d.getMinutes()).padStart(2, '0');
    const ampm = rawH >= 12 ? 'PM' : 'AM';
    return `${mm}-${dd} ${hh}:${mi} ${ampm}`;
  };

  const getDisplayImageUrl = (gen: Generation): string => {
    const latestVersion = getLatestVersion(gen);
    return imageSrcById[gen.id] || latestVersion.imageUrl;
  };

  const handleImageLoadError = (gen: Generation) => {
    const currentSource = imageSrcById[gen.id];
    if (currentSource?.startsWith('blob:')) return;

    const latestVersion = getLatestVersion(gen);
    const fakeImage = { imageUrl: latestVersion.imageUrl, base64Data: latestVersion.imageData, mimeType: latestVersion.mimeType };
    const blobUrl = createBlobUrlFromImage(fakeImage);
    if (!blobUrl) return;

    const previousBlobUrl = blobUrlsRef.current[gen.id];
    if (previousBlobUrl) URL.revokeObjectURL(previousBlobUrl);

    blobUrlsRef.current[gen.id] = blobUrl;
    setImageSrcById((prev) => ({ ...prev, [gen.id]: blobUrl }));
  };

  return (
    <div className="w-full max-w-7xl mx-auto px-4 md:px-6 py-8 animate-in fade-in slide-in-from-bottom-4 duration-500 delay-150 border-t border-gray-200 dark:border-[#30363d] mt-8">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between mb-4">
        <div className="flex flex-wrap items-center gap-2 text-slate-500 dark:text-slate-400">
          <Clock size={18} />
          <h3 className="text-sm font-bold uppercase tracking-wider">Recent Generations</h3>
          <span className="text-xs text-slate-400 dark:text-slate-500">
            ({history.length} {history.length === 1 ? 'item' : 'items'})
          </span>
          {selectionMode && selectedIds.length > 0 && (
            <span className="text-xs font-semibold text-brand-teal" aria-live="polite">
              {selectedIds.length} selected
            </span>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {selectionMode ? (
            <>
              <button
                type="button"
                onClick={() => setSelectedIds(history.map((g) => g.id))}
                className="text-xs font-semibold px-3 py-2 min-h-11 rounded-lg border border-gray-300 dark:border-[#30363d] bg-white dark:bg-[#161b22] text-slate-700 dark:text-slate-200 hover:border-brand-teal hover:text-brand-teal transition"
              >
                Select all
              </button>
              <button
                type="button"
                onClick={() => setSelectedIds([])}
                className="text-xs font-semibold px-3 py-2 min-h-11 rounded-lg border border-gray-300 dark:border-[#30363d] bg-white dark:bg-[#161b22] text-slate-700 dark:text-slate-200 hover:border-brand-teal hover:text-brand-teal transition"
              >
                Clear
              </button>
              <DownloadMenu
                mode="all-only"
                allGenerations={downloadScope}
                allLabel={downloadScopeLabel}
                triggerLabel={downloadScopeLabel}
                triggerTitle={downloadScopeLabel}
                icon={<Archive size={16} aria-hidden />}
                triggerClassName="inline-flex items-center justify-center gap-2 text-xs font-semibold px-4 py-2 min-h-11 rounded-lg bg-brand-teal text-white hover:opacity-90 disabled:opacity-50 disabled:pointer-events-none transition"
                disabled={downloadScope.length === 0}
                onNotify={showToast}
                align="right"
              />
              <button
                type="button"
                onClick={exitSelectionMode}
                className="text-xs font-semibold px-3 py-2 min-h-11 rounded-lg border border-gray-300 dark:border-[#30363d] bg-white dark:bg-[#161b22] text-slate-700 dark:text-slate-200 hover:border-slate-500 transition"
              >
                Cancel
              </button>
            </>
          ) : (
            <>
              <DownloadMenu
                mode="all-only"
                allGenerations={history}
                allLabel={`Download all (${history.length})`}
                triggerLabel={`Download all (${history.length})`}
                triggerTitle="Download all as ZIP"
                icon={<Archive size={16} aria-hidden />}
                triggerClassName="inline-flex items-center justify-center gap-2 text-xs font-semibold px-4 py-2 min-h-11 rounded-lg border border-gray-300 dark:border-[#30363d] bg-white dark:bg-[#161b22] text-slate-700 dark:text-slate-200 hover:border-brand-teal hover:text-brand-teal transition disabled:opacity-50 disabled:pointer-events-none"
                disabled={history.length === 0}
                onNotify={showToast}
                align="right"
              />
              <button
                type="button"
                onClick={() => setSelectionMode(true)}
                className="inline-flex items-center justify-center gap-2 text-xs font-semibold px-4 py-2 min-h-11 rounded-lg border border-gray-300 dark:border-[#30363d] bg-white dark:bg-[#161b22] text-slate-700 dark:text-slate-200 hover:border-brand-teal hover:text-brand-teal transition"
              >
                <CheckSquare size={16} aria-hidden />
                Select for export
              </button>
            </>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
        {history.map((gen) => {
          const latestVersion = getLatestVersion(gen);
          const versionCount = gen.versions.length;
          const batchId = gen.comparisonBatchId;
          // New behavior: a comparison tile keeps every model's marks inside
          // itself, so we detect "compare" by counting distinct per-version
          // models within the tile. Legacy behavior (one tile per model with a
          // shared batchId) is still handled below as a fallback so old
          // history items keep their badge.
          const distinctTileModelIds = Array.from(
            new Set(gen.versions.map((v) => v.modelId).filter(Boolean) as string[])
          );
          const isInTileComparison = distinctTileModelIds.length > 1;
          const legacyBatchSiblings = batchId
            ? history.filter((g) => g.comparisonBatchId === batchId).length
            : 0;
          const showCompareBadge = isInTileComparison || legacyBatchSiblings > 1;
          const compareCount = isInTileComparison
            ? distinctTileModelIds.length
            : legacyBatchSiblings;
          const compareLabel = isInTileComparison
            ? `${compareCount} models`
            : `${compareCount}`;
          const isPickedSide: 'A' | 'B' | null =
            pickedMarkIds?.a && pickedMarkIds.a === `${gen.id}|${latestVersion.id}` ? 'A' :
            pickedMarkIds?.b && pickedMarkIds.b === `${gen.id}|${latestVersion.id}` ? 'B' : null;

          return (
            <div 
              key={gen.id} 
              className={`group relative bg-white dark:bg-[#161b22] border rounded-xl overflow-visible shadow-sm hover:shadow-lg transition-all ${
                isPickedSide
                  ? 'border-amber-400 ring-2 ring-amber-400/40'
                  : selectionMode && selectedIds.includes(gen.id)
                    ? 'border-brand-teal ring-2 ring-brand-teal/50 dark:ring-brand-teal/40'
                    : 'border-gray-200 dark:border-[#30363d] hover:border-brand-teal dark:hover:border-brand-teal'
              }`}
              data-comparison-batch={batchId || undefined}
            >
              {selectionMode && (
                <div className="absolute top-2 left-2 z-20">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleSelect(gen.id);
                    }}
                    className="inline-flex items-center justify-center min-h-11 min-w-11 rounded-lg border border-gray-300/80 dark:border-white/15 bg-white/95 dark:bg-[#1f252d]/95 text-slate-800 dark:text-slate-200 shadow-sm hover:bg-brand-teal hover:border-brand-teal hover:text-white focus:outline-none focus:ring-2 focus:ring-brand-teal/70"
                    aria-pressed={selectedIds.includes(gen.id)}
                    aria-label={selectedIds.includes(gen.id) ? 'Deselect generation' : 'Select generation'}
                  >
                    {selectedIds.includes(gen.id) ? <CheckSquare size={20} /> : <Square size={20} />}
                  </button>
                </div>
              )}
              {/* Mark badge */}
              {versionCount > 1 && (
                <div className={`absolute top-2 z-10 ${selectionMode ? 'left-14' : 'left-2'}`}>
                  <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/90 text-white shadow-sm">
                    {latestVersion.label}
                  </span>
                </div>
              )}
              {showCompareBadge && (
                <div
                  className={`absolute z-10 ${versionCount > 1 ? 'top-8' : 'top-2'} ${selectionMode ? 'left-14' : 'left-2'}`}
                  title={
                    isInTileComparison
                      ? `Comparison tile — ${distinctTileModelIds.map((id) => getModelLabel(id)).join(' vs ')}`
                      : `Part of a comparison run with ${legacyBatchSiblings} tiles`
                  }
                >
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-brand-teal/90 text-white shadow-sm">
                    <GitCompare size={10} />
                    Compare · {compareLabel}
                  </span>
                </div>
              )}
              {isPickedSide && (
                <div className="absolute top-2 right-2 z-20 pointer-events-none">
                  <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-amber-400 text-[11px] font-bold text-slate-900 shadow">
                    {isPickedSide}
                  </span>
                </div>
              )}

              <div className="absolute top-2 right-2 z-10 flex flex-wrap items-center justify-end gap-1 lg:gap-2 max-w-[calc(100%-1rem)] opacity-100 lg:opacity-0 lg:group-hover:opacity-100 lg:group-focus-within:opacity-100 transition-opacity">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    if (latestVersion.mimeType === 'image/svg+xml' && latestVersion.svgCode) {
                      const blob = new Blob([latestVersion.svgCode], { type: 'image/svg+xml' });
                      const url = URL.createObjectURL(blob);
                      const link = document.createElement('a');
                      link.href = url;
                      link.download = buildExportFilename(gen.config.prompt, latestVersion.number, 'svg');
                      document.body.appendChild(link);
                      link.click();
                      document.body.removeChild(link);
                      URL.revokeObjectURL(url);
                    } else {
                      const link = document.createElement('a');
                      link.href = getDisplayImageUrl(gen);
                      link.download = buildExportFilename(gen.config.prompt, latestVersion.number, 'webp');
                      document.body.appendChild(link);
                      link.click();
                      document.body.removeChild(link);
                    }
                    showToast('Download started');
                  }}
                  className="group/download relative inline-flex items-center justify-center h-8 w-8 lg:h-9 lg:w-9 rounded-md border border-gray-300/80 dark:border-white/15 bg-white/90 dark:bg-[#1f252d]/90 text-slate-800 dark:text-slate-200 shadow-sm hover:bg-brand-teal hover:border-brand-teal hover:text-white hover:shadow-md focus:outline-none focus:ring-2 focus:ring-brand-teal/70 focus:ring-offset-1 focus:ring-offset-white dark:focus:ring-offset-[#161b22] transition"
                  aria-label="Download"
                >
                  {latestVersion.mimeType === 'image/svg+xml' ? <FileCode size={16} /> : <Download size={16} />}
                  <span className="pointer-events-none absolute -top-9 left-1/2 -translate-x-1/2 whitespace-nowrap text-[11px] font-medium px-2 py-1 rounded-md bg-black/90 text-white shadow-lg opacity-0 group-hover/download:opacity-100 transition-opacity">
                    {latestVersion.mimeType === 'image/svg+xml' ? 'Download SVG' : 'Download'}
                  </span>
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    copyImageToClipboard(getDisplayImageUrl(gen));
                  }}
                  className="group/copyimg relative inline-flex items-center justify-center h-8 w-8 lg:h-9 lg:w-9 rounded-md border border-gray-300/80 dark:border-white/15 bg-white/90 dark:bg-[#1f252d]/90 text-slate-800 dark:text-slate-200 shadow-sm hover:bg-brand-teal hover:border-brand-teal hover:text-white hover:shadow-md focus:outline-none focus:ring-2 focus:ring-brand-teal/70 focus:ring-offset-1 focus:ring-offset-white dark:focus:ring-offset-[#161b22] transition"
                  aria-label="Copy image to clipboard"
                >
                  <ImageIcon size={16} />
                  <span className="pointer-events-none absolute -top-9 left-1/2 -translate-x-1/2 whitespace-nowrap text-[11px] font-medium px-2 py-1 rounded-md bg-black/90 text-white shadow-lg opacity-0 group-hover/copyimg:opacity-100 transition-opacity">
                    Copy image
                  </span>
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    navigator.clipboard.writeText(getDisplayImageUrl(gen)).catch(err => console.error('Copy image URL failed', err));
                    showToast('Image URL copied');
                  }}
                  className="group/copyurl relative inline-flex items-center justify-center h-8 w-8 lg:h-9 lg:w-9 rounded-md border border-gray-300/80 dark:border-white/15 bg-white/90 dark:bg-[#1f252d]/90 text-slate-800 dark:text-slate-200 shadow-sm hover:bg-brand-teal hover:border-brand-teal hover:text-white hover:shadow-md focus:outline-none focus:ring-2 focus:ring-brand-teal/70 focus:ring-offset-1 focus:ring-offset-white dark:focus:ring-offset-[#161b22] transition"
                  aria-label="Copy image URL"
                >
                  <Link size={16} />
                  <span className="pointer-events-none absolute -top-9 left-1/2 -translate-x-1/2 whitespace-nowrap text-[11px] font-medium px-2 py-1 rounded-md bg-black/90 text-white shadow-lg opacity-0 group-hover/copyurl:opacity-100 transition-opacity">
                    Copy image URL
                  </span>
                </button>
                <button
                  onClick={async (e) => {
                    e.stopPropagation();
                    try {
                      setCopyLoadingId(gen.id);
                      let imageDescription = '';
                      try {
                        const { base64, mime } = await fetchImageAsBase64(getDisplayImageUrl(gen));
                        imageDescription = await describeImagePrompt(base64, mime);
                      } catch (imgErr) {
                        console.warn('Image describe fallback:', imgErr);
                      }

                      const structured = buildFullPrompt(gen);
                      const finalText = imageDescription
                        ? `${structured}\n\nImage-Based Prompt: ${imageDescription}`
                        : structured;
                      await navigator.clipboard.writeText(finalText);
                      showToast('Prompt copied');
                    } catch {
                      const structured = buildFullPrompt(gen);
                      await navigator.clipboard.writeText(structured);
                      showToast('Prompt copied');
                    } finally {
                      setCopyLoadingId(null);
                    }
                  }}
                  className="group/copy relative inline-flex items-center justify-center h-8 w-8 lg:h-9 lg:w-9 rounded-md border border-gray-300/80 dark:border-white/15 bg-white/90 dark:bg-[#1f252d]/90 text-slate-800 dark:text-slate-200 shadow-sm hover:bg-brand-teal hover:border-brand-teal hover:text-white hover:shadow-md focus:outline-none focus:ring-2 focus:ring-brand-teal/70 focus:ring-offset-1 focus:ring-offset-white dark:focus:ring-offset-[#161b22] transition"
                  aria-label="Copy full prompt"
                >
                  {copyLoadingId === gen.id ? (
                    <span className="h-4 w-4 border-2 border-current border-t-transparent rounded-full animate-spin"></span>
                  ) : (
                    <Copy size={16} />
                  )}
                  <span className="pointer-events-none absolute -top-9 left-1/2 -translate-x-1/2 whitespace-nowrap text-[11px] font-medium px-2 py-1 rounded-md bg-black/90 text-white shadow-lg opacity-0 group-hover/copy:opacity-100 transition-opacity">
                    Copy prompt
                  </span>
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onDelete(gen.id);
                    showToast('Generation removed');
                  }}
                  className="group/delete relative inline-flex items-center justify-center h-8 w-8 lg:h-9 lg:w-9 rounded-md border border-red-200/80 dark:border-red-900/40 bg-white/85 dark:bg-[#2b1c1c]/80 text-red-600 dark:text-red-200 shadow-sm hover:bg-red-600 hover:border-red-600 hover:text-white hover:shadow-md focus:outline-none focus:ring-2 focus:ring-red-400/70 focus:ring-offset-1 focus:ring-offset-white dark:focus:ring-offset-[#161b22] transition"
                  aria-label="Delete"
                >
                  <Trash2 size={16} />
                  <span className="pointer-events-none absolute -top-9 left-1/2 -translate-x-1/2 whitespace-nowrap text-[11px] font-medium px-2 py-1 rounded-md bg-black/90 text-white shadow-lg opacity-0 group-hover/delete:opacity-100 transition-opacity">
                    Delete
                  </span>
                </button>
              </div>

              <div className="aspect-square w-full relative bg-gray-100 dark:bg-[#0d1117] overflow-hidden rounded-xl">
                {latestVersion.mimeType === 'image/svg+xml' && latestVersion.svgCode ? (
                  <div
                    className="w-full h-full flex items-center justify-center p-2 [&>svg]:max-w-full [&>svg]:max-h-full [&>svg]:w-auto [&>svg]:h-auto transition-transform duration-500 group-hover:scale-105"
                    dangerouslySetInnerHTML={{ __html: sanitizeSvg(latestVersion.svgCode) }}
                  />
                ) : (
                  <img 
                    src={getDisplayImageUrl(gen)} 
                    alt={gen.config.prompt} 
                    className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                    onError={() => handleImageLoadError(gen)}
                  />
                )}
                <button
                  type="button"
                  onClick={(event) => {
                    if (selectionMode) {
                      toggleSelect(gen.id);
                      return;
                    }
                    if (onPickMark && (event.shiftKey || isComparePicking)) {
                      event.preventDefault();
                      event.stopPropagation();
                      onPickMark({
                        generationId: gen.id,
                        versionId: latestVersion.id,
                        imageUrl: latestVersion.imageUrl,
                        mimeType: latestVersion.mimeType,
                        // Per-version model wins for mixed-model tiles so the
                        // slider labels the right side correctly.
                        modelId: latestVersion.modelId || gen.modelId,
                        markLabel: latestVersion.label,
                        aspectRatio: latestVersion.aspectRatio || gen.config.aspectRatio,
                      });
                      return;
                    }
                    onSelect(gen);
                    showToast('Restored');
                  }}
                  className={
                    selectionMode
                      ? 'absolute inset-0 bg-black/25 flex items-center justify-center opacity-100 transition-colors'
                      : isComparePicking
                        ? 'absolute inset-0 bg-black/0 hover:bg-brand-teal/30 transition-colors flex items-center justify-center'
                        : 'absolute inset-0 bg-black/0 group-hover:bg-black/40 focus:bg-black/40 transition-colors flex items-center justify-center opacity-0 group-hover:opacity-100 focus:opacity-100 group-focus-within:opacity-100'
                  }
                  aria-label={selectionMode ? 'Toggle selection' : isComparePicking ? 'Pick this tile to compare' : 'Restore generation'}
                >
                  <span className="text-white font-medium flex items-center gap-2 px-3 py-1.5 rounded-full bg-black/50 backdrop-blur-md text-xs">
                    {selectionMode ? (
                      <>
                        {selectedIds.includes(gen.id) ? <CheckSquare size={14} /> : <Square size={14} />}{' '}
                        {selectedIds.includes(gen.id) ? 'Selected' : 'Select'}
                      </>
                    ) : (
                      <>
                        <ArrowUpRight size={14} /> Restore
                      </>
                    )}
                  </span>
                </button>
              </div>

              <div className="p-3 pt-4">
                <p className="text-xs font-medium text-slate-900 dark:text-white line-clamp-2 mb-2 h-8 leading-relaxed">
                  {gen.config.prompt}
                </p>
                
                <div className="flex flex-wrap gap-1.5">
                  <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold border border-gray-500/60 bg-[#11151d] text-slate-100">
                    {getLabel(gen.config.graphicTypeId, options.graphicTypes)}
                  </span>
                  <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold border border-gray-500/60 bg-[#11151d] text-slate-100">
                    {getLabel(gen.config.visualStyleId, options.visualStyles)}
                  </span>
                  {isInTileComparison ? (
                    distinctTileModelIds.map((modelId) => (
                      <span
                        key={modelId}
                        className="inline-flex items-center px-2 py-0.5 rounded text-xs font-bold bg-brand-teal/10 text-brand-teal border border-brand-teal/40"
                      >
                        {getModelLabel(modelId)}
                      </span>
                    ))
                  ) : (
                    <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-bold bg-brand-teal/10 text-brand-teal border border-brand-teal/40">
                      {getModelLabel(gen.modelId)}
                    </span>
                  )}
                  <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold border border-gray-500/60 bg-[#11151d] text-slate-100">
                    {formatTimestamp(gen.createdAt)}
                  </span>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {toastMessage && (
        <div className="pointer-events-none fixed inset-0 z-40 flex items-center justify-center">
          <div className="bg-brand-red text-white text-sm px-4 py-3 rounded-lg shadow-2xl border border-brand-red/70 animate-in fade-in duration-150" role="status" aria-live="polite">
            {toastMessage}
          </div>
        </div>
      )}
    </div>
  );
};

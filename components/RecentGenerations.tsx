import React from 'react';
import { Generation, BrandColor, VisualStyle, GraphicType, AspectRatioOption } from '../types';
import { Clock, Copy, ArrowUpRight, Trash2, Download, Link, Image as ImageIcon, FileCode, Archive, CheckSquare, Square } from 'lucide-react';
import { sanitizeSvg } from '../services/svgService';
import { describeImagePrompt } from '../services/geminiService';
import { createBlobUrlFromImage } from '../services/imageSourceService';
import { getLatestVersion } from '../services/historyService';
import { buildExportFilename } from '../services/versionUtils';
import { buildGenerationsZipBlob, downloadBlobAsFile, defaultBatchExportFilename } from '../services/batchExportService';

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
}

export const RecentGenerations: React.FC<RecentGenerationsProps> = ({ 
  history, 
  onSelect,
  onDelete,
  options
}) => {
  const [copyLoadingId, setCopyLoadingId] = React.useState<string | null>(null);
  const [toastMessage, setToastMessage] = React.useState<string | null>(null);
  const [imageSrcById, setImageSrcById] = React.useState<Record<string, string>>({});
  const [selectionMode, setSelectionMode] = React.useState(false);
  const [selectedIds, setSelectedIds] = React.useState<string[]>([]);
  const [zipLoading, setZipLoading] = React.useState(false);
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

  const handleExportZip = async () => {
    const selected = history.filter((g) => selectedIds.includes(g.id));
    if (selected.length === 0) return;
    setZipLoading(true);
    try {
      const blob = await buildGenerationsZipBlob(selected);
      downloadBlobAsFile(blob, defaultBatchExportFilename());
      showToast('ZIP download started');
      exitSelectionMode();
    } catch (err) {
      console.error('Batch export failed', err);
      showToast('Could not create ZIP. Try again.');
    } finally {
      setZipLoading(false);
    }
  };

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
    if (modelId === 'openai') return 'GPT Image';
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
              <button
                type="button"
                onClick={() => void handleExportZip()}
                disabled={selectedIds.length === 0 || zipLoading}
                className="inline-flex items-center justify-center gap-2 text-xs font-semibold px-4 py-2 min-h-11 rounded-lg bg-brand-teal text-white hover:opacity-90 disabled:opacity-50 disabled:pointer-events-none transition"
                aria-busy={zipLoading}
              >
                <Archive size={16} aria-hidden />
                {zipLoading ? 'Preparing…' : `Download ZIP (${selectedIds.length})`}
              </button>
              <button
                type="button"
                onClick={exitSelectionMode}
                className="text-xs font-semibold px-3 py-2 min-h-11 rounded-lg border border-gray-300 dark:border-[#30363d] bg-white dark:bg-[#161b22] text-slate-700 dark:text-slate-200 hover:border-slate-500 transition"
              >
                Cancel
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={() => setSelectionMode(true)}
              className="inline-flex items-center justify-center gap-2 text-xs font-semibold px-4 py-2 min-h-11 rounded-lg border border-gray-300 dark:border-[#30363d] bg-white dark:bg-[#161b22] text-slate-700 dark:text-slate-200 hover:border-brand-teal hover:text-brand-teal transition"
            >
              <CheckSquare size={16} aria-hidden />
              Select for export
            </button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
        {history.map((gen) => {
          const latestVersion = getLatestVersion(gen);
          const versionCount = gen.versions.length;

          return (
            <div 
              key={gen.id} 
              className={`group relative bg-white dark:bg-[#161b22] border rounded-xl overflow-visible shadow-sm hover:shadow-lg transition-all ${
                selectionMode && selectedIds.includes(gen.id)
                  ? 'border-brand-teal ring-2 ring-brand-teal/50 dark:ring-brand-teal/40'
                  : 'border-gray-200 dark:border-[#30363d] hover:border-brand-teal dark:hover:border-brand-teal'
              }`}
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

              <div className="absolute top-2 right-2 z-10 flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
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
                  className="group/download relative inline-flex items-center justify-center h-9 w-9 rounded-md border border-gray-300/80 dark:border-white/15 bg-white/90 dark:bg-[#1f252d]/90 text-slate-800 dark:text-slate-200 shadow-sm hover:bg-brand-teal hover:border-brand-teal hover:text-white hover:shadow-md focus:outline-none focus:ring-2 focus:ring-brand-teal/70 focus:ring-offset-1 focus:ring-offset-white dark:focus:ring-offset-[#161b22] transition"
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
                  className="group/copyimg relative inline-flex items-center justify-center h-9 w-9 rounded-md border border-gray-300/80 dark:border-white/15 bg-white/90 dark:bg-[#1f252d]/90 text-slate-800 dark:text-slate-200 shadow-sm hover:bg-brand-teal hover:border-brand-teal hover:text-white hover:shadow-md focus:outline-none focus:ring-2 focus:ring-brand-teal/70 focus:ring-offset-1 focus:ring-offset-white dark:focus:ring-offset-[#161b22] transition"
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
                  className="group/copyurl relative inline-flex items-center justify-center h-9 w-9 rounded-md border border-gray-300/80 dark:border-white/15 bg-white/90 dark:bg-[#1f252d]/90 text-slate-800 dark:text-slate-200 shadow-sm hover:bg-brand-teal hover:border-brand-teal hover:text-white hover:shadow-md focus:outline-none focus:ring-2 focus:ring-brand-teal/70 focus:ring-offset-1 focus:ring-offset-white dark:focus:ring-offset-[#161b22] transition"
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
                  className="group/copy relative inline-flex items-center justify-center h-9 w-9 rounded-md border border-gray-300/80 dark:border-white/15 bg-white/90 dark:bg-[#1f252d]/90 text-slate-800 dark:text-slate-200 shadow-sm hover:bg-brand-teal hover:border-brand-teal hover:text-white hover:shadow-md focus:outline-none focus:ring-2 focus:ring-brand-teal/70 focus:ring-offset-1 focus:ring-offset-white dark:focus:ring-offset-[#161b22] transition"
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
                  className="group/delete relative inline-flex items-center justify-center h-9 w-9 rounded-md border border-red-200/80 dark:border-red-900/40 bg-white/85 dark:bg-[#2b1c1c]/80 text-red-600 dark:text-red-200 shadow-sm hover:bg-red-600 hover:border-red-600 hover:text-white hover:shadow-md focus:outline-none focus:ring-2 focus:ring-red-400/70 focus:ring-offset-1 focus:ring-offset-white dark:focus:ring-offset-[#161b22] transition"
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
                  onClick={() => {
                    if (selectionMode) {
                      toggleSelect(gen.id);
                      return;
                    }
                    onSelect(gen);
                    showToast('Restored');
                  }}
                  className={
                    selectionMode
                      ? 'absolute inset-0 bg-black/25 flex items-center justify-center opacity-100 transition-colors'
                      : 'absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-colors flex items-center justify-center opacity-0 group-hover:opacity-100'
                  }
                  aria-label={selectionMode ? 'Toggle selection' : 'Restore generation'}
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
                  <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-bold bg-brand-teal/10 text-brand-teal border border-brand-teal/40">
                    {getModelLabel(gen.modelId)}
                  </span>
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

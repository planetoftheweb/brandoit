import React from 'react';
import { GenerationHistoryItem, BrandColor, VisualStyle, GraphicType, AspectRatioOption } from '../types';
import { Clock, Copy, ArrowUpRight, Trash2, Download, Link, Image as ImageIcon } from 'lucide-react';
import { describeImagePrompt } from '../services/geminiService';

interface RecentGenerationsProps {
  history: GenerationHistoryItem[];
  onSelect: (item: GenerationHistoryItem) => void;
  onDelete: (historyId: string) => void;
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
  const toastTimerRef = React.useRef<number | null>(null);

  React.useEffect(() => {
    if (history.length > 0) {
      console.log('RecentGenerations: history length', history.length);
    }

    return () => {
      if (toastTimerRef.current) {
        window.clearTimeout(toastTimerRef.current);
      }
    };
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

  const buildFullPrompt = (item: GenerationHistoryItem) => {
    const typeLabel = getLabel(item.config.graphicTypeId, options.graphicTypes);
    const styleLabel = getLabel(item.config.visualStyleId, options.visualStyles);
    const styleDesc = options.visualStyles.find(s => s.id === item.config.visualStyleId)?.description || '';
    const colorsLabel = getColors(item.config.colorSchemeId);
    const colorsHex = options.brandColors.find(c => c.id === item.config.colorSchemeId)?.colors?.join(', ') || '';
    const aspectLabel = getLabel(item.config.aspectRatio, options.aspectRatios);
    const expanded = [
      `Generate a ${typeLabel}`,
      aspectLabel ? `at ${aspectLabel} aspect ratio` : '',
      styleLabel ? `in the ${styleLabel} style${styleDesc ? ` (${styleDesc})` : ''}` : '',
      colorsLabel ? `using palette ${colorsLabel}` : '',
      colorsHex ? `Use these exact hex colors: ${colorsHex}` : '',
      `Subject/Content: ${item.config.prompt}`
    ].filter(Boolean).join('. ');

    return [
      `Original Prompt: ${item.config.prompt}`,
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
    } catch (err) {
      console.error('Copy image to clipboard failed', err);
      try {
        await navigator.clipboard.writeText(url);
        showToast('Copied image URL (image copy blocked by browser/CORS)');
      } catch {
        showToast('Copy failed (browser/CORS permissions)');
      }
    }
  };

  const showToast = (msg: string) => {
    if (toastTimerRef.current) {
      window.clearTimeout(toastTimerRef.current);
    }
    setToastMessage(msg);
    toastTimerRef.current = window.setTimeout(() => setToastMessage(null), 1800);
  };

  const getModelLabel = (modelId?: string) => {
    if (modelId === 'openai') return 'GPT Image';
    return 'Nano Banana';
  };

  const formatTimestamp = (ts: number) => {
    const d = new Date(ts);
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    const hh = d.getHours().toString().padStart(2, '0');
    const mi = d.getMinutes().toString().padStart(2, '0');
    return `${mm}-${dd} ${hh}:${mi}`;
  };

  return (
    <div className="w-full max-w-7xl mx-auto px-4 md:px-6 py-8 animate-in fade-in slide-in-from-bottom-4 duration-500 delay-150 border-t border-gray-200 dark:border-[#30363d] mt-8">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2 text-slate-500 dark:text-slate-400">
          <Clock size={18} />
          <h3 className="text-sm font-bold uppercase tracking-wider">Recent Generations</h3>
          <span className="text-xs text-slate-400 dark:text-slate-500">
            ({history.length} {history.length === 1 ? 'item' : 'items'})
          </span>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
        {history.map((item) => (
          <div 
            key={item.id} 
            className="group relative bg-white dark:bg-[#161b22] border border-gray-200 dark:border-[#30363d] rounded-xl overflow-visible shadow-sm hover:shadow-lg hover:border-brand-teal dark:hover:border-brand-teal transition-all"
          >
            <div className="absolute top-2 right-2 z-10 flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  const link = document.createElement('a');
                  link.href = item.imageUrl;
                  link.download = `brandoit-${item.id || Date.now()}.png`;
                  document.body.appendChild(link);
                  link.click();
                  document.body.removeChild(link);
                  showToast('Download started');
                }}
                className="group/download relative inline-flex items-center justify-center h-9 w-9 rounded-md border border-gray-300/80 dark:border-white/15 bg-white/90 dark:bg-[#1f252d]/90 text-slate-800 dark:text-slate-200 shadow-sm hover:bg-brand-teal hover:border-brand-teal hover:text-white hover:shadow-md focus:outline-none focus:ring-2 focus:ring-brand-teal/70 focus:ring-offset-1 focus:ring-offset-white dark:focus:ring-offset-[#161b22] transition"
                aria-label="Download"
              >
                <Download size={16} />
                <span className="pointer-events-none absolute -top-9 left-1/2 -translate-x-1/2 whitespace-nowrap text-[11px] font-medium px-2 py-1 rounded-md bg-black/90 text-white shadow-lg opacity-0 group-hover/download:opacity-100 transition-opacity">
                  Download
                </span>
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  copyImageToClipboard(item.imageUrl);
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
                  navigator.clipboard.writeText(item.imageUrl).catch(err => console.error('Copy image URL failed', err));
                  showToast('Image URL copied');
                }}
                className="group/copyimg relative inline-flex items-center justify-center h-9 w-9 rounded-md border border-gray-300/80 dark:border-white/15 bg-white/90 dark:bg-[#1f252d]/90 text-slate-800 dark:text-slate-200 shadow-sm hover:bg-brand-teal hover:border-brand-teal hover:text-white hover:shadow-md focus:outline-none focus:ring-2 focus:ring-brand-teal/70 focus:ring-offset-1 focus:ring-offset-white dark:focus:ring-offset-[#161b22] transition"
                aria-label="Copy image URL"
              >
                <Link size={16} />
                <span className="pointer-events-none absolute -top-9 left-1/2 -translate-x-1/2 whitespace-nowrap text-[11px] font-medium px-2 py-1 rounded-md bg-black/90 text-white shadow-lg opacity-0 group-hover/copyimg:opacity-100 transition-opacity">
                  Copy image URL
                </span>
              </button>
              <button
                onClick={async (e) => {
                  e.stopPropagation();
                  try {
                    setCopyLoadingId(item.id);
                    let imageDescription = '';
                    try {
                      const { base64, mime } = await fetchImageAsBase64(item.imageUrl);
                      imageDescription = await describeImagePrompt(base64, mime);
                    } catch (imgErr) {
                      console.warn('Image describe fallback:', imgErr);
                    }

                    const structured = buildFullPrompt(item);
                    const finalText = imageDescription
                      ? `${structured}\n\nImage-Based Prompt: ${imageDescription}`
                      : structured;
                    await navigator.clipboard.writeText(finalText);
                    showToast('Prompt copied');
                  } catch (err) {
                    const structured = buildFullPrompt(item);
                    await navigator.clipboard.writeText(structured);
                    showToast('Prompt copied');
                  } finally {
                    setCopyLoadingId(null);
                  }
                }}
                className="group/copy relative inline-flex items-center justify-center h-9 w-9 rounded-md border border-gray-300/80 dark:border-white/15 bg-white/90 dark:bg-[#1f252d]/90 text-slate-800 dark:text-slate-200 shadow-sm hover:bg-brand-teal hover:border-brand-teal hover:text-white hover:shadow-md focus:outline-none focus:ring-2 focus:ring-brand-teal/70 focus:ring-offset-1 focus:ring-offset-white dark:focus:ring-offset-[#161b22] transition"
                aria-label="Copy full prompt"
              >
                {copyLoadingId === item.id ? (
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
                  onDelete(item.id);
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
              <img 
                src={item.imageUrl} 
                alt={item.config.prompt} 
                className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
              />
              <button
                onClick={() => {
                  onSelect(item);
                  showToast('Restored');
                }}
                className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-colors flex items-center justify-center opacity-0 group-hover:opacity-100"
                aria-label="Restore generation"
              >
                <span className="text-white font-medium flex items-center gap-2 px-3 py-1.5 rounded-full bg-black/50 backdrop-blur-md text-xs">
                  <ArrowUpRight size={14} /> Restore
                </span>
              </button>
            </div>

            <div className="p-3 pt-4">
              <p className="text-xs font-medium text-slate-900 dark:text-white line-clamp-2 mb-2 h-8 leading-relaxed">
                {item.config.prompt}
              </p>
              
              <div className="flex flex-wrap gap-1.5">
                <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold bg-gray-100 dark:bg-[#30363d] text-slate-700 dark:text-slate-200">
                  {getLabel(item.config.graphicTypeId, options.graphicTypes)}
                </span>
                <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold bg-gray-100 dark:bg-[#30363d] text-slate-700 dark:text-slate-200">
                  {getLabel(item.config.visualStyleId, options.visualStyles)}
                </span>
                <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-bold bg-brand-teal/10 text-brand-teal border border-brand-teal/40">
                  {getModelLabel(item.modelId)}
                </span>
                <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold bg-gray-100 dark:bg-[#30363d] text-slate-700 dark:text-slate-200">
                  {formatTimestamp(item.timestamp)}
                </span>
              </div>
            </div>
          </div>
        ))}
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

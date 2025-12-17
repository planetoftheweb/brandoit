import React, { useState, useEffect } from 'react';
import { GeneratedImage, BrandColor, VisualStyle, GraphicType, AspectRatioOption } from '../types';
import { Download, RefreshCw, Send, Image as ImageIcon, Copy, Link, Trash2, Sparkles } from 'lucide-react';

interface ImageDisplayProps {
  image: GeneratedImage | null;
  onRefine: (refinementText: string) => void;
  isRefining: boolean;
  onCopy?: () => void;
  onDelete?: () => void;
  options: {
    brandColors: BrandColor[];
    visualStyles: VisualStyle[];
    graphicTypes: GraphicType[];
    aspectRatios: AspectRatioOption[];
  };
}

export const ImageDisplay: React.FC<ImageDisplayProps> = ({ 
  image, 
  onRefine,
  isRefining,
  onCopy,
  onDelete,
  options
}) => {
  const [refinementInput, setRefinementInput] = useState('');
  const [copyNotice, setCopyNotice] = useState<string | null>(null);
  const [noticeTimer, setNoticeTimer] = useState<number | null>(null);

  useEffect(() => {
    return () => {
      if (noticeTimer) {
        window.clearTimeout(noticeTimer);
      }
    };
  }, [noticeTimer]);

  const showNotice = (msg: string) => {
    if (noticeTimer) {
      window.clearTimeout(noticeTimer);
    }
    setCopyNotice(msg);
    const timer = window.setTimeout(() => setCopyNotice(null), 2000);
    setNoticeTimer(timer);
  };

  const modelLabelMap: Record<string, string> = {
    gemini: 'Nano Banana',
    openai: 'GPT Image'
  };

  const getLabel = (id: string | undefined, list: any[]) => {
    if (!id) return '';
    const item = list.find(i => i.id === id || i.value === id);
    return item?.name || item?.label || id;
  };

  const getColors = (id: string | undefined) => {
    if (!id) return [];
    const palette = options.brandColors.find(c => c.id === id);
    return palette?.colors || [];
  };

  const formatTimestamp = (ts?: number) => {
    if (!ts) return '';
    const d = new Date(ts);
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    const rawH = d.getHours();
    const hh = String(rawH % 12 === 0 ? 12 : rawH % 12).padStart(2, '0');
    const mi = String(d.getMinutes()).padStart(2, '0');
    const ampm = rawH >= 12 ? 'PM' : 'AM';
    return `${mm}-${dd} ${hh}:${mi} ${ampm}`;
  };

  const handleDownload = () => {
    if (!image) return;
    const link = document.createElement('a');
    link.href = image.imageUrl;
    link.download = `brandoit-${Date.now()}.png`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleCopyImageUrl = async () => {
    if (!image) return;
    try {
      await navigator.clipboard.writeText(image.imageUrl);
      showNotice('Image URL copied');
    } catch (err) {
      console.error('Failed to copy image URL:', err);
    }
  };

  const handleCopyImageToClipboard = async () => {
    if (!image) return;
    try {
      const response = await fetch(image.imageUrl, { mode: 'cors' });
      const blob = await response.blob();
      if (navigator.clipboard && 'write' in navigator.clipboard && typeof ClipboardItem !== 'undefined') {
        await navigator.clipboard.write([new ClipboardItem({ [blob.type]: blob })]);
        showNotice('Image copied');
      } else {
        await navigator.clipboard.writeText(image.imageUrl);
        showNotice('Image URL copied');
      }
    } catch (err) {
      console.error('Failed to copy image to clipboard:', err);
      // Fallback: copy URL and inform user about possible CORS/browser limitation
      try {
        await navigator.clipboard.writeText(image.imageUrl);
        showNotice('Copied image URL (image copy blocked by browser/CORS)');
      } catch {
        showNotice('Copy failed (browser/CORS permissions)');
      }
    }
  };

  const handleCopyPrompt = () => {
    if (onCopy) {
      onCopy();
      showNotice('Prompt copied');
    }
  };

  const handleDownloadWithNotice = () => {
    handleDownload();
    showNotice('Download started');
  };

  const handleDeleteWithNotice = () => {
    if (onDelete) {
      onDelete();
      showNotice('Image removed');
    }
  };

  const handleRefineSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (refinementInput.trim()) {
      onRefine(refinementInput);
      setRefinementInput('');
    }
  };

  if (!image) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-8 text-center h-full min-h-[60vh] text-slate-900 dark:text-white">
        <div className="w-24 h-24 rounded-3xl bg-white dark:bg-[#161b22] border border-gray-200 dark:border-[#30363d] flex items-center justify-center mb-6 shadow-xl shadow-slate-200 dark:shadow-black/50 rotate-3 transition-transform hover:rotate-0">
          <ImageIcon size={40} className="text-slate-400 dark:text-slate-600" />
        </div>
        <h2 className="text-2xl font-bold tracking-tight">Ready to Create</h2>
        <p className="text-slate-500 dark:text-slate-400 max-w-md mt-3 text-sm leading-relaxed">
          Configure your brand settings in the toolbar above and enter a prompt to generate professional, consistent graphics instantly.
        </p>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col h-full relative">
      {/* Main Image Viewport */}
      <div className="flex-1 overflow-auto p-4 md:p-8 flex items-center justify-center">
        <div className="relative group max-w-full max-h-full">
          <div className="absolute inset-0 bg-brand-red/20 blur-3xl rounded-full opacity-20 pointer-events-none"></div>
          <div className="relative shadow-2xl shadow-slate-300 dark:shadow-black rounded-lg overflow-visible border border-gray-200 dark:border-[#30363d] bg-white dark:bg-[#0d1117]">
            <img 
              src={image.imageUrl} 
              alt="Generated Output" 
              className="max-w-full max-h-[70vh] object-contain block rounded-lg"
            />
          {/* Info overlay on hover */}
          <div className="absolute left-4 bottom-4 opacity-0 group-hover:opacity-100 transition-opacity">
            <div className="bg-black/75 text-white px-3.5 py-2.5 rounded-lg text-base flex items-start gap-2 flex-wrap max-w-[520px]">
              {(() => {
                const cfg = image.config;
                const val = getLabel(cfg?.graphicTypeId, options.graphicTypes);
                return val ? (
                  <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold border border-gray-500/60 bg-[#11151d] text-slate-100">
                    {val}
                  </span>
                ) : null;
              })()}
              {(() => {
                const cfg = image.config;
                const val = getLabel(cfg?.visualStyleId, options.visualStyles);
                return val ? (
                  <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold border border-gray-500/60 bg-[#11151d] text-slate-100">
                    {val}
                  </span>
                ) : null;
              })()}
              {(() => {
                const cfg = image.config;
                const val = cfg?.aspectRatio;
                const label = val ? getLabel(val, options.aspectRatios) : '';
                return label ? (
                  <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold border border-gray-500/60 bg-[#11151d] text-slate-100">
                    {label}
                  </span>
                ) : null;
              })()}
              <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-bold bg-brand-teal/15 text-brand-teal border border-brand-teal/50">
                {modelLabelMap[image.modelId || 'gemini'] || 'Model'}
              </span>
              {image.timestamp && (
                <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold border border-gray-500/60 bg-[#11151d] text-slate-100">
                  {formatTimestamp(image.timestamp)}
                </span>
              )}
              {(() => {
                const cfg = image.config;
                const colors = getColors(cfg?.colorSchemeId);
                if (!colors.length) return null;
                return (
                  <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold border border-gray-500/60 bg-[#11151d] text-slate-100 gap-1">
                  Colors
                    <span className="flex h-2 w-12 rounded-sm overflow-hidden ring-1 ring-black/20">
                      {colors.map((hex, idx) => (
                        <span key={idx} className="flex-1 h-full" style={{ backgroundColor: hex }} />
                      ))}
                    </span>
                  </span>
                );
              })()}
              {image.config?.prompt && (
                <span className="inline-flex px-3 py-1.5 rounded text-sm font-semibold border border-gray-500/60 bg-[#11151d] text-slate-100 max-w-full break-words whitespace-normal">
                  {image.config.prompt}
                </span>
              )}
            </div>
          </div>
            
            <div className="absolute top-4 right-4 flex items-center gap-3 opacity-0 group-hover:opacity-100 transition-opacity">
              {onCopy && (
                <button 
                  onClick={handleCopyPrompt}
                  className="group/copy bg-white/90 dark:bg-[#1f252d]/90 border border-gray-300/80 dark:border-white/15 text-slate-800 dark:text-slate-200 p-3 rounded-xl shadow-lg hover:bg-brand-teal hover:border-brand-teal hover:text-white hover:shadow-xl focus:outline-none focus:ring-2 focus:ring-brand-teal/70 focus:ring-offset-1 focus:ring-offset-white dark:focus:ring-offset-[#161b22] transition relative"
                  title="Copy prompt"
                >
                  <Copy size={18} />
                  <span className="pointer-events-none absolute -top-9 left-1/2 -translate-x-1/2 whitespace-nowrap text-[11px] font-medium px-2 py-1 rounded-md bg-black/90 text-white shadow-lg opacity-0 group-hover/copy:opacity-100 transition-opacity">
                    Copy prompt
                  </span>
                </button>
              )}
              <button 
                onClick={handleCopyImageToClipboard}
                className="group/copyimg bg-white/90 dark:bg-[#1f252d]/90 border border-gray-300/80 dark:border-white/15 text-slate-800 dark:text-slate-200 p-3 rounded-xl shadow-lg hover:bg-brand-teal hover:border-brand-teal hover:text-white hover:shadow-xl focus:outline-none focus:ring-2 focus:ring-brand-teal/70 focus:ring-offset-1 focus:ring-offset-white dark:focus:ring-offset-[#161b22] transition relative"
                title="Copy image to clipboard"
              >
                <ImageIcon size={18} />
                <span className="pointer-events-none absolute -top-9 left-1/2 -translate-x-1/2 whitespace-nowrap text-[11px] font-medium px-2 py-1 rounded-md bg-black/90 text-white shadow-lg opacity-0 group-hover/copyimg:opacity-100 transition-opacity">
                  Copy image
                </span>
              </button>
              <button 
                onClick={handleCopyImageUrl}
                className="group/copyimg bg-white/90 dark:bg-[#1f252d]/90 border border-gray-300/80 dark:border-white/15 text-slate-800 dark:text-slate-200 p-3 rounded-xl shadow-lg hover:bg-brand-teal hover:border-brand-teal hover:text-white hover:shadow-xl focus:outline-none focus:ring-2 focus:ring-brand-teal/70 focus:ring-offset-1 focus:ring-offset-white dark:focus:ring-offset-[#161b22] transition relative"
                title="Copy image URL"
              >
                <Link size={18} />
                <span className="pointer-events-none absolute -top-9 left-1/2 -translate-x-1/2 whitespace-nowrap text-[11px] font-medium px-2 py-1 rounded-md bg-black/90 text-white shadow-lg opacity-0 group-hover/copyimg:opacity-100 transition-opacity">
                  Copy image URL
                </span>
              </button>
              <button 
                onClick={handleDownloadWithNotice}
                className="group/download bg-white/90 dark:bg-[#1f252d]/90 border border-gray-300/80 dark:border-white/15 text-slate-800 dark:text-slate-200 p-3 rounded-xl shadow-lg hover:bg-brand-teal hover:border-brand-teal hover:text-white hover:shadow-xl focus:outline-none focus:ring-2 focus:ring-brand-teal/70 focus:ring-offset-1 focus:ring-offset-white dark:focus:ring-offset-[#161b22] transition relative"
                title="Download Image"
              >
                <Download size={20} />
                <span className="pointer-events-none absolute -top-9 left-1/2 -translate-x-1/2 whitespace-nowrap text-[11px] font-medium px-2 py-1 rounded-md bg-black/90 text-white shadow-lg opacity-0 group-hover/download:opacity-100 transition-opacity">
                  Download
                </span>
              </button>
              {onDelete && (
                <button 
                  onClick={handleDeleteWithNotice}
                  className="group/delete bg-white/85 dark:bg-[#2b1c1c]/85 border border-red-200/80 dark:border-red-900/40 text-red-600 dark:text-red-200 p-3 rounded-xl shadow-lg hover:bg-red-600 hover:border-red-600 hover:text-white hover:shadow-xl focus:outline-none focus:ring-2 focus:ring-red-400/70 focus:ring-offset-1 focus:ring-offset-white dark:focus:ring-offset-[#161b22] transition relative"
                  title="Delete"
                >
                  <Trash2 size={18} />
                  <span className="pointer-events-none absolute -top-9 left-1/2 -translate-x-1/2 whitespace-nowrap text-[11px] font-medium px-2 py-1 rounded-md bg-black/90 text-white shadow-lg opacity-0 group-hover/delete:opacity-100 transition-opacity">
                    Delete
                  </span>
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {copyNotice && (
        <div className="pointer-events-none fixed inset-0 z-50 flex items-center justify-center">
          <div className="bg-brand-red text-white text-base px-6 py-4 rounded-2xl shadow-2xl border border-brand-red/70 animate-in fade-in duration-150" role="status" aria-live="polite">
            {copyNotice}
          </div>
        </div>
      )}

      {/* Refinement Bar */}
      <div className="w-full flex justify-center pb-8 px-4 pointer-events-none">
        <div className="pointer-events-auto w-full max-w-2xl bg-white/90 dark:bg-[#161b22]/90 backdrop-blur-xl border border-gray-200 dark:border-[#30363d] p-2 rounded-2xl shadow-xl shadow-slate-200/50 dark:shadow-black/50">
          <form onSubmit={handleRefineSubmit} className="flex gap-2">
            <input
              type="text"
              value={refinementInput}
              onChange={(e) => setRefinementInput(e.target.value)}
              placeholder="Refine this image (e.g. 'Make the background darker')..."
              className="flex-1 p-3 bg-transparent text-sm text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none"
              disabled={isRefining}
            />
            <button
              type="submit"
              disabled={!refinementInput || isRefining}
              className={`px-4 rounded-xl font-medium text-white flex items-center gap-2 transition-all ${
                !refinementInput || isRefining
                  ? 'bg-gray-200 dark:bg-[#30363d] text-slate-400 dark:text-slate-500 cursor-not-allowed'
                  : 'bg-brand-red hover:bg-red-700 text-white shadow-lg shadow-brand-red/20'
              }`}
            >
               {isRefining ? (
                 <RefreshCw size={16} className="animate-spin" />
               ) : (
                 <Send size={16} />
               )}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};
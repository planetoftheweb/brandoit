import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Generation, GenerationVersion, BrandColor, VisualStyle, GraphicType, AspectRatioOption } from '../types';
import { Download, RefreshCw, Send, Image as ImageIcon, Copy, Link, Trash2, ChevronDown, Layers, FileImage, Code, Play, Pause, FileCode, Info, X, Globe } from 'lucide-react';
import { createBlobUrlFromImage } from '../services/imageSourceService';
import { getCurrentVersion } from '../services/historyService';
import { buildExportFilename } from '../services/versionUtils';
import { webpToPngBlob } from '../services/imageConversionService';
import { sanitizeSvg } from '../services/svgService';

interface ImageDisplayProps {
  generation: Generation | null;
  onRefine: (refinementText: string) => void;
  isRefining: boolean;
  onCopy?: () => void;
  onDelete?: () => void;
  onVersionChange: (index: number) => void;
  options: {
    brandColors: BrandColor[];
    visualStyles: VisualStyle[];
    graphicTypes: GraphicType[];
    aspectRatios: AspectRatioOption[];
  };
}

export const ImageDisplay: React.FC<ImageDisplayProps> = ({ 
  generation,
  onRefine,
  isRefining,
  onCopy,
  onDelete,
  onVersionChange,
  options
}) => {
  const [refinementInput, setRefinementInput] = useState('');
  const [copyNotice, setCopyNotice] = useState<string | null>(null);
  const [noticeTimer, setNoticeTimer] = useState<number | null>(null);
  const [renderImageSrc, setRenderImageSrc] = useState<string>('');
  const [fallbackBlobUrl, setFallbackBlobUrl] = useState<string | null>(null);
  const [versionDropdownOpen, setVersionDropdownOpen] = useState(false);
  const [animationPaused, setAnimationPaused] = useState(false);
  const [infoVisible, setInfoVisible] = useState(false);
  const svgContainerRef = useRef<HTMLDivElement>(null);

  const version = generation ? getCurrentVersion(generation) : null;
  const isSvg = version?.mimeType === 'image/svg+xml';

  useEffect(() => {
    return () => {
      if (noticeTimer) window.clearTimeout(noticeTimer);
    };
  }, [noticeTimer]);

  useEffect(() => {
    setRenderImageSrc(version?.imageUrl || '');
    if (fallbackBlobUrl) {
      URL.revokeObjectURL(fallbackBlobUrl);
      setFallbackBlobUrl(null);
    }
    setAnimationPaused(false);
  }, [version?.imageUrl]);

  useEffect(() => {
    return () => {
      if (fallbackBlobUrl) URL.revokeObjectURL(fallbackBlobUrl);
    };
  }, [fallbackBlobUrl]);

  useEffect(() => {
    if (!isSvg || !svgContainerRef.current) return;
    const container = svgContainerRef.current;
    const svgEls = container.querySelectorAll('svg');
    svgEls.forEach(svg => {
      if (animationPaused) {
        svg.pauseAnimations?.();
        svg.style.animationPlayState = 'paused';
        svg.querySelectorAll('*').forEach(el => {
          (el as HTMLElement).style.animationPlayState = 'paused';
        });
      } else {
        svg.unpauseAnimations?.();
        svg.style.animationPlayState = 'running';
        svg.querySelectorAll('*').forEach(el => {
          (el as HTMLElement).style.animationPlayState = 'running';
        });
      }
    });
  }, [animationPaused, isSvg, version?.id]);

  const showNotice = (msg: string) => {
    if (noticeTimer) window.clearTimeout(noticeTimer);
    setCopyNotice(msg);
    const timer = window.setTimeout(() => setCopyNotice(null), 2000);
    setNoticeTimer(timer);
  };

  const modelLabelMap: Record<string, string> = {
    gemini: 'Nano Banana',
    openai: 'GPT Image',
    'gemini-svg': 'Gemini SVG'
  };

  const getLabel = (id: string | undefined, list: any[]) => {
    if (!id) return '';
    const item = list.find((i: any) => i.id === id || i.value === id);
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

  const handleSvgContainerClick = useCallback((e: React.MouseEvent) => {
    const target = e.target as HTMLElement;
    const anchor = target.closest('a');
    if (anchor) {
      e.preventDefault();
      e.stopPropagation();
    }
  }, []);

  // --- SVG Export Helpers ---

  const handleDownloadHtml = () => {
    if (!generation || !version?.svgCode) return;
    const title = generation.config.prompt.slice(0, 60).trim() || 'SVG Graphic';
    const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${title.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { min-height: 100vh; display: flex; align-items: center; justify-content: center; background: #0d1117; }
  svg { max-width: 100vw; max-height: 100vh; width: auto; height: auto; }
</style>
</head>
<body>
${version.svgCode}
</body>
</html>`;
    const blob = new Blob([html], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const filename = buildExportFilename(generation.config.prompt, version.number, 'html');
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    showNotice('HTML download started');
  };

  const handleDownloadSvg = () => {
    if (!generation || !version?.svgCode) return;
    const filename = buildExportFilename(generation.config.prompt, version.number, 'svg');
    const blob = new Blob([version.svgCode], { type: 'image/svg+xml' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    showNotice('SVG download started');
  };

  const handleDownloadSvgAsPng = useCallback(async () => {
    if (!generation || !version?.svgCode) return;
    try {
      const svgStr = version.svgCode;
      const blob = new Blob([svgStr], { type: 'image/svg+xml;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const img = new window.Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const scale = 2;
        canvas.width = img.naturalWidth * scale;
        canvas.height = img.naturalHeight * scale;
        const ctx = canvas.getContext('2d');
        if (!ctx) { URL.revokeObjectURL(url); return; }
        ctx.scale(scale, scale);
        ctx.drawImage(img, 0, 0);
        canvas.toBlob(pngBlob => {
          if (!pngBlob) { URL.revokeObjectURL(url); return; }
          const pngUrl = URL.createObjectURL(pngBlob);
          const filename = buildExportFilename(generation.config.prompt, version.number, 'png');
          const link = document.createElement('a');
          link.href = pngUrl;
          link.download = filename;
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
          URL.revokeObjectURL(pngUrl);
          URL.revokeObjectURL(url);
          showNotice('PNG download started');
        }, 'image/png');
      };
      img.onerror = () => {
        URL.revokeObjectURL(url);
        showNotice('PNG export failed');
      };
      img.src = url;
    } catch {
      showNotice('PNG export failed');
    }
  }, [generation, version]);

  const handleCopySvgCode = async () => {
    if (!version?.svgCode) return;
    try {
      await navigator.clipboard.writeText(version.svgCode);
      showNotice('SVG code copied');
    } catch {
      showNotice('Copy failed');
    }
  };

  // --- Raster Export Helpers ---

  const handleDownloadWebP = () => {
    if (!generation || !version) return;
    const filename = buildExportFilename(generation.config.prompt, version.number, 'webp');
    const link = document.createElement('a');
    link.href = renderImageSrc || version.imageUrl;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    showNotice('WebP download started');
  };

  const handleDownloadPng = async () => {
    if (!generation || !version) return;
    try {
      const blob = await webpToPngBlob(version.imageData);
      const url = URL.createObjectURL(blob);
      const filename = buildExportFilename(generation.config.prompt, version.number, 'png');
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      showNotice('PNG download started');
    } catch {
      handleDownloadWebP();
    }
  };

  const handleCopyImageUrl = async () => {
    if (!version) return;
    try {
      await navigator.clipboard.writeText(version.imageUrl);
      showNotice('Image URL copied');
    } catch (err) {
      console.error('Failed to copy image URL:', err);
    }
  };

  const handleCopyImageToClipboard = async () => {
    if (!version) return;
    try {
      const sourceUrl = renderImageSrc || version.imageUrl;
      const response = await fetch(sourceUrl, { mode: 'cors' });
      const blob = await response.blob();
      if (navigator.clipboard && 'write' in navigator.clipboard && typeof ClipboardItem !== 'undefined') {
        await navigator.clipboard.write([new ClipboardItem({ [blob.type]: blob })]);
        showNotice('Image copied');
      } else {
        await navigator.clipboard.writeText(version.imageUrl);
        showNotice('Image URL copied');
      }
    } catch {
      try {
        await navigator.clipboard.writeText(version?.imageUrl || '');
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

  const handleDeleteWithNotice = () => {
    if (onDelete) onDelete();
  };

  const handleRefineSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (refinementInput.trim()) {
      onRefine(refinementInput);
      setRefinementInput('');
    }
  };

  const handleImageError = () => {
    if (!version) return;
    if (renderImageSrc.startsWith('blob:')) return;
    const fakeImage = { imageUrl: version.imageUrl, base64Data: version.imageData, mimeType: version.mimeType };
    const blobUrl = createBlobUrlFromImage(fakeImage);
    if (!blobUrl) return;
    if (fallbackBlobUrl) URL.revokeObjectURL(fallbackBlobUrl);
    setFallbackBlobUrl(blobUrl);
    setRenderImageSrc(blobUrl);
  };

  if (!generation || !version) {
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

  const cfg = generation.config;
  const hasMultipleVersions = generation.versions.length > 1;

  const ActionButton = ({ onClick, title, children, tooltip, variant = 'default' }: {
    onClick: () => void;
    title: string;
    children: React.ReactNode;
    tooltip: string;
    variant?: 'default' | 'danger';
  }) => (
    <button 
      onClick={onClick}
      className={`group/btn ${variant === 'danger'
        ? 'bg-white/85 dark:bg-[#2b1c1c]/85 border border-red-200/80 dark:border-red-900/40 text-red-600 dark:text-red-200 hover:bg-red-600 hover:border-red-600 hover:text-white'
        : 'bg-white/90 dark:bg-[#1f252d]/90 border border-gray-300/80 dark:border-white/15 text-slate-800 dark:text-slate-200 hover:bg-brand-teal hover:border-brand-teal hover:text-white'
      } p-3 rounded-xl shadow-lg hover:shadow-xl focus:outline-none focus:ring-2 focus:ring-brand-teal/70 focus:ring-offset-1 focus:ring-offset-white dark:focus:ring-offset-[#161b22] transition relative`}
      title={title}
    >
      {children}
      <span className="pointer-events-none absolute -top-9 left-1/2 -translate-x-1/2 whitespace-nowrap text-[11px] font-medium px-2 py-1 rounded-md bg-black/90 text-white shadow-lg opacity-0 group-hover/btn:opacity-100 transition-opacity">
        {tooltip}
      </span>
    </button>
  );

  return (
    <div className="flex-1 flex flex-col h-full relative">
      {/* Version Navigator */}
      {hasMultipleVersions && (
        <div className="w-full flex justify-center pt-4 px-4">
          <div className="relative inline-flex items-center gap-2 bg-white/90 dark:bg-[#161b22]/90 backdrop-blur-xl border border-gray-200 dark:border-[#30363d] px-3 py-1.5 rounded-full shadow-sm">
            <Layers size={14} className="text-slate-400" />
            <button
              onClick={() => setVersionDropdownOpen(!versionDropdownOpen)}
              className="flex items-center gap-1.5 text-sm font-semibold text-slate-900 dark:text-white hover:text-brand-teal dark:hover:text-brand-teal transition-colors"
            >
              {version.label}
              <ChevronDown size={14} className={`transition-transform ${versionDropdownOpen ? 'rotate-180' : ''}`} />
            </button>
            <span className="text-xs text-slate-400">
              {version.type === 'refinement' ? 'Refinement' : 'Original'}
            </span>

            {versionDropdownOpen && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setVersionDropdownOpen(false)} />
                <div className="absolute top-full left-1/2 -translate-x-1/2 mt-2 w-56 bg-white dark:bg-[#161b22] border border-gray-200 dark:border-[#30363d] rounded-xl shadow-xl z-50 overflow-hidden">
                  {generation.versions.map((v, idx) => (
                    <button
                      key={v.id}
                      onClick={() => {
                        onVersionChange(idx);
                        setVersionDropdownOpen(false);
                      }}
                      className={`w-full text-left px-4 py-2.5 text-sm flex items-center justify-between transition-colors ${
                        idx === generation.currentVersionIndex
                          ? 'bg-brand-teal/10 text-brand-teal font-semibold'
                          : 'text-slate-700 dark:text-slate-300 hover:bg-gray-50 dark:hover:bg-[#21262d]'
                      }`}
                    >
                      <span className="flex items-center gap-2">
                        <span className="font-mono text-xs w-16">{v.label}</span>
                        <span className="text-xs text-slate-400 capitalize">{v.type}</span>
                      </span>
                      <span className="text-[10px] text-slate-400">{formatTimestamp(v.timestamp)}</span>
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Main Viewport */}
      <div className="flex-1 overflow-auto p-4 md:p-8 flex items-center justify-center">
        <div className={`relative group ${isSvg ? 'w-full max-w-5xl' : 'max-w-full max-h-full'}`}>
          <div className="absolute inset-0 bg-brand-red/20 blur-3xl rounded-full opacity-20 pointer-events-none"></div>
          <div className="relative shadow-2xl shadow-slate-300 dark:shadow-black rounded-lg overflow-visible border border-gray-200 dark:border-[#30363d] bg-white dark:bg-[#0d1117]">

            {/* SVG Inline Rendering */}
            {isSvg && version.svgCode ? (
              <div
                ref={svgContainerRef}
                onClick={handleSvgContainerClick}
                className="w-full max-h-[70vh] overflow-auto p-4 flex items-center justify-center [&>svg]:w-full [&>svg]:h-auto [&>svg]:max-h-[65vh]"
                dangerouslySetInnerHTML={{ __html: sanitizeSvg(version.svgCode) }}
              />
            ) : (
              <img 
                src={renderImageSrc || version.imageUrl} 
                alt="Generated Output" 
                className="max-w-full max-h-[70vh] object-contain block rounded-lg"
                onError={handleImageError}
              />
            )}

          {/* Info overlay (toggle) */}
          {infoVisible && (
            <div className="absolute left-4 bottom-4 z-10 animate-in fade-in slide-in-from-bottom-2 duration-150">
              <div className="bg-black/80 backdrop-blur-sm text-white rounded-lg max-w-[420px] max-h-[220px] flex flex-col overflow-hidden">
                <div className="flex items-center justify-between px-3 pt-2 pb-1 shrink-0">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Details</span>
                  <button onClick={() => setInfoVisible(false)} className="p-0.5 hover:text-brand-teal transition-colors">
                    <X size={14} />
                  </button>
                </div>
                <div className="px-3 pb-2.5 overflow-y-auto flex items-start gap-1.5 flex-wrap">
                  {(() => {
                    const val = getLabel(cfg?.graphicTypeId, options.graphicTypes);
                    return val ? (
                      <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold border border-gray-500/60 bg-[#11151d] text-slate-100">
                        {val}
                      </span>
                    ) : null;
                  })()}
                  {(() => {
                    const val = getLabel(cfg?.visualStyleId, options.visualStyles);
                    return val ? (
                      <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold border border-gray-500/60 bg-[#11151d] text-slate-100">
                        {val}
                      </span>
                    ) : null;
                  })()}
                  {(() => {
                    const val = cfg?.aspectRatio;
                    const label = val ? getLabel(val, options.aspectRatios) : '';
                    return label ? (
                      <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold border border-gray-500/60 bg-[#11151d] text-slate-100">
                        {label}
                      </span>
                    ) : null;
                  })()}
                  <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-bold bg-brand-teal/15 text-brand-teal border border-brand-teal/50">
                    {modelLabelMap[generation.modelId || 'gemini'] || 'Model'}
                  </span>
                  {isSvg && cfg?.svgMode && (
                    <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-bold bg-purple-500/15 text-purple-400 border border-purple-500/50 capitalize">
                      {cfg.svgMode}
                    </span>
                  )}
                  {hasMultipleVersions && (
                    <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-bold bg-amber-500/15 text-amber-400 border border-amber-500/50">
                      {version.label}
                    </span>
                  )}
                  {version.timestamp && (
                    <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold border border-gray-500/60 bg-[#11151d] text-slate-100">
                      {formatTimestamp(version.timestamp)}
                    </span>
                  )}
                  {(() => {
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
                  {cfg?.prompt && (
                    <span className="inline-flex px-2.5 py-1 rounded text-xs border border-gray-500/60 bg-[#11151d] text-slate-100 max-w-full break-words whitespace-normal leading-relaxed">
                      {cfg.prompt}
                    </span>
                  )}
                  {version.refinementPrompt && (
                    <span className="inline-flex px-2.5 py-1 rounded text-xs border border-amber-500/40 bg-amber-900/30 text-amber-200 max-w-full break-words whitespace-normal leading-relaxed">
                      Refined: {version.refinementPrompt}
                    </span>
                  )}
                </div>
              </div>
            </div>
          )}
            
            {/* Action buttons (top right) */}
            <div className="absolute top-4 right-4 flex items-center gap-3 opacity-0 group-hover:opacity-100 transition-opacity">
              {/* Info toggle */}
              <ActionButton
                onClick={() => setInfoVisible(v => !v)}
                title={infoVisible ? 'Hide details' : 'Show details'}
                tooltip={infoVisible ? 'Hide info' : 'Info'}
              >
                <Info size={18} />
              </ActionButton>

              {/* Animation toggle (SVG only) */}
              {isSvg && (
                <ActionButton
                  onClick={() => setAnimationPaused(p => !p)}
                  title={animationPaused ? 'Resume animation' : 'Pause animation'}
                  tooltip={animationPaused ? 'Play' : 'Pause'}
                >
                  {animationPaused ? <Play size={18} /> : <Pause size={18} />}
                </ActionButton>
              )}

              {onCopy && (
                <ActionButton onClick={handleCopyPrompt} title="Copy prompt" tooltip="Copy prompt">
                  <Copy size={18} />
                </ActionButton>
              )}

              {/* SVG-specific actions */}
              {isSvg && version.svgCode && (
                <>
                  <ActionButton onClick={handleCopySvgCode} title="Copy SVG code" tooltip="Copy SVG">
                    <Code size={18} />
                  </ActionButton>
                  <ActionButton onClick={handleDownloadSvg} title="Download as SVG" tooltip="SVG">
                    <FileCode size={18} />
                  </ActionButton>
                  <ActionButton onClick={handleDownloadHtml} title="Download as HTML page" tooltip="HTML">
                    <Globe size={18} />
                  </ActionButton>
                  <ActionButton onClick={handleDownloadSvgAsPng} title="Download as PNG" tooltip="PNG">
                    <FileImage size={18} />
                  </ActionButton>
                </>
              )}

              {/* Raster-specific actions */}
              {!isSvg && (
                <>
                  <ActionButton onClick={handleCopyImageToClipboard} title="Copy image to clipboard" tooltip="Copy image">
                    <ImageIcon size={18} />
                  </ActionButton>
                  <ActionButton onClick={handleCopyImageUrl} title="Copy image URL" tooltip="Copy URL">
                    <Link size={18} />
                  </ActionButton>
                  <ActionButton onClick={handleDownloadPng} title="Download as PNG" tooltip="PNG">
                    <FileImage size={18} />
                  </ActionButton>
                  <ActionButton onClick={handleDownloadWebP} title="Download as WebP" tooltip="WebP">
                    <Download size={20} />
                  </ActionButton>
                </>
              )}

              {onDelete && (
                <ActionButton onClick={handleDeleteWithNotice} title="Delete" tooltip="Delete" variant="danger">
                  <Trash2 size={18} />
                </ActionButton>
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
      <div className="w-full flex flex-col items-center pb-8 px-4 pointer-events-none gap-3">
        {/* Refinement history thread */}
        {generation.versions.filter(v => v.type === 'refinement').length > 0 && (
          <div className="pointer-events-auto w-full max-w-2xl">
            <div className="flex flex-wrap gap-2 justify-center">
              {generation.versions.filter(v => v.type === 'refinement').map(v => (
                <button
                  key={v.id}
                  onClick={() => {
                    const idx = generation.versions.findIndex(ver => ver.id === v.id);
                    if (idx >= 0) onVersionChange(idx);
                  }}
                  className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${
                    v.id === version?.id
                      ? 'bg-brand-teal/10 border-brand-teal/50 text-brand-teal font-semibold'
                      : 'bg-white/80 dark:bg-[#161b22]/80 border-gray-200 dark:border-[#30363d] text-slate-600 dark:text-slate-400 hover:border-brand-teal/30'
                  }`}
                >
                  <span className="font-mono mr-1">{v.label}</span>
                  <span className="truncate max-w-[150px] inline-block align-bottom">{v.refinementPrompt}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="pointer-events-auto w-full max-w-2xl bg-white/90 dark:bg-[#161b22]/90 backdrop-blur-xl border border-gray-200 dark:border-[#30363d] p-2 rounded-2xl shadow-xl shadow-slate-200/50 dark:shadow-black/50">
          <form onSubmit={handleRefineSubmit} className="flex gap-2">
            <input
              type="text"
              value={refinementInput}
              onChange={(e) => setRefinementInput(e.target.value)}
              placeholder={isSvg ? "Refine this SVG (e.g. 'Add a subtle gradient')..." : "Refine this image (e.g. 'Make the background darker')..."}
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

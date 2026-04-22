import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Generation, GenerationVersion, BrandColor, VisualStyle, GraphicType, AspectRatioOption } from '../types';
import { Download, RefreshCw, Send, Image as ImageIcon, Copy, Link, Trash2, ChevronDown, Layers, FileImage, Code, Play, Pause, FileCode, Info, X, Globe, Wand2, Maximize2 } from 'lucide-react';
import { createBlobUrlFromImage } from '../services/imageSourceService';
import { getCurrentVersion } from '../services/historyService';
import { buildExportFilename } from '../services/versionUtils';
import { webpToPngBlob } from '../services/imageConversionService';
import { sanitizeSvg } from '../services/svgService';
import { SUPPORTED_MODELS } from '../constants';
import { normalizeAspectRatio } from '../services/aspectRatioService';
import { RichSelect, RichSelectOption } from './RichSelect';
import { DownloadMenu } from './DownloadMenu';

interface ImageDisplayProps {
  generation: Generation | null;
  onRefine: (refinementText: string) => void;
  onAnalyzeRefinePrompt: () => Promise<string>;
  onResizeCanvasRefine: (targetAspectRatio: string) => Promise<void>;
  isRefining: boolean;
  onCopy?: () => void;
  onDelete?: () => void;
  onVersionChange: (index: number) => void;
  onDeleteRefinementVersion: (versionId: string) => Promise<void>;
  selectedModel: string;
  onModelChange: (modelId: string) => void;
  resizeAspectRatios: AspectRatioOption[];
  options: {
    brandColors: BrandColor[];
    visualStyles: VisualStyle[];
    graphicTypes: GraphicType[];
    aspectRatios: AspectRatioOption[];
  };
  history?: Generation[];
}

export const ImageDisplay: React.FC<ImageDisplayProps> = ({ 
  generation,
  onRefine,
  onAnalyzeRefinePrompt,
  onResizeCanvasRefine,
  isRefining,
  onCopy,
  onDelete,
  onVersionChange,
  onDeleteRefinementVersion,
  selectedModel,
  onModelChange,
  resizeAspectRatios,
  options,
  history = []
}) => {
  const [refinementInput, setRefinementInput] = useState('');
  const [copyNotice, setCopyNotice] = useState<string | null>(null);
  const [noticeTimer, setNoticeTimer] = useState<number | null>(null);
  const [renderImageSrc, setRenderImageSrc] = useState<string>('');
  const [fallbackBlobUrl, setFallbackBlobUrl] = useState<string | null>(null);
  const [versionDropdownOpen, setVersionDropdownOpen] = useState(false);
  const [animationPaused, setAnimationPaused] = useState(false);
  const [infoVisible, setInfoVisible] = useState(false);
  const [isAnalyzingRefinePrompt, setIsAnalyzingRefinePrompt] = useState(false);
  const [isResizingCanvas, setIsResizingCanvas] = useState(false);
  const [deletingRefinementId, setDeletingRefinementId] = useState<string | null>(null);
  const [isPromptEditorOpen, setIsPromptEditorOpen] = useState(false);
  const [resizeAspectRatio, setResizeAspectRatio] = useState('');
  // Thumbnail strip hover: while hovering a thumbnail, the main viewport
  // mirrors that version without committing it. Null = show the committed
  // `currentVersionIndex`.
  const [hoveredVersionIdx, setHoveredVersionIdx] = useState<number | null>(null);
  // Vertical anchor (in rail-outer coordinates) for the floating hover
  // popover. Rendered at the rail-outer level so it can escape the inner
  // scroller's overflow clip without needing position: fixed.
  const [popoverTop, setPopoverTop] = useState<number>(0);
  const svgContainerRef = useRef<HTMLDivElement>(null);
  const railInnerRef = useRef<HTMLDivElement>(null);

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

  // Drop hover preview whenever the underlying generation changes so we
  // don't display a thumbnail pointer into a stale version list.
  useEffect(() => {
    setHoveredVersionIdx(null);
  }, [generation?.id]);

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
    gemini: 'Nano Banana Pro',
    'gemini-3.1-flash-image-preview': 'Nano Banana 2',
    'openai-2': 'GPT Image 2',
    'openai-mini': 'GPT Image Mini',
    openai: 'GPT Image 1.5',
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

  const cleanupRefinementPromptForSubmission = (input: string): string => {
    const normalized = input
      .replace(/\r\n/g, '\n')
      .replace(/\u00A0/g, ' ')
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .join(' ');

    return normalized.replace(/\s+/g, ' ').trim();
  };

  const submitRefinementOrResize = (): boolean => {
    const preparedInput = cleanupRefinementPromptForSubmission(refinementInput);
    if (preparedInput) {
      onRefine(preparedInput);
      setRefinementInput('');
      return true;
    }
    if (canResizeToSelected) {
      void handleResizeCanvasClick();
      return true;
    }
    return false;
  };

  const handleRefineSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    submitRefinementOrResize();
  };

  const isSubmitShortcut = (event: React.KeyboardEvent<HTMLTextAreaElement>): boolean =>
    (event.metaKey || event.ctrlKey) && event.key === 'Enter';

  const handleInlinePromptKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (!isSubmitShortcut(event)) return;
    event.preventDefault();
    submitRefinementOrResize();
  };

  const handleModalPromptKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (!isSubmitShortcut(event)) return;
    event.preventDefault();
    if (submitRefinementOrResize()) {
      setIsPromptEditorOpen(false);
    }
  };

  const handleAnalyzeRefineClick = async () => {
    if (isRefining || isAnalyzingRefinePrompt || isResizingCanvas) return;
    setIsAnalyzingRefinePrompt(true);
    try {
      const prompt = await onAnalyzeRefinePrompt();
      if (prompt?.trim()) {
        setRefinementInput(prompt.trim());
        showNotice('Analysis complete. Detailed fix prompt added.');
      } else {
        showNotice('Analysis finished with no prompt.');
      }
    } catch (error: any) {
      showNotice(error?.message || 'Analysis failed');
    } finally {
      setIsAnalyzingRefinePrompt(false);
    }
  };

  const handleResizeCanvasClick = async () => {
    if (isRefining || isAnalyzingRefinePrompt || isResizingCanvas) return;
    const sourceAspect = normalizeAspectRatio(version?.aspectRatio || generation?.config.aspectRatio || '');
    const targetAspect = normalizeAspectRatio(resizeAspectRatio);
    if (!targetAspect || !sourceAspect || targetAspect === sourceAspect) {
      showNotice('Choose a different target size first');
      return;
    }
    setIsResizingCanvas(true);
    try {
      await onResizeCanvasRefine(resizeAspectRatio);
      showNotice('Canvas resize complete');
    } catch (error: any) {
      showNotice(error?.message || 'Resize failed');
    } finally {
      setIsResizingCanvas(false);
    }
  };

  const handleDeleteRefinementClick = async (versionId: string) => {
    if (deletingRefinementId) return;
    setDeletingRefinementId(versionId);
    try {
      await onDeleteRefinementVersion(versionId);
      showNotice('Refinement deleted');
      setVersionDropdownOpen(false);
    } catch (error: any) {
      showNotice(error?.message || 'Failed to delete refinement');
    } finally {
      setDeletingRefinementId(null);
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

  const refineModelOptions = SUPPORTED_MODELS.filter((model) =>
    isSvg ? true : model.format !== 'vector'
  );
  const safeRefineModelId = refineModelOptions.some((model) => model.id === selectedModel)
    ? selectedModel
    : refineModelOptions[0]?.id || selectedModel;

  useEffect(() => {
    if (!generation || !version) return;
    if (safeRefineModelId !== selectedModel) {
      onModelChange(safeRefineModelId);
    }
  }, [generation?.id, version?.id, safeRefineModelId, selectedModel, onModelChange]);

  useEffect(() => {
    if (!generation || !version) return;
    const source = normalizeAspectRatio(version.aspectRatio || generation.config.aspectRatio || '');
    const normalizedOptions = resizeAspectRatios
      .map((ratio) => normalizeAspectRatio(ratio.value))
      .filter(Boolean);
    if (normalizedOptions.length === 0) return;

    const firstDifferent = normalizedOptions.find((value) => value !== source) || normalizedOptions[0];
    setResizeAspectRatio((current) => {
      const normalizedCurrent = normalizeAspectRatio(current);
      if (normalizedCurrent && normalizedOptions.includes(normalizedCurrent)) {
        return normalizedCurrent;
      }
      return firstDifferent;
    });
  }, [generation?.id, generation?.config.aspectRatio, version?.id, version?.aspectRatio, resizeAspectRatios]);

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
  const resizeSourceAspectRatio = normalizeAspectRatio(version.aspectRatio || generation.config.aspectRatio || '');
  const resizeSourceLabel = getLabel(resizeSourceAspectRatio, resizeAspectRatios) || resizeSourceAspectRatio;
  const resizeAspectLabel = getLabel(resizeAspectRatio, resizeAspectRatios) || resizeAspectRatio;
  const canResizeToSelected = Boolean(
    resizeAspectRatio &&
      resizeSourceAspectRatio &&
      normalizeAspectRatio(resizeAspectRatio) !== normalizeAspectRatio(resizeSourceAspectRatio)
  );
  const refineModelSelectOptions: RichSelectOption[] = refineModelOptions.map((model) => ({
    value: model.id,
    label: modelLabelMap[model.id] || model.name,
    description: model.description
  }));
  const resizeTargetOptions = resizeAspectRatios.reduce<RichSelectOption[]>((acc, ratio) => {
    const normalizedValue = normalizeAspectRatio(ratio.value);
    if (!normalizedValue || acc.some((option) => option.value === normalizedValue)) {
      return acc;
    }
    const optionLabel = ratio.label || ratio.name || normalizedValue;
    acc.push({
      value: normalizedValue,
      label: optionLabel,
      description: normalizedValue === resizeSourceAspectRatio ? 'Current size' : undefined
    });
    return acc;
  }, []);

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
        <div className="w-full flex justify-center pt-4 px-4 relative z-10">
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
                <div className="fixed inset-0 z-10" onClick={() => setVersionDropdownOpen(false)} />
                <div className="absolute top-full left-1/2 -translate-x-1/2 mt-2 w-64 bg-white dark:bg-[#161b22] border border-gray-200 dark:border-[#30363d] rounded-xl shadow-xl z-20 overflow-hidden p-1">
                  {generation.versions.map((v, idx) => (
                    <div
                      key={v.id}
                      className={`flex items-center gap-1 rounded-lg ${
                        idx === generation.currentVersionIndex
                          ? 'bg-brand-teal/10'
                          : 'hover:bg-gray-50 dark:hover:bg-[#21262d]'
                      }`}
                    >
                      <button
                        onClick={() => {
                          onVersionChange(idx);
                          setVersionDropdownOpen(false);
                        }}
                        className={`flex-1 min-w-0 text-left px-3 py-2 text-sm flex items-center gap-2 transition-colors ${
                          idx === generation.currentVersionIndex
                            ? 'text-brand-teal font-semibold'
                            : 'text-slate-700 dark:text-slate-300'
                        }`}
                      >
                        <span className="font-mono text-xs w-16 shrink-0">{v.label}</span>
                        <span className="text-xs text-slate-400">{v.type === 'refinement' ? 'Refinement' : 'Original'}</span>
                      </button>
                      {v.type === 'refinement' && (
                        <button
                          type="button"
                          onClick={(event) => {
                            event.preventDefault();
                            event.stopPropagation();
                            void handleDeleteRefinementClick(v.id);
                          }}
                          disabled={Boolean(deletingRefinementId)}
                          className={`h-8 w-8 mr-1 inline-flex items-center justify-center rounded-md border transition-colors ${
                            deletingRefinementId
                              ? 'border-gray-200 dark:border-[#30363d] text-slate-400 dark:text-slate-500 cursor-not-allowed'
                              : 'border-red-200/80 dark:border-red-900/40 text-red-500 dark:text-red-300 hover:bg-red-600 hover:border-red-600 hover:text-white'
                          }`}
                          aria-label={`Delete ${v.label}`}
                          title={`Delete ${v.label}`}
                        >
                          {deletingRefinementId === v.id ? <RefreshCw size={13} className="animate-spin" /> : <Trash2 size={13} />}
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Main Viewport — the thumbnail rail (when multiple versions exist)
          lives inside the same centered row as the image card so its height
          tracks the image, not the full viewport. This avoids a tall,
          mostly-empty rail when there are only a handful of marks. */}
      <div className="flex-1 overflow-auto p-4 md:p-8 flex items-center justify-center min-h-0">
        <div className="flex items-stretch gap-3 max-w-full max-h-full">

          {/* Thumbnail rail — outer div has no intrinsic height (its scroller
              is absolutely positioned out of flow), so `items-stretch` above
              pins the rail's height to the image card's height. When the
              batch has more thumbs than fit, the inner scroller handles it. */}
          {hasMultipleVersions && (
            <div className="relative w-[124px] shrink-0 self-stretch">
              <div
                ref={railInnerRef}
                onScroll={() => setHoveredVersionIdx(null)}
                onMouseLeave={() => setHoveredVersionIdx(null)}
                className="absolute inset-0 overflow-y-auto py-2 px-2 flex flex-col gap-2 rounded-lg border border-gray-200 dark:border-[#30363d] bg-gray-50/60 dark:bg-[#0d1117]/60"
                role="listbox"
                aria-label="Generation versions"
              >
                {generation.versions.map((v, idx) => {
                  const isCommitted = idx === generation.currentVersionIndex;
                  const isHovered = idx === hoveredVersionIdx;
                  const isSvgThumb = v.mimeType === 'image/svg+xml';
                  const handleEnter: React.MouseEventHandler<HTMLButtonElement> = (event) => {
                    setHoveredVersionIdx(idx);
                    const btn = event.currentTarget;
                    const scroller = railInnerRef.current;
                    if (scroller) {
                      // Anchor the popover to the thumb's vertical center in
                      // the rail's coordinate space. offsetTop is relative to
                      // the scroller, so we subtract scrollTop to translate
                      // into the visible area.
                      setPopoverTop(btn.offsetTop - scroller.scrollTop + btn.offsetHeight / 2);
                    }
                  };
                  const handleFocus: React.FocusEventHandler<HTMLButtonElement> = (event) => {
                    setHoveredVersionIdx(idx);
                    const btn = event.currentTarget;
                    const scroller = railInnerRef.current;
                    if (scroller) {
                      setPopoverTop(btn.offsetTop - scroller.scrollTop + btn.offsetHeight / 2);
                    }
                  };
                  return (
                    <button
                      key={v.id}
                      type="button"
                      role="option"
                      aria-selected={isCommitted}
                      title={v.label}
                      onMouseEnter={handleEnter}
                      onFocus={handleFocus}
                      onBlur={() => setHoveredVersionIdx((prev) => (prev === idx ? null : prev))}
                      onClick={() => onVersionChange(idx)}
                      className={`relative shrink-0 w-full aspect-square rounded-md overflow-hidden border transition-all ${
                        isCommitted
                          ? 'border-brand-teal ring-2 ring-brand-teal/30'
                          : isHovered
                            ? 'border-brand-teal/70'
                            : 'border-gray-200 dark:border-[#30363d] hover:border-brand-teal/40'
                      }`}
                    >
                      {isSvgThumb && v.svgCode ? (
                        <div
                          className="w-full h-full bg-white flex items-center justify-center [&>svg]:max-w-full [&>svg]:max-h-full [&>svg]:w-auto [&>svg]:h-auto"
                          dangerouslySetInnerHTML={{ __html: sanitizeSvg(v.svgCode) }}
                        />
                      ) : v.imageUrl ? (
                        <img
                          src={v.imageUrl}
                          alt={v.label}
                          loading="lazy"
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <div className="w-full h-full bg-gray-100 dark:bg-[#161b22]" />
                      )}
                    </button>
                  );
                })}
              </div>

              {/* Floating hover/focus preview — rendered at the rail-outer
                  level so the inner scroller's overflow clip can't eat it.
                  Purely visual (pointer-events: none) so it never steals
                  clicks from the next thumb. */}
              {hoveredVersionIdx !== null && generation.versions[hoveredVersionIdx] && (() => {
                const v = generation.versions[hoveredVersionIdx];
                const isCommitted = hoveredVersionIdx === generation.currentVersionIndex;
                const isSvgThumb = v.mimeType === 'image/svg+xml';
                return (
                  <div
                    className="pointer-events-none absolute left-full ml-3 -translate-y-1/2 z-30 animate-in fade-in zoom-in-95 duration-150"
                    style={{ top: popoverTop }}
                    aria-hidden="true"
                  >
                    <div className="w-[280px] bg-white dark:bg-[#161b22] border border-gray-200 dark:border-[#30363d] rounded-lg shadow-2xl overflow-hidden">
                      <div className="aspect-square bg-gray-50 dark:bg-[#0d1117] flex items-center justify-center">
                        {isSvgThumb && v.svgCode ? (
                          <div
                            className="w-full h-full bg-white flex items-center justify-center p-3 [&>svg]:max-w-full [&>svg]:max-h-full [&>svg]:w-auto [&>svg]:h-auto"
                            dangerouslySetInnerHTML={{ __html: sanitizeSvg(v.svgCode) }}
                          />
                        ) : v.imageUrl ? (
                          <img
                            src={v.imageUrl}
                            alt=""
                            className="max-w-full max-h-full object-contain"
                          />
                        ) : null}
                      </div>
                      <div className="px-3 py-2 flex items-center justify-between gap-2 border-t border-gray-200 dark:border-[#30363d] bg-white dark:bg-[#161b22]">
                        <span className={`text-xs font-semibold ${isCommitted ? 'text-brand-teal' : 'text-slate-700 dark:text-slate-200'}`}>
                          {v.label}
                        </span>
                        <span className="text-[10px] uppercase tracking-wider text-slate-400">
                          {v.type === 'refinement' ? 'Refinement' : 'Original'}
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })()}
            </div>
          )}

          <div className={`relative group ${isSvg ? 'w-full max-w-5xl' : 'max-w-full max-h-full'}`}>
          <div className="absolute inset-0 bg-brand-red/20 blur-3xl rounded-full opacity-20 pointer-events-none"></div>
          <div className="relative shadow-2xl shadow-slate-300 dark:shadow-black rounded-lg overflow-visible border border-gray-200 dark:border-[#30363d] bg-white dark:bg-[#0d1117]">

            {/* Main viewport renders only the committed version. The
                thumbnail rail's hover popover provides the sneak-peek; a
                click commits the mark and swaps the large preview. */}
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

              {/* SVG-specific copy actions (non-download) */}
              {isSvg && version.svgCode && (
                <ActionButton onClick={handleCopySvgCode} title="Copy SVG code" tooltip="Copy SVG">
                  <Code size={18} />
                </ActionButton>
              )}

              {/* Raster-specific copy actions (non-download) */}
              {!isSvg && (
                <>
                  <ActionButton onClick={handleCopyImageToClipboard} title="Copy image to clipboard" tooltip="Copy image">
                    <ImageIcon size={18} />
                  </ActionButton>
                  <ActionButton onClick={handleCopyImageUrl} title="Copy image URL" tooltip="Copy URL">
                    <Link size={18} />
                  </ActionButton>
                </>
              )}

              {/* Unified Download menu (this + all) */}
              <DownloadMenu
                mode="this-and-all"
                currentGeneration={generation}
                allGenerations={history}
                allLabel={history.length > 0 ? `Download all (${history.length})` : undefined}
                triggerClassName="group/btn bg-white/90 dark:bg-[#1f252d]/90 border border-gray-300/80 dark:border-white/15 text-slate-800 dark:text-slate-200 hover:bg-brand-teal hover:border-brand-teal hover:text-white p-3 rounded-xl shadow-lg hover:shadow-xl focus:outline-none focus:ring-2 focus:ring-brand-teal/70 focus:ring-offset-1 focus:ring-offset-white dark:focus:ring-offset-[#161b22] transition inline-flex items-center gap-1 disabled:opacity-60 disabled:cursor-not-allowed"
                triggerTitle="Download"
                icon={<Download size={18} />}
                onNotify={showNotice}
                align="right"
              />


              {onDelete && (
                <ActionButton onClick={handleDeleteWithNotice} title="Delete" tooltip="Delete" variant="danger">
                  <Trash2 size={18} />
                </ActionButton>
              )}
            </div>
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

      {isPromptEditorOpen && (
        <div className="fixed inset-0 z-[220] flex items-center justify-center p-4 pointer-events-auto">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setIsPromptEditorOpen(false)} />
          <div className="relative w-full max-w-3xl bg-white dark:bg-[#161b22] border border-gray-200 dark:border-[#30363d] rounded-2xl shadow-2xl p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-slate-900 dark:text-white">Refine Prompt Editor</h3>
              <button
                type="button"
                onClick={() => setIsPromptEditorOpen(false)}
                className="h-8 w-8 inline-flex items-center justify-center rounded-lg border border-gray-200 dark:border-[#30363d] text-slate-600 dark:text-slate-300 hover:bg-gray-100 dark:hover:bg-[#21262d] transition-colors"
                aria-label="Close prompt editor"
              >
                <X size={15} />
              </button>
            </div>
            <textarea
              value={refinementInput}
              onChange={(e) => setRefinementInput(e.target.value)}
              onKeyDown={handleModalPromptKeyDown}
              placeholder={isSvg ? "Refine this SVG (e.g. 'Add a subtle gradient')..." : "Refine this image (e.g. 'Make the background darker')..."}
              rows={12}
              className="w-full p-3 rounded-xl border border-gray-200 dark:border-[#30363d] bg-white dark:bg-[#0d1117] text-sm text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-brand-teal/60"
              disabled={isRefining || isAnalyzingRefinePrompt || isResizingCanvas}
            />
            <div className="mt-3 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setIsPromptEditorOpen(false)}
                className="px-3 py-2 rounded-lg border border-gray-200 dark:border-[#30363d] text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-gray-100 dark:hover:bg-[#21262d] transition-colors"
              >
                Close
              </button>
              <button
                type="button"
                onClick={() => {
                  if (submitRefinementOrResize()) {
                    setIsPromptEditorOpen(false);
                  }
                }}
                disabled={(!refinementInput.trim() && !canResizeToSelected) || isRefining || isAnalyzingRefinePrompt || isResizingCanvas}
                className={`px-3 py-2 rounded-lg text-xs font-semibold text-white transition-colors ${
                  (!refinementInput.trim() && !canResizeToSelected) || isRefining || isAnalyzingRefinePrompt || isResizingCanvas
                    ? 'bg-gray-300 dark:bg-[#30363d] cursor-not-allowed'
                    : 'bg-brand-red hover:bg-red-700'
                }`}
              >
                Submit
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Refinement Bar */}
      <div className="w-full flex flex-col items-center pb-8 px-4 pointer-events-none gap-3 relative z-40">
        <div className="pointer-events-auto w-full max-w-2xl bg-white/90 dark:bg-[#161b22]/90 backdrop-blur-xl border border-gray-200 dark:border-[#30363d] p-2 rounded-2xl shadow-xl shadow-slate-200/50 dark:shadow-black/50">
          <div className="px-1 pb-1 flex flex-wrap items-center gap-2">
            <div className="min-w-[180px] flex-1">
              <RichSelect
                value={safeRefineModelId}
                onChange={onModelChange}
                options={refineModelSelectOptions}
                placeholder="Refine model"
                icon={Wand2}
                compact
                disabled={isRefining || isResizingCanvas}
                buttonClassName="rounded-xl"
                menuClassName="max-w-[22rem] z-[220]"
              />
            </div>
            <div className="min-w-[170px] flex-1">
              <RichSelect
                value={resizeAspectRatio}
                onChange={setResizeAspectRatio}
                options={resizeTargetOptions}
                placeholder="Target size"
                icon={Maximize2}
                compact
                disabled={isRefining || isAnalyzingRefinePrompt || isResizingCanvas}
                buttonClassName="rounded-xl"
                menuClassName="max-w-[18rem] z-[220]"
              />
            </div>
            <button
              type="button"
              onClick={handleResizeCanvasClick}
              disabled={isRefining || isAnalyzingRefinePrompt || isResizingCanvas || !canResizeToSelected}
              className={`relative inline-flex h-9 items-center gap-1.5 px-3.5 rounded-xl border text-xs font-semibold transition-all group ${
                isRefining || isAnalyzingRefinePrompt || isResizingCanvas || !canResizeToSelected
                  ? 'bg-gray-100 dark:bg-[#21262d] text-slate-400 dark:text-slate-500 border-gray-200 dark:border-[#30363d] cursor-not-allowed'
                  : 'bg-white dark:bg-[#161b22] text-slate-700 dark:text-slate-200 border-gray-200 dark:border-[#30363d] hover:bg-brand-teal hover:border-brand-teal hover:text-white shadow-sm'
              }`}
              aria-label={`Recompose image from ${resizeSourceAspectRatio || 'current'} to ${resizeAspectLabel} while preserving style`}
              title={canResizeToSelected ? `Recompose to ${resizeAspectLabel}` : 'Select a different target size'}
            >
              {isResizingCanvas ? <RefreshCw size={12} className="animate-spin" /> : <Maximize2 size={12} />}
              {isResizingCanvas ? 'Recomposing…' : 'Recompose'}
              <span className="pointer-events-none absolute top-full mt-2 right-0 w-72 text-left text-[11px] leading-relaxed px-3 py-2 rounded-lg bg-black/90 text-white shadow-xl opacity-0 group-hover:opacity-100 transition-opacity z-20">
                Rebuilds the image for {resizeAspectLabel} while preserving the same style and palette.
              </span>
            </button>
          </div>
          <div className="px-1 pb-2 text-[11px] text-slate-500 dark:text-slate-400">
            Current size: <span className="text-slate-700 dark:text-slate-300 font-medium">{resizeSourceLabel}</span>
          </div>
          <form onSubmit={handleRefineSubmit} className="flex gap-2 items-center">
            <textarea
              value={refinementInput}
              onChange={(e) => setRefinementInput(e.target.value)}
              onKeyDown={handleInlinePromptKeyDown}
              placeholder={isSvg ? "Refine this SVG (e.g. 'Add a subtle gradient')..." : "Refine this image (e.g. 'Make the background darker')..."}
              rows={1}
              className="flex-1 h-11 p-3 bg-transparent text-sm text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none resize-none overflow-hidden"
              disabled={isRefining || isAnalyzingRefinePrompt || isResizingCanvas}
            />
            <button
              type="button"
              onClick={() => setIsPromptEditorOpen(true)}
              disabled={isRefining || isAnalyzingRefinePrompt || isResizingCanvas}
              className={`inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border transition-all ${
                isRefining || isAnalyzingRefinePrompt || isResizingCanvas
                  ? 'bg-gray-100 dark:bg-[#21262d] text-slate-400 dark:text-slate-500 border-gray-200 dark:border-[#30363d] cursor-not-allowed'
                  : 'bg-white dark:bg-[#161b22] text-slate-800 dark:text-slate-100 border-gray-200 dark:border-[#30363d] hover:bg-brand-teal hover:border-brand-teal hover:text-white shadow-sm'
              }`}
              aria-label="Open full prompt editor"
              title="Open full prompt editor"
            >
              <Maximize2 size={16} />
            </button>
            <button
              type="button"
              onClick={handleAnalyzeRefineClick}
              disabled={isRefining || isAnalyzingRefinePrompt || isResizingCanvas}
              className={`relative inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border transition-all group ${
                isRefining || isAnalyzingRefinePrompt || isResizingCanvas
                  ? 'bg-gray-100 dark:bg-[#21262d] text-slate-400 dark:text-slate-500 border-gray-200 dark:border-[#30363d] cursor-not-allowed'
                  : 'bg-white dark:bg-[#161b22] text-slate-800 dark:text-slate-100 border-gray-200 dark:border-[#30363d] hover:bg-brand-teal hover:border-brand-teal hover:text-white shadow-sm'
              }`}
              aria-label="Analyze current image for spelling, factual, and annotation issues and generate a correction prompt"
              title="Run analysis"
            >
              {isAnalyzingRefinePrompt ? <RefreshCw size={16} className="animate-spin" /> : <Wand2 size={16} />}
              <span className="pointer-events-none absolute -top-10 left-1/2 -translate-x-1/2 whitespace-nowrap text-[11px] font-medium px-2 py-1 rounded-md bg-black/90 text-white shadow-lg opacity-0 group-hover:opacity-100 transition-opacity">
                Run analysis
              </span>
              <span className="pointer-events-none absolute top-full mt-2 right-0 w-64 text-left text-[11px] leading-relaxed px-3 py-2 rounded-lg bg-black/90 text-white shadow-xl opacity-0 group-hover:opacity-100 transition-opacity z-20">
                Checks text accuracy, spelling, and label/factual issues, then drafts a detailed correction prompt and switches refine model to Nano Banana Pro.
              </span>
            </button>
            <button
              type="submit"
              disabled={(!refinementInput.trim() && !canResizeToSelected) || isRefining || isAnalyzingRefinePrompt || isResizingCanvas}
              className={`h-11 w-11 shrink-0 rounded-xl font-medium text-white inline-flex items-center justify-center transition-all ${
                (!refinementInput.trim() && !canResizeToSelected) || isRefining || isAnalyzingRefinePrompt || isResizingCanvas
                  ? 'bg-gray-200 dark:bg-[#30363d] text-slate-400 dark:text-slate-500 cursor-not-allowed'
                  : 'bg-brand-red hover:bg-red-700 text-white shadow-lg shadow-brand-red/20'
              }`}
            >
               {isRefining || isResizingCanvas ? (
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

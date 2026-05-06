import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Generation, GenerationVersion, BrandColor, VisualStyle, GraphicType, AspectRatioOption } from '../types';
import { Download, RefreshCw, Send, Image as ImageIcon, Copy, Link, Trash2, ChevronDown, ChevronLeft, ChevronRight, Layers, FileImage, Code, Play, Pause, FileCode, Info, X, Globe, Wand2, Maximize2, GitCompare, Plus, Expand, ScanSearch } from 'lucide-react';
import { createBlobUrlFromImage } from '../services/imageSourceService';
import { getCachedImageBlobUrl } from '../services/imageCache';
import { getCurrentVersion } from '../services/historyService';
import { buildExportFilename } from '../services/versionUtils';
import { webpToPngBlob } from '../services/imageConversionService';
import { sanitizeSvg } from '../services/svgService';
import { SUPPORTED_MODELS, MODEL_GROUP_ORDER } from '../constants';
import { normalizeAspectRatio } from '../services/aspectRatioService';
import { RichSelect, RichSelectOption } from './RichSelect';
import { DownloadMenu } from './DownloadMenu';
import { JuxtaposeSlider } from './JuxtaposeSlider';

export interface ImageDisplayMarkRef {
  generationId: string;
  versionId: string;
  imageUrl: string;
  mimeType: string;
  modelId: string;
  markLabel: string;
  aspectRatio?: string;
}

export interface ImageDisplayComparisonState {
  mode: 'idle' | 'picking';
  a: ImageDisplayMarkRef | null;
  b: ImageDisplayMarkRef | null;
}

interface ImageDisplayProps {
  generation: Generation | null;
  onRefine: (refinementText: string) => void;
  onAnalyzeRefinePrompt: () => Promise<string>;
  /** AI-expand the refine draft (or the tile's original prompt when the draft is empty). */
  onExpandRefinementPrompt: (draft: string) => Promise<string>;
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
  comparisonState?: ImageDisplayComparisonState;
  onEnterComparePicker?: (seed?: ImageDisplayMarkRef) => void;
  onExitComparePicker?: () => void;
  onPickMark?: (ref: ImageDisplayMarkRef) => void;
  /**
   * Step the main viewport to a sibling generation in the recent-history
   * carousel. Wired by the parent to the same restore flow used by the
   * Recent Generations grid so state stays consistent.
   */
  onNavigateToGeneration?: (gen: Generation) => void;
}

export const ImageDisplay: React.FC<ImageDisplayProps> = ({ 
  generation,
  onRefine,
  onAnalyzeRefinePrompt,
  onExpandRefinementPrompt,
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
  history = [],
  comparisonState,
  onEnterComparePicker,
  onExitComparePicker,
  onPickMark,
  onNavigateToGeneration,
}) => {
  const isCompareMode = comparisonState?.mode === 'picking';
  const comparisonA = comparisonState?.a || null;
  const comparisonB = comparisonState?.b || null;
  const isComparing = !!(comparisonA && comparisonB);
  const handleMarkActivate = (
    event: React.MouseEvent,
    ref: ImageDisplayMarkRef,
    onNormalClick: () => void
  ) => {
    if (onPickMark && (event.shiftKey || isCompareMode)) {
      event.preventDefault();
      event.stopPropagation();
      // Shift-click should feel like "compare this against what I'm currently
      // looking at". If we're not already in compare mode and a committed
      // mark exists, seed A with the committed mark and immediately use the
      // shift-clicked mark as B.
      const isSameMark = (a: ImageDisplayMarkRef, b: ImageDisplayMarkRef) =>
        a.generationId === b.generationId && a.versionId === b.versionId;
      if (
        event.shiftKey &&
        !isCompareMode &&
        !isComparing &&
        currentMarkRef &&
        !isSameMark(currentMarkRef, ref)
      ) {
        onPickMark(currentMarkRef);
      }
      onPickMark(ref);
      return;
    }
    onNormalClick();
    // First-run discoverability nudge: the compare feature is otherwise easy
    // to miss. Flash a small hint when a thumbnail is normal-clicked so the
    // user learns the shift-click shortcut. Suppressed while already picking
    // or while a comparison is already on screen, and skipped when there's
    // only a single mark on the tile (nothing to shift-click against, so
    // the hint would be misleading).
    const hasSiblingsToCompare = (generation?.versions.length ?? 0) > 1;
    if (onPickMark && !isCompareMode && !isComparing && hasSiblingsToCompare) {
      if (compareHintTimerRef.current) {
        window.clearTimeout(compareHintTimerRef.current);
      }
      setCompareHintVisible(true);
      compareHintTimerRef.current = window.setTimeout(() => {
        setCompareHintVisible(false);
        compareHintTimerRef.current = null;
      }, 4000);
    }
  };
  const isMarkPicked = (genId: string, verId: string): 'a' | 'b' | null => {
    if (comparisonA && comparisonA.generationId === genId && comparisonA.versionId === verId) return 'a';
    if (comparisonB && comparisonB.generationId === genId && comparisonB.versionId === verId) return 'b';
    return null;
  };
  const [refinementInput, setRefinementInput] = useState('');
  const [copyNotice, setCopyNotice] = useState<string | null>(null);
  const [noticeTimer, setNoticeTimer] = useState<number | null>(null);
  const [renderImageSrc, setRenderImageSrc] = useState<string>('');
  const [fallbackBlobUrl, setFallbackBlobUrl] = useState<string | null>(null);
  const [versionImageSrcByKey, setVersionImageSrcByKey] = useState<Record<string, string>>({});
  const [versionDropdownOpen, setVersionDropdownOpen] = useState(false);
  const [animationPaused, setAnimationPaused] = useState(false);
  const [infoVisible, setInfoVisible] = useState(false);
  const [isAnalyzingRefinePrompt, setIsAnalyzingRefinePrompt] = useState(false);
  const [isExpandingRefinement, setIsExpandingRefinement] = useState(false);
  const [isResizingCanvas, setIsResizingCanvas] = useState(false);
  const [deletingRefinementId, setDeletingRefinementId] = useState<string | null>(null);
  const [isPromptEditorOpen, setIsPromptEditorOpen] = useState(false);
  const [resizeAspectRatio, setResizeAspectRatio] = useState('');
  /** True while refine / analysis / expand / recompose is in flight. */
  const refinementControlsLocked =
    isRefining || isAnalyzingRefinePrompt || isResizingCanvas || isExpandingRefinement;
  // True while the user is actively dragging the JuxtaposeSlider divider.
  // Used to mute the in-image overlays (rail, version chip, action buttons,
  // compare overlay, etc.) so the user gets a clean before/after read while
  // they scrub. Reset by JuxtaposeSlider on pointerup / unmount.
  const [isSliderDragging, setIsSliderDragging] = useState(false);
  // Thumbnail strip hover: while hovering a thumbnail, the main viewport
  // mirrors that version without committing it. Null = show the committed
  // `currentVersionIndex`.
  const [hoveredVersionIdx, setHoveredVersionIdx] = useState<number | null>(null);
  // Viewport coordinates for the floating hover popover. We use
  // `position: fixed` because the rail lives deep inside a stack of
  // absolutely-positioned + overflow:auto ancestors and the page header
  // (z-50) was painting on top of the popover image when its `absolute`
  // ancestor's top fell near the viewport top. Fixed positioning + a
  // viewport-aware clamp keeps the popover fully visible no matter where
  // the rail is on the page.
  const [popoverPos, setPopoverPos] = useState<{ top: number; left: number }>({ top: 0, left: 0 });
  // Ephemeral "shift-click another to compare" hint shown for ~4s after the
  // user clicks a thumbnail normally. Resets every time a new thumbnail is
  // clicked. Intentionally suppressed while already in compare-picker mode.
  const [compareHintVisible, setCompareHintVisible] = useState(false);
  const compareHintTimerRef = useRef<number | null>(null);
  const svgContainerRef = useRef<HTMLDivElement>(null);
  const railInnerRef = useRef<HTMLDivElement>(null);
  const versionBlobUrlsRef = useRef<Record<string, string>>({});

  const version = generation ? getCurrentVersion(generation) : null;
  const isSvg = version?.mimeType === 'image/svg+xml';
  const getVersionImageKey = (generationId: string, versionId: string): string =>
    `${generationId}|${versionId}`;
  const getVersionDisplayImageUrl = (generationId: string, targetVersion: GenerationVersion): string =>
    versionImageSrcByKey[getVersionImageKey(generationId, targetVersion.id)] || targetVersion.imageUrl;

  // Turn the currently-committed version into a MarkRef so the Compare button
  // can hand it off as the pre-seeded "A" side. Users enter compare mode
  // while already looking at a specific mark, so it's almost always the thing
  // they want to be one half of the comparison.
  const currentMarkRef: ImageDisplayMarkRef | null = generation && version
    ? {
        generationId: generation.id,
        versionId: version.id,
        imageUrl: renderImageSrc || getVersionDisplayImageUrl(generation.id, version),
        mimeType: version.mimeType,
        modelId: version.modelId || generation.modelId,
        markLabel: version.label,
        aspectRatio: version.aspectRatio || generation.config.aspectRatio,
      }
    : null;
  const handleEnterCompareFromButton = () => {
    if (!onEnterComparePicker) return;
    onEnterComparePicker(currentMarkRef || undefined);
  };

  // Carousel navigation across the Recent Generations history. The grid is
  // rendered newest-first, so "previous" (←) jumps to the newer neighbor and
  // "next" (→) jumps to the older one — matching the visual order users see
  // in the gallery below.
  const currentIdxInHistory = generation
    ? history.findIndex((g) => g.id === generation.id)
    : -1;
  const newerGeneration =
    currentIdxInHistory > 0 ? history[currentIdxInHistory - 1] : null;
  const olderGeneration =
    currentIdxInHistory >= 0 && currentIdxInHistory < history.length - 1
      ? history[currentIdxInHistory + 1]
      : null;
  const canNavigate = !!onNavigateToGeneration && !isComparing && !isCompareMode;
  const canGoNewer = canNavigate && !!newerGeneration;
  const canGoOlder = canNavigate && !!olderGeneration;
  // Carousel arrows always land on the newest mark of the next generation.
  // Without this override, restoring would re-show whatever `currentVersionIndex`
  // was stored on the doc (often Mark 1) — surprising when the user is browsing
  // history and expects the latest refinement.
  const withLatestVersion = (gen: Generation): Generation => ({
    ...gen,
    currentVersionIndex: Math.max(0, gen.versions.length - 1),
  });
  const goNewer = useCallback(() => {
    if (!onNavigateToGeneration || !newerGeneration) return;
    onNavigateToGeneration(withLatestVersion(newerGeneration));
  }, [onNavigateToGeneration, newerGeneration]);
  const goOlder = useCallback(() => {
    if (!onNavigateToGeneration || !olderGeneration) return;
    onNavigateToGeneration(withLatestVersion(olderGeneration));
  }, [onNavigateToGeneration, olderGeneration]);

  const versionCount = generation?.versions.length ?? 0;
  const canCycleVersions =
    !!generation &&
    versionCount > 1 &&
    !isComparing &&
    !isCompareMode;

  const goNextVersion = useCallback(() => {
    if (!generation || versionCount < 2) return;
    const idx = generation.currentVersionIndex;
    const next = (idx + 1) % versionCount;
    onVersionChange(next);
  }, [generation, versionCount, onVersionChange]);

  const goPrevVersion = useCallback(() => {
    if (!generation || versionCount < 2) return;
    const idx = generation.currentVersionIndex;
    const next = (idx - 1 + versionCount) % versionCount;
    onVersionChange(next);
  }, [generation, versionCount, onVersionChange]);

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

  // Clear any pending compare-hint timer on unmount.
  useEffect(() => {
    return () => {
      if (compareHintTimerRef.current) {
        window.clearTimeout(compareHintTimerRef.current);
        compareHintTimerRef.current = null;
      }
    };
  }, []);

  // Keyboard carousel: ←/→ steps the main viewport to the neighboring
  // generation; ↑/↓ cycles Marks (Mark I, II, …) on the current tile, with
  // wrap (last ↓ → Mark I). Same window listener and focus guards as ←/→.
  useEffect(() => {
    if (!canNavigate && !canCycleVersions) return;
    const onKey = (e: KeyboardEvent) => {
      if (
        e.key !== 'ArrowLeft' &&
        e.key !== 'ArrowRight' &&
        e.key !== 'ArrowUp' &&
        e.key !== 'ArrowDown'
      ) {
        return;
      }
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (isPromptEditorOpen) return;
      const target = e.target as HTMLElement | null;
      if (target) {
        const tag = target.tagName;
        if (
          tag === 'INPUT' ||
          tag === 'TEXTAREA' ||
          tag === 'SELECT' ||
          target.isContentEditable
        ) {
          return;
        }
      }
      if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
        if (!canCycleVersions) return;
        e.preventDefault();
        if (e.key === 'ArrowDown') {
          goNextVersion();
        } else {
          goPrevVersion();
        }
        return;
      }
      if (!canNavigate) return;
      if (e.key === 'ArrowLeft' && canGoNewer) {
        e.preventDefault();
        goNewer();
      } else if (e.key === 'ArrowRight' && canGoOlder) {
        e.preventDefault();
        goOlder();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [
    canNavigate,
    canCycleVersions,
    canGoNewer,
    canGoOlder,
    goNewer,
    goOlder,
    goNextVersion,
    goPrevVersion,
    isPromptEditorOpen,
  ]);

  useEffect(() => {
    return () => {
      if (fallbackBlobUrl) URL.revokeObjectURL(fallbackBlobUrl);
    };
  }, [fallbackBlobUrl]);

  useEffect(() => {
    if (!isPromptEditorOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        setIsPromptEditorOpen(false);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isPromptEditorOpen]);

  useEffect(() => {
    return () => {
      Object.values(versionBlobUrlsRef.current).forEach((url) => URL.revokeObjectURL(url));
      versionBlobUrlsRef.current = {};
    };
  }, []);

  useEffect(() => {
    const activeKeys = new Set(
      generation?.versions.map((item) => getVersionImageKey(generation.id, item.id)) || []
    );
    const staleKeys = Object.keys(versionBlobUrlsRef.current).filter((key) => !activeKeys.has(key));
    if (staleKeys.length === 0) return;

    staleKeys.forEach((key) => {
      URL.revokeObjectURL(versionBlobUrlsRef.current[key]);
      delete versionBlobUrlsRef.current[key];
    });

    setVersionImageSrcByKey((prev) => {
      const next = { ...prev };
      staleKeys.forEach((key) => delete next[key]);
      return next;
    });
  }, [generation?.id, generation?.versions]);

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
  // Compact labels used in the thumbnail rail chip and tight UI surfaces
  // where the full marketing name would wrap or get clipped.
  const modelShortLabelMap: Record<string, string> = {
    gemini: 'Nano Pro',
    'gemini-3.1-flash-image-preview': 'Nano 2',
    'openai-2': 'GPT 2',
    'openai-mini': 'GPT Mini',
    openai: 'GPT 1.5',
    'gemini-svg': 'SVG'
  };

  const getLabel = (id: string | undefined, list: any[]) => {
    if (!id) return '';
    const item = list.find((i: any) => i.id === id || i.value === id);
    return item?.name || item?.label || id;
  };

  /**
   * Returns CSS-ready dimensions for the thumbnail hover preview so it shows
   * the *actual* shape of the generated image instead of a black-letterboxed
   * square. Landscape/wide ratios render at full width; portrait/tall ratios
   * are width-clamped so the popover doesn't get absurdly tall.
   */
  const getHoverPreviewStyle = (ratioStr?: string | null): React.CSSProperties => {
    const MAX_W = 320;
    const MAX_H = 360;
    const parsed = /^(\d+(?:\.\d+)?)[:xX](\d+(?:\.\d+)?)$/.exec(String(ratioStr || '').trim());
    if (!parsed) return { width: MAX_W, aspectRatio: '1 / 1' };
    const w = parseFloat(parsed[1]);
    const h = parseFloat(parsed[2]);
    if (!w || !h) return { width: MAX_W, aspectRatio: '1 / 1' };
    const r = w / h;
    const heightIfFullW = MAX_W / r;
    if (heightIfFullW <= MAX_H) {
      return { width: MAX_W, aspectRatio: `${w} / ${h}` };
    }
    return { width: Math.round(MAX_H * r), aspectRatio: `${w} / ${h}` };
  };

  /**
   * Estimated total height of the rail's hover preview card, including the
   * bottom label footer. Used by the rail to clamp the preview's vertical
   * position so it never extends above the rail's visible scroll area
   * (which would clip the top of the image — the original bug) or below
   * it (which would clip the label / footer when hovering the bottom-most
   * thumb). Footer is ~36px (px-3 py-2 + 12px text + a hairline border).
   */
  const FOOTER_H = 36;
  const getHoverPreviewHeight = (ratioStr?: string | null): number => {
    const style = getHoverPreviewStyle(ratioStr);
    const width = typeof style.width === 'number' ? style.width : 320;
    const aspect = String(style.aspectRatio || '1 / 1');
    const m = /^(\d+(?:\.\d+)?)\s*\/\s*(\d+(?:\.\d+)?)$/.exec(aspect);
    if (!m) return width + FOOTER_H;
    const aw = parseFloat(m[1]);
    const ah = parseFloat(m[2]);
    if (!aw || !ah) return width + FOOTER_H;
    return Math.round(width * (ah / aw)) + FOOTER_H;
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
    if (refinementControlsLocked) return;
    setIsAnalyzingRefinePrompt(true);
    try {
      const prompt = await onAnalyzeRefinePrompt();
      if (prompt?.trim()) {
        setRefinementInput(prompt.trim());
        setIsPromptEditorOpen(true);
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

  const handleExpandRefinementClick = async () => {
    if (refinementControlsLocked) return;
    setIsExpandingRefinement(true);
    try {
      const expanded = await onExpandRefinementPrompt(refinementInput);
      if (expanded?.trim()) {
        setRefinementInput(expanded.trim());
        showNotice('Prompt expanded.');
      } else {
        showNotice('Expand finished with no text.');
      }
    } catch (error: any) {
      showNotice(error?.message || 'Expand failed');
    } finally {
      setIsExpandingRefinement(false);
    }
  };

  const handleResizeCanvasClick = async () => {
    if (refinementControlsLocked) return;
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
      showNotice('Version deleted');
      setVersionDropdownOpen(false);
    } catch (error: any) {
      showNotice(error?.message || 'Failed to delete version');
    } finally {
      setDeletingRefinementId(null);
    }
  };

  const handleImageError = async () => {
    if (!version) return;
    if (renderImageSrc.startsWith('blob:')) return;

    // Path 1 — fresh generation, base64 still inline. Cheap, synchronous.
    const inlineBlobUrl = createBlobUrlFromImage({
      imageUrl: version.imageUrl,
      base64Data: version.imageData,
      mimeType: version.mimeType
    });
    if (inlineBlobUrl) {
      if (fallbackBlobUrl) URL.revokeObjectURL(fallbackBlobUrl);
      setFallbackBlobUrl(inlineBlobUrl);
      setRenderImageSrc(inlineBlobUrl);
      return;
    }

    // Path 2 — history loaded from Firestore (no inline bytes). Try the
    // IndexedDB cache. This is what restores the main preview when the
    // network blocks Firebase Storage.
    if (!generation || !version.id) return;
    try {
      const cachedBlobUrl = await getCachedImageBlobUrl(generation.id, version.id);
      if (!cachedBlobUrl) return;
      // Bail if the user navigated to a different version while we waited.
      const stillCurrentVersion = getCurrentVersion(generation);
      if (!stillCurrentVersion || stillCurrentVersion.id !== version.id) {
        URL.revokeObjectURL(cachedBlobUrl);
        return;
      }
      if (renderImageSrc.startsWith('blob:')) {
        URL.revokeObjectURL(cachedBlobUrl);
        return;
      }
      if (fallbackBlobUrl) URL.revokeObjectURL(fallbackBlobUrl);
      setFallbackBlobUrl(cachedBlobUrl);
      setRenderImageSrc(cachedBlobUrl);
    } catch (error) {
      console.warn('[ImageDisplay] Failed to load cached blob URL:', error);
    }
  };

  const handleVersionImageError = async (generationId: string, targetVersion: GenerationVersion) => {
    const key = getVersionImageKey(generationId, targetVersion.id);
    const currentSource = versionImageSrcByKey[key];
    if (currentSource?.startsWith('blob:')) return;

    // Path 1 — inline bytes available.
    const inlineBlobUrl = createBlobUrlFromImage({
      imageUrl: targetVersion.imageUrl,
      base64Data: targetVersion.imageData,
      mimeType: targetVersion.mimeType
    });
    if (inlineBlobUrl) {
      const previousBlobUrl = versionBlobUrlsRef.current[key];
      if (previousBlobUrl) URL.revokeObjectURL(previousBlobUrl);
      versionBlobUrlsRef.current[key] = inlineBlobUrl;
      setVersionImageSrcByKey((prev) => ({ ...prev, [key]: inlineBlobUrl }));
      return;
    }

    // Path 2 — IndexedDB cache lookup.
    if (!targetVersion.id) return;
    try {
      const cachedBlobUrl = await getCachedImageBlobUrl(generationId, targetVersion.id);
      if (!cachedBlobUrl) return;
      // Re-check the slot wasn't filled while we awaited IDB.
      if (versionBlobUrlsRef.current[key]) {
        URL.revokeObjectURL(cachedBlobUrl);
        return;
      }
      versionBlobUrlsRef.current[key] = cachedBlobUrl;
      setVersionImageSrcByKey((prev) => ({ ...prev, [key]: cachedBlobUrl }));
    } catch (error) {
      console.warn('[ImageDisplay] Failed to load cached version blob URL:', error);
    }
  };

  const refineModelOptions = SUPPORTED_MODELS.filter((model) =>
    isSvg ? true : model.format !== 'vector'
  );
  // Default the refine model to whichever model produced the active version.
  // For comparison tiles this means switching between marks made by Nano
  // Banana Pro vs GPT Image 2 also flips the refine dropdown to that model,
  // which is what users intuitively want ("refine THIS image"). Falls back
  // to the existing selection or the tile's primary model if nothing matches.
  const versionModelId = version?.modelId;
  const tileModelId = generation?.modelId;
  const preferredRefineModelId = (() => {
    if (versionModelId && refineModelOptions.some((m) => m.id === versionModelId)) {
      return versionModelId;
    }
    if (refineModelOptions.some((m) => m.id === selectedModel)) return selectedModel;
    if (tileModelId && refineModelOptions.some((m) => m.id === tileModelId)) {
      return tileModelId;
    }
    return refineModelOptions[0]?.id || selectedModel;
  })();
  const safeRefineModelId = preferredRefineModelId;

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
    // When a brand-new batch is starting (`isRefining`), show a clear
    // "Generating…" state instead of the static "Ready to Create"
    // placeholder. Without this, users couldn't tell whether their click
    // had registered, because the previous result had already been
    // cleared from the canvas but no first result has come back yet.
    if (isRefining) {
      return (
        <div className="flex-1 flex flex-col items-center justify-center p-8 text-center h-full min-h-[60vh] text-slate-900 dark:text-white">
          <div className="w-24 h-24 rounded-3xl bg-white dark:bg-[#161b22] border border-gray-200 dark:border-[#30363d] flex items-center justify-center mb-6 shadow-xl shadow-slate-200 dark:shadow-black/50">
            <span
              className="h-10 w-10 rounded-full border-[3px] border-brand-teal/25 border-t-brand-teal animate-spin"
              role="progressbar"
              aria-label="Generating"
            />
          </div>
          <h2 className="text-2xl font-bold tracking-tight">Generating…</h2>
          <p className="text-slate-500 dark:text-slate-400 max-w-md mt-3 text-sm leading-relaxed">
            Your first result will land here as soon as the model responds. Track progress in the Active Generations panel.
          </p>
        </div>
      );
    }
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
  // True when this tile holds versions from more than one model (i.e. a
  // comparison run). Triggers the per-thumb model chip + mixed-model badge
  // in the details panel.
  const distinctVersionModels = new Set(
    generation.versions.map((v) => v.modelId).filter(Boolean) as string[]
  );
  const hasMixedModels = distinctVersionModels.size > 1;
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
    description: model.description,
    group: model.group
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

  const ActionButton = ({ onClick, title, children, tooltip, variant = 'default', className: extraClass }: {
    onClick: () => void;
    title: string;
    children: React.ReactNode;
    tooltip: string;
    variant?: 'default' | 'danger';
    className?: string;
  }) => (
    <button 
      onClick={onClick}
      className={`group/btn ${variant === 'danger'
        ? 'bg-white/85 dark:bg-[#2b1c1c]/85 border border-red-200/80 dark:border-red-900/40 text-red-600 dark:text-red-200 hover:bg-red-600 hover:border-red-600 hover:text-white'
        : 'bg-white/90 dark:bg-[#1f252d]/90 border border-gray-300/80 dark:border-white/15 text-slate-800 dark:text-slate-200 hover:bg-brand-teal hover:border-brand-teal hover:text-white'
      } p-2.5 lg:p-3 rounded-xl shadow-lg hover:shadow-xl focus:outline-none focus:ring-2 focus:ring-brand-teal/70 focus:ring-offset-1 focus:ring-offset-white dark:focus:ring-offset-[#161b22] transition relative ${extraClass || ''}`}
      title={title}
    >
      {children}
      <span className="pointer-events-none absolute -top-9 left-1/2 -translate-x-1/2 whitespace-nowrap text-[11px] font-medium px-2 py-1 rounded-md bg-black/90 text-white shadow-lg opacity-0 group-hover/btn:opacity-100 transition-opacity">
        {tooltip}
      </span>
    </button>
  );

  // Roman-numeral suffix of `version.label`. Labels look like "Mark III"
  // (see `toMarkLabel` in versionUtils), so stripping the prefix gives us
  // just the numeral for the compact in-image chip.
  const versionRomanNumeral = version
    ? version.label.replace(/^Mark\s+/, '')
    : '';

  return (
    <div className="flex-1 flex flex-col h-full relative">
      {/* Main Viewport — the thumbnail rail (when multiple versions exist)
          lives inside the same centered row as the image card so its height
          tracks the image, not the full viewport. This avoids a tall,
          mostly-empty rail when there are only a handful of marks. */}
      <div className="flex-1 overflow-auto p-4 md:p-8 flex items-center justify-center min-h-0">
        {/* Keep a concrete row width so compare mode can't shrink-wrap around
            the slider surface. Without `w-full`, this row can collapse to the
            intrinsic width of its children. `group` drives the hover-reveal
            behavior of the in-image overlays AND the rail — hover anywhere
            over the preview area to surface the chrome. The rail is
            absolutely positioned (see below) so it floats over the image's
            left edge instead of reserving width; the image card therefore
            reclaims the rail's footprint at rest and gets the full row
            width to render itself. `relative` is needed for the absolute
            rail to anchor against this row. */}
        <div
          className="group relative w-full min-w-0 flex items-stretch gap-3 max-h-full mx-auto max-w-7xl"
          data-dragging={isSliderDragging ? 'true' : undefined}
        >

          {/* Thumbnail rail — absolutely positioned so it floats on top of
              the row's left edge instead of taking 124px out of layout.
              At rest the image card therefore renders edge-to-edge and the
              rail is invisible; rolling over the preview row reveals the
              rail with a small slide-in. While picking/comparing the rail
              stays at full opacity (and pointer-events on) so the user can
              drive the two-mark flow without their cursor having to
              babysit the image. The inner scroller is `absolute inset-0`
              against THIS wrapper, so the wrapper still needs a concrete
              height — `top-0 bottom-0` does that against the row.

              Rendered for any generation with at least one version (i.e.
              always) so the "Add a new Mark" plus button at the bottom of
              the rail is reachable even on single-version generations —
              that's how users iterate on a fresh result without hunting
              for the refine bar. The Compare control inside the rail is
              still gated on hasMultipleVersions below since you can't
              compare a mark against itself. */}
          {generation.versions.length >= 1 && (
            <div
              className={`absolute top-0 bottom-0 left-0 w-[124px] z-30 transition-all duration-200 group-data-[dragging=true]:!opacity-0 group-data-[dragging=true]:!pointer-events-none ${
                isCompareMode || isComparing
                  ? 'opacity-100 translate-x-0 pointer-events-auto'
                  : 'opacity-0 -translate-x-2 pointer-events-none group-hover:opacity-100 group-hover:translate-x-0 group-hover:pointer-events-auto group-focus-within:opacity-100 group-focus-within:translate-x-0 group-focus-within:pointer-events-auto'
              }`}
            >
              <div
                ref={railInnerRef}
                onScroll={() => setHoveredVersionIdx(null)}
                onMouseLeave={() => setHoveredVersionIdx(null)}
                className="absolute inset-0 overflow-y-auto py-2 px-2 flex flex-col gap-2 rounded-lg border border-gray-200 dark:border-[#30363d] bg-gray-50/60 dark:bg-[#0d1117]/60"
                role="listbox"
                aria-label="Generation versions"
              >
                {/* Persistent "Compare" affordance at the top of the rail.
                    Clicking toggles compare-picker mode so users who don't
                    realize the hidden toolbar button or the shift-click
                    shortcut exist still have a visible path to the slider.
                    Sticky so it stays anchored while scrolling long rails.
                    Docked (faded out) at rest so it doesn't compete with
                    the large image; reveals when the user rolls over the
                    preview row. While actively in compare/picking mode the
                    button stays at full opacity so the user can always
                    bail out. */}
                {hasMultipleVersions && onEnterComparePicker && onExitComparePicker && (
                  <button
                    type="button"
                    onClick={() => {
                      if (isCompareMode || isComparing) {
                        onExitComparePicker();
                      } else {
                        handleEnterCompareFromButton();
                      }
                    }}
                    title={
                      isCompareMode
                        ? 'Cancel — exit compare mode'
                        : isComparing
                          ? 'Close the comparison viewer'
                          : 'Open compare: click two marks (or Shift-click to pick without toggling)'
                    }
                    className={`sticky top-0 z-10 -mx-2 -mt-2 mb-1 px-2 py-1.5 flex items-center gap-1.5 justify-center text-[11px] font-bold uppercase tracking-wider border-b transition-all ${
                      isCompareMode || isComparing
                        ? 'opacity-100 bg-brand-teal text-white border-brand-teal hover:bg-brand-teal/90'
                        : 'opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 bg-gray-100 dark:bg-[#161b22] text-slate-600 dark:text-slate-300 border-gray-200 dark:border-[#30363d] hover:bg-brand-teal/10 hover:text-brand-teal hover:border-brand-teal/40'
                    }`}
                  >
                    <GitCompare size={12} />
                    {isCompareMode ? 'Cancel' : isComparing ? 'Close' : 'Compare'}
                  </button>
                )}
                {generation.versions.map((v, idx) => {
                  const isCommitted = idx === generation.currentVersionIndex;
                  const isHovered = idx === hoveredVersionIdx;
                  const isSvgThumb = v.mimeType === 'image/svg+xml';
                  const pickSide = isMarkPicked(generation.id, v.id);
                  // Per-version model wins over the tile's primary model so
                  // comparison runs (mixed-model tiles) pick the right model
                  // for the slider label / refine fan-out.
                  const thumbModelId = v.modelId || generation.modelId;
                  const thumbImageUrl = getVersionDisplayImageUrl(generation.id, v);
                  const markRef: ImageDisplayMarkRef = {
                    generationId: generation.id,
                    versionId: v.id,
                    imageUrl: thumbImageUrl,
                    mimeType: v.mimeType,
                    modelId: thumbModelId,
                    markLabel: v.label,
                    aspectRatio: v.aspectRatio || generation.config.aspectRatio,
                  };
                  // Anchor the popover so its TOP edge lines up with the
                  // hovered thumbnail's TOP edge — i.e. it tracks the
                  // square thumbnails as the user scrubs the rail. We
                  // compute viewport coordinates (used with
                  // `position: fixed`) so the popover can sit anywhere on
                  // screen without being clipped by overflow:auto ancestors
                  // or covered by the higher-z page header. The vertical
                  // position is clamped to keep the entire card within an
                  // 8px safe area at the top and bottom of the viewport.
                  const positionPreview = (btn: HTMLButtonElement) => {
                    const ratio = v.aspectRatio || generation.config.aspectRatio;
                    const previewHeight = getHoverPreviewHeight(ratio);
                    const rect = btn.getBoundingClientRect();
                    const safeTop = 8;
                    const safeBottom = 8;
                    const minTop = safeTop;
                    const maxTop = Math.max(safeTop, window.innerHeight - previewHeight - safeBottom);
                    const top = Math.min(Math.max(rect.top, minTop), maxTop);
                    const left = rect.right + 12;
                    setPopoverPos({ top, left });
                  };
                  const handleEnter: React.MouseEventHandler<HTMLButtonElement> = (event) => {
                    setHoveredVersionIdx(idx);
                    positionPreview(event.currentTarget);
                  };
                  const handleFocus: React.FocusEventHandler<HTMLButtonElement> = (event) => {
                    setHoveredVersionIdx(idx);
                    positionPreview(event.currentTarget);
                  };
                  // Hover-delete affordance on the rail. Sits absolutely on
                  // top of the thumb button as a sibling (not nested) so it
                  // doesn't violate the no-button-in-button rule. Hidden when
                  // a generation has only one version (the underlying
                  // handler refuses to delete the last one) and while in
                  // compare-pick / comparing mode so it can't fight with the
                  // pick-two flow. Visible whenever the thumb is hovered or
                  // keyboard-focused so it's discoverable without obscuring
                  // the image at rest.
                  const showRailDelete =
                    generation.versions.length > 1 && !isCompareMode && !isComparing;
                  const railDeleteVisible =
                    showRailDelete && (isHovered || deletingRefinementId === v.id);
                  return (
                    <div key={v.id} className="relative w-full group/railThumb">
                    <button
                      type="button"
                      role="option"
                      aria-selected={isCommitted}
                      title={v.label}
                      onMouseEnter={handleEnter}
                      onFocus={handleFocus}
                      onBlur={() => setHoveredVersionIdx((prev) => (prev === idx ? null : prev))}
                      onClick={(event) => handleMarkActivate(event, markRef, () => onVersionChange(idx))}
                      className={`relative shrink-0 w-full aspect-square rounded-md overflow-hidden border transition-all ${
                        pickSide
                          ? 'border-2 border-amber-400 ring-2 ring-amber-400/50 ring-offset-2 ring-offset-gray-50 dark:ring-offset-[#0d1117]'
                          : isCompareMode
                            ? 'border-dashed border-brand-teal/60 hover:border-brand-teal'
                            : isCommitted
                              ? 'border-[3px] border-brand-teal ring-2 ring-brand-teal/50 ring-offset-2 ring-offset-gray-50 dark:ring-offset-[#0d1117] shadow-lg shadow-brand-teal/20'
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
                          src={thumbImageUrl}
                          alt={v.label}
                          loading="lazy"
                          className="w-full h-full object-cover"
                          onError={() => handleVersionImageError(generation.id, v)}
                        />
                      ) : (
                        <div className="w-full h-full bg-gray-100 dark:bg-[#161b22]" />
                      )}
                      {pickSide && (
                        <span className="absolute top-1 left-1 inline-flex items-center justify-center w-5 h-5 rounded-full bg-amber-400 text-[10px] font-bold text-slate-900 shadow">
                          {pickSide.toUpperCase()}
                        </span>
                      )}
                      {isCommitted && !pickSide && (
                        <span
                          aria-hidden="true"
                          className="absolute top-1 right-1 inline-flex items-center justify-center w-2.5 h-2.5 rounded-full bg-brand-teal shadow ring-2 ring-white dark:ring-[#0d1117]"
                          title="Currently shown"
                        />
                      )}
                      {hasMixedModels && thumbModelId && (
                        <span
                          className="absolute bottom-1 left-1 right-1 inline-flex items-center justify-center px-1 py-0.5 rounded text-[9px] font-bold uppercase tracking-wide bg-black/70 text-white shadow truncate"
                          title={modelLabelMap[thumbModelId] || thumbModelId}
                        >
                          {modelShortLabelMap[thumbModelId] || modelLabelMap[thumbModelId] || thumbModelId}
                        </span>
                      )}
                    </button>
                    {showRailDelete && (
                      <button
                        type="button"
                        onMouseEnter={() => setHoveredVersionIdx(idx)}
                        onClick={(event) => {
                          event.preventDefault();
                          event.stopPropagation();
                          void handleDeleteRefinementClick(v.id);
                        }}
                        disabled={Boolean(deletingRefinementId)}
                        aria-label={`Delete ${v.label}`}
                        title={`Delete ${v.label}`}
                        className={`absolute top-1 right-1 z-10 inline-flex items-center justify-center h-5 w-5 rounded-full bg-red-600 text-white shadow ring-1 ring-white/40 dark:ring-black/40 transition-all focus:opacity-100 focus:outline-none focus:ring-2 focus:ring-red-400/70 ${
                          railDeleteVisible
                            ? 'opacity-100'
                            : 'opacity-0 group-hover/railThumb:opacity-100'
                        } ${
                          deletingRefinementId
                            ? 'cursor-not-allowed bg-red-400'
                            : 'hover:bg-red-700'
                        }`}
                      >
                        {deletingRefinementId === v.id ? (
                          <RefreshCw size={11} className="animate-spin" />
                        ) : (
                          <X size={11} strokeWidth={3} />
                        )}
                      </button>
                    )}
                    </div>
                  );
                })}

                {/* "Add a new Mark" affordance — sits after the last thumb so
                    users can iterate on the current image without hunting for
                    the refine bar. One-click "do it again": re-runs the last
                    prompt (current version's refinement prompt, or the
                    generation's original prompt) through the refinement
                    pipeline to add a fresh Mark. Shift-click opens the full
                    prompt editor for users who want to tweak before sending.
                    Hidden in compare-pick / comparing mode so it can't fight
                    with the two-mark selection flow. */}
                {!isCompareMode && !isComparing && (() => {
                  const lastPrompt =
                    (version?.refinementPrompt && version.refinementPrompt.trim()) ||
                    (generation.config.prompt && generation.config.prompt.trim()) ||
                    '';
                  const hasLastPrompt = Boolean(lastPrompt);
                  const handleAddMarkClick = (event: React.MouseEvent) => {
                    if (event.shiftKey || !hasLastPrompt) {
                      setIsPromptEditorOpen(true);
                      return;
                    }
                    onRefine(lastPrompt);
                  };
                  const titleText = hasLastPrompt
                    ? 'Add a new Mark — re-run the last prompt (Shift-click to edit)'
                    : 'Add a new Mark — open the refine editor';
                  return (
                    <button
                      type="button"
                      onClick={handleAddMarkClick}
                      onMouseEnter={() => setHoveredVersionIdx(null)}
                      onFocus={() => setHoveredVersionIdx(null)}
                      disabled={refinementControlsLocked}
                      aria-label={hasLastPrompt ? 'Add a new Mark using the last prompt' : 'Add a new Mark'}
                      title={titleText}
                      className="shrink-0 w-full aspect-square rounded-md border-2 border-dashed border-gray-300 dark:border-[#30363d] flex items-center justify-center text-slate-500 dark:text-slate-400 bg-white/60 dark:bg-[#161b22]/60 hover:border-brand-teal hover:text-brand-teal hover:bg-brand-teal/5 focus:outline-none focus:ring-2 focus:ring-brand-teal/60 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {isRefining ? (
                        <RefreshCw size={24} strokeWidth={2.5} className="animate-spin" aria-hidden="true" />
                      ) : (
                        <Plus size={28} strokeWidth={2.5} aria-hidden="true" />
                      )}
                    </button>
                  );
                })()}
              </div>

              {/* Ephemeral "shift-click another to compare" hint. Pops up for
                  ~4s after a normal thumbnail click so users discover the
                  compare shortcut without a modal/onboarding flow. Anchored
                  to the bottom of the rail so it never overlaps thumbs. */}
              {compareHintVisible && onPickMark && !isCompareMode && !isComparing && (
                <div
                  className="pointer-events-none absolute left-full ml-3 bottom-2 z-20 animate-in fade-in slide-in-from-left-2 duration-200"
                  role="status"
                  aria-live="polite"
                >
                  <div className="px-3 py-2 rounded-lg bg-slate-900 dark:bg-[#161b22] text-white text-xs font-medium shadow-lg border border-slate-800 dark:border-[#30363d] whitespace-nowrap flex items-center gap-2">
                    <GitCompare size={13} className="text-brand-teal" />
                    <span>
                      <span className="text-brand-teal font-bold">Shift-click</span>{' '}
                      another thumbnail to compare
                    </span>
                  </div>
                </div>
              )}

              {/* Floating hover/focus preview — uses `position: fixed` so
                  the page header (z-50) and the main viewport's
                  overflow:auto can't clip or cover it. Coordinates are
                  computed from the hovered thumb's bounding rect and
                  clamped to stay fully on-screen. Purely visual
                  (pointer-events: none) so it never steals clicks from
                  the next thumb. */}
              {hoveredVersionIdx !== null && generation.versions[hoveredVersionIdx] && (() => {
                const v = generation.versions[hoveredVersionIdx];
                const isCommitted = hoveredVersionIdx === generation.currentVersionIndex;
                const isSvgThumb = v.mimeType === 'image/svg+xml';
                const previewStyle = getHoverPreviewStyle(v.aspectRatio || generation.config.aspectRatio);
                const previewImageUrl = getVersionDisplayImageUrl(generation.id, v);
                return (
                  <div
                    className="pointer-events-none fixed z-[60] animate-in fade-in zoom-in-95 duration-150"
                    style={{ top: popoverPos.top, left: popoverPos.left }}
                    aria-hidden="true"
                  >
                    <div
                      className="bg-white dark:bg-[#161b22] border border-gray-200 dark:border-[#30363d] rounded-lg shadow-2xl overflow-hidden"
                      style={{ width: previewStyle.width }}
                    >
                      <div
                        className="bg-gray-50 dark:bg-[#0d1117] flex items-center justify-center"
                        style={{ aspectRatio: previewStyle.aspectRatio }}
                      >
                        {isSvgThumb && v.svgCode ? (
                          <div
                            className="w-full h-full bg-white flex items-center justify-center p-3 [&>svg]:max-w-full [&>svg]:max-h-full [&>svg]:w-auto [&>svg]:h-auto"
                            dangerouslySetInnerHTML={{ __html: sanitizeSvg(v.svgCode) }}
                          />
                        ) : v.imageUrl ? (
                          <img
                            src={previewImageUrl}
                            alt=""
                            className="w-full h-full object-contain"
                            onError={() => handleVersionImageError(generation.id, v)}
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

          {/* Keep preview + rail as one centered block. Using `flex-1` here
              stretches the preview column across all remaining width, which
              makes `items-start` look like a global left align and
              `items-center` create a big gap from the rail. */}
          <div className="min-w-0 w-full max-w-7xl flex flex-col items-center">
          <div className={`relative ${isSvg || isComparing ? 'w-full' : 'max-w-full max-h-full'}`}>
          <div className="absolute inset-0 bg-brand-red/20 blur-3xl rounded-full opacity-20 pointer-events-none"></div>
          <div className="relative shadow-2xl shadow-slate-300 dark:shadow-black rounded-lg overflow-visible border border-gray-200 dark:border-[#30363d] bg-white dark:bg-[#0d1117]">

            {/* Carousel arrows — step to a neighboring generation in history.
                Hidden while the comparison slider is active so we don't pile
                on top of its own controls, and individually disabled at the
                edges of the history list. Mirrors the keyboard ←/→ shortcut.
                The LEFT arrow used to sit at `left-3` of the card, but now
                that the rail floats over the row's leftmost 124px the arrow
                would get hidden behind it. Pushing the arrow past the
                rail's footprint (left-[136px] = 124px rail + 12px gap)
                keeps it reachable when the row is hovered and the rail is
                visible alongside the navigation controls. */}
            {canNavigate && (canGoNewer || canGoOlder) && (
              <>
                <div className="hidden sm:block absolute top-1/2 -translate-y-1/2 left-[136px] z-20 group/arrowBtn opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity group-data-[dragging=true]:!opacity-0 group-data-[dragging=true]:!pointer-events-none">
                  <button
                    type="button"
                    onClick={goNewer}
                    disabled={!canGoNewer}
                    aria-label="Previous generation (newer)"
                    className="inline-flex items-center justify-center h-11 w-11 rounded-full border border-gray-300/80 dark:border-white/15 bg-white/90 dark:bg-[#1f252d]/90 text-slate-800 dark:text-slate-200 shadow-lg backdrop-blur-sm hover:bg-brand-teal hover:border-brand-teal hover:text-white focus:outline-none focus:ring-2 focus:ring-brand-teal/70 focus:ring-offset-1 focus:ring-offset-white dark:focus:ring-offset-[#0d1117] disabled:opacity-30 disabled:pointer-events-none transition"
                  >
                    <ChevronLeft size={22} />
                  </button>
                  <div
                    className="pointer-events-none absolute left-full ml-3 top-1/2 -translate-y-1/2 w-60 px-3 py-2.5 rounded-xl bg-black/90 text-white shadow-xl opacity-0 group-hover/arrowBtn:opacity-100 group-focus-within/arrowBtn:opacity-100 transition-opacity z-30"
                    role="tooltip"
                  >
                    <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">Previous generation</div>
                    <div className="text-[11px] leading-relaxed text-slate-100 mb-2">
                      {canGoNewer ? 'Step back to the previous tile in your history.' : 'No newer generation in history.'}
                    </div>
                    <div className="pt-2 border-t border-white/10 space-y-1 text-[11px] text-slate-300">
                      <div className="flex items-center gap-2">
                        <kbd className="inline-flex items-center justify-center h-5 min-w-[20px] px-1 rounded bg-white/10 border border-white/15 text-[10px] font-mono">←</kbd>
                        <kbd className="inline-flex items-center justify-center h-5 min-w-[20px] px-1 rounded bg-white/10 border border-white/15 text-[10px] font-mono">→</kbd>
                        <span>switch generations</span>
                      </div>
                      {hasMultipleVersions && (
                        <div className="flex items-center gap-2">
                          <kbd className="inline-flex items-center justify-center h-5 min-w-[20px] px-1 rounded bg-white/10 border border-white/15 text-[10px] font-mono">↑</kbd>
                          <kbd className="inline-flex items-center justify-center h-5 min-w-[20px] px-1 rounded bg-white/10 border border-white/15 text-[10px] font-mono">↓</kbd>
                          <span>cycle Marks</span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
                <div className="hidden sm:block absolute top-1/2 -translate-y-1/2 right-3 z-20 group/arrowBtn opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity group-data-[dragging=true]:!opacity-0 group-data-[dragging=true]:!pointer-events-none">
                  <button
                    type="button"
                    onClick={goOlder}
                    disabled={!canGoOlder}
                    aria-label="Next generation (older)"
                    className="inline-flex items-center justify-center h-11 w-11 rounded-full border border-gray-300/80 dark:border-white/15 bg-white/90 dark:bg-[#1f252d]/90 text-slate-800 dark:text-slate-200 shadow-lg backdrop-blur-sm hover:bg-brand-teal hover:border-brand-teal hover:text-white focus:outline-none focus:ring-2 focus:ring-brand-teal/70 focus:ring-offset-1 focus:ring-offset-white dark:focus:ring-offset-[#0d1117] disabled:opacity-30 disabled:pointer-events-none transition"
                  >
                    <ChevronRight size={22} />
                  </button>
                  <div
                    className="pointer-events-none absolute right-full mr-3 top-1/2 -translate-y-1/2 w-60 px-3 py-2.5 rounded-xl bg-black/90 text-white shadow-xl opacity-0 group-hover/arrowBtn:opacity-100 group-focus-within/arrowBtn:opacity-100 transition-opacity z-30"
                    role="tooltip"
                  >
                    <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">Next generation</div>
                    <div className="text-[11px] leading-relaxed text-slate-100 mb-2">
                      {canGoOlder ? 'Step forward to the next tile in your history.' : 'No older generation in history.'}
                    </div>
                    <div className="pt-2 border-t border-white/10 space-y-1 text-[11px] text-slate-300">
                      <div className="flex items-center gap-2">
                        <kbd className="inline-flex items-center justify-center h-5 min-w-[20px] px-1 rounded bg-white/10 border border-white/15 text-[10px] font-mono">←</kbd>
                        <kbd className="inline-flex items-center justify-center h-5 min-w-[20px] px-1 rounded bg-white/10 border border-white/15 text-[10px] font-mono">→</kbd>
                        <span>switch generations</span>
                      </div>
                      {hasMultipleVersions && (
                        <div className="flex items-center gap-2">
                          <kbd className="inline-flex items-center justify-center h-5 min-w-[20px] px-1 rounded bg-white/10 border border-white/15 text-[10px] font-mono">↑</kbd>
                          <kbd className="inline-flex items-center justify-center h-5 min-w-[20px] px-1 rounded bg-white/10 border border-white/15 text-[10px] font-mono">↓</kbd>
                          <span>cycle Marks</span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
                {/* Position counter — small, unobtrusive label so users know
                    where they are in the history without scrolling down. */}
                <div className="hidden sm:flex absolute bottom-3 left-1/2 -translate-x-1/2 z-20 items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-black/60 text-white backdrop-blur-sm shadow opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition pointer-events-none group-data-[dragging=true]:!opacity-0">
                  {currentIdxInHistory + 1} / {history.length}
                </div>
              </>
            )}


            {/* Main viewport renders the committed version — OR, when two
                marks have been picked for comparison, the Juxtapose slider
                fills the same shadow card directly (no inner padding, no
                embedded header) so it gets the same footprint as the plain
                preview. */}
            {isComparing && comparisonA && comparisonB ? (
              <JuxtaposeSlider
                imageA={comparisonA.imageUrl}
                imageB={comparisonB.imageUrl}
                labelA={comparisonA.markLabel}
                labelB={comparisonB.markLabel}
                aspectRatio={comparisonA.aspectRatio || comparisonB.aspectRatio}
                maxHeight="78vh"
                toolbarOverlay
                className="block"
                onDraggingChange={setIsSliderDragging}
              />
            ) : isSvg && version.svgCode ? (
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
                  <span
                    className="inline-flex items-center px-2 py-0.5 rounded text-xs font-bold bg-brand-teal/15 text-brand-teal border border-brand-teal/50"
                    title={hasMixedModels ? 'Model that produced this version' : undefined}
                  >
                    {modelLabelMap[version.modelId || generation.modelId || 'gemini'] || 'Model'}
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
            
            {/* Docked compare overlay (top-center). The pick-mode banner
                ("Pick the second mark to compare") and the active-comparison
                header ("Comparing A vs B" + Close) used to live ABOVE the
                preview, eating vertical space. They're now in-image
                overlays that follow the same hover-reveal pattern as the
                action buttons and version chip — invisible by default,
                fade in when the user rolls over the preview area. */}
            {(isCompareMode || (isComparing && comparisonA && comparisonB)) && (
              <div
                className="absolute top-4 left-1/2 -translate-x-1/2 z-20 max-w-[calc(100%-7rem)] opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 group-data-[dragging=true]:!opacity-0 group-data-[dragging=true]:!pointer-events-none transition-opacity"
                role="status"
                aria-live="polite"
              >
                {isComparing && comparisonA && comparisonB ? (
                  <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/90 dark:bg-[#161b22]/90 border border-gray-200 dark:border-white/15 shadow-lg backdrop-blur-md text-sm font-semibold text-brand-teal max-w-full">
                    <GitCompare size={14} className="shrink-0" />
                    {/* Compact label: just the two Mark names. Hovering the
                        corner chips on the slider surface still surfaces the
                        full model + mark identity if the user needs it. */}
                    <span
                      className="px-2 py-0.5 rounded bg-brand-teal/15 border border-brand-teal/40 text-brand-teal text-xs whitespace-nowrap"
                      title={`${modelLabelMap[comparisonA.modelId] || comparisonA.modelId} · ${comparisonA.markLabel}`}
                    >
                      {comparisonA.markLabel}
                    </span>
                    <span className="text-slate-400 shrink-0">vs</span>
                    <span
                      className="px-2 py-0.5 rounded bg-brand-teal/15 border border-brand-teal/40 text-brand-teal text-xs whitespace-nowrap"
                      title={`${modelLabelMap[comparisonB.modelId] || comparisonB.modelId} · ${comparisonB.markLabel}`}
                    >
                      {comparisonB.markLabel}
                    </span>
                    {onExitComparePicker && (
                      <button
                        type="button"
                        onClick={onExitComparePicker}
                        title="Close the comparison viewer"
                        aria-label="Close the comparison viewer"
                        className="ml-1 inline-flex items-center justify-center h-7 w-7 shrink-0 rounded-md text-slate-500 dark:text-slate-300 hover:bg-gray-100 dark:hover:bg-[#21262d] hover:text-slate-900 dark:hover:text-white transition-colors"
                      >
                        <X size={14} />
                      </button>
                    )}
                  </div>
                ) : (
                  <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-brand-teal/40 bg-brand-teal/10 backdrop-blur-md text-brand-teal text-sm font-medium shadow-lg max-w-full">
                    <GitCompare size={14} className="shrink-0" />
                    <span className="truncate">
                      {comparisonA
                        ? 'Pick the second mark to compare'
                        : 'Pick two marks to compare'}
                    </span>
                    {onExitComparePicker && (
                      <button
                        type="button"
                        onClick={onExitComparePicker}
                        title="Cancel compare"
                        aria-label="Cancel compare"
                        className="ml-1 text-[11px] uppercase tracking-wider font-bold text-brand-teal/80 hover:text-brand-teal underline-offset-2 hover:underline shrink-0"
                      >
                        Cancel
                      </button>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* In-image version chip (top-left). Replaces the standalone
                "Mark III · Original" pill that previously sat above the
                preview and ate vertical space. Compact icon-only display
                with just the Roman numeral; hover/focus expands the chip
                to reveal the full label and a rich switcher menu listing
                every version with delete affordances. */}
            {hasMultipleVersions && !isComparing && (
              <div
                className={`absolute top-4 left-4 z-20 transition-opacity group-data-[dragging=true]:!opacity-0 group-data-[dragging=true]:!pointer-events-none ${
                  versionDropdownOpen
                    ? 'opacity-100'
                    : 'opacity-0 group-hover:opacity-100 group-focus-within:opacity-100'
                }`}
              >
                <div className="relative group/version">
                  <button
                    type="button"
                    onClick={() => setVersionDropdownOpen(!versionDropdownOpen)}
                    aria-label={`Switch version (current: ${version.label}${version.type === 'refinement' ? ', refinement' : ''})`}
                    aria-haspopup="menu"
                    aria-expanded={versionDropdownOpen}
                    className={`inline-flex items-center gap-1.5 h-9 pl-2.5 pr-2 rounded-full border backdrop-blur-md shadow-lg transition-colors ${
                      versionDropdownOpen
                        ? 'bg-brand-teal text-white border-brand-teal'
                        : 'bg-white/90 dark:bg-[#161b22]/90 border-gray-200/80 dark:border-white/15 text-slate-900 dark:text-white hover:bg-brand-teal hover:text-white hover:border-brand-teal'
                    } focus:outline-none focus:ring-2 focus:ring-brand-teal/70`}
                  >
                    <Layers size={14} className="shrink-0" />
                    <span className="font-mono text-xs font-bold leading-none tracking-wider">{versionRomanNumeral}</span>
                    <ChevronDown size={13} className={`transition-transform ${versionDropdownOpen ? 'rotate-180' : ''}`} />
                  </button>

                  {/* Rich hover popover — only visible while the menu is
                      closed, so it doesn't fight with the open dropdown. */}
                  {!versionDropdownOpen && (
                    <div className="pointer-events-none absolute top-full left-0 mt-2 w-60 origin-top-left rounded-xl bg-black/90 text-white shadow-xl ring-1 ring-white/10 px-3 py-2.5 opacity-0 group-hover/version:opacity-100 transition-opacity duration-150 z-30">
                      <div className="flex items-center justify-between gap-2 mb-1.5">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Version</span>
                        <span className="text-[10px] font-mono text-slate-400">
                          {(generation.currentVersionIndex ?? 0) + 1} / {generation.versions.length}
                        </span>
                      </div>
                      <div className="text-sm font-semibold">{version.label}</div>
                      {version.type === 'refinement' && version.refinementPrompt && (
                        <div className="mt-1 text-[11px] leading-snug text-amber-200 line-clamp-3">
                          Refined: {version.refinementPrompt}
                        </div>
                      )}
                      <div className="mt-2 pt-2 border-t border-white/10 text-[10px] text-slate-400">
                        Click to switch versions
                      </div>
                    </div>
                  )}

                  {versionDropdownOpen && (
                    <>
                      <div className="fixed inset-0 z-10" onClick={() => setVersionDropdownOpen(false)} />
                      <div className="absolute top-full left-0 mt-2 w-auto min-w-[10rem] bg-white dark:bg-[#161b22] border border-gray-200 dark:border-[#30363d] rounded-xl shadow-xl z-20 overflow-hidden p-1">
                        {generation.versions.map((v, idx) => (
                          <div
                            key={v.id}
                            className={`flex items-center gap-0.5 rounded-lg ${
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
                              title={v.type === 'refinement' && v.refinementPrompt ? `Refined: ${v.refinementPrompt}` : v.label}
                              className={`flex-1 min-w-0 text-left pl-3 pr-2 py-2 text-sm font-mono inline-flex items-center gap-1.5 transition-colors ${
                                idx === generation.currentVersionIndex
                                  ? 'text-brand-teal font-semibold'
                                  : 'text-slate-700 dark:text-slate-300'
                              }`}
                            >
                              <span className="whitespace-nowrap">{v.label}</span>
                              {v.type === 'refinement' && (
                                <span
                                  className="inline-block h-1.5 w-1.5 rounded-full bg-amber-400 shrink-0"
                                  aria-label="Refinement"
                                />
                              )}
                            </button>
                            {/* Allow deleting any version, not just refinements.
                                When a generation contains only one version, the
                                handler would throw "Cannot delete the last version"
                                — surface that as a disabled state instead so the
                                button is informative rather than error-producing. */}
                            {(() => {
                              const isOnlyVersion = generation.versions.length <= 1;
                              const isBusy = Boolean(deletingRefinementId);
                              const disabled = isOnlyVersion || isBusy;
                              const tooltip = isOnlyVersion
                                ? 'Cannot delete the only version — use the tile trash to remove the whole generation'
                                : `Delete ${v.label}`;
                              return (
                                <button
                                  type="button"
                                  onClick={(event) => {
                                    event.preventDefault();
                                    event.stopPropagation();
                                    void handleDeleteRefinementClick(v.id);
                                  }}
                                  disabled={disabled}
                                  className={`h-8 w-8 mr-1 inline-flex items-center justify-center rounded-md border transition-colors ${
                                    disabled
                                      ? 'border-gray-200 dark:border-[#30363d] text-slate-400 dark:text-slate-500 cursor-not-allowed'
                                      : 'border-red-200/80 dark:border-red-900/40 text-red-500 dark:text-red-300 hover:bg-red-600 hover:border-red-600 hover:text-white'
                                  }`}
                                  aria-label={tooltip}
                                  title={tooltip}
                                >
                                  {deletingRefinementId === v.id ? <RefreshCw size={13} className="animate-spin" /> : <Trash2 size={13} />}
                                </button>
                              );
                            })()}
                          </div>
                        ))}
                      </div>
                    </>
                  )}
                </div>
              </div>
            )}

            {/* Action buttons (top right). Hidden while the inline
                comparison slider is active — they target a single version
                (download, refine, info, etc.) which doesn't apply to the
                two-up view, and their absolute position was overlapping the
                slider's own Close / Swap / Side-by-side controls. */}
            <div
              className={`absolute top-4 right-4 flex flex-wrap justify-end items-center gap-2 lg:gap-3 max-w-[calc(100%-2rem)] transition-opacity group-data-[dragging=true]:!opacity-0 group-data-[dragging=true]:!pointer-events-none ${
                isComparing
                  ? 'opacity-0 pointer-events-none'
                  : 'opacity-0 group-hover:opacity-100 group-focus-within:opacity-100'
              }`}
            >
              {onEnterComparePicker && onExitComparePicker && (
                <ActionButton
                  onClick={() => {
                    if (isCompareMode) onExitComparePicker();
                    else handleEnterCompareFromButton();
                  }}
                  title="Click two marks to open a before/after slider (or Shift-click any mark)"
                  tooltip={isCompareMode ? 'Cancel compare' : 'Compare'}
                  className={isCompareMode ? 'text-brand-teal' : undefined}
                >
                  <GitCompare size={18} />
                </ActionButton>
              )}

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
                // In the main tile viewer, "Download all" should scope to the
                // current tile only (all marks/versions inside this generation),
                // not the entire history gallery.
                allGenerations={[generation]}
                allLabel="Download all in this tile"
                triggerClassName="group/btn bg-white/90 dark:bg-[#1f252d]/90 border border-gray-300/80 dark:border-white/15 text-slate-800 dark:text-slate-200 hover:bg-brand-teal hover:border-brand-teal hover:text-white p-2.5 lg:p-3 rounded-xl shadow-lg hover:shadow-xl focus:outline-none focus:ring-2 focus:ring-brand-teal/70 focus:ring-offset-1 focus:ring-offset-white dark:focus:ring-offset-[#161b22] transition inline-flex items-center gap-1 disabled:opacity-60 disabled:cursor-not-allowed"
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

          {/* Mobile carousel controls — at small widths the floating overlay
              arrows would crowd the image, so we surface a normal-flow row
              under the card with the same prev/next/position info. */}
          {canNavigate && (canGoNewer || canGoOlder) && (
            <div className="sm:hidden mt-3 flex items-center justify-center gap-3">
              <button
                type="button"
                onClick={goNewer}
                disabled={!canGoNewer}
                aria-label="Previous generation (newer)"
                className="inline-flex items-center justify-center h-11 w-11 rounded-full border border-gray-300 dark:border-[#30363d] bg-white dark:bg-[#161b22] text-slate-700 dark:text-slate-200 shadow hover:border-brand-teal hover:text-brand-teal disabled:opacity-40 disabled:pointer-events-none transition"
              >
                <ChevronLeft size={20} />
              </button>
              <span className="text-xs font-semibold text-slate-600 dark:text-slate-300 tabular-nums min-w-[3.5rem] text-center">
                {currentIdxInHistory + 1} / {history.length}
              </span>
              <button
                type="button"
                onClick={goOlder}
                disabled={!canGoOlder}
                aria-label="Next generation (older)"
                className="inline-flex items-center justify-center h-11 w-11 rounded-full border border-gray-300 dark:border-[#30363d] bg-white dark:bg-[#161b22] text-slate-700 dark:text-slate-200 shadow hover:border-brand-teal hover:text-brand-teal disabled:opacity-40 disabled:pointer-events-none transition"
              >
                <ChevronRight size={20} />
              </button>
            </div>
          )}
        </div>
      </div>
      </div>

      {copyNotice && (
        <div className="pointer-events-none fixed inset-0 z-50 flex items-center justify-center">
          <div className="bg-brand-red text-white text-base px-6 py-4 rounded-2xl shadow-2xl border border-brand-red/70 animate-in fade-in duration-150 pointer-events-none" role="status" aria-live="polite">
            {copyNotice}
          </div>
        </div>
      )}

      {isPromptEditorOpen && (
        <div className="fixed inset-0 z-[220] flex items-center justify-center p-4 pointer-events-auto">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setIsPromptEditorOpen(false)} aria-hidden />
          <div
            id="refine-prompt-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="refine-prompt-modal-title"
            className="relative w-full max-w-4xl max-h-[90vh] flex flex-col bg-white dark:bg-[#161b22] border border-gray-200 dark:border-[#30363d] rounded-2xl shadow-2xl p-4 sm:p-5"
          >
            <div className="flex items-center justify-between gap-3 mb-3 shrink-0">
              <h3 id="refine-prompt-modal-title" className="text-base font-semibold text-slate-900 dark:text-white">
                Refine prompt
              </h3>
              <button
                type="button"
                onClick={() => setIsPromptEditorOpen(false)}
                className="h-11 min-w-11 shrink-0 inline-flex items-center justify-center rounded-lg border border-gray-200 dark:border-[#30363d] text-slate-600 dark:text-slate-300 hover:bg-gray-100 dark:hover:bg-[#21262d] transition-colors"
                aria-label="Close prompt editor"
              >
                <X size={18} />
              </button>
            </div>
            <textarea
              value={refinementInput}
              onChange={(e) => setRefinementInput(e.target.value)}
              onKeyDown={handleModalPromptKeyDown}
              placeholder={isSvg ? "Refine this SVG (e.g. 'Add a subtle gradient')..." : "Refine this image (e.g. 'Make the background darker')..."}
              rows={18}
              className="w-full min-h-[min(70vh,28rem)] max-h-[min(70vh,36rem)] p-4 rounded-xl border border-gray-200 dark:border-[#30363d] bg-white dark:bg-[#0d1117] text-base leading-relaxed text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-brand-teal/60 overflow-y-auto shrink"
              disabled={refinementControlsLocked}
            />
            <p className="mt-2 text-xs text-slate-500 dark:text-slate-400 shrink-0">
              Press Esc to close. Cmd/Ctrl+Enter submits from this editor.
            </p>
            <div className="mt-4 flex justify-end gap-2 shrink-0">
              <button
                type="button"
                onClick={() => setIsPromptEditorOpen(false)}
                className="min-h-11 px-4 rounded-lg border border-gray-200 dark:border-[#30363d] text-sm font-semibold text-slate-700 dark:text-slate-200 hover:bg-gray-100 dark:hover:bg-[#21262d] transition-colors"
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
                disabled={(!refinementInput.trim() && !canResizeToSelected) || refinementControlsLocked}
                className={`min-h-11 px-4 rounded-lg text-sm font-semibold text-white transition-colors ${
                  (!refinementInput.trim() && !canResizeToSelected) || refinementControlsLocked
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
                disabled={refinementControlsLocked}
                buttonClassName="rounded-xl"
                menuClassName="max-w-[22rem] z-[220]"
                groupOrder={[...MODEL_GROUP_ORDER]}
                hideOptionDescriptions
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
                disabled={refinementControlsLocked}
                buttonClassName="rounded-xl"
                menuClassName="max-w-[18rem] z-[220]"
              />
            </div>
            <button
              type="button"
              onClick={handleResizeCanvasClick}
              disabled={refinementControlsLocked || !canResizeToSelected}
              className={`relative inline-flex h-9 items-center gap-1.5 px-3.5 rounded-xl border text-xs font-semibold transition-all group ${
                refinementControlsLocked || !canResizeToSelected
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
          <div className="px-1 pb-2 text-[11px] text-slate-500 dark:text-slate-400 flex flex-wrap items-center justify-between gap-2">
            <span>
              Current size: <span className="text-slate-700 dark:text-slate-300 font-medium">{resizeSourceLabel}</span>
            </span>
            <button
              type="button"
              onClick={() => setIsPromptEditorOpen(true)}
              aria-expanded={isPromptEditorOpen}
              aria-controls="refine-prompt-modal"
              className="text-sm font-semibold text-brand-teal dark:text-teal-400 hover:underline decoration-brand-teal/60 underline-offset-2 min-h-11 px-2 rounded-lg hover:bg-brand-teal/10 dark:hover:bg-teal-950/40 transition-colors"
            >
              Open full editor
            </button>
          </div>
          <form onSubmit={handleRefineSubmit} className="flex gap-2 items-center">
            <textarea
              value={refinementInput}
              onChange={(e) => setRefinementInput(e.target.value)}
              onKeyDown={handleInlinePromptKeyDown}
              placeholder={isSvg ? "Refine this SVG (e.g. 'Add a subtle gradient')..." : "Refine this image (e.g. 'Make the background darker')..."}
              rows={1}
              className="flex-1 h-11 max-h-11 p-3 bg-transparent text-sm leading-snug text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none resize-none overflow-hidden"
              disabled={refinementControlsLocked}
            />
            <button
              type="button"
              onClick={handleExpandRefinementClick}
              disabled={refinementControlsLocked}
              className={`relative inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border transition-all group ${
                refinementControlsLocked
                  ? 'bg-gray-100 dark:bg-[#21262d] text-slate-400 dark:text-slate-500 border-gray-200 dark:border-[#30363d] cursor-not-allowed'
                  : 'bg-white dark:bg-[#161b22] text-slate-800 dark:text-slate-100 border-gray-200 dark:border-[#30363d] hover:bg-brand-teal hover:border-brand-teal hover:text-white shadow-sm'
              }`}
              aria-label="Expand refine prompt with richer creative detail"
              title="Expand prompt — uses your text, or the tile's original prompt if empty"
            >
              {isExpandingRefinement ? <RefreshCw size={16} className="animate-spin" /> : <Expand size={16} />}
              <span className="pointer-events-none absolute -top-10 left-1/2 -translate-x-1/2 whitespace-nowrap text-[11px] font-medium px-2 py-1 rounded-md bg-black/90 text-white shadow-lg opacity-0 group-hover:opacity-100 transition-opacity">
                Expand prompt
              </span>
            </button>
            <button
              type="button"
              onClick={() => setIsPromptEditorOpen(true)}
              disabled={refinementControlsLocked}
              className={`inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border transition-all ${
                refinementControlsLocked
                  ? 'bg-gray-100 dark:bg-[#21262d] text-slate-400 dark:text-slate-500 border-gray-200 dark:border-[#30363d] cursor-not-allowed'
                  : 'bg-white dark:bg-[#161b22] text-slate-800 dark:text-slate-100 border-gray-200 dark:border-[#30363d] hover:bg-brand-teal hover:border-brand-teal hover:text-white shadow-sm'
              }`}
              aria-label="Open refine prompt in full-screen editor"
              title="Open full editor (modal)"
            >
              <Maximize2 size={16} />
            </button>
            <button
              type="button"
              onClick={handleAnalyzeRefineClick}
              disabled={refinementControlsLocked}
              className={`relative inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border transition-all group ${
                refinementControlsLocked
                  ? 'bg-gray-100 dark:bg-[#21262d] text-slate-400 dark:text-slate-500 border-gray-200 dark:border-[#30363d] cursor-not-allowed'
                  : 'bg-white dark:bg-[#161b22] text-slate-800 dark:text-slate-100 border-gray-200 dark:border-[#30363d] hover:bg-brand-teal hover:border-brand-teal hover:text-white shadow-sm'
              }`}
              aria-label="Analyze current image for spelling, factual, and annotation issues and generate a correction prompt"
              title="Run analysis"
            >
              {isAnalyzingRefinePrompt ? <RefreshCw size={16} className="animate-spin" /> : <ScanSearch size={16} />}
              <span className="pointer-events-none absolute -top-10 left-1/2 -translate-x-1/2 whitespace-nowrap text-[11px] font-medium px-2 py-1 rounded-md bg-black/90 text-white shadow-lg opacity-0 group-hover:opacity-100 transition-opacity">
                Run analysis
              </span>
              <span className="pointer-events-none absolute top-full mt-2 right-0 w-72 text-left text-[11px] leading-relaxed px-3 py-2 rounded-lg bg-black/90 text-white shadow-xl opacity-0 group-hover:opacity-100 transition-opacity z-20">
                Checks text accuracy, spelling, and label/factual issues, then drafts a detailed correction prompt and switches refine model to Nano Banana Pro. Uses a fast vision model (not image generation) with the same API provider as your toolbar when your keys allow it.
              </span>
            </button>
            <button
              type="submit"
              title={
                !refinementInput.trim() && !canResizeToSelected
                  ? 'Enter a refine prompt, or choose a different target size and use Recompose'
                  : 'Apply refine or recompose'
              }
              disabled={(!refinementInput.trim() && !canResizeToSelected) || refinementControlsLocked}
              className={`h-11 w-11 shrink-0 rounded-xl font-medium text-white inline-flex items-center justify-center transition-all ${
                (!refinementInput.trim() && !canResizeToSelected) || refinementControlsLocked
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

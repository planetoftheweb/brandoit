import React from 'react';
import { createPortal } from 'react-dom';
import { Generation, BrandColor, VisualStyle, GraphicType, AspectRatioOption, Folder, INBOX_FOLDER_ID } from '../types';
import { Clock, Copy, ArrowUpRight, Trash2, Download, Link, Image as ImageIcon, FileCode, Archive, CheckSquare, Square, GitCompare, Eye, EyeOff, LayoutGrid, Folder as FolderIcon, FolderPlus, Pin, PinOff, MoreHorizontal, Pencil, FolderInput, X as XIcon, Check } from 'lucide-react';
import { sanitizeSvg } from '../services/svgService';
import { describeImagePrompt } from '../services/geminiService';
import { createBlobUrlFromImage } from '../services/imageSourceService';
import { getCachedImageBlobUrl } from '../services/imageCache';
import { getLatestVersion } from '../services/historyService';
import { buildExportFilename } from '../services/versionUtils';
import { DownloadMenu } from './DownloadMenu';
import { RichSelect, RichSelectOption } from './RichSelect';

type ThumbnailSize = 'xs' | 'sm' | 'md' | 'lg';

// Tailwind grid-column maps per thumbnail size. Kept as full literal class
// strings so Tailwind's JIT picks them up (it can't see dynamically built
// `grid-cols-${n}` strings). Smaller sizes pack more tiles per row.
const THUMBNAIL_GRID_CLASS: Record<ThumbnailSize, string> = {
  xs: 'grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 xl:grid-cols-10 gap-2',
  sm: 'grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-7 xl:grid-cols-8 gap-2.5',
  md: 'grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3',
  lg: 'grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4',
};

const THUMBNAIL_SIZE_OPTIONS: RichSelectOption[] = [
  { value: 'xs', label: 'X-Small', description: 'Pack the most thumbnails per row' },
  { value: 'sm', label: 'Small', description: 'Compact grid' },
  { value: 'md', label: 'Medium', description: 'Default — balanced size' },
  { value: 'lg', label: 'Large', description: 'Bigger thumbnails, fewer per row' },
];

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
  /** All folders the current actor owns. The Inbox folder is always present. */
  folders: Folder[];
  /** Sticky folder for new generations. `undefined` => Inbox is the fallback. */
  activeFolderId?: string;
  /** Create a new folder; returns the created folder so the gallery can switch view to it. */
  onCreateFolder: (name: string) => Promise<Folder>;
  onRenameFolder: (folderId: string, nextName: string) => Promise<void>;
  onDeleteFolder: (folderId: string) => Promise<void>;
  /** Pin or clear (`null`) the sticky folder for new generations. */
  onSetActiveFolder: (folderId: string | null) => Promise<void>;
  /** Bulk-move a list of tiles into a folder (used by selection-mode action). */
  onMoveToFolder: (generationIds: string[], folderId: string) => Promise<void>;
}

export const RecentGenerations: React.FC<RecentGenerationsProps> = ({ 
  history, 
  onSelect,
  onDelete,
  options,
  isComparePicking,
  onPickMark,
  pickedMarkIds,
  folders,
  activeFolderId,
  onCreateFolder,
  onRenameFolder,
  onDeleteFolder,
  onSetActiveFolder,
  onMoveToFolder
}) => {
  const [copyLoadingId, setCopyLoadingId] = React.useState<string | null>(null);
  const [toastMessage, setToastMessage] = React.useState<string | null>(null);
  const [imageSrcById, setImageSrcById] = React.useState<Record<string, string>>({});
  const [selectionMode, setSelectionMode] = React.useState(false);
  const [selectedIds, setSelectedIds] = React.useState<string[]>([]);
  // Folder UI state. `viewFolderId` is the folder whose tiles are currently
  // shown in the grid; defaults to the sticky `activeFolderId` (or Inbox).
  // The user can switch views without changing the sticky pin.
  const [viewFolderId, setViewFolderId] = React.useState<string>(
    activeFolderId || INBOX_FOLDER_ID
  );
  const [renamingFolderId, setRenamingFolderId] = React.useState<string | null>(null);
  const [renameDraft, setRenameDraft] = React.useState('');
  const [pendingDeleteFolderId, setPendingDeleteFolderId] = React.useState<string | null>(null);
  // The folder tab strip uses `overflow-x-auto`, which forces overflow-y to
  // `auto` per CSS spec — that would clip an inline `absolute` dropdown below
  // each chip. We instead remember the open kebab's button rect and render
  // the menu through a portal at fixed coords so it floats above the strip.
  const [openFolderMenu, setOpenFolderMenu] = React.useState<
    { id: string; rect: DOMRect } | null
  >(null);
  const openFolderMenuId = openFolderMenu?.id ?? null;
  const setOpenFolderMenuId = (id: string | null) => {
    if (id === null) setOpenFolderMenu(null);
  };
  const [isCreatingFolder, setIsCreatingFolder] = React.useState(false);
  const [newFolderDraft, setNewFolderDraft] = React.useState('');
  const [folderBusy, setFolderBusy] = React.useState(false);
  const [moveMenuOpen, setMoveMenuOpen] = React.useState(false);
  // Per-tile details panel (prompt + tag chips) is opt-in. Default to hidden
  // so the gallery reads as a clean image grid; users who want context can
  // flip the toggle and the choice survives reloads via localStorage.
  const DETAILS_PREF_KEY = 'recentGenerations.showDetails';
  const SIZE_PREF_KEY = 'recentGenerations.thumbnailSize';
  const [showDetails, setShowDetails] = React.useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    try {
      return window.localStorage.getItem(DETAILS_PREF_KEY) === '1';
    } catch {
      return false;
    }
  });
  // Thumbnail density. Defaults to 'sm' so the gallery reads as a tighter
  // grid out of the box; users can pick xs/md/lg from the toolbar dropdown
  // and the choice persists.
  const [thumbnailSize, setThumbnailSize] = React.useState<ThumbnailSize>(() => {
    if (typeof window === 'undefined') return 'sm';
    try {
      const stored = window.localStorage.getItem(SIZE_PREF_KEY);
      if (stored === 'xs' || stored === 'sm' || stored === 'md' || stored === 'lg') {
        return stored;
      }
    } catch {
      // ignore
    }
    return 'sm';
  });
  React.useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      window.localStorage.setItem(DETAILS_PREF_KEY, showDetails ? '1' : '0');
    } catch {
      // ignore — quota / private mode shouldn't break the UI
    }
  }, [showDetails]);
  React.useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      window.localStorage.setItem(SIZE_PREF_KEY, thumbnailSize);
    } catch {
      // ignore
    }
  }, [thumbnailSize]);
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

  // Keep viewFolderId pointed at a folder that still exists. If the active
  // view-tab gets deleted (e.g. user removes the folder while viewing it),
  // fall back to Inbox so the gallery never shows a "missing folder"
  // empty state.
  React.useEffect(() => {
    if (folders.length === 0) return;
    if (!folders.some((f) => f.id === viewFolderId)) {
      setViewFolderId(INBOX_FOLDER_ID);
    }
  }, [folders, viewFolderId]);

  // Reposition the portal-rendered folder kebab menu when the page or any
  // scrollable ancestor scrolls (the folder strip itself scrolls horizontally),
  // and close it if the anchor button is no longer in the DOM.
  React.useEffect(() => {
    if (!openFolderMenu) return;
    const update = () => {
      const button = document.querySelector(
        `[data-folder-kebab="${openFolderMenu.id}"]`
      ) as HTMLElement | null;
      if (!button) {
        setOpenFolderMenu(null);
        return;
      }
      const rect = button.getBoundingClientRect();
      setOpenFolderMenu((prev) =>
        prev && prev.id === openFolderMenu.id ? { id: prev.id, rect } : prev
      );
    };
    window.addEventListener('scroll', update, true);
    window.addEventListener('resize', update);
    return () => {
      window.removeEventListener('scroll', update, true);
      window.removeEventListener('resize', update);
    };
  }, [openFolderMenu?.id]);

  // Close the per-folder kebab and the move-to-folder picker on outside
  // clicks / Escape, mirroring the existing toast lifecycle.
  React.useEffect(() => {
    if (!openFolderMenuId && !moveMenuOpen) return;
    const onClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && target.closest('[data-folder-menu]')) return;
      setOpenFolderMenuId(null);
      setMoveMenuOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpenFolderMenuId(null);
        setMoveMenuOpen(false);
      }
    };
    window.addEventListener('mousedown', onClick);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('mousedown', onClick);
      window.removeEventListener('keydown', onKey);
    };
  }, [openFolderMenuId, moveMenuOpen]);

  // Visible history is the slice of tiles that live in the currently-viewed
  // folder. Legacy items without a `folderId` are normalized into Inbox via
  // historyService, so this filter handles them implicitly.
  const visibleHistory = React.useMemo(
    () => history.filter((g) => (g.folderId || INBOX_FOLDER_ID) === viewFolderId),
    [history, viewFolderId]
  );

  // Per-folder counts shown on the tab chips. Built from the full history
  // (not the filtered slice) so every chip stays accurate while the user
  // is browsing a single folder.
  const folderCounts = React.useMemo(() => {
    const counts = new Map<string, number>();
    for (const folder of folders) counts.set(folder.id, 0);
    for (const gen of history) {
      const id = gen.folderId || INBOX_FOLDER_ID;
      counts.set(id, (counts.get(id) || 0) + 1);
    }
    return counts;
  }, [history, folders]);

  // Items that the "download all" menu operates on: selected items when the
  // user has made a selection; otherwise the visible folder's history.
  const downloadScope = React.useMemo(() => {
    if (selectedIds.length === 0) return visibleHistory;
    return visibleHistory.filter((g) => selectedIds.includes(g.id));
  }, [visibleHistory, selectedIds]);
  const downloadScopeLabel =
    selectedIds.length > 0
      ? `Download selected (${selectedIds.length})`
      : `Download all (${visibleHistory.length})`;

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

  // Hide the entire gallery only when there are no tiles AND no user
  // folders beyond the auto-seeded Inbox. Once the user creates any folder
  // we keep rendering so they can manage it even before generating tiles.
  const hasUserFolders = folders.some((f) => f.id !== INBOX_FOLDER_ID);
  if (history.length === 0 && !hasUserFolders) return null;

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

  const applyFallbackBlobUrl = (generationId: string, blobUrl: string) => {
    const previousBlobUrl = blobUrlsRef.current[generationId];
    if (previousBlobUrl) URL.revokeObjectURL(previousBlobUrl);
    blobUrlsRef.current[generationId] = blobUrl;
    setImageSrcById((prev) => ({ ...prev, [generationId]: blobUrl }));
  };

  const handleImageLoadError = async (gen: Generation) => {
    const currentSource = imageSrcById[gen.id];
    if (currentSource?.startsWith('blob:')) return;

    const latestVersion = getLatestVersion(gen);

    // Path 1 — version still carries inline base64 (only true for fresh
    // generations that haven't been uploaded + stripped yet).
    const inlineBlobUrl = createBlobUrlFromImage({
      imageUrl: latestVersion.imageUrl,
      base64Data: latestVersion.imageData,
      mimeType: latestVersion.mimeType
    });
    if (inlineBlobUrl) {
      applyFallbackBlobUrl(gen.id, inlineBlobUrl);
      return;
    }

    // Path 2 — every other case (history loaded from Firestore, where the
    // bytes were stripped on upload). Look in IndexedDB. This is the path
    // that recovers thumbnails when the network blocks Firebase Storage.
    if (!latestVersion.id) return;
    try {
      const cachedBlobUrl = await getCachedImageBlobUrl(gen.id, latestVersion.id);
      if (!cachedBlobUrl) return;
      // Re-check we didn't already swap to a blob while waiting on IDB.
      if (blobUrlsRef.current[gen.id]) {
        URL.revokeObjectURL(cachedBlobUrl);
        return;
      }
      applyFallbackBlobUrl(gen.id, cachedBlobUrl);
    } catch (error) {
      console.warn('[RecentGenerations] Failed to load cached blob URL:', error);
    }
  };

  return (
    <div className="w-full max-w-7xl mx-auto px-4 md:px-6 py-8 animate-in fade-in slide-in-from-bottom-4 duration-500 delay-150 border-t border-gray-200 dark:border-[#30363d] mt-8">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between mb-4">
        <div className="flex flex-wrap items-center gap-2 text-slate-500 dark:text-slate-400">
          <Clock size={18} />
          <h3 className="text-sm font-bold uppercase tracking-wider">Recent Generations</h3>
          <span className="text-xs text-slate-400 dark:text-slate-500">
            ({visibleHistory.length} {visibleHistory.length === 1 ? 'item' : 'items'} in folder
            {history.length !== visibleHistory.length ? ` · ${history.length} total` : ''})
          </span>
          {selectionMode && selectedIds.length > 0 && (
            <span className="text-xs font-semibold text-brand-teal" aria-live="polite">
              {selectedIds.length} selected
            </span>
          )}
        </div>
        {/* Toolbar — `flex-nowrap` so action buttons never break onto a second
            row. Each button collapses its text label to icon-only below `xl`
            (1280px), which is roughly the width at which all four buttons +
            the heading on the left fit comfortably without wrapping. The
            buttons keep their accessible names via `aria-label`/`title`. */}
        <div className="flex flex-nowrap items-center gap-2">
          {selectionMode ? (
            <>
              <button
                type="button"
                onClick={() => setSelectedIds(visibleHistory.map((g) => g.id))}
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
              <div className="relative" data-folder-menu>
                <button
                  type="button"
                  onClick={() => setMoveMenuOpen((prev) => !prev)}
                  disabled={selectedIds.length === 0 || folderBusy}
                  aria-haspopup="menu"
                  aria-expanded={moveMenuOpen}
                  className="inline-flex items-center justify-center gap-2 text-xs font-semibold px-3 py-2 min-h-11 rounded-lg border border-gray-300 dark:border-[#30363d] bg-white dark:bg-[#161b22] text-slate-700 dark:text-slate-200 hover:border-brand-teal hover:text-brand-teal transition disabled:opacity-50 disabled:pointer-events-none"
                >
                  <FolderInput size={16} aria-hidden />
                  Move to folder
                </button>
                {moveMenuOpen && (
                  <div
                    role="menu"
                    className="absolute right-0 top-full mt-1 z-30 min-w-[200px] max-h-72 overflow-y-auto rounded-lg border border-gray-200 dark:border-[#30363d] bg-white dark:bg-[#161b22] shadow-lg p-1"
                  >
                    {folders.map((folder) => {
                      const isHighlighted = folder.id === (activeFolderId || INBOX_FOLDER_ID);
                      return (
                        <button
                          key={folder.id}
                          type="button"
                          role="menuitem"
                          onClick={async () => {
                            setMoveMenuOpen(false);
                            if (selectedIds.length === 0) return;
                            try {
                              setFolderBusy(true);
                              await onMoveToFolder(selectedIds, folder.id);
                              showToast(
                                `Moved ${selectedIds.length} item${selectedIds.length === 1 ? '' : 's'} to ${folder.name}`
                              );
                              setSelectedIds([]);
                            } catch (err) {
                              console.error('Move to folder failed:', err);
                              showToast('Move failed');
                            } finally {
                              setFolderBusy(false);
                            }
                          }}
                          className={`w-full flex items-center gap-2 px-3 py-2 text-left text-xs rounded-md transition ${
                            isHighlighted
                              ? 'bg-brand-teal/10 text-brand-teal font-semibold'
                              : 'text-slate-700 dark:text-slate-200 hover:bg-gray-100 dark:hover:bg-[#21262d]'
                          }`}
                        >
                          <FolderIcon size={14} aria-hidden />
                          <span className="truncate flex-1">{folder.name}</span>
                          <span className="text-[10px] text-slate-400">
                            {folderCounts.get(folder.id) || 0}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
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
              <div className="w-32 xl:w-36 shrink-0">
                <RichSelect
                  value={thumbnailSize}
                  onChange={(value) => setThumbnailSize(value as ThumbnailSize)}
                  options={THUMBNAIL_SIZE_OPTIONS}
                  placeholder="Size"
                  icon={LayoutGrid}
                  compact
                  buttonClassName="rounded-lg min-h-11"
                  menuClassName="max-w-[16rem] z-[40]"
                />
              </div>
              <button
                type="button"
                onClick={() => setShowDetails((v) => !v)}
                aria-pressed={showDetails}
                aria-label={showDetails ? 'Hide details' : 'Show details'}
                title={showDetails ? 'Hide prompt and tag details under each thumbnail' : 'Show prompt and tag details under each thumbnail'}
                className={`inline-flex items-center justify-center gap-2 text-xs font-semibold px-3 xl:px-4 py-2 min-h-11 rounded-lg border transition shrink-0 ${
                  showDetails
                    ? 'border-brand-teal bg-brand-teal/10 text-brand-teal'
                    : 'border-gray-300 dark:border-[#30363d] bg-white dark:bg-[#161b22] text-slate-700 dark:text-slate-200 hover:border-brand-teal hover:text-brand-teal'
                }`}
              >
                {showDetails ? <EyeOff size={16} aria-hidden /> : <Eye size={16} aria-hidden />}
                <span className="hidden xl:inline">
                  {showDetails ? 'Hide details' : 'Show details'}
                </span>
              </button>
              <DownloadMenu
                mode="all-only"
                allGenerations={visibleHistory}
                allLabel={`Download all (${visibleHistory.length})`}
                triggerLabel={`Download all (${visibleHistory.length})`}
                triggerTitle="Download all in folder as ZIP"
                triggerLabelClassName="hidden xl:inline"
                icon={<Archive size={16} aria-hidden />}
                triggerClassName="inline-flex items-center justify-center gap-2 text-xs font-semibold px-3 xl:px-4 py-2 min-h-11 rounded-lg border border-gray-300 dark:border-[#30363d] bg-white dark:bg-[#161b22] text-slate-700 dark:text-slate-200 hover:border-brand-teal hover:text-brand-teal transition disabled:opacity-50 disabled:pointer-events-none shrink-0"
                disabled={visibleHistory.length === 0}
                onNotify={showToast}
                align="right"
              />
              <button
                type="button"
                onClick={() => setSelectionMode(true)}
                aria-label="Select for export"
                title="Select for export"
                className="inline-flex items-center justify-center gap-2 text-xs font-semibold px-3 xl:px-4 py-2 min-h-11 rounded-lg border border-gray-300 dark:border-[#30363d] bg-white dark:bg-[#161b22] text-slate-700 dark:text-slate-200 hover:border-brand-teal hover:text-brand-teal transition shrink-0"
              >
                <CheckSquare size={16} aria-hidden />
                <span className="hidden xl:inline">Select for export</span>
              </button>
            </>
          )}
        </div>
      </div>

      {/* Folder tab strip. Each chip filters the grid to its folder; the
          pin icon next to the folder name controls which folder is the
          sticky default for new generations. The kebab opens rename /
          delete actions (Inbox hides Delete). The trailing chip starts a
          folder-creation flow with an inline name input. */}
      <div className="flex items-center gap-2 overflow-x-auto pb-3 mb-4 border-b border-gray-200 dark:border-[#30363d]">
        {folders.map((folder) => {
          const isViewing = folder.id === viewFolderId;
          // The pin lights up only when the user has explicitly pinned a
          // folder. When `activeFolderId` is undefined we don't auto-light
          // Inbox so users can tell at a glance whether stickiness is
          // currently set or cleared.
          const isPinned = folder.id === activeFolderId;
          const isInbox = folder.id === INBOX_FOLDER_ID;
          const count = folderCounts.get(folder.id) || 0;
          const isRenaming = renamingFolderId === folder.id;
          return (
            <div
              key={folder.id}
              data-folder-menu
              className={`group flex items-center gap-1 rounded-full border px-1 py-1 transition shrink-0 ${
                isViewing
                  ? 'border-brand-teal bg-brand-teal/10 text-brand-teal'
                  : 'border-gray-300 dark:border-[#30363d] bg-white dark:bg-[#161b22] text-slate-700 dark:text-slate-200 hover:border-brand-teal hover:text-brand-teal'
              }`}
            >
              {isRenaming ? (
                <form
                  className="flex items-center gap-1 px-2"
                  onSubmit={async (e) => {
                    e.preventDefault();
                    const next = renameDraft.trim();
                    if (!next) return;
                    try {
                      setFolderBusy(true);
                      await onRenameFolder(folder.id, next);
                      setRenamingFolderId(null);
                      setRenameDraft('');
                      showToast('Folder renamed');
                    } catch (err) {
                      console.error('Rename folder failed:', err);
                      showToast('Rename failed');
                    } finally {
                      setFolderBusy(false);
                    }
                  }}
                >
                  <input
                    autoFocus
                    type="text"
                    value={renameDraft}
                    onChange={(e) => setRenameDraft(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Escape') {
                        setRenamingFolderId(null);
                        setRenameDraft('');
                      }
                    }}
                    className="text-xs font-semibold bg-transparent border border-brand-teal rounded-md px-2 py-1 min-h-9 focus:outline-none focus:ring-2 focus:ring-brand-teal/40 text-slate-900 dark:text-slate-100"
                    aria-label={`Rename ${folder.name}`}
                    maxLength={60}
                  />
                  <button
                    type="submit"
                    disabled={folderBusy || !renameDraft.trim()}
                    className="inline-flex items-center justify-center h-9 w-9 rounded-md text-brand-teal hover:bg-brand-teal/10 disabled:opacity-50"
                    aria-label="Save folder name"
                  >
                    <Check size={14} />
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setRenamingFolderId(null);
                      setRenameDraft('');
                    }}
                    className="inline-flex items-center justify-center h-9 w-9 rounded-md text-slate-500 hover:bg-gray-100 dark:hover:bg-[#21262d]"
                    aria-label="Cancel rename"
                  >
                    <XIcon size={14} />
                  </button>
                </form>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={() => setViewFolderId(folder.id)}
                    aria-pressed={isViewing}
                    className="inline-flex items-center gap-1.5 pl-2 pr-1 py-1 min-h-9 rounded-full text-xs font-semibold focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-teal"
                  >
                    <FolderIcon size={14} aria-hidden />
                    <span className="truncate max-w-[10rem]">{folder.name}</span>
                    <span className={`inline-flex items-center justify-center min-w-5 h-5 px-1.5 rounded-full text-[10px] font-bold leading-none tabular-nums ${
                      isViewing ? 'bg-brand-teal text-white' : 'bg-gray-200 dark:bg-[#30363d] text-slate-600 dark:text-slate-300'
                    }`}>
                      {count}
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={async () => {
                      try {
                        setFolderBusy(true);
                        // Toggle: pinning the already-sticky folder clears
                        // the pin (new tiles fall back to Inbox).
                        await onSetActiveFolder(isPinned ? null : folder.id);
                        showToast(
                          isPinned
                            ? 'Sticky folder cleared'
                            : `New tiles will save to ${folder.name}`
                        );
                      } catch (err) {
                        console.error('Toggle sticky folder failed:', err);
                        showToast('Could not update sticky folder');
                      } finally {
                        setFolderBusy(false);
                      }
                    }}
                    title={
                      isPinned
                        ? 'Sticky for new generations — click to clear'
                        : 'Pin as sticky folder for new generations'
                    }
                    aria-label={
                      isPinned
                        ? `Clear sticky pin on ${folder.name}`
                        : `Pin ${folder.name} as sticky folder`
                    }
                    aria-pressed={isPinned}
                    disabled={folderBusy}
                    className={`inline-flex items-center justify-center h-9 w-9 rounded-full transition ${
                      isPinned
                        ? 'text-amber-500 hover:bg-amber-100/40 dark:hover:bg-amber-500/10'
                        : 'text-slate-400 hover:text-brand-teal hover:bg-gray-100 dark:hover:bg-[#21262d]'
                    }`}
                  >
                    {isPinned ? <Pin size={14} fill="currentColor" /> : <PinOff size={14} />}
                  </button>
                  <button
                    type="button"
                    onClick={(e) => {
                      if (openFolderMenu?.id === folder.id) {
                        setOpenFolderMenu(null);
                        return;
                      }
                      const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
                      setOpenFolderMenu({ id: folder.id, rect });
                    }}
                    aria-haspopup="menu"
                    aria-expanded={openFolderMenuId === folder.id}
                    aria-label={`Folder actions for ${folder.name}`}
                    data-folder-kebab={folder.id}
                    className="inline-flex items-center justify-center h-9 w-9 rounded-full text-slate-500 hover:text-brand-teal hover:bg-gray-100 dark:hover:bg-[#21262d]"
                  >
                    <MoreHorizontal size={14} />
                  </button>
                </>
              )}
            </div>
          );
        })}

        {isCreatingFolder ? (
          <form
            data-folder-menu
            className="flex items-center gap-1 rounded-full border border-brand-teal bg-white dark:bg-[#161b22] px-2 py-1 shrink-0"
            onSubmit={async (e) => {
              e.preventDefault();
              const next = newFolderDraft.trim();
              if (!next) return;
              try {
                setFolderBusy(true);
                const created = await onCreateFolder(next);
                setIsCreatingFolder(false);
                setNewFolderDraft('');
                setViewFolderId(created.id);
                showToast(`Created ${created.name}`);
              } catch (err) {
                console.error('Create folder failed:', err);
                showToast('Could not create folder');
              } finally {
                setFolderBusy(false);
              }
            }}
          >
            <FolderPlus size={14} className="text-brand-teal" aria-hidden />
            <input
              autoFocus
              type="text"
              value={newFolderDraft}
              onChange={(e) => setNewFolderDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Escape') {
                  setIsCreatingFolder(false);
                  setNewFolderDraft('');
                }
              }}
              placeholder="Folder name"
              className="text-xs font-semibold bg-transparent border-0 px-1 py-1 min-h-9 focus:outline-none text-slate-900 dark:text-slate-100 w-32"
              maxLength={60}
            />
            <button
              type="submit"
              disabled={folderBusy || !newFolderDraft.trim()}
              className="inline-flex items-center justify-center h-9 w-9 rounded-full text-brand-teal hover:bg-brand-teal/10 disabled:opacity-50"
              aria-label="Create folder"
            >
              <Check size={14} />
            </button>
            <button
              type="button"
              onClick={() => {
                setIsCreatingFolder(false);
                setNewFolderDraft('');
              }}
              className="inline-flex items-center justify-center h-9 w-9 rounded-full text-slate-500 hover:bg-gray-100 dark:hover:bg-[#21262d]"
              aria-label="Cancel"
            >
              <XIcon size={14} />
            </button>
          </form>
        ) : (
          <button
            type="button"
            onClick={() => {
              setIsCreatingFolder(true);
              setNewFolderDraft('');
            }}
            className="inline-flex items-center gap-1.5 px-3 py-1 min-h-9 rounded-full border border-dashed border-gray-300 dark:border-[#30363d] text-xs font-semibold text-slate-600 dark:text-slate-300 hover:border-brand-teal hover:text-brand-teal transition shrink-0"
          >
            <FolderPlus size={14} aria-hidden />
            New folder
          </button>
        )}
      </div>

      {visibleHistory.length === 0 && (
        <div className="text-center py-12 text-sm text-slate-500 dark:text-slate-400 border border-dashed border-gray-300 dark:border-[#30363d] rounded-xl mb-4">
          This folder is empty.
          {activeFolderId === viewFolderId
            ? ' New generations will land here.'
            : ' Pin this folder to make new generations land here, or move tiles in from another folder.'}
        </div>
      )}

      <div className={THUMBNAIL_GRID_CLASS[thumbnailSize]}>
        {visibleHistory.map((gen) => {
          const latestVersion = getLatestVersion(gen);
          const versionCount = gen.versions.length;
          const batchId = gen.comparisonBatchId;
          // New behavior: a comparison tile keeps every model's marks inside
          // itself, so we detect "compare" by counting distinct per-version
          // models within the tile. Legacy behavior (one tile per model with a
          // shared batchId) is still handled below as a fallback so old
          // history items keep their badge. Use full history for sibling
          // counts so a comparison group spread across folders still reads
          // correctly.
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
              {showCompareBadge && (
                <div
                  className={`absolute z-10 top-2 ${selectionMode ? 'left-14' : 'left-2'}`}
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

              {/* Per-tile hover toolbar. Hidden by default on any device that
                  supports hover (desktops, laptops, hover-capable tablets) so
                  the gallery reads as a clean image grid; revealed on hover/
                  focus-within. Touch-only devices (phones, tablets without a
                  pointer) keep the toolbar always-visible because there's no
                  hover state to surface it. `@media(hover:hover)` targets the
                  capability rather than guessing by viewport width, which
                  fixes the prior `lg:` breakpoint leaving narrow desktop
                  windows looking busy. */}
              <div className="absolute top-2 right-2 z-10 flex flex-wrap items-center justify-end gap-1 lg:gap-2 max-w-[calc(100%-1rem)] opacity-100 [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover:opacity-100 [@media(hover:hover)]:group-focus-within:opacity-100 transition-opacity">
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
                    // Don't toast here — onDelete just opens the confirm
                    // modal, the actual deletion is asynchronous and may be
                    // cancelled. Previous code synchronously claimed
                    // "Generation removed" before anything had happened,
                    // which made cancelled or failed deletes look like
                    // successful ones. Tile-disappear-on-success is the
                    // honest visual feedback.
                    onDelete(gen.id);
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
                        imageUrl: getDisplayImageUrl(gen),
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

              {showDetails && (
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
              )}
            </div>
          );
        })}
      </div>

      {/* Folder delete confirmation. Tiles inside the deleted folder are
          swept into Inbox by App.handleDeleteFolder before the folder
          itself is removed, so deletion never strands content. */}
      {pendingDeleteFolderId && (() => {
        const target = folders.find((f) => f.id === pendingDeleteFolderId);
        if (!target) return null;
        const tilesInFolder = folderCounts.get(target.id) || 0;
        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4">
            <div role="dialog" aria-modal="true" aria-labelledby="delete-folder-title" className="bg-white dark:bg-[#161b22] rounded-xl border border-gray-200 dark:border-[#30363d] shadow-2xl max-w-sm w-full p-5">
              <h2 id="delete-folder-title" className="text-base font-bold text-slate-900 dark:text-slate-100">
                Delete "{target.name}"?
              </h2>
              <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
                {tilesInFolder > 0
                  ? `${tilesInFolder} tile${tilesInFolder === 1 ? '' : 's'} will move to Inbox.`
                  : 'This folder is empty.'}
              </p>
              <div className="mt-4 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setPendingDeleteFolderId(null)}
                  disabled={folderBusy}
                  className="text-xs font-semibold px-3 py-2 min-h-11 rounded-lg border border-gray-300 dark:border-[#30363d] bg-white dark:bg-[#161b22] text-slate-700 dark:text-slate-200 hover:border-slate-500 transition disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={async () => {
                    try {
                      setFolderBusy(true);
                      await onDeleteFolder(target.id);
                      setPendingDeleteFolderId(null);
                      showToast(`Deleted ${target.name}`);
                    } catch (err) {
                      console.error('Delete folder failed:', err);
                      showToast('Could not delete folder');
                    } finally {
                      setFolderBusy(false);
                    }
                  }}
                  disabled={folderBusy}
                  className="text-xs font-semibold px-3 py-2 min-h-11 rounded-lg bg-brand-red text-white hover:opacity-90 disabled:opacity-50 transition"
                >
                  Delete folder
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Folder kebab dropdown — rendered through a portal so it isn't
          clipped by the folder strip's `overflow-x-auto` (which CSS upgrades
          to `overflow-y: auto` and hides anything that overflows below). */}
      {openFolderMenu && (() => {
        const target = folders.find((f) => f.id === openFolderMenu.id);
        if (!target) return null;
        const isInbox = target.id === INBOX_FOLDER_ID;
        // Anchor the menu under the kebab's right edge, mirroring the prior
        // `right-0 top-full mt-1` placement.
        const menuWidth = 160;
        const top = openFolderMenu.rect.bottom + 4;
        const left = Math.max(8, openFolderMenu.rect.right - menuWidth);
        return createPortal(
          <div
            role="menu"
            data-folder-menu
            style={{ position: 'fixed', top, left, minWidth: menuWidth, zIndex: 50 }}
            className="rounded-lg border border-gray-200 dark:border-[#30363d] bg-white dark:bg-[#161b22] shadow-lg p-1"
          >
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                setRenamingFolderId(target.id);
                setRenameDraft(target.name);
                setOpenFolderMenu(null);
              }}
              className="w-full flex items-center gap-2 px-3 py-2 text-left text-xs text-slate-700 dark:text-slate-200 rounded-md hover:bg-gray-100 dark:hover:bg-[#21262d]"
            >
              <Pencil size={14} aria-hidden />
              Rename
            </button>
            {!isInbox && (
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setOpenFolderMenu(null);
                  setPendingDeleteFolderId(target.id);
                }}
                className="w-full flex items-center gap-2 px-3 py-2 text-left text-xs text-red-600 dark:text-red-300 rounded-md hover:bg-red-50 dark:hover:bg-red-900/20"
              >
                <Trash2 size={14} aria-hidden />
                Delete folder
              </button>
            )}
          </div>,
          document.body
        );
      })()}

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

import React from 'react';
import { createPortal } from 'react-dom';
import { Generation, BrandColor, VisualStyle, GraphicType, AspectRatioOption, Folder, INBOX_FOLDER_ID } from '../types';
import { ArrowUpRight, Trash2, Archive, CheckSquare, Square, GitCompare, Eye, EyeOff, LayoutGrid, Folder as FolderIcon, FolderPlus, Pin, PinOff, Pencil, FolderInput, X as XIcon, Check, ChevronLeft, ChevronRight, ChevronDown } from 'lucide-react';
import { sanitizeSvg } from '../services/svgService';
import { createBlobUrlFromImage } from '../services/imageSourceService';
import { getCachedImageBlobUrl } from '../services/imageCache';
import { getLatestVersion } from '../services/historyService';
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

// Single-word labels keep the compact RichSelect trigger from wrapping
// onto two lines at narrow widths (the trigger is `w-28 xl:w-32`, which
// the hyphenated "X-Small" couldn't fit). The menu items still pair the
// label with a longer description so the meaning stays obvious.
const THUMBNAIL_SIZE_OPTIONS: RichSelectOption[] = [
  { value: 'xs', label: 'Tiny', description: 'X-Small — most thumbnails per row' },
  { value: 'sm', label: 'Small', description: 'Compact grid' },
  { value: 'md', label: 'Medium', description: 'Default — balanced size' },
  { value: 'lg', label: 'Large', description: 'Bigger thumbnails, fewer per row' },
];

/** When a folder has more than this many tiles, the gallery paginates. */
const GALLERY_PAGE_THRESHOLD = 50;
// Page-size options are now rendered as inline chip buttons inside the
// "1/2 ▾" header popover, so the prior `GALLERY_PAGE_SIZE_OPTIONS` array
// (used by a removed RichSelect dropdown) is no longer needed. Valid sizes
// live as a literal `[25, 50, 100, 200]` next to the chip buttons.

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
  /** Which folder's tiles the Recents grid is showing; owned and persisted by App. */
  galleryViewFolderId: string;
  /** Persist the user's gallery folder tab (Firestore or guest localStorage). */
  onGalleryViewFolderChange: (folderId: string) => void | Promise<void>;
  /** Create a new folder; returns the created folder so the gallery can switch view to it. */
  onCreateFolder: (name: string) => Promise<Folder>;
  onRenameFolder: (folderId: string, nextName: string) => Promise<void>;
  onDeleteFolder: (folderId: string) => Promise<void>;
  /** Pin or clear (`null`) the sticky folder for new generations. */
  onSetActiveFolder: (folderId: string | null) => Promise<void>;
  /** Bulk-move a list of tiles into a folder (used by selection-mode action). */
  onMoveToFolder: (generationIds: string[], folderId: string) => Promise<void>;
  /**
   * ID of the generation currently rendered in the main `ImageDisplay`. The
   * matching tile in the grid below gets a brand-red ring so the user can
   * always tell at a glance which tile they're looking at, even after
   * scrolling, paginating, or restoring from history.
   */
  activeGenerationId?: string;
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
  galleryViewFolderId,
  onGalleryViewFolderChange,
  onCreateFolder,
  onRenameFolder,
  onDeleteFolder,
  onSetActiveFolder,
  onMoveToFolder,
  activeGenerationId,
}) => {
  const [toastMessage, setToastMessage] = React.useState<string | null>(null);
  const [imageSrcById, setImageSrcById] = React.useState<Record<string, string>>({});
  const [selectionMode, setSelectionMode] = React.useState(false);
  const [selectedIds, setSelectedIds] = React.useState<string[]>([]);
  // Grid folder tab — persisted in App (Firestore for signed-in, localStorage for guests).
  const viewFolderId = galleryViewFolderId;
  const [renamingFolderId, setRenamingFolderId] = React.useState<string | null>(null);
  const [renameDraft, setRenameDraft] = React.useState('');
  const [pendingDeleteFolderId, setPendingDeleteFolderId] = React.useState<string | null>(null);
  // Folder picker dropdown: combines the folder-name "label" with the
  // count chip and the (formerly chip-strip) folder list into a single
  // trigger + menu. Keeping it inside this component avoids having to
  // teach RichSelect about per-row pin/rename/delete actions.
  const [isFolderPickerOpen, setIsFolderPickerOpen] = React.useState(false);
  const folderPickerRef = React.useRef<HTMLDivElement>(null);
  const [isCreatingFolder, setIsCreatingFolder] = React.useState(false);
  const [newFolderDraft, setNewFolderDraft] = React.useState('');
  const [folderBusy, setFolderBusy] = React.useState(false);
  const [moveMenuOpen, setMoveMenuOpen] = React.useState(false);
  // Combined page-jump + per-page popover anchored under the "1/2 ▾" button
  // in the gallery header. Replaces the prior wide page-size dropdown and
  // the standalone numeric page indicator with a single compact trigger.
  const [pageMenuOpen, setPageMenuOpen] = React.useState(false);
  // Per-tile details panel (prompt + tag chips) is opt-in. Default to hidden
  // so the gallery reads as a clean image grid; users who want context can
  // flip the toggle and the choice survives reloads via localStorage.
  const DETAILS_PREF_KEY = 'recentGenerations.showDetails';
  const SIZE_PREF_KEY = 'recentGenerations.thumbnailSize';
  const PAGE_SIZE_PREF_KEY = 'recentGenerations.galleryPageSize';
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
  const [galleryPage, setGalleryPage] = React.useState(1);
  const [galleryPageSize, setGalleryPageSize] = React.useState<number>(() => {
    if (typeof window === 'undefined') return 50;
    try {
      const stored = window.localStorage.getItem(PAGE_SIZE_PREF_KEY);
      if (stored === '25' || stored === '50' || stored === '100' || stored === '200') {
        return parseInt(stored, 10);
      }
    } catch {
      // ignore
    }
    return 50;
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
  React.useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      window.localStorage.setItem(PAGE_SIZE_PREF_KEY, String(galleryPageSize));
    } catch {
      // ignore
    }
  }, [galleryPageSize]);
  const toastTimerRef = React.useRef<number | null>(null);
  const blobUrlsRef = React.useRef<Record<string, string>>({});
  // Hover preview: floats a large, full-aspect-ratio version of the tile's
  // image above the grid. We capture the tile's bounding rect so the
  // preview can be docked to the opposite side of the viewport — that way
  // the source tile stays visible and the user can sweep across to other
  // tiles without the preview ever covering the thing they're inspecting.
  // Activation is gated to hover-capable pointing devices so touch users
  // (who can't really "roll over" anything) don't get a preview that
  // appears on tap and blocks subsequent taps.
  const [hoverPreview, setHoverPreview] = React.useState<{ id: string; rect: DOMRect } | null>(null);
  const hoverTimerRef = React.useRef<number | null>(null);
  const clearHoverPreview = React.useCallback(() => {
    if (hoverTimerRef.current) {
      window.clearTimeout(hoverTimerRef.current);
      hoverTimerRef.current = null;
    }
    setHoverPreview(null);
  }, []);
  const scheduleHoverPreview = React.useCallback(
    (genId: string, element: HTMLElement) => {
      if (typeof window === 'undefined') return;
      // Skip on touch / coarse-pointer devices where the user can't truly
      // hover. We check both `hover: hover` and `pointer: fine` to avoid
      // false positives on hybrid devices in tablet mode.
      if (!window.matchMedia('(hover: hover) and (pointer: fine)').matches) return;
      // Selection mode and compare-pick mode already overlay the tile, and
      // popping a large preview on top of those affordances would obscure
      // the very thing the user is trying to interact with.
      if (selectionMode || isComparePicking) return;
      if (hoverTimerRef.current) window.clearTimeout(hoverTimerRef.current);
      hoverTimerRef.current = window.setTimeout(() => {
        // Re-read the rect at fire time so it reflects any layout that
        // shifted during the show delay (lazy images settling, etc.).
        setHoverPreview({ id: genId, rect: element.getBoundingClientRect() });
      }, 320);
    },
    [selectionMode, isComparePicking]
  );

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

  // Invalid / missing folder ids are corrected in App; no local reset here.
  // Close the folder picker and the move-to-folder picker on outside
  // clicks / Escape, mirroring the existing toast lifecycle. Both menus
  // tag themselves with `data-folder-menu` so a click *inside* either menu
  // (or its trigger) is left alone.
  React.useEffect(() => {
    if (!isFolderPickerOpen && !moveMenuOpen && !pageMenuOpen) return;
    const onClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null;
      // `data-folder-menu` is a misnomer at this point — it's the generic
      // "popover guard" marker for any in-row popover (folder picker,
      // move-to-folder, and now the combined page-jump menu). Sharing the
      // attribute keeps a single global outside-click handler authoritative
      // for the whole header cluster.
      if (target && target.closest('[data-folder-menu]')) return;
      setIsFolderPickerOpen(false);
      setMoveMenuOpen(false);
      setPageMenuOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsFolderPickerOpen(false);
        setMoveMenuOpen(false);
        setPageMenuOpen(false);
      }
    };
    window.addEventListener('mousedown', onClick);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('mousedown', onClick);
      window.removeEventListener('keydown', onKey);
    };
  }, [isFolderPickerOpen, moveMenuOpen, pageMenuOpen]);

  // Visible history is the slice of tiles that live in the currently-viewed
  // folder. Legacy items without a `folderId` are normalized into Inbox via
  // historyService, so this filter handles them implicitly.
  const visibleHistory = React.useMemo(
    () => history.filter((g) => (g.folderId || INBOX_FOLDER_ID) === viewFolderId),
    [history, viewFolderId]
  );

  const galleryPaginationEnabled = visibleHistory.length > GALLERY_PAGE_THRESHOLD;
  const pagedVisibleHistory = React.useMemo(() => {
    if (!galleryPaginationEnabled) return visibleHistory;
    const start = (galleryPage - 1) * galleryPageSize;
    return visibleHistory.slice(start, start + galleryPageSize);
  }, [visibleHistory, galleryPaginationEnabled, galleryPage, galleryPageSize]);

  const galleryTotalPages = React.useMemo(() => {
    if (!galleryPaginationEnabled) return 1;
    return Math.max(1, Math.ceil(visibleHistory.length / galleryPageSize));
  }, [galleryPaginationEnabled, visibleHistory.length, galleryPageSize]);

  const galleryRangeStart =
    visibleHistory.length === 0 ? 0 : (galleryPage - 1) * galleryPageSize + 1;
  const galleryRangeEnd = galleryPaginationEnabled
    ? Math.min(visibleHistory.length, galleryPage * galleryPageSize)
    : visibleHistory.length;

  React.useEffect(() => {
    setGalleryPage(1);
  }, [viewFolderId]);

  React.useEffect(() => {
    if (!galleryPaginationEnabled) return;
    setGalleryPage((p) => Math.min(Math.max(1, p), galleryTotalPages));
  }, [galleryPaginationEnabled, galleryTotalPages, visibleHistory.length, galleryPageSize]);

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
      if (hoverTimerRef.current) window.clearTimeout(hoverTimerRef.current);
    };
  }, []);

  // Drop the hover preview the moment the user enters a mode where it
  // would interfere (selection, compare-pick), or when the underlying tile
  // disappears from the visible page.
  React.useEffect(() => {
    if (selectionMode || isComparePicking) clearHoverPreview();
  }, [selectionMode, isComparePicking, clearHoverPreview]);

  React.useEffect(() => {
    if (!hoverPreview) return;
    const stillVisible = pagedVisibleHistory.some((g) => g.id === hoverPreview.id);
    if (!stillVisible) clearHoverPreview();
  }, [hoverPreview, pagedVisibleHistory, clearHoverPreview]);

  // The preview is anchored relative to the tile's captured rect, so any
  // scroll movement would leave it visually disconnected from the tile
  // that triggered it. Dismissing on scroll mirrors OS-level tooltips.
  React.useEffect(() => {
    if (!hoverPreview) return;
    const onScroll = () => clearHoverPreview();
    window.addEventListener('scroll', onScroll, true);
    return () => window.removeEventListener('scroll', onScroll, true);
  }, [hoverPreview, clearHoverPreview]);

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

  // Folder picker — combined trigger + dropdown menu replacing the prior
  // chip-strip. The trigger shows the currently-viewed folder's name, item
  // count, and a small pin badge if it's also the sticky default for new
  // generations. The menu lists every folder with inline pin/rename/delete
  // actions and a "+ New folder" affordance at the bottom. Per-row icons
  // (pencil/trash) are always visible so touch users don't need a hover to
  // surface them — only the rename pencil and delete trash are inline; the
  // rest of the row click switches the view (and closes the menu).
  const renderFolderPicker = () => {
    const activeFolder =
      folders.find((f) => f.id === viewFolderId) ??
      folders.find((f) => f.id === INBOX_FOLDER_ID) ??
      folders[0];
    const activeName = activeFolder?.name ?? 'Inbox';
    const activeCount = activeFolder
      ? folderCounts.get(activeFolder.id) || 0
      : 0;

    const handleSelectFolder = (folderId: string) => {
      void onGalleryViewFolderChange(folderId);
      setIsFolderPickerOpen(false);
      setRenamingFolderId(null);
      setRenameDraft('');
      setIsCreatingFolder(false);
      setNewFolderDraft('');
    };

    const handleTogglePin = async (folder: Folder) => {
      const wasPinned = folder.id === activeFolderId;
      try {
        setFolderBusy(true);
        await onSetActiveFolder(wasPinned ? null : folder.id);
        showToast(
          wasPinned
            ? 'Sticky folder cleared'
            : `New tiles will save to ${folder.name}`
        );
      } catch (err) {
        console.error('Toggle sticky folder failed:', err);
        showToast('Could not update sticky folder');
      } finally {
        setFolderBusy(false);
      }
    };

    return (
      <div
        className="relative"
        ref={folderPickerRef}
        data-folder-menu
      >
        <button
          type="button"
          onClick={() => setIsFolderPickerOpen((open) => !open)}
          aria-haspopup="listbox"
          aria-expanded={isFolderPickerOpen}
          aria-label={`Folder: ${activeName}, ${activeCount} item${activeCount === 1 ? '' : 's'}. Click to switch folders.`}
          className="inline-flex items-center gap-2 pl-2.5 pr-2 py-1.5 min-h-9 rounded-full border border-gray-300 dark:border-[#30363d] bg-white dark:bg-[#161b22] text-xs font-semibold text-slate-700 dark:text-slate-200 hover:border-brand-teal hover:text-brand-teal focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-teal transition"
        >
          <FolderIcon size={14} aria-hidden />
          <span className="truncate max-w-[10rem]">{activeName}</span>
          <span className="inline-flex items-center justify-center min-w-5 h-5 px-1.5 rounded-full text-[10px] font-bold leading-none tabular-nums bg-gray-200 dark:bg-[#30363d] text-slate-600 dark:text-slate-300">
            {activeCount}
          </span>
          {/* Pin badge intentionally omitted from the trigger — the menu
              still shows which folder is the sticky default via the
              highlighted pin button on its row. Showing it twice (here
              *and* in the menu) was redundant and added visual noise. */}
          <ChevronDown
            size={14}
            aria-hidden
            className={`text-slate-400 transition-transform ${
              isFolderPickerOpen ? 'rotate-180' : ''
            }`}
          />
        </button>

        {isFolderPickerOpen && (
          <div
            role="listbox"
            aria-label="Switch folder"
            data-folder-menu
            className="absolute left-0 top-full mt-2 z-30 w-72 max-h-[min(70vh,440px)] overflow-y-auto rounded-xl border border-gray-200 dark:border-[#30363d] bg-white dark:bg-[#161b22] shadow-xl p-1"
          >
            <div className="px-2.5 py-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-400">
              Folders
            </div>
            {folders.map((folder) => {
              const isViewing = folder.id === viewFolderId;
              const isPinned = folder.id === activeFolderId;
              const isInbox = folder.id === INBOX_FOLDER_ID;
              const count = folderCounts.get(folder.id) || 0;
              const isRenaming = renamingFolderId === folder.id;

              if (isRenaming) {
                return (
                  <form
                    key={folder.id}
                    className="flex items-center gap-1 px-2 py-1"
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
                    <FolderIcon
                      size={14}
                      aria-hidden
                      className="text-brand-teal shrink-0"
                    />
                    <input
                      autoFocus
                      type="text"
                      value={renameDraft}
                      onChange={(e) => setRenameDraft(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Escape') {
                          e.preventDefault();
                          setRenamingFolderId(null);
                          setRenameDraft('');
                        }
                      }}
                      className="flex-1 min-w-0 text-xs font-semibold bg-transparent border border-brand-teal rounded-md px-2 py-1 min-h-8 focus:outline-none focus:ring-2 focus:ring-brand-teal/40 text-slate-900 dark:text-slate-100"
                      aria-label={`Rename ${folder.name}`}
                      maxLength={60}
                    />
                    <button
                      type="submit"
                      disabled={folderBusy || !renameDraft.trim()}
                      className="inline-flex items-center justify-center h-8 w-8 rounded-md text-brand-teal hover:bg-brand-teal/10 disabled:opacity-50"
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
                      className="inline-flex items-center justify-center h-8 w-8 rounded-md text-slate-500 hover:bg-gray-100 dark:hover:bg-[#21262d]"
                      aria-label="Cancel rename"
                    >
                      <XIcon size={14} />
                    </button>
                  </form>
                );
              }

              return (
                <div
                  key={folder.id}
                  className={`group flex items-center gap-1 rounded-md px-1 py-0.5 ${
                    isViewing
                      ? 'bg-brand-teal/10'
                      : 'hover:bg-gray-50 dark:hover:bg-[#21262d]'
                  }`}
                >
                  <button
                    type="button"
                    role="option"
                    aria-selected={isViewing}
                    onClick={() => handleSelectFolder(folder.id)}
                    className={`flex-1 min-w-0 inline-flex items-center gap-2 text-left px-2 py-1.5 text-xs font-semibold rounded-md focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-teal ${
                      isViewing
                        ? 'text-brand-teal'
                        : 'text-slate-700 dark:text-slate-200'
                    }`}
                  >
                    <FolderIcon size={14} aria-hidden />
                    <span className="truncate flex-1">{folder.name}</span>
                    <span
                      className={`inline-flex items-center justify-center min-w-5 h-5 px-1.5 rounded-full text-[10px] font-bold leading-none tabular-nums ${
                        isViewing
                          ? 'bg-brand-teal text-white'
                          : 'bg-gray-200 dark:bg-[#30363d] text-slate-600 dark:text-slate-300'
                      }`}
                    >
                      {count}
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleTogglePin(folder)}
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
                    className={`inline-flex items-center justify-center h-8 w-8 shrink-0 rounded-md transition ${
                      isPinned
                        ? 'text-amber-500 hover:bg-amber-100/40 dark:hover:bg-amber-500/10'
                        : 'text-slate-400 hover:text-brand-teal hover:bg-gray-100 dark:hover:bg-[#21262d]'
                    }`}
                  >
                    {isPinned ? (
                      <Pin size={14} fill="currentColor" />
                    ) : (
                      <PinOff size={14} />
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setRenamingFolderId(folder.id);
                      setRenameDraft(folder.name);
                    }}
                    title={`Rename ${folder.name}`}
                    aria-label={`Rename ${folder.name}`}
                    className="inline-flex items-center justify-center h-8 w-8 shrink-0 rounded-md text-slate-400 hover:text-brand-teal hover:bg-gray-100 dark:hover:bg-[#21262d] transition"
                  >
                    <Pencil size={13} />
                  </button>
                  {!isInbox ? (
                    <button
                      type="button"
                      onClick={() => {
                        setIsFolderPickerOpen(false);
                        setPendingDeleteFolderId(folder.id);
                      }}
                      title={`Delete ${folder.name}`}
                      aria-label={`Delete ${folder.name}`}
                      className="inline-flex items-center justify-center h-8 w-8 shrink-0 rounded-md text-slate-400 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition"
                    >
                      <Trash2 size={13} />
                    </button>
                  ) : (
                    // Spacer keeps Inbox's row aligned with the others so
                    // the trash columns line up across rows.
                    <span className="h-8 w-8 shrink-0" aria-hidden />
                  )}
                </div>
              );
            })}

            <div
              className="my-1 border-t border-gray-200 dark:border-[#30363d]"
              aria-hidden
            />

            {isCreatingFolder ? (
              <form
                className="flex items-center gap-1 px-2 py-1"
                onSubmit={async (e) => {
                  e.preventDefault();
                  const next = newFolderDraft.trim();
                  if (!next) return;
                  try {
                    setFolderBusy(true);
                    const created = await onCreateFolder(next);
                    setIsCreatingFolder(false);
                    setNewFolderDraft('');
                    await onGalleryViewFolderChange(created.id);
                    setIsFolderPickerOpen(false);
                    showToast(`Created ${created.name}`);
                  } catch (err) {
                    console.error('Create folder failed:', err);
                    showToast('Could not create folder');
                  } finally {
                    setFolderBusy(false);
                  }
                }}
              >
                <FolderPlus
                  size={14}
                  aria-hidden
                  className="text-brand-teal shrink-0"
                />
                <input
                  autoFocus
                  type="text"
                  value={newFolderDraft}
                  onChange={(e) => setNewFolderDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Escape') {
                      e.preventDefault();
                      setIsCreatingFolder(false);
                      setNewFolderDraft('');
                    }
                  }}
                  placeholder="Folder name"
                  className="flex-1 min-w-0 text-xs font-semibold bg-transparent border border-brand-teal rounded-md px-2 py-1 min-h-8 focus:outline-none focus:ring-2 focus:ring-brand-teal/40 text-slate-900 dark:text-slate-100"
                  maxLength={60}
                />
                <button
                  type="submit"
                  disabled={folderBusy || !newFolderDraft.trim()}
                  className="inline-flex items-center justify-center h-8 w-8 rounded-md text-brand-teal hover:bg-brand-teal/10 disabled:opacity-50"
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
                  className="inline-flex items-center justify-center h-8 w-8 rounded-md text-slate-500 hover:bg-gray-100 dark:hover:bg-[#21262d]"
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
                className="w-full flex items-center gap-2 px-3 py-2 text-xs font-semibold text-brand-teal rounded-md hover:bg-brand-teal/10 transition"
              >
                <FolderPlus size={14} aria-hidden />
                New folder
              </button>
            )}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="w-full max-w-7xl mx-auto px-4 md:px-6 py-8 animate-in fade-in slide-in-from-bottom-4 duration-500 delay-150 border-t border-gray-200 dark:border-[#30363d] mt-8">
      {/* Single-line header. The folder picker is the section's identity
          (it already shows the active folder name + count + pin state), so
          the prior Clock + "RECENT" heading was redundant chrome. When the
          folder is large enough to paginate, the range indicator + page nav
          slot inline next to the folder picker; otherwise that block stays
          collapsed and the header is just `folder | actions`. The outer
          `flex-wrap` lets the left cluster and right toolbar wrap onto two
          rows naturally at narrow widths without forcing a fixed mobile
          breakpoint. */}
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 mb-4">
        <div className="flex flex-wrap items-center gap-2 min-w-0 text-slate-500 dark:text-slate-400">
          {/* Folder picker — combines the prior "Inbox" chip and "(N items in
              folder)" text into one dropdown. The trigger surfaces the active
              view's name + count + sticky-pin state; the menu lists every
              folder with inline pin/rename/delete actions and a "+ New
              folder" affordance at the bottom. The wrapping container sets
              `position: relative` so the absolutely-positioned menu anchors
              under the trigger, and `data-folder-menu` keeps the global
              outside-click handler from closing the menu when the user
              interacts with anything inside it (rename input, etc). */}
          {renderFolderPicker()}
          {/* Compact pagination cluster — `[‹] [1/2 ▾] [›]`. The "1/2 ▾"
              button opens a popover that combines page-jump chips with
              per-page sizing chips and footnotes the visible range, so we
              no longer need a standalone "1–50 / 51" caption *or* a wide
              "50 / page" dropdown that wrapped to two lines. Prev/next
              stay as direct buttons (most common action), and every
              control carries a hover/focus tooltip describing what it
              does. The outer `data-folder-menu` marker hooks into the
              shared outside-click effect so the popover dismisses
              cleanly. */}
          {galleryPaginationEnabled && visibleHistory.length > 0 && (
            <div
              className="relative flex items-center gap-1"
              role="navigation"
              aria-label="Gallery pages"
              data-folder-menu
            >
              {/* Rich tooltip mirrors the carousel-arrow style on the main
                  preview (`ImageDisplay.tsx`): uppercase title + one-line
                  description, anchored to the wrapper rather than to the
                  button itself. Anchoring on the wrapper matters because
                  `disabled:pointer-events-none` on the button suppresses
                  `:hover` on the button when it's at an edge state — keeping
                  the tooltip as a sibling under a parent group means the
                  "Already on the first page" message still appears as the
                  user hovers the disabled arrow. */}
              <div className="relative group/tip-prev">
                <button
                  type="button"
                  onClick={() => setGalleryPage((p) => Math.max(1, p - 1))}
                  disabled={galleryPage <= 1}
                  aria-label="Previous page"
                  className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg border border-gray-300 dark:border-[#30363d] bg-white dark:bg-[#161b22] text-slate-700 dark:text-slate-200 hover:border-brand-teal disabled:opacity-40 disabled:pointer-events-none"
                >
                  <ChevronLeft size={18} aria-hidden />
                </button>
                <div
                  role="tooltip"
                  className="pointer-events-none absolute top-full mt-2 left-0 w-56 px-3 py-2.5 rounded-xl bg-black/90 text-white shadow-xl opacity-0 group-hover/tip-prev:opacity-100 group-focus-within/tip-prev:opacity-100 transition-opacity z-30"
                >
                  <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">Previous page</div>
                  <div className="text-[11px] leading-relaxed text-slate-100">
                    {galleryPage <= 1 ? 'Already on the first page.' : 'Page back through this folder.'}
                  </div>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setPageMenuOpen((open) => !open)}
                aria-haspopup="menu"
                aria-expanded={pageMenuOpen}
                aria-label={`Page ${galleryPage} of ${galleryTotalPages}. Open page and per-page options.`}
                className="group/tip-pages relative inline-flex min-h-11 items-center justify-center gap-1 rounded-lg border border-gray-300 dark:border-[#30363d] bg-white dark:bg-[#161b22] px-2 text-slate-700 dark:text-slate-200 hover:border-brand-teal transition"
              >
                <span className="text-xs font-medium tabular-nums">
                  {galleryPage}<span className="text-slate-400 dark:text-slate-500"> / </span>{galleryTotalPages}
                </span>
                <ChevronDown size={14} aria-hidden className="text-slate-400 dark:text-slate-500" />
                <span
                  role="tooltip"
                  className="pointer-events-none absolute top-full mt-2 left-1/2 -translate-x-1/2 whitespace-nowrap text-[11px] font-medium px-2 py-1 rounded-md bg-black/90 text-white shadow-lg opacity-0 group-hover/tip-pages:opacity-100 group-focus-visible/tip-pages:opacity-100 transition-opacity z-20"
                >
                  Jump to page or change per-page
                </span>
              </button>
              <div className="relative group/tip-next">
                <button
                  type="button"
                  onClick={() => setGalleryPage((p) => Math.min(galleryTotalPages, p + 1))}
                  disabled={galleryPage >= galleryTotalPages}
                  aria-label="Next page"
                  className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg border border-gray-300 dark:border-[#30363d] bg-white dark:bg-[#161b22] text-slate-700 dark:text-slate-200 hover:border-brand-teal disabled:opacity-40 disabled:pointer-events-none"
                >
                  <ChevronRight size={18} aria-hidden />
                </button>
                <div
                  role="tooltip"
                  className="pointer-events-none absolute top-full mt-2 right-0 w-56 px-3 py-2.5 rounded-xl bg-black/90 text-white shadow-xl opacity-0 group-hover/tip-next:opacity-100 group-focus-within/tip-next:opacity-100 transition-opacity z-30"
                >
                  <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">Next page</div>
                  <div className="text-[11px] leading-relaxed text-slate-100">
                    {galleryPage >= galleryTotalPages ? 'Already on the last page.' : 'Page forward through this folder.'}
                  </div>
                </div>
              </div>
              {pageMenuOpen && (
                <div
                  role="menu"
                  // Anchored to the cluster (which is `relative`), centered
                  // under the "1/2 ▾" trigger button. The trigger sits in
                  // the middle slot, so `left-1/2 -translate-x-1/2` lands
                  // the popover roughly under it on most widths without
                  // pixel-perfect anchoring.
                  className="absolute top-full left-1/2 -translate-x-1/2 mt-2 z-30 min-w-[16rem] max-w-[20rem] rounded-lg border border-gray-200 dark:border-[#30363d] bg-white dark:bg-[#161b22] shadow-lg p-3"
                  data-folder-menu
                  onClick={(e) => e.stopPropagation()}
                >
                  {/* Page jump chips. Wraps freely so even very large
                      folders (e.g. 40 pages at 25 per page) stay
                      navigable inside the popover. */}
                  <div className="mb-3">
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500 mb-1.5">
                      Jump to page
                    </p>
                    <div className="flex flex-wrap gap-1">
                      {Array.from({ length: galleryTotalPages }, (_, i) => i + 1).map((pageNum) => {
                        const isActive = pageNum === galleryPage;
                        return (
                          <button
                            key={pageNum}
                            type="button"
                            role="menuitemradio"
                            aria-checked={isActive}
                            onClick={() => {
                              setGalleryPage(pageNum);
                              setPageMenuOpen(false);
                            }}
                            className={`min-w-9 px-2 py-1 rounded-md text-xs font-medium tabular-nums transition ${
                              isActive
                                ? 'bg-brand-teal text-white border border-brand-teal'
                                : 'border border-gray-200 dark:border-[#30363d] text-slate-700 dark:text-slate-200 hover:border-brand-teal hover:text-brand-teal'
                            }`}
                          >
                            {pageNum}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                  {/* Per-page selector — chips instead of a nested
                      dropdown so users can pick a size in one click and
                      we save vertical space. */}
                  <div className="mb-2">
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500 mb-1.5">
                      Per page
                    </p>
                    <div className="flex flex-wrap gap-1">
                      {[25, 50, 100, 200].map((size) => {
                        const isActive = size === galleryPageSize;
                        return (
                          <button
                            key={size}
                            type="button"
                            role="menuitemradio"
                            aria-checked={isActive}
                            onClick={() => {
                              setGalleryPageSize(size);
                              setGalleryPage(1);
                              setPageMenuOpen(false);
                            }}
                            className={`px-2.5 py-1 rounded-md text-xs font-medium tabular-nums transition ${
                              isActive
                                ? 'bg-brand-teal text-white border border-brand-teal'
                                : 'border border-gray-200 dark:border-[#30363d] text-slate-700 dark:text-slate-200 hover:border-brand-teal hover:text-brand-teal'
                            }`}
                          >
                            {size}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                  {/* Visible-range footnote — replaces the prior inline
                      "1–50 / 51" caption that used to live in the header
                      row. Surfacing it here keeps the data without
                      cluttering the chrome. */}
                  <p className="text-[10px] text-slate-400 dark:text-slate-500 tabular-nums border-t border-gray-100 dark:border-[#30363d] pt-2">
                    Showing {galleryRangeStart}–{galleryRangeEnd} of {visibleHistory.length}
                    {history.length !== visibleHistory.length ? ` · ${history.length} total in history` : ''}
                  </p>
                </div>
              )}
            </div>
          )}
          {selectionMode && selectedIds.length > 0 && (
            <span className="text-xs font-semibold text-brand-teal" aria-live="polite">
              {selectedIds.length} selected
            </span>
          )}
        </div>
        {/* Toolbar — `flex-nowrap` so action buttons never break onto a
            second row. Buttons are fully icon-only at every breakpoint;
            each one renders the dark `bg-black/90` floating tooltip used
            elsewhere in the app (see `ControlPanel` Reset / Upload brand)
            so the meaning is still discoverable on hover or keyboard
            focus. Going icon-only at all widths frees ~150px the gallery
            heading + selection counter need on the left. The DownloadMenu
            count is folded into its tooltip text — the leading "X selected"
            indicator already exposes the same number visibly. Tooltips
            sit *below* the button (`top-full mt-2`) so they don't get
            clipped by the sticky control panel that floats above the
            gallery. Every button uses a distinct named group
            (`group/tip-<id>`) so a single hovered button never lights up
            siblings. */}
        <div className="flex flex-nowrap items-center gap-1.5">
          {selectionMode ? (
            <>
              <button
                type="button"
                onClick={() => setSelectedIds(visibleHistory.map((g) => g.id))}
                aria-label="Select all items in this folder"
                className="group/tip-selectall relative inline-flex items-center justify-center px-3 py-2 min-h-11 rounded-lg border border-gray-300 dark:border-[#30363d] bg-white dark:bg-[#161b22] text-slate-700 dark:text-slate-200 hover:border-brand-teal hover:text-brand-teal transition shrink-0"
              >
                <CheckSquare size={16} aria-hidden />
                <span
                  role="tooltip"
                  className="pointer-events-none absolute top-full mt-2 left-1/2 -translate-x-1/2 whitespace-nowrap text-[11px] font-medium px-2 py-1 rounded-md bg-black/90 text-white shadow-lg opacity-0 group-hover/tip-selectall:opacity-100 group-focus-visible/tip-selectall:opacity-100 transition-opacity z-20"
                >
                  Select all
                </span>
              </button>
              <button
                type="button"
                onClick={() => setSelectedIds([])}
                aria-label="Clear current selection"
                className="group/tip-clear relative inline-flex items-center justify-center px-3 py-2 min-h-11 rounded-lg border border-gray-300 dark:border-[#30363d] bg-white dark:bg-[#161b22] text-slate-700 dark:text-slate-200 hover:border-brand-teal hover:text-brand-teal transition shrink-0"
              >
                <Square size={16} aria-hidden />
                <span
                  role="tooltip"
                  className="pointer-events-none absolute top-full mt-2 left-1/2 -translate-x-1/2 whitespace-nowrap text-[11px] font-medium px-2 py-1 rounded-md bg-black/90 text-white shadow-lg opacity-0 group-hover/tip-clear:opacity-100 group-focus-visible/tip-clear:opacity-100 transition-opacity z-20"
                >
                  Clear selection
                </span>
              </button>
              <DownloadMenu
                mode="all-only"
                allGenerations={downloadScope}
                allLabel={downloadScopeLabel}
                triggerTitle={downloadScopeLabel}
                triggerTooltip={downloadScopeLabel}
                // Hide the visible label on the trigger; the count still
                // shows on the left ("X selected") and inside the open
                // dropdown's section header. Without this, the menu's own
                // fallback would render `allLabel` as a visible span.
                triggerLabelClassName="hidden"
                icon={<Archive size={16} aria-hidden />}
                triggerClassName="inline-flex items-center justify-center gap-1 text-xs font-semibold px-3 py-2 min-h-11 rounded-lg bg-brand-teal text-white hover:opacity-90 disabled:opacity-50 disabled:pointer-events-none transition shrink-0"
                disabled={downloadScope.length === 0}
                onNotify={showToast}
                align="right"
              />
              <div className="relative shrink-0" data-folder-menu>
                <button
                  type="button"
                  onClick={() => setMoveMenuOpen((prev) => !prev)}
                  disabled={selectedIds.length === 0 || folderBusy}
                  aria-haspopup="menu"
                  aria-expanded={moveMenuOpen}
                  aria-label="Move selected items to a folder"
                  className="group/tip-move relative inline-flex items-center justify-center px-3 py-2 min-h-11 rounded-lg border border-gray-300 dark:border-[#30363d] bg-white dark:bg-[#161b22] text-slate-700 dark:text-slate-200 hover:border-brand-teal hover:text-brand-teal transition disabled:opacity-50 disabled:pointer-events-none"
                >
                  <FolderInput size={16} aria-hidden />
                  <span
                    role="tooltip"
                    className="pointer-events-none absolute top-full mt-2 left-1/2 -translate-x-1/2 whitespace-nowrap text-[11px] font-medium px-2 py-1 rounded-md bg-black/90 text-white shadow-lg opacity-0 group-hover/tip-move:opacity-100 group-focus-visible/tip-move:opacity-100 transition-opacity z-20"
                  >
                    Move to folder
                  </span>
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
                aria-label="Exit selection mode"
                className="group/tip-cancel relative inline-flex items-center justify-center px-3 py-2 min-h-11 rounded-lg border border-gray-300 dark:border-[#30363d] bg-white dark:bg-[#161b22] text-slate-700 dark:text-slate-200 hover:border-slate-500 transition shrink-0"
              >
                <XIcon size={16} aria-hidden />
                <span
                  role="tooltip"
                  className="pointer-events-none absolute top-full mt-2 left-1/2 -translate-x-1/2 whitespace-nowrap text-[11px] font-medium px-2 py-1 rounded-md bg-black/90 text-white shadow-lg opacity-0 group-hover/tip-cancel:opacity-100 group-focus-visible/tip-cancel:opacity-100 transition-opacity z-20"
                >
                  Exit selection mode
                </span>
              </button>
            </>
          ) : (
            <>
              {/* Thumbnail-size selector — icon-only by default to match the
                  other icon buttons in this row. The current value name
                  (Tiny / Small / Medium / Large) only appears at xl+ where
                  there's plenty of horizontal room; below that the
                  LayoutGrid icon plus chevron are enough to signal a size
                  picker, and the open menu still surfaces the active
                  selection clearly. */}
              <div className="w-auto xl:w-32 shrink-0">
                <RichSelect
                  value={thumbnailSize}
                  onChange={(value) => setThumbnailSize(value as ThumbnailSize)}
                  options={THUMBNAIL_SIZE_OPTIONS}
                  placeholder="Size"
                  icon={LayoutGrid}
                  compact
                  buttonClassName="rounded-lg min-h-11"
                  menuClassName="max-w-[16rem] z-[40]"
                  triggerLabelClassName="hidden xl:inline"
                />
              </div>
              <button
                type="button"
                onClick={() => setShowDetails((v) => !v)}
                aria-pressed={showDetails}
                aria-label={showDetails ? 'Hide prompt and tag details under each thumbnail' : 'Show prompt and tag details under each thumbnail'}
                className={`group/tip-details relative inline-flex items-center justify-center px-3 py-2 min-h-11 rounded-lg border transition shrink-0 ${
                  showDetails
                    ? 'border-brand-teal bg-brand-teal/10 text-brand-teal'
                    : 'border-gray-300 dark:border-[#30363d] bg-white dark:bg-[#161b22] text-slate-700 dark:text-slate-200 hover:border-brand-teal hover:text-brand-teal'
                }`}
              >
                {showDetails ? <EyeOff size={16} aria-hidden /> : <Eye size={16} aria-hidden />}
                <span
                  role="tooltip"
                  className="pointer-events-none absolute top-full mt-2 left-1/2 -translate-x-1/2 whitespace-nowrap text-[11px] font-medium px-2 py-1 rounded-md bg-black/90 text-white shadow-lg opacity-0 group-hover/tip-details:opacity-100 group-focus-visible/tip-details:opacity-100 transition-opacity z-20"
                >
                  {showDetails ? 'Hide details' : 'Show details'}
                </span>
              </button>
              <DownloadMenu
                mode="all-only"
                allGenerations={visibleHistory}
                allLabel={`Download all (${visibleHistory.length})`}
                triggerTitle={`Download all (${visibleHistory.length}) in folder as ZIP`}
                triggerTooltip={`Download all (${visibleHistory.length}) in folder as ZIP`}
                // Hide the visible "Download all (N)" label on the trigger;
                // the gallery heading already shows the count next to the
                // folder name, and the open dropdown still surfaces it in
                // its section header. Without this, DownloadMenu's own
                // fallback would render `allLabel` as a visible span.
                triggerLabelClassName="hidden"
                icon={<Archive size={16} aria-hidden />}
                triggerClassName="inline-flex items-center justify-center gap-1 text-xs font-semibold px-3 py-2 min-h-11 rounded-lg border border-gray-300 dark:border-[#30363d] bg-white dark:bg-[#161b22] text-slate-700 dark:text-slate-200 hover:border-brand-teal hover:text-brand-teal transition disabled:opacity-50 disabled:pointer-events-none shrink-0"
                disabled={visibleHistory.length === 0}
                onNotify={showToast}
                align="right"
              />
              <button
                type="button"
                onClick={() => setSelectionMode(true)}
                aria-label="Select items to move to a folder or export"
                className="group/tip-select relative inline-flex items-center justify-center px-3 py-2 min-h-11 rounded-lg border border-gray-300 dark:border-[#30363d] bg-white dark:bg-[#161b22] text-slate-700 dark:text-slate-200 hover:border-brand-teal hover:text-brand-teal transition shrink-0"
              >
                <CheckSquare size={16} aria-hidden />
                <span
                  role="tooltip"
                  className="pointer-events-none absolute top-full mt-2 left-1/2 -translate-x-1/2 whitespace-nowrap text-[11px] font-medium px-2 py-1 rounded-md bg-black/90 text-white shadow-lg opacity-0 group-hover/tip-select:opacity-100 group-focus-visible/tip-select:opacity-100 transition-opacity z-20"
                >
                  Select items
                </span>
              </button>
            </>
          )}
        </div>
      </div>

      {/* Folder tab strip removed — replaced by the inline folder-picker
          dropdown rendered above by `renderFolderPicker`. The dropdown is
          denser (one trigger vs. a horizontally-scrollable rail of chips),
          persists the chosen view via localStorage so reloads return to
          the user's last folder, and keeps every per-folder action
          (pin/rename/delete + create) colocated in one menu. */}

      {/* Pagination row removed — its controls now live inline in the
          header above (next to the folder picker), and the "Large folders
          are split into pages so the grid stays responsive" helper text
          was dropped because the page-nav controls themselves make the
          behavior self-evident. */}

      {visibleHistory.length === 0 && (
        <div className="text-center py-12 text-sm text-slate-500 dark:text-slate-400 border border-dashed border-gray-300 dark:border-[#30363d] rounded-xl mb-4">
          This folder is empty.
          {activeFolderId === viewFolderId
            ? ' New generations will land here.'
            : ' Pin this folder to make new generations land here, or move tiles in from another folder.'}
        </div>
      )}

      <div className={THUMBNAIL_GRID_CLASS[thumbnailSize]}>
        {pagedVisibleHistory.map((gen) => {
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
          // Match the tile against whatever generation the main ImageDisplay
          // is currently rendering. Compare-pick and multi-select still win
          // visually because they're explicit user actions; the active-tile
          // ring is the ambient "you are here" cue when neither of those
          // modes is engaged.
          const isActiveTile = !!activeGenerationId && activeGenerationId === gen.id;

          return (
            <div 
              key={gen.id} 
              className={`group relative bg-white dark:bg-[#161b22] border rounded-xl overflow-visible shadow-sm hover:shadow-lg transition-all ${
                isPickedSide
                  ? 'border-amber-400 ring-2 ring-amber-400/40'
                  : selectionMode && selectedIds.includes(gen.id)
                    ? 'border-brand-teal ring-2 ring-brand-teal/50 dark:ring-brand-teal/40'
                    : isActiveTile
                      ? 'border-brand-red ring-2 ring-brand-red/50 dark:ring-brand-red/40 shadow-md'
                      : 'border-gray-200 dark:border-[#30363d] hover:border-brand-teal dark:hover:border-brand-teal'
              }`}
              data-comparison-batch={batchId || undefined}
              data-active-tile={isActiveTile ? 'true' : undefined}
              aria-current={isActiveTile ? 'true' : undefined}
              onMouseEnter={(e) => scheduleHoverPreview(gen.id, e.currentTarget)}
              onMouseLeave={clearHoverPreview}
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

              {/* Per-tile hover toolbar removed: every action (download,
                  copy, delete, etc.) is one click away once the user opens
                  the tile in the main preview, and the bulk-action header
                  above the grid already covers multi-select operations.
                  Keeping the thumbnails uncluttered makes the gallery read
                  as a clean image grid. */}

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

      {/* Folder kebab portal removed — rename / delete actions now live
          inline in each row of the folder-picker dropdown, so we no longer
          need the portal-based escape hatch that was working around the
          chip rail's overflow clipping. */}

      {/* Hover preview — a larger render of whichever tile the cursor is
          over. Rendered via a portal so it floats above the gallery grid
          and folder strip without being clipped by their overflow
          containers.

          Placement strategy: the preview prefers to sit DIRECTLY ABOVE
          the hovered tile (or below if the tile is near the top of the
          viewport) so the visual association between cursor and preview
          is immediate. The card is horizontally centered on the tile's
          column and clamped to the viewport. Side docking (right/left)
          is a last-resort fallback used only when neither vertical
          direction has enough room — for example a very-short viewport
          where the tile sits mid-screen with crowded grids above and
          below.

          Earlier the default was side docking, which on wide viewports
          looked correct horizontally but vertically-centered on the
          tile + viewport-clamped, leaving the preview pinned to the top
          edge of the screen far away from a tile in row 2 or 3 of the
          gallery. Preferring vertical placement keeps the preview
          attached to the tile no matter where it sits in the grid.

          Dimensions are capped (`MAX_WIDTH` / `MAX_HEIGHT`) so the
          preview reads as a generous tooltip rather than a half-screen
          panel. `pointer-events-none` keeps the underlying tile's hover
          toolbar and click target fully usable; `aria-hidden` keeps it
          out of the a11y tree (the source tile already exposes the same
          image via its `<img alt>` and the "Restore" button). */}
      {hoverPreview && (() => {
        const gen = pagedVisibleHistory.find((g) => g.id === hoverPreview.id);
        if (!gen) return null;
        const latestVersion = getLatestVersion(gen);
        const imageUrl = getDisplayImageUrl(gen);
        const modelLabel = getModelLabel(latestVersion.modelId || gen.modelId);

        // Tight gap so the preview reads as attached to the tile, plus
        // an extra viewport margin to keep the card from kissing the
        // screen edge when it's clamped.
        const gap = 10;
        const margin = 16;
        // Cap the preview's footprint so it always feels like a peek,
        // not a full takeover. The image will scale to fit inside.
        const MAX_WIDTH = 520;
        const MAX_HEIGHT = 420;
        // Below this we'd rather dock to the side than show a stunted
        // sliver of preview.
        const MIN_VERTICAL = 220;

        const vw = window.innerWidth;
        const vh = window.innerHeight;
        const { rect } = hoverPreview;
        const spaceRight = Math.max(0, vw - rect.right - gap - margin);
        const spaceLeft = Math.max(0, rect.left - gap - margin);
        const spaceBelow = Math.max(0, vh - rect.bottom - gap - margin);
        const spaceAbove = Math.max(0, rect.top - gap - margin);
        const horizontalSpace = Math.max(spaceLeft, spaceRight);
        const verticalSpace = Math.max(spaceAbove, spaceBelow);
        // Default to vertical placement (above preferred, then below).
        // Side placement is only chosen when both vertical gutters are
        // too cramped AND a side gutter is meaningfully larger.
        const preferSide =
          verticalSpace < MIN_VERTICAL && horizontalSpace > verticalSpace;
        const placement: 'right' | 'left' | 'below' | 'above' = preferSide
          ? spaceRight >= spaceLeft
            ? 'right'
            : 'left'
          : spaceAbove >= spaceBelow
            ? 'above'
            : 'below';

        const style: React.CSSProperties = { position: 'fixed', zIndex: 60 };
        if (placement === 'right' || placement === 'left') {
          // Side dock — width fills the chosen gutter (capped) and the
          // card vertically tracks the tile's center so the eye doesn't
          // have to jump. Only reached when neither vertical direction
          // has enough room.
          const width = Math.min(
            MAX_WIDTH,
            placement === 'right' ? spaceRight : spaceLeft
          );
          const maxHeight = Math.min(MAX_HEIGHT, vh - margin * 2);
          style.width = `${width}px`;
          style.maxHeight = `${maxHeight}px`;
          if (placement === 'right') style.left = `${rect.right + gap}px`;
          else style.right = `${vw - rect.left + gap}px`;
          const tileCenterY = rect.top + rect.height / 2;
          const desiredTop = tileCenterY - maxHeight / 2;
          style.top = `${Math.max(margin, Math.min(desiredTop, vh - margin - maxHeight))}px`;
        } else {
          // Vertical dock — sit directly above (or below) the tile,
          // horizontally centered on the tile's column then clamped to
          // the viewport. The capped maxHeight makes the preview feel
          // like a chunky tooltip rather than a screen-sized panel.
          const width = Math.min(MAX_WIDTH, vw - margin * 2);
          const maxHeight = Math.min(
            MAX_HEIGHT,
            placement === 'below' ? spaceBelow : spaceAbove
          );
          style.width = `${width}px`;
          style.maxHeight = `${maxHeight}px`;
          const tileCenterX = rect.left + rect.width / 2;
          const desiredLeft = tileCenterX - width / 2;
          style.left = `${Math.max(margin, Math.min(desiredLeft, vw - margin - width))}px`;
          if (placement === 'below') style.top = `${rect.bottom + gap}px`;
          else style.bottom = `${vh - rect.top + gap}px`;
        }

        // The image has to leave room for the prompt/meta footer below it
        // (~64px) plus the card's borders, so we shrink its max-height by
        // a fixed gutter rather than letting it claim the full card.
        const imageMaxHeight = `calc(${(style.maxHeight as string)} - 80px)`;

        return createPortal(
          <div
            aria-hidden
            style={style}
            className="pointer-events-none animate-in fade-in zoom-in-95 duration-150"
          >
            <div className="rounded-2xl overflow-hidden border border-gray-300 dark:border-[#30363d] bg-white dark:bg-[#161b22] shadow-2xl flex flex-col max-h-full">
              <div
                className="w-full bg-gray-50 dark:bg-[#0d1117] flex items-center justify-center min-h-0 flex-1"
                style={{ maxHeight: imageMaxHeight }}
              >
                {latestVersion.mimeType === 'image/svg+xml' && latestVersion.svgCode ? (
                  <div
                    className="w-full h-full flex items-center justify-center p-4 [&>svg]:max-w-full [&>svg]:max-h-full [&>svg]:w-auto [&>svg]:h-auto"
                    dangerouslySetInnerHTML={{ __html: sanitizeSvg(latestVersion.svgCode) }}
                  />
                ) : (
                  <img
                    src={imageUrl}
                    alt=""
                    className="block w-auto h-auto max-w-full max-h-full object-contain"
                  />
                )}
              </div>
              <div className="px-4 py-2.5 border-t border-gray-200 dark:border-[#30363d] bg-white/95 dark:bg-[#161b22]/95 shrink-0">
                <p className="text-xs text-slate-700 dark:text-slate-200 line-clamp-2">
                  {gen.config.prompt}
                </p>
                <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                  <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-brand-teal/10 text-brand-teal border border-brand-teal/40">
                    {modelLabel}
                  </span>
                  <span className="text-[10px] font-medium text-slate-500 dark:text-slate-400 tabular-nums">
                    {formatTimestamp(gen.createdAt)}
                  </span>
                </div>
              </div>
            </div>
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

export interface BaseResource {
  id: string;
  name: string;
  icon?: any;
  
  // Ownership & Visibility
  authorId: string;
  authorName: string;
  scope: 'system' | 'private' | 'public' | 'team';
  teamId?: string;

  // Social & Forking
  votes: number;
  voters: string[];
  forkedFromId?: string;
  createdAt: number;
}

export interface BrandColor extends BaseResource {
  colors: string[]; // Hex codes
}

export type StyleFormat = 'raster' | 'vector';

export interface VisualStyle extends BaseResource {
  description: string;
  supportedFormats?: StyleFormat[];
}

export interface GraphicType extends BaseResource {}

export interface AspectRatioOption extends BaseResource {
  label: string;
  value: string; // "1:1", "16:9", etc.
}

export type SvgMode = 'static' | 'animated' | 'interactive';

export interface GenerationConfig {
  prompt: string;
  colorSchemeId: string;
  visualStyleId: string;
  graphicTypeId: string;
  aspectRatio: string;
  svgMode?: SvgMode;
}

export interface GeneratedImage {
  imageUrl: string;
  base64Data: string;
  mimeType: string;
  modelId?: string;
  timestamp?: number;
  config?: GenerationConfig;
}

/** @deprecated Use Generation + GenerationVersion instead */
export interface GenerationHistoryItem extends GeneratedImage {
  id: string;
  timestamp: number;
  config: GenerationConfig;
  modelId?: string;
}

export type VersionType = 'generation' | 'refinement';

export interface GenerationVersion {
  id: string;
  number: number;
  label: string;
  timestamp: number;
  type: VersionType;

  imageData: string;
  imageUrl: string;
  imageStoragePath?: string;
  mimeType: string;
  aspectRatio?: string;

  svgCode?: string;

  refinementPrompt?: string;
  parentVersionId?: string;

  /**
   * Which model produced this specific version. Optional for backward compat
   * with legacy single-model history items (the parent Generation.modelId
   * applies in that case). For comparison tiles where multiple models share
   * one Generation, this is what tells the UI which chip / refine-default /
   * slider-label to use per mark.
   */
  modelId?: string;
}

export interface Generation {
  id: string;
  createdAt: number;
  config: GenerationConfig;
  modelId: string;
  versions: GenerationVersion[];
  currentVersionIndex: number;

  /**
   * Shared tag linking tiles produced by a single multi-model Generate click
   * (e.g. "Nano Banana Pro vs GPT Image 2 from the same prompt"). Absent on
   * normal single-model generations. Used only for grouping/badging in the UI;
   * comparisons themselves are not persisted.
   */
  comparisonBatchId?: string;

  /**
   * Folder this tile lives in. Every Generation belongs to exactly one
   * folder; legacy items without this field are normalized to
   * `INBOX_FOLDER_ID` at read time so the gallery can always group by
   * folder.
   */
  folderId: string;
}

/**
 * Reserved id of the always-present "Inbox" folder. Auto-created on first
 * init (per user / per guest device) and undeletable, but renameable. Used
 * as the fallback target when an `activeFolderId` is missing or a folder is
 * deleted with tiles still inside it.
 */
export const INBOX_FOLDER_ID = 'folder-inbox';

/**
 * A user-owned container that groups generation tiles. Folders persist on
 * the user document for signed-in users and in localStorage for guests.
 */
export interface Folder {
  id: string;
  name: string;
  createdAt: number;
}

export interface BrandGuidelinesAnalysis {
  brandColors: Omit<BrandColor, 'id' | 'authorId' | 'authorName' | 'scope' | 'votes' | 'voters' | 'createdAt'>[];
  visualStyles: Omit<VisualStyle, 'id' | 'authorId' | 'authorName' | 'scope' | 'votes' | 'voters' | 'createdAt'>[];
  graphicTypes: Omit<GraphicType, 'id' | 'authorId' | 'authorName' | 'scope' | 'votes' | 'voters' | 'createdAt'>[];
}

export interface UserPreferences {
  // References only, actual data stored in resource collections
  geminiApiKey?: string; // Legacy support
  apiKeys?: {
    [modelId: string]: string;
  };
  selectedModel?: string;
  systemPrompt?: string;
  settings?: UserSettings;
  /**
   * Saved toolbar preset groups. Each entry captures a snapshot of the
   * configurable toolbar fields (type/style/colors/size/model/quality/svgMode)
   * so the user can recall a frequently-used combination with one click.
   */
  presets?: ToolbarPreset[];
  /**
   * User-owned folders that contain generation tiles. The reserved
   * `INBOX_FOLDER_ID` entry is auto-seeded on first init and cannot be
   * removed (only renamed). Folder list order is the order of creation.
   */
  folders?: Folder[];
  /**
   * Sticky folder for new generations. When set, every new tile auto-lands
   * in this folder until cleared. `undefined` / missing => fall back to
   * Inbox. Cleared explicitly by the user via the gallery's pin toggle.
   */
  activeFolderId?: string;
  /**
   * Which folder the Recents gallery is currently showing. Persisted so the
   * same selection restores across devices and sessions (Firestore for
   * signed-in users; localStorage for guests). Invalid ids fall back to Inbox.
   */
  galleryViewFolderId?: string;
}

/**
 * A named snapshot of toolbar settings the user wants to recall later.
 * Stored on the user document under preferences.presets. Empty/undefined
 * fields are treated as "leave the current value alone" when applied, so
 * a user can save partial presets (e.g. just a style + palette pair).
 */
export interface ToolbarPreset {
  id: string;
  name: string;
  createdAt: number;
  graphicTypeId?: string;
  visualStyleId?: string;
  colorSchemeId?: string;
  aspectRatio?: string;
  svgMode?: SvgMode;
  selectedModel?: string;
  openaiImageQuality?: 'low' | 'medium' | 'high' | 'auto';
}

export interface UserSettings {
  contributeByDefault: boolean;
  defaultGraphicTypeId?: string;
  defaultVisualStyleId?: string;
  defaultColorSchemeId?: string;
  defaultAspectRatio?: string;
  confirmDeleteHistory?: boolean;
  confirmDeleteCurrent?: boolean;
  /**
   * OpenAI GPT Image quality setting: 'low' | 'medium' | 'high' | 'auto'.
   * Only consumed by gpt-image-2 and gpt-image-1-mini; gpt-image-1.5 ignores it.
   */
  openaiImageQuality?: 'low' | 'medium' | 'high' | 'auto';
}

export interface User {
  id: string;
  name: string;
  username?: string; 
  email: string;
  photoURL?: string; 
  preferences: UserPreferences;
  teamIds?: string[]; // IDs of teams the user belongs to

  /**
   * Derived from the Firebase Auth custom claim `admin` on every auth state
   * change. Never persisted to Firestore — sanitized out of every write path.
   */
  isAdmin?: boolean;

  /**
   * Persisted flag that hard-blocks the account from accessing the app.
   * Written by admins via `adminService.setUserDisabled`.
   */
  isDisabled?: boolean;
}

export interface Team {
  id: string;
  name: string;
  ownerId: string;
  members: string[]; // List of user IDs
  createdAt: number;
}

// Deprecated: CatalogItem is no longer needed as resources are self-contained
// export interface CatalogItem { ... }

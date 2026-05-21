import { Folder, INBOX_FOLDER_ID, ToolbarPreset, User, UserPreferences } from "../types";
import { authService } from "./authService";
import { sanitizeToolbarPresetList } from "../utils/toolbarPresetUtils";
import {
  getChildFolders,
  getDescendantFolderIds,
  sanitizeFolderParentId,
  wouldCreateFolderCycle,
} from "./folderTreeUtils";

/**
 * Manages user-owned folders that group generation tiles. Folders persist
 * on the user document for signed-in users (under
 * `preferences.folders` / `preferences.galleryViewFolderId`) and in localStorage
 * for guests so the gallery looks the same before and after sign-in.
 *
 * Every Generation belongs to exactly one folder; missing/legacy items are
 * normalized into the always-present "Inbox" by `historyService`. Inbox is
 * renameable but undeletable.
 */

const FOLDERS_LOCAL_KEY = 'brandoit_folders_v1';
/** Last-opened Recents gallery folder for guests (signed-in uses Firestore). */
const GALLERY_VIEW_FOLDER_LOCAL_KEY = 'brandoit_gallery_view_folder_v1';
/** Legacy key from when view folder lived only in RecentGenerations. */
const GALLERY_VIEW_FOLDER_LEGACY_KEY = 'recentGenerations.viewFolderId';

const generateFolderId = (): string => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `folder-${crypto.randomUUID()}`;
  }
  return `folder-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
};

const buildInbox = (): Folder => ({
  id: INBOX_FOLDER_ID,
  name: 'Inbox',
  createdAt: Date.now()
});

/**
 * Always-true invariant: the returned list contains an Inbox folder. If
 * one was missing from the input we prepend a fresh one so callers can
 * rely on `folders[0]?.id` behaving sensibly during boot.
 */
const ensureInbox = (folders: Folder[]): Folder[] => {
  const hasInbox = folders.some(f => f.id === INBOX_FOLDER_ID);
  if (hasInbox) return folders;
  return [buildInbox(), ...folders];
};

const MAX_FOLDER_INSTRUCTIONS = 4000;
const MAX_FOLDER_PRESETS = 50;

const generatePresetId = (): string => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `preset-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
};

const sanitizeFolder = (raw: any, allIds?: Set<string>): Folder | null => {
  if (!raw || typeof raw.id !== 'string' || typeof raw.name !== 'string') return null;
  const trimmedName = raw.name.trim();
  if (!trimmedName) return null;
  let parentId: string | undefined;
  if (typeof raw.parentId === 'string' && raw.parentId.length > 0 && raw.parentId !== raw.id) {
    if (!allIds || allIds.has(raw.parentId)) {
      parentId = raw.parentId;
    }
  }
  let customInstructions: string | undefined;
  if (typeof raw.customInstructions === 'string') {
    const trimmed = raw.customInstructions.trim();
    if (trimmed.length > 0) {
      customInstructions = trimmed.slice(0, MAX_FOLDER_INSTRUCTIONS);
    }
  }
  const folder: Folder = {
    id: raw.id,
    name: trimmedName,
    createdAt: typeof raw.createdAt === 'number' ? raw.createdAt : Date.now(),
  };
  if (parentId) folder.parentId = parentId;
  if (customInstructions) folder.customInstructions = customInstructions;
  if (typeof raw.sortOrder === 'number' && Number.isFinite(raw.sortOrder)) {
    folder.sortOrder = raw.sortOrder;
  }
  if (raw.useFolderPresets === true) {
    folder.useFolderPresets = true;
  }
  const presets = sanitizeToolbarPresetList(raw.presets);
  if (presets.length > 0) {
    folder.presets = presets.slice(0, MAX_FOLDER_PRESETS);
  }
  return folder;
};

const sanitizeFolderList = (rawList: unknown[]): Folder[] => {
  const pass1 = rawList
    .filter((raw) => raw && typeof (raw as Folder).id === 'string')
    .map((raw) => {
      const r = raw as Folder;
      return {
        id: r.id,
        name: typeof r.name === 'string' ? r.name.trim() : '',
        createdAt: typeof r.createdAt === 'number' ? r.createdAt : Date.now(),
        parentId: typeof r.parentId === 'string' ? r.parentId : undefined,
        customInstructions:
          typeof r.customInstructions === 'string' ? r.customInstructions : undefined,
        sortOrder: typeof r.sortOrder === 'number' ? r.sortOrder : undefined,
        useFolderPresets: r.useFolderPresets === true ? true : undefined,
        presets: r.presets,
      };
    })
    .filter((f) => f.name.length > 0);
  const idSet = new Set(pass1.map((f) => f.id));
  return pass1
    .map((f) => sanitizeFolder(f, idSet))
    .filter((f): f is Folder => f !== null);
};

const readLocalFolders = (): Folder[] => {
  try {
    const raw = localStorage.getItem(FOLDERS_LOCAL_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return sanitizeFolderList(parsed);
  } catch {
    return [];
  }
};

const writeLocalFolders = (folders: Folder[]) => {
  try {
    localStorage.setItem(FOLDERS_LOCAL_KEY, JSON.stringify(folders));
  } catch (err) {
    console.warn('[folderService] Failed to persist folders locally:', err);
  }
};

const readLocalGalleryViewFolderId = (): string | undefined => {
  try {
    const primary = localStorage.getItem(GALLERY_VIEW_FOLDER_LOCAL_KEY);
    if (primary && primary.length > 0) return primary;
    const legacy = localStorage.getItem(GALLERY_VIEW_FOLDER_LEGACY_KEY);
    return legacy && legacy.length > 0 ? legacy : undefined;
  } catch {
    return undefined;
  }
};

const writeLocalGalleryViewFolderId = (id: string) => {
  try {
    localStorage.setItem(GALLERY_VIEW_FOLDER_LOCAL_KEY, id);
  } catch (err) {
    console.warn('[folderService] Failed to persist gallery view folder locally:', err);
  }
};

/**
 * Returns a stored gallery folder id only if it still exists in `folders`.
 */
const resolveGalleryViewFolderId = (
  raw: string | undefined,
  folders: Folder[]
): string | undefined => {
  if (!raw || raw.length === 0) return undefined;
  return folders.some(f => f.id === raw) ? raw : undefined;
};

const buildNextPreferences = (
  user: User,
  nextFolders: Folder[],
  nextGalleryViewFolderId?: string
): UserPreferences => {
  const next: UserPreferences = {
    ...user.preferences,
    folders: nextFolders,
  };
  delete next.activeFolderId;
  if (nextGalleryViewFolderId !== undefined) {
    next.galleryViewFolderId = nextGalleryViewFolderId;
  }
  return next;
};

/**
 * Persist a folder list for the current actor. Centralizing the write keeps
 * guest + signed-in flows in sync — every mutation goes through this helper.
 */
const persistFolders = async (
  user: User | null,
  folders: Folder[],
  galleryViewFolderId?: string
): Promise<void> => {
  if (user) {
    await authService.updateUserPreferences(
      user.id,
      buildNextPreferences(user, folders, galleryViewFolderId)
    );
  } else {
    writeLocalFolders(folders);
    if (galleryViewFolderId !== undefined && galleryViewFolderId.length > 0) {
      writeLocalGalleryViewFolderId(galleryViewFolderId);
    }
  }
};

export interface FolderState {
  folders: Folder[];
  /** Which folder the Recents grid should open on; validated against `folders`. */
  galleryViewFolderId?: string;
}

export const folderService = {
  /**
   * Hydrate the current actor's folder list. Auto-seeds Inbox the first
   * time we're called for a user/device so the rest of the app can assume
   * at least one folder always exists.
   */
  loadFolders: async (user: User | null): Promise<FolderState> => {
    if (user) {
      const stored = Array.isArray(user.preferences.folders)
        ? sanitizeFolderList(user.preferences.folders)
        : [];
      const folders = ensureInbox(stored);

      const fromPrefs = resolveGalleryViewFolderId(
        typeof user.preferences.galleryViewFolderId === 'string'
          ? user.preferences.galleryViewFolderId
          : undefined,
        folders
      );

      let galleryViewFolderId = fromPrefs;

      // One-time migration: browser had the old localStorage key but Firestore
      // never stored the gallery tab — promote a valid legacy value to the
      // user doc so it follows the account across devices.
      if (!galleryViewFolderId && typeof globalThis.localStorage !== 'undefined') {
        try {
          const legacy = globalThis.localStorage.getItem(GALLERY_VIEW_FOLDER_LEGACY_KEY);
          const migrated = resolveGalleryViewFolderId(
            legacy && legacy.length > 0 ? legacy : undefined,
            folders
          );
          if (migrated) {
            galleryViewFolderId = migrated;
            void authService
              .updateUserPreferences(user.id, {
                ...user.preferences,
                folders,
                galleryViewFolderId: migrated,
              })
              .catch(err => console.warn('[folderService] Gallery view migration write failed:', err));
          }
        } catch {
          // ignore
        }
      }

      // Persist the seed so a brand-new account ends up with an Inbox doc
      // even before the user creates anything. Best-effort — failure here
      // shouldn't block the UI from rendering the in-memory seed.
      if (stored.length === 0) {
        try {
          await persistFolders(user, folders);
        } catch (err) {
          console.warn('[folderService] Failed to seed Inbox for new user:', err);
        }
      }

      return { folders, galleryViewFolderId };
    }

    const stored = readLocalFolders();
    const folders = ensureInbox(stored);
    if (stored.length === 0) writeLocalFolders(folders);
    const galleryViewFolderId = resolveGalleryViewFolderId(readLocalGalleryViewFolderId(), folders);
    return {
      folders,
      galleryViewFolderId,
    };
  },

  /**
   * Remember which folder the Recents gallery is showing. Signed-in users
   * persist on the user document; guests use localStorage.
   */
  setGalleryViewFolder: async (user: User | null, folderId: string): Promise<void> => {
    if (!folderId || folderId.length === 0) return;
    if (user) {
      await authService.updateUserPreferences(user.id, {
        ...user.preferences,
        galleryViewFolderId: folderId
      });
    } else {
      writeLocalGalleryViewFolderId(folderId);
    }
  },

  /**
   * Append a new folder and switch the gallery view to it. Returns the new
   * folder and list so callers can update local state in one shot.
   */
  createFolder: async (
    user: User | null,
    name: string,
    currentFolders: Folder[],
    parentId?: string
  ): Promise<{ folder: Folder; folders: Folder[] }> => {
    const trimmed = name.trim();
    if (!trimmed) throw new Error('Folder name is required.');

    const safeParent = parentId
      ? sanitizeFolderParentId(parentId, '', currentFolders)
      : undefined;
    if (parentId && !safeParent) {
      throw new Error('Parent folder not found.');
    }

    const siblings = getChildFolders(currentFolders, safeParent);
    const maxSort = siblings.reduce(
      (max, f) => Math.max(max, f.sortOrder ?? f.createdAt),
      0
    );
    const folder: Folder = {
      id: generateFolderId(),
      name: trimmed,
      createdAt: Date.now(),
      sortOrder: maxSort + 1000,
      ...(safeParent ? { parentId: safeParent } : {}),
    };
    const folders = ensureInbox([...currentFolders, folder]);
    // Persist gallery target in the same write so a refresh keeps the new tab;
    // also switch guests' localStorage gallery key immediately.
    await persistFolders(user, folders, folder.id);
    return { folder, folders };
  },

  /**
   * Rename an existing folder. Inbox is renameable too, so callers don't
   * need to special-case it; we only refuse empty names.
   */
  renameFolder: async (
    user: User | null,
    currentFolders: Folder[],
    folderId: string,
    nextName: string
  ): Promise<Folder[]> => {
    const trimmed = nextName.trim();
    if (!trimmed) throw new Error('Folder name is required.');
    if (!currentFolders.some(f => f.id === folderId)) {
      throw new Error('Folder not found.');
    }
    const folders = currentFolders.map(f =>
      f.id === folderId ? { ...f, name: trimmed } : f
    );
    await persistFolders(user, folders);
    return folders;
  },

  /**
   * Remove a folder. Refuses to delete Inbox. Callers are expected to
   * reassign any tiles still inside the deleted folder to Inbox via
   * `historyService.moveGenerationsToFolder` before/after this call.
   */
  deleteFolder: async (
    user: User | null,
    currentFolders: Folder[],
    folderId: string
  ): Promise<{ folders: Folder[] }> => {
    if (folderId === INBOX_FOLDER_ID) {
      throw new Error('Inbox cannot be deleted.');
    }
    if (!currentFolders.some(f => f.id === folderId)) {
      throw new Error('Folder not found.');
    }
    const deleted = currentFolders.find((f) => f.id === folderId);
    const reparentTo = deleted?.parentId;
    const removedSubtree = getDescendantFolderIds(currentFolders, folderId);
    removedSubtree.add(folderId);
    const folders = ensureInbox(
      currentFolders
        .filter((f) => f.id !== folderId)
        .map((f) => {
          if (f.parentId === folderId) {
            const next: Folder = { ...f };
            if (reparentTo) next.parentId = reparentTo;
            else delete next.parentId;
            return next;
          }
          return f;
        })
    );
    await persistFolders(user, folders);
    return { folders };
  },

  moveFolder: async (
    user: User | null,
    currentFolders: Folder[],
    folderId: string,
    newParentId: string | null
  ): Promise<Folder[]> => {
    if (folderId === INBOX_FOLDER_ID) {
      throw new Error('Inbox cannot be moved.');
    }
    if (!currentFolders.some((f) => f.id === folderId)) {
      throw new Error('Folder not found.');
    }
    const safeParent =
      newParentId && newParentId.length > 0
        ? sanitizeFolderParentId(newParentId, folderId, currentFolders)
        : undefined;
    if (newParentId && newParentId.length > 0 && !safeParent) {
      throw new Error('Destination folder not found.');
    }
    if (wouldCreateFolderCycle(currentFolders, folderId, safeParent ?? null)) {
      throw new Error('Cannot move a folder into itself or its subfolders.');
    }
    const folders = currentFolders.map((f) => {
      if (f.id !== folderId) return f;
      const next: Folder = { ...f };
      if (safeParent) next.parentId = safeParent;
      else delete next.parentId;
      return next;
    });
    await persistFolders(user, folders);
    return folders;
  },

  /**
   * Reorder a folder among siblings of `referenceFolderId` (same parent).
   * Inbox stays first at the root. Nest into another folder via `moveFolder`.
   */
  reorderFolder: async (
    user: User | null,
    currentFolders: Folder[],
    folderId: string,
    referenceFolderId: string,
    position: 'before' | 'after'
  ): Promise<Folder[]> => {
    if (folderId === INBOX_FOLDER_ID) {
      throw new Error('Inbox cannot be moved.');
    }
    if (folderId === referenceFolderId) {
      throw new Error('Cannot reorder a folder relative to itself.');
    }
    const moving = currentFolders.find((f) => f.id === folderId);
    const reference = currentFolders.find((f) => f.id === referenceFolderId);
    if (!moving || !reference) {
      throw new Error('Folder not found.');
    }
    const descendants = getDescendantFolderIds(currentFolders, folderId);
    if (descendants.has(referenceFolderId)) {
      throw new Error('Cannot move a folder into itself or its subfolders.');
    }

    const targetParentId = reference.parentId;
    let siblings = getChildFolders(currentFolders, targetParentId).filter(
      (f) => f.id !== folderId
    );
    const refIndex = siblings.findIndex((f) => f.id === referenceFolderId);
    if (refIndex < 0) {
      throw new Error('Reference folder not found among siblings.');
    }

    let insertIndex = position === 'before' ? refIndex : refIndex + 1;

    if (!targetParentId) {
      const inboxIndex = siblings.findIndex((f) => f.id === INBOX_FOLDER_ID);
      if (inboxIndex >= 0) {
        if (position === 'before' && referenceFolderId === INBOX_FOLDER_ID) {
          insertIndex = inboxIndex + 1;
        }
        insertIndex = Math.max(insertIndex, inboxIndex + 1);
      }
    }

    const ordered: Folder[] = [
      ...siblings.slice(0, insertIndex),
      moving,
      ...siblings.slice(insertIndex),
    ];

    const sortById = new Map<string, number>();
    ordered.forEach((f, index) => {
      sortById.set(f.id, (index + 1) * 1000);
    });

    const folders = currentFolders.map((f) => {
      const nextSort = sortById.get(f.id);
      if (f.id === folderId) {
        const next: Folder = { ...f, sortOrder: sortById.get(folderId) };
        if (targetParentId) next.parentId = targetParentId;
        else delete next.parentId;
        return next;
      }
      if (nextSort !== undefined) {
        return { ...f, sortOrder: nextSort };
      }
      return f;
    });

    await persistFolders(user, folders);
    return folders;
  },

  setFolderInstructions: async (
    user: User | null,
    currentFolders: Folder[],
    folderId: string,
    customInstructions: string
  ): Promise<Folder[]> => {
    if (!currentFolders.some((f) => f.id === folderId)) {
      throw new Error('Folder not found.');
    }
    const trimmed = customInstructions.trim().slice(0, MAX_FOLDER_INSTRUCTIONS);
    const folders = currentFolders.map((f) => {
      if (f.id !== folderId) return f;
      const next: Folder = { ...f };
      if (trimmed.length > 0) next.customInstructions = trimmed;
      else delete next.customInstructions;
      return next;
    });
    await persistFolders(user, folders);
    return folders;
  },

  setFolderUseFolderPresets: async (
    user: User | null,
    currentFolders: Folder[],
    folderId: string,
    useFolderPresets: boolean
  ): Promise<Folder[]> => {
    if (!currentFolders.some((f) => f.id === folderId)) {
      throw new Error('Folder not found.');
    }
    const folders = currentFolders.map((f) => {
      if (f.id !== folderId) return f;
      const next: Folder = { ...f };
      if (useFolderPresets) next.useFolderPresets = true;
      else delete next.useFolderPresets;
      return next;
    });
    await persistFolders(user, folders);
    return folders;
  },

  saveFolderPreset: async (
    user: User | null,
    currentFolders: Folder[],
    folderId: string,
    name: string,
    snapshot: Omit<ToolbarPreset, 'id' | 'name' | 'createdAt'>
  ): Promise<{ preset: ToolbarPreset; folders: Folder[] }> => {
    const trimmedName = name.trim();
    if (!trimmedName) throw new Error('Preset name is required.');
    const target = currentFolders.find((f) => f.id === folderId);
    if (!target) throw new Error('Folder not found.');

    const preset: ToolbarPreset = {
      id: generatePresetId(),
      name: trimmedName,
      createdAt: Date.now(),
      ...snapshot,
    };
    const existing = target.presets || [];
    if (existing.length >= MAX_FOLDER_PRESETS) {
      throw new Error(`This folder can store at most ${MAX_FOLDER_PRESETS} presets.`);
    }
    const folders = currentFolders.map((f) => {
      if (f.id !== folderId) return f;
      return { ...f, presets: [...existing, preset], useFolderPresets: true };
    });
    await persistFolders(user, folders);
    return { preset, folders };
  },

  updateFolderPreset: async (
    user: User | null,
    currentFolders: Folder[],
    folderId: string,
    presetId: string,
    updates: Partial<Omit<ToolbarPreset, 'id' | 'createdAt'>>
  ): Promise<Folder[]> => {
    const target = currentFolders.find((f) => f.id === folderId);
    if (!target) throw new Error('Folder not found.');
    const existing = target.presets || [];
    if (!existing.some((p) => p.id === presetId)) {
      throw new Error('Preset not found.');
    }
    const folders = currentFolders.map((f) => {
      if (f.id !== folderId) return f;
      const presets = (f.presets || []).map((p) =>
        p.id === presetId
          ? {
              ...p,
              ...updates,
              id: p.id,
              createdAt: p.createdAt,
              name: (updates.name ?? p.name).trim() || p.name,
            }
          : p
      );
      return { ...f, presets };
    });
    await persistFolders(user, folders);
    return folders;
  },

  deleteFolderPreset: async (
    user: User | null,
    currentFolders: Folder[],
    folderId: string,
    presetId: string
  ): Promise<Folder[]> => {
    const target = currentFolders.find((f) => f.id === folderId);
    if (!target) throw new Error('Folder not found.');
    const folders = currentFolders.map((f) => {
      if (f.id !== folderId) return f;
      const presets = (f.presets || []).filter((p) => p.id !== presetId);
      const next: Folder = { ...f, presets };
      if (presets.length === 0) delete next.presets;
      return next;
    });
    await persistFolders(user, folders);
    return folders;
  },

  /** Child folder ids plus tiles in this folder only (not nested). */
  listFolderContents: (folders: Folder[], folderId: string) => ({
    childFolders: getChildFolders(folders, folderId),
    descendantFolderIds: getDescendantFolderIds(folders, folderId),
  }),
};

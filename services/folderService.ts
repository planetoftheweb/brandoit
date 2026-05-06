import { Folder, INBOX_FOLDER_ID, User, UserPreferences } from "../types";
import { authService } from "./authService";

/**
 * Manages user-owned folders that group generation tiles. Folders persist
 * on the user document for signed-in users (under
 * `preferences.folders` / `preferences.activeFolderId`) and in localStorage
 * for guests so the gallery looks the same before and after sign-in.
 *
 * Every Generation belongs to exactly one folder; missing/legacy items are
 * normalized into the always-present "Inbox" by `historyService`. Inbox is
 * renameable but undeletable.
 */

const FOLDERS_LOCAL_KEY = 'brandoit_folders_v1';
const ACTIVE_FOLDER_LOCAL_KEY = 'brandoit_active_folder_v1';
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

const sanitizeFolder = (raw: any): Folder | null => {
  if (!raw || typeof raw.id !== 'string' || typeof raw.name !== 'string') return null;
  const trimmedName = raw.name.trim();
  if (!trimmedName) return null;
  return {
    id: raw.id,
    name: trimmedName,
    createdAt: typeof raw.createdAt === 'number' ? raw.createdAt : Date.now()
  };
};

const readLocalFolders = (): Folder[] => {
  try {
    const raw = localStorage.getItem(FOLDERS_LOCAL_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map(sanitizeFolder)
      .filter((f): f is Folder => f !== null);
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

const readLocalActiveFolderId = (): string | undefined => {
  try {
    const raw = localStorage.getItem(ACTIVE_FOLDER_LOCAL_KEY);
    return raw && raw.length > 0 ? raw : undefined;
  } catch {
    return undefined;
  }
};

const writeLocalActiveFolderId = (id: string | null | undefined) => {
  try {
    if (id) localStorage.setItem(ACTIVE_FOLDER_LOCAL_KEY, id);
    else localStorage.removeItem(ACTIVE_FOLDER_LOCAL_KEY);
  } catch (err) {
    console.warn('[folderService] Failed to persist active folder locally:', err);
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
  nextActiveFolderId: string | undefined
): UserPreferences => ({
  ...user.preferences,
  folders: nextFolders,
  activeFolderId: nextActiveFolderId
});

/**
 * Persist a folder list (and the optional sticky active folder) for the
 * current actor. Centralizing the write makes it easy to keep guest +
 * signed-in flows in sync — every mutation goes through this helper.
 */
const persistFolders = async (
  user: User | null,
  folders: Folder[],
  activeFolderId: string | undefined
): Promise<void> => {
  if (user) {
    await authService.updateUserPreferences(
      user.id,
      buildNextPreferences(user, folders, activeFolderId)
    );
  } else {
    writeLocalFolders(folders);
    writeLocalActiveFolderId(activeFolderId);
  }
};

export interface FolderState {
  folders: Folder[];
  activeFolderId?: string;
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
        ? user.preferences.folders
            .map(sanitizeFolder)
            .filter((f): f is Folder => f !== null)
        : [];
      const folders = ensureInbox(stored);
      const activeFolderId =
        typeof user.preferences.activeFolderId === 'string'
          ? user.preferences.activeFolderId
          : undefined;

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
                activeFolderId,
                galleryViewFolderId: migrated
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
          await persistFolders(user, folders, activeFolderId);
        } catch (err) {
          console.warn('[folderService] Failed to seed Inbox for new user:', err);
        }
      }

      return { folders, activeFolderId, galleryViewFolderId };
    }

    const stored = readLocalFolders();
    const folders = ensureInbox(stored);
    if (stored.length === 0) writeLocalFolders(folders);
    const galleryViewFolderId = resolveGalleryViewFolderId(readLocalGalleryViewFolderId(), folders);
    return {
      folders,
      activeFolderId: readLocalActiveFolderId(),
      galleryViewFolderId
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
   * Append a new folder and make it the sticky default. Returns the new
   * folder along with the resulting list/active id so callers can update
   * local state in one shot.
   */
  createFolder: async (
    user: User | null,
    name: string,
    currentFolders: Folder[]
  ): Promise<{ folder: Folder; folders: Folder[]; activeFolderId: string }> => {
    const trimmed = name.trim();
    if (!trimmed) throw new Error('Folder name is required.');

    const folder: Folder = {
      id: generateFolderId(),
      name: trimmed,
      createdAt: Date.now()
    };
    const folders = ensureInbox([...currentFolders, folder]);
    await persistFolders(user, folders, folder.id);
    return { folder, folders, activeFolderId: folder.id };
  },

  /**
   * Rename an existing folder. Inbox is renameable too, so callers don't
   * need to special-case it; we only refuse empty names.
   */
  renameFolder: async (
    user: User | null,
    currentFolders: Folder[],
    activeFolderId: string | undefined,
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
    await persistFolders(user, folders, activeFolderId);
    return folders;
  },

  /**
   * Remove a folder. Refuses to delete Inbox. Callers are expected to
   * reassign any tiles still inside the deleted folder to Inbox via
   * `historyService.moveGenerationsToFolder` before/after this call.
   * Also clears the sticky pin if it pointed at the deleted folder.
   */
  deleteFolder: async (
    user: User | null,
    currentFolders: Folder[],
    activeFolderId: string | undefined,
    folderId: string
  ): Promise<{ folders: Folder[]; activeFolderId: string | undefined }> => {
    if (folderId === INBOX_FOLDER_ID) {
      throw new Error('Inbox cannot be deleted.');
    }
    if (!currentFolders.some(f => f.id === folderId)) {
      throw new Error('Folder not found.');
    }
    const folders = ensureInbox(currentFolders.filter(f => f.id !== folderId));
    const nextActive = activeFolderId === folderId ? undefined : activeFolderId;
    await persistFolders(user, folders, nextActive);
    return { folders, activeFolderId: nextActive };
  },

  /**
   * Pin (or clear) the sticky folder for new generations. Pass `null` to
   * clear the pin so new tiles fall back to Inbox.
   */
  setActiveFolder: async (
    user: User | null,
    currentFolders: Folder[],
    folderId: string | null
  ): Promise<string | undefined> => {
    const nextActive = folderId && folderId.length > 0 ? folderId : undefined;
    if (nextActive && !currentFolders.some(f => f.id === nextActive)) {
      throw new Error('Folder not found.');
    }
    await persistFolders(user, currentFolders, nextActive);
    return nextActive;
  }
};

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { User, WhatsNewEntry } from '../types';
import { WHATS_NEW } from '../data/whatsNew';

/**
 * localStorage key used for guest persistence. Bumping the `_v1` suffix
 * resets every guest's state — kept in case the shape ever changes.
 */
const GUEST_STORAGE_KEY = 'brandoit_whats_new_v1';

/** Query-string parameter for permalinking to a specific entry. */
const DEEP_LINK_PARAM = 'whatsnew';

interface GuestState {
  lastSeenWhatsNewId?: string;
  dismissedSpotlightIds?: string[];
}

const readGuestState = (): GuestState => {
  if (typeof window === 'undefined') return {};
  try {
    const raw = window.localStorage.getItem(GUEST_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return {};
    const dismissed = Array.isArray(parsed.dismissedSpotlightIds)
      ? parsed.dismissedSpotlightIds.filter(
          (id: unknown): id is string => typeof id === 'string' && id.length > 0
        )
      : [];
    return {
      lastSeenWhatsNewId:
        typeof parsed.lastSeenWhatsNewId === 'string' && parsed.lastSeenWhatsNewId.length > 0
          ? parsed.lastSeenWhatsNewId
          : undefined,
      dismissedSpotlightIds: dismissed,
    };
  } catch (err) {
    console.warn('[useWhatsNew] Failed to read guest state:', err);
    return {};
  }
};

const writeGuestState = (state: GuestState): void => {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(GUEST_STORAGE_KEY, JSON.stringify(state));
  } catch (err) {
    console.warn('[useWhatsNew] Failed to write guest state:', err);
  }
};

const readDeepLinkId = (): string | null => {
  if (typeof window === 'undefined') return null;
  try {
    const params = new URLSearchParams(window.location.search);
    const id = params.get(DEEP_LINK_PARAM);
    return id && id.length > 0 ? id : null;
  } catch {
    return null;
  }
};

const stripDeepLinkParam = (): void => {
  if (typeof window === 'undefined') return;
  try {
    const url = new URL(window.location.href);
    if (url.searchParams.has(DEEP_LINK_PARAM)) {
      url.searchParams.delete(DEEP_LINK_PARAM);
      window.history.replaceState({}, '', url.toString());
    }
  } catch {
    /* ignore */
  }
};

export interface UseWhatsNewOptions {
  user: User | null;
  /**
   * Persist signed-in updates. Should mirror the existing pattern in
   * `App.tsx`: update local user state synchronously, then write to
   * Firestore via `authService.updateUserPreferences`. Errors are the
   * caller's responsibility.
   */
  onPersistSignedIn: (patch: Partial<User['preferences']>) => void;
  /**
   * True once the auth layer has reported in at least once (signed-in
   * user resolved or confirmed guest). While false, `user` is `null`
   * because the session is still being restored from Firebase — not
   * because the visitor is genuinely a guest. Without this gate, signed-in
   * users who already dismissed the spotlight or read the latest entry
   * see a brief flash of the spotlight modal and unread bell badge on
   * every page reload, because `useWhatsNew` falls back to empty guest
   * `localStorage` state during the resolution window. Default `true`
   * keeps the hook usable in contexts (tests, storybook) that don't
   * thread auth state through.
   */
  isAuthResolved?: boolean;
}

export interface UseWhatsNewResult {
  /** All entries sorted descending by `publishedAt`. */
  entries: WhatsNewEntry[];
  /** Number of entries newer than `lastSeenWhatsNewId`. 0 means everything seen. */
  unreadCount: number;
  /** Set of entry ids the user has not yet acknowledged. Drives the "NEW" tag for the session. */
  unseenIds: Set<string>;
  /** Featured entry awaiting spotlight, if any. Null when there's nothing to spotlight. */
  spotlightEntry: WhatsNewEntry | null;
  /** True iff `spotlightEntry` is non-null. */
  isSpotlightPending: boolean;
  /** Open state of the bell dropdown. */
  isBellOpen: boolean;
  /** Entry id from `?whatsnew=` that should be scrolled into view in the bell, then cleared. */
  focusedEntryId: string | null;
  /** Open the bell dropdown. Does NOT mark anything as seen — opening
   *  the bell is a preview action; the badge should only clear when the
   *  user actually engages with content (clicks an entry to read it or
   *  opens the full What's New page). */
  openBell: () => void;
  /** Close the bell without changing seen state. */
  closeBell: () => void;
  /** Mark all entries as seen (sets `lastSeenWhatsNewId` to the newest).
   *  Called once the user has actually engaged with the content. */
  markAllAsSeen: () => void;
  /** Dismiss the spotlight modal (records the id so it never re-fires). */
  dismissSpotlight: (id: string) => void;
  /** Convenience: from the spotlight, jump straight to the bell view. */
  openBellFromSpotlight: (id: string) => void;
  /** Clear the deep-link focus once the bell has scrolled to it. */
  clearFocusedEntry: () => void;
}

const sortByNewest = (entries: WhatsNewEntry[]): WhatsNewEntry[] =>
  [...entries].sort((a, b) => b.publishedAt - a.publishedAt);

export const useWhatsNew = ({
  user,
  onPersistSignedIn,
  isAuthResolved = true,
}: UseWhatsNewOptions): UseWhatsNewResult => {
  const entries = useMemo(() => sortByNewest(WHATS_NEW), []);
  const newestId = entries[0]?.id;

  const [guestState, setGuestState] = useState<GuestState>(() => readGuestState());

  const lastSeenWhatsNewId = user
    ? user.preferences.lastSeenWhatsNewId
    : guestState.lastSeenWhatsNewId;

  const dismissedSpotlightIds = useMemo<string[]>(() => {
    const list = user ? user.preferences.dismissedSpotlightIds : guestState.dismissedSpotlightIds;
    return Array.isArray(list) ? list : [];
  }, [user, guestState.dismissedSpotlightIds]);

  // Snapshot of which ids were unseen at the time the user opened the bell.
  // Keeps the "NEW" tag visible until the next session even after we record
  // lastSeenWhatsNewId — otherwise the badge clears and the user can't tell
  // which entry was the new one they just popped open the bell to read.
  const [sessionUnseenIds] = useState<Set<string>>(() => {
    if (!lastSeenWhatsNewId) {
      // First-ever visit: everything is technically new, but flagging all of
      // them as NEW the first time would be noisy. Treat first-load as a
      // soft baseline where only the newest entry gets the badge.
      return newestId ? new Set([newestId]) : new Set();
    }
    const set = new Set<string>();
    for (const entry of entries) {
      if (entry.id === lastSeenWhatsNewId) break;
      set.add(entry.id);
    }
    return set;
  });

  const unreadCount = useMemo(() => {
    // Stay silent until auth has resolved — otherwise signed-in users who
    // have already read everything see the bell badge briefly flicker to
    // "1" on reload while we're still hydrating their preferences from
    // Firestore. See `isAuthResolved` doc on `UseWhatsNewOptions`.
    if (!isAuthResolved) return 0;
    if (!lastSeenWhatsNewId) {
      // First-time visitor — show a single-dot badge for the newest entry
      // rather than counting the entire backlog.
      return entries.length > 0 ? 1 : 0;
    }
    let count = 0;
    for (const entry of entries) {
      if (entry.id === lastSeenWhatsNewId) break;
      count += 1;
    }
    return count;
  }, [entries, lastSeenWhatsNewId, isAuthResolved]);

  const spotlightEntry = useMemo<WhatsNewEntry | null>(() => {
    // Same flash-prevention gate as `unreadCount`: if a signed-in user has
    // already dismissed this spotlight, we don't want the modal to render
    // for the half-second between mount and the auth listener firing with
    // their hydrated preferences.
    if (!isAuthResolved) return null;
    const newestFeatured = entries.find((entry) => entry.featured === true);
    if (!newestFeatured) return null;
    if (dismissedSpotlightIds.includes(newestFeatured.id)) return null;
    return newestFeatured;
  }, [entries, dismissedSpotlightIds, isAuthResolved]);

  const [isBellOpen, setIsBellOpen] = useState(false);
  const [focusedEntryId, setFocusedEntryId] = useState<string | null>(null);

  // Resolve any ?whatsnew=<id> deep link once on mount. If the id matches
  // a known entry, open the bell focused on it. Always strip the param
  // afterwards so refresh / share-back doesn't re-trigger.
  useEffect(() => {
    const linkedId = readDeepLinkId();
    if (linkedId) {
      const exists = entries.some((entry) => entry.id === linkedId);
      if (exists) {
        setFocusedEntryId(linkedId);
        setIsBellOpen(true);
      }
      stripDeepLinkParam();
    }
  }, [entries]);

  const persistLastSeen = useCallback(
    (id: string) => {
      if (user) {
        onPersistSignedIn({ lastSeenWhatsNewId: id });
      } else {
        setGuestState((prev) => {
          const next = { ...prev, lastSeenWhatsNewId: id };
          writeGuestState(next);
          return next;
        });
      }
    },
    [user, onPersistSignedIn]
  );

  const persistDismissedSpotlight = useCallback(
    (id: string) => {
      if (user) {
        const next = Array.from(new Set([...(dismissedSpotlightIds || []), id]));
        onPersistSignedIn({ dismissedSpotlightIds: next });
      } else {
        setGuestState((prev) => {
          const next: GuestState = {
            ...prev,
            dismissedSpotlightIds: Array.from(
              new Set([...(prev.dismissedSpotlightIds || []), id])
            ),
          };
          writeGuestState(next);
          return next;
        });
      }
    },
    [user, dismissedSpotlightIds, onPersistSignedIn]
  );

  // Open is purely a UI action now — no side effect on lastSeenWhatsNewId.
  // Previously this auto-cleared the badge on first click, which made the
  // count never appear for returning users who'd previously opened the
  // bell (the very feedback signal the badge exists to provide).
  const openBell = useCallback(() => {
    setIsBellOpen(true);
  }, []);

  const closeBell = useCallback(() => {
    setIsBellOpen(false);
    setFocusedEntryId(null);
  }, []);

  // Engagement signal — called from App.tsx's `openWhatsNewPage` so any
  // click-through (bell row, "View all updates" footer, or spotlight's
  // "Read the guide") clears the badge in one place. Idempotent and a
  // no-op when already up to date.
  const markAllAsSeen = useCallback(() => {
    if (newestId && newestId !== lastSeenWhatsNewId) {
      persistLastSeen(newestId);
    }
  }, [newestId, lastSeenWhatsNewId, persistLastSeen]);

  const dismissSpotlight = useCallback(
    (id: string) => {
      persistDismissedSpotlight(id);
    },
    [persistDismissedSpotlight]
  );

  const openBellFromSpotlight = useCallback(
    (id: string) => {
      persistDismissedSpotlight(id);
      setFocusedEntryId(id);
      setIsBellOpen(true);
    },
    [persistDismissedSpotlight]
  );

  const clearFocusedEntry = useCallback(() => {
    setFocusedEntryId(null);
  }, []);

  return {
    entries,
    unreadCount,
    unseenIds: sessionUnseenIds,
    spotlightEntry,
    isSpotlightPending: spotlightEntry !== null,
    isBellOpen,
    focusedEntryId,
    openBell,
    closeBell,
    markAllAsSeen,
    dismissSpotlight,
    openBellFromSpotlight,
    clearFocusedEntry,
  };
};

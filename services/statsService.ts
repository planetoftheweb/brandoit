import {
  collectionGroup,
  getDocs,
  getCountFromServer,
  collection,
  query,
  orderBy,
  limit as limitFn,
} from "firebase/firestore";
import { db } from "./firebase";
import { resourceService } from "./resourceService";
import { SUPPORTED_MODELS } from "../constants";

// -----------------------------------------------------------------------------
// Types
// -----------------------------------------------------------------------------

export interface StatsBucketEntry {
  key: string;
  label: string;
  count: number;
}

export interface StatsDailyEntry {
  /** YYYY-MM-DD, local time. */
  date: string;
  images: number;
  refinements: number;
}

export interface StatsSignupDaily {
  date: string;
  signups: number;
}

export interface StatsTopUser {
  uid: string;
  name: string;
  email: string;
  username?: string;
  photoURL?: string;
  images: number;
  refinements: number;
  tiles: number;
}

export interface AdminStats {
  /** Wall-clock when the snapshot was built, for a "computed N seconds ago" label. */
  generatedAt: number;

  /** How long it took to aggregate, ms. */
  durationMs: number;

  /** How many history documents were scanned. */
  scannedHistoryDocs: number;

  users: {
    total: number;
    /** Users with isDisabled === true. */
    disabled: number;
    /** Users we can identify as admins from persisted signals
     *  (the bootstrap username OR anyone who's done the bootstrap claim.
     *  Exact admin-claim truth lives in Firebase Auth custom claims,
     *  which are not queryable from the client; this is a best-effort signal.) */
    legacyAdminSignals: number;
    /** Users with a lastSignInAt within the last 7 days. */
    activeLast7d: number;
    /** Users with a lastSignInAt within the last 30 days. */
    activeLast30d: number;
    /** Users with at least one API key saved (Gemini or OpenAI). */
    withApiKey: number;
    /** Signups per day over the last 30 days (chronological). */
    signupsLast30Days: StatsSignupDaily[];
  };

  generations: {
    /** # of history documents (tiles). */
    totalTiles: number;
    /** Sum of `versions.filter(v => v.type === 'generation').length`. */
    totalImages: number;
    /** Sum of `versions.filter(v => v.type === 'refinement').length`. */
    totalRefinements: number;
    /** Chronological, last 30 days (images AND refinements per day). */
    perDayLast30: StatsDailyEntry[];
    byModel: StatsBucketEntry[];
    byGraphicType: StatsBucketEntry[];
    byVisualStyle: StatsBucketEntry[];
    byAspectRatio: StatsBucketEntry[];
    /** Top N users by image count, with name/email resolved from `users/`. */
    topUsers: StatsTopUser[];
  };
}

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

const DAY_MS = 86_400_000;

/** YYYY-MM-DD for a Date in the viewer's local timezone. */
function dayKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Returns [oldest, ..., today] — `count` consecutive local-day keys. */
function lastNDays(count: number): string[] {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const out: string[] = [];
  for (let i = count - 1; i >= 0; i--) {
    out.push(dayKey(new Date(today.getTime() - i * DAY_MS)));
  }
  return out;
}

/** Coerce any of our stored timestamp shapes into a ms epoch. */
function coerceMs(value: any): number | null {
  if (value == null) return null;
  if (typeof value === "number" && isFinite(value)) return value;
  if (typeof value === "string") {
    const n = Date.parse(value);
    return isFinite(n) ? n : null;
  }
  if (typeof value === "object") {
    // Firestore Timestamp
    if (typeof value.toMillis === "function") {
      try {
        return value.toMillis();
      } catch {
        // fallthrough
      }
    }
    if (typeof value.seconds === "number") {
      return value.seconds * 1000 + Math.floor((value.nanoseconds ?? 0) / 1_000_000);
    }
  }
  return null;
}

/** Stable sort a bucket map -> [{key, label, count}] desc by count. */
function bucketToSortedEntries(
  map: Map<string, { label: string; count: number }>,
  max?: number
): StatsBucketEntry[] {
  const arr = Array.from(map.entries()).map(([key, v]) => ({
    key,
    label: v.label,
    count: v.count,
  }));
  arr.sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
  return typeof max === "number" ? arr.slice(0, max) : arr;
}

function addBucket(
  map: Map<string, { label: string; count: number }>,
  key: string,
  label: string,
  n = 1
) {
  const existing = map.get(key);
  if (existing) {
    existing.count += n;
    // If we later discover a better label, keep the first non-empty one.
    if (!existing.label && label) existing.label = label;
  } else {
    map.set(key, { label: label || key, count: n });
  }
}

/** Prettify a known model id using the SUPPORTED_MODELS registry. */
function modelLabel(id: string): string {
  const byId = SUPPORTED_MODELS.find((m) => m.id === id);
  return byId?.name || id || "Unknown";
}

// -----------------------------------------------------------------------------
// Public API
// -----------------------------------------------------------------------------

export const statsService = {
  /**
   * Build a single admin usage-stats snapshot.
   *
   * Under the hood:
   *   1. Loads all `users/*` docs (for user counts + name/email lookup).
   *   2. Runs one `collectionGroup('history')` query across every user's
   *      history subcollection.
   *   3. Loads the catalog (`graphic_types`, `visual_styles`, `aspect_ratios`)
   *      to turn IDs in history config into human labels.
   *   4. Aggregates in memory.
   *
   * Admin-only at the security-rules level:
   *   - `match /{path=**}/history/{docId} { allow read: if isAdmin(); }`
   *   - `match /users/{uid} { allow list: if isAdmin(); }`
   *
   * For projects with tens of thousands of history docs this becomes slow
   * and expensive — at that point we'd pre-aggregate with a scheduled
   * Cloud Function. For now, live computation is fine.
   */
  async getStats(opts: { topUsersLimit?: number } = {}): Promise<AdminStats> {
    const topUsersLimit = opts.topUsersLimit ?? 10;
    const startedAt = Date.now();

    // --- 1. Users ---------------------------------------------------------
    // Pull all user docs so we can resolve uid -> name/email for the
    // leaderboard AND compute user-level stats (admins, active, etc.).
    const usersSnap = await getDocs(collection(db, "users"));
    const userById = new Map<string, any>();
    usersSnap.forEach((d) => userById.set(d.id, d.data() || {}));

    const now = Date.now();
    const sevenDaysAgo = now - 7 * DAY_MS;
    const thirtyDaysAgo = now - 30 * DAY_MS;

    let disabled = 0;
    let legacyAdminSignals = 0;
    let activeLast7d = 0;
    let activeLast30d = 0;
    let withApiKey = 0;
    const signupDayTotals = new Map<string, number>();

    userById.forEach((data) => {
      if (data?.isDisabled === true) disabled += 1;
      if (data?.username === "planetoftheweb") legacyAdminSignals += 1;

      const last = coerceMs(data?.lastSignInAt);
      if (last != null) {
        if (last >= sevenDaysAgo) activeLast7d += 1;
        if (last >= thirtyDaysAgo) activeLast30d += 1;
      }

      const keys = data?.preferences?.apiKeys ?? {};
      const hasGemini = typeof keys?.gemini === "string" && keys.gemini.trim().length > 0;
      const hasLegacyGemini =
        typeof data?.preferences?.geminiApiKey === "string" &&
        data.preferences.geminiApiKey.trim().length > 0;
      const hasOpenAI = typeof keys?.openai === "string" && keys.openai.trim().length > 0;
      if (hasGemini || hasLegacyGemini || hasOpenAI) withApiKey += 1;

      const createdMs = coerceMs(data?.createdAt);
      if (createdMs != null && createdMs >= thirtyDaysAgo) {
        const key = dayKey(new Date(createdMs));
        signupDayTotals.set(key, (signupDayTotals.get(key) ?? 0) + 1);
      }
    });

    const signupSeries: StatsSignupDaily[] = lastNDays(30).map((date) => ({
      date,
      signups: signupDayTotals.get(date) ?? 0,
    }));

    // --- 2. Catalog labels ------------------------------------------------
    // Resolve IDs (like "logo", "neon-glow", "16-9") into readable labels.
    // Fall back to the ID itself if the catalog lookup misses.
    const catalog = await resourceService.getAllResources();

    const graphicTypeLabels = new Map<string, string>();
    catalog.graphicTypes?.forEach((g: any) =>
      graphicTypeLabels.set(g.id, g.name || g.label || g.id)
    );
    const visualStyleLabels = new Map<string, string>();
    catalog.visualStyles?.forEach((s: any) =>
      visualStyleLabels.set(s.id, s.name || s.label || s.id)
    );
    const aspectRatioLabels = new Map<string, string>();
    catalog.aspectRatios?.forEach((a: any) =>
      aspectRatioLabels.set(a.id, a.name || a.label || a.id)
    );

    // --- 3. History (collectionGroup) ------------------------------------
    const historySnap = await getDocs(collectionGroup(db, "history"));

    let totalTiles = 0;
    let totalImages = 0;
    let totalRefinements = 0;

    const byModel = new Map<string, { label: string; count: number }>();
    const byGraphicType = new Map<string, { label: string; count: number }>();
    const byVisualStyle = new Map<string, { label: string; count: number }>();
    const byAspectRatio = new Map<string, { label: string; count: number }>();

    const dailyImages = new Map<string, number>();
    const dailyRefinements = new Map<string, number>();

    /** uid -> counts. uid lives in the doc path: users/{uid}/history/{docId}. */
    const perUser = new Map<
      string,
      { images: number; refinements: number; tiles: number }
    >();

    historySnap.forEach((snap) => {
      totalTiles += 1;

      // Parent doc id is the user id (path: users/{uid}/history/{docId}).
      const uid =
        snap.ref.parent?.parent?.id ||
        // Defensive fallback if Firestore ever changes the ref shape.
        "unknown";

      const data = snap.data() as any;
      const versions: any[] = Array.isArray(data?.versions) ? data.versions : [];

      const tileCreated = coerceMs(data?.createdAt) ?? Date.now();

      // Per-tile breakdowns (model / graphicType / style / aspectRatio):
      // attribute 1 count per tile, not per-version, so they reflect
      // "tiles generated with X" rather than over-counting batch tiles.
      const modelId = data?.modelId || "unknown";
      addBucket(byModel, modelId, modelLabel(modelId), 1);

      const cfg = data?.config || {};
      if (cfg.graphicTypeId) {
        addBucket(
          byGraphicType,
          cfg.graphicTypeId,
          graphicTypeLabels.get(cfg.graphicTypeId) || cfg.graphicTypeId,
          1
        );
      }
      if (cfg.visualStyleId) {
        addBucket(
          byVisualStyle,
          cfg.visualStyleId,
          visualStyleLabels.get(cfg.visualStyleId) || cfg.visualStyleId,
          1
        );
      }
      if (cfg.aspectRatio) {
        addBucket(
          byAspectRatio,
          cfg.aspectRatio,
          aspectRatioLabels.get(cfg.aspectRatio) || cfg.aspectRatio,
          1
        );
      }

      // Per-version counts: this is where "total images generated" comes from.
      let tileImages = 0;
      let tileRefinements = 0;

      for (const v of versions) {
        const ts = coerceMs(v?.timestamp) ?? tileCreated;
        const day = dayKey(new Date(ts));
        const isGen = v?.type === "generation";
        const isRef = v?.type === "refinement";
        if (isGen) {
          totalImages += 1;
          tileImages += 1;
          dailyImages.set(day, (dailyImages.get(day) ?? 0) + 1);
        } else if (isRef) {
          totalRefinements += 1;
          tileRefinements += 1;
          dailyRefinements.set(day, (dailyRefinements.get(day) ?? 0) + 1);
        }
      }

      const current = perUser.get(uid) ?? { images: 0, refinements: 0, tiles: 0 };
      current.images += tileImages;
      current.refinements += tileRefinements;
      current.tiles += 1;
      perUser.set(uid, current);
    });

    // --- 4. Assemble series / leaderboard -------------------------------
    const perDayLast30: StatsDailyEntry[] = lastNDays(30).map((date) => ({
      date,
      images: dailyImages.get(date) ?? 0,
      refinements: dailyRefinements.get(date) ?? 0,
    }));

    const topUsers: StatsTopUser[] = Array.from(perUser.entries())
      .map(([uid, counts]) => {
        const u = userById.get(uid) ?? {};
        return {
          uid,
          name: u?.name || "(unnamed)",
          email: u?.email || "",
          username: u?.username,
          photoURL: u?.photoURL,
          images: counts.images,
          refinements: counts.refinements,
          tiles: counts.tiles,
        };
      })
      .sort((a, b) => b.images - a.images || b.refinements - a.refinements)
      .slice(0, topUsersLimit);

    return {
      generatedAt: Date.now(),
      durationMs: Date.now() - startedAt,
      scannedHistoryDocs: totalTiles,
      users: {
        total: userById.size,
        disabled,
        legacyAdminSignals,
        activeLast7d,
        activeLast30d,
        withApiKey,
        signupsLast30Days: signupSeries,
      },
      generations: {
        totalTiles,
        totalImages,
        totalRefinements,
        perDayLast30,
        byModel: bucketToSortedEntries(byModel),
        byGraphicType: bucketToSortedEntries(byGraphicType, 10),
        byVisualStyle: bucketToSortedEntries(byVisualStyle, 10),
        byAspectRatio: bucketToSortedEntries(byAspectRatio, 10),
        topUsers,
      },
    };
  },

  /** Cheap health probe — just the two top-level counts with server-side aggregates. */
  async getQuickCounts(): Promise<{ users: number; historyTiles: number }> {
    const [usersSnap, historySnap] = await Promise.all([
      getCountFromServer(collection(db, "users")),
      getCountFromServer(collectionGroup(db, "history")),
    ]);
    return {
      users: usersSnap.data().count ?? 0,
      historyTiles: historySnap.data().count ?? 0,
    };
  },

  /**
   * Sample of the most recently-created history tiles across all users.
   * Used as a fallback/preview when the full stats load is too slow.
   */
  async recentHistorySample(n = 50) {
    const q = query(collectionGroup(db, "history"), orderBy("createdAt", "desc"), limitFn(n));
    const snap = await getDocs(q);
    return snap.docs.map((d) => ({
      uid: d.ref.parent?.parent?.id || "unknown",
      id: d.id,
      ...(d.data() as any),
    }));
  },
};

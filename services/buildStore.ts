// Local persistence for image "builds" (reveal animations). Stored in
// localStorage keyed by generationId|versionId so a build survives reloads and
// can be re-edited. Local-only by design for v1 (no Firestore schema churn);
// the payload is tiny JSON (a handful of normalized rects + settings).

import type { ImageBuild, BuildStep, BuildPoint, BuildShape } from '../types';
import { defaultBuild } from './buildAnimator';

const STORAGE_KEY = 'brandoit.builds.v1';

const isBrowser = (): boolean =>
  typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';

const keyFor = (generationId: string, versionId: string): string =>
  `${generationId}|${versionId}`;

type BuildMap = Record<string, ImageBuild>;

const readAll = (): BuildMap => {
  if (!isBrowser()) return {};
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? (parsed as BuildMap) : {};
  } catch {
    return {};
  }
};

const writeAll = (map: BuildMap): void => {
  if (!isBrowser()) return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
  } catch (err) {
    // Quota or serialization failure — non-fatal; the build just won't persist.
    console.warn('[buildStore] failed to persist build:', err);
  }
};

const isPoint = (p: unknown): p is BuildPoint =>
  !!p && typeof (p as BuildPoint).x === 'number' && typeof (p as BuildPoint).y === 'number';

/** Coerce a stored step into a polygon step (converting legacy rect steps). */
const normalizeShape = (raw: unknown): BuildShape | null => {
  if (!raw || typeof raw !== 'object') return null;
  const s = raw as { kind?: unknown; op?: unknown; points?: unknown; radius?: unknown };
  const op: 'add' | 'sub' = s.op === 'sub' ? 'sub' : 'add';
  const points = Array.isArray(s.points) ? s.points.filter(isPoint) : [];
  if (s.kind === 'brush') {
    if (points.length < 1) return null;
    const radius = typeof s.radius === 'number' && s.radius > 0 ? s.radius : 0.03;
    return { kind: 'brush', op, points, radius };
  }
  // Default to polygon.
  if (points.length < 3) return null;
  return { kind: 'poly', op, points };
};

const normalizeStep = (raw: unknown): BuildStep | null => {
  if (!raw || typeof raw !== 'object') return null;
  const s = raw as {
    id?: unknown;
    shapes?: unknown;
    points?: unknown;
    rect?: { x: number; y: number; w: number; h: number };
    durationMs?: unknown;
    zoomFrom?: unknown;
  };
  const id = typeof s.id === 'string' ? s.id : null;
  if (!id) return null;
  const extra: Pick<BuildStep, 'durationMs' | 'zoomFrom'> = {};
  if (typeof s.durationMs === 'number') extra.durationMs = s.durationMs;
  if (s.zoomFrom === 'smart' || s.zoomFrom === 'center') extra.zoomFrom = s.zoomFrom;

  // Current format: shapes[].
  if (Array.isArray(s.shapes)) {
    const shapes = s.shapes.map(normalizeShape).filter((x): x is BuildShape => x !== null);
    if (shapes.length) return { id, shapes, ...extra };
    return null;
  }
  // Legacy: a single polygon (points) → one additive poly shape.
  if (Array.isArray(s.points) && s.points.filter(isPoint).length >= 3) {
    return { id, shapes: [{ kind: 'poly', op: 'add', points: s.points.filter(isPoint) }], ...extra };
  }
  // Legacy: a rect → additive poly shape.
  const r = s.rect;
  if (r && typeof r.x === 'number' && typeof r.w === 'number') {
    return {
      id,
      shapes: [{
        kind: 'poly', op: 'add',
        points: [
          { x: r.x, y: r.y }, { x: r.x + r.w, y: r.y },
          { x: r.x + r.w, y: r.y + r.h }, { x: r.x, y: r.y + r.h },
        ],
      }],
      ...extra,
    };
  }
  return null;
};

/** Coerce a stored value into a valid ImageBuild, filling any missing fields. */
const normalize = (value: unknown): ImageBuild => {
  const base = defaultBuild();
  if (!value || typeof value !== 'object') return base;
  const v = value as Partial<ImageBuild>;
  const steps = Array.isArray(v.steps)
    ? v.steps.map(normalizeStep).filter((s): s is BuildStep => s !== null)
    : [];
  return {
    ...base,
    ...v,
    steps,
  } as ImageBuild;
};

export const loadBuild = (generationId: string, versionId: string): ImageBuild | null => {
  const all = readAll();
  const found = all[keyFor(generationId, versionId)];
  return found ? normalize(found) : null;
};

export const saveBuild = (
  generationId: string,
  versionId: string,
  build: ImageBuild
): void => {
  const all = readAll();
  all[keyFor(generationId, versionId)] = build;
  writeAll(all);
};

export const deleteBuild = (generationId: string, versionId: string): void => {
  const all = readAll();
  delete all[keyFor(generationId, versionId)];
  writeAll(all);
};

export const hasBuild = (generationId: string, versionId: string): boolean =>
  !!readAll()[keyFor(generationId, versionId)];

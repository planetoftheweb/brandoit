import { ASPECT_RATIOS } from '../constants';
import { AspectRatioOption } from '../types';

// Gemini natively supports exactly these 10 ratios (documented by Google).
export const GEMINI_ALLOWED_ASPECT_RATIOS = [
  '1:1',
  '2:3',
  '3:2',
  '3:4',
  '4:3',
  '4:5',
  '5:4',
  '9:16',
  '16:9',
  '21:9'
] as const;

// OpenAI gpt-image only produces 3 pixel sizes:
//   1024x1024 (1:1), 1024x1536 (2:3), 1536x1024 (3:2)
// Every other ratio silently maps to one of these, so only expose the real outputs.
export const OPENAI_ALLOWED_ASPECT_RATIOS = [
  '1:1',
  '2:3',
  '3:2'
] as const;

const GEMINI_LABELS: Record<string, string> = {
  '1:1': 'Square (1:1)',
  '2:3': 'Tall Portrait (2:3)',
  '3:2': 'Classic Photo (3:2)',
  '3:4': 'Vertical (3:4)',
  '4:3': 'Presentation (4:3)',
  '4:5': 'Tall Print (4:5)',
  '5:4': 'Slide Friendly (5:4)',
  '9:16': 'Portrait (9:16)',
  '16:9': 'Landscape (16:9)',
  '21:9': 'Ultrawide (21:9)'
};

const OPENAI_LABELS: Record<string, string> = {
  '1:1': 'Square (1:1)',
  '2:3': 'Portrait (2:3)',
  '3:2': 'Landscape (3:2)'
};

const normalizeAspectRatio = (value?: string): string => (value || '').replace(/\s+/g, '').trim();

const parseRatio = (value: string): number | null => {
  const [width, height] = value.split(':').map(Number);
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    return null;
  }
  return width / height;
};

const findClosestAspectRatio = (target: string, candidates: string[]): string | null => {
  const targetRatio = parseRatio(target);
  if (!targetRatio || candidates.length === 0) return null;

  let closest = candidates[0];
  let minDiff = Number.POSITIVE_INFINITY;

  for (const candidate of candidates) {
    const candidateRatio = parseRatio(candidate);
    if (!candidateRatio) continue;
    const diff = Math.abs(targetRatio - candidateRatio);
    if (diff < minDiff) {
      minDiff = diff;
      closest = candidate;
    }
  }

  return closest;
};

const dedupeByValue = (ratios: AspectRatioOption[]): AspectRatioOption[] => {
  const map = new Map<string, AspectRatioOption>();
  for (const ratio of ratios) {
    const normalized = normalizeAspectRatio(ratio.value);
    if (!normalized || map.has(normalized)) continue;
    map.set(normalized, ratio);
  }
  return Array.from(map.values());
};

const buildFilteredRatios = (
  allowedRatios: readonly string[],
  labels: Record<string, string>,
  source: AspectRatioOption[]
): AspectRatioOption[] => {
  const sourceByValue = new Map(source.map(r => [normalizeAspectRatio(r.value), r]));
  return allowedRatios.map((value) => {
    const existing = sourceByValue.get(value);
    if (existing) return existing;

    return {
      id: `model-${value.replace(':', '-')}`,
      name: labels[value],
      label: labels[value],
      value,
      scope: 'system',
      authorId: 'system',
      authorName: 'System',
      votes: 0,
      voters: [],
      createdAt: 0,
      isSystem: true
    } as AspectRatioOption;
  });
};

/**
 * Returns only the aspect ratios that the given model actually supports.
 * No silent conversions -- what you see is what you get.
 */
export const getAspectRatiosForModel = (
  modelId: string,
  allRatios: AspectRatioOption[]
): AspectRatioOption[] => {
  const source = dedupeByValue(allRatios?.length ? allRatios : ASPECT_RATIOS);

  if (modelId === 'gemini') {
    return buildFilteredRatios(GEMINI_ALLOWED_ASPECT_RATIOS, GEMINI_LABELS, source);
  }

  if (modelId === 'openai') {
    return buildFilteredRatios(OPENAI_ALLOWED_ASPECT_RATIOS, OPENAI_LABELS, source);
  }

  // SVG & unknown models: all ratios supported
  return source;
};

/**
 * Ensures the requested aspect ratio is valid for the model.
 * If not, returns the closest supported ratio.
 */
export const getSafeAspectRatioForModel = (
  modelId: string,
  requestedAspectRatio: string,
  allRatios: AspectRatioOption[]
): string => {
  const normalizedRequested = normalizeAspectRatio(requestedAspectRatio);
  const modelRatios = getAspectRatiosForModel(modelId, allRatios);
  const modelValues = modelRatios.map(r => normalizeAspectRatio(r.value)).filter(Boolean);

  // If the requested ratio is directly supported, use it as-is
  if (normalizedRequested && modelValues.includes(normalizedRequested)) {
    return normalizedRequested;
  }

  // Otherwise find the closest match
  const closest = normalizedRequested
    ? findClosestAspectRatio(normalizedRequested, modelValues)
    : null;

  return closest || modelValues[0] || '1:1';
};

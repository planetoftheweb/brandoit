import { ASPECT_RATIOS } from '../constants';
import { AspectRatioOption } from '../types';

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

export const getAspectRatiosForModel = (
  modelId: string,
  allRatios: AspectRatioOption[]
): AspectRatioOption[] => {
  const source = dedupeByValue(allRatios?.length ? allRatios : ASPECT_RATIOS);
  if (modelId !== 'gemini') return source;

  const sourceByValue = new Map(source.map(r => [normalizeAspectRatio(r.value), r]));
  return GEMINI_ALLOWED_ASPECT_RATIOS.map((value) => {
    const existing = sourceByValue.get(value);
    if (existing) return existing;

    return {
      id: `gemini-${value.replace(':', '-')}`,
      name: GEMINI_LABELS[value],
      label: GEMINI_LABELS[value],
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

export const getSafeAspectRatioForModel = (
  modelId: string,
  requestedAspectRatio: string,
  allRatios: AspectRatioOption[]
): string => {
  const normalizedRequested = normalizeAspectRatio(requestedAspectRatio);
  const modelRatios = getAspectRatiosForModel(modelId, allRatios);
  const modelValues = modelRatios.map(r => normalizeAspectRatio(r.value)).filter(Boolean);

  if (modelId !== 'gemini') {
    return normalizedRequested || modelValues[0] || '1:1';
  }

  if (normalizedRequested && modelValues.includes(normalizedRequested)) {
    return normalizedRequested;
  }

  const closest = normalizedRequested
    ? findClosestAspectRatio(normalizedRequested, modelValues)
    : null;

  return closest || modelValues[0] || GEMINI_ALLOWED_ASPECT_RATIOS[0];
};

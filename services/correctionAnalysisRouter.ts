import type { User } from '../types';

/**
 * BYOK resolution (per-model override, then shared Gemini / OpenAI slots).
 * Kept in sync with App `getApiKeyForModel` / Settings trimming behavior.
 */
export function getApiKeyForModelFromUser(
  user: User | null | undefined,
  modelId: string
): string | undefined {
  if (!user) return undefined;
  const slot = user.preferences.apiKeys?.[modelId];
  if (typeof slot === 'string') {
    const t = slot.trim();
    if (t) return t;
  }
  if (
    modelId === 'gemini' ||
    modelId === 'gemini-3.1-flash-image-preview' ||
    modelId === 'gemini-svg'
  ) {
    const shared = user.preferences.apiKeys?.gemini;
    if (typeof shared === 'string' && shared.trim()) return shared.trim();
    const legacy = user.preferences.geminiApiKey;
    if (typeof legacy === 'string' && legacy.trim()) return legacy.trim();
  }
  if (modelId === 'openai' || modelId === 'openai-2' || modelId === 'openai-mini') {
    const k = user.preferences.apiKeys?.openai;
    if (typeof k === 'string' && k.trim()) return k.trim();
  }
  return undefined;
}

/**
 * Picks OpenAI vs Gemini BYOK for auxiliary calls (Run analysis, Expand prompt):
 * prefer the same provider as the toolbar when that key exists; otherwise
 * whichever key is configured.
 */
export function resolveAuxiliaryByokProvider(
  selectedModel: string,
  getApiKeyForModel: (modelId: string) => string | undefined
): { provider: 'gemini' | 'openai'; apiKey: string } | null {
  const openaiKey = getApiKeyForModel('openai');
  const geminiKey = getApiKeyForModel('gemini');

  const openaiToolbar =
    selectedModel === 'openai' ||
    selectedModel === 'openai-2' ||
    selectedModel === 'openai-mini';
  const geminiToolbar =
    selectedModel === 'gemini' ||
    selectedModel === 'gemini-3.1-flash-image-preview' ||
    selectedModel === 'gemini-svg';

  if (openaiToolbar && openaiKey) return { provider: 'openai', apiKey: openaiKey };
  if (geminiToolbar && geminiKey) return { provider: 'gemini', apiKey: geminiKey };
  if (geminiKey) return { provider: 'gemini', apiKey: geminiKey };
  if (openaiKey) return { provider: 'openai', apiKey: openaiKey };
  return null;
}

/**
 * Picks which BYOK provider should run "Run analysis" (vision + JSON).
 * Prefer the same family as the toolbar when that key exists; otherwise fall
 * back to whichever key the user has configured.
 */
export function resolveCorrectionVisionProvider(
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

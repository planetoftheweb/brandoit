import { GenerationConfig, GeneratedImage } from '../types';

export type OpenAIImageQuality = 'low' | 'medium' | 'high' | 'auto';

// Map our UI model IDs to OpenAI API model identifiers.
// Everything under this OpenAI family shares one API key slot (`apiKeys.openai`).
const API_MODEL_BY_UI_ID: Record<string, string> = {
  'openai-2': 'gpt-image-2',
  'openai-mini': 'gpt-image-1-mini',
  openai: 'gpt-image-1.5'
};

const resolveApiModel = (uiModelId?: string): string => {
  if (uiModelId && API_MODEL_BY_UI_ID[uiModelId]) return API_MODEL_BY_UI_ID[uiModelId];
  return API_MODEL_BY_UI_ID.openai;
};

// gpt-image-1.5 and gpt-image-1-mini only produce the three sizes below.
// gpt-image-2 accepts a much wider set; we pick sensible defaults per aspect
// ratio that satisfy OpenAI's constraints (edges are multiples of 16 and the
// long:short ratio is <= 3:1).
const LEGACY_SIZE_BY_RATIO: Record<string, string> = {
  '1:1': '1024x1024',
  '3:2': '1536x1024',
  '2:3': '1024x1536'
};

const GPT_IMAGE_2_SIZE_BY_RATIO: Record<string, string> = {
  '1:1': '2048x2048',
  '3:2': '1536x1024',
  '2:3': '1024x1536',
  '16:9': '2048x1152',
  '9:16': '1152x2048',
  '3:1': '2304x768',
  '1:3': '768x2304'
};

const aspectToSize = (apiModel: string, aspect: string): string => {
  if (apiModel === 'gpt-image-2') {
    return GPT_IMAGE_2_SIZE_BY_RATIO[aspect] || '1024x1024';
  }
  return LEGACY_SIZE_BY_RATIO[aspect] || '1024x1024';
};

const fetchToBase64 = async (url: string): Promise<{ base64: string; mime: string }> => {
  const res = await fetch(url);
  if (!res.ok) throw new Error('Failed to fetch image from URL');
  const blob = await res.blob();
  const arrayBuffer = await blob.arrayBuffer();
  const base64 = btoa(String.fromCharCode(...new Uint8Array(arrayBuffer)));
  return { base64, mime: blob.type || 'image/png' };
};

export interface OpenAIGenerateOptions {
  /** UI model id: 'openai-2' | 'openai-mini' | 'openai'. Defaults to 'openai'. */
  modelId?: string;
  /** low | medium | high | auto. Defaults to 'auto'. */
  quality?: OpenAIImageQuality;
  systemPrompt?: string;
}

/**
 * Generate an image via OpenAI's GPT Image family (gpt-image-2,
 * gpt-image-1-mini, or gpt-image-1.5). Callers bring their own API key.
 */
export const generateOpenAIImage = async (
  prompt: string,
  config: GenerationConfig,
  apiKey: string,
  options: OpenAIGenerateOptions = {}
): Promise<GeneratedImage> => {
  const apiModel = resolveApiModel(options.modelId);

  if (!apiKey?.trim()) {
    throw new Error(`OpenAI API key is required for ${apiModel}`);
  }

  const size = aspectToSize(apiModel, config.aspectRatio);
  const quality: OpenAIImageQuality = options.quality || 'auto';
  const systemPrompt = options.systemPrompt;

  const fullPrompt = systemPrompt && systemPrompt.trim()
    ? `${systemPrompt.trim()}\n\n${prompt}`
    : prompt;

  const body: Record<string, unknown> = {
    model: apiModel,
    prompt: fullPrompt,
    size
  };
  // Only gpt-image-2 and gpt-image-1-mini accept a `quality` parameter.
  // gpt-image-1.5 rejects it, so we only send it when explicitly set to
  // non-auto on a supported model.
  if (apiModel !== 'gpt-image-1.5' && quality !== 'auto') {
    body.quality = quality;
  }

  const response = await fetch('https://api.openai.com/v1/images/generations', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey.trim()}`
    },
    body: JSON.stringify(body)
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`OpenAI image generation failed: ${errText}`);
  }

  const json = await response.json();
  const data = json?.data?.[0];
  if (!data) {
    throw new Error('OpenAI image generation returned no image data');
  }

  let base64Data: string | undefined;
  let mimeType = 'image/png';
  if (data.b64_json) {
    base64Data = data.b64_json;
  } else if (data.url) {
    const fetched = await fetchToBase64(data.url);
    base64Data = fetched.base64;
    mimeType = fetched.mime;
  } else {
    throw new Error('OpenAI image generation returned neither b64_json nor url');
  }

  const imageUrl = `data:${mimeType};base64,${base64Data}`;

  return {
    imageUrl,
    base64Data: base64Data!,
    mimeType
  };
};

import { GenerationConfig, GeneratedImage } from '../types';

const MODEL_ID = 'gpt-image-1.5';

// Map aspect ratios to OpenAI-supported sizes (allowed: 1024x1024, 1024x1536, 1536x1024, auto)
const aspectToSize = (aspect: string): string => {
  switch (aspect) {
    case '16:9':
    case '21:9':
    case '4:3':
    case '3:2':
    case '5:4':
    case '6:5':
      return '1536x1024'; // landscape-ish
    case '9:16':
    case '2:3':
    case '3:4':
    case '4:5':
      return '1024x1536'; // portrait-ish
    case '1:1':
      return '1024x1024';
    default:
      return 'auto';
  }
};

const fetchToBase64 = async (url: string): Promise<{ base64: string; mime: string }> => {
  const res = await fetch(url);
  if (!res.ok) throw new Error('Failed to fetch image from URL');
  const blob = await res.blob();
  const arrayBuffer = await blob.arrayBuffer();
  const base64 = btoa(String.fromCharCode(...new Uint8Array(arrayBuffer)));
  return { base64, mime: blob.type || 'image/png' };
};

/**
 * Generate image using OpenAI gpt-image-1.5
 * Expects a BYOK API key (no platform key usage)
 */
export const generateOpenAIImage = async (
  prompt: string,
  config: GenerationConfig,
  apiKey: string,
  systemPrompt?: string
): Promise<GeneratedImage> => {
  if (!apiKey?.trim()) {
    throw new Error('OpenAI API key is required for gpt-image-1.5');
  }

  const size = aspectToSize(config.aspectRatio);

  const fullPrompt = systemPrompt && systemPrompt.trim()
    ? `${systemPrompt.trim()}\n\n${prompt}`
    : prompt;

  const response = await fetch('https://api.openai.com/v1/images/generations', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey.trim()}`
    },
    body: JSON.stringify({
      model: MODEL_ID,
      prompt: fullPrompt,
      size
    })
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
    base64Data,
    mimeType
  };
};

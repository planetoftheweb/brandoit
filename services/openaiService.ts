import { GenerationConfig, GeneratedImage } from '../types';
import type { ImageCorrectionPlan } from './geminiService';
import { resolveImageInputForRefinement } from './geminiService';
import {
  buildCorrectionAuditUserPrompt,
  parseStructuredJsonFromModelText,
  type CorrectionAnalysisContext,
} from './correctionAnalysisShared';

export type OpenAIImageQuality = 'low' | 'medium' | 'high' | 'auto';

/**
 * Error thrown when OpenAI's /v1/images/generations endpoint rejects a call.
 * Includes structured fields so the batch runner can:
 *   - decide whether to retry / back off (transient, e.g. rate-limit)
 *   - decide whether to short-circuit (fatal, e.g. billing hard limit)
 *   - surface a clean human-readable message (not the raw JSON body)
 */
export class OpenAIGenerationError extends Error {
  readonly status?: number;
  readonly code?: string;
  readonly errorType?: string;
  /**
   * True when no amount of retrying will help this batch (billing cap hit,
   * quota exhausted, API key invalid, etc). The batch runner uses this flag
   * to stop taking new jobs for this model instead of failing every queued
   * call with the same message.
   */
  readonly fatal: boolean;

  constructor(opts: {
    message: string;
    status?: number;
    code?: string;
    errorType?: string;
    fatal?: boolean;
  }) {
    super(opts.message);
    this.name = 'OpenAIGenerationError';
    this.status = opts.status;
    this.code = opts.code;
    this.errorType = opts.errorType;
    this.fatal = !!opts.fatal;
  }
}

/**
 * Map OpenAI error codes/types to a short user-facing message and a `fatal`
 * flag. Falls back to OpenAI's own message if we don't have a friendlier one.
 */
const describeOpenAIError = (
  status: number,
  code: string | undefined,
  errorType: string | undefined,
  rawMessage: string
): { message: string; fatal: boolean } => {
  const c = (code || '').toLowerCase();
  const t = (errorType || '').toLowerCase();

  if (c === 'billing_hard_limit_reached' || t === 'billing_limit_user_error') {
    return {
      message:
        'OpenAI billing hard limit reached. Raise the monthly limit in your OpenAI dashboard (Settings → Limits) and try again.',
      fatal: true
    };
  }
  if (c === 'insufficient_quota' || t === 'insufficient_quota') {
    return {
      message:
        'Your OpenAI account has no remaining quota. Add a payment method or raise your budget in the OpenAI dashboard.',
      fatal: true
    };
  }
  if (c === 'invalid_api_key' || status === 401) {
    return {
      message: 'OpenAI rejected the API key. Check or rotate it in Settings → API keys.',
      fatal: true
    };
  }
  if (status === 403) {
    return {
      message:
        'OpenAI refused this request (403). The account or key may not have access to this model.',
      fatal: true
    };
  }
  if (c === 'rate_limit_exceeded' || status === 429) {
    // Retryable — the batch runner already has cooldown handling for 429.
    return { message: 'OpenAI rate limit hit — slow down and retry.', fatal: false };
  }
  if (c === 'content_policy_violation' || c === 'moderation_blocked') {
    return {
      message: 'OpenAI blocked this prompt (content policy). Adjust wording and retry.',
      fatal: false
    };
  }
  return {
    message: rawMessage || `OpenAI request failed (HTTP ${status}).`,
    fatal: false
  };
};

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
    // OpenAI almost always returns JSON on error; fall back to raw text only
    // if parsing fails (proxies, HTML error pages, etc).
    const errText = await response.text();
    let code: string | undefined;
    let errorType: string | undefined;
    let rawMessage = errText;
    try {
      const parsed = JSON.parse(errText);
      const errObj = parsed?.error || parsed;
      code = errObj?.code || undefined;
      errorType = errObj?.type || undefined;
      rawMessage = errObj?.message || errText;
    } catch {
      // Not JSON — keep errText as the raw message.
    }
    const { message, fatal } = describeOpenAIError(response.status, code, errorType, rawMessage);
    throw new OpenAIGenerationError({
      message,
      status: response.status,
      code,
      errorType,
      fatal
    });
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

/** Fast vision model for image audit JSON (not GPT Image). BYOK OpenAI key from Settings. */
const CORRECTION_VISION_CHAT_MODEL = 'gpt-4o-mini';

/**
 * Same structured correction plan as Gemini's analyzer, via Chat Completions + vision.
 */
export const analyzeImageForCorrectionPromptOpenAI = async (
  currentImage: GeneratedImage,
  config: GenerationConfig,
  context: CorrectionAnalysisContext,
  apiKey: string,
  systemPrompt?: string
): Promise<ImageCorrectionPlan> => {
  if (!apiKey?.trim()) {
    throw new Error('OpenAI API key required for image analysis.');
  }

  const sourceImage = await resolveImageInputForRefinement(currentImage);
  const instructions = buildCorrectionAuditUserPrompt(config, context);
  const dataUrl = `data:${sourceImage.mimeType};base64,${sourceImage.base64Data}`;

  const messages: Record<string, unknown>[] = [];
  if (systemPrompt?.trim()) {
    messages.push({ role: 'system', content: systemPrompt.trim() });
  }
  messages.push({
    role: 'user',
    content: [
      { type: 'text', text: instructions },
      {
        type: 'image_url',
        image_url: {
          url: dataUrl,
          detail: 'low',
        },
      },
    ],
  });

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey.trim()}`,
    },
    body: JSON.stringify({
      model: CORRECTION_VISION_CHAT_MODEL,
      messages,
      response_format: { type: 'json_object' },
      max_completion_tokens: 4096,
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    let code: string | undefined;
    let errorType: string | undefined;
    let rawMessage = errText;
    try {
      const parsed = JSON.parse(errText);
      const errObj = parsed?.error || parsed;
      code = errObj?.code || undefined;
      errorType = errObj?.type || undefined;
      rawMessage = errObj?.message || errText;
    } catch {
      // keep errText
    }
    const { message, fatal } = describeOpenAIError(response.status, code, errorType, rawMessage);
    throw new OpenAIGenerationError({
      message,
      status: response.status,
      code,
      errorType,
      fatal,
    });
  }

  const json = (await response.json()) as {
    choices?: Array<{ message?: { content?: string | null } }>;
  };
  const text = json?.choices?.[0]?.message?.content;
  if (!text?.trim()) {
    throw new Error('OpenAI returned no analysis text.');
  }

  let parsed: Partial<ImageCorrectionPlan>;
  try {
    parsed = parseStructuredJsonFromModelText<Partial<ImageCorrectionPlan>>(text);
  } catch {
    throw new Error(
      'Could not read the analysis response. Try Run analysis again, or shorten your Settings system prompt if it conflicts with JSON output.'
    );
  }

  return {
    analysisSummary: (parsed.analysisSummary || '').trim(),
    issues: Array.isArray(parsed.issues)
      ? parsed.issues.map((issue) => String(issue).trim()).filter(Boolean)
      : [],
    fixPrompt: (parsed.fixPrompt || '').trim(),
  };
};

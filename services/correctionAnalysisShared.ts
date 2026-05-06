import { GenerationConfig, BrandColor, VisualStyle, GraphicType, AspectRatioOption } from '../types';

/** Context slice needed for correction audit (matches refine/generation context). */
export interface CorrectionAnalysisContext {
  brandColors: BrandColor[];
  visualStyles: VisualStyle[];
  graphicTypes: GraphicType[];
}

/** Context for prompt expansion (includes aspect ratio labels). */
export interface ExpandPromptContext {
  brandColors: BrandColor[];
  visualStyles: VisualStyle[];
  graphicTypes: GraphicType[];
  aspectRatios: AspectRatioOption[];
}

/** User task text for vision models auditing an image for correction prompts. */
export function buildCorrectionAuditUserPrompt(
  config: GenerationConfig,
  context: CorrectionAnalysisContext
): string {
  const colorScheme = context.brandColors.find((c) => c.id === config.colorSchemeId);
  const style = context.visualStyles.find((s) => s.id === config.visualStyleId);
  const type = context.graphicTypes.find((t) => t.id === config.graphicTypeId);
  const contextHint = [
    `Original request: ${config.prompt || 'N/A'}`,
    `Graphic type: ${type?.name || config.graphicTypeId || 'N/A'}`,
    `Visual style: ${style?.name || config.visualStyleId || 'N/A'}${style?.description ? ` (${style.description})` : ''}`,
    `Color palette: ${colorScheme ? `${colorScheme.name} [${colorScheme.colors.join(', ')}]` : 'N/A'}`,
    `Aspect ratio: ${config.aspectRatio || 'N/A'}`,
  ].join('\n');

  return `
    You are auditing a generated image for correctness and usability.

    Tasks:
    1. Detect textual problems: spelling, grammar, punctuation, capitalization, awkward wording.
    2. Detect factual/semantic inaccuracies and visual mismatches (for example labels pointing to wrong parts, contradictory annotations, impossible claims).
    3. Produce a single detailed image-edit prompt that corrects the issues while preserving the overall composition, style, and palette.

    Context:
    ${contextHint}

    Output requirements:
    - Return strict JSON only (no markdown fences).
    - "analysisSummary": 1-2 concise sentences.
    - "issues": array of concrete issue lines ("what is wrong -> what to change").
    - "fixPrompt": a specific, ready-to-run editing prompt for a high-quality image model.
    - In "fixPrompt", include: text correction instructions, factual correction instructions, label/annotation alignment, readability improvements.
    - Keep the image concept intact; do not introduce unrelated new content.
  `.trim();
}

/** Strip optional \`\`\`json fences so structured-output parsing doesn't throw. */
export function parseStructuredJsonFromModelText<T>(raw: string): T {
  let s = raw.trim();
  const fence = /^```(?:json)?\s*\n?([\s\S]*?)```\s*$/im.exec(s);
  if (fence) s = fence[1].trim();
  return JSON.parse(s) as T;
}

/** Instructions block shared by Gemini Flash and OpenAI expand-prompt. */
export function buildExpandPromptInstructions(
  config: GenerationConfig,
  context: ExpandPromptContext
): string {
  const typeLabel = context.graphicTypes.find((g) => g.id === config.graphicTypeId)?.name || config.graphicTypeId;
  const style = context.visualStyles.find((s) => s.id === config.visualStyleId);
  const styleLabel = style?.name || config.visualStyleId;
  const styleDesc = style?.description || '';
  const palette = context.brandColors.find((c) => c.id === config.colorSchemeId);
  const colors = palette ? `${palette.name}: ${palette.colors.join(', ')}` : '';
  const aspect =
    context.aspectRatios?.find((a) => a.value === config.aspectRatio)?.label || config.aspectRatio;

  return `
    You expand short text prompts into rich, creative, and visual image prompts.
    Include and amplify:
    - Topic and clear subject focus
    - Environment: background + foreground details
    - Emotion and mood
    - Technical details: camera/view, depth of field, lighting, texture
    - Nouns with size/age/state (large, tiny, old, weathered, pristine)
    - Prepositions to relate objects (on top of, beneath, around, beside)
    - Adjectives/materials (matte, glossy, metallic, wooden, fabric)
    - Colors hinting at the palette: ${colors || 'use a cohesive palette'}
    - Adverbs for action (soaring, gliding, drifting)
    - Art style references: ${styleLabel}${styleDesc ? ` (${styleDesc})` : ''}
    Keep it 2-4 sentences, vivid, and optimized for image generation. Do not mention any reference image.
    Current choices: Type=${typeLabel}, Style=${styleLabel}, Palette=${colors || 'cohesive palette'}, Aspect=${aspect}.
  `.trim();
}

import { GenerationConfig, BrandColor, VisualStyle, GraphicType } from '../types';

/** Context slice needed for correction audit (matches refine/generation context). */
export interface CorrectionAnalysisContext {
  brandColors: BrandColor[];
  visualStyles: VisualStyle[];
  graphicTypes: GraphicType[];
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

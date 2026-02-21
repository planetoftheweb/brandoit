import { GoogleGenAI } from "@google/genai";
import { GenerationConfig, GeneratedImage, BrandColor, VisualStyle, GraphicType, SvgMode } from "../types";

const SVG_MODEL = 'gemini-3.1-pro-preview';

interface SvgGenerationContext {
  brandColors: BrandColor[];
  visualStyles: VisualStyle[];
  graphicTypes: GraphicType[];
}

const getAiClient = (customKey?: string) => {
  const key = (customKey || '').trim();
  if (!key) throw new Error("API Key Required. Please log in and add your Google Gemini API Key in Settings.");
  return new GoogleGenAI({ apiKey: key });
};

const DANGEROUS_ATTRS = /\bon\w+\s*=/gi;
const SCRIPT_TAG = /<script[\s\S]*?<\/script>/gi;
const FOREIGN_OBJECT = /<foreignObject[\s\S]*?<\/foreignObject>/gi;

export const sanitizeSvg = (svg: string): string =>
  svg
    .replace(SCRIPT_TAG, '')
    .replace(FOREIGN_OBJECT, '')
    .replace(DANGEROUS_ATTRS, '');

const extractSvg = (text: string): string | null => {
  const start = text.indexOf('<svg');
  if (start === -1) return null;
  const end = text.indexOf('</svg>', start);
  if (end === -1) return null;
  return text.slice(start, end + 6);
};

const ensureSvgDimensions = (svg: string): string => {
  const hasWidth = /\bwidth\s*=/.test(svg.slice(0, svg.indexOf('>')));
  const hasHeight = /\bheight\s*=/.test(svg.slice(0, svg.indexOf('>')));
  if (hasWidth && hasHeight) return svg;

  const vbMatch = svg.match(/viewBox\s*=\s*["']([^"']+)["']/);
  let w = '800';
  let h = '600';
  if (vbMatch) {
    const parts = vbMatch[1].trim().split(/\s+/);
    if (parts.length >= 4) {
      w = parts[2];
      h = parts[3];
    }
  }

  const insertPos = svg.indexOf('<svg') + 4;
  const attrs = `${!hasWidth ? ` width="${w}"` : ''}${!hasHeight ? ` height="${h}"` : ''}`;
  return svg.slice(0, insertPos) + attrs + svg.slice(insertPos);
};

const modeInstruction = (mode: SvgMode): string => {
  switch (mode) {
    case 'animated':
      return 'Include smooth CSS animations and/or SMIL <animate> elements for key elements. Make the animation loop seamlessly.';
    case 'interactive':
      return 'Add CSS :hover and :focus states for visual interactivity on key elements. Use only CSS, no JavaScript.';
    default:
      return 'Make it fully static with no animations or interactive elements.';
  }
};

const aspectToViewBox = (aspectRatio: string): string => {
  const [w, h] = aspectRatio.split(':').map(Number);
  if (!w || !h) return '0 0 1200 1200';
  const longer = Math.max(w, h);
  const scale = (w >= h ? 1920 : 1080) / longer;
  return `0 0 ${Math.round(w * scale)} ${Math.round(h * scale)}`;
};

const buildSvgPrompt = (
  config: GenerationConfig,
  context: SvgGenerationContext,
  systemPrompt?: string
): string => {
  const colorScheme = context.brandColors.find(c => c.id === config.colorSchemeId);
  const style = context.visualStyles.find(s => s.id === config.visualStyleId);
  const type = context.graphicTypes.find(t => t.id === config.graphicTypeId);

  const colors = colorScheme ? colorScheme.colors.join(', ') : 'standard colors';
  const styleDesc = style ? style.description : 'clean style';
  const typeName = type ? type.name : 'graphic';
  const viewBox = aspectToViewBox(config.aspectRatio || '1:1');
  const mode = config.svgMode || 'static';

  const parts = [
    systemPrompt?.trim() ? `System Instruction: ${systemPrompt.trim()}\n` : '',
    `You are an expert SVG designer. Generate a visually polished, production-quality SVG graphic.`,
    `Output ONLY the raw SVG code — no explanation, no markdown fences, no commentary before or after.`,
    ``,
    `Type: ${typeName}`,
    `Visual Style: ${styleDesc}`,
    `Color Palette: Use ONLY these colors (and their tints/shades): ${colors}`,
    `viewBox: "${viewBox}" — fill the entire viewBox with content, no excessive whitespace.`,
    `Output Mode: ${modeInstruction(mode)}`,
    ``,
    `Content: ${config.prompt}`,
    ``,
    `Quality requirements:`,
    `- Use gradients, patterns, and layered shapes for visual depth`,
    `- Include proper typography with font-family fallbacks (system fonts)`,
    `- Ensure text is legible: minimum 16px equivalent at the viewBox scale`,
    `- Use <defs> for reusable gradients, clip-paths, and filters`,
    `- Optimize paths — prefer basic shapes (<rect>, <circle>, <ellipse>) over complex <path> when possible`,
    `- The SVG must be self-contained, well-formed, and render correctly in all modern browsers`,
  ];

  return parts.filter(Boolean).join('\n');
};

const svgToGeneratedImage = (svgCode: string): GeneratedImage => {
  const base64 = btoa(unescape(encodeURIComponent(svgCode)));
  return {
    imageUrl: `data:image/svg+xml;base64,${base64}`,
    base64Data: base64,
    mimeType: 'image/svg+xml',
  };
};

export const generateSvg = async (
  config: GenerationConfig,
  context: SvgGenerationContext,
  customApiKey?: string,
  systemPrompt?: string
): Promise<GeneratedImage & { svgCode: string }> => {
  const ai = getAiClient(customApiKey);
  const prompt = buildSvgPrompt(config, context, systemPrompt);

  try {
    const response = await ai.models.generateContent({
      model: SVG_MODEL,
      contents: { parts: [{ text: prompt }] },
    });

    const text = response.text ?? '';
    const raw = extractSvg(text);
    if (!raw) {
      throw new Error('The model did not return valid SVG code. Try refining your prompt.');
    }

    const svgCode = ensureSvgDimensions(sanitizeSvg(raw));
    return { ...svgToGeneratedImage(svgCode), svgCode };
  } catch (error: any) {
    console.error("SVG Generation Error:", error);
    throw new Error(error.message || "Failed to generate SVG. Please try again.");
  }
};

export const refineSvg = async (
  currentSvgCode: string,
  refinementPrompt: string,
  config: GenerationConfig,
  context: SvgGenerationContext,
  customApiKey?: string,
  systemPrompt?: string
): Promise<GeneratedImage & { svgCode: string }> => {
  const ai = getAiClient(customApiKey);

  const colorScheme = context.brandColors.find(c => c.id === config.colorSchemeId);
  const colors = colorScheme ? colorScheme.colors.join(', ') : '';

  const parts = [
    systemPrompt?.trim() ? `System Instruction: ${systemPrompt.trim()}\n` : '',
    `Here is the current SVG:\n${currentSvgCode}\n`,
    `Please modify it: ${refinementPrompt}`,
    colors ? `Color Palette: Keep using these colors: ${colors}` : '',
    `Output ONLY the modified SVG code. No explanation, no markdown fences.`,
  ];

  try {
    const response = await ai.models.generateContent({
      model: SVG_MODEL,
      contents: { parts: [{ text: parts.filter(Boolean).join('\n') }] },
    });

    const text = response.text ?? '';
    const raw = extractSvg(text);
    if (!raw) {
      throw new Error('The model did not return valid SVG code during refinement.');
    }

    const svgCode = ensureSvgDimensions(sanitizeSvg(raw));
    return { ...svgToGeneratedImage(svgCode), svgCode };
  } catch (error: any) {
    console.error("SVG Refinement Error:", error);
    throw new Error(error.message || "Failed to refine SVG. Please try again.");
  }
};

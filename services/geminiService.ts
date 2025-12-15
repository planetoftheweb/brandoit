import { GoogleGenAI, Type } from "@google/genai";
import { GenerationConfig, GeneratedImage, BrandColor, VisualStyle, GraphicType, BrandGuidelinesAnalysis } from "../types";

const NANO_BANANA_MODEL = 'gemini-2.5-flash-image';
const ANALYSIS_MODEL = 'gemini-2.5-flash';

interface GenerationContext {
  brandColors: BrandColor[];
  visualStyles: VisualStyle[];
  graphicTypes: GraphicType[];
}

// Helper to get the client
const getAiClient = (customKey?: string) => {
  const key = customKey || import.meta.env.VITE_GEMINI_API_KEY || process.env.GEMINI_API_KEY;
  if (!key) throw new Error("No API Key available. Please add one in Settings.");
  return new GoogleGenAI({ apiKey: key });
}

/**
 * Constructs the engineered prompt based on selected presets and dynamic context
 */
const constructFullPrompt = (config: GenerationConfig, context: GenerationContext): string => {
  const colorScheme = context.brandColors.find(c => c.id === config.colorSchemeId);
  const style = context.visualStyles.find(s => s.id === config.visualStyleId);
  const type = context.graphicTypes.find(t => t.id === config.graphicTypeId);

  const colors = colorScheme ? colorScheme.colors.join(', ') : 'standard colors';
  const styleDesc = style ? style.description : 'clean style';
  const typeName = type ? type.name : 'image';

  return `
    Create a ${typeName}.
    Visual Style: ${styleDesc}.
    Color Palette: Strictly use these colors: ${colors}.
    
    Content Request: ${config.prompt}
    
    Ensure the output is high quality and adheres to the style constraints.
  `.trim();
};

export const generateGraphic = async (config: GenerationConfig, context: GenerationContext, customApiKey?: string): Promise<GeneratedImage> => {
  const ai = getAiClient(customApiKey);
  const fullPrompt = constructFullPrompt(config, context);

  try {
    const response = await ai.models.generateContent({
      model: NANO_BANANA_MODEL,
      contents: {
        parts: [{ text: fullPrompt }],
      },
      config: {
        imageConfig: {
          aspectRatio: config.aspectRatio,
        }
      },
    });

    return extractImageFromResponse(response);
  } catch (error) {
    console.error("Gemini Generation Error:", error);
    throw new Error("Failed to generate image. Please try again.");
  }
};

export const refineGraphic = async (
  currentImage: GeneratedImage, 
  refinementPrompt: string, 
  config: GenerationConfig,
  context: GenerationContext,
  customApiKey?: string
): Promise<GeneratedImage> => {
  const ai = getAiClient(customApiKey);
  const colorScheme = context.brandColors.find(c => c.id === config.colorSchemeId);
  const style = context.visualStyles.find(s => s.id === config.visualStyleId);
  
  const colors = colorScheme ? colorScheme.colors.join(', ') : '';
  const styleDesc = style ? style.description : '';

  const fullRefinementPrompt = `
    Edit this image.
    Request: ${refinementPrompt}.
    Maintain the existing style (${styleDesc}) and color palette (${colors}).
  `.trim();

  try {
    const response = await ai.models.generateContent({
      model: NANO_BANANA_MODEL,
      contents: {
        parts: [
          {
            inlineData: {
              data: currentImage.base64Data,
              mimeType: currentImage.mimeType,
            },
          },
          {
            text: fullRefinementPrompt,
          },
        ],
      },
      config: {
        imageConfig: {
          aspectRatio: config.aspectRatio,
        }
      },
    });

    return extractImageFromResponse(response);
  } catch (error) {
    console.error("Gemini Refinement Error:", error);
    throw new Error("Failed to refine image. Please try again.");
  }
};

/**
 * Analyzes a brand guideline document (PDF or Image) to extract colors, styles, and types.
 */
export const analyzeBrandGuidelines = async (file: File, customApiKey?: string): Promise<BrandGuidelinesAnalysis> => {
  const ai = getAiClient(customApiKey);
  const base64Data = await fileToBase64(file);
  const mimeType = file.type;

  const prompt = `
    Analyze this brand guideline document. 
    Extract the following structured data:
    1. Brand Colors: Provide a name for the palette (e.g., "Primary Brand") and a list of hex codes.
    2. Visual Styles: Identify distinct visual styles described (e.g., "Line Art", "Isometric"). Provide a name and a short description for each.
    3. Graphic Types: Identify the types of graphics mentioned (e.g., "Icons", "Banners").

    Return the result as a strict JSON object matching the schema.
  `;

  try {
    const response = await ai.models.generateContent({
      model: ANALYSIS_MODEL,
      contents: {
        parts: [
          {
            inlineData: {
              data: base64Data,
              mimeType: mimeType,
            },
          },
          { text: prompt }
        ]
      },
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            brandColors: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  name: { type: Type.STRING },
                  colors: { type: Type.ARRAY, items: { type: Type.STRING } }
                }
              }
            },
            visualStyles: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  name: { type: Type.STRING },
                  description: { type: Type.STRING }
                }
              }
            },
            graphicTypes: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  name: { type: Type.STRING }
                }
              }
            }
          }
        }
      }
    });

    if (!response.text) throw new Error("No analysis result generated");
    
    return JSON.parse(response.text) as BrandGuidelinesAnalysis;
  } catch (error) {
    console.error("Brand Analysis Error:", error);
    throw new Error("Failed to analyze brand guidelines.");
  }
};

/**
 * Analyzes a single image to extract a specific option type (Style or Color).
 */
export const analyzeImageForOption = async (
  file: File, 
  type: 'style' | 'color', 
  customApiKey?: string
): Promise<{ name: string; description?: string; colors?: string[] }> => {
  const ai = getAiClient(customApiKey);
  const base64Data = await fileToBase64(file);
  const mimeType = file.type;

  let prompt = '';
  let responseSchema: any = {};

  if (type === 'style') {
    prompt = `
      Analyze the visual style of this image.
      Provide a short, catchy Name for this style (e.g. "Neon Cyberpunk", "Minimal Line Art").
      Provide a concise Description of the visual characteristics (e.g. lighting, texture, line weight, composition) that could be used to generate similar images.
    `;
    responseSchema = {
      type: Type.OBJECT,
      properties: {
        name: { type: Type.STRING },
        description: { type: Type.STRING }
      },
      required: ["name", "description"]
    };
  } else if (type === 'color') {
    prompt = `
      Analyze the color palette of this image.
      Provide a descriptive Name for this palette (e.g. "Sunset Vibes", "Corporate Blue").
      Extract the 4-5 dominant colors as HEX codes.
    `;
    responseSchema = {
      type: Type.OBJECT,
      properties: {
        name: { type: Type.STRING },
        colors: { 
          type: Type.ARRAY, 
          items: { type: Type.STRING } 
        }
      },
      required: ["name", "colors"]
    };
  }

  try {
    const response = await ai.models.generateContent({
      model: ANALYSIS_MODEL,
      contents: {
        parts: [
          {
            inlineData: {
              data: base64Data,
              mimeType: mimeType,
            },
          },
          { text: prompt }
        ]
      },
      config: {
        responseMimeType: "application/json",
        responseSchema: responseSchema
      }
    });

    if (!response.text) throw new Error("No analysis result generated");
    
    return JSON.parse(response.text);
  } catch (error) {
    console.error("Option Analysis Error:", error);
    throw new Error(`Failed to analyze image for ${type}.`);
  }
};


// Helper to parse the response structure
const extractImageFromResponse = (response: any): GeneratedImage => {
  if (!response.candidates || response.candidates.length === 0) {
    throw new Error("No candidates returned from API.");
  }

  const parts = response.candidates[0].content.parts;
  let imagePart = null;

  for (const part of parts) {
    if (part.inlineData) {
      imagePart = part;
      break;
    }
  }

  if (!imagePart) {
     // Sometimes errors come back as text in the part
     const textPart = parts.find((p: any) => p.text);
     if (textPart) {
         throw new Error(`Model returned text instead of image: ${textPart.text}`);
     }
    throw new Error("No image data found in response.");
  }

  const base64Data = imagePart.inlineData.data;
  const mimeType = imagePart.inlineData.mimeType || 'image/png';
  const imageUrl = `data:${mimeType};base64,${base64Data}`;

  return {
    imageUrl,
    base64Data,
    mimeType
  };
};

// Helper to convert File to Base64 string (without data URL prefix)
const fileToBase64 = (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      // Remove data:application/pdf;base64, prefix
      const base64 = result.split(',')[1];
      resolve(base64);
    };
    reader.onerror = error => reject(error);
    reader.readAsDataURL(file);
  });
};
export interface BrandColor {
  name: string;
  colors: string[]; // Hex codes description
  id: string;
}

export interface VisualStyle {
  name: string;
  description: string;
  id: string;
  icon?: any;
}

export interface GraphicType {
  name: string;
  id: string;
  icon?: any;
}

export interface AspectRatioOption {
  label: string;
  value: string; // "1:1", "16:9", etc.
  icon?: any;
}

export interface GenerationConfig {
  prompt: string;
  colorSchemeId: string;
  visualStyleId: string;
  graphicTypeId: string;
  aspectRatio: string;
}

export interface GeneratedImage {
  imageUrl: string;
  base64Data: string;
  mimeType: string;
}

export interface GenerationHistoryItem extends GeneratedImage {
  id: string;
  timestamp: number;
  config: GenerationConfig;
}

export interface BrandGuidelinesAnalysis {
  brandColors: Omit<BrandColor, 'id'>[];
  visualStyles: Omit<VisualStyle, 'id'>[];
  graphicTypes: Omit<GraphicType, 'id'>[];
}

export interface UserPreferences {
  brandColors: BrandColor[];
  visualStyles: VisualStyle[];
  graphicTypes: GraphicType[];
  aspectRatios: AspectRatioOption[];
  geminiApiKey?: string;
}

export interface User {
  id: string;
  name: string;
  email: string;
  preferences: UserPreferences;
}
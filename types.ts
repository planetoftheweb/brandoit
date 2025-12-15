export interface VisualStyle {
  name: string;
  description: string;
  id: string;
  icon?: any;
  colors?: string[]; // Merged color palette
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
  visualStyleId: string;
  graphicTypeId: string;
  aspectRatio: string;
  // Removed separate colorSchemeId
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

// Keeping BrandColor mostly for legacy/migration if needed, but UI will focus on Style.
// Or we can remove it if we fully migrate. Let's keep a simplified version for now 
// just in case we need to represent a palette object during analysis.
export interface BrandColor {
  name: string;
  colors: string[];
  id: string;
}

export interface BrandGuidelinesAnalysis {
  brandColors: Omit<BrandColor, 'id'>[];
  visualStyles: Omit<VisualStyle, 'id'>[];
  graphicTypes: Omit<GraphicType, 'id'>[];
}

export interface UserPreferences {
  visualStyles: VisualStyle[];
  graphicTypes: GraphicType[];
  aspectRatios: AspectRatioOption[];
  geminiApiKey?: string;
  // brandColors removed from active preferences, but we might need to migrate old data
}

export interface User {
  id: string;
  name: string;
  email: string;
  preferences: UserPreferences;
}
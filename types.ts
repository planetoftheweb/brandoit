export interface BaseResource {
  id: string;
  name: string;
  icon?: any;
  
  // Ownership & Visibility
  authorId: string;
  authorName: string;
  scope: 'system' | 'private' | 'public' | 'team';
  teamId?: string;

  // Social & Forking
  votes: number;
  voters: string[];
  forkedFromId?: string;
  createdAt: number;
}

export interface BrandColor extends BaseResource {
  colors: string[]; // Hex codes
}

export interface VisualStyle extends BaseResource {
  description: string;
}

export interface GraphicType extends BaseResource {}

export interface AspectRatioOption extends BaseResource {
  label: string;
  value: string; // "1:1", "16:9", etc.
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
  modelId?: string;
  timestamp?: number;
  config?: GenerationConfig;
}

export interface GenerationHistoryItem extends GeneratedImage {
  id: string;
  timestamp: number;
  config: GenerationConfig;
  modelId?: string;
}

export interface BrandGuidelinesAnalysis {
  brandColors: Omit<BrandColor, 'id' | 'authorId' | 'authorName' | 'scope' | 'votes' | 'voters' | 'createdAt'>[];
  visualStyles: Omit<VisualStyle, 'id' | 'authorId' | 'authorName' | 'scope' | 'votes' | 'voters' | 'createdAt'>[];
  graphicTypes: Omit<GraphicType, 'id' | 'authorId' | 'authorName' | 'scope' | 'votes' | 'voters' | 'createdAt'>[];
}

export interface UserPreferences {
  // References only, actual data stored in resource collections
  geminiApiKey?: string; // Legacy support
  apiKeys?: {
    [modelId: string]: string;
  };
  selectedModel?: string;
  systemPrompt?: string;
  modelLabels?: {
    [modelId: string]: string;
  };
  settings?: UserSettings; 
}

export interface UserSettings {
  contributeByDefault: boolean;
  defaultGraphicTypeId?: string;
  defaultAspectRatio?: string;
  confirmDeleteHistory?: boolean;
  confirmDeleteCurrent?: boolean;
}

export interface User {
  id: string;
  name: string;
  username?: string; 
  email: string;
  photoURL?: string; 
  preferences: UserPreferences;
  teamIds?: string[]; // IDs of teams the user belongs to
}

export interface Team {
  id: string;
  name: string;
  ownerId: string;
  members: string[]; // List of user IDs
  createdAt: number;
}

// Deprecated: CatalogItem is no longer needed as resources are self-contained
// export interface CatalogItem { ... }

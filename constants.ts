import { BrandColor, VisualStyle, GraphicType, AspectRatioOption } from './types';
import { 
  FileChartColumn, 
  Image, 
  PieChart, 
  AppWindow, 
  Megaphone,
  Minimize2,
  Building2,
  PenTool,
  Box,
  Frame,
  Tv,
  Tablet,
  Monitor,
  Smartphone,
  Layers,
  Spline,
  Hexagon,
  CircleDot,
  Workflow,
  Shapes
} from 'lucide-react';

export const BRAND_COLORS: BrandColor[] = [
  {
    id: 'tech-blue',
    name: 'Tech Enterprise',
    colors: ['#0B4F6C', '#00A9A5', '#FFFFFF', '#708090'] // Deep Navy, Electric Blue, White, Slate Gray
  },
  {
    id: 'warm-earth',
    name: 'Organic Earth',
    colors: ['#E2725B', '#9DC183', '#F5F5DC', '#36454F'] // Terracotta, Sage Green, Beige, Charcoal
  },
  {
    id: 'monochrome',
    name: 'Sleek Monochrome',
    colors: ['#000000', '#A9A9A9', '#D3D3D3', '#FFFFFF'] // Black, Dark Gray, Light Gray, White
  },
  {
    id: 'vibrant-pop',
    name: 'Vibrant Pop',
    colors: ['#FF69B4', '#00FFFF', '#FFFF00', '#000000'] // Hot Pink, Cyan, Yellow, Black
  }
];

export const VISUAL_STYLES: VisualStyle[] = [
  {
    id: 'minimalist-vector',
    name: 'Minimalist Vector',
    description: 'Flat design, clean lines, no gradients, plenty of whitespace.',
    icon: Minimize2,
    supportedFormats: ['raster', 'vector']
  },
  {
    id: 'corporate-flat',
    name: 'Corporate Flat',
    description: 'Professional, trustworthy, isometric clean shapes.',
    icon: Building2,
    supportedFormats: ['raster', 'vector']
  },
  {
    id: 'hand-drawn',
    name: 'Hand Drawn Sketch',
    description: 'Rough edges, pencil texture, approachable and human.',
    icon: PenTool,
    supportedFormats: ['raster']
  },
  {
    id: '3d-render',
    name: 'Soft 3D Render',
    description: 'Smooth lighting, soft shadows, claymorphism style.',
    icon: Box,
    supportedFormats: ['raster']
  },
  {
    id: 'geometric-abstract',
    name: 'Geometric Abstract',
    description: 'Bold geometric shapes, overlapping forms, vivid color blocking.',
    icon: Hexagon,
    supportedFormats: ['vector']
  },
  {
    id: 'line-art',
    name: 'Line Art',
    description: 'Single-weight continuous strokes, elegant outlines, no fills.',
    icon: Spline,
    supportedFormats: ['vector']
  },
  {
    id: 'isometric',
    name: 'Isometric',
    description: 'Precise 30-degree isometric projection, technical illustration feel.',
    icon: Layers,
    supportedFormats: ['vector']
  },
  {
    id: 'duotone',
    name: 'Duotone',
    description: 'Two-color gradient overlays, modern editorial aesthetic.',
    icon: CircleDot,
    supportedFormats: ['raster', 'vector']
  },
  {
    id: 'flowchart',
    name: 'Diagram / Flowchart',
    description: 'Connected nodes, directional arrows, clear information hierarchy.',
    icon: Workflow,
    supportedFormats: ['vector']
  },
  {
    id: 'flat-icon',
    name: 'Flat Icon Set',
    description: 'Uniform stroke weight, rounded corners, icon-grid consistent.',
    icon: Shapes,
    supportedFormats: ['vector']
  }
];

export const GRAPHIC_TYPES: GraphicType[] = [
  { id: 'infographic', name: 'Infographic', icon: FileChartColumn },
  { id: 'illustration', name: 'Spot Illustration', icon: Image },
  { id: 'chart', name: 'Data Chart', icon: PieChart },
  { id: 'icon', name: 'App Icon', icon: AppWindow },
  { id: 'marketing-banner', name: 'Marketing Banner', icon: Megaphone }
];

export const SUPPORTED_MODELS = [
  {
    id: 'gemini',
    name: 'Nano Banana',
    description: 'Gemini 3 Pro Image Preview',
    format: 'raster' as const
  },
  {
    id: 'openai',
    name: 'GPT Image',
    description: 'OpenAI gpt-image model',
    format: 'raster' as const
  },
  {
    id: 'gemini-svg',
    name: 'Gemini SVG',
    description: 'Gemini 3.1 Pro \u2014 SVG vector graphics',
    format: 'vector' as const
  }
];

export const ASPECT_RATIOS: AspectRatioOption[] = [
  { label: 'Square (1:1)', value: '1:1', icon: Frame },
  { label: 'Tall Portrait (2:3)', value: '2:3', icon: Smartphone },
  { label: 'Classic Photo (3:2)', value: '3:2', icon: Monitor },
  { label: 'Vertical (3:4)', value: '3:4', icon: Tablet },
  { label: 'Presentation (4:3)', value: '4:3', icon: Monitor },
  { label: 'Tall Print (4:5)', value: '4:5', icon: Smartphone },
  { label: 'Slide Friendly (5:4)', value: '5:4', icon: Monitor },
  { label: 'Portrait (9:16)', value: '9:16', icon: Smartphone },
  { label: 'Landscape (16:9)', value: '16:9', icon: Tv },
  { label: 'Ultrawide (21:9)', value: '21:9', icon: Tv }
];

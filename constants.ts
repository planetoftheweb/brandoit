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
  Smartphone
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
    icon: Minimize2
  },
  {
    id: 'corporate-flat',
    name: 'Corporate Flat',
    description: 'Professional, trustworthy, isometric clean shapes.',
    icon: Building2
  },
  {
    id: 'hand-drawn',
    name: 'Hand Drawn Sketch',
    description: 'Rough edges, pencil texture, approachable and human.',
    icon: PenTool
  },
  {
    id: '3d-render',
    name: 'Soft 3D Render',
    description: 'Smooth lighting, soft shadows, claymorphism style.',
    icon: Box
  }
];

export const GRAPHIC_TYPES: GraphicType[] = [
  { id: 'infographic', name: 'Infographic', icon: FileChartColumn },
  { id: 'illustration', name: 'Spot Illustration', icon: Image },
  { id: 'chart', name: 'Data Chart', icon: PieChart },
  { id: 'icon', name: 'App Icon', icon: AppWindow },
  { id: 'marketing-banner', name: 'Marketing Banner', icon: Megaphone }
];

export const ASPECT_RATIOS: AspectRatioOption[] = [
  { label: 'Square (1:1)', value: '1:1', icon: Frame },
  { label: 'Landscape (16:9)', value: '16:9', icon: Tv },
  { label: 'Portrait (9:16)', value: '9:16', icon: Smartphone },
  { label: 'Presentation (4:3)', value: '4:3', icon: Monitor },
  { label: 'Vertical (3:4)', value: '3:4', icon: Tablet }
];
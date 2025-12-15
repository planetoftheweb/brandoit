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
  Square,
  RectangleHorizontal,
  RectangleVertical,
  Monitor,
  Smartphone
} from 'lucide-react';

export const BRAND_COLORS: BrandColor[] = [
  {
    id: 'tech-blue',
    name: 'Tech Enterprise',
    colors: ['Deep Navy', 'Electric Blue', 'White', 'Slate Gray']
  },
  {
    id: 'warm-earth',
    name: 'Organic Earth',
    colors: ['Terracotta', 'Sage Green', 'Beige', 'Charcoal']
  },
  {
    id: 'vibrant-pop',
    name: 'Vibrant Pop',
    colors: ['Hot Pink', 'Cyan', 'Yellow', 'Black']
  },
  {
    id: 'monochrome',
    name: 'Sleek Monochrome',
    colors: ['Black', 'Dark Gray', 'Light Gray', 'White']
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
  { label: 'Square (1:1)', value: '1:1', icon: Square },
  { label: 'Landscape (16:9)', value: '16:9', icon: RectangleHorizontal },
  { label: 'Portrait (9:16)', value: '9:16', icon: RectangleVertical },
  { label: 'Presentation (4:3)', value: '4:3', icon: Monitor },
  { label: 'Vertical (3:4)', value: '3:4', icon: Smartphone }
];
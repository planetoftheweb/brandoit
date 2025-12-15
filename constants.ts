import { VisualStyle, GraphicType, AspectRatioOption } from './types';
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

// Combined Visual Styles + Default Colors
export const VISUAL_STYLES: VisualStyle[] = [
  {
    id: 'minimalist-vector',
    name: 'Minimalist Vector',
    description: 'Flat design, clean lines, no gradients, plenty of whitespace.',
    icon: Minimize2,
    colors: ['Deep Navy', 'Electric Blue', 'White', 'Slate Gray'] // Tech Blue default
  },
  {
    id: 'corporate-flat',
    name: 'Corporate Flat',
    description: 'Professional, trustworthy, isometric clean shapes.',
    icon: Building2,
    colors: ['Terracotta', 'Sage Green', 'Beige', 'Charcoal'] // Organic Earth default
  },
  {
    id: 'hand-drawn',
    name: 'Hand Drawn Sketch',
    description: 'Rough edges, pencil texture, approachable and human.',
    icon: PenTool,
    colors: ['Black', 'Dark Gray', 'Light Gray', 'White'] // Monochrome default
  },
  {
    id: '3d-render',
    name: 'Soft 3D Render',
    description: 'Smooth lighting, soft shadows, claymorphism style.',
    icon: Box,
    colors: ['Hot Pink', 'Cyan', 'Yellow', 'Black'] // Vibrant Pop default
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
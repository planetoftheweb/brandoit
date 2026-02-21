import React, { useState, useRef, useEffect } from 'react';
import { GenerationConfig, BrandColor, VisualStyle, GraphicType, AspectRatioOption, User, Team, SvgMode } from '../types';
import { analyzeImageForOption, expandPrompt } from '../services/geminiService';
import { resourceService } from '../services/resourceService';
import { teamService } from '../services/teamService';
import { SUPPORTED_MODELS } from '../constants';
import { getAspectRatiosForModel } from '../services/aspectRatioService';
import { 
  Palette, 
  PenTool, 
  Layout, 
  Maximize, 
  Sparkles, 
  ChevronDown,
  Check,
  Plus,
  Trash2,
  X,
  Pencil,
  UploadCloud,
  Loader2,
  Image as ImageIcon,
  Globe,
  Lock,
  Users,
  Search,
  Settings,
  Send,
  Wand2,
  Copy,
  RotateCcw,
  Play,
  Pause,
  MousePointer2
} from 'lucide-react';
import { RichSelect } from './RichSelect';

interface ControlPanelProps {
  config: GenerationConfig;
  setConfig: React.Dispatch<React.SetStateAction<GenerationConfig>>;
  onGenerate: () => void;
  isGenerating: boolean;
  options: {
    brandColors: BrandColor[];
    visualStyles: VisualStyle[];
    graphicTypes: GraphicType[];
    aspectRatios: AspectRatioOption[];
  };
  setOptions: {
    setBrandColors: React.Dispatch<React.SetStateAction<BrandColor[]>>;
    setVisualStyles: React.Dispatch<React.SetStateAction<VisualStyle[]>>;
    setGraphicTypes: React.Dispatch<React.SetStateAction<GraphicType[]>>;
    setAspectRatios: React.Dispatch<React.SetStateAction<AspectRatioOption[]>>;
  };
  onUploadGuidelines: (file: File) => void;
  isAnalyzing: boolean;
  user: User | null; // Pass user for contribution
  selectedModel: string;
  onResetToDefaults: () => void;
  onModelChange: (modelId: string) => void;
}

// Modal Component
const Modal = ({ 
  isOpen, 
  onClose, 
  title, 
  children 
}: { 
  isOpen: boolean; 
  onClose: () => void; 
  title: string; 
  children?: React.ReactNode 
}) => {
  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-white dark:bg-[#161b22] border border-gray-200 dark:border-[#30363d] rounded-2xl w-full max-w-md shadow-2xl p-6 relative animate-in zoom-in-95 duration-200 text-slate-900 dark:text-white">
        <div className="flex justify-between items-center mb-6">
          <h3 className="text-lg font-bold">{title}</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-900 dark:hover:text-white p-1 rounded-md hover:bg-gray-100 dark:hover:bg-[#30363d] transition-colors">
            <X size={20} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
};

const DEFAULT_PALETTE_COLOR = '#000000';

let colorParserContext: CanvasRenderingContext2D | null | undefined;

const getColorParserContext = () => {
  if (colorParserContext !== undefined) return colorParserContext;
  if (typeof document === 'undefined') {
    colorParserContext = null;
    return colorParserContext;
  }

  const canvas = document.createElement('canvas');
  canvas.width = 1;
  canvas.height = 1;
  colorParserContext = canvas.getContext('2d');
  return colorParserContext;
};

const stripWrappingQuotes = (value: string) => {
  const trimmed = value.trim();
  if (trimmed.length >= 2) {
    const first = trimmed[0];
    const last = trimmed[trimmed.length - 1];
    if ((first === '"' && last === '"') || (first === "'" && last === "'")) {
      return trimmed.slice(1, -1).trim();
    }
  }
  return trimmed;
};

const normalizeHex = (hexValue: string): string | null => {
  const hex = hexValue.replace(/^#/, '').trim();
  if (!/^[0-9a-fA-F]+$/.test(hex)) return null;

  if (hex.length === 3 || hex.length === 4) {
    const expanded = hex.split('').map(char => `${char}${char}`).join('');
    return `#${expanded.slice(0, 6).toUpperCase()}`;
  }
  if (hex.length === 6 || hex.length === 8) {
    return `#${hex.slice(0, 6).toUpperCase()}`;
  }
  return null;
};

const normalizeColorToken = (rawColor: string): string | null => {
  const input = stripWrappingQuotes(rawColor);
  if (!input) return null;

  const styleProbe = new Option().style;
  styleProbe.color = '';
  styleProbe.color = input;
  if (!styleProbe.color) return null;

  const ctx = getColorParserContext();
  if (!ctx) return null;

  ctx.fillStyle = '#000000';
  ctx.fillStyle = styleProbe.color;
  const parsed = String(ctx.fillStyle).trim();
  if (!parsed || parsed.toLowerCase() === 'transparent') return null;

  if (parsed.startsWith('#')) {
    return normalizeHex(parsed);
  }

  const channels = parsed.match(/[\d.]+%?/g);
  if (!channels || channels.length < 3) return null;

  const rgb = channels.slice(0, 3).map(channel => {
    if (channel.endsWith('%')) {
      const value = Math.max(0, Math.min(100, Number.parseFloat(channel)));
      return Math.round((value / 100) * 255);
    }
    const value = Math.max(0, Math.min(255, Number.parseFloat(channel)));
    return Math.round(value);
  });

  if (rgb.some(channel => Number.isNaN(channel))) return null;

  return `#${rgb.map(channel => channel.toString(16).padStart(2, '0')).join('').toUpperCase()}`;
};

const parseInlineCollectionValues = (value: string) => {
  const trimmed = value.trim();
  if (!trimmed || trimmed === '|' || trimmed === '>') return [];
  if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
    return trimmed
      .slice(1, -1)
      .split(',')
      .map(part => stripWrappingQuotes(part))
      .filter(Boolean);
  }
  return [stripWrappingQuotes(trimmed)].filter(Boolean);
};

const collectStringLeaves = (value: unknown): string[] => {
  if (typeof value === 'string') return [value];
  if (Array.isArray(value)) return value.flatMap(collectStringLeaves);
  if (value && typeof value === 'object') {
    return Object.values(value as Record<string, unknown>).flatMap(collectStringLeaves);
  }
  return [];
};

const parseJsonColorTokens = (input: string): string[] | null => {
  try {
    const parsed = JSON.parse(input);
    return collectStringLeaves(parsed).map(stripWrappingQuotes).filter(Boolean);
  } catch {
    return null;
  }
};

const parseYamlColorTokens = (input: string): string[] => {
  const lines = input.split(/\r?\n/);
  const tokens: string[] = [];
  let inColorBlock = false;
  let colorBlockIndent = -1;

  for (const rawLine of lines) {
    if (!rawLine.trim()) continue;

    const indent = rawLine.match(/^\s*/)?.[0].length ?? 0;
    const line = rawLine.trim();

    if (inColorBlock && indent <= colorBlockIndent && !line.startsWith('-')) {
      inColorBlock = false;
      colorBlockIndent = -1;
    }

    const keyMatch = line.match(/^([A-Za-z0-9_-]+)\s*:\s*(.*)$/);
    if (keyMatch) {
      const key = keyMatch[1].toLowerCase();
      const value = keyMatch[2] ?? '';

      if (key.includes('color')) {
        tokens.push(...parseInlineCollectionValues(value));
        if (!value.trim() || value.trim() === '|' || value.trim() === '>') {
          inColorBlock = true;
          colorBlockIndent = indent;
        } else {
          inColorBlock = false;
          colorBlockIndent = -1;
        }
      } else if (inColorBlock && indent <= colorBlockIndent) {
        inColorBlock = false;
        colorBlockIndent = -1;
      }
      continue;
    }

    if (line.startsWith('-')) {
      tokens.push(stripWrappingQuotes(line.slice(1).trim()));
      continue;
    }

    if (inColorBlock) {
      tokens.push(...parseInlineCollectionValues(line));
    }
  }

  return tokens.filter(Boolean);
};

const parseLooseColorTokens = (input: string) => {
  const regex = /#(?:[0-9a-fA-F]{3,8})\b|(?:rgb|hsl)a?\([^)]+\)/g;
  return input.match(regex) ?? [];
};

const normalizeColorList = (tokens: string[]) => {
  const valid: string[] = [];
  const invalid: string[] = [];
  const seen = new Set<string>();

  for (const token of tokens) {
    const cleaned = stripWrappingQuotes(token);
    if (!cleaned) continue;
    const normalized = normalizeColorToken(cleaned);
    if (normalized) {
      if (!seen.has(normalized)) {
        seen.add(normalized);
        valid.push(normalized);
      }
    } else {
      invalid.push(cleaned);
    }
  }

  return { valid, invalid };
};

type ColorValueFormat = 'HEX' | 'RGB' | 'HSL' | 'NAME' | 'UNKNOWN';

const detectColorFormat = (value: string): ColorValueFormat => {
  const cleaned = stripWrappingQuotes(value).trim();
  if (!cleaned) return 'UNKNOWN';
  if (/^#(?:[0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/.test(cleaned)) return 'HEX';
  if (/^rgba?\(/i.test(cleaned)) return 'RGB';
  if (/^hsla?\(/i.test(cleaned)) return 'HSL';
  if (/^[a-zA-Z-]+$/.test(cleaned)) return 'NAME';
  return 'UNKNOWN';
};

type HsvColor = { h: number; s: number; v: number };

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

const hexToRgbChannels = (hexColor: string) => {
  const cleaned = normalizeHex(hexColor);
  if (!cleaned) return null;
  return {
    r: Number.parseInt(cleaned.slice(1, 3), 16),
    g: Number.parseInt(cleaned.slice(3, 5), 16),
    b: Number.parseInt(cleaned.slice(5, 7), 16)
  };
};

const rgbChannelsToHex = (r: number, g: number, b: number) => {
  const toHex = (channel: number) => clamp(Math.round(channel), 0, 255).toString(16).padStart(2, '0').toUpperCase();
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
};

const rgbChannelsToHsv = (r: number, g: number, b: number): HsvColor => {
  const red = r / 255;
  const green = g / 255;
  const blue = b / 255;
  const max = Math.max(red, green, blue);
  const min = Math.min(red, green, blue);
  const delta = max - min;

  let hue = 0;
  if (delta !== 0) {
    if (max === red) hue = ((green - blue) / delta) % 6;
    else if (max === green) hue = (blue - red) / delta + 2;
    else hue = (red - green) / delta + 4;
  }
  hue = Math.round(hue * 60);
  if (hue < 0) hue += 360;

  const saturation = max === 0 ? 0 : (delta / max) * 100;
  const value = max * 100;

  return { h: clamp(hue, 0, 360), s: clamp(saturation, 0, 100), v: clamp(value, 0, 100) };
};

const hsvToRgbChannels = (h: number, s: number, v: number) => {
  const saturation = clamp(s, 0, 100) / 100;
  const value = clamp(v, 0, 100) / 100;
  const chroma = value * saturation;
  const hueSection = (clamp(h, 0, 360) % 360) / 60;
  const x = chroma * (1 - Math.abs((hueSection % 2) - 1));
  const m = value - chroma;

  let red = 0;
  let green = 0;
  let blue = 0;

  if (hueSection >= 0 && hueSection < 1) [red, green, blue] = [chroma, x, 0];
  else if (hueSection < 2) [red, green, blue] = [x, chroma, 0];
  else if (hueSection < 3) [red, green, blue] = [0, chroma, x];
  else if (hueSection < 4) [red, green, blue] = [0, x, chroma];
  else if (hueSection < 5) [red, green, blue] = [x, 0, chroma];
  else [red, green, blue] = [chroma, 0, x];

  return {
    r: Math.round((red + m) * 255),
    g: Math.round((green + m) * 255),
    b: Math.round((blue + m) * 255)
  };
};

const hexToHsv = (hexColor: string): HsvColor => {
  const rgb = hexToRgbChannels(hexColor);
  if (!rgb) return { h: 0, s: 0, v: 0 };
  return rgbChannelsToHsv(rgb.r, rgb.g, rgb.b);
};

const hsvToHex = (hsv: HsvColor) => {
  const rgb = hsvToRgbChannels(hsv.h, hsv.s, hsv.v);
  return rgbChannelsToHex(rgb.r, rgb.g, rgb.b);
};

const rgbChannelsToHsl = (r: number, g: number, b: number) => {
  const red = r / 255;
  const green = g / 255;
  const blue = b / 255;
  const max = Math.max(red, green, blue);
  const min = Math.min(red, green, blue);
  const delta = max - min;
  const lightness = (max + min) / 2;
  const saturation = delta === 0 ? 0 : delta / (1 - Math.abs(2 * lightness - 1));

  let hue = 0;
  if (delta !== 0) {
    if (max === red) hue = ((green - blue) / delta) % 6;
    else if (max === green) hue = (blue - red) / delta + 2;
    else hue = (red - green) / delta + 4;
  }
  hue = Math.round(hue * 60);
  if (hue < 0) hue += 360;

  return { h: hue, s: Math.round(saturation * 100), l: Math.round(lightness * 100) };
};

const commonHexNames: Record<string, string> = {
  '#000000': 'black',
  '#FFFFFF': 'white',
  '#FF0000': 'red',
  '#00FF00': 'lime',
  '#0000FF': 'blue',
  '#00FFFF': 'aqua',
  '#FF00FF': 'fuchsia',
  '#FFFF00': 'yellow',
  '#008080': 'teal',
  '#FFA500': 'orange',
  '#800080': 'purple',
  '#FFC0CB': 'pink',
  '#808080': 'gray'
};

const formatColorValue = (hexColor: string, format: Exclude<ColorValueFormat, 'UNKNOWN'>, fallbackName?: string) => {
  const normalized = normalizeHex(hexColor) || DEFAULT_PALETTE_COLOR;
  const rgb = hexToRgbChannels(normalized);
  if (!rgb) return normalized;

  if (format === 'HEX') return normalized;
  if (format === 'RGB') return `rgb(${rgb.r}, ${rgb.g}, ${rgb.b})`;
  if (format === 'HSL') {
    const hsl = rgbChannelsToHsl(rgb.r, rgb.g, rgb.b);
    return `hsl(${hsl.h}, ${hsl.s}%, ${hsl.l}%)`;
  }
  if (fallbackName && detectColorFormat(fallbackName) === 'NAME') return fallbackName;
  return commonHexNames[normalized] || normalized;
};

export const ControlPanel: React.FC<ControlPanelProps> = ({
  config,
  setConfig,
  onGenerate,
  isGenerating,
  options,
  setOptions,
  onUploadGuidelines,
  isAnalyzing,
  user,
  selectedModel,
  onResetToDefaults,
  onModelChange
}) => {
  const [activeDropdown, setActiveDropdown] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Modal & Edit State
  const [modalType, setModalType] = useState<'type' | 'style' | 'color' | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  
  // New Item Form State
  const [newItemName, setNewItemName] = useState('');
  const [newItemDescription, setNewItemDescription] = useState('');
  const [newItemColors, setNewItemColors] = useState<string[]>([]);
  
  // Scoping State
  const [itemScope, setItemScope] = useState<'private' | 'public' | 'team'>('private');
  const [selectedTeamId, setSelectedTeamId] = useState<string>('');
  const [userTeams, setUserTeams] = useState<Team[]>([]);
  
  // Search State
  const [searchTerm, setSearchTerm] = useState('');

  const [isAnalysingOption, setIsAnalysingOption] = useState(false);
  const optionFileInputRef = useRef<HTMLInputElement>(null);
  const [isExpandingPrompt, setIsExpandingPrompt] = useState(false);
  const [paletteCopyMessage, setPaletteCopyMessage] = useState<string | null>(null);
  const paletteCopyTimerRef = useRef<number | null>(null);
  const [bulkPaletteInput, setBulkPaletteInput] = useState('');
  const [activeColorIndex, setActiveColorIndex] = useState<number | null>(null);
  const [pickerHsv, setPickerHsv] = useState<HsvColor>({ h: 0, s: 0, v: 0 });
  const [pickerFormat, setPickerFormat] = useState<Exclude<ColorValueFormat, 'UNKNOWN'>>('HEX');
  const [pickerInput, setPickerInput] = useState('');
  const pickerPanelRef = useRef<HTMLDivElement>(null);
  const saturationValueRef = useRef<HTMLDivElement>(null);
  const hueSliderRef = useRef<HTMLDivElement>(null);

  const handleExpandPrompt = async () => {
    if (!config.prompt || isExpandingPrompt) return;
    setIsExpandingPrompt(true);
    try {
      const customKey = user?.preferences?.apiKeys?.[user?.preferences?.selectedModel || 'gemini'] || user?.preferences?.geminiApiKey;
      const expanded = await expandPrompt(config.prompt, config, { ...options, aspectRatios: options.aspectRatios as any }, customKey);
      setConfig(prev => ({ ...prev, prompt: expanded }));
    } catch (err) {
      console.error("Failed to expand prompt:", err);
    } finally {
      setIsExpandingPrompt(false);
    }
  };

  // Load teams when user is present
  useEffect(() => {
    if (user) {
        teamService.getUserTeams(user.id).then(teams => {
            setUserTeams(teams);
            if (teams.length > 0) setSelectedTeamId(teams[0].id);
        });
    }
  }, [user]);

  // Close dropdowns when clicking outside the toolbar
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setActiveDropdown(null);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Clear search when dropdown changes
  useEffect(() => {
    setSearchTerm('');
  }, [activeDropdown]);

  const handleChange = (key: keyof GenerationConfig, value: string) => {
    setConfig(prev => ({ ...prev, [key]: value }));
    setActiveDropdown(null);
  };

  const toggleDropdown = (name: string) => {
    setActiveDropdown(activeDropdown === name ? null : name);
  };

  const handleToggleDefault = async (e: React.MouseEvent, type: 'type'|'style'|'color', item: any) => {
    e.stopPropagation();
    if (!item.id || item.scope === 'system') return; // Cannot toggle already system items easily without unsetting? Wait, we want to toggle.
    // Actually, if it is system, we might want to unset it.
    
    // Logic: If scope is 'system', set to 'public'. If not 'system', set to 'system'.
    const newScope = item.scope === 'system' ? 'public' : 'system';
    
    try {
        let collectionName = '';
        if (type === 'type') collectionName = 'graphic_types';
        else if (type === 'style') collectionName = 'visual_styles';
        else if (type === 'color') collectionName = 'brand_colors';

        await resourceService.updateCustomItem(collectionName, item.id, { scope: newScope, isSystem: newScope === 'system' });
        
        // Optimistic Update
        const updateState = (prev: any[]) => prev.map(x => (x.id === item.id ? { ...x, scope: newScope, isSystem: newScope === 'system' } : x));
        
        if (type === 'type') setOptions.setGraphicTypes(updateState);
        else if (type === 'style') setOptions.setVisualStyles(updateState);
        else if (type === 'color') setOptions.setBrandColors(updateState);

    } catch (e) {
        console.error("Failed to toggle default status", e);
        alert("Failed to update default status.");
    }
  };

  // Grouped List Component
  const GroupedList = ({ items, type, configKey, onSelect }: any) => {
    const filtered = items.filter((item: any) => {
        if (!searchTerm) return true;
        const term = searchTerm.toLowerCase();
        return (item.name || item.label || '').toLowerCase().includes(term) || (item.description || '').toLowerCase().includes(term);
    });

    const groups = {
        default: filtered.filter((i: any) => i.scope === 'system' || (i.isSystem && i.scope !== 'private')), // Fallback for legacy
        private: filtered.filter((i: any) => i.scope === 'private'),
        team: filtered.filter((i: any) => i.scope === 'team'),
        public: filtered.filter((i: any) => i.scope === 'public' && !i.isSystem)
    };

    const renderGroup = (groupItems: any[], title: string) => {
        if (groupItems.length === 0) return null;
        return (
            <div className="mb-2">
                <div className="px-2 py-1 text-[10px] font-bold text-slate-400 uppercase tracking-wider bg-gray-50 dark:bg-[#161b22] sticky top-0 z-10 border-b border-gray-100 dark:border-[#30363d]">
                    {title}
                </div>
                {groupItems.sort((a: any, b: any) => (a.name || a.label).localeCompare(b.name || b.label)).map((item: any) => {
                    const Icon = item.icon || (type === 'type' ? Layout : type === 'style' ? PenTool : type === 'size' ? Maximize : Palette);
                    const isSelected = config[configKey] === (item.id || item.value);
                    
                    return (
                        <div 
                            key={item.id || item.value} 
                            className="group relative flex items-center justify-between p-2 hover:bg-gray-100 dark:hover:bg-[#21262d] rounded-md cursor-pointer" 
                            onClick={() => {
                                handleChange(configKey, item.id || item.value); 
                                setActiveDropdown(null);
                            }}
                        >
                            <div className="flex items-center gap-3 flex-1 min-w-0">
                                <Icon size={16} className={isSelected ? 'text-brand-teal dark:text-brand-teal shrink-0' : 'text-slate-500 shrink-0'} />
                                <div className="flex flex-col min-w-0">
                                    <span className={`text-xs truncate ${isSelected ? 'text-brand-teal dark:text-brand-teal font-bold' : 'text-slate-700 dark:text-slate-300'}`}>
                                        {item.name || item.label}
                                    </span>
                                    {type === 'style' && item.description && (
                                        <span className="text-[10px] text-slate-500 truncate pr-2">
                                            {item.description}
                                        </span>
                                    )}
                                    {type === 'color' && (
                                        <div className="flex h-4 w-24 rounded-sm overflow-hidden ring-1 ring-black/5 mt-1">
                                            {item.colors.map((c: string, i: number) => (
                                                <div key={i} className="flex-1 h-full" style={{ backgroundColor: c }} />
                                            ))}
                                        </div>
                                    )}
                                </div>
                            </div>
                            
                            <div className="flex items-center gap-1">
                                {/* Admin "Make Default" Toggle -- hidden for size (model-locked) */}
                                {type !== 'size' && user?.username === 'planetoftheweb' && (
                                    <button
                                        onClick={(e) => handleToggleDefault(e, type, item)}
                                        className={`p-1.5 rounded-md transition-colors ${
                                            item.scope === 'system' 
                                                ? 'text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20' 
                                                : 'text-slate-300 hover:text-blue-600 hover:bg-gray-100 dark:hover:bg-[#30363d]'
                                        }`}
                                        title={item.scope === 'system' ? "Remove from System Defaults" : "Promote to System Default"}
                                    >
                                        <Settings size={12} fill={item.scope === 'system' ? "currentColor" : "none"} />
                                    </button>
                                )}

                                <ItemActions type={type} item={item} isSelected={isSelected} />
                            </div>
                        </div>
                    );
                })}
            </div>
        );
    };

    return (
        <div className="max-h-60 overflow-y-auto custom-scrollbar p-1 space-y-1">
            {renderGroup(groups.default, 'Defaults')}
            {renderGroup(groups.private, 'Private')}
            {renderGroup(groups.team, 'Team')}
            {renderGroup(groups.public, 'Public')}
            {filtered.length === 0 && (
                <div className="p-4 text-center text-xs text-slate-500">
                    No items found.
                </div>
            )}
        </div>
    );
  };

  const openModal = (type: 'type' | 'style' | 'color') => {
    setModalType(type);
    setActiveDropdown(null); // Close dropdown
    setEditingId(null); // Reset edit state
    setPaletteCopyMessage(null);
    setActiveColorIndex(null);
    setNewItemName('');
    setNewItemDescription('');
    setNewItemColors([DEFAULT_PALETTE_COLOR]); // Default color
    setBulkPaletteInput('');
    
    // Default Scope
    if (user?.preferences?.settings?.contributeByDefault) {
        setItemScope('public');
    } else {
        setItemScope('public');
    }
  };

  const handleEdit = (e: React.MouseEvent, type: 'type' | 'style' | 'color', item: any) => {
    e.stopPropagation();
    setModalType(type);
    setActiveDropdown(null);
    setEditingId(item.id || item.value);
    setActiveColorIndex(null);

    setNewItemName(item.name || item.label);
    setNewItemDescription(item.description || '');
    
    // Set scope if available
    if (item.scope) setItemScope(item.scope);
    if (item.teamId) setSelectedTeamId(item.teamId);

    if (type === 'color') {
      setNewItemColors(item.colors || []);
      setBulkPaletteInput('');
    }
  };

  const closeModal = () => {
    setModalType(null);
    setEditingId(null);
    setPaletteCopyMessage(null);
    setBulkPaletteInput('');
    setActiveColorIndex(null);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      onUploadGuidelines(file);
    }
    // Reset value so same file can be uploaded again if needed
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const file = e.dataTransfer.files?.[0];
    
    if (file && file.type.startsWith('image/')) {
        processOptionFile(file);
    }
  };

  const processOptionFile = async (file: File) => {
    if (!modalType || (modalType !== 'style' && modalType !== 'color')) return;

    setIsAnalysingOption(true);
    try {
      const getActiveApiKey = (): string | undefined => {
        if (!user) return undefined;
        const selectedModel = user.preferences.selectedModel || 'gemini';
        if (user.preferences.apiKeys && user.preferences.apiKeys[selectedModel]) {
          return user.preferences.apiKeys[selectedModel];
        }
        if (selectedModel === 'gemini' && user.preferences.geminiApiKey) {
          return user.preferences.geminiApiKey;
        }
        return undefined;
      };
      const result = await analyzeImageForOption(file, modalType, getActiveApiKey(), user?.preferences.systemPrompt); 
      
      setNewItemName(result.name);
      if (modalType === 'style' && result.description) setNewItemDescription(result.description);
      if (modalType === 'color' && result.colors) setNewItemColors(result.colors);

    } catch (err) {
      console.error("Failed to analyze option image:", err);
    } finally {
      setIsAnalysingOption(false);
      if (optionFileInputRef.current) optionFileInputRef.current.value = '';
    }
  };

  const handleOptionFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
        processOptionFile(file);
    }
  };

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setActiveDropdown(null);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    if (activeColorIndex === null) return;

    const handlePickerOutsideClick = (event: MouseEvent) => {
      if (pickerPanelRef.current && !pickerPanelRef.current.contains(event.target as Node)) {
        setActiveColorIndex(null);
      }
    };

    document.addEventListener('mousedown', handlePickerOutsideClick);
    return () => document.removeEventListener('mousedown', handlePickerOutsideClick);
  }, [activeColorIndex]);

  useEffect(() => {
    if (activeColorIndex !== null && activeColorIndex >= newItemColors.length) {
      setActiveColorIndex(null);
    }
  }, [activeColorIndex, newItemColors.length]);

  useEffect(() => {
    return () => {
      if (paletteCopyTimerRef.current) {
        window.clearTimeout(paletteCopyTimerRef.current);
      }
    };
  }, []);

  const showPaletteCopyMessage = (message: string) => {
    if (paletteCopyTimerRef.current) {
      window.clearTimeout(paletteCopyTimerRef.current);
    }
    setPaletteCopyMessage(message);
    paletteCopyTimerRef.current = window.setTimeout(() => setPaletteCopyMessage(null), 1800);
  };

  const buildPaletteYaml = () => {
    const paletteName = (newItemName.trim() || 'Custom Palette').replace(/"/g, '\\"');
    const normalized = normalizeColorList(newItemColors).valid;
    const colors = (normalized.length > 0 ? normalized : ['#888888']).map(color => color.trim());
    const colorList = colors.map(color => `  - "${color}"`).join('\n');
    return `palette:\n  name: "${paletteName}"\n  colors:\n${colorList}`;
  };

  const fallbackCopyText = (text: string) => {
    const textArea = document.createElement('textarea');
    textArea.value = text;
    textArea.setAttribute('readonly', '');
    textArea.style.position = 'fixed';
    textArea.style.top = '-9999px';
    document.body.appendChild(textArea);
    textArea.select();
    const copied = document.execCommand('copy');
    document.body.removeChild(textArea);
    return copied;
  };

  const handleCopyPaletteYaml = async () => {
    if (modalType !== 'color') return;
    const yaml = buildPaletteYaml();
    try {
      if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
        await navigator.clipboard.writeText(yaml);
      } else if (!fallbackCopyText(yaml)) {
        throw new Error('Clipboard write is not available');
      }
      showPaletteCopyMessage('Palette YAML copied');
    } catch (err) {
      console.error('Failed to copy palette YAML:', err);
      showPaletteCopyMessage('Copy failed');
    }
  };

  const formatBadgeClassMap: Record<ColorValueFormat, string> = {
    HEX: 'bg-cyan-500/10 text-cyan-400 border-cyan-500/30',
    RGB: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30',
    HSL: 'bg-amber-500/10 text-amber-400 border-amber-500/30',
    NAME: 'bg-violet-500/10 text-violet-400 border-violet-500/30',
    UNKNOWN: 'bg-slate-500/10 text-slate-300 border-slate-500/30'
  };

  const setColorAtIndex = (index: number, color: string) => {
    setNewItemColors(prev => prev.map((existing, i) => (i === index ? color : existing)));
  };

  const openColorPicker = (index: number, rawColor?: string) => {
    const source = rawColor ?? newItemColors[index] ?? DEFAULT_PALETTE_COLOR;
    const normalized = normalizeColorToken(source) || DEFAULT_PALETTE_COLOR;
    const detectedFormat = detectColorFormat(source);
    const nextFormat = detectedFormat === 'UNKNOWN' ? 'HEX' : detectedFormat;

    setActiveColorIndex(index);
    setPickerHsv(hexToHsv(normalized));
    setPickerFormat(nextFormat);
    setPickerInput(formatColorValue(normalized, nextFormat, source));
  };

  const handleAddPaletteColor = () => {
    const nextIndex = newItemColors.length;
    setNewItemColors(prev => [...prev, DEFAULT_PALETTE_COLOR]);
    openColorPicker(nextIndex, DEFAULT_PALETTE_COLOR);
  };

  const commitHsv = (updater: (prev: HsvColor) => HsvColor) => {
    if (activeColorIndex === null) return;

    setPickerHsv(prev => {
      const candidate = updater(prev);
      const next = {
        h: clamp(candidate.h, 0, 360),
        s: clamp(candidate.s, 0, 100),
        v: clamp(candidate.v, 0, 100)
      };
      const hex = hsvToHex(next);
      setColorAtIndex(activeColorIndex, hex);
      setPickerFormat('HEX');
      setPickerInput(hex);
      return next;
    });
  };

  const handlePointerDrag = (
    event: React.PointerEvent<HTMLDivElement>,
    onMove: (clientX: number, clientY: number) => void
  ) => {
    event.preventDefault();
    onMove(event.clientX, event.clientY);

    const move = (nextEvent: PointerEvent) => {
      onMove(nextEvent.clientX, nextEvent.clientY);
    };
    const stop = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', stop);
    };

    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', stop);
  };

  const updateSaturationValueFromPointer = (clientX: number, clientY: number) => {
    const element = saturationValueRef.current;
    if (!element) return;

    const rect = element.getBoundingClientRect();
    const x = clamp(clientX - rect.left, 0, rect.width);
    const y = clamp(clientY - rect.top, 0, rect.height);
    const saturation = (x / rect.width) * 100;
    const value = 100 - (y / rect.height) * 100;

    commitHsv(prev => ({ ...prev, s: saturation, v: value }));
  };

  const updateHueFromPointer = (clientX: number) => {
    const element = hueSliderRef.current;
    if (!element) return;

    const rect = element.getBoundingClientRect();
    const x = clamp(clientX - rect.left, 0, rect.width);
    const hue = (x / rect.width) * 360;
    commitHsv(prev => ({ ...prev, h: hue }));
  };

  const handlePickerFormatChange = (format: Exclude<ColorValueFormat, 'UNKNOWN'>) => {
    if (activeColorIndex === null) return;

    const currentRaw = newItemColors[activeColorIndex] ?? DEFAULT_PALETTE_COLOR;
    const normalized = normalizeColorToken(currentRaw) || DEFAULT_PALETTE_COLOR;
    setPickerFormat(format);
    setPickerInput(formatColorValue(normalized, format, currentRaw));
  };

  const applyPickerInput = () => {
    if (activeColorIndex === null) return;
    const normalized = normalizeColorToken(pickerInput);
    if (!normalized) {
      showPaletteCopyMessage(`Invalid color format: ${pickerInput || 'empty value'}`);
      return;
    }

    setColorAtIndex(activeColorIndex, normalized);
    setPickerHsv(hexToHsv(normalized));
    setPickerInput(formatColorValue(normalized, pickerFormat, pickerInput));
  };

  const handleImportColorList = () => {
    if (modalType !== 'color') return;

    if (!bulkPaletteInput.trim()) {
      showPaletteCopyMessage('Paste JSON or YAML with colors first');
      return;
    }

    const jsonTokens = parseJsonColorTokens(bulkPaletteInput) || [];
    const yamlTokens = jsonTokens.length > 0 ? [] : parseYamlColorTokens(bulkPaletteInput);
    const looseTokens = jsonTokens.length > 0 || yamlTokens.length > 0 ? [] : parseLooseColorTokens(bulkPaletteInput);
    const tokens = jsonTokens.length > 0 ? jsonTokens : yamlTokens.length > 0 ? yamlTokens : looseTokens;
    const { valid, invalid } = normalizeColorList(tokens);

    if (valid.length === 0) {
      showPaletteCopyMessage('No valid colors found in JSON/YAML');
      return;
    }

    setNewItemColors(valid);
    showPaletteCopyMessage(
      invalid.length > 0
        ? `Imported ${valid.length} colors (${invalid.length} skipped)`
        : `Imported ${valid.length} colors`
    );
  };

  const handleSaveItem = async () => {
    if (!newItemName) return;

    try {
      if (modalType === 'type') {
        const newType = { name: newItemName, scope: itemScope, teamId: selectedTeamId };
        if (user) {
           if (editingId) {
             const updated = await resourceService.updateCustomItem('graphic_types', editingId, newType);
             setOptions.setGraphicTypes(prev => prev.map(x => x.id === editingId ? { ...x, ...updated } as GraphicType : x));
           } else {
             const saved = await resourceService.addCustomItem('graphic_types', newType, user.id, itemScope, selectedTeamId);
             setOptions.setGraphicTypes(prev => [...prev, saved as GraphicType]);
             handleChange('graphicTypeId', saved.id);
           }
        }
      } 
      else if (modalType === 'style') {
        const newStyle = { name: newItemName, description: newItemDescription || newItemName, scope: itemScope, teamId: selectedTeamId };
        if (user) {
           if (editingId) {
             const updated = await resourceService.updateCustomItem('visual_styles', editingId, newStyle);
             setOptions.setVisualStyles(prev => prev.map(x => x.id === editingId ? { ...x, ...updated } as VisualStyle : x));
           } else {
             const saved = await resourceService.addCustomItem('visual_styles', newStyle, user.id, itemScope, selectedTeamId);
             setOptions.setVisualStyles(prev => [...prev, saved as VisualStyle]);
             handleChange('visualStyleId', saved.id);
           }
        }
      }
      else if (modalType === 'color') {
        const { valid, invalid } = normalizeColorList(newItemColors);
        if (valid.length === 0) {
          showPaletteCopyMessage('Add at least one valid color before saving');
          return;
        }
        if (invalid.length > 0) {
          showPaletteCopyMessage(`Fix invalid colors before saving (${invalid.length})`);
          return;
        }
        const colors = valid.length > 0 ? valid : ['#888888'];
        const newColor = { name: newItemName, colors, scope: itemScope, teamId: selectedTeamId };
        if (user) {
           if (editingId) {
             const updated = await resourceService.updateCustomItem('brand_colors', editingId, newColor);
             setOptions.setBrandColors(prev => prev.map(x => x.id === editingId ? { ...x, ...updated } as BrandColor : x));
           } else {
             const saved = await resourceService.addCustomItem('brand_colors', newColor, user.id, itemScope, selectedTeamId);
             setOptions.setBrandColors(prev => [...prev, saved as BrandColor]);
             handleChange('colorSchemeId', saved.id);
           }
        }
      }
    } catch (e) {
      console.error("Error saving item:", e);
      alert("Failed to save item. Ensure you are logged in.");
    }

    closeModal();
  };

  const handleDelete = async (e: React.MouseEvent, type: 'type'|'style'|'color', idOrValue: string) => {
    e.stopPropagation();
    
    // Optimistic UI Update
    if (type === 'type') {
      setOptions.setGraphicTypes(prev => prev.filter(x => x.id !== idOrValue));
      if (user) resourceService.deleteCustomItem('graphic_types', idOrValue);
    }
    else if (type === 'style') {
      setOptions.setVisualStyles(prev => prev.filter(x => x.id !== idOrValue));
      if (user) resourceService.deleteCustomItem('visual_styles', idOrValue);
    }
    else if (type === 'color') {
      setOptions.setBrandColors(prev => prev.filter(x => x.id !== idOrValue));
      if (user) resourceService.deleteCustomItem('brand_colors', idOrValue);
    }
  };

  const DropdownButton = ({ icon: Icon, label, isActive, onClick, subLabel, colors }: any) => (
    <button
      onClick={onClick}
      className={`h-full px-3 py-2 border rounded-lg flex items-center gap-2 transition-all min-w-[120px] md:min-w-[150px] justify-between group ${
        isActive 
          ? 'bg-gray-100 dark:bg-[#1c2128] border-brand-teal text-brand-teal dark:text-brand-teal' 
          : 'bg-white dark:bg-[#0d1117] border-gray-200 dark:border-[#30363d] text-slate-600 dark:text-slate-300 hover:border-slate-400 dark:hover:border-slate-500 hover:bg-gray-50 dark:hover:bg-[#161b22]'
      }`}
    >
      <div className="flex items-center gap-2.5 overflow-hidden text-left w-full">
        <Icon size={16} className={isActive ? "text-brand-teal dark:text-brand-teal" : "text-slate-500 group-hover:text-slate-700 dark:group-hover:text-slate-400"} />
        <div className="flex flex-col flex-1 min-w-0">
          <span className="text-[11px] uppercase font-bold text-brand-teal leading-none mb-0.5 hidden sm:block">{subLabel}</span>
          <span className="truncate text-base font-semibold text-brand-teal">{label}</span>
          {colors && colors.length > 0 && (
             <div className="flex h-1 mt-1 rounded-sm overflow-hidden ring-1 ring-black/5 dark:ring-white/10 opacity-80">
               {colors.map((hex: string, i: number) => (
                 <div key={i} className="flex-1 h-full" style={{ backgroundColor: hex }} />
               ))}
             </div>
          )}
        </div>
      </div>
      <ChevronDown size={14} className={`transition-transform duration-200 text-slate-500 ml-2 ${isActive ? 'rotate-180 text-brand-teal dark:text-brand-teal' : ''}`} />
    </button>
  );

  const currentType = options.graphicTypes.find(t => t.id === config.graphicTypeId);
  const isSvgModel = SUPPORTED_MODELS.find(m => m.id === selectedModel)?.format === 'vector';
  const filteredStyles = options.visualStyles.filter(s => {
    if (!s.supportedFormats || s.supportedFormats.length === 0) return true;
    return s.supportedFormats.includes(isSvgModel ? 'vector' : 'raster');
  });
  const currentStyle = filteredStyles.find(s => s.id === config.visualStyleId)
    || options.visualStyles.find(s => s.id === config.visualStyleId);
  const currentColor = options.brandColors.find(c => c.id === config.colorSchemeId);
  const modelAspectRatios = getAspectRatiosForModel(selectedModel, options.aspectRatios);
  const currentRatio =
    modelAspectRatios.find(r => r.value === config.aspectRatio) ||
    options.aspectRatios.find(r => r.value === config.aspectRatio);
  const modelLabelMap: Record<string, string> = {
    gemini: 'Nano Banana',
    openai: 'GPT Image',
    'gemini-svg': 'Gemini SVG'
  };
  const modelLabel =
    user?.preferences.modelLabels?.[selectedModel] ||
    modelLabelMap[selectedModel] ||
    SUPPORTED_MODELS.find(m => m.id === selectedModel)?.name ||
    'Model';

  const inputClass = "w-full bg-white dark:bg-[#0d1117] border border-gray-200 dark:border-[#30363d] text-slate-900 dark:text-white text-base rounded-lg p-3.5 focus:outline-none focus:ring-1 focus:ring-brand-red focus:border-brand-red transition-all placeholder-slate-400 dark:placeholder-slate-600";
  const labelClass = "block text-xs md:text-sm font-bold text-slate-500 uppercase tracking-wider mb-1.5 ml-1";

  // Helper to render scope icon
  const ScopeIcon = ({ scope }: { scope?: string }) => {
    if (scope === 'public') return <Globe size={12} className="text-brand-teal" />;
    if (scope === 'team') return <Users size={12} className="text-brand-orange" />;
    if (scope === 'private') return <Lock size={12} className="text-slate-400" />;
    return null; // System items or undefined
  };

  const ItemActions = ({ type, item, isSelected }: { type: 'type'|'style'|'color'|'size', item: any, isSelected: boolean }) => (
    <div className="flex items-center gap-1">
      {/* Scope Badge (Always Visible if not system) */}
      {!item.isSystem && (
         <div className="mr-1 opacity-70" title={item.scope}>
           <ScopeIcon scope={item.scope} />
         </div>
      )}
      
      <div className={`flex items-center gap-1`}>
        {/* Sizes are model-locked -- no edit/delete allowed */}
        {type !== 'size' && user && ((!item.isSystem && item.authorId === user.id) || user.username === 'planetoftheweb') && (
          <>
            <button 
              onClick={(e) => handleEdit(e, type, item)} 
              className="p-1.5 hover:bg-gray-100 dark:hover:bg-[#30363d] rounded-md text-slate-500 hover:text-brand-teal dark:hover:text-brand-teal transition-colors"
              title="Edit"
            >
              <Pencil size={12} />
            </button>
            <button 
              onClick={(e) => handleDelete(e, type, item.id || item.value)} 
              className="p-1.5 hover:bg-gray-100 dark:hover:bg-[#30363d] rounded-md text-slate-500 hover:text-red-500 dark:hover:text-red-400 transition-colors"
              title="Delete"
            >
              <Trash2 size={12} />
            </button>
          </>
        )}
      </div>
      {isSelected && <Check size={14} className="text-brand-teal dark:text-brand-teal ml-1" />}
    </div>
  );

  const SearchInput = () => (
    <div className="p-2 border-b border-gray-200 dark:border-[#30363d] sticky top-0 bg-white dark:bg-[#161b22] z-10">
        <div className="relative">
            <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input 
                type="text" 
                placeholder="Search..." 
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                autoFocus
                className="w-full pl-8 pr-3 py-1.5 text-xs bg-gray-50 dark:bg-[#0d1117] border border-gray-200 dark:border-[#30363d] rounded-md focus:outline-none focus:ring-1 focus:ring-brand-teal text-slate-900 dark:text-white"
            />
        </div>
    </div>
  );

  return (
    <>
      <div className="sticky top-[73px] z-40 w-full bg-white/95 dark:bg-[#0d1117]/95 backdrop-blur-md border-b border-gray-200 dark:border-[#30363d] p-4 transition-colors duration-200" ref={containerRef}>
        <div className="max-w-7xl mx-auto flex flex-col gap-4">
          
          {/* 1. Toolbar Controls */}
          <div className="flex flex-wrap items-center justify-center gap-2 w-full">
            
            {/* Graphic Type */}
            <div className="relative">
              <DropdownButton 
                icon={currentType?.icon || Layout} 
                subLabel="Type" 
                label={currentType?.name || 'Select'} 
                isActive={activeDropdown === 'type'} 
                onClick={() => toggleDropdown('type')} 
              />
              {activeDropdown === 'type' && (
                <div className="absolute top-full left-0 mt-2 w-64 bg-white dark:bg-[#161b22] border border-gray-200 dark:border-[#30363d] rounded-xl shadow-xl z-50 overflow-hidden animate-in fade-in zoom-in-95 duration-150 flex flex-col">
                  {user && <SearchInput />}
                  <GroupedList 
                    items={options.graphicTypes} 
                    type="type" 
                    configKey="graphicTypeId" 
                  />
                  {user && (
                    <button onClick={() => openModal('type')} className="w-full text-left p-3 text-xs font-bold text-brand-teal dark:text-brand-teal border-t border-gray-200 dark:border-[#30363d] hover:bg-gray-100 dark:hover:bg-[#21262d] flex items-center gap-2 transition-colors">
                       <Plus size={14} /> Add Custom Type
                    </button>
                  )}
                </div>
              )}
            </div>

            {/* Visual Style */}
            <div className="relative">
              <DropdownButton 
                icon={currentStyle?.icon || PenTool} 
                subLabel="Style" 
                label={currentStyle?.name || 'Select'} 
                isActive={activeDropdown === 'style'} 
                onClick={() => toggleDropdown('style')} 
              />
               {activeDropdown === 'style' && (
                <div className="absolute top-full left-0 mt-2 w-72 bg-white dark:bg-[#161b22] border border-gray-200 dark:border-[#30363d] rounded-xl shadow-xl z-50 overflow-hidden animate-in fade-in zoom-in-95 duration-150 flex flex-col">
                  {user && <SearchInput />}
                  <GroupedList 
                    items={filteredStyles} 
                    type="style" 
                    configKey="visualStyleId" 
                  />
                  {user && (
                    <button onClick={() => openModal('style')} className="w-full text-left p-3 text-xs font-bold text-brand-teal dark:text-brand-teal border-t border-gray-200 dark:border-[#30363d] hover:bg-gray-100 dark:hover:bg-[#21262d] flex items-center gap-2 transition-colors">
                       <Plus size={14} /> Add Custom Style
                    </button>
                  )}
                </div>
              )}
            </div>

            {/* SVG Mode (only for vector models) */}
            {isSvgModel && (
              <div className="relative">
                <DropdownButton 
                  icon={config.svgMode === 'animated' ? Play : config.svgMode === 'interactive' ? MousePointer2 : Pause} 
                  subLabel="Mode" 
                  label={config.svgMode === 'animated' ? 'Animated' : config.svgMode === 'interactive' ? 'Interactive' : 'Static'} 
                  isActive={activeDropdown === 'svgmode'} 
                  onClick={() => toggleDropdown('svgmode')} 
                />
                {activeDropdown === 'svgmode' && (
                  <div className="absolute top-full left-0 mt-2 w-56 bg-white dark:bg-[#161b22] border border-gray-200 dark:border-[#30363d] rounded-xl shadow-xl z-50 overflow-hidden animate-in fade-in zoom-in-95 duration-150 flex flex-col">
                    {([
                      { id: 'static' as SvgMode, label: 'Static', icon: Pause, desc: 'No animations' },
                      { id: 'animated' as SvgMode, label: 'Animated', icon: Play, desc: 'CSS/SMIL animations' },
                      { id: 'interactive' as SvgMode, label: 'Interactive', icon: MousePointer2, desc: 'Hover & focus states' },
                    ]).map(mode => (
                      <button
                        key={mode.id}
                        onClick={() => {
                          setConfig(prev => ({ ...prev, svgMode: mode.id }));
                          setActiveDropdown(null);
                        }}
                        className={`w-full text-left px-3 py-2.5 text-sm flex items-center gap-2 hover:bg-gray-100 dark:hover:bg-[#21262d] transition-colors ${(config.svgMode || 'static') === mode.id ? 'text-brand-teal font-semibold' : 'text-slate-700 dark:text-slate-200'}`}
                      >
                        <mode.icon size={14} className="text-brand-teal" />
                        <div className="flex flex-col">
                          <span className="font-medium">{mode.label}</span>
                          <span className="text-xs text-slate-500 dark:text-slate-400">{mode.desc}</span>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Color Palette */}
            <div className="relative">
              <DropdownButton 
                icon={Palette} 
                subLabel="Colors" 
                label={currentColor?.name || 'Select'} 
                isActive={activeDropdown === 'color'} 
                onClick={() => toggleDropdown('color')}
                colors={currentColor?.colors}
              />
              {activeDropdown === 'color' && (
                <div className="absolute top-full left-0 mt-2 w-64 bg-white dark:bg-[#161b22] border border-gray-200 dark:border-[#30363d] rounded-xl shadow-xl z-50 overflow-hidden animate-in fade-in zoom-in-95 duration-150 flex flex-col">
                  {user && <SearchInput />}
                  <GroupedList 
                    items={options.brandColors} 
                    type="color" 
                    configKey="colorSchemeId" 
                  />
                  {user && (
                    <button onClick={() => openModal('color')} className="w-full text-left p-3 text-xs font-bold text-brand-red dark:text-brand-orange border-t border-gray-200 dark:border-[#30363d] hover:bg-gray-100 dark:hover:bg-[#21262d] flex items-center gap-2 transition-colors">
                       <Plus size={14} /> Add Custom Palette
                    </button>
                  )}
                </div>
              )}
            </div>

            {/* Aspect Ratio */}
            <div className="relative">
              <DropdownButton 
                icon={currentRatio?.icon || Maximize} 
                subLabel="Size" 
                label={currentRatio?.label.split(' ')[0] || config.aspectRatio} 
                isActive={activeDropdown === 'size'} 
                onClick={() => toggleDropdown('size')} 
              />
              {activeDropdown === 'size' && (
                <div className="absolute top-full left-0 mt-2 w-56 bg-white dark:bg-[#161b22] border border-gray-200 dark:border-[#30363d] rounded-xl shadow-xl z-50 overflow-hidden animate-in fade-in zoom-in-95 duration-150 flex flex-col">
                  {user && <SearchInput />}
                  <GroupedList 
                    items={modelAspectRatios} 
                    type="size" 
                    configKey="aspectRatio" 
                  />
                  <div className="w-full text-left p-3 text-[11px] text-slate-500 border-t border-gray-200 dark:border-[#30363d] bg-gray-50 dark:bg-[#0d1117]">
                    {isSvgModel
                      ? 'SVG: all ratios available (mapped to viewBox).'
                      : selectedModel === 'gemini'
                        ? 'Showing only ratios Nano Banana supports natively.'
                        : 'Showing only ratios GPT Image outputs natively.'}
                  </div>
                </div>
              )}
            </div>
            {/* Model Selector (fancy dropdown) */}
            <div className="relative">
              <DropdownButton 
                icon={Sparkles} 
                subLabel="Model" 
                label={modelLabel} 
                isActive={activeDropdown === 'model'} 
                onClick={() => toggleDropdown('model')} 
              />
              {activeDropdown === 'model' && (
                <div className="absolute top-full left-0 mt-2 w-64 bg-white dark:bg-[#161b22] border border-gray-200 dark:border-[#30363d] rounded-xl shadow-xl z-50 overflow-hidden animate-in fade-in zoom-in-95 duration-150 flex flex-col">
                  {SUPPORTED_MODELS.map(model => (
                    <button
                      key={model.id}
                      onClick={() => {
                        onModelChange(model.id);
                        setActiveDropdown(null);
                      }}
                      className={`w-full text-left px-3 py-2.5 text-sm flex items-center gap-2 hover:bg-gray-100 dark:hover:bg-[#21262d] transition-colors ${selectedModel === model.id ? 'text-brand-teal font-semibold' : 'text-slate-700 dark:text-slate-200'}`}
                    >
                      <Sparkles size={14} className="text-brand-teal" />
                      <div className="flex flex-col">
                        <span className="font-medium">{user?.preferences.modelLabels?.[model.id] || modelLabelMap[model.id] || model.name}</span>
                        <span className="text-xs text-slate-500 dark:text-slate-400">{model.description}</span>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="relative group">
              <button
                type="button"
                onClick={() => {
                  setActiveDropdown(null);
                  onResetToDefaults();
                }}
                className="h-10 w-10 flex items-center justify-center border border-gray-200 dark:border-[#30363d] bg-white dark:bg-[#0d1117] hover:bg-gray-50 dark:hover:bg-[#161b22] text-slate-600 dark:text-slate-300 rounded-lg transition-all"
                title="Reset toolbar to preference defaults"
              >
                <RotateCcw size={16} className="text-brand-teal dark:text-brand-teal" />
                <span className="pointer-events-none absolute top-full mt-2 left-1/2 -translate-x-1/2 whitespace-nowrap text-[11px] font-medium px-2 py-1 rounded-md bg-black/90 text-white shadow-lg opacity-0 group-hover:opacity-100 transition-opacity z-10">
                  Reset defaults
                </span>
              </button>
            </div>

            {user && (
              <>
                <div className="h-8 w-px bg-gray-200 dark:bg-[#30363d] mx-1 hidden sm:block"></div>

                {/* Upload Button - icon only with hover label */}
                 <div className="relative group">
                   <input 
                     type="file" 
                     ref={fileInputRef} 
                     className="hidden" 
                     accept="image/*,application/pdf"
                     onChange={handleFileChange}
                   />
                   <button
                     onClick={() => fileInputRef.current?.click()}
                     disabled={isAnalyzing}
                     className="h-10 w-10 flex items-center justify-center border border-gray-200 dark:border-[#30363d] bg-white dark:bg-[#0d1117] hover:bg-gray-50 dark:hover:bg-[#161b22] text-slate-600 dark:text-slate-300 rounded-lg transition-all"
                     title="Upload Brand Guidelines (PDF or Image)"
                   >
                      {isAnalyzing ? (
                        <Loader2 size={16} className="animate-spin text-brand-teal dark:text-brand-teal" />
                      ) : (
                        <UploadCloud size={16} className="text-brand-teal dark:text-brand-teal" />
                      )}
                      <span className="pointer-events-none absolute top-full mt-2 left-1/2 -translate-x-1/2 whitespace-nowrap text-[11px] font-medium px-2 py-1 rounded-md bg-black/90 text-white shadow-lg opacity-0 group-hover:opacity-100 transition-opacity z-10">
                        Upload brand
                      </span>
                   </button>
                 </div>
              </>
            )}
          </div>

          {/* 2. Prompt Input Area */}
          <div className="w-full max-w-5xl mx-auto flex flex-col sm:flex-row gap-3">
             <div className="relative flex-1">
              <div className="absolute top-1/2 -translate-y-1/2 left-3 text-slate-400 dark:text-slate-500 pointer-events-none">
                <span className="text-sm font-bold uppercase tracking-wider text-brand-teal">Prompt</span>
               </div>
               <input 
                  type="text"
                  value={config.prompt}
                  onChange={(e) => handleChange('prompt', e.target.value)}
                  placeholder="Describe your graphic (e.g. 'A futuristic city chart')..."
                 className="w-full bg-white dark:bg-[#0d1117] border border-gray-200 dark:border-[#30363d] text-slate-900 dark:text-white text-base rounded-lg py-3.5 pl-24 pr-4 focus:outline-none focus:ring-1 focus:ring-brand-red focus:border-brand-red transition-all placeholder-slate-400 dark:placeholder-slate-600 shadow-sm dark:shadow-inner"
                />
             </div>
             
            <div className="flex gap-2 sm:w-auto w-full">
              <button
                type="button"
                onClick={handleExpandPrompt}
                disabled={!config.prompt || isExpandingPrompt}
                className={`flex-1 sm:flex-none relative inline-flex items-center justify-center px-3 py-3 rounded-lg font-semibold border transition-all group ${
                  !config.prompt || isExpandingPrompt
                    ? 'bg-gray-100 dark:bg-[#21262d] text-slate-400 dark:text-slate-500 border-gray-200 dark:border-[#30363d] cursor-not-allowed'
                    : 'bg-white dark:bg-[#161b22] text-slate-800 dark:text-slate-100 border-gray-200 dark:border-[#30363d] hover:bg-brand-teal hover:border-brand-teal hover:text-white shadow-sm'
                }`}
                aria-label="Expand prompt with additional creative detail"
              >
                {isExpandingPrompt ? <Loader2 size={16} className="animate-spin" /> : <Wand2 size={16} />}
                <span className="pointer-events-none absolute -top-9 left-1/2 -translate-x-1/2 whitespace-nowrap text-[11px] font-medium px-2 py-1 rounded-md bg-black/90 text-white shadow-lg opacity-0 group-hover:opacity-100 transition-opacity">
                  Expand prompt
                </span>
              </button>
              
              <button
                onClick={onGenerate}
                disabled={!config.prompt || isGenerating}
                className={`flex-none relative inline-flex items-center justify-center px-5 py-3 rounded-lg font-bold shadow-md transition-all active:translate-y-0.5 sm:w-auto w-full group ${
                  !config.prompt || isGenerating
                    ? 'bg-gray-200 dark:bg-[#21262d] text-slate-400 dark:text-slate-500 cursor-not-allowed'
                    : 'bg-brand-red hover:bg-red-700 text-white shadow-brand-red/20'
                }`}
                aria-label="Generate image"
              >
                {isGenerating ? (
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                ) : (
                  <Send size={16} className="text-white" />
                )}
                <span className="pointer-events-none absolute -top-9 left-1/2 -translate-x-1/2 whitespace-nowrap text-[11px] font-medium px-2 py-1 rounded-md bg-black/90 text-white shadow-lg opacity-0 group-hover:opacity-100 transition-opacity">
                  Generate
                </span>
              </button>
            </div>
          </div>

        </div>
      </div>

      {/* MODAL FOR ADDING/EDITING CUSTOM OPTIONS */}
      <Modal 
        isOpen={!!modalType} 
        onClose={closeModal} 
        title={
          editingId ? 'Edit Option' : 
          modalType === 'type' ? 'Add Custom Graphic Type' :
          modalType === 'style' ? 'Add Custom Brand Style' :
          modalType === 'color' ? 'Add Custom Palette' : ''
        }
      >
        <div className="space-y-4">
          
          {/* Image Upload for Style/Color Auto-fill */}
          {!editingId && (modalType === 'style' || modalType === 'color') && (
            <div 
              className="mb-4 p-6 bg-gray-50 dark:bg-[#0d1117] rounded-lg border-2 border-dashed border-gray-300 dark:border-[#30363d] hover:border-brand-teal dark:hover:border-brand-teal transition-colors text-center cursor-pointer relative"
              onDragOver={handleDragOver}
              onDrop={handleDrop}
              onClick={() => optionFileInputRef.current?.click()}
            >
              <input 
                 type="file" 
                 ref={optionFileInputRef} 
                 className="hidden" 
                 accept="image/*"
                 onChange={handleOptionFileChange}
               />
               <div className="flex flex-col items-center justify-center gap-2 pointer-events-none">
                 {isAnalysingOption ? (
                   <>
                     <Loader2 size={24} className="animate-spin text-brand-teal" />
                     <span className="text-sm font-medium text-slate-600 dark:text-slate-300">Analyzing Image...</span>
                   </>
                 ) : (
                   <>
                     <div className="p-3 bg-white dark:bg-[#161b22] rounded-full shadow-sm text-brand-teal mb-1">
                        <ImageIcon size={20} />
                     </div>
                     <span className="text-sm font-medium text-slate-700 dark:text-slate-200">
                        Click or Drag & Drop Image
                     </span>
                     <p className="text-[10px] text-slate-400">
                       Auto-extract {modalType === 'style' ? 'style description' : 'colors'}
                     </p>
                   </>
                 )}
               </div>
            </div>
          )}

          <div>
            <label className={labelClass}>Name</label>
            <input
              autoFocus
              value={newItemName}
              onChange={(e) => setNewItemName(e.target.value)}
              placeholder="Enter name..."
              className={inputClass}
            />
          </div>

          {modalType === 'style' && (
            <div>
              <label className={labelClass}>Description / Instructions</label>
              <textarea
                value={newItemDescription}
                onChange={(e) => setNewItemDescription(e.target.value)}
                placeholder="Describe the visual style in detail..."
                className={`${inputClass} min-h-[80px] resize-none`}
              />
            </div>
          )}

          {modalType === 'color' && (
            <div ref={pickerPanelRef}>
               <label className={labelClass}>Palette Colors</label>
               <div className="flex flex-wrap items-center gap-2">
                 {newItemColors.map((color, idx) => {
                   const normalizedColor = normalizeColorToken(color) || DEFAULT_PALETTE_COLOR;
                   const isActive = activeColorIndex === idx;
                   return (
                      <div key={idx} className="relative">
                        <button
                          type="button"
                          onClick={() => openColorPicker(idx)}
                          className={`relative w-9 h-9 rounded-full overflow-hidden transition-all ${
                            isActive
                              ? 'ring-2 ring-brand-teal ring-offset-2 ring-offset-white dark:ring-offset-[#161b22] scale-105'
                              : 'ring-1 ring-black/10 dark:ring-white/10 hover:scale-105'
                          }`}
                          style={{ backgroundColor: normalizedColor }}
                          title={`Edit color ${idx + 1}`}
                        >
                          <span className="absolute inset-0 bg-gradient-to-br from-white/20 via-transparent to-black/20" />
                        </button>
                        {newItemColors.length > 1 && (
                          <button
                            type="button"
                            onClick={() => {
                              setNewItemColors(newItemColors.filter((_, i) => i !== idx));
                            }}
                            className="absolute -top-1 -right-1 h-4 w-4 flex items-center justify-center rounded-full bg-white dark:bg-[#1f2937] border border-gray-200 dark:border-[#30363d] text-slate-500 hover:text-red-400 transition-colors"
                            title="Remove color"
                          >
                            <X size={10} />
                          </button>
                        )}
                      </div>
                   );
                 })}
                 <button
                   type="button"
                   onClick={handleAddPaletteColor}
                   className="h-9 px-3 rounded-full border border-dashed border-slate-300 dark:border-slate-600 text-xs font-semibold text-slate-500 hover:text-brand-teal hover:border-brand-teal transition-colors flex items-center gap-1"
                   title="Add Color"
                 >
                   <Plus size={12} />
                   Add
                 </button>
               </div>

               {activeColorIndex !== null && (
                 <div className="mt-3 rounded-2xl border border-gray-200 dark:border-[#30363d] bg-gradient-to-br from-white to-slate-50 dark:from-[#111827] dark:to-[#0b1220] p-3 shadow-xl shadow-slate-900/10 dark:shadow-black/30 space-y-2.5">
                   <div className="flex items-center justify-between gap-2">
                     <div className="flex items-center gap-2 min-w-0">
                       <div
                         className="w-6 h-6 rounded-md ring-1 ring-black/10 dark:ring-white/10 shrink-0"
                         style={{ backgroundColor: hsvToHex(pickerHsv) }}
                       />
                       <span className="text-xs font-semibold text-slate-700 dark:text-slate-200 truncate">
                         Edit color {activeColorIndex + 1}
                       </span>
                     </div>
                     <button
                       type="button"
                       onClick={() => setActiveColorIndex(null)}
                       className="p-1 rounded-md text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 hover:bg-gray-200/70 dark:hover:bg-[#1f2937] transition-colors"
                       title="Close color picker"
                     >
                       <X size={14} />
                     </button>
                   </div>

                   <div
                     ref={saturationValueRef}
                     className="relative h-32 rounded-xl overflow-hidden cursor-crosshair ring-1 ring-black/10 dark:ring-white/10"
                     style={{ backgroundColor: `hsl(${pickerHsv.h} 100% 50%)` }}
                     onPointerDown={(event) => handlePointerDrag(event, updateSaturationValueFromPointer)}
                   >
                     <div className="absolute inset-0 bg-gradient-to-r from-white to-transparent" />
                     <div className="absolute inset-0 bg-gradient-to-t from-black to-transparent" />
                     <div
                       className="absolute w-3.5 h-3.5 rounded-full border-2 border-white shadow-lg ring-1 ring-black/40 -translate-x-1/2 -translate-y-1/2 pointer-events-none"
                       style={{ left: `${pickerHsv.s}%`, top: `${100 - pickerHsv.v}%` }}
                     />
                   </div>

                   <div
                     ref={hueSliderRef}
                     className="relative h-3 rounded-full overflow-hidden cursor-ew-resize ring-1 ring-black/10 dark:ring-white/10 bg-[linear-gradient(90deg,#ff0000,#ffff00,#00ff00,#00ffff,#0000ff,#ff00ff,#ff0000)]"
                     onPointerDown={(event) => handlePointerDrag(event, (clientX) => updateHueFromPointer(clientX))}
                   >
                     <div
                       className="absolute top-1/2 w-3.5 h-3.5 rounded-full border-2 border-white shadow-md ring-1 ring-black/30 -translate-x-1/2 -translate-y-1/2 pointer-events-none"
                       style={{ left: `${(pickerHsv.h / 360) * 100}%` }}
                     />
                   </div>

                   <div className="flex items-center gap-2">
                     <div className="inline-flex rounded-lg border border-gray-200 dark:border-[#30363d] overflow-hidden shrink-0">
                       {(['HEX', 'RGB', 'HSL', 'NAME'] as const).map(format => (
                         <button
                           key={format}
                           type="button"
                           onClick={() => handlePickerFormatChange(format)}
                           className={`px-2 py-1 text-[10px] font-semibold transition-colors ${
                             pickerFormat === format
                               ? 'bg-brand-teal/15 text-brand-teal'
                               : 'bg-white dark:bg-[#0d1117] text-slate-500 dark:text-slate-300 hover:text-brand-teal'
                           }`}
                         >
                           {format}
                         </button>
                       ))}
                     </div>
                     <div className="relative flex-1 min-w-0">
                       <input
                         type="text"
                         value={pickerInput}
                         onChange={(event) => setPickerInput(event.target.value)}
                         onKeyDown={(event) => {
                           if (event.key === 'Enter') {
                             event.preventDefault();
                             applyPickerInput();
                           }
                         }}
                         placeholder="#0B4F6C, rgb(...), hsl(...), teal"
                         className="w-full bg-white dark:bg-[#0d1117] border border-gray-200 dark:border-[#30363d] rounded-lg px-3 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-brand-teal text-slate-900 dark:text-white"
                       />
                       <span className={`absolute right-2 top-1/2 -translate-y-1/2 px-1.5 py-0.5 rounded-md border text-[9px] font-bold ${formatBadgeClassMap[pickerFormat]}`}>
                         {pickerFormat}
                       </span>
                     </div>
                     <button
                       type="button"
                       onClick={applyPickerInput}
                       className="px-2.5 py-1.5 rounded-lg bg-brand-teal/15 text-brand-teal border border-brand-teal/40 text-[10px] font-semibold hover:bg-brand-teal/25 transition-colors shrink-0"
                     >
                       Apply
                     </button>
                   </div>
                 </div>
               )}

               <div className="mt-3">
                 <label className="block text-[11px] font-bold uppercase tracking-wide text-slate-500 mb-1">
                   Paste Colors (JSON or YAML)
                 </label>
                 <textarea
                   value={bulkPaletteInput}
                   onChange={(e) => setBulkPaletteInput(e.target.value)}
                   placeholder={'["#0B4F6C", "rgb(0, 169, 165)"]\n\ncolors:\n  - "#0B4F6C"\n  - hsl(178, 100%, 33%)'}
                   className="w-full min-h-[92px] resize-y bg-white dark:bg-[#0d1117] border border-gray-200 dark:border-[#30363d] rounded-lg px-3 py-2 text-xs leading-5 focus:outline-none focus:ring-1 focus:ring-brand-teal text-slate-900 dark:text-white"
                 />
                 <button
                   type="button"
                   onClick={handleImportColorList}
                   className="mt-2 inline-flex items-center gap-1 rounded-md border border-gray-200 dark:border-[#30363d] px-2 py-1 text-[11px] font-semibold text-slate-600 dark:text-slate-300 hover:bg-gray-100 dark:hover:bg-[#21262d] transition-colors"
                 >
                   <UploadCloud size={12} />
                   Import Colors
                 </button>
               </div>

               <div className="mt-3 flex items-center justify-between gap-2">
                 <p className="text-[10px] text-slate-400">
                   Use the picker or enter hex, rgb, hsl, or named colors.
                 </p>
                 <button
                   type="button"
                   onClick={handleCopyPaletteYaml}
                   className="inline-flex items-center gap-1 rounded-md border border-gray-200 dark:border-[#30363d] px-2 py-1 text-[11px] font-semibold text-slate-600 dark:text-slate-300 hover:bg-gray-100 dark:hover:bg-[#21262d] transition-colors"
                 >
                   <Copy size={12} />
                   Copy YAML
                 </button>
               </div>
               {paletteCopyMessage && (
                 <p className="text-[10px] text-brand-teal mt-1">{paletteCopyMessage}</p>
               )}
            </div>
          )}

          {/* --- NEW SCOPE SELECTOR --- */}
          {user && (
             <div className="pt-4 border-t border-gray-100 dark:border-[#30363d] space-y-3">
                <label className={labelClass}>Visibility & Sharing</label>
                <div className="grid grid-cols-3 gap-2">
                   <button
                     onClick={() => setItemScope('private')}
                     className={`flex flex-col items-center gap-1 p-2 rounded-lg border text-xs font-medium transition-all ${
                       itemScope === 'private'
                        ? 'bg-slate-100 dark:bg-[#21262d] border-slate-400 dark:border-slate-500 text-slate-900 dark:text-white ring-1 ring-slate-400'
                        : 'bg-white dark:bg-[#0d1117] border-gray-200 dark:border-[#30363d] text-slate-500 hover:bg-gray-50 dark:hover:bg-[#161b22]'
                     }`}
                   >
                     <Lock size={16} />
                     Private
                   </button>
                   <button
                     onClick={() => setItemScope('public')}
                     className={`flex flex-col items-center gap-1 p-2 rounded-lg border text-xs font-medium transition-all ${
                       itemScope === 'public'
                        ? 'bg-teal-50 dark:bg-teal-900/20 border-brand-teal text-brand-teal ring-1 ring-brand-teal'
                        : 'bg-white dark:bg-[#0d1117] border-gray-200 dark:border-[#30363d] text-slate-500 hover:bg-gray-50 dark:hover:bg-[#161b22]'
                     }`}
                   >
                     <Globe size={16} />
                     Public
                   </button>
                   <button
                     onClick={() => setItemScope('team')}
                     disabled={userTeams.length === 0}
                     className={`flex flex-col items-center gap-1 p-2 rounded-lg border text-xs font-medium transition-all ${
                       itemScope === 'team'
                        ? 'bg-orange-50 dark:bg-orange-900/20 border-brand-orange text-brand-orange ring-1 ring-brand-orange'
                        : 'bg-white dark:bg-[#0d1117] border-gray-200 dark:border-[#30363d] text-slate-500 hover:bg-gray-50 dark:hover:bg-[#161b22] disabled:opacity-50 disabled:cursor-not-allowed'
                     }`}
                   >
                     <Users size={16} />
                     Team
                   </button>
                </div>

                {/* Team Selection Dropdown */}
                {itemScope === 'team' && (
                  <div className="animate-in fade-in slide-in-from-top-2">
                    <RichSelect
                      value={selectedTeamId}
                      onChange={setSelectedTeamId}
                      options={userTeams.map(team => ({ value: team.id, label: team.name }))}
                      placeholder={userTeams.length > 0 ? 'Select a team' : 'No teams available'}
                      disabled={userTeams.length === 0}
                      compact
                    />
                  </div>
                )}
             </div>
          )}

          <div className="pt-4 flex gap-3">
             <button 
                onClick={closeModal}
                className="flex-1 py-2.5 rounded-lg border border-gray-200 dark:border-[#30363d] text-slate-600 dark:text-slate-300 hover:bg-gray-100 dark:hover:bg-[#21262d] font-medium text-sm transition-colors"
             >
               Cancel
             </button>
             <button 
                onClick={handleSaveItem}
                disabled={!newItemName}
                className="flex-1 py-2.5 rounded-lg bg-brand-red hover:bg-red-700 text-white font-medium text-sm shadow-lg shadow-brand-red/20 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
             >
               {editingId ? 'Update' : 'Save'} Option
             </button>
          </div>
        </div>
      </Modal>
    </>
  );
};

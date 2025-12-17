import React, { useState, useRef, useEffect } from 'react';
import { GenerationConfig, BrandColor, VisualStyle, GraphicType, AspectRatioOption, User, Team } from '../types';
import { analyzeImageForOption, expandPrompt } from '../services/geminiService';
import { resourceService } from '../services/resourceService';
import { teamService } from '../services/teamService';
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
  Wand2
} from 'lucide-react';

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

export const ControlPanel: React.FC<ControlPanelProps> = ({
  config,
  setConfig,
  onGenerate,
  isGenerating,
  options,
  setOptions,
  onUploadGuidelines,
  isAnalyzing,
  user
}) => {
  const [activeDropdown, setActiveDropdown] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Modal & Edit State
  const [modalType, setModalType] = useState<'type' | 'style' | 'color' | 'size' | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  
  // New Item Form State
  const [newItemName, setNewItemName] = useState('');
  const [newItemDescription, setNewItemDescription] = useState('');
  const [newItemColors, setNewItemColors] = useState<string[]>([]);
  const [newItemValue, setNewItemValue] = useState(''); // Used for aspect ratio value
  
  // Scoping State
  const [itemScope, setItemScope] = useState<'private' | 'public' | 'team'>('private');
  const [selectedTeamId, setSelectedTeamId] = useState<string>('');
  const [userTeams, setUserTeams] = useState<Team[]>([]);
  
  // Search State
  const [searchTerm, setSearchTerm] = useState('');

  const [isAnalysingOption, setIsAnalysingOption] = useState(false);
  const optionFileInputRef = useRef<HTMLInputElement>(null);
  const [isExpandingPrompt, setIsExpandingPrompt] = useState(false);

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

  const handleToggleDefault = async (e: React.MouseEvent, type: 'type'|'style'|'color'|'size', item: any) => {
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
        else if (type === 'size') collectionName = 'aspect_ratios';

        await resourceService.updateCustomItem(collectionName, item.id, { scope: newScope, isSystem: newScope === 'system' });
        
        // Optimistic Update
        const updateState = (prev: any[]) => prev.map(x => (x.id === item.id ? { ...x, scope: newScope, isSystem: newScope === 'system' } : x));
        
        if (type === 'type') setOptions.setGraphicTypes(updateState);
        else if (type === 'style') setOptions.setVisualStyles(updateState);
        else if (type === 'color') setOptions.setBrandColors(updateState);
        else if (type === 'size') setOptions.setAspectRatios(updateState);

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
                                {/* Admin "Make Default" Toggle */}
                                {user?.username === 'planetoftheweb' && (
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

  const openModal = (type: 'type' | 'style' | 'color' | 'size') => {
    setModalType(type);
    setActiveDropdown(null); // Close dropdown
    setEditingId(null); // Reset edit state
    setNewItemName('');
    setNewItemDescription('');
    setNewItemColors(['#000000']); // Default color
    setNewItemValue('');
    
    // Default Scope
    if (user?.preferences?.settings?.contributeByDefault) {
        setItemScope('public');
    } else {
        setItemScope('public');
    }
  };

  const handleEdit = (e: React.MouseEvent, type: 'type' | 'style' | 'color' | 'size', item: any) => {
    e.stopPropagation();
    setModalType(type);
    setActiveDropdown(null);
    setEditingId(item.id || item.value);

    setNewItemName(item.name || item.label);
    setNewItemDescription(item.description || '');
    
    // Set scope if available
    if (item.scope) setItemScope(item.scope);
    if (item.teamId) setSelectedTeamId(item.teamId);

    if (type === 'color') {
      setNewItemColors(item.colors || []);
    } else if (type === 'size') {
      setNewItemValue(item.value);
    }
  };

  const closeModal = () => {
    setModalType(null);
    setEditingId(null);
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
        const colors = newItemColors.length > 0 ? newItemColors : ['#888888'];
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
      else if (modalType === 'size') {
        const newVal = newItemValue.trim() || '1:1';
        const newSize = { label: newItemName, value: newVal, scope: itemScope, teamId: selectedTeamId };
        if (user) {
           if (editingId) {
              // Note: Sizes use value as ID sometimes, but editingId should be the doc ID if coming from DB
              // If it's a local edit of a temp item, this might fail, but we only allow editing owned items which have IDs.
              // Wait, aspect ratios in constants don't have IDs, they use value. 
              // But custom ones from Firestore DO have IDs.
              // Let's assume editingId is the Firestore ID.
              await resourceService.updateCustomItem('aspect_ratios', editingId, newSize);
              setOptions.setAspectRatios(prev => prev.map(x => (x as any).id === editingId ? { ...x, ...newSize } : x));
           } else {
              const saved = await resourceService.addCustomItem('aspect_ratios', newSize, user.id, itemScope, selectedTeamId);
              setOptions.setAspectRatios(prev => [...prev, saved as AspectRatioOption]);
              handleChange('aspectRatio', saved.value);
           }
        }
      }

    } catch (e) {
      console.error("Error saving item:", e);
      alert("Failed to save item. Ensure you are logged in.");
    }

    closeModal();
  };

  const handleDelete = async (e: React.MouseEvent, type: 'type'|'style'|'color'|'size', idOrValue: string) => {
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
    else if (type === 'size') {
      setOptions.setAspectRatios(prev => prev.filter(x => x.value !== idOrValue));
      if (user) resourceService.deleteCustomItem('aspect_ratios', idOrValue); 
      // Note: Delete by ID not value for consistency, but resourceService expects ID. 
      // If 'idOrValue' is ID, we are good.
    }
  };

  const DropdownButton = ({ icon: Icon, label, isActive, onClick, subLabel, colors }: any) => (
    <button
      onClick={onClick}
      className={`h-full px-3 py-2 border rounded-lg flex items-center gap-2 transition-all min-w-[140px] md:min-w-[160px] justify-between group ${
        isActive 
          ? 'bg-gray-100 dark:bg-[#1c2128] border-brand-teal text-brand-teal dark:text-brand-teal' 
          : 'bg-white dark:bg-[#0d1117] border-gray-200 dark:border-[#30363d] text-slate-600 dark:text-slate-300 hover:border-slate-400 dark:hover:border-slate-500 hover:bg-gray-50 dark:hover:bg-[#161b22]'
      }`}
    >
      <div className="flex items-center gap-2.5 overflow-hidden text-left w-full">
        <Icon size={16} className={isActive ? "text-brand-teal dark:text-brand-teal" : "text-slate-500 group-hover:text-slate-700 dark:group-hover:text-slate-400"} />
        <div className="flex flex-col flex-1 min-w-0">
          <span className="text-[10px] uppercase font-bold text-slate-500 leading-none mb-0.5">{subLabel}</span>
          <span className="truncate text-xs font-medium">{label}</span>
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
  const currentStyle = options.visualStyles.find(s => s.id === config.visualStyleId);
  const currentColor = options.brandColors.find(c => c.id === config.colorSchemeId);
  const currentRatio = options.aspectRatios.find(r => r.value === config.aspectRatio);

  const inputClass = "w-full bg-white dark:bg-[#0d1117] border border-gray-200 dark:border-[#30363d] text-slate-900 dark:text-white text-sm rounded-lg p-3 focus:outline-none focus:ring-1 focus:ring-brand-red focus:border-brand-red transition-all placeholder-slate-400 dark:placeholder-slate-600";
  const labelClass = "block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5 ml-1";

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
        {/* Show edit/delete only if user is logged in AND (owns item OR is admin) */}
        {user && ((!item.isSystem && item.authorId === user.id) || user.username === 'planetoftheweb') && (
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
                    items={options.visualStyles} 
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
                    items={options.aspectRatios} 
                    type="size" 
                    configKey="aspectRatio" 
                  />
                  {user && (
                    <button onClick={() => openModal('size')} className="w-full text-left p-3 text-xs font-bold text-brand-teal dark:text-brand-teal border-t border-gray-200 dark:border-[#30363d] hover:bg-gray-100 dark:hover:bg-[#21262d] flex items-center gap-2 transition-colors">
                       <Plus size={14} /> Add Custom Size
                    </button>
                  )}
                </div>
              )}
            </div>

            {user && (
              <>
                <div className="h-8 w-px bg-gray-200 dark:bg-[#30363d] mx-1 hidden sm:block"></div>

                {/* Upload Button */}
                 <div className="relative">
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
                     className="h-full px-3 py-2 border border-gray-200 dark:border-[#30363d] bg-white dark:bg-[#0d1117] hover:bg-gray-50 dark:hover:bg-[#161b22] text-slate-600 dark:text-slate-300 rounded-lg flex items-center gap-2 transition-all min-w-[100px] group"
                     title="Upload Brand Guidelines (PDF or Image)"
                   >
                      {isAnalyzing ? (
                        <Loader2 size={16} className="animate-spin text-brand-teal dark:text-brand-teal" />
                      ) : (
                        <UploadCloud size={16} className="text-brand-teal dark:text-brand-teal" />
                      )}
                      <div className="flex flex-col text-left">
                        <span className="text-[10px] uppercase font-bold text-slate-500 leading-none mb-0.5">Brand</span>
                        <span className="text-xs font-medium">Upload</span>
                      </div>
                   </button>
                 </div>
              </>
            )}
          </div>

          {/* 2. Prompt Input Area */}
          <div className="w-full max-w-5xl mx-auto flex flex-col sm:flex-row gap-3">
             <div className="relative flex-1">
               <div className="absolute top-1/2 -translate-y-1/2 left-3 text-slate-400 dark:text-slate-500 pointer-events-none">
                 <span className="text-xs font-bold uppercase tracking-wider">Prompt</span>
               </div>
               <input 
                  type="text"
                  value={config.prompt}
                  onChange={(e) => handleChange('prompt', e.target.value)}
                  placeholder="Describe your graphic (e.g. 'A futuristic city chart')..."
                  className="w-full bg-white dark:bg-[#0d1117] border border-gray-200 dark:border-[#30363d] text-slate-900 dark:text-white text-sm rounded-lg py-3 pl-20 pr-4 focus:outline-none focus:ring-1 focus:ring-brand-red focus:border-brand-red transition-all placeholder-slate-400 dark:placeholder-slate-600 shadow-sm dark:shadow-inner"
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
          modalType === 'color' ? 'Add Custom Palette' :
          modalType === 'size' ? 'Add Custom Size' : ''
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
            <label className={labelClass}>
              {modalType === 'size' ? 'Label (e.g. Ultrawide)' : 'Name'}
            </label>
            <input
              autoFocus
              value={newItemName}
              onChange={(e) => setNewItemName(e.target.value)}
              placeholder={modalType === 'size' ? 'Ultrawide Display' : 'Enter name...'}
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
            <div>
               <label className={labelClass}>Palette Colors</label>
               <div className="flex flex-wrap gap-2">
                 {newItemColors.map((color, idx) => (
                   <div key={idx} className="relative group/color">
                     <div 
                       className="w-8 h-8 rounded-full shadow-sm ring-1 ring-black/10 dark:ring-white/10 overflow-hidden cursor-pointer"
                       style={{ backgroundColor: color }}
                     >
                       <input 
                         type="color" 
                         value={color}
                         onChange={(e) => {
                           const newColors = [...newItemColors];
                           newColors[idx] = e.target.value;
                           setNewItemColors(newColors);
                         }}
                         className="opacity-0 w-full h-full cursor-pointer"
                       />
                     </div>
                     {newItemColors.length > 1 && (
                       <button 
                         onClick={() => {
                           setNewItemColors(newItemColors.filter((_, i) => i !== idx));
                         }}
                         className="absolute -top-1 -right-1 bg-white dark:bg-[#30363d] text-slate-500 rounded-full p-0.5 shadow-md opacity-0 group-hover/color:opacity-100 transition-opacity hover:text-red-500"
                       >
                         <X size={10} />
                       </button>
                     )}
                   </div>
                 ))}
                 <button 
                   onClick={() => setNewItemColors([...newItemColors, '#000000'])}
                   className="w-8 h-8 rounded-full border border-dashed border-slate-300 dark:border-slate-600 flex items-center justify-center text-slate-400 hover:text-brand-teal hover:border-brand-teal transition-colors"
                   title="Add Color"
                 >
                   <Plus size={14} />
                 </button>
               </div>
               <p className="text-[10px] text-slate-400 mt-2">
                 Click a circle to pick a color.
               </p>
            </div>
          )}

          {modalType === 'size' && (
            <div>
              <label className={labelClass}>Ratio Value</label>
              <input
                value={newItemValue}
                onChange={(e) => setNewItemValue(e.target.value)}
                placeholder="e.g. 21:9"
                className={inputClass}
              />
            </div>
          )}

          {/* --- NEW SCOPE SELECTOR --- */}
          {user && modalType !== 'size' && (
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
                    <select
                      value={selectedTeamId}
                      onChange={(e) => setSelectedTeamId(e.target.value)}
                      className="w-full bg-white dark:bg-[#0d1117] border border-gray-200 dark:border-[#30363d] rounded-lg p-2 text-xs focus:ring-1 focus:ring-brand-orange focus:outline-none"
                    >
                      {userTeams.map(t => (
                        <option key={t.id} value={t.id}>{t.name}</option>
                      ))}
                    </select>
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

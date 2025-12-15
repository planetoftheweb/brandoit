import React, { useState, useRef, useEffect } from 'react';
import { GenerationConfig, BrandColor, VisualStyle, GraphicType, AspectRatioOption, User } from '../types';
import { analyzeImageForOption } from '../services/geminiService';
import { catalogService } from '../services/catalogService';
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
  Globe
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
  const [contributeToCatalog, setContributeToCatalog] = useState(false);
  
  const [isAnalysingOption, setIsAnalysingOption] = useState(false);
  const optionFileInputRef = useRef<HTMLInputElement>(null);

  const handleChange = (key: keyof GenerationConfig, value: string) => {
    setConfig(prev => ({ ...prev, [key]: value }));
    setActiveDropdown(null);
  };

  const toggleDropdown = (name: string) => {
    setActiveDropdown(activeDropdown === name ? null : name);
  };

  const openModal = (type: 'type' | 'style' | 'color' | 'size') => {
    setModalType(type);
    setActiveDropdown(null); // Close dropdown
    setEditingId(null); // Reset edit state
    setNewItemName('');
    setNewItemDescription('');
    setNewItemColors(['#000000']); // Default color
    setNewItemValue('');
    // Default to user preference for contribution, defaulting to false if not set
    setContributeToCatalog(user?.preferences?.settings?.contributeByDefault ?? false);
  };

  const handleEdit = (e: React.MouseEvent, type: 'type' | 'style' | 'color' | 'size', item: any) => {
    e.stopPropagation();
    setModalType(type);
    setActiveDropdown(null);
    setEditingId(item.id || item.value);

    setNewItemName(item.name || item.label);
    setNewItemDescription(item.description || '');
    
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
        // Need to simulate an event or directly call the handler
        // Since handleOptionFileChange expects a ChangeEvent, let's create a simpler handler 
        // or refactor the logic.
        
        // Let's refactor the core logic out of the event handler
        processOptionFile(file);
    }
  };

  const processOptionFile = async (file: File) => {
    if (!modalType || (modalType !== 'style' && modalType !== 'color')) return;

    setIsAnalysingOption(true);
    try {
      const result = await analyzeImageForOption(file, modalType); 
      
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

    let newItem: any = null;
    let typeForCatalog: 'style' | 'color' | 'type' | null = null;

    if (modalType === 'type') {
      const newId = editingId || `custom-type-${Date.now()}`;
      const newType: GraphicType = { id: newId, name: newItemName };
      
      if (editingId) {
        setOptions.setGraphicTypes(prev => prev.map(item => item.id === editingId ? { ...item, name: newItemName } : item));
      } else {
        setOptions.setGraphicTypes(prev => [...prev, newType]);
        handleChange('graphicTypeId', newId);
        newItem = newType;
        typeForCatalog = 'type';
      }
    } 
    else if (modalType === 'style') {
      const newId = editingId || `custom-style-${Date.now()}`;
      const newStyle: VisualStyle = { id: newId, name: newItemName, description: newItemDescription || newItemName };
      
      if (editingId) {
        setOptions.setVisualStyles(prev => prev.map(item => item.id === editingId ? { ...item, name: newItemName, description: newItemDescription || newItemName } : item));
      } else {
        setOptions.setVisualStyles(prev => [...prev, newStyle]);
        handleChange('visualStyleId', newId);
        newItem = newStyle;
        typeForCatalog = 'style';
      }
    }
    else if (modalType === 'color') {
      const colors = newItemColors.length > 0 ? newItemColors : ['#888888'];
      const newId = editingId || `custom-color-${Date.now()}`;
      const newColor: BrandColor = { id: newId, name: newItemName, colors };

      if (editingId) {
        setOptions.setBrandColors(prev => prev.map(item => item.id === editingId ? { ...item, name: newItemName, colors } : item));
      } else {
        setOptions.setBrandColors(prev => [...prev, newColor]);
        handleChange('colorSchemeId', newId);
        newItem = newColor;
        typeForCatalog = 'color';
      }
    }
    else if (modalType === 'size') {
      const newVal = newItemValue.trim() || '1:1';
      
      if (editingId) {
         setOptions.setAspectRatios(prev => prev.map(item => 
            item.value === editingId ? { ...item, label: newItemName, value: newVal } : item
         ));
         if (config.aspectRatio === editingId) {
            handleChange('aspectRatio', newVal);
         }
      } else {
        const newOption: AspectRatioOption = { label: newItemName, value: newVal };
        setOptions.setAspectRatios(prev => [...prev, newOption]);
        handleChange('aspectRatio', newOption.value);
      }
    }

    // Handle Contribution (Only for new items, not edits, and only if user is logged in)
    if (!editingId && contributeToCatalog && newItem && typeForCatalog && user) {
        try {
            const authorName = user.username ? `@${user.username}` : user.name;
            await catalogService.addToCatalog(typeForCatalog, newItem, user.id, authorName);
            console.log("Contributed to catalog!");
        } catch (e) {
            console.error("Failed to contribute:", e);
        }
    }

    closeModal();
  };

  // --- Handlers for Deleting Options ---

  const handleDelete = (e: React.MouseEvent, type: 'type'|'style'|'color'|'size', idOrValue: string) => {
    e.stopPropagation();
    if (type === 'type') {
      const newCtx = options.graphicTypes.filter(x => x.id !== idOrValue);
      setOptions.setGraphicTypes(newCtx);
      if (config.graphicTypeId === idOrValue && newCtx.length > 0) handleChange('graphicTypeId', newCtx[0].id);
    }
    else if (type === 'style') {
      const newCtx = options.visualStyles.filter(x => x.id !== idOrValue);
      setOptions.setVisualStyles(newCtx);
      if (config.visualStyleId === idOrValue && newCtx.length > 0) handleChange('visualStyleId', newCtx[0].id);
    }
    else if (type === 'color') {
      const newCtx = options.brandColors.filter(x => x.id !== idOrValue);
      setOptions.setBrandColors(newCtx);
      if (config.colorSchemeId === idOrValue && newCtx.length > 0) handleChange('colorSchemeId', newCtx[0].id);
    }
    else if (type === 'size') {
      const newCtx = options.aspectRatios.filter(x => x.value !== idOrValue);
      setOptions.setAspectRatios(newCtx);
      if (config.aspectRatio === idOrValue && newCtx.length > 0) handleChange('aspectRatio', newCtx[0].value);
    }
  };


  // --- Helper Components for Dropdowns ---

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

  // Common styles for input fields
  const inputClass = "w-full bg-white dark:bg-[#0d1117] border border-gray-200 dark:border-[#30363d] text-slate-900 dark:text-white text-sm rounded-lg p-3 focus:outline-none focus:ring-1 focus:ring-brand-red focus:border-brand-red transition-all placeholder-slate-400 dark:placeholder-slate-600";
  const labelClass = "block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5 ml-1";

  // Actions Component
  const ItemActions = ({ type, item, isSelected }: { type: 'type'|'style'|'color'|'size', item: any, isSelected: boolean }) => (
    <div className="flex items-center gap-1">
      <div className={`flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity ${isSelected ? 'mr-2' : ''}`}>
        <button 
          onClick={(e) => handleEdit(e, type, item)} 
          className="p-1.5 hover:bg-gray-100 dark:hover:bg-[#30363d] rounded-md text-slate-500 hover:text-brand-teal dark:hover:text-brand-teal transition-colors"
          title="Edit"
        >
          <Pencil size={12} />
        </button>
        {!isSelected && (
          <button 
            onClick={(e) => handleDelete(e, type, item.id || item.value)} 
            className="p-1.5 hover:bg-gray-100 dark:hover:bg-[#30363d] rounded-md text-slate-500 hover:text-red-500 dark:hover:text-red-400 transition-colors"
            title="Delete"
          >
            <Trash2 size={12} />
          </button>
        )}
      </div>
      {isSelected && <Check size={14} className="text-brand-teal dark:text-brand-teal" />}
    </div>
  );

  return (
    <>
      <div className="sticky top-[73px] z-40 w-full bg-white/95 dark:bg-[#0d1117]/95 backdrop-blur-md border-b border-gray-200 dark:border-[#30363d] p-4 transition-colors duration-200" ref={containerRef}>
        <div className="max-w-7xl mx-auto flex flex-col gap-4">
          
          {/* 1. Toolbar Controls (Centered) */}
          <div className="flex flex-wrap items-center justify-center gap-2 w-full">
            
            {/* Graphic Type Dropdown */}
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
                  <div className="max-h-60 overflow-y-auto custom-scrollbar p-2 space-y-1">
                    {options.graphicTypes.map(t => {
                      const Icon = t.icon || Layout;
                      const isSelected = config.graphicTypeId === t.id;
                      return (
                        <div key={t.id} className="group flex items-center justify-between p-2 hover:bg-gray-100 dark:hover:bg-[#21262d] rounded-md cursor-pointer" onClick={() => handleChange('graphicTypeId', t.id)}>
                          <div className="flex items-center gap-3">
                            <Icon size={16} className={isSelected ? 'text-brand-teal dark:text-brand-teal' : 'text-slate-500'} />
                            <span className={`text-xs ${isSelected ? 'text-brand-teal dark:text-brand-teal font-bold' : 'text-slate-700 dark:text-slate-300'}`}>{t.name}</span>
                          </div>
                          <ItemActions type="type" item={t} isSelected={isSelected} />
                        </div>
                      );
                    })}
                  </div>
                  <button onClick={() => openModal('type')} className="w-full text-left p-3 text-xs font-bold text-brand-teal dark:text-brand-teal border-t border-gray-200 dark:border-[#30363d] hover:bg-gray-100 dark:hover:bg-[#21262d] flex items-center gap-2 transition-colors">
                     <Plus size={14} /> Add Custom Type
                  </button>
                </div>
              )}
            </div>

            {/* Visual Style Dropdown */}
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
                  <div className="max-h-60 overflow-y-auto custom-scrollbar p-2 space-y-1">
                    {options.visualStyles.map(s => {
                      const Icon = s.icon || PenTool;
                      const isSelected = config.visualStyleId === s.id;
                      return (
                        <div key={s.id} className="group relative p-2 hover:bg-gray-100 dark:hover:bg-[#21262d] rounded-md cursor-pointer" onClick={() => handleChange('visualStyleId', s.id)}>
                          <div className="flex justify-between items-start">
                             <div className="flex items-center gap-3">
                                <Icon size={16} className={`mt-0.5 ${isSelected ? 'text-brand-teal dark:text-brand-teal' : 'text-slate-500'}`} />
                                <span className={`text-xs block ${isSelected ? 'text-brand-teal dark:text-brand-teal font-bold' : 'text-slate-700 dark:text-slate-300'}`}>{s.name}</span>
                             </div>
                             <ItemActions type="style" item={s} isSelected={isSelected} />
                          </div>
                          <span className="text-[10px] text-slate-500 block mt-0.5 pl-7 truncate pr-2">{s.description}</span>
                        </div>
                      );
                    })}
                  </div>
                  <button onClick={() => openModal('style')} className="w-full text-left p-3 text-xs font-bold text-brand-teal dark:text-brand-teal border-t border-gray-200 dark:border-[#30363d] hover:bg-gray-100 dark:hover:bg-[#21262d] flex items-center gap-2 transition-colors">
                     <Plus size={14} /> Add Custom Style
                  </button>
                </div>
              )}
            </div>

            {/* Color Palette Dropdown (Restored) */}
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
                  <div className="max-h-60 overflow-y-auto custom-scrollbar p-2 space-y-1">
                    {options.brandColors.map(c => {
                      const isSelected = config.colorSchemeId === c.id;
                      return (
                        <div key={c.id} className="group p-2 hover:bg-gray-100 dark:hover:bg-[#21262d] rounded-md cursor-pointer" onClick={() => handleChange('colorSchemeId', c.id)}>
                          <div className="flex justify-between items-center mb-1.5">
                            <span className={`text-xs ${isSelected ? 'text-brand-red dark:text-brand-orange font-bold' : 'text-slate-700 dark:text-slate-300'}`}>{c.name}</span>
                            <ItemActions type="color" item={c} isSelected={isSelected} />
                          </div>
                          <div className="flex h-2 w-full rounded-sm overflow-hidden ring-1 ring-gray-200 dark:ring-[#30363d]/50">
                            {c.colors.map((hex, i) => (
                              <div key={i} className="flex-1 h-full" style={{ backgroundColor: hex }} />
                            ))}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  <button onClick={() => openModal('color')} className="w-full text-left p-3 text-xs font-bold text-brand-red dark:text-brand-orange border-t border-gray-200 dark:border-[#30363d] hover:bg-gray-100 dark:hover:bg-[#21262d] flex items-center gap-2 transition-colors">
                     <Plus size={14} /> Add Custom Palette
                  </button>
                </div>
              )}
            </div>

            {/* Aspect Ratio (Dynamic) */}
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
                  <div className="max-h-60 overflow-y-auto custom-scrollbar p-1">
                    {options.aspectRatios.map(r => {
                      const Icon = r.icon || Maximize;
                      const isSelected = config.aspectRatio === r.value;
                      return (
                        <div key={r.value} className="group flex items-center justify-between p-2 hover:bg-gray-100 dark:hover:bg-[#21262d] rounded-md cursor-pointer" onClick={() => handleChange('aspectRatio', r.value)}>
                          <div className="flex items-center gap-3">
                             <Icon size={16} className={isSelected ? 'text-brand-teal dark:text-brand-teal' : 'text-slate-500'} />
                             <span className={`text-xs ${isSelected ? 'text-brand-teal dark:text-brand-teal font-bold' : 'text-slate-700 dark:text-slate-300'}`}>{r.label}</span>
                          </div>
                          <ItemActions type="size" item={r} isSelected={isSelected} />
                        </div>
                      );
                    })}
                  </div>
                  <button onClick={() => openModal('size')} className="w-full text-left p-3 text-xs font-bold text-brand-teal dark:text-brand-teal border-t border-gray-200 dark:border-[#30363d] hover:bg-gray-100 dark:hover:bg-[#21262d] flex items-center gap-2 transition-colors">
                     <Plus size={14} /> Add Custom Size
                  </button>
                </div>
              )}
            </div>

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
          </div>

          {/* 2. Prompt Input Area (Row 2, with Button) */}
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
             
             {/* Generate Button (Solid Color, Moved Here) */}
             <button
              onClick={onGenerate}
              disabled={!config.prompt || isGenerating}
              className={`flex-none flex items-center justify-center gap-2 px-8 py-3 rounded-lg font-bold shadow-md transition-all active:translate-y-0.5 sm:w-auto w-full ${
                !config.prompt || isGenerating
                  ? 'bg-gray-200 dark:bg-[#21262d] text-slate-400 dark:text-slate-500 cursor-not-allowed'
                  : 'bg-brand-red hover:bg-red-700 text-white shadow-brand-red/20'
              }`}
            >
              {isGenerating ? (
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                <Sparkles size={16} className="text-white" />
              )}
              <span>Generate</span>
            </button>
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

          {/* Type only needs Name. Others need extra fields. */}
          
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

          {/* Color Picker Section - Now in Color Modal */}
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

          {/* Contribution Checkbox */}
          {!editingId && user && modalType !== 'size' && (
             <div className="flex items-center gap-2 pt-2 border-t border-gray-100 dark:border-[#30363d] mt-4">
                <input 
                  type="checkbox" 
                  id="contribute" 
                  checked={contributeToCatalog}
                  onChange={(e) => setContributeToCatalog(e.target.checked)}
                  className="rounded border-gray-300 text-brand-teal focus:ring-brand-teal w-4 h-4 cursor-pointer"
                />
                <label htmlFor="contribute" className="text-sm text-slate-600 dark:text-slate-300 cursor-pointer select-none flex items-center gap-1.5">
                   <Globe size={14} className="text-brand-teal" />
                   Contribute to Community Catalog
                </label>
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
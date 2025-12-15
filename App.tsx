import React, { useState, useEffect } from 'react';
import { ControlPanel } from './components/ControlPanel';
import { ImageDisplay } from './components/ImageDisplay';
import { AuthModal } from './components/AuthModal';
import { GenerationConfig, GeneratedImage, BrandColor, VisualStyle, GraphicType, AspectRatioOption, User } from './types';
import { 
  BRAND_COLORS, 
  VISUAL_STYLES, 
  GRAPHIC_TYPES, 
  ASPECT_RATIOS 
} from './constants';
import { generateGraphic, refineGraphic, analyzeBrandGuidelines } from './services/geminiService';
import { authService } from './services/authService';
import { 
  AlertCircle, 
  Sun, 
  Moon, 
  HelpCircle, 
  X,
  Layout,
  PenTool,
  Palette,
  Plus,
  MessageSquare,
  RefreshCw,
  UploadCloud,
  LogIn,
  LogOut,
  User as UserIcon
} from 'lucide-react';

const App: React.FC = () => {
  // Theme State
  const [isDarkMode, setIsDarkMode] = useState(true);
  const [isHelpOpen, setIsHelpOpen] = useState(false);
  
  // Auth State
  const [user, setUser] = useState<User | null>(null);
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);

  // Application State for Options (allows adding/removing)
  const [brandColors, setBrandColors] = useState<BrandColor[]>(BRAND_COLORS);
  const [visualStyles, setVisualStyles] = useState<VisualStyle[]>(VISUAL_STYLES);
  const [graphicTypes, setGraphicTypes] = useState<GraphicType[]>(GRAPHIC_TYPES);
  const [aspectRatios, setAspectRatios] = useState<AspectRatioOption[]>(ASPECT_RATIOS);

  // Configuration State
  const [config, setConfig] = useState<GenerationConfig>({
    prompt: '',
    colorSchemeId: BRAND_COLORS[0].id,
    visualStyleId: VISUAL_STYLES[0].id,
    graphicTypeId: GRAPHIC_TYPES[0].id,
    aspectRatio: ASPECT_RATIOS[0].value
  });

  const [generatedImage, setGeneratedImage] = useState<GeneratedImage | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Check for session on mount
  useEffect(() => {
    const currentUser = authService.getCurrentUser();
    if (currentUser) {
      handleLoginSuccess(currentUser);
    }
  }, []);

  // Effect to toggle body class
  useEffect(() => {
    if (isDarkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [isDarkMode]);

  // Sync preferences to Auth Service when they change AND a user is logged in
  useEffect(() => {
    if (user) {
      authService.updateUserPreferences(user.id, {
        brandColors,
        visualStyles,
        graphicTypes,
        aspectRatios
      });
    }
  }, [brandColors, visualStyles, graphicTypes, aspectRatios, user]);

  const handleLoginSuccess = (loggedInUser: User) => {
    setUser(loggedInUser);
    // Load user preferences into state
    setBrandColors(loggedInUser.preferences.brandColors);
    setVisualStyles(loggedInUser.preferences.visualStyles);
    setGraphicTypes(loggedInUser.preferences.graphicTypes);
    setAspectRatios(loggedInUser.preferences.aspectRatios);
    
    // Ensure selected IDs in config are still valid, else reset to first
    setConfig(prev => ({
      ...prev,
      colorSchemeId: loggedInUser.preferences.brandColors.find(c => c.id === prev.colorSchemeId) ? prev.colorSchemeId : loggedInUser.preferences.brandColors[0].id,
      visualStyleId: loggedInUser.preferences.visualStyles.find(s => s.id === prev.visualStyleId) ? prev.visualStyleId : loggedInUser.preferences.visualStyles[0].id,
      graphicTypeId: loggedInUser.preferences.graphicTypes.find(t => t.id === prev.graphicTypeId) ? prev.graphicTypeId : loggedInUser.preferences.graphicTypes[0].id,
    }));
  };

  const handleLogout = () => {
    authService.logout();
    setUser(null);
    setIsUserMenuOpen(false);
    // Reset to defaults
    setBrandColors(BRAND_COLORS);
    setVisualStyles(VISUAL_STYLES);
    setGraphicTypes(GRAPHIC_TYPES);
    setAspectRatios(ASPECT_RATIOS);
    setConfig(prev => ({
      ...prev,
      colorSchemeId: BRAND_COLORS[0].id,
      visualStyleId: VISUAL_STYLES[0].id,
      graphicTypeId: GRAPHIC_TYPES[0].id
    }));
  };

  // Grouped context for easier passing
  const context = { brandColors, visualStyles, graphicTypes, aspectRatios };

  const handleGenerate = async () => {
    setIsGenerating(true);
    setError(null);
    try {
      const result = await generateGraphic(config, context);
      setGeneratedImage(result);
    } catch (err: any) {
      setError(err.message || 'An unexpected error occurred.');
    } finally {
      setIsGenerating(false);
    }
  };

  const handleRefine = async (refinementText: string) => {
    if (!generatedImage) return;

    setIsGenerating(true);
    setError(null);
    try {
      const result = await refineGraphic(generatedImage, refinementText, config, context);
      setGeneratedImage(result);
    } catch (err: any) {
      setError(err.message || 'Failed to refine image.');
    } finally {
      setIsGenerating(false);
    }
  };

  const handleUploadGuidelines = async (file: File) => {
    setIsAnalyzing(true);
    setError(null);
    try {
      const result = await analyzeBrandGuidelines(file);
      
      // Update state with new options, prepending them to the list
      const newColors: BrandColor[] = result.brandColors.map((c, i) => ({
        ...c,
        id: `analyzed-color-${Date.now()}-${i}`
      }));
      
      const newStyles: VisualStyle[] = result.visualStyles.map((s, i) => ({
        ...s,
        id: `analyzed-style-${Date.now()}-${i}`
      }));

      const newTypes: GraphicType[] = result.graphicTypes.map((t, i) => ({
        ...t,
        id: `analyzed-type-${Date.now()}-${i}`
      }));

      // Update lists
      if (newColors.length) setBrandColors(prev => [...newColors, ...prev]);
      if (newStyles.length) setVisualStyles(prev => [...newStyles, ...prev]);
      if (newTypes.length) setGraphicTypes(prev => [...newTypes, ...prev]);

      // Set defaults to the first new item found
      setConfig(prev => ({
        ...prev,
        colorSchemeId: newColors.length ? newColors[0].id : prev.colorSchemeId,
        visualStyleId: newStyles.length ? newStyles[0].id : prev.visualStyleId,
        graphicTypeId: newTypes.length ? newTypes[0].id : prev.graphicTypeId
      }));

      // NOTE: The useEffect for syncing with user preferences will automatically handle saving these new options if a user is logged in.

    } catch (err: any) {
      setError(err.message || 'Failed to analyze brand guidelines.');
    } finally {
      setIsAnalyzing(false);
    }
  };

  return (
    <div className="flex flex-col w-full min-h-screen font-sans transition-colors duration-200">
      
      {/* 1. Dedicated Header Row */}
      <header className="w-full flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-[#30363d] bg-white dark:bg-[#0d1117] sticky top-0 z-50">
        <div className="flex items-center gap-3">
          <img 
            src="/brandoit.png" 
            alt="BranDoIt Logo" 
            className="w-12 h-12 rounded-full shadow-lg shadow-brand-red/20 object-cover" 
          />
          <h1 className="font-bold text-xl tracking-tight text-slate-900 dark:text-white">BranDoIt</h1>
        </div>

        <div className="flex items-center gap-3">
          
          {/* Auth Buttons */}
          {user ? (
             <div className="relative">
               <button 
                 onClick={() => setIsUserMenuOpen(!isUserMenuOpen)}
                 className="flex items-center gap-2 p-1.5 pr-3 bg-gray-100 dark:bg-[#21262d] hover:bg-gray-200 dark:hover:bg-[#30363d] rounded-full transition-colors"
               >
                 <div className="w-8 h-8 rounded-full bg-brand-red flex items-center justify-center text-white text-xs font-bold">
                    {user.name.charAt(0).toUpperCase()}
                 </div>
                 <span className="text-sm font-medium text-slate-700 dark:text-slate-200 truncate max-w-[100px] hidden sm:block">{user.name}</span>
               </button>

               {isUserMenuOpen && (
                 <>
                   <div className="fixed inset-0 z-40" onClick={() => setIsUserMenuOpen(false)}></div>
                   <div className="absolute right-0 top-full mt-2 w-48 bg-white dark:bg-[#161b22] border border-gray-200 dark:border-[#30363d] rounded-xl shadow-xl z-50 overflow-hidden animate-in fade-in zoom-in-95 duration-150">
                      <div className="p-3 border-b border-gray-200 dark:border-[#30363d]">
                        <p className="text-xs text-slate-500 uppercase font-bold">Signed in as</p>
                        <p className="text-sm font-medium truncate text-slate-900 dark:text-white">{user.email}</p>
                      </div>
                      <button 
                        onClick={handleLogout}
                        className="w-full text-left p-3 text-sm text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 flex items-center gap-2 transition-colors"
                      >
                        <LogOut size={16} /> Sign Out
                      </button>
                   </div>
                 </>
               )}
             </div>
          ) : (
            <div className="flex items-center gap-2 mr-2">
              <button 
                onClick={() => setIsAuthModalOpen(true)}
                className="text-sm font-medium text-slate-600 dark:text-slate-300 hover:text-brand-red dark:hover:text-brand-red px-3 py-2 rounded-lg hover:bg-gray-100 dark:hover:bg-[#21262d] transition-colors"
              >
                Log In
              </button>
              <button 
                onClick={() => setIsAuthModalOpen(true)}
                className="text-sm font-bold text-white bg-brand-red hover:bg-red-700 px-4 py-2 rounded-lg shadow-lg shadow-brand-red/20 transition-all active:scale-95 hidden sm:block"
              >
                Sign Up
              </button>
            </div>
          )}

           <div className="h-6 w-px bg-gray-200 dark:bg-[#30363d]"></div>

           <button 
             onClick={() => setIsHelpOpen(true)}
             className="p-2 text-slate-500 hover:text-brand-red dark:hover:text-brand-red hover:bg-slate-100 dark:hover:bg-[#21262d] rounded-lg transition-colors"
             title="Help"
           >
             <HelpCircle size={20} />
           </button>
           <button 
             onClick={() => setIsDarkMode(!isDarkMode)}
             className="p-2 text-slate-500 hover:text-brand-red dark:hover:text-brand-red hover:bg-slate-100 dark:hover:bg-[#21262d] rounded-lg transition-colors"
             title="Toggle Theme"
           >
             {isDarkMode ? <Sun size={20} /> : <Moon size={20} />}
           </button>
        </div>
      </header>

      {/* 2. Toolbar & Controls */}
      <ControlPanel 
        config={config} 
        setConfig={setConfig} 
        onGenerate={handleGenerate}
        isGenerating={isGenerating}
        options={context}
        setOptions={{ setBrandColors, setVisualStyles, setGraphicTypes, setAspectRatios }}
        onUploadGuidelines={handleUploadGuidelines}
        isAnalyzing={isAnalyzing}
      />

      {/* 3. Main Content Area */}
      <main className="flex-1 relative flex flex-col min-w-0 bg-gray-50 dark:bg-[#0d1117] transition-colors duration-200">
        
        {/* Error Toast */}
        {error && (
          <div className="absolute top-8 left-1/2 -translate-x-1/2 z-50 bg-red-100 dark:bg-red-900/90 text-red-800 dark:text-red-100 px-4 py-3 rounded-lg shadow-lg border border-red-200 dark:border-red-800 flex items-center gap-2 animate-bounce-in backdrop-blur-sm">
            <AlertCircle size={20} />
            <span className="text-sm font-medium">{error}</span>
            <button onClick={() => setError(null)} className="ml-2 hover:bg-red-200 dark:hover:bg-red-800 p-1 rounded">
              ✕
            </button>
          </div>
        )}

        {/* Display */}
        <ImageDisplay 
          image={generatedImage} 
          onRefine={handleRefine}
          isRefining={isGenerating}
        />
      </main>

      {/* Auth Modal */}
      <AuthModal 
        isOpen={isAuthModalOpen} 
        onClose={() => setIsAuthModalOpen(false)} 
        onLoginSuccess={handleLoginSuccess}
      />

      {/* Help Modal */}
      {isHelpOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white dark:bg-[#161b22] border border-gray-200 dark:border-[#30363d] rounded-2xl w-full max-w-lg shadow-2xl p-6 relative animate-in zoom-in-95 duration-200 text-slate-900 dark:text-white">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-lg font-bold">How to use BranDoIt</h3>
              <button onClick={() => setIsHelpOpen(false)} className="text-slate-400 hover:text-slate-900 dark:hover:text-white p-1 rounded-md hover:bg-gray-100 dark:hover:bg-[#30363d] transition-colors">
                <X size={20} />
              </button>
            </div>
            
            <div className="space-y-4 text-sm text-slate-600 dark:text-slate-300">
              <p className="mb-4">
                BranDoIt helps you create consistent graphics for your brand using AI.
              </p>
              <ul className="space-y-4">
               <li className="flex items-start gap-3">
                  <div className="mt-0.5 p-1.5 bg-gray-100 dark:bg-[#21262d] rounded-md text-brand-red dark:text-brand-orange shrink-0">
                    <UserIcon size={16} />
                  </div>
                  <div>
                    <strong className="text-slate-900 dark:text-white">Account:</strong> Log in to save your custom colors, styles, and settings so they are available next time you visit.
                  </div>
                </li>
               <li className="flex items-start gap-3">
                  <div className="mt-0.5 p-1.5 bg-gray-100 dark:bg-[#21262d] rounded-md text-brand-red dark:text-brand-orange shrink-0">
                    <UploadCloud size={16} />
                  </div>
                  <div>
                    <strong className="text-slate-900 dark:text-white">Upload Guidelines:</strong> Upload your brand guidelines (PDF or Image) to automatically generate custom styles and colors.
                  </div>
                </li>
                <li className="flex items-start gap-3">
                  <div className="mt-0.5 p-1.5 bg-gray-100 dark:bg-[#21262d] rounded-md text-brand-red dark:text-brand-orange shrink-0">
                    <Layout size={16} />
                  </div>
                  <div>
                    <strong className="text-slate-900 dark:text-white">Select Type:</strong> Choose what kind of graphic you need (e.g., Icon, Chart).
                  </div>
                </li>
                <li className="flex items-start gap-3">
                  <div className="mt-0.5 p-1.5 bg-gray-100 dark:bg-[#21262d] rounded-md text-brand-red dark:text-brand-orange shrink-0">
                    <PenTool size={16} />
                  </div>
                  <div>
                    <strong className="text-slate-900 dark:text-white">Select Style:</strong> Pick a visual style that matches your brand guidelines.
                  </div>
                </li>
                <li className="flex items-start gap-3">
                  <div className="mt-0.5 p-1.5 bg-gray-100 dark:bg-[#21262d] rounded-md text-brand-red dark:text-brand-orange shrink-0">
                    <Palette size={16} />
                  </div>
                  <div>
                    <strong className="text-slate-900 dark:text-white">Select Colors:</strong> Enforce your brand's color palette.
                  </div>
                </li>
                <li className="flex items-start gap-3">
                  <div className="mt-0.5 p-1.5 bg-gray-100 dark:bg-[#21262d] rounded-md text-brand-red dark:text-brand-orange shrink-0">
                    <Plus size={16} />
                  </div>
                  <div>
                    <strong className="text-slate-900 dark:text-white">Custom Options:</strong> Add your own custom types, styles, or colors by clicking "Add Custom..." in any dropdown.
                  </div>
                </li>
                <li className="flex items-start gap-3">
                  <div className="mt-0.5 p-1.5 bg-gray-100 dark:bg-[#21262d] rounded-md text-brand-red dark:text-brand-orange shrink-0">
                    <MessageSquare size={16} />
                  </div>
                  <div>
                    <strong className="text-slate-900 dark:text-white">Prompt:</strong> Describe what you want to see. Be specific!
                  </div>
                </li>
                <li className="flex items-start gap-3">
                  <div className="mt-0.5 p-1.5 bg-gray-100 dark:bg-[#21262d] rounded-md text-brand-red dark:text-brand-orange shrink-0">
                    <RefreshCw size={16} />
                  </div>
                  <div>
                    <strong className="text-slate-900 dark:text-white">Refine:</strong> Once generated, use the text box below the image to ask for changes.
                  </div>
                </li>
              </ul>
            </div>

            <div className="mt-8 flex justify-end border-t border-gray-200 dark:border-[#30363d] pt-4">
              <button 
                onClick={() => setIsHelpOpen(false)}
                className="px-4 py-2 bg-brand-red hover:bg-red-700 text-white rounded-lg font-medium transition-colors text-sm shadow-lg shadow-brand-red/20"
              >
                Got it
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default App;
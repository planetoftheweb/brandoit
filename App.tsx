import React, { useState, useEffect } from 'react';
import { ControlPanel } from './components/ControlPanel';
import { ImageDisplay } from './components/ImageDisplay';
import { AuthModal } from './components/AuthModal';
import { BrandAnalysisModal } from './components/BrandAnalysisModal';
import { SettingsModal } from './components/SettingsModal';
import { CatalogPage } from './components/CatalogPage';
import { RecentGenerations } from './components/RecentGenerations';
import { GenerationConfig, GeneratedImage, BrandColor, VisualStyle, GraphicType, AspectRatioOption, User, GenerationHistoryItem, UserSettings, CatalogItem, BrandGuidelinesAnalysis } from './types';
import { 
  BRAND_COLORS, 
  VISUAL_STYLES, 
  GRAPHIC_TYPES, 
  ASPECT_RATIOS 
} from './constants';
import { generateGraphic, refineGraphic, analyzeBrandGuidelines } from './services/geminiService';
import { authService } from './services/authService';
import { historyService } from './services/historyService';
// import { seedCatalog } from './services/seeder'; // Removed
import { seedStructures } from './services/structureSeeder'; // Import structure seeder
import { resourceService } from './services/resourceService'; // Import resource service
import { missingKeys } from './services/firebase';
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
  User as UserIcon,
  Settings as SettingsIcon,
  Globe
} from 'lucide-react';

const App: React.FC = () => {
  // Critical Config Check
  if (missingKeys.length > 0) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-[#0d1117] p-4 font-sans">
        <div className="bg-white dark:bg-[#161b22] p-8 rounded-xl shadow-2xl max-w-lg w-full border border-red-200 dark:border-red-900">
          <div className="flex items-center gap-3 text-red-600 mb-6">
            <AlertCircle size={32} />
            <h1 className="text-2xl font-bold">Configuration Error</h1>
          </div>
          <p className="text-slate-600 dark:text-slate-300 mb-4">
            The following Firebase configuration keys are missing from your environment. The app cannot start without them.
          </p>
          <div className="bg-red-50 dark:bg-red-900/20 p-4 rounded-lg border border-red-100 dark:border-red-900/50 mb-6">
            <ul className="list-disc pl-5 space-y-1">
              {missingKeys.map(key => (
                <li key={key} className="text-red-700 dark:text-red-300 font-mono text-sm">{key}</li>
              ))}
            </ul>
          </div>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Please check your <code>.env</code> file. Ensure keys start with <code>VITE_</code> and the file is in the project root. Restart the dev server after changes.
          </p>
        </div>
      </div>
    );
  }

  // Theme State
  const [isDarkMode, setIsDarkMode] = useState(() => {
    if (typeof window !== 'undefined' && window.matchMedia) {
      return window.matchMedia('(prefers-color-scheme: dark)').matches;
    }
    return true; // Default to dark
  });
  const [isHelpOpen, setIsHelpOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [catalogMode, setCatalogMode] = useState<'style' | 'color' | null>(null);
  
  // Auth State
  const [user, setUser] = useState<User | null>(null);
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const [authModalMode, setAuthModalMode] = useState<'login' | 'signup'>('login');
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);

  // Application State for Options (allows adding/removing)
  const [brandColors, setBrandColors] = useState<BrandColor[]>([]);
  const [visualStyles, setVisualStyles] = useState<VisualStyle[]>([]);
  const [graphicTypes, setGraphicTypes] = useState<GraphicType[]>([]);
  const [aspectRatios, setAspectRatios] = useState<AspectRatioOption[]>([]);

  // Configuration State
  const [config, setConfig] = useState<GenerationConfig>({
    prompt: '',
    colorSchemeId: '', // Initial empty
    visualStyleId: '',
    graphicTypeId: '',
    aspectRatio: ''
  });

  const [generatedImage, setGeneratedImage] = useState<GeneratedImage | null>(null);
  const [history, setHistory] = useState<GenerationHistoryItem[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Analysis Modal State
  const [isAnalysisModalOpen, setIsAnalysisModalOpen] = useState(false);
  const [analysisResult, setAnalysisResult] = useState<BrandGuidelinesAnalysis | null>(null);

  // Load Resources (Structures)
  const loadResources = async (userId?: string) => {
    const resources = await resourceService.getAllResources(userId);
    setBrandColors(resources.brandColors);
    setVisualStyles(resources.visualStyles);
    setGraphicTypes(resources.graphicTypes);
    setAspectRatios(resources.aspectRatios);

    // Set initial config if empty
    setConfig(prev => ({
        ...prev,
        colorSchemeId: prev.colorSchemeId || resources.brandColors[0]?.id || '',
        visualStyleId: prev.visualStyleId || resources.visualStyles[0]?.id || '',
        graphicTypeId: prev.graphicTypeId || resources.graphicTypes[0]?.id || '',
        aspectRatio: prev.aspectRatio || resources.aspectRatios[0]?.value || ''
    }));
  };

  useEffect(() => {
    if (user?.username === 'planetoftheweb') {
       // Seed structures only if admin is logged in
       seedStructures(user).then(() => loadResources(user.id));
    } else {
       loadResources(user?.id);
    }
    
    // Seed catalog (legacy community items) - can probably be removed or gated too
    // seedCatalog().catch(console.error);
  }, [user]); // Run when user changes

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
      // Only sync settings/API key now. Custom items are saved directly via resourceService.
      authService.updateUserPreferences(user.id, {
        brandColors: [], // Ignored by new authService logic
        visualStyles: [],
        graphicTypes: [],
        aspectRatios: [],
        geminiApiKey: user.preferences.geminiApiKey,
        settings: user.preferences.settings
      });
    }
  }, [user?.preferences.settings, user?.preferences.geminiApiKey, user]); // Only trigger on settings change

  const handleLoginSuccess = async (loggedInUser: User) => {
    setUser(loggedInUser);
    // Resources are loaded via the useEffect([user?.id]) hook now
    
    // Ensure selected IDs in config are still valid... (Logic handled in loadResources mostly)
    
    // Merge local history if any
    await historyService.mergeLocalToRemote(loggedInUser.id);
    const updatedHistory = await historyService.getHistory(loggedInUser);
    setHistory(updatedHistory);
  };

  const handleLogout = () => {
    authService.logout();
    setUser(null);
    setIsUserMenuOpen(false);
    // Resources will reload defaults via useEffect([user?.id]) -> user is null
  };

  // Grouped context for easier passing
  const context = { brandColors, visualStyles, graphicTypes, aspectRatios };

  const handleGenerate = async () => {
    setIsGenerating(true);
    setError(null);
    try {
      const customKey = user?.preferences.geminiApiKey;
      const result = await generateGraphic(config, context, customKey);
      setGeneratedImage(result);

      // Save to history
      const historyItem: GenerationHistoryItem = {
        ...result,
        id: `gen-${Date.now()}`,
        timestamp: Date.now(),
        config: { ...config }
      };
      
      await historyService.saveToHistory(user, historyItem);
      
      // Refresh history list
      const updatedHistory = await historyService.getHistory(user);
      setHistory(updatedHistory);

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
      const customKey = user?.preferences.geminiApiKey;
      const result = await refineGraphic(generatedImage, refinementText, config, context, customKey);
      setGeneratedImage(result);
      
      // Save refined version to history too? Or update existing? Let's save as new for now.
      const historyItem: GenerationHistoryItem = {
        ...result,
        id: `gen-${Date.now()}`,
        timestamp: Date.now(),
        config: { ...config, prompt: `${config.prompt} (Refined: ${refinementText})` }
      };
      await historyService.saveToHistory(user, historyItem);
      const updatedHistory = await historyService.getHistory(user);
      setHistory(updatedHistory);

    } catch (err: any) {
      setError(err.message || 'Failed to refine image.');
    } finally {
      setIsGenerating(false);
    }
  };

  const handleRestoreFromHistory = (item: GenerationHistoryItem) => {
    setConfig(item.config);
    setGeneratedImage(item);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleUploadGuidelines = async (file: File) => {
    setIsAnalyzing(true);
    setError(null);
    try {
      const customKey = user?.preferences.geminiApiKey;
      const result = await analyzeBrandGuidelines(file, customKey);
      setAnalysisResult(result);
      setIsAnalysisModalOpen(true);
    } catch (err: any) {
      setError(err.message || 'Failed to analyze brand guidelines.');
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleConfirmAnalysis = async (selected: BrandGuidelinesAnalysis, scope: 'public' | 'private') => {
    // 1. Prepare items with temporary IDs for immediate UI update
    const tempColors: BrandColor[] = selected.brandColors.map((c, i) => ({
        ...c,
        id: `analyzed-color-${Date.now()}-${i}`,
        authorId: user?.id || 'temp',
        authorName: user?.name || 'You',
        scope: scope,
        votes: 0,
        voters: [],
        createdAt: Date.now()
    })) as BrandColor[];

    const tempStyles: VisualStyle[] = selected.visualStyles.map((s, i) => ({
        ...s,
        id: `analyzed-style-${Date.now()}-${i}`,
        authorId: user?.id || 'temp',
        authorName: user?.name || 'You',
        scope: scope,
        votes: 0,
        voters: [],
        createdAt: Date.now()
    })) as VisualStyle[];

    const tempTypes: GraphicType[] = selected.graphicTypes.map((t, i) => ({
        ...t,
        id: `analyzed-type-${Date.now()}-${i}`,
        authorId: user?.id || 'temp',
        authorName: user?.name || 'You',
        scope: scope,
        votes: 0,
        voters: [],
        createdAt: Date.now()
    })) as GraphicType[];

    // 2. Update local state
    if (tempColors.length) setBrandColors(prev => [...tempColors, ...prev]);
    if (tempStyles.length) setVisualStyles(prev => [...tempStyles, ...prev]);
    if (tempTypes.length) setGraphicTypes(prev => [...tempTypes, ...prev]);

    // 3. Set config to use the first new items
    setConfig(prev => ({
        ...prev,
        colorSchemeId: tempColors.length ? tempColors[0].id : prev.colorSchemeId,
        visualStyleId: tempStyles.length ? tempStyles[0].id : prev.visualStyleId,
        graphicTypeId: tempTypes.length ? tempTypes[0].id : prev.graphicTypeId
    }));

    // 4. Persist to Firestore if user is logged in
    if (user) {
        try {
            for (const item of selected.brandColors) {
                await resourceService.addCustomItem('brand_colors', { name: item.name, colors: item.colors }, user.id, scope);
            }
            for (const item of selected.visualStyles) {
                await resourceService.addCustomItem('visual_styles', { name: item.name, description: item.description }, user.id, scope);
            }
            for (const item of selected.graphicTypes) {
                await resourceService.addCustomItem('graphic_types', { name: item.name }, user.id, scope);
            }
        } catch (e) {
            console.error("Error saving analyzed items to Firestore", e);
            setError("Items added locally, but failed to save to account.");
        }
    }
  };

  const handleSaveSettings = async (newSettings: UserSettings, profileData?: { name: string; username: string; photoURL?: string }) => {
    if (!user) return;
    
    // Update local state for immediate feedback
    const updatedUser = {
        ...user,
        name: profileData?.name || user.name,
        username: profileData?.username || user.username,
        photoURL: profileData?.photoURL || user.photoURL,
        preferences: {
            ...user.preferences,
            settings: newSettings
        }
    };
    setUser(updatedUser);

    // Apply defaults immediately if changed
    if (newSettings.defaultGraphicTypeId && newSettings.defaultGraphicTypeId !== config.graphicTypeId) {
        setConfig(prev => ({ ...prev, graphicTypeId: newSettings.defaultGraphicTypeId! }));
    }
    if (newSettings.defaultAspectRatio && newSettings.defaultAspectRatio !== config.aspectRatio) {
        setConfig(prev => ({ ...prev, aspectRatio: newSettings.defaultAspectRatio! }));
    }

    // Save to Firestore
    try {
        await Promise.all([
            authService.updateUserPreferences(user.id, updatedUser.preferences),
            profileData ? authService.updateUserProfile(user.id, profileData) : Promise.resolve()
        ]);
    } catch (e: any) {
        console.error("Failed to save settings", e);
        setError(e.message || "Failed to save changes.");
    }
  };

  const handleImportFromCatalog = (item: CatalogItem) => {
    if (item.type === 'style') {
      const newStyle = item.data as VisualStyle;
      if (!visualStyles.find(s => s.id === newStyle.id)) {
        setVisualStyles(prev => [...prev, newStyle]);
      }
      setConfig(prev => ({ ...prev, visualStyleId: newStyle.id }));
    } else if (item.type === 'color') {
      const newColor = item.data as BrandColor;
      if (!brandColors.find(c => c.id === newColor.id)) {
        setBrandColors(prev => [...prev, newColor]);
      }
      setConfig(prev => ({ ...prev, colorSchemeId: newColor.id }));
    } else if (item.type === 'type') {
      const newType = item.data as GraphicType;
      if (!graphicTypes.find(t => t.id === newType.id)) {
        setGraphicTypes(prev => [...prev, newType]);
      }
      setConfig(prev => ({ ...prev, graphicTypeId: newType.id }));
    }
    setCatalogMode(null);
  };

  return (
    <div className="flex flex-col w-full min-h-screen font-sans transition-colors duration-200">
      
      {/* 1. Dedicated Header Row */}
      <header className="w-full flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-[#30363d] bg-white dark:bg-[#0d1117] sticky top-0 z-50">
        <div className="flex items-center gap-6">
          <button 
            onClick={() => setCatalogMode(null)}
            className="flex items-center gap-3 hover:opacity-80 transition-opacity focus:outline-none"
          >
            <img 
              src="/brandoit.png" 
              alt="BranDoIt Logo" 
              className="w-12 h-12 rounded-full shadow-lg shadow-brand-red/20 object-cover" 
            />
            <h1 className="font-bold text-xl tracking-tight text-slate-900 dark:text-white">BranDoIt</h1>
          </button>
          
          {/* Navigation Links */}
          <nav className="hidden md:flex items-center gap-2 ml-4">
            <button 
              onClick={() => setCatalogMode('style')}
              className="text-sm font-medium text-slate-600 dark:text-slate-300 hover:text-brand-teal dark:hover:text-brand-teal transition-colors flex items-center gap-1.5 px-3 py-2 rounded-lg hover:bg-gray-50 dark:hover:bg-[#21262d]"
            >
              <PenTool size={16} /> Styles
            </button>
            <button 
              onClick={() => setCatalogMode('color')}
              className="text-sm font-medium text-slate-600 dark:text-slate-300 hover:text-brand-teal dark:hover:text-brand-teal transition-colors flex items-center gap-1.5 px-3 py-2 rounded-lg hover:bg-gray-50 dark:hover:bg-[#21262d]"
            >
              <Palette size={16} /> Colors
            </button>
          </nav>
        </div>

        <div className="flex items-center gap-3">
          
          {/* Auth Buttons */}
          {user ? (
             <div className="relative">
               <button 
                 onClick={() => setIsUserMenuOpen(!isUserMenuOpen)}
                 className="flex items-center gap-2 p-1 bg-gray-100 dark:bg-[#21262d] hover:bg-gray-200 dark:hover:bg-[#30363d] rounded-full transition-colors"
               >
                 <div className="w-8 h-8 rounded-full bg-brand-red flex items-center justify-center text-white text-xs font-bold overflow-hidden">
                    {user.photoURL ? (
                      <img src={user.photoURL} alt={user.name} className="w-full h-full object-cover" />
                    ) : (
                      user.name.charAt(0).toUpperCase()
                    )}
                 </div>
               </button>

               {isUserMenuOpen && (
                 <>
                   <div className="fixed inset-0 z-40" onClick={() => setIsUserMenuOpen(false)}></div>
                   <div className="absolute right-0 top-full mt-2 w-48 bg-white dark:bg-[#161b22] border border-gray-200 dark:border-[#30363d] rounded-xl shadow-xl z-50 overflow-hidden animate-in fade-in zoom-in-95 duration-150">
                      <div className="p-3 border-b border-gray-200 dark:border-[#30363d]">
                        <p className="text-xs text-slate-500 uppercase font-bold">Signed in as</p>
                          <p className="text-sm font-medium truncate text-slate-900 dark:text-white">{user.email}</p>
                      </div>
                      <div className="p-3 border-b border-gray-200 dark:border-[#30363d]">
                        <button 
                          onClick={() => {
                            setIsSettingsOpen(true);
                            setIsUserMenuOpen(false);
                          }}
                          className="w-full text-left flex items-center gap-2 text-sm font-medium text-slate-700 dark:text-slate-200 hover:text-brand-teal dark:hover:text-brand-teal transition-colors"
                        >
                          <SettingsIcon size={16} /> Preferences
                        </button>
                      </div>
                      <div className="p-3 border-b border-gray-200 dark:border-[#30363d]">
                        <label className="text-xs font-bold text-slate-500 uppercase block mb-1.5">
                          Custom API Key
                        </label>
                        <input
                          type="password"
                          placeholder="Enter Gemini API Key..."
                          value={user.preferences.geminiApiKey || ''}
                          onChange={(e) => {
                            const newKey = e.target.value;
                            // Update local state immediately for UI responsiveness
                            const updatedUser = { 
                              ...user, 
                              preferences: { ...user.preferences, geminiApiKey: newKey } 
                            };
                            setUser(updatedUser);
                          }}
                          onBlur={(e) => {
                             // Save to Firestore when user clicks away
                             authService.updateUserPreferences(user.id, {
                               ...user.preferences,
                               geminiApiKey: e.target.value
                             });
                          }}
                          className="w-full text-xs p-2 rounded border border-gray-200 dark:border-[#30363d] bg-gray-50 dark:bg-[#0d1117] text-slate-900 dark:text-white focus:ring-1 focus:ring-brand-teal"
                        />
                        <p className="text-[10px] text-slate-400 mt-1">
                          Using your own key removes rate limits.
                        </p>
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
                onClick={() => {
                  setAuthModalMode('login');
                  setIsAuthModalOpen(true);
                }}
                className="text-sm font-medium text-slate-600 dark:text-slate-300 hover:text-brand-teal dark:hover:text-brand-teal px-3 py-2 rounded-lg hover:bg-gray-100 dark:hover:bg-[#21262d] transition-colors"
              >
                Log In
              </button>
              <button 
                onClick={() => {
                  setAuthModalMode('signup');
                  setIsAuthModalOpen(true);
                }}
                className="text-sm font-bold text-white bg-brand-red hover:bg-red-700 px-4 py-2 rounded-lg shadow-lg shadow-brand-red/20 transition-all active:scale-95 hidden sm:block"
              >
                Sign Up
              </button>
            </div>
          )}

           <div className="h-6 w-px bg-gray-200 dark:bg-[#30363d]"></div>

           <button 
             onClick={() => setIsHelpOpen(true)}
             className="p-2 text-slate-500 hover:text-brand-teal dark:hover:text-brand-teal hover:bg-slate-100 dark:hover:bg-[#21262d] rounded-lg transition-colors"
             title="Help"
           >
             <HelpCircle size={20} />
           </button>
           <button 
             onClick={() => setIsDarkMode(!isDarkMode)}
             className="p-2 text-slate-500 hover:text-brand-teal dark:hover:text-brand-teal hover:bg-slate-100 dark:hover:bg-[#21262d] rounded-lg transition-colors"
             title="Toggle Theme"
           >
             {isDarkMode ? <Sun size={20} /> : <Moon size={20} />}
           </button>
        </div>
      </header>

      {/* 2. Content Switching */}
      {catalogMode ? (
        <CatalogPage 
          category={catalogMode}
          onBack={() => setCatalogMode(null)}
          onImport={handleImportFromCatalog}
          userId={user?.id}
        />
      ) : (
        <>
          {/* Toolbar & Controls */}
          <ControlPanel 
            config={config} 
            setConfig={setConfig} 
            onGenerate={handleGenerate}
            isGenerating={isGenerating}
            options={context}
            setOptions={{ setBrandColors, setVisualStyles, setGraphicTypes, setAspectRatios }}
            onUploadGuidelines={handleUploadGuidelines}
            isAnalyzing={isAnalyzing}
            user={user}
          />

          {/* Main Content Area */}
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

            {/* History Gallery */}
            <RecentGenerations 
              history={history}
              onSelect={handleRestoreFromHistory}
              options={context}
            />
          </main>
        </>
      )}

      {/* Auth Modal */}
      <AuthModal 
        isOpen={isAuthModalOpen} 
        onClose={() => setIsAuthModalOpen(false)} 
        onLoginSuccess={handleLoginSuccess}
        initialMode={authModalMode}
      />

      {/* Brand Analysis Modal */}
      <BrandAnalysisModal
        isOpen={isAnalysisModalOpen}
        onClose={() => setIsAnalysisModalOpen(false)}
        analysisResult={analysisResult}
        onConfirm={handleConfirmAnalysis}
      />

      {/* Settings Modal */}
      {user && (
        <SettingsModal
          isOpen={isSettingsOpen}
          onClose={() => setIsSettingsOpen(false)}
          user={user}
          onSave={handleSaveSettings}
          graphicTypes={graphicTypes}
          aspectRatios={aspectRatios}
        />
      )}

      {/* Catalog Modal Removed */}

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
                    <strong className="text-slate-900 dark:text-white">Select Style:</strong> Pick a visual style that includes your brand's color palette.
                  </div>
                </li>
                {/* Removed separate Color section in Help */}
                <li className="flex items-start gap-3">
                  <div className="mt-0.5 p-1.5 bg-gray-100 dark:bg-[#21262d] rounded-md text-brand-red dark:text-brand-orange shrink-0">
                    <Plus size={16} />
                  </div>
                  <div>
                    <strong className="text-slate-900 dark:text-white">Custom Options:</strong> Add your own custom types or styles (with custom colors) by clicking "Add Custom...".
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
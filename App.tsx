import React, { useState, useEffect, useRef } from 'react';
import { ControlPanel } from './components/ControlPanel';
import { ImageDisplay } from './components/ImageDisplay';
import { AuthModal } from './components/AuthModal';
import { BrandAnalysisModal } from './components/BrandAnalysisModal';
import { SettingsPage } from './components/SettingsPage';
import { CatalogPage } from './components/CatalogPage';
import { AdminPage } from './components/AdminPage';
import { RecentGenerations } from './components/RecentGenerations';
import { GenerationConfig, GeneratedImage, BrandColor, VisualStyle, GraphicType, AspectRatioOption, User, Generation, UserSettings, BrandGuidelinesAnalysis } from './types';
import { 
  BRAND_COLORS, 
  VISUAL_STYLES, 
  GRAPHIC_TYPES, 
  ASPECT_RATIOS,
  SUPPORTED_MODELS
} from './constants';
import {
  generateGraphic,
  generateGraphicWithStyleReference,
  refineGraphic,
  analyzeBrandGuidelines,
  describeImagePrompt,
  analyzeImageForCorrectionPrompt
} from './services/geminiService';
import { generateOpenAIImage } from './services/openaiService';
import { generateSvg, refineSvg } from './services/svgService';
import { getAspectRatiosForModel, getSafeAspectRatioForModel, extractAspectRatioFromText, normalizeAspectRatio } from './services/aspectRatioService';
import { authService } from './services/authService';
import {
  historyService,
  createGeneration,
  addRefinementVersion,
  getCurrentVersion,
  createVersionFromImage,
} from './services/historyService';
import { expandPromptPermutations } from './services/promptExpansionService';
import {
  runBatchGenerations,
  batchCapFor,
  BatchJob,
  BatchError,
  BatchProgress,
  DEFAULT_BATCH_CONCURRENCY,
} from './services/batchGenerationService';
import {
  formatDuration,
  getModelSecondsPerGen,
  recordModelDuration,
} from './services/timeEstimationService';
import { detectLikelyCanvasPadding } from './services/recomposeQualityService';
import { toMarkLabel } from './services/versionUtils';
import { buildProfileImageCacheKey } from './services/imageCache';
import { CachedImage } from './components/CachedImage';
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
  KeyRound,
  Sparkles,
  ArrowRight,
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
  Globe,
  Github,
  ShieldCheck
} from 'lucide-react';

interface ToolbarSelectionCache {
  colorSchemeId?: string;
  visualStyleId?: string;
  graphicTypeId?: string;
  aspectRatio?: string;
  selectedModel?: string;
  openaiImageQuality?: 'low' | 'medium' | 'high' | 'auto';
}

type OpenAIImageQuality = 'low' | 'medium' | 'high' | 'auto';
const OPENAI_QUALITY_SET = new Set<OpenAIImageQuality>(['low', 'medium', 'high', 'auto']);

/**
 * Reference to a single mark (version) in the app's history, used as A/B
 * selection for the comparison slider. We snapshot `imageUrl` / `mimeType` at
 * pick-time so the slider keeps working even if the originating tile scrolls
 * out of view or is otherwise unmounted.
 */
export interface MarkRef {
  generationId: string;
  versionId: string;
  imageUrl: string;
  mimeType: string;
  modelId: string;
  markLabel: string;
  aspectRatio?: string;
}

interface BatchModelProgressSummary {
  total: number;
  completed: number;
  failed: number;
  inFlight: number;
}

interface ActiveGenerationCurrentJob {
  key: string;
  modelId: string;
  prompt: string;
}

type ActiveGenerationJobStatus = 'running' | 'stopping' | 'completed' | 'failed' | 'stopped';

interface ActiveGenerationJob {
  id: string;
  prompt: string;
  modelIds: string[];
  total: number;
  completed: number;
  failed: number;
  inFlight: number;
  startedAt: number;
  finishedAt?: number;
  status: ActiveGenerationJobStatus;
  errors: BatchError[];
  modelProgress: Record<string, BatchModelProgressSummary>;
  currentJobs: ActiveGenerationCurrentJob[];
  latest?: Generation;
  message?: string;
}

const TOOLBAR_SELECTION_KEY_PREFIX = 'brandoit_toolbar_selection_v1';
const TOOLBAR_SELECTION_LAST_KEY = `${TOOLBAR_SELECTION_KEY_PREFIX}:last`;
const MODEL_ID_SET = new Set(SUPPORTED_MODELS.map(model => model.id));
const MODEL_NAME_BY_ID: Record<string, string> = SUPPORTED_MODELS.reduce<Record<string, string>>((acc, model) => {
  acc[model.id] = model.name;
  return acc;
}, {});

const GITHUB_REPO_BASE = 'https://github.com/planetoftheweb/brandoit';
const GITHUB_CHANGELOG_URL = `${GITHUB_REPO_BASE}/blob/main/CHANGELOG.md`;
const GITHUB_RELEASES_URL = `${GITHUB_REPO_BASE}/releases`;

const getToolbarSelectionKey = (userId?: string | null) =>
  `${TOOLBAR_SELECTION_KEY_PREFIX}:${userId || 'guest'}`;

const normalizeToolbarSelection = (value: unknown): ToolbarSelectionCache | null => {
  if (!value || typeof value !== 'object') return null;
  const source = value as Record<string, unknown>;
  const normalized: ToolbarSelectionCache = {};

  if (typeof source.colorSchemeId === 'string') normalized.colorSchemeId = source.colorSchemeId;
  if (typeof source.visualStyleId === 'string') normalized.visualStyleId = source.visualStyleId;
  if (typeof source.graphicTypeId === 'string') normalized.graphicTypeId = source.graphicTypeId;
  if (typeof source.aspectRatio === 'string') normalized.aspectRatio = source.aspectRatio;
  if (typeof source.selectedModel === 'string' && MODEL_ID_SET.has(source.selectedModel)) {
    normalized.selectedModel = source.selectedModel;
  }
  if (
    typeof source.openaiImageQuality === 'string' &&
    OPENAI_QUALITY_SET.has(source.openaiImageQuality as OpenAIImageQuality)
  ) {
    normalized.openaiImageQuality = source.openaiImageQuality as OpenAIImageQuality;
  }

  return Object.keys(normalized).length > 0 ? normalized : null;
};

const readToolbarSelection = (userId?: string | null): ToolbarSelectionCache | null => {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(getToolbarSelectionKey(userId));
    if (!raw) return null;
    return normalizeToolbarSelection(JSON.parse(raw));
  } catch {
    return null;
  }
};

const readLastToolbarSelection = (): ToolbarSelectionCache | null => {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(TOOLBAR_SELECTION_LAST_KEY);
    if (!raw) return null;
    return normalizeToolbarSelection(JSON.parse(raw));
  } catch {
    return null;
  }
};

const writeToolbarSelection = (selection: ToolbarSelectionCache, userId?: string | null) => {
  if (typeof window === 'undefined') return;
  try {
    const payload = JSON.stringify(selection);
    window.localStorage.setItem(TOOLBAR_SELECTION_LAST_KEY, payload);
    window.localStorage.setItem(getToolbarSelectionKey(userId), payload);
  } catch {
    // Ignore storage write failures.
  }
};

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
  const [settingsMode, setSettingsMode] = useState(false);
  const [catalogMode, setCatalogMode] = useState<'style' | 'color' | null>(null);
  const [adminMode, setAdminMode] = useState(false);
  
  // Auth State
  const [user, setUser] = useState<User | null>(null);
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const [authModalMode, setAuthModalMode] = useState<'login' | 'signup'>('login');
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);
  const [isSetupModalOpen, setIsSetupModalOpen] = useState(true);

  // Application State for Options (allows adding/removing)
  const [brandColors, setBrandColors] = useState<BrandColor[]>([]);
  const [visualStyles, setVisualStyles] = useState<VisualStyle[]>([]);
  const [graphicTypes, setGraphicTypes] = useState<GraphicType[]>([]);
  const [aspectRatios, setAspectRatios] = useState<AspectRatioOption[]>([]);

  // Configuration State
  const [config, setConfig] = useState<GenerationConfig>(() => {
    const cached = readLastToolbarSelection();
    return {
      prompt: '',
      colorSchemeId: cached?.colorSchemeId || '',
      visualStyleId: cached?.visualStyleId || '',
      graphicTypeId: cached?.graphicTypeId || '',
      aspectRatio: cached?.aspectRatio || ''
    };
  });
  const [guestSelectedModel, setGuestSelectedModel] = useState<string>(() => {
    const cachedSelection = readToolbarSelection() || readLastToolbarSelection();
    const cachedModel = cachedSelection?.selectedModel;
    return cachedModel && MODEL_ID_SET.has(cachedModel)
      ? cachedModel
      : 'gemini-3.1-flash-image-preview';
  });
  const [hasHydratedToolbarState, setHasHydratedToolbarState] = useState(false);

  const [currentGeneration, setCurrentGeneration] = useState<Generation | null>(null);
  const [history, setHistory] = useState<Generation[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeGenerationJobs, setActiveGenerationJobs] = useState<ActiveGenerationJob[]>([]);
  const hasRunningGenerationJobs = activeGenerationJobs.some((job) =>
    job.status === 'running' || job.status === 'stopping'
  );
  // Ticks once per second while background generations are running so the
  // monitor's elapsed/remaining labels stay live.
  const [batchClockTick, setBatchClockTick] = useState(0);
  const generationJobAbortControllersRef = useRef<Record<string, AbortController>>({});
  const generationJobDismissTimersRef = useRef<Record<string, number>>({});

  // Analysis Modal State
  const [isAnalysisModalOpen, setIsAnalysisModalOpen] = useState(false);
  const [analysisResult, setAnalysisResult] = useState<BrandGuidelinesAnalysis | null>(null);

  // Delete confirmation state
  const [confirmDeleteModal, setConfirmDeleteModal] = useState<{ type: 'history' | 'current'; id?: string } | null>(null);
  const [skipFutureConfirm, setSkipFutureConfirm] = useState(false);

  const pickResourceId = <T extends { id: string }>(
    items: T[],
    preferredId?: string,
    fallbackId?: string
  ) => {
    if (preferredId && items.some(item => item.id === preferredId)) return preferredId;
    if (fallbackId && items.some(item => item.id === fallbackId)) return fallbackId;
    return items[0]?.id || '';
  };

  // Load Resources (Structures)
  const loadResources = async (activeUser?: User | null) => {
    const resources = await resourceService.getAllResources(activeUser?.id);
    setBrandColors(resources.brandColors);
    setVisualStyles(resources.visualStyles);
    setGraphicTypes(resources.graphicTypes);
    setAspectRatios(resources.aspectRatios);

    // Prefer any user-specific cache first; for signed-out visits also fall
    // back to the "last" guest cache so a returning visitor doesn't lose
    // their picks. A cross-account signed-in view should NOT leak defaults
    // from the prior account, which is why the activeUser branch stays
    // scoped to that user's key.
    const cachedSelection = activeUser
      ? (readToolbarSelection(activeUser.id) || readLastToolbarSelection())
      : (readToolbarSelection() || readLastToolbarSelection());
    const settings = activeUser?.preferences.settings;
    const selectedModelForDefaults =
      cachedSelection?.selectedModel ||
      activeUser?.preferences.selectedModel ||
      (!activeUser ? guestSelectedModel : undefined) ||
      // Default model for fresh accounts: Nano Banana 2 (Gemini 3.1 Flash).
      // Chosen because it's the fast Gemini option — users can upgrade to
      // Pro or switch to GPT from the model dropdown.
      'gemini-3.1-flash-image-preview';
    if (!activeUser && selectedModelForDefaults !== guestSelectedModel) {
      setGuestSelectedModel(selectedModelForDefaults);
    }
    const modelAspectRatios = getAspectRatiosForModel(selectedModelForDefaults, resources.aspectRatios);
    const preferredAspectRatio = cachedSelection?.aspectRatio || settings?.defaultAspectRatio;

    // Code-level fallbacks for brand-new users with no cache and no saved
    // defaults yet. Uses canonical constant IDs; if the ID isn't in the
    // user's resource list (e.g. they removed 'hand-drawn') pickResourceId
    // degrades to items[0].
    const DEFAULT_GRAPHIC_TYPE_ID = 'infographic';
    const DEFAULT_VISUAL_STYLE_ID = 'hand-drawn';
    const DEFAULT_ASPECT_RATIO = '16:9';

    setConfig(prev => ({
      ...prev,
      colorSchemeId: pickResourceId(
        resources.brandColors,
        cachedSelection?.colorSchemeId || settings?.defaultColorSchemeId,
        prev.colorSchemeId
      ),
      visualStyleId: pickResourceId(
        resources.visualStyles,
        cachedSelection?.visualStyleId || settings?.defaultVisualStyleId,
        prev.visualStyleId || DEFAULT_VISUAL_STYLE_ID
      ),
      graphicTypeId: pickResourceId(
        resources.graphicTypes,
        cachedSelection?.graphicTypeId || settings?.defaultGraphicTypeId,
        prev.graphicTypeId || DEFAULT_GRAPHIC_TYPE_ID
      ),
      aspectRatio: preferredAspectRatio
        ? getSafeAspectRatioForModel(selectedModelForDefaults, preferredAspectRatio, resources.aspectRatios)
        : getSafeAspectRatioForModel(
            selectedModelForDefaults,
            prev.aspectRatio || DEFAULT_ASPECT_RATIO || modelAspectRatios[0]?.value || '',
            resources.aspectRatios
          )
    }));
    setHasHydratedToolbarState(true);
  };

  useEffect(() => {
    // Reset selection state when account context changes so defaults can be applied per user.
    setHasHydratedToolbarState(false);
    setConfig(prev => ({
      ...prev,
      colorSchemeId: '',
      visualStyleId: '',
      graphicTypeId: '',
      aspectRatio: ''
    }));
  }, [user?.id]);

  useEffect(() => {
    // Seed structures only for admins. Prefer the Firebase Auth custom claim
    // via `user.isAdmin`; keep the `planetoftheweb` username as a bootstrap
    // fallback so the legacy admin can seed even before the claim is minted.
    const canSeed = Boolean(user && (user.isAdmin || user.username === 'planetoftheweb'));
    if (canSeed && user) {
       seedStructures(user).then(() => loadResources(user));
    } else {
       loadResources(user);
    }
    
    // Seed catalog (legacy community items) - can probably be removed or gated too
    // seedCatalog().catch(console.error);
  }, [user?.id, user?.username, user?.isAdmin]); // Run when account context changes

  // Effect to toggle body class
  useEffect(() => {
    if (isDarkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [isDarkMode]);

  // Restore user session on page load
  useEffect(() => {
    const unsubscribe = authService.onAuthStateChange(async (restoredUser) => {
      if (restoredUser) {
        const cachedSelection = readToolbarSelection(restoredUser.id);
        const cachedModel = cachedSelection?.selectedModel;
        const hydratedUser =
          cachedModel && cachedModel !== restoredUser.preferences.selectedModel
            ? {
                ...restoredUser,
                preferences: {
                  ...restoredUser.preferences,
                  selectedModel: cachedModel
                }
              }
            : restoredUser;
        setUser(hydratedUser);
        try {
          const mergeResult = await historyService.mergeLocalToRemote(hydratedUser.id);
          if (mergeResult.failed > 0) {
            setError(`Synced ${mergeResult.synced} item(s), but ${mergeResult.failed} local item(s) are still pending sync.`);
          }
        } catch (mergeErr) {
          console.error("Failed to merge pending local history on session restore:", mergeErr);
        }
        // Load history for restored user
        const updatedHistory = await historyService.getHistory(hydratedUser);
        setHistory(updatedHistory);
      } else {
        setUser(null);
        setHistory([]);
      }
    });

    return () => unsubscribe();
  }, []); // Run once on mount

  // Sync preferences to Auth Service when they change AND a user is logged in
  useEffect(() => {
    if (user) {
      // Only sync settings/API keys now. Custom items are saved directly via resourceService.
      // This runs when preferences change, not on every user load
      authService.updateUserPreferences(user.id, {
        geminiApiKey: user.preferences.geminiApiKey,
        apiKeys: user.preferences.apiKeys,
        selectedModel: user.preferences.selectedModel,
        systemPrompt: user.preferences.systemPrompt,
        settings: user.preferences.settings
      }).catch(err => {
        // Silently fail if it's just a sync issue (not a critical error)
        console.warn("Failed to sync preferences:", err);
      });
    }
  }, [user?.preferences.settings, user?.preferences.apiKeys, user?.preferences.selectedModel, user?.preferences.systemPrompt]); // Only trigger on actual preference changes, not user object changes

  const handleLoginSuccess = async (loggedInUser: User) => {
    setUser(loggedInUser);
    // Resources are loaded via the useEffect([user?.id]) hook now
    
    // Ensure selected IDs in config are still valid... (Logic handled in loadResources mostly)
    
    // Merge local history if any
    try {
      const mergeResult = await historyService.mergeLocalToRemote(loggedInUser.id);
      if (mergeResult.failed > 0) {
        setError(`Synced ${mergeResult.synced} item(s), but ${mergeResult.failed} local item(s) could not be synced yet. They were kept locally.`);
      }
    } catch (e) {
      console.error("Failed to merge local history:", e);
      setError("Some local history could not be synced to your account. Your local copies were kept.");
    }
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
  const selectedModel = user?.preferences.selectedModel || guestSelectedModel;

  // Multi-model "compare" selection. When length > 1, handleGenerate fans the
  // batch out across every selected model, tagging every produced history tile
  // with a shared comparisonBatchId. Single-model generation is the default
  // and leaves this at [selectedModel].
  const [selectedModelIds, setSelectedModelIds] = useState<string[]>([selectedModel]);

  useEffect(() => {
    setSelectedModelIds((prev) => {
      if (prev.length <= 1) return [selectedModel];
      if (!prev.includes(selectedModel)) return [selectedModel, ...prev];
      return prev;
    });
  }, [selectedModel]);

  // --- Comparison (Juxtapose) state machine -------------------------------
  // Picks up to two marks from anywhere in the app (thumbnail rail, current
  // viewport, or Recent Generations tile). Once two are selected we render
  // either an inline or full-screen JuxtaposeSlider. Intentionally live-only
  // — nothing about the comparison itself is persisted.
  const [comparisonState, setComparisonState] = useState<{
    mode: 'idle' | 'picking';
    a: MarkRef | null;
    b: MarkRef | null;
  }>({ mode: 'idle', a: null, b: null });

  // `seed` lets callers pre-populate slot A when entering picker mode. This is
  // the common case coming from the main viewport: a thumbnail is already
  // committed, and the user just wants to pick a second mark to compare it
  // against. Without seeding, users had to redundantly click the already-
  // selected thumb to make it A, then click the second to make it B.
  const enterComparePickerMode = (seed?: MarkRef) => {
    setComparisonState((prev) => {
      if (prev.mode === 'picking') {
        // Already picking. Seed A if it's still empty so a late-arriving
        // default (e.g. viewport committing after mode flip) doesn't get
        // dropped, but leave user-chosen marks alone.
        if (seed && !prev.a && !prev.b) return { ...prev, a: seed };
        return prev;
      }
      return { mode: 'picking', a: seed || null, b: null };
    });
  };
  const exitComparePickerMode = () => {
    setComparisonState({ mode: 'idle', a: null, b: null });
  };
  const pickMarkForComparison = (ref: MarkRef) => {
    setComparisonState((prev) => {
      const isSameMark = (x: MarkRef | null) =>
        !!x && x.generationId === ref.generationId && x.versionId === ref.versionId;
      if (isSameMark(prev.a)) {
        return { ...prev, a: prev.b, b: null, mode: 'picking' };
      }
      if (isSameMark(prev.b)) {
        return { ...prev, b: null, mode: 'picking' };
      }
      if (!prev.a) {
        return { ...prev, a: ref, mode: 'picking' };
      }
      if (!prev.b) {
        return { mode: 'idle', a: prev.a, b: ref };
      }
      // Both already set — replace B with the new pick and re-open the slider.
      return { mode: 'idle', a: prev.a, b: ref };
    });
  };

  // Escape exits picker mode.
  useEffect(() => {
    if (comparisonState.mode !== 'picking') return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') exitComparePickerMode();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [comparisonState.mode]);

  useEffect(() => {
    setConfig(prev => {
      const safeAspectRatio = getSafeAspectRatioForModel(selectedModel, prev.aspectRatio, aspectRatios);
      if (safeAspectRatio === prev.aspectRatio) return prev;
      return { ...prev, aspectRatio: safeAspectRatio };
    });
  }, [selectedModel, aspectRatios]);

  useEffect(() => {
    if (!hasHydratedToolbarState) return;
    writeToolbarSelection(
      {
        colorSchemeId: config.colorSchemeId,
        visualStyleId: config.visualStyleId,
        graphicTypeId: config.graphicTypeId,
        aspectRatio: config.aspectRatio,
        selectedModel,
        openaiImageQuality: user?.preferences.settings?.openaiImageQuality
      },
      user?.id
    );
  }, [
    hasHydratedToolbarState,
    config.colorSchemeId,
    config.visualStyleId,
    config.graphicTypeId,
    config.aspectRatio,
    selectedModel,
    user?.preferences.settings?.openaiImageQuality,
    user?.id
  ]);

  // Auto-promote the current toolbar selection to the user's persistent
  // Firestore defaults so a fresh browser / private window / new device
  // restores the same look-and-feel. The localStorage cache above handles
  // the zero-latency hydrate; this backs it with durable server state so
  // "I don't think it's remembering my preferences" never happens.
  // Only runs once hydration is complete so we don't echo stale '' values
  // back into Firestore during the initial clear-then-load cycle.
  useEffect(() => {
    if (!user || !hasHydratedToolbarState) return;
    const existingSettings = user.preferences.settings || { contributeByDefault: false };
    const nextDefaults = {
      defaultGraphicTypeId: config.graphicTypeId || undefined,
      defaultVisualStyleId: config.visualStyleId || undefined,
      defaultColorSchemeId: config.colorSchemeId || undefined,
      defaultAspectRatio: config.aspectRatio || undefined,
    };
    const defaultsChanged =
      nextDefaults.defaultGraphicTypeId !== existingSettings.defaultGraphicTypeId ||
      nextDefaults.defaultVisualStyleId !== existingSettings.defaultVisualStyleId ||
      nextDefaults.defaultColorSchemeId !== existingSettings.defaultColorSchemeId ||
      nextDefaults.defaultAspectRatio !== existingSettings.defaultAspectRatio;
    const modelChanged = selectedModel !== user.preferences.selectedModel;
    if (!defaultsChanged && !modelChanged) return;

    setUser(prev =>
      prev
        ? {
            ...prev,
            preferences: {
              ...prev.preferences,
              selectedModel,
              settings: {
                ...existingSettings,
                ...nextDefaults,
              },
            },
          }
        : prev
    );
  }, [
    hasHydratedToolbarState,
    user?.id,
    config.colorSchemeId,
    config.visualStyleId,
    config.graphicTypeId,
    config.aspectRatio,
    selectedModel,
  ]);

  const getApiKeyForModel = (modelId: string): string | undefined => {
    if (!user) return undefined;
    if (user.preferences.apiKeys && user.preferences.apiKeys[modelId]) {
      return user.preferences.apiKeys[modelId];
    }
    // Gemini-family models share the gemini key by default.
    if (
      modelId === 'gemini' ||
      modelId === 'gemini-3.1-flash-image-preview' ||
      modelId === 'gemini-svg'
    ) {
      if (user.preferences.apiKeys?.gemini) return user.preferences.apiKeys.gemini;
      if (user.preferences.geminiApiKey) return user.preferences.geminiApiKey;
    }
    // All OpenAI-family models share one OpenAI API key slot.
    if (modelId === 'openai' || modelId === 'openai-2' || modelId === 'openai-mini') {
      if (user.preferences.apiKeys?.openai) return user.preferences.apiKeys.openai;
    }
    return undefined;
  };

  const getActiveApiKey = (): string | undefined => getApiKeyForModel(selectedModel);

  const activeApiKey = getActiveApiKey();
  const needsSetup = !user || !activeApiKey;

  useEffect(() => {
    if (needsSetup) {
      setIsSetupModalOpen(true);
    } else {
      setIsSetupModalOpen(false);
    }
  }, [needsSetup, user?.id]);

  // If the currently selected model has no usable API key but the user has
  // configured a key for some other supported model, auto-switch to that
  // model so the user can start generating immediately instead of being
  // stuck behind the "One setup step left" banner.
  useEffect(() => {
    if (!user) return;
    if (activeApiKey) return;
    const fallbackModel = SUPPORTED_MODELS.find(
      (model) => model.id !== selectedModel && !!getApiKeyForModel(model.id)
    );
    if (!fallbackModel) return;
    const updatedUser = {
      ...user,
      preferences: {
        ...user.preferences,
        selectedModel: fallbackModel.id
      }
    };
    setUser(updatedUser);
    authService.updateUserPreferences(user.id, updatedUser.preferences).catch(console.error);
  }, [user?.id, user?.preferences.apiKeys, user?.preferences.geminiApiKey, selectedModel, activeApiKey]);

  // Keep the generation monitor's elapsed/remaining display live by nudging a
  // tick once per second while at least one background generation is running.
  useEffect(() => {
    if (!hasRunningGenerationJobs) return;
    const interval = window.setInterval(() => {
      setBatchClockTick((t) => (t + 1) % 1_000_000);
    }, 1000);
    return () => window.clearInterval(interval);
  }, [hasRunningGenerationJobs]);

  useEffect(() => {
    return () => {
      Object.values(generationJobAbortControllersRef.current).forEach((controller) => controller.abort());
      generationJobAbortControllersRef.current = {};
      Object.values(generationJobDismissTimersRef.current).forEach((timer) => window.clearTimeout(timer));
      generationJobDismissTimersRef.current = {};
    };
  }, []);

  const executeDeleteHistory = async (generationId: string) => {
    if (user) {
      await historyService.deleteFromRemote(user.id, generationId);
      const updatedHistory = await historyService.getHistory(user);
      setHistory(updatedHistory);
    } else {
      historyService.deleteFromLocal(generationId);
      const updatedHistory = historyService.getFromLocal();
      setHistory(updatedHistory);
    }
  };

  const requestDeleteHistory = (historyId: string) => {
    // Tile-trash is destructive enough that we always force the confirmation
    // modal here, even when the user has previously checked "Don't ask me
    // again". The setting is still respected for the main-image trash button
    // (`requestDeleteCurrent`), where you're explicitly working with one
    // image and there's no risk of an accidental misclick on a thumbnail.
    setSkipFutureConfirm(false);
    setConfirmDeleteModal({ type: 'history', id: historyId });
  };

  const buildStructuredPrompt = (currentConfig: GenerationConfig): string => {
    const typeLabel = context.graphicTypes.find(g => g.id === currentConfig.graphicTypeId)?.name || currentConfig.graphicTypeId;
    const styleObj = context.visualStyles.find(s => s.id === currentConfig.visualStyleId);
    const styleLabel = styleObj?.name || currentConfig.visualStyleId;
    const styleDesc = styleObj?.description ? ` (${styleObj.description})` : '';
    const colorsObj = context.brandColors.find(c => c.id === currentConfig.colorSchemeId);
    const colorsLabel = colorsObj ? `${colorsObj.name}: ${colorsObj.colors.join(', ')}` : '';
    const modelAspectRatios = getAspectRatiosForModel(selectedModel, context.aspectRatios);
    const aspectLabel = modelAspectRatios.find(a => a.value === currentConfig.aspectRatio)?.label || currentConfig.aspectRatio;

    const expanded = [
      `Generate a ${typeLabel}`,
      aspectLabel ? `at ${aspectLabel} aspect ratio` : '',
      styleLabel ? `in the ${styleLabel}${styleDesc}` : '',
      colorsLabel ? `using palette ${colorsLabel}` : '',
      `Subject/Content: ${currentConfig.prompt}`
    ].filter(Boolean).join('. ');

    return [
      `Original Prompt: ${currentConfig.prompt}`,
      `Structured Prompt: ${expanded}`,
      `Type: ${typeLabel}`,
      styleLabel ? `Style: ${styleLabel}${styleDesc}` : '',
      colorsLabel ? `Colors: ${colorsLabel}` : '',
      aspectLabel ? `Size: ${aspectLabel}` : ''
    ].filter(Boolean).join('\n');
  };

  const fetchImageAsBase64 = async (url: string): Promise<{ base64: string; mime: string }> => {
    const res = await fetch(url);
    const blob = await res.blob();
    const mime = blob.type || 'image/png';
    const buffer = await blob.arrayBuffer();
    const base64 = btoa(String.fromCharCode(...new Uint8Array(buffer)));
    return { base64, mime };
  };

  const handleCopyCurrent = async () => {
    if (!currentGeneration) return;
    const version = getCurrentVersion(currentGeneration);
    try {
      let imageDescription = '';
      try {
        const { base64, mime } = await fetchImageAsBase64(version.imageUrl);
        imageDescription = await describeImagePrompt(base64, mime, getActiveApiKey());
      } catch (err) {
        console.warn('Image describe fallback (main image):', err);
      }

      const structured = buildStructuredPrompt(currentGeneration.config);
      const finalText = imageDescription
        ? `${structured}\n\nImage-Based Prompt: ${imageDescription}`
        : structured;
      await navigator.clipboard.writeText(finalText);
    } catch (err) {
      console.error("Failed to copy prompt:", err);
      setError("Failed to copy prompt.");
    }
  };

  const executeDeleteCurrent = async () => {
    if (!currentGeneration) return;
    await executeDeleteHistory(currentGeneration.id);
    setCurrentGeneration(null);
  };

  const requestDeleteCurrent = () => {
    if (!currentGeneration) return;
    const needConfirm = user?.preferences?.settings?.confirmDeleteCurrent ?? true;
    if (needConfirm) {
      setSkipFutureConfirm(false);
      setConfirmDeleteModal({ type: 'current', id: currentGeneration.id });
    } else {
      executeDeleteCurrent().catch((err) => {
        console.error("Failed to delete current image:", err);
        setError(err.message || "Failed to delete image.");
      });
    }
  };

  const applySkipFuture = async (type: 'history' | 'current') => {
    if (!skipFutureConfirm || !user) return;
    const newSettings = {
      ...user.preferences.settings,
      confirmDeleteHistory: type === 'history' ? false : user.preferences.settings?.confirmDeleteHistory ?? true,
      confirmDeleteCurrent: type === 'current' ? false : user.preferences.settings?.confirmDeleteCurrent ?? true,
    };
    const updatedUser = {
      ...user,
      preferences: {
        ...user.preferences,
        settings: newSettings,
      }
    };
    setUser(updatedUser);
    try {
      await authService.updateUserPreferences(user.id, { ...user.preferences, settings: newSettings });
    } catch (err) {
      console.error("Failed to update preferences for confirmations:", err);
    }
  };

  const handleConfirmDeleteModal = async () => {
    if (!confirmDeleteModal) return;
    const { type, id } = confirmDeleteModal;
    try {
      if (type === 'history' && id) {
        await executeDeleteHistory(id);
        await applySkipFuture('history');
      } else if (type === 'current') {
        await executeDeleteCurrent();
        await applySkipFuture('current');
      }
    } catch (err: any) {
      setError(err.message || "Failed to delete item.");
    } finally {
      setConfirmDeleteModal(null);
      setSkipFutureConfirm(false);
    }
  };

  const handleCancelDeleteModal = () => {
    setConfirmDeleteModal(null);
    setSkipFutureConfirm(false);
  };

  const openAuthModal = (mode: 'login' | 'signup' = 'login') => {
    setAuthModalMode(mode);
    setIsAuthModalOpen(true);
  };

  const updateGenerationJob = (
    jobId: string,
    updater: (job: ActiveGenerationJob) => ActiveGenerationJob
  ) => {
    setActiveGenerationJobs((prev) =>
      prev.map((job) => (job.id === jobId ? updater(job) : job))
    );
  };

  const clearGenerationJob = (jobId: string) => {
    const dismissTimer = generationJobDismissTimersRef.current[jobId];
    if (dismissTimer) {
      window.clearTimeout(dismissTimer);
      delete generationJobDismissTimersRef.current[jobId];
    }
    delete generationJobAbortControllersRef.current[jobId];
    setActiveGenerationJobs((prev) => prev.filter((job) => job.id !== jobId));
  };

  const scheduleGenerationJobDismissal = (jobId: string, delayMs = 9000) => {
    const existing = generationJobDismissTimersRef.current[jobId];
    if (existing) window.clearTimeout(existing);
    generationJobDismissTimersRef.current[jobId] = window.setTimeout(() => {
      clearGenerationJob(jobId);
    }, delayMs);
  };

  const handleStopGenerationJob = (jobId: string) => {
    const controller = generationJobAbortControllersRef.current[jobId];
    if (!controller || controller.signal.aborted) return;
    controller.abort();
    updateGenerationJob(jobId, (job) => ({ ...job, status: 'stopping' }));
  };

  const handleGenerate = async (count: number = 1) => {
    // Fresh generations should always leave compare mode. Keeping an old
    // A/B selection active while new tiles are being produced is confusing,
    // because the viewport appears "stuck" on a stale comparison.
    setComparisonState({ mode: 'idle', a: null, b: null });
    setError(null);
    setBatchClockTick(0);

    let jobId = '';
    try {
      if (!user) {
        openAuthModal('signup');
        throw new Error('Free accounts use your own API key (BYOK). Create an account, then add your key in Settings to start generating.');
      }
      if (!config.prompt.trim()) {
        throw new Error('Enter a prompt before generating.');
      }

      const modelIdsToRun = selectedModelIds.length > 0 ? selectedModelIds : [selectedModel];
      const apiKeysByModel = modelIdsToRun.reduce<Record<string, string>>((acc, modelId) => {
        const key = getApiKeyForModel(modelId);
        if (key) acc[modelId] = key;
        return acc;
      }, {});
      // Verify every selected model has an API key wired up before we start.
      const missingKeys = modelIdsToRun.filter((id) => !apiKeysByModel[id]);
      if (missingKeys.length > 0) {
        setSettingsMode(true);
        throw new Error(
          missingKeys.length === modelIdsToRun.length
            ? 'Add your API key in Settings before generating. Free accounts use BYOK keys.'
            : `Missing API key(s) for: ${missingKeys.join(', ')}. Add them in Settings or deselect those models.`
        );
      }

      const safeAspectRatioPrimary = getSafeAspectRatioForModel(selectedModel, config.aspectRatio, aspectRatios);
      const safeConfig = safeAspectRatioPrimary === config.aspectRatio ? config : { ...config, aspectRatio: safeAspectRatioPrimary };
      if (safeAspectRatioPrimary !== config.aspectRatio) {
        setConfig(prev => ({ ...prev, aspectRatio: safeAspectRatioPrimary }));
      }

      const { prompts } = expandPromptPermutations(safeConfig.prompt || '');
      const safeCount = Math.max(1, Math.floor(count || 1));
      const perModelRuns = prompts.length * safeCount;
      const totalRuns = perModelRuns * modelIdsToRun.length;
      const cap = batchCapFor(user);
      if (Number.isFinite(cap) && totalRuns > cap) {
        throw new Error(
          `Batch would run ${totalRuns} generation${totalRuns === 1 ? '' : 's'} (limit ${cap}). Reduce variations, brace options, or selected models.`
        );
      }

      // Comparison batch id — only stamped when running more than one model.
      // It still acts as a "this tile is a multi-model comparison run" marker
      // for UI chrome (badge in Recent Generations), even though all marks now
      // live in a single Generation tile rather than across siblings.
      const comparisonBatchId =
        modelIdsToRun.length > 1
          ? `cmp-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
          : undefined;

      // Shared across ALL models in this Generate click. We want one tile that
      // holds every mark from every selected model so the user can compare
      // them side-by-side with the slider, instead of two sibling tiles.
      // Persistence is serialised through `persistQueue` so concurrent workers
      // don't race when appending versions or saving to Firestore.
      let sharedBatchGeneration: Generation | null = null;
      let sharedPersistQueue: Promise<Generation | null> = Promise.resolve(null);
      const primaryModelId = modelIdsToRun[0];
      const runUser = user;
      const runContext = context;
      const runSystemPrompt = user.preferences.systemPrompt;
      const runOpenAIQuality = user.preferences.settings?.openaiImageQuality || 'auto';
      const startedAt = Date.now();
      jobId = `run-${startedAt.toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
      const abortController = new AbortController();
      generationJobAbortControllersRef.current[jobId] = abortController;
      const initialModelProgress = modelIdsToRun.reduce<Record<string, BatchModelProgressSummary>>((acc, modelId) => {
        acc[modelId] = {
          total: perModelRuns,
          completed: 0,
          failed: 0,
          inFlight: 0,
        };
        return acc;
      }, {});

      setActiveGenerationJobs((prev) => [
        {
          id: jobId,
          prompt: safeConfig.prompt,
          modelIds: modelIdsToRun,
          total: totalRuns,
          completed: 0,
          failed: 0,
          inFlight: 0,
          startedAt,
          status: 'running',
          errors: [],
          modelProgress: initialModelProgress,
          currentJobs: [],
        },
        ...prev
      ]);

      // Aggregate progress across all per-model batches. Models run in
      // parallel (see Promise.all below), so we can't just add a running
      // total — progress events from different models arrive interleaved.
      // Instead, each model reports its own latest BatchProgress into
      // `perModelProgress` and we re-sum across all known models on every
      // event. Single-source-of-truth and concurrency-safe.
      const perModelProgress: Record<string, BatchProgress> = {};
      const aggregate = {
        errors: [] as BatchError[],
        lastGeneration: undefined as Generation | undefined,
        fatalError: undefined as BatchError | undefined,
        /** Which model hit the fatal error (surfaced in the banner copy). */
        fatalErrorModelId: undefined as string | undefined,
      };

      const summarizeAcrossModels = (latest?: Generation) => {
        const entries = Object.values(perModelProgress);
        const completed = entries.reduce((acc, p) => acc + p.completed, 0);
        const failed = entries.reduce((acc, p) => acc + p.failed, 0);
        const inFlight = entries.reduce((acc, p) => acc + p.inFlight, 0);
        const errors = entries.flatMap((p) => p.errors);
        const currentJobs = Object.entries(perModelProgress).flatMap(([modelId, progress]) =>
          (progress.currentJobs || []).map((job) => ({
            key: `${modelId}:${job.jobId}`,
            modelId,
            prompt: job.prompt,
          }))
        );
        return {
          total: totalRuns,
          completed,
          failed,
          inFlight,
          errors,
          latest: latest || aggregate.lastGeneration,
          currentJobs,
        };
      };

      const runBatchForModel = async (modelId: string) => {
        const modelKey = apiKeysByModel[modelId];
        if (!modelKey) throw new Error(`Missing API key for ${modelId}.`);
        // Per-model aspect-ratio coercion: GPT Image 2 supports wider ratios
        // than GPT Image 1.5, Gemini models support different ones, etc.
        const safeAspectRatioForModel = getSafeAspectRatioForModel(modelId, safeConfig.aspectRatio, runContext.aspectRatios);
        const modelSafeConfig = safeAspectRatioForModel === safeConfig.aspectRatio
          ? safeConfig
          : { ...safeConfig, aspectRatio: safeAspectRatioForModel };

        const runOne = async (job: BatchJob): Promise<Generation> => {
          const jobConfig: GenerationConfig = { ...modelSafeConfig, prompt: job.prompt };
          const structuredPrompt = buildStructuredPrompt(jobConfig);

          const jobStart = performance.now();
          let result;
          if (modelId === 'gemini-svg') {
            result = await generateSvg(jobConfig, runContext, modelKey, runSystemPrompt);
          } else if (modelId === 'openai' || modelId === 'openai-2' || modelId === 'openai-mini') {
            result = await generateOpenAIImage(structuredPrompt, jobConfig, modelKey, {
              modelId,
              quality: runOpenAIQuality,
              systemPrompt: runSystemPrompt
            });
          } else {
            result = await generateGraphic(jobConfig, runContext, modelKey, runSystemPrompt, modelId);
          }
          recordModelDuration(modelId, performance.now() - jobStart);

          // Safety net: occasionally a model API returns a 200 with an empty
          // payload (no base64 / no svg) — the call doesn't throw, but the
          // resulting "image" is a 0-byte tile that renders solid black in
          // the gallery and Compare rail. Without this guard we persisted
          // those blanks as `type: 'generation'` versions, which the user
          // could not remove individually. Treat empties as a failure so
          // they're counted in `state.failed` and never make it to the
          // version list.
          const isSvgResult = result?.mimeType === 'image/svg+xml';
          const hasUsableBytes = isSvgResult
            ? Boolean(result?.svgCode && result.svgCode.trim().length > 0)
            : Boolean(result?.base64Data && result.base64Data.length > 100);
          if (!hasUsableBytes) {
            throw new Error('Model returned an empty image — skipping');
          }

          // Append into the SHARED tile. The first version anywhere in the
          // Generate click creates the Generation; everything afterwards
          // becomes another version, regardless of which model produced it.
          // The Generation's primary modelId stays as the first selected
          // model; per-version `modelId` tracks which model made each mark.
          const prev = sharedPersistQueue;
          const next: Promise<Generation> = prev.then(async () => {
            if (!sharedBatchGeneration) {
              // The first version is created via createGeneration so the tile's
              // top-level config/modelId is set. We use the *primary* model id
              // for the Generation so the tile's overall identity stays stable
              // even if the first job to finish was from a secondary model.
              const generation = await createGeneration(
                result,
                { ...jobConfig },
                primaryModelId,
                comparisonBatchId
              );
              // Tag this first version with whichever model actually produced it.
              if (generation.versions[0]) {
                generation.versions[0].modelId = modelId;
                generation.versions[0].aspectRatio = jobConfig.aspectRatio;
              }
              sharedBatchGeneration = generation;
              await historyService.saveGeneration(runUser, generation);
              return generation;
            }
            const nextNumber = sharedBatchGeneration.versions.length + 1;
            const newVersion = await createVersionFromImage(
              result,
              nextNumber,
              'generation',
              job.prompt,
              sharedBatchGeneration.versions[sharedBatchGeneration.currentVersionIndex]?.id,
              jobConfig.aspectRatio,
              modelId
            );
            const updated: Generation = {
              ...sharedBatchGeneration,
              versions: [...sharedBatchGeneration.versions, newVersion],
              currentVersionIndex: sharedBatchGeneration.versions.length,
            };
            sharedBatchGeneration = updated;
            await historyService.updateGeneration(runUser, updated);
            return updated;
          });

          sharedPersistQueue = next;
          return next;
        };

        const perModelResult = await runBatchGenerations({
          prompts,
          copiesPerPrompt: safeCount,
          concurrency: DEFAULT_BATCH_CONCURRENCY,
          signal: abortController.signal,
          runOne,
          onProgress: (progress) => {
            // Store THIS model's latest snapshot, then recompute the cross-
            // model summary. Because onProgress can fire concurrently from
            // different models, we always re-sum from the shared map rather
            // than accumulating deltas.
            perModelProgress[modelId] = progress;
            const summary = summarizeAcrossModels(progress.latest);
            updateGenerationJob(jobId, (job) => ({
              ...job,
              completed: summary.completed,
              failed: summary.failed,
              inFlight: summary.inFlight,
              errors: summary.errors,
              latest: summary.latest || job.latest,
              currentJobs: summary.currentJobs,
              modelProgress: {
                ...job.modelProgress,
                [modelId]: {
                  total: perModelRuns,
                  completed: progress.completed,
                  failed: progress.failed,
                  inFlight: progress.inFlight,
                }
              }
            }));
            if (progress.latest) {
              const latest = progress.latest;
              aggregate.lastGeneration = latest;
              setCurrentGeneration(latest);
              setHistory((prev) => {
                const idx = prev.findIndex((g) => g.id === latest.id);
                if (idx >= 0) {
                  const nextHistory = [...prev];
                  nextHistory[idx] = latest;
                  return nextHistory;
                }
                return [latest, ...prev];
              });
            }
          }
        });

        aggregate.errors.push(...perModelResult.errors);
        if (perModelResult.lastGeneration) aggregate.lastGeneration = perModelResult.lastGeneration;
        if (perModelResult.fatalError && !aggregate.fatalError) {
          aggregate.fatalError = perModelResult.fatalError;
          aggregate.fatalErrorModelId = modelId;
        }
        return perModelResult;
      };

      // Run all selected models in PARALLEL. Previously this was a sequential
      // for-await loop, which meant a 2-model compare run waited for model A
      // to finish before firing the first request for model B — so a user
      // ever saw at most `DEFAULT_BATCH_CONCURRENCY` API calls in flight
      // regardless of how many models they picked. With Promise.all, each
      // model runs its own workers independently, giving N × concurrency
      // total in-flight.
      //
      // Fatal-error short-circuiting still works: the per-model batch runner
      // self-stops on billing/key/quota errors. Sibling models sharing the
      // same API key will independently hit the same error and stop; we don't
      // try to pre-cancel them because Promise.all starts them simultaneously.
      await Promise.all(modelIdsToRun.map((modelId) => runBatchForModel(modelId)));

      try {
        const updatedHistory = await historyService.getHistory(runUser);
        setHistory(updatedHistory);
      } catch (historyErr) {
        console.warn('History refresh after batch failed:', historyErr);
      }

      const finalSummary = summarizeAcrossModels();
      const totalCompleted = finalSummary.completed;
      const totalFailed = finalSummary.failed;

      const wasAborted = abortController.signal.aborted;
      let finalStatus: ActiveGenerationJobStatus = 'completed';
      let finalMessage = `Completed ${totalCompleted} of ${totalRuns}.`;
      if (wasAborted) {
        finalStatus = 'stopped';
        finalMessage = `Stopped after ${totalCompleted} of ${totalRuns}. Kept the completed generation${totalCompleted === 1 ? '' : 's'}.`;
      } else if (aggregate.fatalError) {
        // Provider refused further calls outright (billing / key / quota).
        // Prefer the friendly fatal message over the generic "N failed" wording.
        finalStatus = 'failed';
        finalMessage = `${aggregate.fatalError.message} (Completed ${totalCompleted} of ${totalRuns}.)`;
        setError(finalMessage);
      } else if (totalFailed > 0) {
        const sample = aggregate.errors[0]?.message;
        finalStatus = 'failed';
        finalMessage = `Completed ${totalCompleted} of ${totalRuns}. ${totalFailed} failed${sample ? `: ${sample}` : '.'}`;
        setError(finalMessage);
      }
      updateGenerationJob(jobId, (job) => ({
        ...job,
        completed: totalCompleted,
        failed: totalFailed,
        inFlight: 0,
        currentJobs: [],
        errors: finalSummary.errors,
        latest: finalSummary.latest || job.latest,
        status: finalStatus,
        finishedAt: Date.now(),
        message: finalMessage,
      }));
      scheduleGenerationJobDismissal(jobId, finalStatus === 'failed' ? 14000 : 9000);
    } catch (err: any) {
      const message = err.message || 'An unexpected error occurred.';
      setError(message);
      if (jobId) {
        updateGenerationJob(jobId, (job) => ({
          ...job,
          status: 'failed',
          inFlight: 0,
          currentJobs: [],
          finishedAt: Date.now(),
          message,
        }));
        scheduleGenerationJobDismissal(jobId, 14000);
      }
    } finally {
      if (jobId) {
        delete generationJobAbortControllersRef.current[jobId];
      }
    }
  };

  const handleRefine = async (refinementText: string) => {
    if (!currentGeneration) return;

    setIsGenerating(true);
    setError(null);
    try {
      if (!user) {
        openAuthModal('signup');
        throw new Error('Free accounts use your own API key (BYOK). Create an account, then add your key in Settings to refine images.');
      }

      const customKey = getActiveApiKey();
      if (!customKey) {
        setSettingsMode(true);
        throw new Error('Add your API key in Settings before refining. Free accounts use BYOK keys.');
      }

      const currentVersion = getCurrentVersion(currentGeneration);
      const requestedAspectRatio = extractAspectRatioFromText(refinementText, selectedModel, aspectRatios);
      const currentVersionAspectRatio =
        normalizeAspectRatio(currentVersion.aspectRatio || currentGeneration.config.aspectRatio || config.aspectRatio);
      const desiredAspectRatio = requestedAspectRatio || currentVersionAspectRatio || config.aspectRatio;
      const safeAspectRatio = getSafeAspectRatioForModel(selectedModel, desiredAspectRatio, aspectRatios);
      const safeConfig = safeAspectRatio === config.aspectRatio ? config : { ...config, aspectRatio: safeAspectRatio };
      if (safeAspectRatio !== config.aspectRatio) {
        setConfig(prev => ({ ...prev, aspectRatio: safeAspectRatio }));
      }
      const structuredPrompt = buildStructuredPrompt(safeConfig);

      const currentImage: GeneratedImage = {
        imageUrl: currentVersion.imageUrl,
        base64Data: currentVersion.imageData,
        mimeType: currentVersion.mimeType,
      };

      let result;
      if (selectedModel === 'gemini-svg') {
        const svgCode = currentVersion.svgCode || '';
        result = await refineSvg(svgCode, refinementText, safeConfig, context, customKey, user?.preferences.systemPrompt);
      } else if (
        selectedModel === 'openai' ||
        selectedModel === 'openai-2' ||
        selectedModel === 'openai-mini'
      ) {
        if (!customKey) throw new Error('OpenAI API key is required for image generation.');
        const refinementRequest = `${structuredPrompt}\nRefinement: ${refinementText}`;
        result = await generateOpenAIImage(refinementRequest, safeConfig, customKey, {
          modelId: selectedModel,
          quality: user?.preferences.settings?.openaiImageQuality || 'auto',
          systemPrompt: user?.preferences.systemPrompt
        });
      } else {
        result = await refineGraphic(
          currentImage,
          refinementText,
          safeConfig,
          context,
          customKey,
          user?.preferences.systemPrompt,
          selectedModel,
          currentVersionAspectRatio || currentGeneration.config.aspectRatio
        );
      }

      const updatedGeneration = await addRefinementVersion(
        currentGeneration,
        result,
        refinementText,
        selectedModel,
        safeAspectRatio
      );
      setCurrentGeneration(updatedGeneration);

      await historyService.updateGeneration(user, updatedGeneration);
      const updatedHistory = await historyService.getHistory(user);
      setHistory(updatedHistory);

    } catch (err: any) {
      setError(err.message || 'Failed to refine image.');
    } finally {
      setIsGenerating(false);
    }
  };

  const handleAnalyzeRefinePrompt = async (): Promise<string> => {
    if (!currentGeneration) {
      throw new Error('Restore or generate an image first.');
    }

    if (!user) {
      openAuthModal('signup');
      throw new Error('Create a free account and add your API key in Settings before running analysis.');
    }

    const analysisKey = getApiKeyForModel('gemini');
    if (!analysisKey) {
      setSettingsMode(true);
      throw new Error('Add a Gemini API key in Settings to run image analysis.');
    }

    const currentVersion = getCurrentVersion(currentGeneration);
    const currentImage: GeneratedImage = {
      imageUrl: currentVersion.imageUrl,
      base64Data: currentVersion.imageData,
      mimeType: currentVersion.mimeType,
    };

    const plan = await analyzeImageForCorrectionPrompt(
      currentImage,
      currentGeneration.config,
      context,
      analysisKey,
      user?.preferences.systemPrompt
    );

    const issueLines = plan.issues.length > 0
      ? plan.issues.map((issue, idx) => `${idx + 1}. ${issue.trim()}`).join('\n')
      : '1. No explicit issues listed by analysis model.';

    // Route the fix through the stronger image-editing model by default.
    handleModelChange('gemini');

    const detailedPrompt = [
      'Correction Plan',
      `Summary: ${plan.analysisSummary || 'Review image text and labels for accuracy.'}`,
      '',
      'Detected Issues',
      issueLines,
      '',
      'Apply These Fixes',
      plan.fixPrompt || 'Correct all detected spelling, factual, and label alignment issues while preserving composition and style.'
    ].join('\n');

    return detailedPrompt.trim();
  };

  const handleResizeCanvasRefine = async (targetAspectRatioInput: string): Promise<void> => {
    if (!currentGeneration) {
      throw new Error('Restore or generate an image first.');
    }

    if (!user) {
      openAuthModal('signup');
      throw new Error('Create a free account and add your API key in Settings before resizing canvas.');
    }

    const targetModel =
      selectedModel === 'gemini' || selectedModel === 'gemini-3.1-flash-image-preview'
        ? selectedModel
        : 'gemini';
    const customKey = getApiKeyForModel(targetModel);
    if (!customKey) {
      setSettingsMode(true);
      throw new Error('Add a Gemini API key in Settings to run canvas resize.');
    }

    const currentVersion = getCurrentVersion(currentGeneration);
    if (currentVersion.mimeType === 'image/svg+xml') {
      throw new Error('Resize Canvas is currently optimized for raster images.');
    }

    const targetAspectRatio = getSafeAspectRatioForModel(targetModel, targetAspectRatioInput, aspectRatios);
    const sourceAspectRatio = normalizeAspectRatio(currentVersion.aspectRatio || currentGeneration.config.aspectRatio || config.aspectRatio);
    const normalizedTarget = normalizeAspectRatio(targetAspectRatio);

    if (!normalizedTarget) {
      throw new Error('Choose a valid target Size before resizing.');
    }

    if (sourceAspectRatio === normalizedTarget) {
      throw new Error(`Target size is already ${normalizedTarget}. Choose a different Size first.`);
    }

    if (selectedModel !== targetModel) {
      handleModelChange(targetModel);
    }

    setIsGenerating(true);
    setError(null);
    try {
      const currentImage: GeneratedImage = {
        imageUrl: currentVersion.imageUrl,
        base64Data: currentVersion.imageData,
        mimeType: currentVersion.mimeType,
      };

      const resizeConfig: GenerationConfig = {
        ...config,
        aspectRatio: targetAspectRatio
      };

      const colorScheme = context.brandColors.find(c => c.id === resizeConfig.colorSchemeId);
      const style = context.visualStyles.find(s => s.id === resizeConfig.visualStyleId);
      const type = context.graphicTypes.find(t => t.id === resizeConfig.graphicTypeId);
      const lockedResizePrompt = [
        `Aspect-ratio recomposition only: ${sourceAspectRatio || 'current'} -> ${normalizedTarget}.`,
        `Output must fully use the ${normalizedTarget} canvas without blank margins, color bars, or simple padded background extension.`,
        `Treat the source image as authoritative. Keep the same subject, illustration style, typography style, color palette, and overall design language (${type?.name || 'infographic'} / ${style?.name || 'current style'} / ${colorScheme ? `${colorScheme.name} (${colorScheme.colors.join(', ')})` : 'source palette'}).`,
        'Preserve existing text and labels verbatim unless there is an obvious typo; do not invent unrelated copy or random detached icons.',
        'Recompose layout for the new ratio by repositioning/expanding existing callouts and decorative structure so the result feels intentionally designed for this canvas.',
        'Keep the central figure and core information hierarchy intact, avoid major redraws, and avoid style drift or photorealism.'
      ].join(' ');

      const firstPassResult = await refineGraphic(
        currentImage,
        lockedResizePrompt,
        resizeConfig,
        context,
        customKey,
        user?.preferences.systemPrompt,
        targetModel,
        sourceAspectRatio || currentGeneration.config.aspectRatio,
        {
          forceAspectOnlyEdit: true,
          forceFillCanvas: true
        }
      );

      let result = firstPassResult;
      try {
        let looksPadded = await detectLikelyCanvasPadding(firstPassResult);
        if (looksPadded) {
          const secondPassPrompt = [
            `Second pass correction for ${normalizedTarget}: remove any empty side/top/bottom margins, border framing, or padded background from the previous output.`,
            'Rebuild layout so designed content fills almost the entire canvas while keeping the same subject, style, text, and palette.',
            'Do not produce a centered poster look; preserve the original visual identity and information hierarchy.'
          ].join(' ');

          result = await refineGraphic(
            firstPassResult,
            secondPassPrompt,
            resizeConfig,
            context,
            customKey,
            user?.preferences.systemPrompt,
            targetModel,
            normalizedTarget,
            {
              forceAspectOnlyEdit: true,
              forceFillCanvas: true
            }
          );
          looksPadded = await detectLikelyCanvasPadding(result);
        }

        if (looksPadded) {
          const conceptBrief = await describeImagePrompt(
            currentVersion.imageData,
            currentVersion.mimeType,
            customKey
          );
          const styleReferencePrompt = [
            `Rebuild this as a new composition at ${normalizedTarget}.`,
            'Use the original image as style reference only, not as a layout template.',
            'Keep the same subject matter and information intent, but redesign layout for this canvas.',
            `Concept brief: ${conceptBrief}`,
            'Prioritize clean typography, coherent callout placement, and full-canvas composition with no side padding.'
          ].join(' ');

          result = await generateGraphicWithStyleReference(
            currentImage,
            styleReferencePrompt,
            resizeConfig,
            context,
            customKey,
            user?.preferences.systemPrompt,
            targetModel
          );
        }
      } catch (qualityCheckError) {
        console.warn('Resize quality check failed; keeping first pass result.', qualityCheckError);
      }

      const updatedGeneration = await addRefinementVersion(
        currentGeneration,
        result,
        `Recompose resize to ${normalizedTarget} (same style)`,
        targetModel,
        targetAspectRatio
      );
      setCurrentGeneration(updatedGeneration);
      setConfig(prev => ({ ...prev, aspectRatio: targetAspectRatio }));

      await historyService.updateGeneration(user, updatedGeneration);
      const updatedHistory = await historyService.getHistory(user);
      setHistory(updatedHistory);
    } catch (err: any) {
      setError(err.message || 'Failed to resize canvas.');
      throw err;
    } finally {
      setIsGenerating(false);
    }
  };

  const handleRestoreFromHistory = async (gen: Generation) => {
    let restoredGeneration = gen;
    try {
      const hydrated = await historyService.getGeneration(user, gen.id, gen);
      if (hydrated) {
        restoredGeneration = hydrated;
      }
    } catch (err) {
      console.error("Failed to hydrate generation on restore:", err);
    }

    setConfig(restoredGeneration.config);
    setCurrentGeneration(restoredGeneration);
    setHistory(prev =>
      prev.map(item => (item.id === restoredGeneration.id ? restoredGeneration : item))
    );

    if (user && restoredGeneration.modelId) {
      const updatedUser = {
        ...user,
        preferences: {
          ...user.preferences,
          selectedModel: restoredGeneration.modelId
        }
      };
      setUser(updatedUser);
    }
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleVersionChange = (index: number) => {
    if (!currentGeneration) return;
    const nextVersion = currentGeneration.versions[index];
    const nextAspectRatio = normalizeAspectRatio(
      nextVersion?.aspectRatio || currentGeneration.config.aspectRatio || config.aspectRatio
    );
    const updatedGeneration = {
      ...currentGeneration,
      currentVersionIndex: index,
      config: nextAspectRatio
        ? { ...currentGeneration.config, aspectRatio: nextAspectRatio }
        : currentGeneration.config
    };
    setCurrentGeneration(updatedGeneration);
    if (nextAspectRatio && nextAspectRatio !== config.aspectRatio) {
      setConfig((prev) => ({ ...prev, aspectRatio: nextAspectRatio }));
    }
  };

  const handleDeleteRefinementVersion = async (versionId: string) => {
    if (!currentGeneration) return;

    const targetIndex = currentGeneration.versions.findIndex((version) => version.id === versionId);
    if (targetIndex < 0) return;

    // Any single version can be removed (originals and refinements alike) —
    // the only hard constraint is that the generation must keep at least one
    // version. Removing the very last one would leave a phantom tile with no
    // image, so use the gallery-tile delete instead. This matters because
    // failed/blank-output runs are stored as `type: 'generation'` versions
    // (Compare/N-variation siblings), and previously only refinement-typed
    // versions were deletable, leaving users stuck with empty Mark I / II
    // tiles in the version dropdown and Compare rail.
    const remainingVersions = currentGeneration.versions.filter((version) => version.id !== versionId);
    if (remainingVersions.length === 0) {
      throw new Error('Cannot delete the last version.');
    }

    const renumberedVersions = remainingVersions.map((version, idx) => ({
      ...version,
      number: idx + 1,
      label: toMarkLabel(idx + 1)
    }));

    const currentIndex = currentGeneration.currentVersionIndex;
    const shiftedIndex =
      currentIndex > targetIndex
        ? currentIndex - 1
        : currentIndex === targetIndex
          ? targetIndex - 1
          : currentIndex;
    const nextCurrentVersionIndex = Math.min(
      Math.max(0, shiftedIndex),
      renumberedVersions.length - 1
    );

    const activeVersionAfterDelete = renumberedVersions[nextCurrentVersionIndex];
    const nextAspectRatio = normalizeAspectRatio(
      activeVersionAfterDelete?.aspectRatio || currentGeneration.config.aspectRatio || config.aspectRatio
    );

    const updatedGeneration: Generation = {
      ...currentGeneration,
      config: nextAspectRatio
        ? { ...currentGeneration.config, aspectRatio: nextAspectRatio }
        : currentGeneration.config,
      versions: renumberedVersions,
      currentVersionIndex: nextCurrentVersionIndex
    };

    setCurrentGeneration(updatedGeneration);
    if (nextAspectRatio && nextAspectRatio !== config.aspectRatio) {
      setConfig((prev) => ({ ...prev, aspectRatio: nextAspectRatio }));
    }
    setHistory((prev) =>
      prev.map((item) => (item.id === updatedGeneration.id ? updatedGeneration : item))
    );

    try {
      await historyService.updateGeneration(user, updatedGeneration);
      const updatedHistory = await historyService.getHistory(user);
      setHistory(updatedHistory);
    } catch (err: any) {
      setError(err.message || 'Failed to delete refinement.');
      throw err;
    }
  };

  const handleUploadGuidelines = async (file: File) => {
    setIsAnalyzing(true);
    setError(null);
    try {
      if (!user) {
        openAuthModal('signup');
        throw new Error('Create a free account and add your API key in Settings before analyzing brand guidelines.');
      }

      const customKey = getActiveApiKey();
      if (!customKey) {
        setSettingsMode(true);
        throw new Error('Add your API key in Settings before analyzing brand guidelines. Free accounts use BYOK keys.');
      }

      const result = await analyzeBrandGuidelines(file, customKey, user?.preferences.systemPrompt);
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

  const handleSaveSettings = async (
    newSettings: UserSettings,
    profileData?: { name: string; username: string; photoURL?: string },
    geminiApiKey?: string,
    systemPrompt?: string,
    preferredModel?: string,
    apiKeys?: { [modelId: string]: string }
  ) => {
    if (!user) return;
    const nextSelectedModel = preferredModel || user.preferences.selectedModel || 'gemini-3.1-flash-image-preview';

    // Use the apiKeys from SettingsPage as-is (it reflects the user's latest
    // edits, including deletions). Falling back to `user.preferences.apiKeys`
    // here would re-introduce the bug where cleared keys came back after Save.
    const nextApiKeys = apiKeys !== undefined ? apiKeys : (user.preferences.apiKeys || {});

    // Update local state for immediate feedback
    const updatedUser = {
        ...user,
        name: profileData?.name || user.name,
        username: profileData?.username || user.username,
        photoURL: profileData?.photoURL || user.photoURL,
        preferences: {
            ...user.preferences,
            settings: newSettings,
            // Keep legacy geminiApiKey for backward compatibility if provided.
            // Using `!== undefined` preserves the empty string so the key can be cleared.
            geminiApiKey: geminiApiKey !== undefined ? geminiApiKey : user.preferences.geminiApiKey,
            systemPrompt: systemPrompt !== undefined ? systemPrompt : user.preferences.systemPrompt,
            selectedModel: nextSelectedModel,
            apiKeys: nextApiKeys
        }
    };
    setUser(updatedUser);

    // Apply defaults immediately if changed
    if (newSettings.defaultColorSchemeId && newSettings.defaultColorSchemeId !== config.colorSchemeId) {
        setConfig(prev => ({ ...prev, colorSchemeId: newSettings.defaultColorSchemeId! }));
    }
    if (newSettings.defaultVisualStyleId && newSettings.defaultVisualStyleId !== config.visualStyleId) {
        setConfig(prev => ({ ...prev, visualStyleId: newSettings.defaultVisualStyleId! }));
    }
    if (newSettings.defaultGraphicTypeId && newSettings.defaultGraphicTypeId !== config.graphicTypeId) {
        setConfig(prev => ({ ...prev, graphicTypeId: newSettings.defaultGraphicTypeId! }));
    }
    if (newSettings.defaultAspectRatio && newSettings.defaultAspectRatio !== config.aspectRatio) {
        const safeDefaultAspect = getSafeAspectRatioForModel(nextSelectedModel, newSettings.defaultAspectRatio, aspectRatios);
        setConfig(prev => ({ ...prev, aspectRatio: safeDefaultAspect }));
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

  const handleImportFromCatalog = (item: any) => {
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

  const handleResetToPreferenceDefaults = () => {
    const defaultModel = user?.preferences.selectedModel || guestSelectedModel;
    const settings = user?.preferences.settings;
    const modelRatios = getAspectRatiosForModel(defaultModel, aspectRatios);

    if (user && defaultModel !== selectedModel) {
      setUser(prev =>
        prev
          ? {
              ...prev,
              preferences: {
                ...prev.preferences,
                selectedModel: defaultModel
              }
            }
          : prev
      );
    }

    setConfig(prev => ({
      ...prev,
      colorSchemeId: pickResourceId(brandColors, settings?.defaultColorSchemeId),
      visualStyleId: pickResourceId(visualStyles, settings?.defaultVisualStyleId),
      graphicTypeId: pickResourceId(graphicTypes, settings?.defaultGraphicTypeId),
      aspectRatio: settings?.defaultAspectRatio
        ? getSafeAspectRatioForModel(defaultModel, settings.defaultAspectRatio, aspectRatios)
        : getSafeAspectRatioForModel(defaultModel, modelRatios[0]?.value || '', aspectRatios)
    }));
  };

  const handleModelChange = (modelId: string) => {
    if (!user) {
      setGuestSelectedModel(modelId);
      return;
    }

    const updatedUser = {
      ...user,
      preferences: {
        ...user.preferences,
        selectedModel: modelId
      }
    };
    setUser(updatedUser);
    authService.updateUserPreferences(user.id, updatedUser.preferences).catch(console.error);
  };

  const handleOpenAIQualityChange = (quality: 'low' | 'medium' | 'high' | 'auto') => {
    if (!user) return;
    const nextSettings = {
      ...(user.preferences.settings || { contributeByDefault: false }),
      openaiImageQuality: quality
    };
    const updatedUser = {
      ...user,
      preferences: {
        ...user.preferences,
        settings: nextSettings
      }
    };
    setUser(updatedUser);
    authService.updateUserPreferences(user.id, updatedUser.preferences).catch(console.error);
  };

  const generationModelIdsToRun = selectedModelIds.length > 0 ? selectedModelIds : [selectedModel];
  const missingGenerationApiKeyIds = user
    ? generationModelIdsToRun.filter((modelId) => !getApiKeyForModel(modelId))
    : generationModelIdsToRun;
  const isGenerateSetupRequired = !user || missingGenerationApiKeyIds.length > 0;
  const firstMissingModelId = missingGenerationApiKeyIds[0] || selectedModel;
  const generateSetupActionLabel = !user ? 'Create account' : 'Add API key';
  const generateSetupActionDescription = !user
    ? 'Create a free account before generating'
    : missingGenerationApiKeyIds.length > 1
      ? `Add API keys for ${missingGenerationApiKeyIds.map((id) => MODEL_NAME_BY_ID[id] || id).join(', ')}`
      : `Add an API key for ${MODEL_NAME_BY_ID[firstMissingModelId] || firstMissingModelId}`;

  const handleGenerateSetupAction = () => {
    setError(null);
    setIsSetupModalOpen(false);
    if (!user) {
      openAuthModal('signup');
      return;
    }
    setSettingsMode(true);
    setCatalogMode(null);
    setAdminMode(false);
  };

  // Suspended-account hard block. A signed-in user with `isDisabled === true`
  // is stopped here before any studio, history, catalog, settings, or admin UI
  // can render. Only a sign-out action is exposed.
  if (user?.isDisabled === true) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-[#0d1117] px-6">
        <div className="w-full max-w-md bg-white dark:bg-[#161b22] border border-red-200 dark:border-red-900/50 rounded-xl p-8 text-center shadow-lg">
          <div className="w-14 h-14 mx-auto mb-4 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center">
            <AlertCircle size={28} className="text-red-600 dark:text-red-300" />
          </div>
          <h1 className="text-xl font-bold text-slate-900 dark:text-white">
            Account suspended
          </h1>
          <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
            {user.email || 'This account'} has been suspended by an administrator.
            If you think this is a mistake, contact support.
          </p>
          <button
            type="button"
            onClick={handleLogout}
            className="mt-6 inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-red-600 hover:bg-red-700 text-white text-sm font-semibold"
          >
            <LogOut size={16} /> Sign out
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col w-full min-h-screen font-sans transition-colors duration-200">
      
      {/* 1. Dedicated Header Row */}
      <header className="w-full flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-[#30363d] bg-white dark:bg-[#0d1117] sticky top-0 z-50">
        <div className="flex items-center gap-6">
          <button 
            onClick={() => {
              setCatalogMode(null);
              setSettingsMode(false);
              setAdminMode(false);
            }}
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
          {user && (
            <nav className="hidden md:flex items-center gap-2 ml-4">
              <button 
                onClick={() => {
                  setCatalogMode('style');
                  setSettingsMode(false);
                  setAdminMode(false);
                }}
                className="text-sm font-medium text-slate-600 dark:text-slate-300 hover:text-brand-teal dark:hover:text-brand-teal transition-colors flex items-center gap-1.5 px-3 py-2 rounded-lg hover:bg-gray-50 dark:hover:bg-[#21262d]"
              >
                <PenTool size={16} /> Styles
              </button>
              <button 
                onClick={() => {
                  setCatalogMode('color');
                  setSettingsMode(false);
                  setAdminMode(false);
                }}
                className="text-sm font-medium text-slate-600 dark:text-slate-300 hover:text-brand-teal dark:hover:text-brand-teal transition-colors flex items-center gap-1.5 px-3 py-2 rounded-lg hover:bg-gray-50 dark:hover:bg-[#21262d]"
              >
                <Palette size={16} /> Colors
              </button>
            </nav>
          )}
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
                      <CachedImage
                        src={user.photoURL}
                        cacheKey={buildProfileImageCacheKey(user.id)}
                        alt={user.name}
                        className="w-full h-full object-cover"
                      />
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
                     <div className="p-3 border-b border-gray-200 dark:border-[#30363d] space-y-2">
                       <button 
                         onClick={() => {
                           setSettingsMode(true);
                           setAdminMode(false);
                           setCatalogMode(null);
                           setIsUserMenuOpen(false);
                         }}
                         className="w-full text-left flex items-center gap-2 text-sm font-medium text-slate-700 dark:text-slate-200 hover:text-brand-teal dark:hover:text-brand-teal transition-colors"
                       >
                         <SettingsIcon size={16} /> Settings
                       </button>
                       {/* Admin link: visible to users with the admin claim. The
                           `planetoftheweb` username is retained as a bootstrap
                           fallback so the first admin can self-promote even
                           before the claim is minted. */}
                       {(user.isAdmin || user.username === 'planetoftheweb') && (
                         <button
                           onClick={() => {
                             setAdminMode(true);
                             setSettingsMode(false);
                             setCatalogMode(null);
                             setIsUserMenuOpen(false);
                           }}
                           className="w-full text-left flex items-center gap-2 text-sm font-medium text-slate-700 dark:text-slate-200 hover:text-brand-teal dark:hover:text-brand-teal transition-colors"
                         >
                           <ShieldCheck size={16} /> Admin
                         </button>
                       )}
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
           <a
             href={GITHUB_REPO_BASE}
             target="_blank"
             rel="noopener noreferrer"
             className="p-2 text-slate-500 hover:text-brand-teal dark:hover:text-brand-teal hover:bg-slate-100 dark:hover:bg-[#21262d] rounded-lg transition-colors"
             title="View source code on GitHub"
             aria-label="View source code on GitHub"
           >
             <Github size={20} />
           </a>
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
      {adminMode && user ? (
        <AdminPage
          onBack={() => setAdminMode(false)}
          currentUser={user}
        />
      ) : settingsMode ? (
        user && (
          <SettingsPage
            onBack={() => setSettingsMode(false)}
            user={user}
            onSave={handleSaveSettings}
            graphicTypes={graphicTypes}
            visualStyles={visualStyles}
            brandColors={brandColors}
            aspectRatios={aspectRatios}
          />
        )
      ) : catalogMode ? (
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
            isGenerating={hasRunningGenerationJobs}
            options={context}
            setOptions={{ setBrandColors, setVisualStyles, setGraphicTypes, setAspectRatios }}
            onUploadGuidelines={handleUploadGuidelines}
            isAnalyzing={isAnalyzing}
            user={user}
            selectedModel={selectedModel}
            onResetToDefaults={handleResetToPreferenceDefaults}
            onModelChange={handleModelChange}
            openaiQuality={user?.preferences.settings?.openaiImageQuality || 'auto'}
            onOpenAIQualityChange={user ? handleOpenAIQualityChange : undefined}
            selectedModelIds={selectedModelIds}
            onModelIdsChange={setSelectedModelIds}
            setupRequired={isGenerateSetupRequired}
            setupActionLabel={generateSetupActionLabel}
            setupActionDescription={generateSetupActionDescription}
            onSetupAction={handleGenerateSetupAction}
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

            {/* Background generation monitor */}
            {activeGenerationJobs.length > 0 && (() => {
              void batchClockTick;
              const runningCount = activeGenerationJobs.filter((job) =>
                job.status === 'running' || job.status === 'stopping'
              ).length;
              return (
                <div
                  className="absolute top-6 right-4 z-40 w-[min(440px,calc(100%-2rem))]"
                  role="status"
                  aria-live="polite"
                >
                  <div className="bg-white/95 dark:bg-[#161b22]/95 border border-gray-200 dark:border-[#30363d] rounded-xl shadow-lg backdrop-blur-sm p-3">
                    <div className="flex items-center justify-between gap-3 mb-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <Sparkles size={15} className="text-brand-teal shrink-0" />
                        <span className="text-sm font-semibold text-slate-900 dark:text-white truncate">
                          Active Generations
                        </span>
                      </div>
                      <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">
                        {runningCount} running
                      </span>
                    </div>
                    <div className="space-y-2 max-h-[50vh] overflow-y-auto pr-1">
                      {activeGenerationJobs.map((job) => {
                        const doneCount = job.completed + job.failed;
                        const progressPct = Math.round((doneCount / Math.max(1, job.total)) * 100);
                        const running = job.status === 'running' || job.status === 'stopping';
                        const elapsedMs = (job.finishedAt || Date.now()) - job.startedAt;
                        const elapsedLabel = formatDuration(elapsedMs / 1000);
                        const remainingJobs = Math.max(0, job.total - doneCount);
                        let remainingSeconds = 0;
                        if (remainingJobs > 0 && elapsedMs > 0 && doneCount > 0) {
                          const observedJobsPerSecond = doneCount / Math.max(1, elapsedMs / 1000);
                          remainingSeconds = Math.round(remainingJobs / Math.max(0.01, observedJobsPerSecond));
                        } else if (remainingJobs > 0) {
                          const expectedJobsPerSecond = job.modelIds.reduce((sum, modelId) => {
                            const secsPerGen = Math.max(1, getModelSecondsPerGen(modelId));
                            return sum + (DEFAULT_BATCH_CONCURRENCY / secsPerGen);
                          }, 0);
                          remainingSeconds = Math.round(remainingJobs / Math.max(0.01, expectedJobsPerSecond));
                        }
                        const remainingLabel = formatDuration(remainingSeconds);
                        const modelChips = job.modelIds
                          .map((modelId) => ({ modelId, stats: job.modelProgress[modelId] }))
                          .filter(({ stats }) => !!stats);
                        const statusLabel =
                          job.status === 'stopping' ? 'Stopping' :
                          job.status === 'completed' ? 'Done' :
                          job.status === 'failed' ? 'Needs attention' :
                          job.status === 'stopped' ? 'Stopped' :
                          'Generating';
                        const progressColor =
                          job.status === 'failed'
                            ? 'bg-red-500'
                            : job.status === 'stopped'
                              ? 'bg-slate-400'
                              : 'bg-brand-teal';

                        return (
                          <div
                            key={job.id}
                            className="rounded-lg border border-gray-200 dark:border-[#30363d] bg-white dark:bg-[#0d1117] p-2.5"
                          >
                            <div className="flex items-start justify-between gap-2">
                              <div className="min-w-0">
                                <div className="flex items-center gap-2">
                                  {running ? (
                                    <span className="h-3.5 w-3.5 rounded-full border-2 border-brand-teal/30 border-t-brand-teal animate-spin shrink-0" />
                                  ) : (
                                    <span className={`h-2.5 w-2.5 rounded-full shrink-0 ${job.status === 'failed' ? 'bg-red-500' : 'bg-brand-teal'}`} />
                                  )}
                                  <span className="text-xs font-semibold text-slate-900 dark:text-white">
                                    {statusLabel}
                                  </span>
                                  <span className="text-xs text-slate-500 dark:text-slate-400">
                                    {doneCount}/{job.total}
                                  </span>
                                  {job.inFlight > 0 && (
                                    <span className="text-xs text-slate-500 dark:text-slate-400">
                                      {job.inFlight} running
                                    </span>
                                  )}
                                </div>
                                <p className="mt-1 text-xs text-slate-600 dark:text-slate-300 line-clamp-2 break-words">
                                  {job.prompt}
                                </p>
                              </div>
                              <div className="flex items-center gap-1 shrink-0">
                                {job.latest && (
                                  <button
                                    type="button"
                                    onClick={() => void handleRestoreFromHistory(job.latest!)}
                                    className="inline-flex items-center justify-center h-7 w-7 rounded-md border border-gray-200 dark:border-[#30363d] text-slate-500 dark:text-slate-300 hover:text-brand-teal hover:border-brand-teal transition-colors"
                                    title="View latest result"
                                    aria-label="View latest result"
                                  >
                                    <ArrowRight size={14} />
                                  </button>
                                )}
                                {running ? (
                                  <button
                                    type="button"
                                    onClick={() => handleStopGenerationJob(job.id)}
                                    disabled={job.status === 'stopping'}
                                    className="inline-flex items-center gap-1 px-2 py-1 rounded-md border border-gray-200 dark:border-[#30363d] text-[11px] font-semibold text-slate-600 dark:text-slate-300 hover:text-red-600 dark:hover:text-red-400 hover:border-red-300 dark:hover:border-red-800 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
                                    title={job.status === 'stopping'
                                      ? 'Waiting for in-flight generations to finish'
                                      : 'Stop queuing new generations for this run'}
                                  >
                                    <span className="block w-2 h-2 rounded-sm bg-red-500" aria-hidden="true" />
                                    {job.status === 'stopping' ? 'Stopping' : 'Stop'}
                                  </button>
                                ) : (
                                  <button
                                    type="button"
                                    onClick={() => clearGenerationJob(job.id)}
                                    className="inline-flex items-center justify-center h-7 w-7 rounded-md border border-gray-200 dark:border-[#30363d] text-slate-500 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white transition-colors"
                                    title="Dismiss"
                                    aria-label="Dismiss generation status"
                                  >
                                    <X size={14} />
                                  </button>
                                )}
                              </div>
                            </div>
                            <div className="mt-2 h-1.5 bg-gray-200 dark:bg-[#30363d] rounded-full overflow-hidden">
                              <div
                                className={`h-full ${progressColor} transition-all duration-300 ${running ? 'animate-pulse' : ''}`}
                                style={{ width: `${progressPct}%` }}
                              />
                            </div>
                            <div className="mt-1.5 flex items-center justify-between gap-2 text-[11px] text-slate-500 dark:text-slate-400">
                              <span>{elapsedLabel} elapsed</span>
                              {running && remainingSeconds > 0 ? (
                                <span>~{remainingLabel} remaining</span>
                              ) : job.message ? (
                                <span className="truncate">{job.message}</span>
                              ) : (
                                <span>{statusLabel}</span>
                              )}
                            </div>
                            {job.currentJobs.length > 0 && (
                              <div className="mt-1.5 space-y-1">
                                {job.currentJobs.slice(0, 3).map((currentJob) => (
                                  <div
                                    key={currentJob.key}
                                    className="flex items-center justify-between gap-2 text-[11px] text-slate-500 dark:text-slate-400"
                                  >
                                    <span className="font-medium truncate">
                                      {MODEL_NAME_BY_ID[currentJob.modelId] || currentJob.modelId}
                                    </span>
                                    <span className="truncate text-right">{currentJob.prompt}</span>
                                  </div>
                                ))}
                              </div>
                            )}
                            {modelChips.length > 1 && (
                              <div className="mt-2 flex flex-wrap items-center gap-1.5">
                                {modelChips.map(({ modelId, stats }) => (
                                  <span
                                    key={modelId}
                                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full border border-gray-200 dark:border-[#30363d] text-[10px] font-medium text-slate-600 dark:text-slate-300"
                                    title={`${MODEL_NAME_BY_ID[modelId] || modelId}: ${stats!.completed + stats!.failed}/${stats!.total} complete, ${stats!.inFlight} running`}
                                  >
                                    <span className={`inline-block w-1.5 h-1.5 rounded-full ${stats!.inFlight > 0 ? 'bg-brand-teal animate-pulse' : 'bg-slate-400'}`} />
                                    {MODEL_NAME_BY_ID[modelId] || modelId}
                                    <span className="text-slate-400 dark:text-slate-500">
                                      {stats!.completed + stats!.failed}/{stats!.total}
                                    </span>
                                  </span>
                                ))}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              );
            })()}

            {/* Display — only render the viewer when we have something to show
                or there's no history at all (true first-run). When the viewer
                is empty but the user already has prior generations, skip the
                "Ready to Create" placeholder so the Recent Generations gallery
                lands at the top of the page on load. */}
            {(currentGeneration || history.length === 0) && (
              <ImageDisplay
                generation={currentGeneration}
                onRefine={handleRefine}
                onAnalyzeRefinePrompt={handleAnalyzeRefinePrompt}
                onResizeCanvasRefine={handleResizeCanvasRefine}
                isRefining={isGenerating}
                onCopy={handleCopyCurrent}
                onDelete={requestDeleteCurrent}
                onVersionChange={handleVersionChange}
                onDeleteRefinementVersion={handleDeleteRefinementVersion}
                selectedModel={selectedModel}
                onModelChange={handleModelChange}
                resizeAspectRatios={getAspectRatiosForModel('gemini', aspectRatios)}
                options={context}
                history={history}
                comparisonState={comparisonState}
                onEnterComparePicker={enterComparePickerMode}
                onExitComparePicker={exitComparePickerMode}
                onPickMark={pickMarkForComparison}
                onNavigateToGeneration={handleRestoreFromHistory}
              />
            )}

            {/* History Gallery */}
            <RecentGenerations
              history={history}
              onSelect={handleRestoreFromHistory}
              onDelete={requestDeleteHistory}
              options={context}
              isComparePicking={comparisonState.mode === 'picking'}
              onPickMark={pickMarkForComparison}
              pickedMarkIds={{
                a: comparisonState.a ? `${comparisonState.a.generationId}|${comparisonState.a.versionId}` : undefined,
                b: comparisonState.b ? `${comparisonState.b.generationId}|${comparisonState.b.versionId}` : undefined,
              }}
            />
          </main>
        </>
      )}

      <footer
        className="mt-auto w-full border-t border-gray-200 dark:border-[#30363d] bg-white dark:bg-[#0d1117] px-4 py-4 sm:px-6"
        role="contentinfo"
        aria-label="Site copyright and project links"
      >
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-center gap-2 text-center text-xs text-slate-500 dark:text-slate-400 sm:flex-row sm:flex-wrap sm:gap-x-4 sm:gap-y-1">
          <p>© {new Date().getFullYear()} BranDoIt. All rights reserved.</p>
          <nav
            className="flex flex-wrap items-center justify-center gap-x-3 gap-y-2"
            aria-label="Project documentation"
          >
            <a
              href={GITHUB_CHANGELOG_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center font-medium text-brand-teal hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-teal focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:focus-visible:ring-offset-[#0d1117]"
            >
              Changelog
            </a>
            <span className="hidden text-slate-300 dark:text-slate-600 sm:inline" aria-hidden="true">
              |
            </span>
            <a
              href={GITHUB_RELEASES_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center font-medium text-brand-teal hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-teal focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:focus-visible:ring-offset-[#0d1117]"
            >
              Releases
            </a>
          </nav>
        </div>
      </footer>

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

      {/* Catalog Modal Removed */}

      {/* Delete Confirmation Modal */}
      {confirmDeleteModal && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="bg-white dark:bg-[#161b22] border border-gray-200 dark:border-[#30363d] rounded-2xl shadow-2xl max-w-md w-full p-6 space-y-4">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-xl bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-200 flex items-center justify-center">
                <AlertCircle size={20} />
              </div>
              <div className="flex-1">
                <h3 className="text-lg font-semibold text-slate-900 dark:text-white">
                  {confirmDeleteModal.type === 'history' ? 'Delete generation?' : 'Delete current preview?'}
                </h3>
                <p className="text-sm text-slate-600 dark:text-slate-300 mt-1">
                  This action will remove the generation{confirmDeleteModal.type === 'current' ? ' and clear the main preview' : ''}.
                </p>
              </div>
            </div>

            {/* "Don't ask me again" is intentionally only available for the
                main-image trash. Tile-trash in the gallery always confirms,
                because a misclicked thumbnail is too easy to lose silently. */}
            {confirmDeleteModal.type === 'current' && (
              <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-200">
                <input
                  type="checkbox"
                  checked={skipFutureConfirm}
                  onChange={(e) => setSkipFutureConfirm(e.target.checked)}
                  className="h-4 w-4 text-brand-red rounded border-gray-300 focus:ring-brand-red cursor-pointer"
                />
                Don’t ask me again for this action
              </label>
            )}

            <div className="flex justify-end gap-3 pt-2">
              <button
                onClick={handleCancelDeleteModal}
                className="px-4 py-2 rounded-lg border border-gray-200 dark:border-[#30363d] text-slate-700 dark:text-slate-200 hover:bg-gray-100 dark:hover:bg-[#21262d] transition"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmDeleteModal}
                className="px-4 py-2 rounded-lg bg-red-600 hover:bg-red-700 text-white font-semibold shadow-sm transition"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {needsSetup && isSetupModalOpen && (
        <div
          className="fixed inset-0 z-[140] flex items-center justify-center p-4 sm:p-6"
          onClick={() => setIsSetupModalOpen(false)}
        >
          <div className="absolute inset-0 bg-slate-900/70 backdrop-blur-sm" />
          <div
            className="relative w-full max-w-2xl overflow-hidden rounded-3xl border border-white/15 bg-white dark:bg-[#0d1117] shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="absolute inset-0 pointer-events-none bg-[radial-gradient(circle_at_top_right,rgba(14,165,233,0.18),transparent_45%),radial-gradient(circle_at_bottom_left,rgba(239,68,68,0.15),transparent_40%)]" />
            <div className="relative p-6 sm:p-8">
              <button
                onClick={() => setIsSetupModalOpen(false)}
                className="absolute right-4 top-4 rounded-lg p-1.5 text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-[#1f2937] transition-colors"
                aria-label="Close setup instructions"
              >
                <X size={18} />
              </button>

              <div className="inline-flex items-center gap-2 rounded-full border border-sky-200 dark:border-sky-900/60 bg-sky-50 dark:bg-sky-900/20 px-3 py-1 text-[11px] font-semibold uppercase tracking-wider text-sky-700 dark:text-sky-200">
                <Sparkles size={12} />
                Quick Start
              </div>

              {!user ? (
                <>
                  <h2 className="mt-4 text-2xl sm:text-3xl font-bold tracking-tight text-slate-900 dark:text-white">
                    Start free with your own API key
                  </h2>
                  <p className="mt-3 text-sm sm:text-base text-slate-600 dark:text-slate-300">
                    BranDoIt uses BYOK on free accounts. Create your account, add a Gemini or OpenAI key, and you are ready to generate.
                  </p>
                </>
              ) : (
                <>
                  <h2 className="mt-4 text-2xl sm:text-3xl font-bold tracking-tight text-slate-900 dark:text-white">
                    One setup step left
                  </h2>
                  <p className="mt-3 text-sm sm:text-base text-slate-600 dark:text-slate-300">
                    Add your API key in Settings to start generating. Free accounts run on BYOK keys.
                  </p>
                </>
              )}

              <div className="mt-5 grid gap-3 sm:grid-cols-3">
                <div className="rounded-2xl border border-slate-200 dark:border-[#30363d] bg-slate-50/80 dark:bg-[#111827]/70 p-4">
                  <div className="flex items-center gap-2 text-slate-900 dark:text-white font-semibold text-sm">
                    <KeyRound size={14} className="text-sky-600 dark:text-sky-300" />
                    Free = BYOK
                  </div>
                  <p className="mt-1 text-xs text-slate-600 dark:text-slate-300">Bring your own key, control your own usage.</p>
                </div>
                <div className="rounded-2xl border border-slate-200 dark:border-[#30363d] bg-slate-50/80 dark:bg-[#111827]/70 p-4">
                  <div className="flex items-center gap-2 text-slate-900 dark:text-white font-semibold text-sm">
                    <UserIcon size={14} className="text-sky-600 dark:text-sky-300" />
                    Account Benefits
                  </div>
                  <p className="mt-1 text-xs text-slate-600 dark:text-slate-300">Save styles, color palettes, settings, and history.</p>
                </div>
                <div className="rounded-2xl border border-slate-200 dark:border-[#30363d] bg-slate-50/80 dark:bg-[#111827]/70 p-4">
                  <div className="flex items-center gap-2 text-slate-900 dark:text-white font-semibold text-sm">
                    <Sparkles size={14} className="text-sky-600 dark:text-sky-300" />
                    Paid Plans Soon
                  </div>
                  <p className="mt-1 text-xs text-slate-600 dark:text-slate-300">More model access and additional workspace features.</p>
                </div>
              </div>

              <div className="mt-6 flex flex-wrap items-center gap-2">
                {!user ? (
                  <>
                    <button
                      onClick={() => openAuthModal('login')}
                      className="inline-flex items-center gap-2 rounded-xl border border-slate-200 dark:border-[#30363d] bg-white dark:bg-[#161b22] px-4 py-2.5 text-sm font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-[#1f2937] transition-colors"
                    >
                      <LogIn size={15} />
                      Log In
                    </button>
                    <button
                      onClick={() => openAuthModal('signup')}
                      className="inline-flex items-center gap-2 rounded-xl bg-brand-red hover:bg-red-700 px-4 py-2.5 text-sm font-semibold text-white shadow-lg shadow-brand-red/20 transition-colors"
                    >
                      Create Free Account
                      <ArrowRight size={15} />
                    </button>
                  </>
                ) : (
                  <button
                    onClick={() => {
                      setSettingsMode(true);
                      setIsSetupModalOpen(false);
                    }}
                    className="inline-flex items-center gap-2 rounded-xl bg-brand-red hover:bg-red-700 px-4 py-2.5 text-sm font-semibold text-white shadow-lg shadow-brand-red/20 transition-colors"
                  >
                    <SettingsIcon size={15} />
                    Open Settings
                    <ArrowRight size={15} />
                  </button>
                )}
                <button
                  onClick={() => setIsSetupModalOpen(false)}
                  className="inline-flex items-center rounded-xl border border-transparent px-3 py-2 text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 transition-colors"
                >
                  Continue Exploring
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

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
                    <strong className="text-slate-900 dark:text-white">Account + API Key:</strong> Free accounts use BYOK. Add your Gemini/OpenAI API key in Settings, then generate. Your account saves your custom colors, styles, settings, and history for next time.
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

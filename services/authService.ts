import { 
  createUserWithEmailAndPassword, 
  signInWithEmailAndPassword, 
  signOut, 
  updateProfile, 
  User as FirebaseUser,
  onAuthStateChanged
} from "firebase/auth";
import { 
  collection,
  query,
  where,
  getDocs,
  doc, 
  setDoc, 
  getDoc, 
  updateDoc,
  serverTimestamp
} from "firebase/firestore";
import { auth, db } from "./firebase";
import { User, UserPreferences, BrandColor, VisualStyle, GraphicType, AspectRatioOption, ToolbarPreset, Folder } from "../types";
import { BRAND_COLORS, VISUAL_STYLES, GRAPHIC_TYPES, ASPECT_RATIOS } from "../constants";

const defaultPreferences: UserPreferences = {
  brandColors: BRAND_COLORS,
  visualStyles: VISUAL_STYLES,
  graphicTypes: GRAPHIC_TYPES,
  aspectRatios: ASPECT_RATIOS,
  apiKeys: {},
  // Default model for brand-new accounts: Nano Banana 2 (Gemini 3.1 Flash).
  // App.loadResources / guestSelectedModel use the same id as their
  // code-level fallback so the UI matches across guest + first-login.
  selectedModel: 'gemini-3.1-flash-image-preview',
  settings: {
    contributeByDefault: false,
    confirmDeleteHistory: true,
    confirmDeleteCurrent: true,
    defaultGraphicTypeId: 'infographic',
    defaultVisualStyleId: 'hand-drawn',
    defaultAspectRatio: '16:9',
    openaiImageQuality: 'auto',
  }
};

// Helper to remove non-serializable fields (like React components/icons) from preferences.
// Also defensively strips any `isAdmin` that slipped in from the in-memory User:
// the admin flag is a Firebase Auth custom claim, it must NEVER be persisted.
const sanitizePreferences = (prefs: UserPreferences): any => {
  // Belt-and-suspenders: `isAdmin` is not in the UserPreferences type, but a
  // caller might accidentally cast a User shape through here. Drop it loudly.
  if (prefs && (prefs as any).isAdmin !== undefined) {
    delete (prefs as any).isAdmin;
  }
  const clean: any = {};
  // Only save settings and API keys. Arrays are managed via resourceService.
  // Legacy support: omit when empty so clearing the field actually persists.
  if (prefs.geminiApiKey) clean.geminiApiKey = prefs.geminiApiKey;
  if (prefs.apiKeys) {
    // Strip empty-string entries so deleting a key in the UI actually clears it in Firestore.
    const trimmedKeys: { [modelId: string]: string } = {};
    for (const [modelId, value] of Object.entries(prefs.apiKeys)) {
      if (typeof value === 'string' && value.trim() !== '') {
        trimmedKeys[modelId] = value;
      }
    }
    clean.apiKeys = trimmedKeys;
  }
  if (prefs.selectedModel) clean.selectedModel = prefs.selectedModel;
  if (prefs.systemPrompt) clean.systemPrompt = prefs.systemPrompt;

  if (prefs.settings) {
    const s = prefs.settings;
    const settingsClean: any = {};
    if (s.contributeByDefault !== undefined) settingsClean.contributeByDefault = s.contributeByDefault;
    if (s.defaultGraphicTypeId) settingsClean.defaultGraphicTypeId = s.defaultGraphicTypeId;
    if (s.defaultVisualStyleId) settingsClean.defaultVisualStyleId = s.defaultVisualStyleId;
    if (s.defaultColorSchemeId) settingsClean.defaultColorSchemeId = s.defaultColorSchemeId;
    if (s.defaultAspectRatio) settingsClean.defaultAspectRatio = s.defaultAspectRatio;
    if (s.confirmDeleteHistory !== undefined) settingsClean.confirmDeleteHistory = s.confirmDeleteHistory;
    if (s.confirmDeleteCurrent !== undefined) settingsClean.confirmDeleteCurrent = s.confirmDeleteCurrent;
    if (s.openaiImageQuality) settingsClean.openaiImageQuality = s.openaiImageQuality;
    if (Object.keys(settingsClean).length > 0) clean.settings = settingsClean;
  }

  if (Array.isArray(prefs.presets) && prefs.presets.length > 0) {
    // Drop undefined fields per preset because Firestore rejects them.
    clean.presets = prefs.presets.map(preset => {
      const p: any = {
        id: preset.id,
        name: preset.name,
        createdAt: preset.createdAt
      };
      if (preset.graphicTypeId) p.graphicTypeId = preset.graphicTypeId;
      if (preset.visualStyleId) p.visualStyleId = preset.visualStyleId;
      if (preset.colorSchemeId) p.colorSchemeId = preset.colorSchemeId;
      if (preset.aspectRatio) p.aspectRatio = preset.aspectRatio;
      if (preset.svgMode) p.svgMode = preset.svgMode;
      if (preset.selectedModel) p.selectedModel = preset.selectedModel;
      if (preset.openaiImageQuality) p.openaiImageQuality = preset.openaiImageQuality;
      return p;
    });
  }

  if (Array.isArray(prefs.folders) && prefs.folders.length > 0) {
    clean.folders = prefs.folders
      .filter(folder => folder && typeof folder.id === 'string' && typeof folder.name === 'string')
      .map(folder => ({
        id: folder.id,
        name: folder.name,
        createdAt: typeof folder.createdAt === 'number' ? folder.createdAt : Date.now()
      }));
  }

  if (typeof prefs.activeFolderId === 'string' && prefs.activeFolderId.length > 0) {
    clean.activeFolderId = prefs.activeFolderId;
  }

  return clean;
};

// Helper to merge saved preferences with default icons (re-hydration)
const hydratePreferences = (savedPrefs: any): UserPreferences => {
  if (!savedPrefs) return defaultPreferences;

  return {
    // We don't load arrays from preferences anymore, but we need to return something 
    // to satisfy the type. The App will fetch real data from resourceService.
    brandColors: [], 
    visualStyles: [],
    graphicTypes: [],
    aspectRatios: [],
    geminiApiKey: savedPrefs.geminiApiKey, // Legacy support
    apiKeys: savedPrefs.apiKeys || {},
    selectedModel: savedPrefs.selectedModel || 'gemini-3.1-flash-image-preview',
    systemPrompt: savedPrefs.systemPrompt,
    settings: {
      contributeByDefault: savedPrefs.settings?.contributeByDefault ?? defaultPreferences.settings?.contributeByDefault ?? false,
      defaultGraphicTypeId: savedPrefs.settings?.defaultGraphicTypeId,
      defaultVisualStyleId: savedPrefs.settings?.defaultVisualStyleId,
      defaultColorSchemeId: savedPrefs.settings?.defaultColorSchemeId,
      defaultAspectRatio: savedPrefs.settings?.defaultAspectRatio,
      confirmDeleteHistory: savedPrefs.settings?.confirmDeleteHistory ?? true,
      confirmDeleteCurrent: savedPrefs.settings?.confirmDeleteCurrent ?? true,
      openaiImageQuality: savedPrefs.settings?.openaiImageQuality
    },
    presets: Array.isArray(savedPrefs.presets)
      ? (savedPrefs.presets as any[]).filter(p => p && typeof p.id === 'string' && typeof p.name === 'string') as ToolbarPreset[]
      : [],
    folders: Array.isArray(savedPrefs.folders)
      ? (savedPrefs.folders as any[])
          .filter(f => f && typeof f.id === 'string' && typeof f.name === 'string')
          .map(f => ({
            id: f.id,
            name: f.name,
            createdAt: typeof f.createdAt === 'number' ? f.createdAt : Date.now()
          })) as Folder[]
      : [],
    activeFolderId:
      typeof savedPrefs.activeFolderId === 'string' && savedPrefs.activeFolderId.length > 0
        ? savedPrefs.activeFolderId
        : undefined,
  };
};

// Helper to transform Firebase User + Firestore Data into our User type.
// `isAdmin` is derived from the Auth custom claim — NEVER from Firestore data.
// `isDisabled` is persisted in Firestore and used to hard-block the account.
const transformUser = (firebaseUser: FirebaseUser, userData: any, isAdmin: boolean = false): User => {
  return {
    id: firebaseUser.uid,
    name: userData?.name || firebaseUser.displayName || 'User',
    username: userData?.username, // Map username from Firestore
    email: firebaseUser.email || '',
    photoURL: userData?.photoURL || firebaseUser.photoURL || undefined, // Map photoURL
    preferences: userData?.preferences ? hydratePreferences(userData.preferences) : defaultPreferences,
    isAdmin,
    isDisabled: userData?.isDisabled === true,
  };
};

// Read the `admin` custom claim off the current session's token. Safe to call
// with a recently-signed-in user; falls back to `false` on any error.
const readAdminClaim = async (firebaseUser: FirebaseUser): Promise<boolean> => {
  try {
    const token = await firebaseUser.getIdTokenResult();
    return token.claims?.admin === true;
  } catch (err) {
    console.warn("Failed to read admin claim:", err);
    return false;
  }
};

// Best-effort write of `lastSignInAt`. Never blocks the sign-in flow — the
// admin table can tolerate a missing value.
const recordSignIn = async (uid: string): Promise<void> => {
  try {
    await updateDoc(doc(db, "users", uid), { lastSignInAt: serverTimestamp() });
  } catch (err) {
    // Non-fatal: the doc may not exist yet (first-ever sign-in for a legacy
    // account) or the user may be suspended — in either case callers still
    // get a valid session back.
    console.warn("Failed to record lastSignInAt:", err);
  }
};

const checkUsernameUnique = async (username: string, excludeUserId?: string): Promise<void> => {
  if (!username) return; // Empty username check is handled by UI validation for requirement
  
  const usersRef = collection(db, "users");
  const q = query(usersRef, where("username", "==", username));
  const querySnapshot = await getDocs(q);

  if (!querySnapshot.empty) {
    // If excluding a user (e.g. current user updating profile), check if the found doc is NOT them
    if (excludeUserId) {
      const isTakenByOther = querySnapshot.docs.some(doc => doc.id !== excludeUserId);
      if (isTakenByOther) throw new Error("Username is already taken.");
    } else {
      throw new Error("Username is already taken.");
    }
  }
};

export const authService = {
  register: async (name: string, email: string, password: string, username?: string): Promise<User> => {
    try {
      if (!username) throw new Error("Username is required.");
      
      await checkUsernameUnique(username);

      const userCredential = await createUserWithEmailAndPassword(auth, email, password);
      const user = userCredential.user;

      await updateProfile(user, { displayName: name });

      // Create the user document in Firestore - SANITIZED
      const newUserProfile = {
        name,
        username,
        email,
        preferences: sanitizePreferences(defaultPreferences),
        createdAt: new Date().toISOString()
      };

      await setDoc(doc(db, "users", user.uid), newUserProfile);

      return transformUser(user, newUserProfile);
    } catch (error: any) {
      console.error("Registration Error:", error);
      if (error.code === 'auth/email-already-in-use') {
        throw new Error('This email is already registered.');
      } else if (error.code === 'auth/weak-password') {
        throw new Error('Password should be at least 6 characters.');
      }
      throw new Error(error.message || "Failed to register.");
    }
  },

  login: async (emailOrUsername: string, password: string): Promise<User> => {
    try {
      let email = emailOrUsername;
      
      // If input doesn't look like an email, try to find the email by username
      if (!emailOrUsername.includes('@')) {
        const usersRef = collection(db, "users");
        const q = query(usersRef, where("username", "==", emailOrUsername));
        const querySnapshot = await getDocs(q);
        
        if (querySnapshot.empty) {
          throw new Error('Username not found.');
        }
        
        email = querySnapshot.docs[0].data().email;
      }

      const userCredential = await signInWithEmailAndPassword(auth, email, password);
      const user = userCredential.user;

      const docRef = doc(db, "users", user.uid);
      const docSnap = await getDoc(docRef);

      let userData: any = {};
      if (docSnap.exists()) {
        userData = docSnap.data();
      } else {
        userData = {
          name: user.displayName || 'User',
          username: '', // Default empty if not exists
          email: user.email,
          preferences: sanitizePreferences(defaultPreferences)
        };
        await setDoc(docRef, userData);
      }

      await recordSignIn(user.uid);
      const isAdmin = await readAdminClaim(user);
      return transformUser(user, userData, isAdmin);
    } catch (error: any) {
      console.error("Login Error:", error);
      if (error.code === 'auth/invalid-credential' || error.code === 'auth/user-not-found' || error.code === 'auth/wrong-password') {
        throw new Error('Invalid email or password.');
      }
      throw new Error(error.message || "Failed to login.");
    }
  },

  logout: async () => {
    try {
      await signOut(auth);
      localStorage.removeItem('banana_brand_session');
    } catch (error) {
      console.error("Logout Error:", error);
    }
  },

  getCurrentUser: (): Promise<User | null> => {
    return new Promise((resolve) => {
      const unsubscribe = onAuthStateChanged(auth, async (user) => {
        if (user) {
          try {
            const docRef = doc(db, "users", user.uid);
            const docSnap = await getDoc(docRef);
            const userData = docSnap.exists() ? docSnap.data() : { preferences: sanitizePreferences(defaultPreferences) };
            const isAdmin = await readAdminClaim(user);
            resolve(transformUser(user, userData, isAdmin));
          } catch (e) {
            console.error("Error fetching user profile:", e);
            resolve(null);
          }
        } else {
          resolve(null);
        }
        unsubscribe(); 
      });
    });
  },

  updateUserPreferences: async (userId: string, preferences: UserPreferences) => {
    try {
      const userRef = doc(db, "users", userId);
      
      // Only update specific fields (settings, api key)
      // We do NOT want to overwrite the whole preferences object if it contains other stuff
      // But based on our new sanitize, it only returns what we want.
      const cleanPreferences = sanitizePreferences(preferences);
      
      await updateDoc(userRef, {
        preferences: cleanPreferences
      });
    } catch (error) {
      console.error("Error updating preferences:", error);
      throw new Error("Failed to save preferences.");
    }
  },

  updateUserProfile: async (userId: string, data: { name?: string; username?: string; photoURL?: string }) => {
    try {
      if (data.username) {
        await checkUsernameUnique(data.username, userId);
      }

      // Firestore rejects `undefined` values, so only write fields the caller
      // actually provided. SettingsPage always passes the full triple, but
      // `photoURL` is commonly undefined for accounts without an avatar.
      const clean: Record<string, string> = {};
      if (typeof data.name === 'string' && data.name.length > 0) clean.name = data.name;
      if (typeof data.username === 'string' && data.username.length > 0) clean.username = data.username;
      if (typeof data.photoURL === 'string' && data.photoURL.length > 0) clean.photoURL = data.photoURL;

      const userRef = doc(db, "users", userId);
      if (Object.keys(clean).length > 0) {
        await updateDoc(userRef, clean);
      }

      // If name or photo changed, update Auth profile too. Passing undefined to
      // updateProfile is safe (the SDK treats it as "no change") but we still
      // fall back to the current value so we don't accidentally null anything.
      if (auth.currentUser && auth.currentUser.uid === userId) {
        await updateProfile(auth.currentUser, {
            displayName: clean.name ?? auth.currentUser.displayName ?? undefined,
            photoURL: clean.photoURL ?? auth.currentUser.photoURL ?? undefined
        });
      }
    } catch (error: any) {
      console.error("Error updating user profile:", error);
      throw new Error(error.message || "Failed to update profile.");
    }
  },
  
  onAuthStateChange: (callback: (user: User | null) => void) => {
    return onAuthStateChanged(auth, async (user) => {
      if (user) {
        const docRef = doc(db, "users", user.uid);
        const docSnap = await getDoc(docRef);
        const userData = docSnap.exists() ? docSnap.data() : { preferences: sanitizePreferences(defaultPreferences) };
        const isAdmin = await readAdminClaim(user);
        // Fire-and-forget — don't block the callback on the timestamp write.
        void recordSignIn(user.uid);
        callback(transformUser(user, userData, isAdmin));
      } else {
        callback(null);
      }
    });
  }
};

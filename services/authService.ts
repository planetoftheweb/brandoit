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
  updateDoc 
} from "firebase/firestore";
import { auth, db } from "./firebase";
import { User, UserPreferences, BrandColor, VisualStyle, GraphicType, AspectRatioOption } from "../types";
import { BRAND_COLORS, VISUAL_STYLES, GRAPHIC_TYPES, ASPECT_RATIOS } from "../constants";

const defaultPreferences: UserPreferences = {
  brandColors: BRAND_COLORS,
  visualStyles: VISUAL_STYLES,
  graphicTypes: GRAPHIC_TYPES,
  aspectRatios: ASPECT_RATIOS,
  apiKeys: {},
  selectedModel: 'gemini',
  settings: { contributeByDefault: false, confirmDeleteHistory: true, confirmDeleteCurrent: true }
};

// Helper to remove non-serializable fields (like React components/icons) from preferences
const sanitizePreferences = (prefs: UserPreferences): any => {
  const clean: any = {};
  // Only save settings and API keys. Arrays are managed via resourceService.
  if (prefs.geminiApiKey) clean.geminiApiKey = prefs.geminiApiKey; // Legacy support
  if (prefs.apiKeys) clean.apiKeys = prefs.apiKeys;
  if (prefs.selectedModel) clean.selectedModel = prefs.selectedModel;

  if (prefs.settings) {
    const s = prefs.settings;
    const settingsClean: any = {};
    if (s.contributeByDefault !== undefined) settingsClean.contributeByDefault = s.contributeByDefault;
    if (s.defaultGraphicTypeId) settingsClean.defaultGraphicTypeId = s.defaultGraphicTypeId;
    if (s.defaultAspectRatio) settingsClean.defaultAspectRatio = s.defaultAspectRatio;
    if (s.confirmDeleteHistory !== undefined) settingsClean.confirmDeleteHistory = s.confirmDeleteHistory;
    if (s.confirmDeleteCurrent !== undefined) settingsClean.confirmDeleteCurrent = s.confirmDeleteCurrent;
    if (Object.keys(settingsClean).length > 0) clean.settings = settingsClean;
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
    selectedModel: savedPrefs.selectedModel || 'gemini',
    settings: {
      contributeByDefault: savedPrefs.settings?.contributeByDefault ?? defaultPreferences.settings?.contributeByDefault ?? false,
      defaultGraphicTypeId: savedPrefs.settings?.defaultGraphicTypeId,
      defaultAspectRatio: savedPrefs.settings?.defaultAspectRatio,
      confirmDeleteHistory: savedPrefs.settings?.confirmDeleteHistory ?? true,
      confirmDeleteCurrent: savedPrefs.settings?.confirmDeleteCurrent ?? true
    },
  };
};

// Helper to transform Firebase User + Firestore Data into our User type
const transformUser = (firebaseUser: FirebaseUser, userData: any): User => {
  return {
    id: firebaseUser.uid,
    name: userData?.name || firebaseUser.displayName || 'User',
    username: userData?.username, // Map username from Firestore
    email: firebaseUser.email || '',
    photoURL: userData?.photoURL || firebaseUser.photoURL || undefined, // Map photoURL
    preferences: userData?.preferences ? hydratePreferences(userData.preferences) : defaultPreferences
  };
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

      let userData = {};
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

      return transformUser(user, userData);
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
            resolve(transformUser(user, userData));
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

      const userRef = doc(db, "users", userId);
      await updateDoc(userRef, data);
      
      // If name or photo changed, update Auth profile too
      if (auth.currentUser && auth.currentUser.uid === userId) {
        await updateProfile(auth.currentUser, { 
            displayName: data.name || auth.currentUser.displayName,
            photoURL: data.photoURL || auth.currentUser.photoURL
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
        callback(transformUser(user, userData));
      } else {
        callback(null);
      }
    });
  }
};
import { 
  createUserWithEmailAndPassword, 
  signInWithEmailAndPassword, 
  signOut, 
  updateProfile, 
  User as FirebaseUser,
  onAuthStateChanged
} from "firebase/auth";
import { 
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
  aspectRatios: ASPECT_RATIOS
};

// Helper to remove non-serializable fields (like React components/icons) from preferences
const sanitizePreferences = (prefs: UserPreferences): any => {
  return {
    brandColors: prefs.brandColors.map(({ icon, ...rest }: any) => rest),
    visualStyles: prefs.visualStyles.map(({ icon, ...rest }: any) => rest),
    graphicTypes: prefs.graphicTypes.map(({ icon, ...rest }: any) => rest),
    aspectRatios: prefs.aspectRatios.map(({ icon, ...rest }: any) => rest),
  };
};

// Helper to merge saved preferences with default icons (re-hydration)
const hydratePreferences = (savedPrefs: any): UserPreferences => {
  if (!savedPrefs) return defaultPreferences;

  // Helper to re-attach icons from constants if ID matches, or keep as is
  const mergeWithIcons = (savedItems: any[], defaultItems: any[]) => {
    return savedItems.map(item => {
      // Find matching default item to get its icon back
      const match = defaultItems.find(d => d.id === item.id || d.value === item.value);
      return match ? { ...item, icon: match.icon } : item;
    });
  };

  return {
    brandColors: savedPrefs.brandColors || defaultPreferences.brandColors,
    visualStyles: mergeWithIcons(savedPrefs.visualStyles || [], VISUAL_STYLES),
    graphicTypes: mergeWithIcons(savedPrefs.graphicTypes || [], GRAPHIC_TYPES),
    aspectRatios: mergeWithIcons(savedPrefs.aspectRatios || [], ASPECT_RATIOS),
  };
};

// Helper to transform Firebase User + Firestore Data into our User type
const transformUser = (firebaseUser: FirebaseUser, userData: any): User => {
  return {
    id: firebaseUser.uid,
    name: userData?.name || firebaseUser.displayName || 'User',
    email: firebaseUser.email || '',
    preferences: userData?.preferences ? hydratePreferences(userData.preferences) : defaultPreferences
  };
};

export const authService = {
  register: async (name: string, email: string, password: string): Promise<User> => {
    try {
      const userCredential = await createUserWithEmailAndPassword(auth, email, password);
      const user = userCredential.user;

      await updateProfile(user, { displayName: name });

      // Create the user document in Firestore - SANITIZED
      const newUserProfile = {
        name,
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

  login: async (email: string, password: string): Promise<User> => {
    try {
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
      // Sanitize before saving to remove functions/React components
      const cleanPreferences = sanitizePreferences(preferences);
      
      await updateDoc(userRef, {
        preferences: cleanPreferences
      });
    } catch (error) {
      console.error("Error updating preferences:", error);
      throw new Error("Failed to save preferences.");
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
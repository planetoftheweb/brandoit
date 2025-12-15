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
import { User, UserPreferences } from "../types";
import { BRAND_COLORS, VISUAL_STYLES, GRAPHIC_TYPES, ASPECT_RATIOS } from "../constants";

const defaultPreferences: UserPreferences = {
  brandColors: BRAND_COLORS,
  visualStyles: VISUAL_STYLES,
  graphicTypes: GRAPHIC_TYPES,
  aspectRatios: ASPECT_RATIOS
};

// Helper to transform Firebase User + Firestore Data into our User type
const transformUser = (firebaseUser: FirebaseUser, userData: any): User => {
  return {
    id: firebaseUser.uid,
    name: userData?.name || firebaseUser.displayName || 'User',
    email: firebaseUser.email || '',
    preferences: userData?.preferences || defaultPreferences
  };
};

export const authService = {
  // We no longer need getUsers or saveUsers as Firebase handles this

  register: async (name: string, email: string, password: string): Promise<User> => {
    try {
      const userCredential = await createUserWithEmailAndPassword(auth, email, password);
      const user = userCredential.user;

      // Update the display name in Firebase Auth
      await updateProfile(user, { displayName: name });

      // Create the user document in Firestore
      const newUserProfile = {
        name,
        email,
        preferences: defaultPreferences,
        createdAt: new Date().toISOString()
      };

      await setDoc(doc(db, "users", user.uid), newUserProfile);

      return transformUser(user, newUserProfile);
    } catch (error: any) {
      console.error("Registration Error:", error);
      // Transform Firebase errors into user-friendly messages
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

      // Fetch additional user data from Firestore
      const docRef = doc(db, "users", user.uid);
      const docSnap = await getDoc(docRef);

      let userData = {};
      if (docSnap.exists()) {
        userData = docSnap.data();
      } else {
        // If firestore doc doesn't exist (legacy user?), create it
        userData = {
          name: user.displayName || 'User',
          email: user.email,
          preferences: defaultPreferences
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
      // Clear any local storage legacy items if they exist
      localStorage.removeItem('banana_brand_session');
    } catch (error) {
      console.error("Logout Error:", error);
    }
  },

  // Helper to get current user state strictly from Auth (useful for initial load)
  getCurrentUser: (): Promise<User | null> => {
    return new Promise((resolve) => {
      const unsubscribe = onAuthStateChanged(auth, async (user) => {
        if (user) {
          try {
            const docRef = doc(db, "users", user.uid);
            const docSnap = await getDoc(docRef);
            const userData = docSnap.exists() ? docSnap.data() : { preferences: defaultPreferences };
            resolve(transformUser(user, userData));
          } catch (e) {
            console.error("Error fetching user profile:", e);
            resolve(null);
          }
        } else {
          resolve(null);
        }
        unsubscribe(); // We only need the first value for this one-shot checker
      });
    });
  },

  updateUserPreferences: async (userId: string, preferences: UserPreferences) => {
    try {
      const userRef = doc(db, "users", userId);
      await updateDoc(userRef, {
        preferences: preferences
      });
    } catch (error) {
      console.error("Error updating preferences:", error);
      throw new Error("Failed to save preferences.");
    }
  },
  
  // Real-time listener for auth state changes
  onAuthStateChange: (callback: (user: User | null) => void) => {
    return onAuthStateChanged(auth, async (user) => {
      if (user) {
        const docRef = doc(db, "users", user.uid);
        const docSnap = await getDoc(docRef);
        const userData = docSnap.exists() ? docSnap.data() : { preferences: defaultPreferences };
        callback(transformUser(user, userData));
      } else {
        callback(null);
      }
    });
  }
};
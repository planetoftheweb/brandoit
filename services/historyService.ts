import { db } from "./firebase";
import { 
  collection, 
  addDoc, 
  query, 
  orderBy, 
  limit, 
  getDocs, 
  deleteDoc,
  doc
} from "firebase/firestore";
import { User, GenerationHistoryItem } from "../types";

const LOCAL_STORAGE_KEY = 'brandoit_history';
const LOCAL_LIMIT = 5;
const REMOTE_LIMIT = 20;

export const historyService = {
  
  saveToHistory: async (user: User | null, item: GenerationHistoryItem): Promise<void> => {
    if (user) {
      await historyService.saveToRemote(user.id, item);
    } else {
      historyService.saveToLocal(item);
    }
  },

  getHistory: async (user: User | null): Promise<GenerationHistoryItem[]> => {
    if (user) {
      return await historyService.getFromRemote(user.id);
    } else {
      return historyService.getFromLocal();
    }
  },

  // --- Local Storage Logic ---

  saveToLocal: (item: GenerationHistoryItem) => {
    const history = historyService.getFromLocal();
    // Prepend new item
    const newHistory = [item, ...history].slice(0, LOCAL_LIMIT);
    
    try {
      localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(newHistory));
    } catch (e) {
      console.error("Failed to save to local storage (likely quota exceeded):", e);
      // Fallback: Try saving fewer items if quota exceeded
      if (newHistory.length > 1) {
        localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify([item]));
      }
    }
  },

  getFromLocal: (): GenerationHistoryItem[] => {
    try {
      const json = localStorage.getItem(LOCAL_STORAGE_KEY);
      return json ? JSON.parse(json) : [];
    } catch (e) {
      console.error("Failed to parse local history:", e);
      return [];
    }
  },

  clearLocal: () => {
    localStorage.removeItem(LOCAL_STORAGE_KEY);
  },

  // --- Firestore Logic ---

  saveToRemote: async (userId: string, item: GenerationHistoryItem) => {
    try {
      const historyRef = collection(db, "users", userId, "history");
      
      // Add new document
      // We store the full item including base64. 
      // NOTE: Firestore documents have a 1MB limit. 
      // If base64 images are large, this might fail or be slow.
      // Ideally we would upload to Storage, but for MVP/prototype we try Firestore.
      await addDoc(historyRef, item);

      // Cleanup old items to enforce limit
      // This is a bit expensive (reads + deletes), but keeps the DB clean
      const q = query(historyRef, orderBy("timestamp", "desc"));
      const snapshot = await getDocs(q);
      
      if (snapshot.size > REMOTE_LIMIT) {
        const itemsToDelete = snapshot.docs.slice(REMOTE_LIMIT);
        const deletePromises = itemsToDelete.map(d => deleteDoc(doc(db, "users", userId, "history", d.id)));
        await Promise.all(deletePromises);
      }

    } catch (e) {
      console.error("Failed to save to remote history:", e);
      // Fallback to local if remote fails? Or just log it.
    }
  },

  getFromRemote: async (userId: string): Promise<GenerationHistoryItem[]> => {
    try {
      const historyRef = collection(db, "users", userId, "history");
      const q = query(historyRef, orderBy("timestamp", "desc"), limit(REMOTE_LIMIT));
      const snapshot = await getDocs(q);
      
      return snapshot.docs.map(doc => ({
        ...doc.data(),
        id: doc.id // Use Firestore ID
      } as GenerationHistoryItem));
    } catch (e) {
      console.error("Failed to fetch remote history:", e);
      return [];
    }
  },

  mergeLocalToRemote: async (userId: string) => {
    const localHistory = historyService.getFromLocal();
    if (localHistory.length === 0) return;

    // Get current remote history to avoid duplicates if possible, or just push.
    // Since local history is small (5 items), we can just push them all.
    // However, we should check if we are going over the limit.
    // The saveToRemote function handles limits, so we can just iterate and save.
    
    // We reverse local history to add oldest first, so that the newest local items
    // end up being the newest in remote (if timestamps are preserved).
    // Actually, saveToRemote adds a new doc. The timestamp in the item is what matters for sorting.
    
    for (const item of localHistory.reverse()) {
      // Re-use the existing item data
      await historyService.saveToRemote(userId, item);
    }

    // Clear local history after successful merge
    historyService.clearLocal();
  }
};
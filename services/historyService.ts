import { db, storage } from "./firebase";
import { 
  collection, 
  addDoc, 
  setDoc,
  query, 
  orderBy, 
  limit, 
  getDocs, 
  deleteDoc,
  doc
} from "firebase/firestore";
import { ref, uploadString, getDownloadURL, deleteObject } from "firebase/storage";
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

      // Upload image to Firebase Storage to avoid Firestore document size limits
      const imageRef = ref(storage, `users/${userId}/history/${item.id}.${item.mimeType.split('/')[1] || 'png'}`);
      const base64Data = item.base64Data.includes(',') ? item.base64Data.split(',')[1] : item.base64Data;
      await uploadString(imageRef, base64Data, 'base64', { contentType: item.mimeType });
      const imageUrl = await getDownloadURL(imageRef);

      await setDoc(doc(historyRef, item.id), {
        id: item.id,
        timestamp: item.timestamp,
        config: item.config,
        imageUrl,
        mimeType: item.mimeType
      });

      // Cleanup old items to enforce limit
      const q = query(historyRef, orderBy("timestamp", "desc"));
      const snapshot = await getDocs(q);
      
      if (snapshot.size > REMOTE_LIMIT) {
        const itemsToDelete = snapshot.docs.slice(REMOTE_LIMIT);
        const deletePromises = itemsToDelete.map(async (d) => {
          const data = d.data();
          await deleteDoc(doc(db, "users", userId, "history", d.id));
          if (data.imageUrl && data.imageUrl.includes('firebasestorage.googleapis.com')) {
            try {
              const urlPath = decodeURIComponent(data.imageUrl.split('/o/')[1]?.split('?')[0] || '');
              if (urlPath) {
                await deleteObject(ref(storage, urlPath));
              }
            } catch (storageError) {
              console.warn("Failed to delete old image from Storage:", storageError);
            }
          }
        });
        await Promise.all(deletePromises);
      }

    } catch (e) {
      console.error("Failed to save to remote history:", e);
      historyService.saveToLocal(item);
    }
  },

  deleteFromRemote: async (userId: string, historyId: string) => {
    try {
      const historyDocRef = doc(db, "users", userId, "history", historyId);
      const snapshot = await getDocs(query(collection(db, "users", userId, "history")));
      const target = snapshot.docs.find(d => d.id === historyId);
      const data = target?.data();

      await deleteDoc(historyDocRef);

      if (data && data.imageUrl && data.imageUrl.includes('firebasestorage.googleapis.com')) {
        try {
          const urlPath = decodeURIComponent(data.imageUrl.split('/o/')[1]?.split('?')[0] || '');
          if (urlPath) {
            await deleteObject(ref(storage, urlPath));
          }
        } catch (err) {
          console.warn("Failed to delete history image from Storage:", err);
        }
      }
    } catch (e) {
      console.error("Failed to delete remote history item:", e);
      throw e;
    }
  },

  deleteFromLocal: (historyId: string) => {
    const history = historyService.getFromLocal().filter(h => h.id !== historyId);
    try {
      localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(history.slice(0, LOCAL_LIMIT)));
    } catch (e) {
      console.error("Failed to update local history after delete:", e);
    }
  },

  getFromRemote: async (userId: string): Promise<GenerationHistoryItem[]> => {
    try {
      const historyRef = collection(db, "users", userId, "history");
      const q = query(historyRef, orderBy("timestamp", "desc"), limit(REMOTE_LIMIT));
      const snapshot = await getDocs(q);
      
      return snapshot.docs.map(doc => {
        const data = doc.data();
        return {
          ...data,
          id: doc.id,
          imageUrl: data.imageUrl || ''
        } as GenerationHistoryItem;
      });
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
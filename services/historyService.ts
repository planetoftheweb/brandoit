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
      // Upload image to Firebase Storage instead of storing base64 in Firestore
      // This avoids the 1MB Firestore document limit
      const imageRef = ref(storage, `users/${userId}/history/${item.id}.${item.mimeType.split('/')[1] || 'png'}`);
      
      // Upload base64 data (remove data URL prefix if present)
      const base64Data = item.base64Data.includes(',') 
        ? item.base64Data.split(',')[1] 
        : item.base64Data;
      
      await uploadString(imageRef, base64Data, 'base64', {
        contentType: item.mimeType
      });

      // Get the download URL
      const imageUrl = await getDownloadURL(imageRef);

      // Save to Firestore with Storage URL instead of base64
      const historyRef = collection(db, "users", userId, "history");
      const historyDoc = {
        id: item.id,
        timestamp: item.timestamp,
        config: item.config,
        imageUrl: imageUrl, // Storage URL
        mimeType: item.mimeType,
        // Don't store base64Data - it's in Storage now
        // base64Data is kept for backward compatibility with existing items
      };
      
      await setDoc(doc(historyRef, item.id), historyDoc);

      // Cleanup old items to enforce limit
      const q = query(historyRef, orderBy("timestamp", "desc"));
      const snapshot = await getDocs(q);
      
      if (snapshot.size > REMOTE_LIMIT) {
        const itemsToDelete = snapshot.docs.slice(REMOTE_LIMIT);
        const deletePromises = itemsToDelete.map(async (d) => {
          const data = d.data();
          // Delete from Firestore
          await deleteDoc(doc(db, "users", userId, "history", d.id));
          // Also delete from Storage if it has a storage URL
          if (data.imageUrl && data.imageUrl.includes('firebasestorage.googleapis.com')) {
            try {
              // Extract the path from the URL or use a pattern
              // Storage URLs are like: https://firebasestorage.googleapis.com/v0/b/.../o/users%2F...%2Fhistory%2F...
              // We need to decode and construct the ref
              const urlPath = decodeURIComponent(data.imageUrl.split('/o/')[1]?.split('?')[0] || '');
              if (urlPath) {
                const storageRef = ref(storage, urlPath);
                await deleteObject(storageRef);
              }
            } catch (storageError) {
              console.warn("Failed to delete old image from Storage:", storageError);
              // Continue even if Storage delete fails
            }
          }
        });
        await Promise.all(deletePromises);
      }

    } catch (e) {
      console.error("Failed to save to remote history:", e);
      // Fallback to local if remote fails
      historyService.saveToLocal(item);
    }
  },

  deleteFromRemote: async (userId: string, historyId: string) => {
    try {
      const historyDocRef = doc(db, "users", userId, "history", historyId);
      const snapshot = await getDocs(query(collection(db, "users", userId, "history")));
      const target = snapshot.docs.find(d => d.id === historyId);
      const data = target?.data();
      // Delete Firestore doc
      await deleteDoc(historyDocRef);
      // Delete storage asset if present
      if (data && data.imageUrl && data.imageUrl.includes('firebasestorage.googleapis.com')) {
        try {
          const urlPath = decodeURIComponent(data.imageUrl.split('/o/')[1]?.split('?')[0] || '');
          if (urlPath) {
            const storageRef = ref(storage, urlPath);
            await deleteObject(storageRef);
          }
        } catch (e) {
          console.warn("Failed to delete history image from Storage:", e);
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
        // If it has base64Data (old format), use it
        // Otherwise, use the Storage URL (new format)
        // For display, we always use imageUrl
        return {
          ...data,
          id: doc.id, // Use Firestore ID
          imageUrl: data.imageUrl || '', // Storage URL or old base64 data URL
          // Keep base64Data if it exists (for backward compatibility)
          // New items won't have it, which is fine - we use imageUrl
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
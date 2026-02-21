import { db } from "./firebase";
import { 
  collection, 
  addDoc, 
  query, 
  orderBy, 
  limit, 
  getDocs, 
  deleteDoc,
  doc,
  updateDoc
} from "firebase/firestore";
import { User, Generation, GenerationVersion, GeneratedImage, GenerationConfig } from "../types";
import { toMarkLabel } from "./versionUtils";
import { convertToWebP, makeImageUrl } from "./imageConversionService";

const LOCAL_STORAGE_KEY = 'brandoit_generations_v2';
const LEGACY_STORAGE_KEY = 'brandoit_history';
const LOCAL_LIMIT = 20;
const REMOTE_LIMIT = 20;

const stripUndefined = (obj: Record<string, any>): Record<string, any> =>
  JSON.parse(JSON.stringify(obj));

const generateId = (): string => `gen-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

export const createVersionFromImage = async (
  image: GeneratedImage & { svgCode?: string },
  versionNumber: number,
  type: 'generation' | 'refinement',
  refinementPrompt?: string,
  parentVersionId?: string
): Promise<GenerationVersion> => {
  const isSvg = image.mimeType === 'image/svg+xml';
  const id = `v-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

  if (isSvg) {
    return {
      id,
      number: versionNumber,
      label: toMarkLabel(versionNumber),
      timestamp: Date.now(),
      type,
      imageData: image.base64Data,
      imageUrl: image.imageUrl,
      mimeType: image.mimeType,
      svgCode: image.svgCode,
      refinementPrompt,
      parentVersionId,
    };
  }

  const converted = await convertToWebP(image.base64Data, image.mimeType);
  return {
    id,
    number: versionNumber,
    label: toMarkLabel(versionNumber),
    timestamp: Date.now(),
    type,
    imageData: converted.base64Data,
    imageUrl: makeImageUrl(converted.base64Data, converted.mimeType),
    mimeType: converted.mimeType,
    refinementPrompt,
    parentVersionId,
  };
};

export const createGeneration = async (
  image: GeneratedImage,
  config: GenerationConfig,
  modelId: string
): Promise<Generation> => {
  const version = await createVersionFromImage(image, 1, 'generation');
  return {
    id: generateId(),
    createdAt: Date.now(),
    config,
    modelId,
    versions: [version],
    currentVersionIndex: 0,
  };
};

export const addRefinementVersion = async (
  generation: Generation,
  image: GeneratedImage,
  refinementPrompt: string
): Promise<Generation> => {
  const currentVersion = generation.versions[generation.currentVersionIndex];
  const nextNumber = generation.versions.length + 1;
  const newVersion = await createVersionFromImage(
    image,
    nextNumber,
    'refinement',
    refinementPrompt,
    currentVersion?.id
  );
  const updatedVersions = [...generation.versions, newVersion];
  return {
    ...generation,
    versions: updatedVersions,
    currentVersionIndex: updatedVersions.length - 1,
  };
};

export const getLatestVersion = (gen: Generation): GenerationVersion =>
  gen.versions[gen.versions.length - 1];

export const getCurrentVersion = (gen: Generation): GenerationVersion =>
  gen.versions[gen.currentVersionIndex] ?? gen.versions[gen.versions.length - 1];

const migrateLegacyHistory = async (): Promise<Generation[] | null> => {
  try {
    const legacyRaw = localStorage.getItem(LEGACY_STORAGE_KEY);
    if (!legacyRaw) return null;

    const legacyItems = JSON.parse(legacyRaw);
    if (!Array.isArray(legacyItems) || legacyItems.length === 0) return null;

    const generations: Generation[] = [];
    for (const item of legacyItems) {
      if (!item.base64Data && !item.imageUrl) continue;
      try {
        const converted = item.base64Data
          ? await convertToWebP(item.base64Data, item.mimeType || 'image/png')
          : { base64Data: '', mimeType: item.mimeType || 'image/png' };

        const version: GenerationVersion = {
          id: `v-migrated-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          number: 1,
          label: toMarkLabel(1),
          timestamp: item.timestamp || Date.now(),
          type: 'generation',
          imageData: converted.base64Data,
          imageUrl: converted.base64Data
            ? makeImageUrl(converted.base64Data, converted.mimeType)
            : item.imageUrl || '',
          mimeType: converted.mimeType,
        };

        generations.push({
          id: item.id || generateId(),
          createdAt: item.timestamp || Date.now(),
          config: item.config || { prompt: '', colorSchemeId: '', visualStyleId: '', graphicTypeId: '', aspectRatio: '' },
          modelId: item.modelId || 'gemini',
          versions: [version],
          currentVersionIndex: 0,
        });
      } catch {
        // Skip items that fail migration
      }
    }

    if (generations.length > 0) {
      localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(generations));
      localStorage.removeItem(LEGACY_STORAGE_KEY);
    }
    return generations;
  } catch (e) {
    console.error("Legacy migration failed:", e);
    return null;
  }
};

export const historyService = {
  
  saveGeneration: async (user: User | null, generation: Generation): Promise<void> => {
    if (user) {
      await historyService.saveToRemote(user.id, generation);
    } else {
      historyService.saveToLocal(generation);
    }
  },

  updateGeneration: async (user: User | null, generation: Generation): Promise<void> => {
    if (user) {
      await historyService.updateRemote(user.id, generation);
    } else {
      historyService.updateLocal(generation);
    }
  },

  getHistory: async (user: User | null): Promise<Generation[]> => {
    if (user) {
      return await historyService.getFromRemote(user.id);
    } else {
      return historyService.getFromLocal();
    }
  },

  // --- Local Storage Logic ---

  saveToLocal: (generation: Generation) => {
    const history = historyService.getFromLocal();
    const newHistory = [generation, ...history].slice(0, LOCAL_LIMIT);
    try {
      localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(newHistory));
    } catch (e) {
      console.error("Failed to save to local storage (likely quota exceeded):", e);
      try {
        localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify([generation]));
      } catch {
        // Storage completely full
      }
    }
  },

  updateLocal: (generation: Generation) => {
    try {
      const history = historyService.getFromLocal();
      const idx = history.findIndex(g => g.id === generation.id);
      if (idx >= 0) {
        history[idx] = generation;
      } else {
        history.unshift(generation);
      }
      localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(history.slice(0, LOCAL_LIMIT)));
    } catch (e) {
      console.error("Failed to update local storage:", e);
    }
  },

  getFromLocal: (): Generation[] => {
    try {
      const json = localStorage.getItem(LOCAL_STORAGE_KEY);
      if (json) return JSON.parse(json);

      const migrated = migrateLegacyHistory();
      if (migrated instanceof Promise) {
        return [];
      }
      return migrated || [];
    } catch (e) {
      console.error("Failed to parse local history:", e);
      return [];
    }
  },

  initLocal: async (): Promise<Generation[]> => {
    const json = localStorage.getItem(LOCAL_STORAGE_KEY);
    if (json) {
      try {
        return JSON.parse(json);
      } catch {
        return [];
      }
    }
    const migrated = await migrateLegacyHistory();
    return migrated || [];
  },

  clearLocal: () => {
    localStorage.removeItem(LOCAL_STORAGE_KEY);
    localStorage.removeItem(LEGACY_STORAGE_KEY);
  },

  deleteFromLocal: (generationId: string) => {
    try {
      const history = historyService.getFromLocal();
      const filtered = history.filter(g => g.id !== generationId);
      localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(filtered));
    } catch (e) {
      console.error("Failed to delete local generation:", e);
    }
  },

  // --- Firestore Logic ---

  saveToRemote: async (userId: string, generation: Generation) => {
    try {
      const historyRef = collection(db, "users", userId, "history");
      await addDoc(historyRef, stripUndefined(generation));

      const q = query(historyRef, orderBy("createdAt", "desc"));
      const snapshot = await getDocs(q);
      
      if (snapshot.size > REMOTE_LIMIT) {
        const itemsToDelete = snapshot.docs.slice(REMOTE_LIMIT);
        const deletePromises = itemsToDelete.map(d => deleteDoc(doc(db, "users", userId, "history", d.id)));
        await Promise.all(deletePromises);
      }
    } catch (e) {
      console.error("Failed to save to remote history:", e);
    }
  },

  updateRemote: async (userId: string, generation: Generation) => {
    try {
      const historyRef = collection(db, "users", userId, "history");
      const q = query(historyRef, orderBy("createdAt", "desc"), limit(REMOTE_LIMIT));
      const snapshot = await getDocs(q);
      const existing = snapshot.docs.find(d => d.data().id === generation.id);
      if (existing) {
        await updateDoc(doc(db, "users", userId, "history", existing.id), stripUndefined(generation));
      } else {
        await historyService.saveToRemote(userId, generation);
      }
    } catch (e) {
      console.error("Failed to update remote generation:", e);
    }
  },

  getFromRemote: async (userId: string): Promise<Generation[]> => {
    try {
      const historyRef = collection(db, "users", userId, "history");
      const q = query(historyRef, orderBy("createdAt", "desc"), limit(REMOTE_LIMIT));
      const snapshot = await getDocs(q);
      
      return snapshot.docs.map(d => {
        const data = d.data();
        if (data.versions) {
          return { ...data, id: data.id || d.id } as Generation;
        }
        // Legacy item in Firestore — wrap as Generation
        const version: GenerationVersion = {
          id: `v-legacy-${d.id}`,
          number: 1,
          label: toMarkLabel(1),
          timestamp: data.timestamp || Date.now(),
          type: 'generation',
          imageData: data.base64Data || '',
          imageUrl: data.imageUrl || (data.base64Data ? makeImageUrl(data.base64Data, data.mimeType || 'image/png') : ''),
          mimeType: data.mimeType || 'image/png',
        };
        return {
          id: data.id || d.id,
          createdAt: data.timestamp || Date.now(),
          config: data.config || { prompt: '', colorSchemeId: '', visualStyleId: '', graphicTypeId: '', aspectRatio: '' },
          modelId: data.modelId || 'gemini',
          versions: [version],
          currentVersionIndex: 0,
        } as Generation;
      });
    } catch (e) {
      console.error("Failed to fetch remote history:", e);
      return [];
    }
  },

  deleteFromRemote: async (userId: string, generationId: string) => {
    try {
      const historyRef = collection(db, "users", userId, "history");
      const q = query(historyRef, orderBy("createdAt", "desc"), limit(REMOTE_LIMIT));
      const snapshot = await getDocs(q);
      const target = snapshot.docs.find(d => {
        const data = d.data();
        return data.id === generationId || d.id === generationId;
      });
      if (target) {
        await deleteDoc(doc(db, "users", userId, "history", target.id));
      }
    } catch (e) {
      console.error("Failed to delete remote generation:", e);
      throw e;
    }
  },

  mergeLocalToRemote: async (userId: string) => {
    const localHistory = historyService.getFromLocal();
    if (localHistory.length === 0) return;

    for (const gen of [...localHistory].reverse()) {
      await historyService.saveToRemote(userId, gen);
    }

    historyService.clearLocal();
  }
};

import { db } from "./firebase";
import { 
  collection, 
  getDocs, 
  query, 
  where, 
  addDoc, 
  doc,
  deleteDoc,
  or
} from "firebase/firestore";
import { BrandColor, VisualStyle, GraphicType, AspectRatioOption } from "../types";
import { 
  BRAND_COLORS, 
  VISUAL_STYLES, 
  GRAPHIC_TYPES, 
  ASPECT_RATIOS 
} from "../constants";

// Helper to re-attach icons locally since we don't store them in DB
// We map IDs/Values to the constants to find the icon
const attachIcon = (item: any, collection: any[]) => {
  const match = collection.find(c => c.id === item.id || c.value === item.value);
  return match ? { ...item, icon: match.icon } : item;
};

export const resourceService = {
  
  // Fetch System Defaults + User's Custom Items
  getAllResources: async (userId?: string) => {
    try {
      const results = {
        graphicTypes: [] as GraphicType[],
        aspectRatios: [] as AspectRatioOption[],
        visualStyles: [] as VisualStyle[],
        brandColors: [] as BrandColor[]
      };

      // 1. Graphic Types (System only mostly)
      // For types/ratios, we can just use constants for speed if we don't expect custom ones
      // But let's fetch from DB to be true to the request
      const typesSnap = await getDocs(collection(db, "graphic_types"));
      results.graphicTypes = typesSnap.docs.map(d => attachIcon({ ...d.data(), id: d.id }, GRAPHIC_TYPES));
      if (results.graphicTypes.length === 0) results.graphicTypes = GRAPHIC_TYPES; // Fallback

      // 2. Aspect Ratios
      const ratiosSnap = await getDocs(collection(db, "aspect_ratios"));
      results.aspectRatios = ratiosSnap.docs.map(d => attachIcon({ ...d.data(), id: d.id }, ASPECT_RATIOS));
      if (results.aspectRatios.length === 0) results.aspectRatios = ASPECT_RATIOS; // Fallback

      // 3. Visual Styles (System + User's)
      const stylesRef = collection(db, "visual_styles");
      let stylesQuery;
      if (userId) {
        stylesQuery = query(stylesRef, or(where("isSystem", "==", true), where("authorId", "==", userId)));
      } else {
        stylesQuery = query(stylesRef, where("isSystem", "==", true));
      }
      const stylesSnap = await getDocs(stylesQuery);
      results.visualStyles = stylesSnap.docs.map(d => attachIcon({ ...d.data(), id: d.id }, VISUAL_STYLES));
      
      // 4. Brand Colors (System + User's)
      const colorsRef = collection(db, "brand_colors");
      let colorsQuery;
      if (userId) {
        colorsQuery = query(colorsRef, or(where("isSystem", "==", true), where("authorId", "==", userId)));
      } else {
        colorsQuery = query(colorsRef, where("isSystem", "==", true));
      }
      const colorsSnap = await getDocs(colorsQuery);
      results.brandColors = colorsSnap.docs.map(d => attachIcon({ ...d.data(), id: d.id }, BRAND_COLORS));

      return results;

    } catch (error) {
      console.error("Error fetching resources:", error);
      // Fallback to constants if DB fails
      return {
        graphicTypes: GRAPHIC_TYPES,
        aspectRatios: ASPECT_RATIOS,
        visualStyles: VISUAL_STYLES,
        brandColors: BRAND_COLORS
      };
    }
  },

  addCustomItem: async (collectionName: string, item: any, userId: string) => {
    try {
      const docRef = await addDoc(collection(db, collectionName), {
        ...item,
        isSystem: false,
        authorId: userId,
        createdAt: Date.now()
      });
      return { ...item, id: docRef.id };
    } catch (error) {
      console.error(`Error adding to ${collectionName}:`, error);
      throw error;
    }
  },

  deleteCustomItem: async (collectionName: string, itemId: string) => {
    try {
        await deleteDoc(doc(db, collectionName, itemId));
    } catch (error) {
        console.error(`Error deleting from ${collectionName}:`, error);
        throw error;
    }
  }
};

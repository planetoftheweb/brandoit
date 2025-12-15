import { db } from "./firebase";
import { collection, doc, setDoc, getDocs, query, where } from "firebase/firestore";
import { 
  BRAND_COLORS, 
  VISUAL_STYLES, 
  GRAPHIC_TYPES, 
  ASPECT_RATIOS 
} from "../constants";

export const seedStructures = async () => {
  console.log("Seeding database structures...");

  // 1. Seed Graphic Types
  const typesRef = collection(db, "graphic_types");
  const typesSnapshot = await getDocs(typesRef);
  if (typesSnapshot.empty) {
    console.log("Seeding Graphic Types...");
    for (const item of GRAPHIC_TYPES) {
      // Use the ID as the document ID for system items to prevent dupes
      await setDoc(doc(typesRef, item.id), {
        ...item,
        isSystem: true,
        icon: undefined // Don't save component symbols
      });
    }
  }

  // 2. Seed Aspect Ratios
  const ratiosRef = collection(db, "aspect_ratios");
  const ratiosSnapshot = await getDocs(ratiosRef);
  if (ratiosSnapshot.empty) {
    console.log("Seeding Aspect Ratios...");
    for (const item of ASPECT_RATIOS) {
      // Use value as ID (sanitize it first, e.g. "1:1" -> "1_1")
      const safeId = item.value.replace(/:/g, '_');
      await setDoc(doc(ratiosRef, safeId), {
        ...item,
        isSystem: true,
        icon: undefined
      });
    }
  }

  // 3. Seed Visual Styles
  const stylesRef = collection(db, "visual_styles");
  // Check if system styles exist
  const qStyles = query(stylesRef, where("isSystem", "==", true));
  const stylesSnap = await getDocs(qStyles);
  if (stylesSnap.empty) {
    console.log("Seeding System Visual Styles...");
    for (const item of VISUAL_STYLES) {
      await setDoc(doc(stylesRef, item.id), {
        ...item,
        isSystem: true,
        icon: undefined
      });
    }
  }

  // 4. Seed Brand Colors
  const colorsRef = collection(db, "brand_colors");
  const qColors = query(colorsRef, where("isSystem", "==", true));
  const colorsSnap = await getDocs(qColors);
  if (colorsSnap.empty) {
    console.log("Seeding System Brand Colors...");
    for (const item of BRAND_COLORS) {
      await setDoc(doc(colorsRef, item.id), {
        ...item,
        isSystem: true,
        icon: undefined
      });
    }
  }

  console.log("Structure seeding complete.");
};

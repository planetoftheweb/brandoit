import { db } from "./firebase";
import { collection, doc, setDoc } from "firebase/firestore";
import { 
  BRAND_COLORS, 
  VISUAL_STYLES, 
  GRAPHIC_TYPES, 
  ASPECT_RATIOS 
} from "../constants";
import { User } from "../types";

// The username allowed to seed public defaults
const ADMIN_USERNAME = "planetoftheweb"; 

export const seedStructures = async (currentUser?: User) => {
  // Only proceed if the user is the designated admin
  if (!currentUser || currentUser.username !== ADMIN_USERNAME) {
    console.log("Skipping system seeding: User is not admin.");
    return;
  }

  console.log("Admin authenticated. Seeding global defaults...");

  // Helper to upsert system items
  const seedCollection = async (collectionName: string, items: any[]) => {
    const ref = collection(db, collectionName);
    
    for (const item of items) {
      // Use the ID as the document ID for system items to prevent dupes
      const docId = item.id || item.value.replace(/:/g, '_');
      
      const { icon, ...data } = item; // Exclude icon component

      await setDoc(doc(ref, docId), {
        ...data,
        // Set scope to public as requested (visible to all in community/global lists)
        // or 'system' if we want them to be immutable defaults. 
        // User requested "come from my account" and "set to public".
        scope: 'public', 
        
        // Attribution to the admin
        authorId: currentUser.id,
        authorName: currentUser.username || currentUser.name,
        
        isSystem: true, // Keep this flag to identify them as core defaults in UI logic if needed
        createdAt: Date.now(),
        votes: 0,
        voters: []
      }, { merge: true }); 
    }
    console.log(`Seeded ${items.length} items to ${collectionName}`);
  };

  // Seed all collections
  await seedCollection("graphic_types", GRAPHIC_TYPES);
  await seedCollection("aspect_ratios", ASPECT_RATIOS);
  await seedCollection("visual_styles", VISUAL_STYLES);
  await seedCollection("brand_colors", BRAND_COLORS);

  console.log("Global structure seeding complete.");
};

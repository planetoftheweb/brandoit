import { 
  BRAND_COLORS, 
  VISUAL_STYLES, 
  GRAPHIC_TYPES, 
} from '../constants';
import { catalogService } from '../services/catalogService';

export const seedCatalog = async () => {
  // Check if already seeded (simple check: if catalog has items, skip)
  const existing = await catalogService.getCatalogItems();
  if (existing.length > 0) {
    console.log("Catalog already seeded.");
    return;
  }

  const adminId = "system_admin";
  const adminName = "BranDoIt Team";

  console.log("Seeding catalog...");

  for (const style of VISUAL_STYLES) {
    await catalogService.addToCatalog('style', style, adminId, adminName);
  }

  for (const color of BRAND_COLORS) {
    await catalogService.addToCatalog('color', color, adminId, adminName);
  }

  for (const type of GRAPHIC_TYPES) {
    await catalogService.addToCatalog('type', type, adminId, adminName);
  }

  console.log("Catalog seeding complete.");
};

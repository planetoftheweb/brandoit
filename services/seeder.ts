import { 
  BRAND_COLORS, 
  VISUAL_STYLES, 
} from '../constants';
import { catalogService } from '../services/catalogService';

export const seedCatalog = async () => {
  const existing = await catalogService.getCatalogItems();
  
  // Basic seeding of defaults (system items)
  const systemItemsExist = existing.some(item => item.authorId === "system_admin");
  
  if (!systemItemsExist) {
    console.log("Seeding system defaults...");
    const adminId = "system_admin";
    const adminName = "BranDoIt Team";

    for (const style of VISUAL_STYLES) {
      await catalogService.addToCatalog('style', style, adminId, adminName);
    }

    for (const color of BRAND_COLORS) {
      await catalogService.addToCatalog('color', color, adminId, adminName);
    }
  }

  // Seeding Community Examples
  const communityItemsExist = existing.some(item => item.authorId !== "system_admin");

  if (!communityItemsExist) {
    console.log("Seeding community examples...");
    
    const communityStyles = [
      {
        id: 'neon-cyberpunk',
        name: 'Neon Cyberpunk',
        description: 'Glowing neon lines, dark background, futuristic grid, high contrast.',
        icon: undefined // Icons not stored in Firestore usually, handled by UI fallback
      },
      {
        id: 'vintage-paper',
        name: 'Vintage Paper',
        description: 'Textured paper background, ink bleeds, sepia tones, nostalgic feel.',
        icon: undefined
      },
      {
        id: 'glassmorphism',
        name: 'Glassmorphism',
        description: 'Translucent frosted glass effects, subtle light borders, vivid background blurs.',
        icon: undefined
      }
    ];

    const communityColors = [
      {
        id: 'sunset-vibes',
        name: 'Sunset Vibes',
        colors: ['#FF4500', '#FF8C00', '#FFD700', '#8B0000']
      },
      {
        id: 'ocean-depth',
        name: 'Ocean Depth',
        colors: ['#000080', '#0000CD', '#4169E1', '#E0FFFF']
      },
      {
        id: 'forest-mist',
        name: 'Forest Mist',
        colors: ['#2F4F4F', '#556B2F', '#8FBC8F', '#F0FFF0']
      },
      {
        id: 'candy-crush',
        name: 'Candy Crush',
        colors: ['#FF69B4', '#FF1493', '#00CED1', '#FFFFE0']
      }
    ];

    const authors = [
      { id: 'user_123', name: 'cyber_artist' },
      { id: 'user_456', name: 'retro_fan' },
      { id: 'user_789', name: 'ui_designer' },
      { id: 'user_101', name: 'nature_lover' }
    ];

    // Add Styles
    await catalogService.addToCatalog('style', communityStyles[0], authors[0].id, authors[0].name);
    await catalogService.addToCatalog('style', communityStyles[1], authors[1].id, authors[1].name);
    await catalogService.addToCatalog('style', communityStyles[2], authors[2].id, authors[2].name);

    // Add Colors
    await catalogService.addToCatalog('color', communityColors[0], authors[3].id, authors[3].name);
    await catalogService.addToCatalog('color', communityColors[1], 'user_202', 'diver_dave');
    await catalogService.addToCatalog('color', communityColors[2], 'user_303', 'hiker_hannah');
    await catalogService.addToCatalog('color', communityColors[3], authors[0].id, authors[0].name);

    console.log("Community examples seeded.");
  }
};
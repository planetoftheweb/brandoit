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
  // We check if we have enough community items (e.g., > 10) to determine if we need to seed more
  const communityItemsCount = existing.filter(item => item.authorId !== "system_admin").length;

  if (communityItemsCount < 10) {
    console.log("Seeding comprehensive community examples...");
    
    // --- Styles (20 Items) ---
    const communityStyles = [
      {
        id: 'neon-cyberpunk',
        name: 'Neon Cyberpunk',
        description: 'Glowing neon lines, dark background, futuristic grid, high contrast, sci-fi aesthetic.',
      },
      {
        id: 'vintage-paper',
        name: 'Vintage Paper',
        description: 'Textured paper background, ink bleeds, sepia tones, nostalgic feel, old map style.',
      },
      {
        id: 'glassmorphism',
        name: 'Glassmorphism',
        description: 'Translucent frosted glass effects, subtle light borders, vivid background blurs, modern UI feel.',
      },
      {
        id: 'retro-pixel',
        name: 'Retro Pixel Art',
        description: '8-bit style, blocky aesthetics, limited color palette, nostalgic video game look.',
      },
      {
        id: 'watercolor-dream',
        name: 'Watercolor Dream',
        description: 'Soft pastel washes, paper texture, organic bleeding edges, artistic and gentle.',
      },
      {
        id: 'blueprint-tech',
        name: 'Blueprint Tech',
        description: 'Blue background, white technical lines, grid patterns, architectural look.',
      },
      {
        id: 'claymorphism',
        name: 'Claymorphism',
        description: 'Soft, inflated 3D shapes, matte finish, friendly and rounded, light shadows.',
      },
      {
        id: 'comic-book',
        name: 'Comic Book Pop',
        description: 'Bold black outlines, halftone patterns, vibrant flat colors, dynamic action lines.',
      },
      {
        id: 'noir-detective',
        name: 'Noir Detective',
        description: 'High contrast black and white, dramatic shadows, moody lighting, film noir aesthetic.',
      },
      {
        id: 'low-poly',
        name: 'Low Poly 3D',
        description: 'Geometric shapes, faceted surfaces, flat shading, abstract minimalist 3D.',
      },
      {
        id: 'vaporwave-glitch',
        name: 'Vaporwave Glitch',
        description: 'Purple/pink gradients, glitch artifacts, retro 80s/90s internet aesthetic, statues and palms.',
      },
      {
        id: 'ukiyo-e',
        name: 'Ukiyo-e Woodblock',
        description: 'Traditional Japanese woodblock print style, flat colors, heavy outlines, nature themes.',
      },
      {
        id: 'bauhaus-geo',
        name: 'Bauhaus Geometric',
        description: 'Simple geometric shapes, primary colors, clean lines, functional and abstract.',
      },
      {
        id: 'steampunk-gear',
        name: 'Steampunk Gears',
        description: 'Brass and copper tones, gears, cogs, victorian industrial aesthetic.',
      },
      {
        id: 'graffiti-street',
        name: 'Urban Graffiti',
        description: 'Spray paint textures, drips, bold lettering, street art vibrancy.',
      },
      {
        id: 'chalkboard-edu',
        name: 'Chalkboard',
        description: 'Dark green/black background, white chalk textures, hand-drawn diagrams.',
      },
      {
        id: 'embroidery-stitch',
        name: 'Embroidery Stitch',
        description: 'Thread textures, fabric background, stitched patterns, crafty feel.',
      },
      {
        id: 'origami-fold',
        name: 'Origami Fold',
        description: 'Paper fold lines, sharp creases, subtle shadows, paper craft aesthetic.',
      },
      {
        id: 'stained-glass',
        name: 'Stained Glass',
        description: 'Vibrant translucent colors, thick black lead lines, light shining through.',
      },
      {
        id: 'psychedelic-swirl',
        name: 'Psychedelic Swirl',
        description: 'Warped shapes, rainbow colors, liquid distortions, trippy 60s poster style.',
      }
    ];

    // --- Colors (20 Items) ---
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
      },
      {
        id: 'coffee-shop',
        name: 'Coffee Shop',
        colors: ['#4B3621', '#8B4513', '#D2691E', '#F5DEB3']
      },
      {
        id: 'arctic-chill',
        name: 'Arctic Chill',
        colors: ['#E0FFFF', '#B0E0E6', '#87CEFA', '#FFFFFF']
      },
      {
        id: 'lavender-dream',
        name: 'Lavender Fields',
        colors: ['#E6E6FA', '#D8BFD8', '#DDA0DD', '#9370DB']
      },
      {
        id: 'fire-engine',
        name: 'Fire Engine',
        colors: ['#FF0000', '#B22222', '#800000', '#FF4500']
      },
      {
        id: 'royal-gold',
        name: 'Royal & Gold',
        colors: ['#4B0082', '#800080', '#FFD700', '#DAA520']
      },
      {
        id: 'matrix-code',
        name: 'Matrix Code',
        colors: ['#000000', '#00FF00', '#008000', '#003300']
      },
      {
        id: 'desert-sands',
        name: 'Desert Sands',
        colors: ['#EDC9AF', '#C2B280', '#C19A6B', '#954535']
      },
      {
        id: 'cherry-blossom',
        name: 'Cherry Blossom',
        colors: ['#FFB7C5', '#FFC0CB', '#FF69B4', '#FFFFFF']
      },
      {
        id: 'night-sky',
        name: 'Starry Night',
        colors: ['#191970', '#000080', '#483D8B', '#FFD700']
      },
      {
        id: 'industrial-gray',
        name: 'Industrial Gray',
        colors: ['#2F4F4F', '#696969', '#A9A9A9', '#D3D3D3']
      },
      {
        id: 'citrus-burst',
        name: 'Citrus Burst',
        colors: ['#FFA500', '#FFFF00', '#32CD32', '#FFFFFF']
      },
      {
        id: 'berry-smoothie',
        name: 'Berry Smoothie',
        colors: ['#800080', '#9932CC', '#C71585', '#DB7093']
      },
      {
        id: 'autumn-leaves',
        name: 'Autumn Leaves',
        colors: ['#8B0000', '#D2691E', '#DAA520', '#556B2F']
      },
      {
        id: 'retro-diner',
        name: '50s Retro Diner',
        colors: ['#FF69B4', '#00CED1', '#000000', '#FFFFFF']
      },
      {
        id: 'mint-chocolate',
        name: 'Mint Chocolate',
        colors: ['#3EB489', '#98FF98', '#3B2F2F', '#FFFFFF']
      },
      {
        id: 'cyber-neon',
        name: 'Cyber Neon',
        colors: ['#FF00FF', '#00FFFF', '#120052', '#000000']
      }
    ];

    const authors = [
      'cyber_artist', 'retro_fan', 'ui_designer', 'nature_lover', 'diver_dave', 
      'hiker_hannah', 'pixel_pete', 'artistic_anna', 'tech_tom', 'creative_cathy'
    ];
    
    const getRandomAuthor = () => {
        const name = authors[Math.floor(Math.random() * authors.length)];
        return { id: `user_${name}`, name };
    }

    // Add Styles
    for (const style of communityStyles) {
        const author = getRandomAuthor();
        // Check if exists before adding to avoid duplicates if partial seed
        // Ideally we'd query specifically, but for this simple seeder we rely on overall count check
        await catalogService.addToCatalog('style', { ...style, icon: undefined }, author.id, author.name);
    }

    // Add Colors
    for (const color of communityColors) {
        const author = getRandomAuthor();
        await catalogService.addToCatalog('color', color, author.id, author.name);
    }

    console.log("Comprehensive community examples seeded.");
  }
};
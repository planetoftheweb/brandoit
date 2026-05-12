import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, '.', '');
    return {
      server: {
        port: 3000,
        host: '0.0.0.0',
      },
      plugins: [react()],
      build: {
        rollupOptions: {
          output: {
            manualChunks(id) {
              if (!id.includes('node_modules')) return undefined;
              if (id.includes('/@firebase/firestore/')) return 'vendor-firebase-firestore';
              if (id.includes('/@firebase/auth/')) return 'vendor-firebase-auth';
              if (id.includes('/@firebase/storage/')) return 'vendor-firebase-storage';
              if (id.includes('/@firebase/analytics/')) return 'vendor-firebase-analytics';
              if (id.includes('/@firebase/app/') || id.includes('/firebase/')) return 'vendor-firebase-app';
              if (id.includes('/@firebase/')) return 'vendor-firebase-shared';
              if (id.includes('/@google/genai/')) return 'vendor-ai';
              if (id.includes('/react/') || id.includes('/react-dom/')) return 'vendor-react';
              if (id.includes('/lucide-react/')) return 'vendor-icons';
              if (id.includes('/jszip/')) return 'vendor-zip';
              return 'vendor';
            },
          },
        },
      },
      define: {
        'process.env.API_KEY': JSON.stringify(env.GEMINI_API_KEY || env.VITE_GEMINI_API_KEY),
        'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY || env.VITE_GEMINI_API_KEY)
      },
      resolve: {
        alias: {
          '@': path.resolve(__dirname, '.'),
        }
      }
    };
});

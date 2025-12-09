import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  build: {
    outDir: 'dist',
    chunkSizeWarningLimit: 1600, // Increased limit to suppress PDF lib warnings
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules')) {
            if (id.includes('jspdf') || id.includes('html2canvas')) {
              return 'pdf-libs';
            }
            if (id.includes('@supabase')) {
              return 'supabase';
            }
            return 'vendor'; // Split other node_modules into vendor
          }
        },
      },
    },
  },
});

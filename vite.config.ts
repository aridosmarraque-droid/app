import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  build: {
    outDir: 'dist',
    chunkSizeWarningLimit: 2000,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules')) {
            // Keep PDF libs separate as they are heavy
            if (id.includes('jspdf') || id.includes('html2canvas')) {
              return 'pdf-libs';
            }
            // Bundle everything else (including Supabase) into vendor 
            // to ensure correct initialization order.
            return 'vendor';
          }
        },
      },
    },
  },
});

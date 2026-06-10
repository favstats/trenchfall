import {defineConfig} from 'vite';

export default defineConfig({
  base:'./',
  publicDir:false,
  build: {
    chunkSizeWarningLimit: 700,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('/node_modules/three/')) return 'three';
          if (id.includes('/node_modules/')) return 'vendor';
        },
      },
    },
  },
});

import {defineConfig} from 'vite';

export default defineConfig({
  base:'./',
  publicDir:false,
  build: {
    chunkSizeWarningLimit: 700,
    rollupOptions: {
      input: {
        index: 'index.html',
        trenchfall: 'trenchfall.html',
        campaign: 'campaign.html',
        skirmish: 'skirmish.html',
        classic: 'index-classic.html',
        kestrel: 'kestrel.html',
        winterfell: 'winterfell.html',
        hadal: 'hadal.html',
        noclip: 'noclip.html',
        bannerfall: 'bannerfall.html',
        deadweight: 'deadweight.html',
      },
      output: {
        manualChunks(id) {
          if (id.includes('/node_modules/three/')) return 'three';
          if (id.includes('/node_modules/')) return 'vendor';
        },
      },
    },
  },
});

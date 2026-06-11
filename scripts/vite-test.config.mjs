/* test-server config: no HMR, no file watching — a page that survives
   another session editing src/main.js mid-test */
import {defineConfig} from 'vite';

export default defineConfig({
  base:'./',
  publicDir:false,
  server:{hmr:false, watch:null},
});

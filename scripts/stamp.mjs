// Stamp the module URL so browsers can never serve a stale (or poisoned) build.
import {readFileSync,writeFileSync} from 'node:fs';
const p=new URL('../index.html',import.meta.url);
let s=readFileSync(p,'utf8');
const v=Math.floor(Date.now()/1000).toString(36);
s=s.replace(/src\/main\.js(\?v=[a-z0-9]*)?/,'src/main.js?v='+v);
writeFileSync(p,s);
console.log('stamped v='+v);

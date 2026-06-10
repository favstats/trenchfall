// Boot smoke test: executes src/main.js's module-load phase under stubs.
// Catches the "menu renders but nothing works" class that static checks miss.
import {readFileSync,writeFileSync} from 'node:fs';

const anyProxy=()=>new Proxy(function(){},{
  get:(t,p)=>{
    if(p===Symbol.toPrimitive)return()=>0;
    if(p==='length'||p==='width'||p==='height')return 64;
    return anyProxy();},
  apply:()=>anyProxy(),
  construct:()=>anyProxy(),
  set:()=>true,
});
const ctx2d=()=>anyProxy();

const el=()=>({style:{},classList:{add(){},remove(){},toggle(){},contains:()=>false},
  appendChild(){},addEventListener(){},removeEventListener(){},querySelector:()=>el(),
  querySelectorAll:()=>[],getContext:ctx2d,width:64,height:64,textContent:'',innerHTML:'',
  setAttribute(){},remove(){},focus(){},dataset:{},firstElementChild:null,children:[],childElementCount:0});
globalThis.document={createElement:()=>el(),getElementById:()=>el(),body:el(),
  addEventListener(){},exitPointerLock(){},querySelector:()=>el(),querySelectorAll:()=>[],
  visibilityState:'visible',pointerLockElement:null};
globalThis.window=globalThis;
globalThis.localStorage={getItem:()=>null,setItem(){},removeItem(){}};
try{globalThis.navigator={userAgent:'smoke',hardwareConcurrency:8};}
catch(e){Object.defineProperty(globalThis,'navigator',{value:{userAgent:'smoke',hardwareConcurrency:8},configurable:true});}
globalThis.__frameCbs=[];globalThis.requestAnimationFrame=cb=>{globalThis.__frameCbs.push(cb);return 0;};
globalThis.performance=globalThis.performance||{now:()=>0};
globalThis.AudioContext=function(){return anyProxy();};
globalThis.webkitAudioContext=globalThis.AudioContext;
globalThis.fetch=()=>new Promise(()=>{});
globalThis.innerWidth=1280;globalThis.innerHeight=720;
globalThis.addEventListener=()=>{};globalThis.removeEventListener=()=>{};
globalThis.location={href:'',search:''};
globalThis.Audio=function(){return {play(){},addEventListener(){}};};
globalThis.Image=function(){return {addEventListener(){}}};
globalThis.cancelAnimationFrame=()=>{};
globalThis.devicePixelRatio=1;
globalThis.setTimeout=globalThis.setTimeout;

let src=readFileSync(new URL('../src/main.js',import.meta.url),'utf8');
// stub the GL-heavy constructs; everything else runs for real
src=src.replace(/import\s*\{[^}]*EffectComposer[^}]*\}\s*from[^;]+;/,'');
src=src.replace(/import\s*\{\s*SFX_ASSETS\s*\}\s*from[^;]+;/,'const SFX_ASSETS={};');
src=src.replace(/import\s*\{[^}]*RenderPass[^}]*\}\s*from[^;]+;/,'');
src=src.replace(/import\s*\{[^}]*UnrealBloomPass[^}]*\}\s*from[^;]+;/,'');
src=src.replace(/import\s*\{[^}]*ShaderPass[^}]*\}\s*from[^;]+;/,'');
src=src.replace(/import\s*\{[^}]*OutputPass[^}]*\}\s*from[^;]+;/,'');
src=src.replace(/import\s*\{[^}]*GTAOPass[^}]*\}\s*from[^;]+;/,'');
src=`const __glstub=()=>new Proxy(function(){},{get:(t,p)=>p===Symbol.toPrimitive?()=>0:__glstub(),apply:()=>__glstub(),construct:()=>__glstub(),set:()=>true});
const EffectComposer=__glstub(),RenderPass=__glstub(),UnrealBloomPass=__glstub(),ShaderPass=__glstub(),OutputPass=__glstub(),GTAOPass=__glstub();
`+src;
src=src.replace(/new THREE\.WebGLRenderer\([\s\S]*?\}\)/,'(globalThis.__rstub())');
src=`globalThis.__rstub=()=>{const fixed={domElement:{addEventListener(){},style:{}},shadowMap:{},
  capabilities:{getMaxAnisotropy:()=>8,isWebGL2:true},
  getPixelRatio:()=>1,getSize:(v)=>v?v.set(1280,720):{width:1280,height:720}};
  return new Proxy(fixed,{get:(t,p)=>p in t?t[p]:(typeof p==='string'?()=>null:undefined),set:()=>true});};
`+src;
const tmp=new URL('../.boot-smoke-tmp.mjs',import.meta.url);
writeFileSync(tmp,src);
try{
  await import(tmp);
  console.log('BOOT OK: module load phase completed');
  globalThis.performance.now=()=>16.7;
  for(let f=0;f<3;f++){
    const cbs=globalThis.__frameCbs.splice(0);
    for(const cb of cbs)cb(16.7*(f+1));
  }
  console.log('FRAME OK: first frames completed');
}catch(e){
  console.error('BOOT CRASH:',e.message);
  const m=(e.stack||'').split('\n').find(l=>l.includes('.boot-smoke-tmp'));
  if(m)console.error(' at',m.trim());
  process.exit(1);
}

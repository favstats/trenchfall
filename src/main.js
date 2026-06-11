import * as THREE from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import {EffectComposer} from 'three/addons/postprocessing/EffectComposer.js';
import {RenderPass} from 'three/addons/postprocessing/RenderPass.js';
import {UnrealBloomPass} from 'three/addons/postprocessing/UnrealBloomPass.js';
import {ShaderPass} from 'three/addons/postprocessing/ShaderPass.js';
import {OutputPass} from 'three/addons/postprocessing/OutputPass.js';
import {GTAOPass} from 'three/addons/postprocessing/GTAOPass.js';
import {SFX_ASSETS} from './audio/sfxManifest.js';

/* ============================================================
   TRENCHFALL, first-person trench-defense
   Deformable terrain · supply convoys · turrets · the horde
   ============================================================ */
const TAU=Math.PI*2;
const clamp=(v,a,b)=>v<a?a:v>b?b:v;
const lerp=(a,b,t)=>a+(b-a)*t;
const rand=(a=1,b)=>b===undefined?Math.random()*a:a+Math.random()*(b-a);
const pick=arr=>arr[Math.floor(Math.random()*arr.length)];
const $=id=>document.getElementById(id);
/* ---- the field radio: words arrive like people, not like logs ---- */
const compassEl=document.createElement('div');compassEl.id='compass';document.body.appendChild(compassEl);
let horizonBand=null;
const sayWrap=document.createElement('div');sayWrap.id='sayWrap';document.body.appendChild(sayWrap);
const sayQueue=[];let sayBusy=0;
function say(name,text,hold=4200){
  sayQueue.push({name,text,hold});
  pumpSay();
}
function pumpSay(){
  if(sayWrap.children.length>=3||!sayQueue.length)return;
  const{name,text,hold}=sayQueue.shift();
  const d=document.createElement('div');d.className='say';
  d.innerHTML='<div class="av">'+(name[0]||'?')+'</div><div class="nm">'+name+'</div><div class="tx"></div>';
  sayWrap.appendChild(d);
  const tx=d.querySelector('.tx');let i=0;   // teletype reveal
  const iv=setInterval(()=>{tx.textContent=text.slice(0,i+=2);if(i>=text.length)clearInterval(iv);},16);
  setTimeout(()=>{d.classList.add('bye');setTimeout(()=>{d.remove();pumpSay();},420);},hold);
}


/* ---- seeded RNG: the campaign's dice. Same seed, same world. ---- */
let SEED=1;
function setSeed(s){SEED=(s>>>0)||1;}
function srnd(){let t=SEED+=0x6D2B79F5;t=Math.imul(t^t>>>15,t|1);t^=t+Math.imul(t^t>>>7,t|61);return((t^t>>>14)>>>0)/4294967296;}
const srand=(a=1,b)=>b===undefined?srnd()*a:a+srnd()*(b-a);
const spick=arr=>arr[Math.floor(srnd()*arr.length)];
let HSALT=0;   // world salt: re-rolls the terrain noise field per leg
const WANDER={on:false,road:false,t:0,loot:[],spawnT:6,kills0:0,region:1,story:[],sites:[],hermit:null}; // declared early: worldgen consults it at boot

/* ---------------- renderer / scene ---------------- */
const renderer=new THREE.WebGLRenderer({canvas:$('gl'),antialias:true});
renderer.setPixelRatio(Math.min(devicePixelRatio,1.25));
renderer.setSize(innerWidth,innerHeight);
renderer.shadowMap.enabled=true;
renderer.shadowMap.type=THREE.PCFSoftShadowMap;
renderer.toneMapping=THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure=1.06;
const scene=new THREE.Scene();
const camera=new THREE.PerspectiveCamera(72,innerWidth/innerHeight,.08,460);
camera.rotation.order='YXZ';
addEventListener('resize',()=>{camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();
  renderer.setSize(innerWidth,innerHeight)});

const hemi=new THREE.HemisphereLight(0x9aa5c0,0x4a4434,.6);scene.add(hemi);
const sun=new THREE.DirectionalLight(0xffb070,2.7);
sun.position.set(-70,80,-40);
sun.castShadow=true;
sun.shadow.mapSize.set(2048,2048);
sun.shadow.camera.left=-46;sun.shadow.camera.right=46;
sun.shadow.camera.top=46;sun.shadow.camera.bottom=-46;
sun.shadow.camera.far=320;sun.shadow.bias=-0.0005;
sun.shadow.normalBias=.02;sun.shadow.radius=5;
scene.add(sun);scene.add(sun.target);
const softDot=(()=>{
  const c=document.createElement('canvas');c.width=c.height=32;
  const g=c.getContext('2d');
  const rg=g.createRadialGradient(16,16,1,16,16,15);
  rg.addColorStop(0,'rgba(255,255,255,1)');rg.addColorStop(.55,'rgba(255,255,255,.6)');rg.addColorStop(1,'rgba(255,255,255,0)');
  g.fillStyle=rg;g.fillRect(0,0,32,32);
  return new THREE.CanvasTexture(c);
})();
// the sun has a body: an HDR core that blooms, a halo that breathes
const sunDisc=new THREE.Sprite(new THREE.SpriteMaterial({
  map:softDot,transparent:true,opacity:.9,fog:false,depthWrite:false}));
sunDisc.material.color.setRGB(14,9,4.5);
sunDisc.scale.setScalar(26);
const sunHalo=new THREE.Sprite(new THREE.SpriteMaterial({
  map:softDot,transparent:true,opacity:.32,fog:false,depthWrite:false,
  blending:THREE.AdditiveBlending}));
sunHalo.material.color.setRGB(3.2,2.1,1.1);
sunHalo.scale.setScalar(95);
scene.add(sunDisc);scene.add(sunHalo);
const moonDisc=new THREE.Sprite(new THREE.SpriteMaterial({
  map:softDot,transparent:true,opacity:0,fog:false,depthWrite:false}));
moonDisc.material.color.setRGB(2.1,2.25,2.6);
moonDisc.scale.setScalar(17);
const moonHalo=new THREE.Sprite(new THREE.SpriteMaterial({
  map:softDot,transparent:true,opacity:0,fog:false,depthWrite:false,
  blending:THREE.AdditiveBlending}));
moonHalo.material.color.setRGB(.5,.58,.8);
moonHalo.scale.setScalar(55);
scene.add(moonDisc);scene.add(moonHalo);
const rim=new THREE.DirectionalLight(0x7a93c8,.45);   // cool back-light for silhouettes
rim.position.set(60,40,70);scene.add(rim);
const DUSK={fog:new THREE.Color(0x70755c),sun:new THREE.Color(0xffb070),sunI:3.1,hemiI:.6};   // sky fill: real shade is never black
const NIGHT={fog:new THREE.Color(0x131826),sun:new THREE.Color(0x8fa6d8),sunI:1.15,hemiI:.4};
scene.fog=new THREE.Fog(0x70755c,34,150);   // luminous mist: the world dissolves into light

/* sky dome: gradient + stars + blood moon */
const skyMat=new THREE.ShaderMaterial({side:THREE.BackSide,depthWrite:false,
  uniforms:{nightF:{value:0},time:{value:0},flash:{value:0},cover:{value:.15},aurora:{value:0}},
  vertexShader:`varying vec3 vP;void main(){vP=position;
    gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
  fragmentShader:`
    varying vec3 vP;uniform float nightF;uniform float time;uniform float flash;uniform float cover;uniform float aurora;
    float hash(vec3 p){return fract(sin(dot(p,vec3(12.9898,78.233,45.164)))*43758.5453);}
    float vnoise(vec2 p){
      vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);
      float a=hash(vec3(i,7.)),b=hash(vec3(i+vec2(1,0),7.)),
            c=hash(vec3(i+vec2(0,1),7.)),d=hash(vec3(i+vec2(1,1),7.));
      return mix(mix(a,b,f.x),mix(c,d,f.x),f.y);
    }
    float fbm(vec2 p){float v=0.,a=.5;
      for(int i=0;i<4;i++){v+=a*vnoise(p);p=p*2.13+11.7;a*=.5;}return v;}
    void main(){
      vec3 d=normalize(vP);
      float h=clamp(d.y,0.,1.);
      vec3 top=mix(vec3(.05,.058,.088),vec3(.015,.025,.06),nightF);
      vec3 hor=mix(vec3(.46,.47,.36),vec3(.075,.095,.16),nightF);
      vec3 col=mix(hor,top,pow(h,.5));
      // rolling cloud deck
      float cm=0.;
      if(d.y>.02){
        vec2 cuv=d.xz/(d.y+.22)*1.15+vec2(time*.0065,time*.0022);
        float cl=fbm(cuv);
        cm=smoothstep(.62-cover*.34,.86-cover*.3,cl)*smoothstep(.02,.2,d.y);
      }
      vec3 cloudCol=mix(vec3(.115,.09,.105),vec3(.035,.04,.065),nightF);
      vec3 md=normalize(vec3(-.45,.40,-.6));
      cloudCol+=vec3(.45,.16,.09)*pow(max(dot(d,md),0.),10.)*.4;
      col=mix(col,cloudCol,cm*.9);
      // stars (occluded by clouds)
      vec3 sd=floor(d*260.);
      float s=hash(sd);
      float tw=.6+.4*sin(time*2.5+s*40.);
      col+=vec3(.9,.92,1.)*step(.9986,s)*smoothstep(.08,.4,d.y)*nightF*tw*(1.-cm);
      // blood moon
      float m=dot(d,md);
      col+=vec3(1.1,.36,.2)*smoothstep(.99955,.99985,m)*(.35+.85*nightF)*(1.-cm*.85);
      col+=vec3(.5,.13,.08)*pow(max(m,0.),90.)*.32*(.3+.7*nightF)*(1.-cm*.6);
      // aurora: the cold sky keeps its own slow fire
      if(aurora>.01&&nightF>.35&&d.y>.04){
        float lon=atan(d.x,d.z);
        float curt=vnoise(vec2(lon*2.2+time*.045,d.y*1.3));
        float curt2=vnoise(vec2(lon*5.1-time*.06,d.y*2.6+3.7));
        float aw=pow(max(curt*.6+curt2*.4-.30,0.)*2.1,2.0);
        float vert=smoothstep(.04,.22,d.y)*smoothstep(1.,.45,d.y);
        col+=(vec3(.12,.9,.5)*aw+vec3(.45,.15,.75)*aw*aw)
             *vert*aurora*smoothstep(.35,.7,nightF)*2.4*(1.-cm);
      }
      // lightning lights the clouds from within
      col+=flash*vec3(.45,.5,.66)*(1.+cm*2.2);
      gl_FragColor=vec4(col,1.);
    }`});
const sky=new THREE.Mesh(new THREE.SphereGeometry(400,24,16),skyMat);
sky.frustumCulled=false;scene.add(sky);

/* image-based lighting: bake the sky into a PMREM env map so every PBR
   surface picks up sky bounce + reflections; re-baked as night falls */
const pmrem=new THREE.PMREMGenerator(renderer);
const envScene=new THREE.Scene();
envScene.add(new THREE.Mesh(new THREE.SphereGeometry(50,16,12),skyMat));
let envRT=null,envBakedNf=-1;
/* a dead city on every horizon: silhouettes that ignore the fog */
{
  const c=document.createElement('canvas');c.width=2048;c.height=160;
  const g=c.getContext('2d');
  g.fillStyle='rgba(0,0,0,0)';g.clearRect(0,0,2048,160);
  let x=0;
  while(x<2048){
    if(Math.random()<.22){x+=20+Math.random()*70;continue;}    // gaps where the city already fell
    const w=14+Math.random()*46, h=22+Math.random()*95;
    g.fillStyle='rgba(12,11,9,'+(0.75+Math.random()*.25)+')';
    g.fillRect(x,160-h,w,h);
    // ruined rooflines: bites taken out of the top
    g.clearRect(x+Math.random()*w*.6,160-h-2,3+Math.random()*w*.4,4+Math.random()*16);
    if(Math.random()<.3)g.fillRect(x+w*.3,160-h-10-Math.random()*16,3,12+Math.random()*16); // a spire or a chimney
    if(Math.random()<.12){ // one window still burning, somehow
      g.fillStyle='rgba(255,150,60,.8)';
      g.fillRect(x+4+Math.random()*(w-8),160-h+6+Math.random()*(h-14),2,3);
    }
    x+=w+(Math.random()<.5?2:8);
  }
  const tex=new THREE.CanvasTexture(c);
  tex.wrapS=THREE.RepeatWrapping;tex.repeat.set(3,1);
  const m=new THREE.Mesh(
    new THREE.CylinderGeometry(385,385,46,48,1,true),
    new THREE.MeshBasicMaterial({map:tex,transparent:true,side:THREE.BackSide,
      fog:false,depthWrite:false,color:0x1a1a16}));
  m.position.y=14;m.renderOrder=-1;
  scene.add(m);
  envScene.add(m.clone()); // the skyline belongs in the reflections too
  { // the horizon band: dark distant land under the skyline, so the world never shows its edge
    horizonBand=new THREE.Mesh(
      new THREE.CylinderGeometry(382,382,110,48,1,true),
      new THREE.MeshBasicMaterial({color:0x12150d,side:THREE.BackSide,fog:true}));
    horizonBand.position.y=-44;horizonBand.renderOrder=-2;
    scene.add(horizonBand);
  }
}
/* far ranges: where the country is rugged, the horizon grows teeth */
const mountainRing=(()=>{
  const c=document.createElement('canvas');c.width=2048;c.height=220;
  const g=c.getContext('2d');
  for(const[base,amp,col]of[[150,95,'rgba(34,40,52,.95)'],[180,60,'rgba(22,27,36,.95)']]){
    g.fillStyle=col;
    g.beginPath();g.moveTo(0,220);
    let y=base-Math.random()*amp*.5;
    for(let x=0;x<=2048;x+=16){
      y+=rand(-14,14);
      y=clamp(y,220-base-amp,220-base+amp*.4);
      g.lineTo(x,y);
      if(Math.random()<.12)y=220-base-amp*Math.random();  // a sudden peak
    }
    g.lineTo(2048,220);g.closePath();g.fill();
  }
  // snow on the highest shoulders
  const img=g.getImageData(0,0,2048,220),d2=img.data;
  for(let x=0;x<2048;x++)for(let y2=0;y2<70;y2++){
    const i=(y2*2048+x)*4;
    if(d2[i+3]>0&&Math.random()<.5){d2[i]=170;d2[i+1]=180;d2[i+2]=198;}
  }
  g.putImageData(img,0,0);
  const tex=new THREE.CanvasTexture(c);
  tex.wrapS=THREE.RepeatWrapping;tex.repeat.set(2,1);
  const m=new THREE.Mesh(
    new THREE.CylinderGeometry(390,390,64,48,1,true),
    new THREE.MeshBasicMaterial({map:tex,transparent:true,side:THREE.BackSide,
      fog:false,depthWrite:false,color:0x586274}));
  m.position.y=22;m.renderOrder=-2;m.visible=false;
  scene.add(m);
  return m;
})();

function bakeEnv(nf){
  if(Math.abs(nf-envBakedNf)<.07&&envRT)return;
  envBakedNf=nf;
  const old=envRT;
  envRT=pmrem.fromScene(envScene,.04);
  scene.environment=envRT.texture;
  if(old)old.dispose();
}

/* ---------------- post-processing: GTAO + bloom + cinematic grade ---------------- */
const composer=new EffectComposer(renderer,
  new THREE.WebGLRenderTarget(innerWidth,innerHeight,{samples:2,type:THREE.HalfFloatType}));
composer.addPass(new RenderPass(scene,camera));
/* ground-truth ambient occlusion, contact shadows in every trench fold.
   Runs at 55% resolution: the denoiser hides it, the GPU thanks us. */
const gtaoPass=new GTAOPass(scene,camera,innerWidth,innerHeight);
gtaoPass.output=GTAOPass.OUTPUT.Default;
gtaoPass.blendIntensity=.9;
{
  const baseSetSize=gtaoPass.setSize.bind(gtaoPass);
  gtaoPass.setSize=(w,h)=>baseSetSize(Math.round(w*.55),Math.round(h*.55));
  gtaoPass.setSize(innerWidth,innerHeight);
}
gtaoPass.updateGtaoMaterial({radius:.55,distanceExponent:1.2,thickness:1,scale:1.6,
  samples:8,distanceFallOff:1,screenSpaceRadius:false});
gtaoPass.updatePdMaterial({lumaPhi:10,depthPhi:2,normalPhi:3,radius:4,radiusExponent:1,rings:2,samples:8});
composer.addPass(gtaoPass);
const bloomPass=new UnrealBloomPass(new THREE.Vector2(innerWidth/2,innerHeight/2),.6,.72,.78);
composer.addPass(bloomPass);
composer.addPass(new OutputPass());
const gradePass=new ShaderPass({
  uniforms:{tDiffuse:{value:null},time:{value:0},heat:{value:0},tint:{value:new THREE.Vector3(1,1,1)},
    px:{value:new THREE.Vector2(1/1280,1/720)},
    sunPos:{value:new THREE.Vector2(.5,.8)},rayI:{value:0},rayCol:{value:new THREE.Vector3(1,.5,.3)}},
  vertexShader:`varying vec2 vUv;void main(){vUv=uv;
    gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
  fragmentShader:`varying vec2 vUv;uniform sampler2D tDiffuse;uniform float time;uniform vec3 tint;
    uniform vec2 px;uniform vec2 sunPos;uniform float rayI;uniform vec3 rayCol;uniform float heat;
    void main(){
      vec2 uv=vUv,cc=uv-.5;float rd=dot(cc,cc);
      // heat shimmer: the hardpan bends the air above it
      if(heat>.001){
        float hb=smoothstep(.78,.5,uv.y)*smoothstep(.08,.3,uv.y);
        uv+=vec2(sin(uv.y*230.+time*12.)*.0016,cos(uv.x*190.-time*10.)*.0011)*hb*heat;
      }
      // chromatic aberration toward frame edges
      vec3 col;
      col.r=texture2D(tDiffuse,uv+cc*rd*.009).r;
      col.g=texture2D(tDiffuse,uv).g;
      col.b=texture2D(tDiffuse,uv-cc*rd*.009).b;
      // contrast-adaptive sharpen: the crisp "rendered at higher res" look
      vec3 n1=texture2D(tDiffuse,uv+vec2(px.x,0.)).rgb,n2=texture2D(tDiffuse,uv-vec2(px.x,0.)).rgb,
           n3=texture2D(tDiffuse,uv+vec2(0.,px.y)).rgb,n4=texture2D(tDiffuse,uv-vec2(0.,px.y)).rgb;
      col=clamp(col+(col*4.-n1-n2-n3-n4)*.14,0.,1.);
      // screen-space god rays from the dying sun / blood moon
      if(rayI>0.001){
        vec2 d=(sunPos-uv)*(1.0/28.0);
        vec2 p=uv;float fall=1.;vec3 acc=vec3(0.);
        for(int i=0;i<28;i++){
          p+=d;fall*=.94;
          vec3 s=texture2D(tDiffuse,clamp(p,0.,1.)).rgb;
          acc+=max(s-.42,0.)*fall;
        }
        float sd=length((sunPos-uv)*vec2(1.78,1.));
        col+=acc*(1.0/28.0)*rayCol*rayI*2.6*smoothstep(1.35,.15,sd);
        // lens flare: ghost chain + anamorphic streak, driven by what the lens actually sees
        vec2 asp=vec2(px.y/px.x,1.);
        vec3 sb=texture2D(tDiffuse,sunPos).rgb
               +texture2D(tDiffuse,sunPos+vec2(px.x*5.,0.)).rgb
               +texture2D(tDiffuse,sunPos-vec2(px.x*5.,0.)).rgb
               +texture2D(tDiffuse,sunPos+vec2(0.,px.y*5.)).rgb
               +texture2D(tDiffuse,sunPos-vec2(0.,px.y*5.)).rgb;
        float bri=smoothstep(2.8,4.6,dot(sb,vec3(.299,.587,.114)));
        if(bri>0.002){
          vec2 v=vec2(.5)-sunPos;vec3 fc=vec3(0.);vec2 dd;float ds;
          dd=(uv-(sunPos+v*.62))*asp;ds=dot(dd,dd);
          fc+=vec3(.9,.5,.3)*exp(-ds*900.)*.42;
          dd=(uv-(sunPos+v*1.3))*asp;ds=dot(dd,dd);
          fc+=vec3(.38,.6,.42)*exp(-ds*2400.)*.36;
          dd=(uv-(sunPos+v*1.85))*asp;ds=dot(dd,dd);
          fc+=vec3(.3,.42,.8)*exp(-ds*420.)*.3;
          dd=(uv-(sunPos+v*2.5))*asp;ds=dot(dd,dd);
          fc+=vec3(.85,.32,.18)*exp(-ds*1600.)*.26;
          dd=(uv-sunPos)*asp;
          fc+=vec3(.4,.58,1.)*exp(-abs(dd.y)*95.)*exp(-abs(dd.x)*4.2)*.8;
          col+=fc*bri*min(rayI,1.);
        }
      }
      // filmic split-tone: cool shadows, warm highlights
      float l=dot(col,vec3(.299,.587,.114));
      col=mix(col,col*vec3(.86,1.02,1.12),(1.-smoothstep(.15,.55,l))*.38);
      col=mix(col,col*vec3(1.10,1.02,.88),smoothstep(.45,.95,l)*.32);
      // animated film grain (luma-weighted: heavier in shadows)
      float g=fract(sin(dot(uv+fract(time*7.),vec2(12.9898,78.233)))*43758.5453);
      col+=(g-.5)*.05*(1.-l*.6);
      col*=tint;
      col*=1.-rd*.95;
      gl_FragColor=vec4(col,1.);
    }`});
composer.addPass(gradePass);
addEventListener('resize',()=>{composer.setSize(innerWidth,innerHeight);
  gradePass.uniforms.px.value.set(1/innerWidth,1/innerHeight);});
gradePass.uniforms.px.value.set(1/innerWidth,1/innerHeight);
/* project the celestial glow (sky shader places it along md) into screen space */
const _sunDir=new THREE.Vector3(-.45,.40,-.6).normalize();
const _sunP=new THREE.Vector3();
function updateGodrays(nf,flash){
  _sunP.copy(_sunDir).multiplyScalar(300).add(camera.position).project(camera);
  const on=_sunP.z<1&&_sunP.x>-1.4&&_sunP.x<2.4&&_sunP.y>-1.4&&_sunP.y<2.4;
  gradePass.uniforms.sunPos.value.set(_sunP.x*.5+.5,_sunP.y*.5+.5);
  gradePass.uniforms.rayI.value=on?(.46+.24*nf+flash*1.6):0;
  const rc=gradePass.uniforms.rayCol.value;
  rc.set(lerp(1,.45,nf),lerp(.42,.55,nf),lerp(.22,.9,nf)); // amber dusk → cold moonlight
}

/* ---------------- audio ---------------- */
const AU={ctx:null,master:null,muted:false,hordeG:null,banks:{},assetsLoading:null,assetsReady:false,assetErrors:0};
function audioInit(){
  if(AU.ctx)return;
  const C=new (window.AudioContext||window.webkitAudioContext)();
  AU.ctx=C;AU.master=C.createGain();AU.master.gain.value=.5;
  // glue compressor: the difference between beeps and a battlefield
  AU.comp=C.createDynamicsCompressor();
  AU.comp.threshold.value=-18;AU.comp.knee.value=22;AU.comp.ratio.value=7;
  AU.comp.attack.value=.002;AU.comp.release.value=.16;
  AU.master.connect(AU.comp);AU.comp.connect(C.destination);
  // battlefield reverb: a procedurally rolled impulse response, long and open
  const ir=C.createBuffer(2,C.sampleRate*1.05|0,C.sampleRate);
  for(let ch=0;ch<2;ch++){const d=ir.getChannelData(ch);
    for(let i=0;i<d.length;i++){const t=i/d.length;
      d[i]=(Math.random()*2-1)*Math.pow(1-t,3.4)*(ch?.85:1)*(1-Math.exp(-t*70));}}
  AU.verb=C.createConvolver();AU.verb.buffer=ir;
  AU.verbG=C.createGain();AU.verbG.gain.value=.3;
  AU.verb.connect(AU.verbG);AU.verbG.connect(AU.comp);
  // surf: only the grey shore turns this up
  {
    const srf=C.createBufferSource();
    AU.surfReady=()=>{};
  }
  const buf=C.createBuffer(1,C.sampleRate*2,C.sampleRate);
  const d=buf.getChannelData(0);for(let i=0;i<d.length;i++)d[i]=Math.random()*2-1;
  AU.noise=buf;
  const src=C.createBufferSource();src.buffer=buf;src.loop=true;
  const f=C.createBiquadFilter();f.type='lowpass';f.frequency.value=240;f.Q.value=.4;
  const g=C.createGain();g.gain.value=.016;
  const lfo=C.createOscillator();lfo.frequency.value=.06;
  const lg=C.createGain();lg.gain.value=110;
  lfo.connect(lg);lg.connect(f.frequency);lfo.start();
  src.connect(f);f.connect(g);g.connect(AU.master);src.start();
  // horde dread-drone: swells with the living dead
  const hd=C.createOscillator();hd.type='sawtooth';hd.frequency.value=37;
  const hd2=C.createOscillator();hd2.type='sawtooth';hd2.frequency.value=37.6;
  const hf=C.createBiquadFilter();hf.type='lowpass';hf.frequency.value=110;
  AU.hordeG=C.createGain();AU.hordeG.gain.value=0;
  hd.connect(hf);hd2.connect(hf);hf.connect(AU.hordeG);AU.hordeG.connect(AU.master);
  hd.start();hd2.start();
  // surf bed for the grey shore
  {
    const ss=C.createBufferSource();ss.loop=true;
    const sf=C.createBiquadFilter();sf.type='lowpass';sf.frequency.value=420;
    AU.surfG=C.createGain();AU.surfG.gain.value=0;
    const slfo=C.createOscillator();slfo.frequency.value=.13;
    const slg=C.createGain();slg.gain.value=.013;
    slfo.connect(slg);slg.connect(AU.surfG.gain);slfo.start();
    ss.connect(sf);sf.connect(AU.surfG);AU.surfG.connect(AU.master);
    setTimeout(()=>{ss.buffer=AU.noise;ss.start();},50);
  }
  // rain hiss
  const rs=C.createBufferSource();rs.buffer=buf;rs.loop=true;
  const rf=C.createBiquadFilter();rf.type='bandpass';rf.frequency.value=1050;rf.Q.value=.45;
  const rf2=C.createBiquadFilter();rf2.type='lowpass';rf2.frequency.value=2400;
  AU.rainG=C.createGain();AU.rainG.gain.value=0;
  const rlfo=C.createOscillator();rlfo.frequency.value=.21;   // rain breathes in sheets
  const rlg=C.createGain();rlg.gain.value=.0035;
  rlfo.connect(rlg);rlg.connect(AU.rainG.gain);rlfo.start();
  rs.connect(rf);rf.connect(rf2);rf2.connect(AU.rainG);AU.rainG.connect(AU.master);rs.start();
  loadAudioAssets();
}
async function loadAudioAssets(){
  if(!AU.ctx||AU.assetsLoading)return AU.assetsLoading;
  const C=AU.ctx;
  AU.banks={};
  const jobs=[];
  for(const[bank,urls]of Object.entries(SFX_ASSETS)){
    AU.banks[bank]=[];
    for(const url of urls)jobs.push(fetch(url)
      .then(r=>{if(!r.ok)throw new Error(r.status+' '+url);return r.arrayBuffer();})
      .then(b=>C.decodeAudioData(b))
      .then(buf=>AU.banks[bank].push(buf))
      .catch(e=>{AU.assetErrors++;console.warn('Audio asset failed:',e.message||e);}));
  }
  AU.assetsLoading=Promise.all(jobs).then(()=>{AU.assetsReady=true;return AU.banks;});
  return AU.assetsLoading;
}
function playSampleBuffer(buf,o={}){
  const C=AU.ctx;if(!C||AU.muted||!buf)return false;
  const t=C.currentTime+(o.delay||0);
  const src=C.createBufferSource();src.buffer=buf;
  src.playbackRate.value=Math.max(.25,(o.pitch??1)+rand(-(o.pitchVar??.045),o.pitchVar??.045));
  const g=C.createGain();
  const vol=o.vol??1;
  g.gain.setValueAtTime(0,t);
  g.gain.linearRampToValueAtTime(vol,t+.008);
  if(o.fade){
    g.gain.setValueAtTime(vol,t+o.fade[0]);
    g.gain.exponentialRampToValueAtTime(.0001,t+o.fade[1]);
  }
  let node=g;
  if(o.filter){
    const f=C.createBiquadFilter();f.type=o.filter.type||'lowpass';
    f.frequency.value=o.filter.freq||1200;f.Q.value=o.filter.q??.7;
    g.connect(f);node=f;
  }
  node.connect(AU.master);
  if(AU.verb&&(o.verb??.1)>0){const send=C.createGain();send.gain.value=o.verb??.1;node.connect(send);send.connect(AU.verb);}
  src.connect(g);src.start(t);
  if(o.stop)src.stop(t+o.stop);
  return true;
}
function playBank(bank,o={}){
  const bufs=AU.banks[bank];
  if(!bufs||!bufs.length)return false;
  return playSampleBuffer(pick(bufs),o);
}
function playBanks(layers){
  let ok=false;
  for(const layer of layers)ok=playBank(layer[0],layer[1])||ok;
  return ok;
}
function sNoise(dur,type,f0,f1,vol,t0){
  const C=AU.ctx;if(!C||AU.muted)return;const t=t0||C.currentTime;
  const s=C.createBufferSource();s.buffer=AU.noise;s.loop=true;
  const f=C.createBiquadFilter();f.type=type;
  f.frequency.setValueAtTime(f0,t);f.frequency.exponentialRampToValueAtTime(Math.max(30,f1),t+dur);
  const g=C.createGain();g.gain.setValueAtTime(vol,t);g.gain.exponentialRampToValueAtTime(.0001,t+dur);
  s.connect(f);f.connect(g);g.connect(AU.master);
  if(AU.verb){const vs=C.createGain();vs.gain.value=.12;g.connect(vs);vs.connect(AU.verb);}
  s.start(t);s.stop(t+dur+.05);
}
function sTone(type,f0,f1,dur,vol,t0){
  const C=AU.ctx;if(!C||AU.muted)return;const t=t0||C.currentTime;
  const o=C.createOscillator();o.type=type;
  o.frequency.setValueAtTime(f0,t);o.frequency.exponentialRampToValueAtTime(Math.max(20,f1),t+dur);
  const g=C.createGain();g.gain.setValueAtTime(0,t);g.gain.linearRampToValueAtTime(vol,t+.01);
  g.gain.exponentialRampToValueAtTime(.0001,t+dur);
  o.connect(g);g.connect(AU.master);
  if(AU.verb){const vs=C.createGain();vs.gain.value=.08;g.connect(vs);vs.connect(AU.verb);}
  o.start(t);o.stop(t+dur+.06);
}
/* layered gunshot: transient snap, body thump, powder crack, room tail */
function gunshot(o){
  const C=AU.ctx;if(!C||AU.muted)return;const t=C.currentTime;
  const out=C.createGain();out.gain.value=o.vol??1;out.connect(AU.master);
  const send=C.createGain();send.gain.value=.32;out.connect(send);send.connect(AU.verb);
  const o1=C.createOscillator();o1.type='square';
  o1.frequency.setValueAtTime(2600*o.pitch,t);
  o1.frequency.exponentialRampToValueAtTime(900*o.pitch,t+.012);
  const g1=C.createGain();g1.gain.setValueAtTime(.5*o.crack,t);
  g1.gain.exponentialRampToValueAtTime(.001,t+.018);
  o1.connect(g1);g1.connect(out);o1.start(t);o1.stop(t+.03);
  const o2=C.createOscillator();o2.type='sine';
  o2.frequency.setValueAtTime(150*o.pitch,t);
  o2.frequency.exponentialRampToValueAtTime(42,t+.14);
  const g2=C.createGain();g2.gain.setValueAtTime(.95*o.body,t);
  g2.gain.exponentialRampToValueAtTime(.001,t+.16+(o.boom||0)*.22);
  o2.connect(g2);g2.connect(out);o2.start(t);o2.stop(t+.45);
  const s=C.createBufferSource();s.buffer=AU.noise;s.loop=true;
  const f=C.createBiquadFilter();f.type='bandpass';f.Q.value=.7;
  f.frequency.setValueAtTime(3800*o.pitch,t);
  f.frequency.exponentialRampToValueAtTime(500,t+.1);
  const g3=C.createGain();g3.gain.setValueAtTime(.6*o.crack,t);
  g3.gain.exponentialRampToValueAtTime(.001,t+.1+(o.boom||0)*.18);
  s.connect(f);f.connect(g3);g3.connect(out);s.start(t);s.stop(t+.4);
}
const SFX={
  step(){
    if(playBank('footstepEarth',{vol:.18,pitch:rand(.88,1.08),pitchVar:.025,filter:{type:'lowpass',freq:1300},verb:.04}))return;
    sNoise(.07,'lowpass',rand(380,520),120,.05);
  },
  shot(){gunshot({body:.9,crack:.9,pitch:1});},
  shotgun(){gunshot({body:1.35,crack:1.2,pitch:.6,boom:.6});},
  turretShot(v){gunshot({body:.3,crack:.45,pitch:1.4,vol:v*.55});},
  dry(){
    if(playBank('uiDeny',{vol:.18,pitch:.72,pitchVar:.02,filter:{type:'lowpass',freq:900},verb:.04}))return;
    sTone('square',700,500,.04,.07);
  },
  reload(){ // mag out, mag in, bolt home
    const ok=playBanks([
      ['reload',{vol:.24,pitch:.95,pitchVar:.05,delay:0,verb:.09}],
      ['cloth',{vol:.16,pitch:1.04,pitchVar:.06,delay:.16,verb:.06}],
      ['reload',{vol:.20,pitch:1.12,pitchVar:.035,delay:.48,verb:.1}],
      ['metal',{vol:.14,pitch:1.35,pitchVar:.05,delay:.68,verb:.12}],
    ]);
    if(ok)return;
    sNoise(.05,'highpass',2200,900,.12);sTone('square',300,210,.04,.06);
    setTimeout(()=>{sNoise(.05,'lowpass',900,300,.14);sTone('square',360,250,.04,.07);},260);
    setTimeout(()=>{sNoise(.04,'highpass',3000,1200,.16);sTone('square',520,400,.03,.09);},620);},
  dig(){
    const ok=playBanks([
      ['dig',{vol:.42,pitch:.9,pitchVar:.08,filter:{type:'lowpass',freq:1600},verb:.16}],
      ['wood',{vol:.10,pitch:.75,pitchVar:.04,delay:.035,filter:{type:'lowpass',freq:900},verb:.12}],
    ]);
    if(!ok){sNoise(.22,'lowpass',700,120,.4);sTone('sine',120,55,.2,.25);}
  },
  raise(){
    if(playBank('dig',{vol:.34,pitch:1.12,pitchVar:.08,filter:{type:'lowpass',freq:1400},verb:.14}))return;
    sNoise(.25,'lowpass',500,90,.35);
  },
  hitFlesh(){
    if(playBank('flesh',{vol:.25,pitch:.9,pitchVar:.08,filter:{type:'lowpass',freq:1500},verb:.08})){
      sTone('sine',180,90,.055,.05);
      return;
    }
    sNoise(.08,'lowpass',900,200,.28);sTone('sine',220,90,.07,.14);
  },
  groan(vol,p){
    sNoise(.85,'lowpass',Math.max(120,p*1.6),70,vol*.16);   // the breath
    sTone('sine',p*.55,p*.32,.8,vol*.12);                    // the chest under it
  },
  scream(vol){
    sNoise(.4,'bandpass',rand(1300,1800),420,.14*vol);
    sTone('sine',rand(640,820),230,.45,.1*vol);
    sTone('triangle',rand(900,1150),320,.3,.05*vol);
  },
  spit(){
    if(playBank('smallHit',{vol:.1,pitch:1.45,pitchVar:.08,filter:{type:'bandpass',freq:1300,q:1.2},verb:.04}))return;
    sNoise(.18,'bandpass',900,300,.1);
  },
  acidHit(){
    if(playBanks([
      ['flesh',{vol:.2,pitch:.62,pitchVar:.05,filter:{type:'lowpass',freq:950},verb:.16}],
      ['smallHit',{vol:.10,pitch:.85,pitchVar:.06,delay:.04,filter:{type:'bandpass',freq:800,q:.9},verb:.1}],
    ]))return;
    sNoise(.22,'lowpass',800,150,.14);
  },
  boom(){
    playBanks([
      ['metal',{vol:.25,pitch:.58,pitchVar:.05,filter:{type:'lowpass',freq:900},verb:.28}],
      ['wood',{vol:.30,pitch:.52,pitchVar:.06,delay:.03,filter:{type:'lowpass',freq:720},verb:.3}],
      ['flesh',{vol:.14,pitch:.55,pitchVar:.05,delay:.075,filter:{type:'lowpass',freq:650},verb:.22}],
    ]);
    sNoise(1.1,'lowpass',2200,55,.55);sTone('sine',120,26,.9,.46);sTone('sine',60,20,1.4,.38);
  },
  slam(){
    if(playBanks([
      ['wood',{vol:.35,pitch:.7,pitchVar:.08,filter:{type:'lowpass',freq:900},verb:.2}],
      ['metal',{vol:.16,pitch:.62,pitchVar:.06,delay:.02,filter:{type:'lowpass',freq:1200},verb:.16}],
    ]))return;
    sNoise(.4,'lowpass',600,60,.55);sTone('sine',80,24,.5,.6);
  },
  thunder(){sNoise(2.4,'lowpass',900,55,.4);sTone('sine',70,24,2,.3);},
  heartbeat(){sTone('sine',55,38,.14,.5);setTimeout(()=>sTone('sine',50,34,.12,.4),180);},
  hurt(){
    if(playBank('flesh',{vol:.22,pitch:.68,pitchVar:.08,filter:{type:'lowpass',freq:950},verb:.14})){
      sNoise(.16,'lowpass',700,150,.08);return;
    }
    sNoise(.26,'lowpass',900,140,.2);sTone('sine',160,55,.28,.16);
  },
  dash(){
    if(playBank('cloth',{vol:.18,pitch:1.28,pitchVar:.09,filter:{type:'highpass',freq:600},verb:.03}))return;
    sNoise(.22,'highpass',400,3000,.12);
  },
  load(){
    const ok=playBanks([
      ['uiClick',{vol:.12,pitch:1.05,pitchVar:.04,verb:.03}],
      ['reload',{vol:.12,pitch:1.25,pitchVar:.04,delay:.08,verb:.08}],
    ]);
    if(ok)return;
    sNoise(.04,'highpass',2400,1000,.1);sTone('square',420,520,.05,.06);setTimeout(()=>sNoise(.03,'lowpass',800,400,.08),90);
  },
  build(){
    const ok=playBanks([
      ['wood',{vol:.24,pitch:.95,pitchVar:.08,filter:{type:'lowpass',freq:1400},verb:.15}],
      ['metal',{vol:.15,pitch:1.08,pitchVar:.06,delay:.18,filter:{type:'bandpass',freq:1600,q:.7},verb:.12}],
      ['wood',{vol:.16,pitch:1.2,pitchVar:.08,delay:.36,verb:.12}],
    ]);
    if(ok)return;
    sNoise(.1,'lowpass',700,200,.2);sTone('sine',140,90,.09,.15);
    setTimeout(()=>{sNoise(.08,'lowpass',900,300,.16);sTone('sine',170,110,.08,.12);},180);
    setTimeout(()=>sNoise(.12,'highpass',1800,700,.08),360);},
  horn(){
    sTone('triangle',196,194,.5,.16);sTone('triangle',147,146,.5,.14);
    sTone('sine',98,97,.55,.12);sNoise(.4,'lowpass',500,200,.05);
  },
  chime(){
    if(playBank('uiConfirm',{vol:.22,pitch:1.05,pitchVar:.03,verb:.18}))return;
    const t0=AU.ctx?AU.ctx.currentTime:0;
    [[392,1.4,.12],[587.3,1.1,.06],[989,.7,.03]].forEach(([f,d,v])=>sTone('sine',f,f*.997,d,v,t0));
    sNoise(.06,'highpass',3400,2000,.04,t0);},
  waveHorn(){
    sTone('triangle',98,82,1.6,.2);sTone('triangle',73,65,1.8,.18);
    sTone('sine',49,41,1.9,.16);sNoise(1.2,'lowpass',420,140,.06);
  },
  thud(){
    if(playBank('flesh',{vol:.24,pitch:.55,pitchVar:.06,filter:{type:'lowpass',freq:800},verb:.16}))return;
    sTone('sine',90,40,.18,.35);
  },
  smg(){gunshot({body:.5,crack:.7,pitch:1.3,vol:.85});},
  dmr(){gunshot({body:1.25,crack:1.1,pitch:.78,boom:.55});},
  lmg(){gunshot({body:.8,crack:.85,pitch:.95,vol:.9});},
  flame(){sNoise(.16,'bandpass',700,400,.16);},
  slash(){
    if(playBank('knife',{vol:.30,pitch:1.12,pitchVar:.11,filter:{type:'highpass',freq:500},verb:.08}))return;
    sNoise(.09,'highpass',2600,760,.13);sTone('sine',560,320,.055,.045);
  },
  crackle(){sNoise(.22,'lowpass',rand(260,520),90,.05);if(Math.random()<.3)sNoise(.05,'bandpass',rand(900,1300),500,.018);},
  buy(){
    if(playBank('uiConfirm',{vol:.25,pitch:1.12,pitchVar:.04,verb:.15}))return;
    sTone('sine',1180,1170,.4,.07);sTone('sine',1764,1740,.25,.04);
    sNoise(.12,'highpass',2600,1400,.05);
    setTimeout(()=>sNoise(.09,'lowpass',1100,500,.06),140);},
  deny(){
    if(playBank('uiDeny',{vol:.22,pitch:.82,pitchVar:.04,verb:.08}))return;
    sNoise(.07,'lowpass',420,160,.16);sTone('sine',95,70,.12,.12);
  },
  perk(){
    playBank('uiConfirm',{vol:.20,pitch:.85,pitchVar:.04,verb:.18});
    const t0=AU.ctx?AU.ctx.currentTime:0;
    [[98,1.2,.1],[147,1.2,.08],[196,1.4,.09],[294,1.6,.05]].forEach(([f,d,v],i)=>sTone('sawtooth',f*.99,f,d,v,t0+i*.06));},
  beep(){
    if(playBank('uiTick',{vol:.16,pitch:1.3,pitchVar:.05,verb:.04}))return;
    sTone('sine',1240,1236,.12,.08);sTone('sine',2480,2470,.07,.025);
  },
  flare(){
    playBank('uiConfirm',{vol:.14,pitch:1.35,pitchVar:.06,verb:.1});
    sNoise(.5,'highpass',900,3500,.18);sTone('sine',500,900,.3,.08);
  },
  wail(){sTone('sawtooth',300,900,1.2,.2);sTone('sawtooth',280,860,1.3,.14);},
  colossus(){sTone('sawtooth',55,22,2,.45);sNoise(1.6,'lowpass',400,50,.45);},
  crash(){
    playBanks([
      ['metal',{vol:.28,pitch:.58,pitchVar:.07,filter:{type:'lowpass',freq:850},verb:.24}],
      ['wood',{vol:.25,pitch:.62,pitchVar:.07,delay:.04,filter:{type:'lowpass',freq:750},verb:.22}],
    ]);
    sNoise(.7,'lowpass',1500,100,.38);sTone('sine',110,30,.6,.3);
  }
};

/* ---------------- terrain ---------------- */
const TER={N:160,size:300};
const VN=TER.N+1, half=TER.size/2, cell=TER.size/TER.N;
const H=new Float32Array(VN*VN), H0=new Float32Array(VN*VN);
function hash(ix,iz){let n=ix*374761393+iz*668265263+HSALT|0;n=(n^(n>>13))*1274126177;return ((n^(n>>16))>>>0)/4294967295;}
function smoothNoise(x,z){
  const ix=Math.floor(x),iz=Math.floor(z),fx=x-ix,fz=z-iz;
  const sx=fx*fx*(3-2*fx),sz=fz*fz*(3-2*fz);
  return lerp(lerp(hash(ix,iz),hash(ix+1,iz),sx),lerp(hash(ix,iz+1),hash(ix+1,iz+1),sx),sz);
}
/* the road winds differently on every leg, but always passes the camp at origin */
const ROAD={a1:10,f1:.026,s1:1,a2:5,f2:.07,s2:1};
function roadZ(x){return ROAD.a1*Math.sin(x*ROAD.f1)*ROAD.s1+ROAD.a2*Math.sin(x*ROAD.f2)*ROAD.s2;}
const BIOME={name:'GREYFIELD MARCH',tint:[1,1,1],rugged:1,treeK:1,grassK:1,rockK:1,risk:1,nfBias:0,leafHue:0,grassHue:0,city:0,shore:false};
let terrainSkirt=null;
function buildSkirt(){
  if(terrainSkirt){scene.remove(terrainSkirt);
    terrainSkirt.geometry.dispose();terrainSkirt.material.dispose();}
  // a square apron: inner edge welded to the terrain rim, outer edge falling away
  const SEG=26,DROP=34,OUT=150;
  const verts=[],idx=[];
  const edges=[
    (t2)=>[ -half+t2*2*half, -half, 0,  1],   // north rim, aprons fall -z
    (t2)=>[  half, -half+t2*2*half,  1, 0],   // east
    (t2)=>[  half-t2*2*half,  half, 0, -1],   // south
    (t2)=>[ -half,  half-t2*2*half, -1, 0],   // west
  ];
  let vi=0;const edgeEnds=[];
  for(const e of edges){
    const base=vi;
    for(let i=0;i<=SEG;i++){
      const[x,z,dx,dz]=e(i/SEG);
      verts.push(x,heightAt(clamp(x,-half+1,half-1),clamp(z,-half+1,half-1)),z);
      verts.push(x+dx*OUT, -DROP, z+dz*OUT);
      vi+=2;
    }
    for(let i=0;i<SEG;i++){
      const a=base+i*2;
      idx.push(a,a+1,a+2, a+1,a+3,a+2);
    }
    edgeEnds.push({firstIn:base,firstOut:base+1,lastIn:vi-2,lastOut:vi-1});
  }
  for(let k=0;k<4;k++){ // corner fans: no daylight between aprons
    const A=edgeEnds[k],B=edgeEnds[(k+1)%4];
    idx.push(A.lastIn,A.lastOut,B.firstOut, A.lastIn,B.firstOut,B.firstIn);
  }
  const g=new THREE.BufferGeometry();
  g.setAttribute('position',new THREE.BufferAttribute(new Float32Array(verts),3));
  g.setIndex(idx);
  g.computeVertexNormals();
  const tnt=BIOME.tint||[1,1,1];
  terrainSkirt=new THREE.Mesh(g,new THREE.MeshStandardMaterial({
    color:new THREE.Color(.14*tnt[0],.19*tnt[1],.09*tnt[2]),  // the meadow tone, in this country's light
    roughness:1,side:THREE.DoubleSide}));
  terrainSkirt.receiveShadow=true;
  scene.add(terrainSkirt);
}
function genTerrain(){
  for(let iz=0;iz<VN;iz++)for(let ix=0;ix<VN;ix++){
    const x=-half+ix*cell,z=-half+iz*cell;
    let h=(smoothNoise(ix*.06,iz*.06)-.5)*3.2*BIOME.rugged+(smoothNoise(ix*.18,iz*.18)-.5)*.9;
    const dDep=Math.hypot(x,z);
    h*=clamp((dDep-10)/26,0,1);
    if(!WANDER.on||WANDER.road){const rd=Math.abs(z-roadZ(x));
    if(rd<8.5)h*=clamp((rd-3.4)/4.6,0,1);}
    const dCamp=Math.hypot(x,z-9.5);
    if(dCamp<17)h*=clamp((dCamp-13)/4,0,1);
    if(BIOME.shore)h-=Math.max(0,(z-50)/18)*3.5;   // the land bows to the sea
    H[iz*VN+ix]=h;H0[iz*VN+ix]=h;
  }
}
genTerrain();
function heightAt(x,z){
  const gx=clamp((x+half)/cell,0,TER.N-.001),gz=clamp((z+half)/cell,0,TER.N-.001);
  const ix=Math.floor(gx),iz=Math.floor(gz),fx=gx-ix,fz=gz-iz;
  const a=H[iz*VN+ix],b=H[iz*VN+ix+1],c=H[(iz+1)*VN+ix],d=H[(iz+1)*VN+ix+1];
  return a*(1-fx)*(1-fz)+b*fx*(1-fz)+c*(1-fx)*fz+d*fx*fz;
}
function isRoad(x,z){if(WANDER.on&&!WANDER.road)return false;return Math.abs(z-roadZ(x))<3.6;}
const tGeo=new THREE.BufferGeometry();
{
  const pos=new Float32Array(VN*VN*3),col=new Float32Array(VN*VN*3),uv=new Float32Array(VN*VN*2),idx=[];
  for(let iz=0;iz<VN;iz++)for(let ix=0;ix<VN;ix++){
    const v=iz*VN+ix;
    pos[v*3]=-half+ix*cell;pos[v*3+1]=H[v];pos[v*3+2]=-half+iz*cell;
    uv[v*2]=ix/TER.N;uv[v*2+1]=iz/TER.N;
  }
  for(let iz=0;iz<TER.N;iz++)for(let ix=0;ix<TER.N;ix++){
    const a=iz*VN+ix,b=a+1,c=a+VN,d=c+1;idx.push(a,c,b,b,c,d);
  }
  tGeo.setAttribute('position',new THREE.BufferAttribute(pos,3));
  tGeo.setAttribute('color',new THREE.BufferAttribute(col,3));
  tGeo.setAttribute('uv',new THREE.BufferAttribute(uv,2));
  tGeo.setIndex(idx);
}
function vertColor(v,out){
  const ix=v%VN,iz=(v/VN)|0;
  const x=-half+ix*cell,z=-half+iz*cell;
  const dug=H0[v]-H[v];
  const n=hash(ix*3,iz*7);
  let r,g,b;
  if(isRoad(x,z)){r=.145+n*.025;g=.135+n*.025;b=.115;}
  else if(dug>.18){const d=clamp(dug/2.6,.0,1);r=.30-d*.14+n*.03;g=.21-d*.10+n*.02;b=.13-d*.06;}
  else if(dug<-.18){r=.38+n*.05;g=.30+n*.04;b=.18;}
  else if(BIOME.ground){ // the biome brings its own earth: snowpack, steppe straw, hardpan
    const k=n*.5+smoothNoise(ix*.3,iz*.3)*.5;
    r=BIOME.ground[0]*(.78+k*.5);g=BIOME.ground[1]*(.78+k*.5);b=BIOME.ground[2]*(.78+k*.5);
    if(BIOME.snow){const drift=smoothNoise(ix*.05+3,iz*.05+9); // wind builds drifts, scours hollows
      const dw=clamp((drift-.45)*3,0,1);
      r=lerp(r,.84,dw);g=lerp(g,.87,dw);b=lerp(b,.94,dw);}
    if(BIOME.desert){const crack=smoothNoise(ix*.4+5,iz*.4+2); // cracked pan reads darker in the seams
      if(crack<.3){const cw=Math.min(1,(.3-crack)*5);
        r*=1-cw*.3;g*=1-cw*.32;b*=1-cw*.3;}}
  }
  else{const k=n*.5+smoothNoise(ix*.3,iz*.3)*.5;
    r=.16+k*.10;g=.235+k*.13;b=.10+k*.045;    // deep meadow loam, matches the grass
    const mac=smoothNoise(ix*.045+7,iz*.045+13);   // macro patchwork: the land changes its mind in 30m sweeps
    if(mac>.56){const mw=Math.min(1,(mac-.56)*4);  // dry straw shoulders
      r=lerp(r,.295+k*.06,mw);g=lerp(g,.25+k*.05,mw);b=lerp(b,.125,mw);}
    else if(mac<.42){const mw=Math.min(1,(.42-mac)*4); // damp dark hollows
      r=lerp(r,.115,mw);g=lerp(g,.165,mw);b=lerp(b,.078,mw);}
  }
  if(ix>0&&ix<TER.N&&iz>0&&iz<TER.N){
    const s=Math.abs(H[v+1]-H[v-1])+Math.abs(H[v+VN]-H[v-VN]);
    const sf=clamp((s-.8)/2.2,0,1);
    r=lerp(r,.26,sf);g=lerp(g,.18,sf);b=lerp(b,.11,sf);
    if(BIOME.alpine){ // the snowline: high ground goes white, steep faces shrug it off
      const sl=clamp((H[v]-3.6)*.7,0,1)*(1-sf*.7);
      r=lerp(r,.78,sl);g=lerp(g,.82,sl);b=lerp(b,.9,sl);
    }
  }
  r*=BIOME.tint[0];g*=BIOME.tint[1];b*=BIOME.tint[2];
  // baked AO: concave ground (trench floors, craters) falls into shadow
  if(ix>1&&ix<TER.N-1&&iz>1&&iz<TER.N-1){
    const avgN=(H[v-2]+H[v+2]+H[v-2*VN]+H[v+2*VN])*.25;
    const ao=clamp(1-(avgN-H[v])*.55,.42,1.12);
    r*=ao;g*=ao;b*=ao;
  }
  out[0]=r;out[1]=g;out[2]=b;
}
function paintAll(){
  const col=tGeo.attributes.color.array,c=[0,0,0];
  for(let v=0;v<VN*VN;v++){vertColor(v,c);col[v*3]=c[0];col[v*3+1]=c[1];col[v*3+2]=c[2];}
  tGeo.attributes.color.needsUpdate=true;
}
paintAll();
tGeo.computeVertexNormals();
/* procedural PBR ground: tiling micro-heightfield → albedo / normal / roughness */
function fbm2(x,y,oct=4){ // tileable-ish value noise stack
  let v=0,a=.5,fx=x,fy=y;
  for(let o=0;o<oct;o++){v+=a*smoothNoise(fx,fy);fx=fx*2.07+13.1;fy=fy*2.07+7.7;a*=.5;}
  return v;
}
const GS=512;
const gHeight=new Float32Array(GS*GS);
for(let y=0;y<GS;y++)for(let x=0;x<GS;x++){
  let h=fbm2(x*.045,y*.045,5);                       // clods of churned earth
  h+=Math.max(0,fbm2(x*.012+40,y*.012+9,3)-.55)*1.6; // broad mud humps
  const ridge=Math.abs(fbm2(x*.03+90,y*.03+33,4)-.5);// cracked-crust ridges
  h-=Math.pow(1-ridge*2,8)*.18;
  gHeight[y*GS+x]=h;
}
function makeTex(fill){
  const c=document.createElement('canvas');c.width=c.height=GS;
  const g=c.getContext('2d'),img=g.createImageData(GS,GS);
  fill(img.data);
  g.putImageData(img,0,0);
  const t=new THREE.CanvasTexture(c);t.anisotropy=8; // the ground is all grazing angle
  t.wrapS=t.wrapT=THREE.RepeatWrapping;t.repeat.set(40,40);
  return t;
}
const groundTex=makeTex(d=>{ // albedo: dirt speckle + organic stains
  for(let y=0;y<GS;y++)for(let x=0;x<GS;x++){
    const i=(y*GS+x)*4,h=gHeight[y*GS+x];
    const sp=hash(x*7,y*13);
    let v=112+h*70+(sp-.5)*52;
    const stain=fbm2(x*.02+200,y*.02+77,3);
    v*=.78+stain*.3;
    d[i]=v*.99;d[i+1]=v;d[i+2]=v*.92;d[i+3]=255;  // near-neutral: each biome keeps its own earth colour
  }
});
groundTex.colorSpace=THREE.SRGBColorSpace;
const groundNrm=makeTex(d=>{ // tangent-space normals via Sobel on the heightfield
  const s=3.2;
  for(let y=0;y<GS;y++)for(let x=0;x<GS;x++){
    const i=(y*GS+x)*4;
    const xl=gHeight[y*GS+((x-1+GS)%GS)],xr=gHeight[y*GS+((x+1)%GS)];
    const yu=gHeight[((y-1+GS)%GS)*GS+x],yd=gHeight[((y+1)%GS)*GS+x];
    let nx=(xl-xr)*s,ny=(yu-yd)*s,nz=1;
    const l=Math.hypot(nx,ny,nz);nx/=l;ny/=l;nz/=l;
    d[i]=(nx*.5+.5)*255;d[i+1]=(ny*.5+.5)*255;d[i+2]=(nz*.5+.5)*255;d[i+3]=255;
  }
});
const groundRgh=makeTex(d=>{ // roughness: hollows hold moisture and glisten
  for(let y=0;y<GS;y++)for(let x=0;x<GS;x++){
    const i=(y*GS+x)*4,h=gHeight[y*GS+x];
    const wet=Math.max(0,.55-h)*1.7;
    const v=clamp(235-wet*150+(hash(x*3,y*5)-.5)*30,60,255);
    d[i]=d[i+1]=d[i+2]=v;d[i+3]=255;
  }
});
const terrain=new THREE.Mesh(tGeo,new THREE.MeshStandardMaterial({
  vertexColors:true,map:groundTex,
  normalMap:groundNrm,normalScale:new THREE.Vector2(1.15,1.15),
  roughnessMap:groundRgh,roughness:1,metalness:.02,envMapIntensity:.3}));
terrain.receiveShadow=true;
scene.add(terrain);

let mapDirty=true, roadBlockedAt=null;
function roadCheck(){
  roadBlockedAt=null;
  for(let x=-half+2;x<half-2;x+=2){
    if(Math.abs(x)<9)continue;            // camp ground is hard-packed
    const h=heightAt(x,roadZ(x));
    if(h<-.65||h>1.25){roadBlockedAt=x;break;}
  }
}
const turrets=[];
function modifyTerrain(x,z,radius,delta){
  let changed=0;
  const gx0=Math.max(0,Math.floor((x-radius+half)/cell)),gx1=Math.min(TER.N,Math.ceil((x+radius+half)/cell));
  const gz0=Math.max(0,Math.floor((z-radius+half)/cell)),gz1=Math.min(TER.N,Math.ceil((z+radius+half)/cell));
  for(let iz=gz0;iz<=gz1;iz++)for(let ix=gx0;ix<=gx1;ix++){
    const vx=-half+ix*cell,vz=-half+iz*cell;
    const d=Math.hypot(vx-x,vz-z);
    if(d>radius)continue;
    if(Math.hypot(vx,vz-9.5)<10)continue;
    let ok=true;
    for(const t of turrets)if(Math.hypot(vx-t.x,vz-t.z)<2)ok=false;
    if(!ok)continue;
    const v=iz*VN+ix;
    const fall=Math.cos(d/radius*Math.PI/2);
    let nh=H[v]+delta*fall;
    const maxUp=isRoad(vx,vz)?H0[v]:H0[v]+2.2;
    nh=clamp(nh,H0[v]-3.2,maxUp);
    if(Math.abs(nh-H[v])>.001){changed+=Math.abs(nh-H[v]);H[v]=nh;}
  }
  if(changed>0){
    const pos=tGeo.attributes.position.array,c=[0,0,0],col=tGeo.attributes.color.array;
    for(let iz=gz0;iz<=gz1;iz++)for(let ix=gx0;ix<=gx1;ix++){
      const v=iz*VN+ix;pos[v*3+1]=H[v];
      vertColor(v,c);col[v*3]=c[0];col[v*3+1]=c[1];col[v*3+2]=c[2];
    }
    tGeo.attributes.position.needsUpdate=true;
    tGeo.attributes.color.needsUpdate=true;
    tGeo.computeVertexNormals();
    mapDirty=true;roadCheck();
    snapGrass(x,z,radius);
  }
  return changed;
}
const _rm=new THREE.Vector3();
function groundRay(origin,dir,maxD=140){
  let t=0,step=.8;
  for(;t<maxD;t+=step){
    _rm.copy(dir).multiplyScalar(t).add(origin);
    if(_rm.y<heightAt(_rm.x,_rm.z)){
      for(let i=0;i<6;i++){ step/=2;t-=step;
        _rm.copy(dir).multiplyScalar(t).add(origin);
        if(_rm.y>=heightAt(_rm.x,_rm.z))t+=step;
      }
      _rm.copy(dir).multiplyScalar(t).add(origin);
      return {point:_rm.clone(),dist:t};
    }
    if(t>8)step=1.6;
  }
  return null;
}

/* ---------------- props ---------------- */
const WindU={value:0}; // shared wind clock for grass / flag shaders
const COLLIDERS=[];        // per-leg: trees, ruins, city walls
const CAMP_COLLIDERS=[];   // forever: the palisade, the towers
function pushOut2(o,rad,pools){
  for(const pool of pools)for(const c of pool){
    const dx=o.x-c.x,dz=o.z-c.z,rr=c.r+rad,d2=dx*dx+dz*dz;
    if(d2<rr*rr&&d2>1e-4){const dd=Math.sqrt(d2);o.x=c.x+dx/dd*rr;o.z=c.z+dz/dd*rr;}
  }
}
function clothWave(mat,amp){ // vertex ripple for cloth-like planes
  mat.onBeforeCompile=s=>{
    s.uniforms.uWindT=WindU;
    s.vertexShader='uniform float uWindT;\n'+s.vertexShader.replace('#include <begin_vertex>',
      `#include <begin_vertex>
       transformed.z+=sin(uWindT*5.2+position.x*3.4)*${amp}*(position.x*.5+.55);
       transformed.y+=sin(uWindT*3.7+position.x*2.6)*${amp}*.4*(position.x*.5+.55);`);
  };
}
const SnowU={value:0}; // how much the biome lays on upward faces
function frostable(mat){ // snow settles where gravity says it should
  mat.onBeforeCompile=s=>{
    s.uniforms.uSnowK=SnowU;
    s.fragmentShader='uniform float uSnowK;\n'+s.fragmentShader.replace('#include <color_fragment>',
      `#include <color_fragment>
       #ifndef FLAT_SHADED
       float snowUp=smoothstep(.45,.8,dot(normalize(vNormal),normalize((viewMatrix*vec4(0.,1.,0.,0.)).xyz)));
       diffuseColor.rgb=mix(diffuseColor.rgb,vec3(.85,.88,.95),uSnowK*snowUp);
       #endif`);
  };
  return mat;
}
const woodTex=(()=>{ // plank grain for crates / platform
  const c=document.createElement('canvas');c.width=c.height=256;
  const g=c.getContext('2d');
  g.fillStyle='#bba776';g.fillRect(0,0,256,256);
  for(let y=0;y<256;y++){
    const w=fbm2(3,y*.05,3);
    g.fillStyle=`rgba(70,52,30,${.10+w*.25})`;g.fillRect(0,y,256,1);
  }
  for(let i=0;i<9;i++){g.fillStyle='rgba(40,30,18,.55)';g.fillRect(0,i*28+(i*7)%9,256,2);}
  for(let i=0;i<26;i++){ // knots
    const x=Math.random()*256,y=Math.random()*256;
    const rg=g.createRadialGradient(x,y,1,x,y,7);
    rg.addColorStop(0,'rgba(50,36,20,.8)');rg.addColorStop(1,'rgba(50,36,20,0)');
    g.fillStyle=rg;g.beginPath();g.arc(x,y,7,0,TAU);g.fill();
  }
  const t=new THREE.CanvasTexture(c);t.anisotropy=8;
  t.wrapS=t.wrapT=THREE.RepeatWrapping;t.colorSpace=THREE.SRGBColorSpace;
  return t;
})();
const burlapTex=(()=>{ // hessian weave for the bags on every parapet
  const c=document.createElement('canvas');c.width=c.height=128;
  const g=c.getContext('2d'),img=g.createImageData(128,128);
  for(let y=0;y<128;y++)for(let x=0;x<128;x++){
    const i=(y*128+x)*4;
    const weave=Math.sin(x*TAU/8)*Math.sin(y*TAU/8);   // over-under threads
    const v=150+weave*38+(hash(x*5,y*9)-.5)*36+fbm2(x*.06,y*.06,3)*30-15;
    img.data[i]=v;img.data[i+1]=v*.92;img.data[i+2]=v*.72;img.data[i+3]=255;
  }
  g.putImageData(img,0,0);
  const t=new THREE.CanvasTexture(c);t.anisotropy=4;
  t.wrapS=t.wrapT=THREE.RepeatWrapping;t.colorSpace=THREE.SRGBColorSpace;
  return t;
})();
const bagGeo=(()=>{ // one sewn sack, reused everywhere bags get stacked
  const geo=new THREE.CapsuleGeometry(.21,.4,4,12);
  geo.rotateZ(Math.PI/2);geo.scale(1,.74,1.3);
  return geo;
})();
const bagMat=frostable(new THREE.MeshStandardMaterial({color:0xb5a87f,roughness:.95,
  map:burlapTex,bumpMap:burlapTex,bumpScale:.3}));
const brickTex=(()=>{ // running bond for every ruin still arguing with gravity
  const c=document.createElement('canvas');c.width=c.height=256;
  const g=c.getContext('2d');
  g.fillStyle='#5a5048';g.fillRect(0,0,256,256);     // mortar
  const bw=32,bh=16;
  for(let row=0;row<16;row++){
    const off=(row%2)*bw/2;
    for(let col=-1;col<9;col++){
      const x=col*bw+off,y=row*bh;
      const v=95+Math.random()*50;
      g.fillStyle=`rgb(${v|0},${v*.72|0},${v*.58|0})`;
      g.fillRect(x+1.5,y+1.5,bw-3,bh-3);
      if(Math.random()<.18){                          // soot-darkened or chipped
        g.fillStyle='rgba(20,16,12,'+(.2+Math.random()*.4)+')';
        g.fillRect(x+1.5,y+1.5,bw-3,bh-3);
      }
    }
  }
  const t=new THREE.CanvasTexture(c);t.anisotropy=8;
  t.wrapS=t.wrapT=THREE.RepeatWrapping;t.colorSpace=THREE.SRGBColorSpace;
  return t;
})();
const roadPosts=new THREE.InstancedMesh(
  new THREE.BoxGeometry(.18,.9,.18),
  frostable(new THREE.MeshStandardMaterial({color:0x8a8270})),96);
roadPosts.castShadow=true;scene.add(roadPosts);
function scatterPosts(){
  const M=new THREE.Matrix4();let i=0;
  if(WANDER.on&&!WANDER.road){roadPosts.count=0;roadPosts.instanceMatrix.needsUpdate=true;return;}
  for(let x=-half+6;x<half-6&&i<92;x+=8){
    if(srnd()<.3)continue;                 // the war ate some of the fence
    const rz=roadZ(x);
    for(const s of[-1,1])if(i<92){M.setPosition(x,heightAt(x,rz+s*4.4)+.45,rz+s*4.4);roadPosts.setMatrixAt(i++,M);}
  }
  roadPosts.count=i;
  roadPosts.instanceMatrix.needsUpdate=true;
  roadPosts.computeBoundingSphere();
}
scatterPosts();
const depot=new THREE.Group();
{
  const plat=new THREE.Mesh(new THREE.BoxGeometry(13,.3,13),
    frostable(new THREE.MeshStandardMaterial({color:0x847a62,map:woodTex,roughness:.85,bumpMap:woodTex,bumpScale:.2})));
  plat.position.y=.15;plat.castShadow=plat.receiveShadow=true;depot.add(plat);
  const crateM=frostable(new THREE.MeshStandardMaterial({color:0x9a9a6a,map:woodTex,roughness:.8,bumpMap:woodTex,bumpScale:.25}));
  for(let i=0;i<6;i++){
    const c=new THREE.Mesh(new THREE.BoxGeometry(rand(1.2,1.9),rand(.9,1.5),rand(1.2,1.9)),crateM);
    c.position.set(rand(-4,4),.3+c.geometry.parameters.height/2,rand(-4,4));
    CAMP_COLLIDERS.push({x:c.position.x,z:c.position.z+9.5,r:1.1});
    c.rotation.y=rand(TAU);c.castShadow=true;depot.add(c);
  }
  const pole=new THREE.Mesh(new THREE.CylinderGeometry(.08,.08,7),new THREE.MeshStandardMaterial({color:0x8a8270}));
  pole.position.set(0,4.5,0);depot.add(pole);
  const flagM=new THREE.MeshStandardMaterial({color:0xe8742c,side:THREE.DoubleSide,roughness:.9});
  clothWave(flagM,.16);
  const flag=new THREE.Mesh(new THREE.PlaneGeometry(2,1.2,14,7),flagM);
  flag.position.set(1,7,0);depot.add(flag);
  const lampL=new THREE.PointLight(0xffc070,20,26);lampL.position.set(0,6,0);depot.add(lampL);
  // dressing: tents, sandbags, a mast, lanterns. somewhere someone defended.
  const tentM=frostable(new THREE.MeshStandardMaterial({color:0x6b6f4f,roughness:.95,
    map:burlapTex,bumpMap:burlapTex,bumpScale:.25}));
  for(const[tx,tz,tr]of[[-4.5,5.5,.6],[5.2,-4.8,-1.1]]){
    const tent=new THREE.Mesh(new THREE.ConeGeometry(1.8,2.1,4),tentM);
    tent.position.set(tx,1.05,tz);tent.rotation.y=tr;tent.castShadow=true;depot.add(tent);
    CAMP_COLLIDERS.push({x:tx,z:tz+9.5,r:1.7});
  }
  for(let bI=0;bI<14;bI++){
    const a=bI/14*TAU;
    if(Math.sin(a)<-.42)continue;                 // open arc where the road runs
    const bag=new THREE.Mesh(bagGeo,bagMat);
    bag.scale.set(1.1,1,.75);
    bag.position.set(Math.cos(a)*8.2,.13+(bI%2)*.3,Math.sin(a)*8.2);
    bag.rotation.y=-a+rand(-.15,.15);bag.castShadow=true;depot.add(bag);
    CAMP_COLLIDERS.push({x:Math.cos(a)*8.2,z:Math.sin(a)*8.2+9.5,r:.7});
  }
  const mast=new THREE.Mesh(new THREE.CylinderGeometry(.05,.07,9,6),
    new THREE.MeshStandardMaterial({color:0x4a4438,roughness:.6,metalness:.4}));
  mast.position.set(-4,4.65,-4);depot.add(mast);
  CAMP_COLLIDERS.push({x:-4,z:5.5,r:.4});
  const lantM=new THREE.MeshBasicMaterial();lantM.color.setRGB(4,2.6,1);
  for(const[lx,lz]of[[6,5],[-6,-5],[5,-6]]){
    const post=new THREE.Mesh(new THREE.CylinderGeometry(.04,.05,2.6,5),
      new THREE.MeshStandardMaterial({color:0x3a342a}));
    post.position.set(lx,2.3,lz);depot.add(post);
    const bulb=new THREE.Mesh(new THREE.SphereGeometry(.07,6,5),lantM);
    bulb.position.set(lx,3.55,lz);depot.add(bulb);   // HDR-hot: blooms like a real lantern
  }
  // the wall greyfield died behind: palisade, two towers, breaches still smoking
  const palM=frostable(new THREE.MeshStandardMaterial({color:0x4f4434,map:woodTex,roughness:.95,
    bumpMap:woodTex,bumpScale:.3}));
  const charM=new THREE.MeshStandardMaterial({color:0x18140f,roughness:1});
  const ringR=13.5;
  for(let wa=.62;wa<TAU-.62;wa+=.16){            // open toward the road
    const wx=Math.cos(wa-Math.PI/2)*ringR,wz=Math.sin(wa-Math.PI/2)*ringR;
    const fate=Math.random();
    if(fate<.14)continue;                         // a breach
    const hgt=fate<.3?rand(.8,1.6):rand(2.6,3.4); // shattered stumps or standing timber
    const seg=new THREE.Mesh(new THREE.BoxGeometry(2.1,hgt,.4),fate<.3?charM:palM);
    seg.position.set(wx,hgt/2,wz);
    seg.rotation.y=-(wa-Math.PI/2)+Math.PI/2;
    seg.rotation.z=fate<.3?rand(-.2,.2):rand(-.04,.04);
    seg.castShadow=true;depot.add(seg);
    if(hgt>2)CAMP_COLLIDERS.push({x:wx,z:wz+9.5,r:1.2});
  }
  for(const ts of[-1,1]){                         // watchtowers flanking the gate
    const tw=new THREE.Group();
    for(const[lx,lz]of[[-.8,-.8],[.8,-.8],[-.8,.8],[.8,.8]]){
      const leg=new THREE.Mesh(new THREE.CylinderGeometry(.09,.12,4.6,6),palM);
      leg.position.set(lx,2.3,lz);leg.castShadow=true;tw.add(leg);
    }
    const deck=new THREE.Mesh(new THREE.BoxGeometry(2.4,.18,2.4),palM);
    deck.position.y=4.6;deck.castShadow=true;tw.add(deck);
    for(let pI=0;pI<4;pI++){
      const par=new THREE.Mesh(new THREE.BoxGeometry(pI%2?2.4:.16,.7,pI%2?.16:2.4),palM);
      par.position.set(pI===0?-1.12:pI===2?1.12:0,5.05,pI===1?-1.12:pI===3?1.12:0);
      tw.add(par);
    }
    const roof=new THREE.Mesh(new THREE.ConeGeometry(2,1.1,4),
      new THREE.MeshStandardMaterial({color:0x3a342a,roughness:1}));
    roof.position.y=5.95;roof.rotation.y=Math.PI/4;roof.castShadow=true;tw.add(roof);
    if(ts>0){roof.rotation.z=.5;roof.position.x=.8;} // one roof half-fallen: tonight happened
    tw.position.set(ts*8,0,-4.6);
    depot.add(tw);
    CAMP_COLLIDERS.push({x:ts*8,z:4.9,r:1.6});
  }
  for(const gs of[-1,1]){                         // gate posts where the road runs through
    const post=new THREE.Mesh(new THREE.CylinderGeometry(.18,.22,4.2,7),palM);
    post.position.set(gs*5.6,2.1,-13.7);post.castShadow=true;depot.add(post);
    CAMP_COLLIDERS.push({x:gs*5.6,z:-4.2,r:.4});
  }
  depot.userData.flag=flag;depot.userData.lamp=lampL;
  depot.position.z=9.5;
scene.add(depot);
}
/* ---------------- the forest: birches, firs, and the dead ones ---------------- */
let scatterForest=null;
const DESTRUCT=[];
const stumps=[];
const stumpGeo=new THREE.CylinderGeometry(.16,.24,.55,7);
stumpGeo.translate(0,.27,0);
const stumpMat=new THREE.MeshStandardMaterial({color:0x231a10,roughness:1});   // declared ahead of the first scatterForest() run: every felled thing registers here
{
  const rockG=new THREE.IcosahedronGeometry(1,1);
  const rockTex=(()=>{ // granite grain: speckle and shadowed pits
    const c=document.createElement('canvas');c.width=c.height=128;
    const g=c.getContext('2d'),img=g.createImageData(128,128);
    for(let y=0;y<128;y++)for(let x=0;x<128;x++){
      const i=(y*128+x)*4;
      const v=120+fbm2(x*.08,y*.08,4)*80-40+(hash(x*3,y*7)-.5)*44;
      img.data[i]=v;img.data[i+1]=v*.96;img.data[i+2]=v*.88;img.data[i+3]=255;
    }
    g.putImageData(img,0,0);
    const t=new THREE.CanvasTexture(c);t.anisotropy=4;
    t.wrapS=t.wrapT=THREE.RepeatWrapping;t.colorSpace=THREE.SRGBColorSpace;return t;
  })();
  const rockM=frostable(new THREE.MeshStandardMaterial({color:0x8a8268,roughness:.95,
    map:rockTex,bumpMap:rockTex,bumpScale:.5}));
  const rocks=new THREE.InstancedMesh(rockG,rockM,80);
  rocks.castShadow=true;scene.add(rocks);

  // bark textures
  const birchBark=(()=>{
    const c=document.createElement('canvas');c.width=128;c.height=256;
    const g=c.getContext('2d');
    g.fillStyle='#cfccc0';g.fillRect(0,0,128,256);
    for(let i=0;i<900;i++){const v=180+Math.random()*60|0;
      g.fillStyle=`rgba(${v},${v},${v-10},.4)`;g.fillRect(Math.random()*128,Math.random()*256,3,8);}
    for(let i=0;i<44;i++){ // the dark birch slashes
      g.fillStyle='rgba(30,26,22,'+rand(.5,.9)+')';
      const y=Math.random()*256,w=rand(9,40);
      g.fillRect(Math.random()*128-8,y,w,rand(2.5,6));
    }
    for(let i=0;i<70;i++){ // lenticels: the fine horizontal ticks birch is known by
      g.fillStyle='rgba(60,54,46,'+rand(.25,.5)+')';
      g.fillRect(Math.random()*128,Math.random()*256,rand(4,10),1.4);
    }
    const t=new THREE.CanvasTexture(c);t.wrapS=t.wrapT=THREE.RepeatWrapping;t.anisotropy=4;
    t.colorSpace=THREE.SRGBColorSpace;return t;
  })();
  const firBark=(()=>{
    const c=document.createElement('canvas');c.width=128;c.height=256;
    const g=c.getContext('2d');
    g.fillStyle='#3a3128';g.fillRect(0,0,128,256);
    for(let x=0;x<128;x+=3){g.fillStyle=`rgba(${15+Math.random()*30|0},${12+Math.random()*22|0},10,.55)`;
      g.fillRect(x+Math.random()*2,0,rand(1,2.6),256);}
    for(let i=0;i<260;i++){ // plate cracks across the ridges
      g.fillStyle='rgba(10,8,6,'+rand(.3,.6)+')';
      g.fillRect(Math.random()*128,Math.random()*256,rand(2,5),rand(2,7));
    }
    const t=new THREE.CanvasTexture(c);t.wrapS=t.wrapT=THREE.RepeatWrapping;t.anisotropy=4;
    t.colorSpace=THREE.SRGBColorSpace;return t;
  })();
  // foliage sprites
  const leafTex=(()=>{ // broadleaf clumps
    const c=document.createElement('canvas');c.width=c.height=256;
    const g=c.getContext('2d');
    for(let i=0;i<900;i++){
      const a=Math.random()*TAU,r=Math.pow(Math.random(),.6)*104;
      const x=128+Math.cos(a)*r,y=128+Math.sin(a)*r*.8;
      // the sun lives up and to the right: leaves shade darker low-left, brighter high-right
      const lit=clamp(.62+(x-128)/128*.22-(y-128)/128*.3+Math.random()*.3,.3,1.25);
      const gr=(48+Math.random()*70)*lit|0;
      g.fillStyle=`rgba(${gr*.55|0},${gr},${gr*.4|0},${rand(.5,.95)})`;
      g.beginPath();g.ellipse(x,y,rand(4,12),rand(3,8),Math.random()*TAU,0,TAU);g.fill();
    }
    for(let i=0;i<60;i++){ // sky gaps: a real crown is full of holes
      const a=Math.random()*TAU,r=Math.pow(Math.random(),.5)*100;
      g.save();g.globalCompositeOperation='destination-out';
      g.beginPath();g.ellipse(128+Math.cos(a)*r,128+Math.sin(a)*r*.8,rand(4,10),rand(3,7),Math.random()*TAU,0,TAU);
      g.fill();g.restore();
    }
    const t=new THREE.CanvasTexture(c);t.colorSpace=THREE.SRGBColorSpace;t.anisotropy=4;return t;
  })();
  const pineTex=(()=>{ // drooping needle fronds
    const c=document.createElement('canvas');c.width=c.height=256;
    const g=c.getContext('2d');
    for(let i=0;i<170;i++){
      const x0=128,y0=12+Math.random()*68;
      const a=rand(-1,1)*1.35, len=rand(84,128);
      const x1=x0+Math.sin(a)*len,y1=y0+Math.cos(a*.5)*len*rand(.7,1);
      const gr=(36+Math.random()*48)*(1.25-y0/80*.5)|0;  // crown-lit: upper fronds catch the sky
      g.strokeStyle=`rgba(${gr*.5|0},${gr},${gr*.45|0},${rand(.55,.95)})`;
      g.lineWidth=rand(2,4.5);
      g.beginPath();g.moveTo(x0,y0);
      g.quadraticCurveTo(x0+Math.sin(a)*len*.5,y0+len*.35,x1,y1);g.stroke();
      for(let n=0;n<22;n++){const k=n/22;
        const nx=x0+(x1-x0)*k,ny=y0+(y1-y0)*k;
        g.strokeStyle=`rgba(${gr*.5|0},${gr},${gr*.45|0},.7)`;g.lineWidth=1.2;
        g.beginPath();g.moveTo(nx,ny);g.lineTo(nx+rand(-12,12),ny+rand(4,16));g.stroke();}
    }
    const t=new THREE.CanvasTexture(c);t.colorSpace=THREE.SRGBColorSpace;t.anisotropy=4;return t;
  })();
  const swayLeaf=m=>{m.onBeforeCompile=s=>{
    s.uniforms.uWindT=WindU;
    s.vertexShader='uniform float uWindT;\n'+s.vertexShader.replace('#include <begin_vertex>',
      `#include <begin_vertex>
       vec4 lwp=instanceMatrix*vec4(transformed,1.);
       transformed.xz+=(sin(uWindT*1.3+lwp.x*.21+lwp.z*.17)+.4*sin(uWindT*2.9+lwp.z*.5))*vec2(.06,.045);`);
  };};
  const leafM=new THREE.MeshStandardMaterial({map:leafTex,alphaTest:.5,side:THREE.DoubleSide,
    roughness:.85,color:0xb9c69a,envMapIntensity:.3,
    emissive:0x18220e,emissiveMap:leafTex,emissiveIntensity:.85}); // translucency cheat
  const pineM=new THREE.MeshStandardMaterial({map:pineTex,alphaTest:.45,side:THREE.DoubleSide,
    roughness:.9,color:0xaebd96,envMapIntensity:.25,
    emissive:0x121a0b,emissiveMap:pineTex,emissiveIntensity:.8});
  swayLeaf(leafM);swayLeaf(pineM);
  // geometries: trunk bases at y=0
  const mkTrunk=(r0,r1,h)=>{const g=new THREE.CylinderGeometry(r0,r1,h,11);g.translate(0,h/2,0);return g;};
  const birchT=new THREE.InstancedMesh(mkTrunk(.13,.34,14),
    frostable(new THREE.MeshStandardMaterial({map:birchBark,roughness:.8,bumpMap:birchBark,bumpScale:.25})),520);
  const firT=new THREE.InstancedMesh(mkTrunk(.16,.42,13),
    frostable(new THREE.MeshStandardMaterial({map:firBark,roughness:.95,bumpMap:firBark,bumpScale:.4})),440);
  const deadT=new THREE.InstancedMesh(mkTrunk(.14,.34,5.5),
    frostable(new THREE.MeshStandardMaterial({color:0x2c2620,roughness:1})),140);
  const cardG=(()=>{const p1=new THREE.PlaneGeometry(5.6,4.2);
    const p2=p1.clone();p2.rotateY(Math.PI/2);
    const p3=p1.clone();p3.rotateX(Math.PI/2);
    return mergeGeometries([p1,p2,p3]);})();
  const pineG=(()=>{const p1=new THREE.PlaneGeometry(5.2,5.2);p1.rotateX(-.5);
    const p2=p1.clone();p2.rotateY(2.09);const p3=p1.clone();p3.rotateY(4.18);
    return mergeGeometries([p1,p2,p3]);})();
  const leafCards=new THREE.InstancedMesh(cardG,leafM,520*5);
  const pineCards=new THREE.InstancedMesh(pineG,pineM,440*4);
  const deadBranches=(()=>{
    const bParts=[];
    const addB=(len,r0,rx,ry,tx,ty)=>{const b=new THREE.CylinderGeometry(r0*.4,r0,len,4);
      b.translate(0,len/2,0);b.rotateX(rx);b.rotateY(ry);b.translate(tx,ty,0);bParts.push(b);};
    addB(2.1,.09,.85,0,.05,3.6);addB(1.6,.07,-1.05,2.1,-.06,2.9);
    addB(1.2,.05,.7,4.2,.04,4.2);addB(.9,.045,-1.3,5.3,-.03,3.9);
    return new THREE.InstancedMesh(mergeGeometries(bParts),deadT.material,140);
  })();
  for(const m of[birchT,firT,deadT,leafCards,pineCards,deadBranches]){m.castShadow=true;scene.add(m);}
  // plant the woods: dense ring outside the battlefield, different every leg
  scatterForest=function(){
    const M=new THREE.Matrix4(),Q=new THREE.Quaternion(),S=new THREE.Vector3(),P=new THREE.Vector3(),E=new THREE.Euler();
    const C=new THREE.Color();
    let bi=0,fi=0,di=0,ri=0,lc=0,pc=0;
    const planted=[];
    const wantB=Math.round(520*BIOME.treeK),wantF=Math.round(440*BIOME.treeK),
          wantD=Math.round(70+(1-BIOME.treeK)*70);
    for(let i=0;i<16000&&(bi<wantB||fi<wantF||di<wantD);i++){
      const x=srand(-half+4,half-4),z=srand(-half+4,half-4);
      const r=Math.hypot(x,z);
      if(r<26||Math.abs(z-roadZ(x))<8)continue;
      const ringW=clamp((r-32)/14,0,1);          // forest closes in just past the battlefield
      if(srnd()>.05+ringW*.97)continue;
      let ok=true;                                // keep breathing room between trunks
      for(const p of planted)if((p[0]-x)*(p[0]-x)+(p[1]-z)*(p[1]-z)<8)ok=false;
      if(!ok)continue;
      planted.push([x,z]);
      const h=heightAt(x,z),kind=srnd();
      COLLIDERS.push({x,z,r:.5});
      E.set(srand(-.06,.06),srand(TAU),srand(-.06,.06));Q.setFromEuler(E);
      if(kind<.42*(1-(BIOME.pineBias||0))&&bi<wantB){ // birch + crown (conifers own the cold biomes)
        const sc=srand(.8,1.4);S.set(sc,sc*srand(.85,1.2),sc);
        P.set(x,h,z);M.compose(P,Q,S);DESTRUCT.push({tree:1,m:birchT,i:bi,x,z});birchT.setMatrixAt(bi++,M);
        const top=h+13*S.y;
        const nC=4+(srnd()*2|0);
        for(let cI=0;cI<nC&&lc<leafCards.instanceMatrix.count;cI++){
          E.set(srand(-.5,.5),srand(TAU),srand(-.5,.5));Q.setFromEuler(E);
          S.setScalar(srand(.75,1.4)*sc);
          P.set(x+srand(-2.2,2.2),top-srand(0,5.5),z+srand(-2.2,2.2));
          M.compose(P,Q,S);DESTRUCT.push({m:leafCards,i:lc,x,z});leafCards.setMatrixAt(lc,M);
          C.setHSL(srand(.22,.30)+BIOME.leafHue,
            srand(.32,.45)*(BIOME.snow?.4:1),
            Math.min(.8,srand(.3,.48)*(BIOME.snow?1.5:1)));leafCards.setColorAt(lc++,C);
        }
      }else if(kind<.8&&fi<wantF){                // fir + needle tiers
        const sc=srand(.9,1.55);S.set(sc,sc*srand(.9,1.15),sc);
        P.set(x,h,z);M.compose(P,Q,S);DESTRUCT.push({tree:1,m:firT,i:fi,x,z});firT.setMatrixAt(fi++,M);
        for(let tI=0;tI<4&&pc<pineCards.instanceMatrix.count;tI++){
          E.set(0,srand(TAU),0);Q.setFromEuler(E);
          const ts=(1.5-tI*.28)*sc;S.setScalar(ts);
          P.set(x,h+(3.6+tI*2.7)*sc,z);
          M.compose(P,Q,S);DESTRUCT.push({m:pineCards,i:pc,x,z});pineCards.setMatrixAt(pc,M);
          C.setHSL(srand(.3,.38)+BIOME.leafHue,
            srand(.28,.42)*(BIOME.snow?.35:1),
            Math.min(.8,srand(.22,.36)*(BIOME.snow?1.7:1)));pineCards.setColorAt(pc++,C); // snow-laden boughs
        }
      }else if(di<wantD){                         // shell-shattered dead tree
        const sc=srand(.7,1.5);S.setScalar(sc);
        P.set(x,h,z);M.compose(P,Q,S);
        DESTRUCT.push({tree:1,m:deadT,i:di,x,z});DESTRUCT.push({m:deadBranches,i:di,x,z});deadT.setMatrixAt(di,M);deadBranches.setMatrixAt(di++,M);
      }
    }
    const wantR=Math.round(70*BIOME.rockK);
    for(let i=0;i<wantR*2&&ri<80;i++){
      const x=srand(-half+6,half-6),z=srand(-half+6,half-6);
      if(Math.hypot(x,z)<24||isRoad(x,z))continue;
      E.set(srand(TAU),srand(TAU),0);Q.setFromEuler(E);
      S.set(srand(.5,1.7),srand(.4,1.1),srand(.5,1.7));P.set(x,heightAt(x,z)+.2,z);
      M.compose(P,Q,S);rocks.setMatrixAt(ri++,M);
    }
    birchT.count=bi;firT.count=fi;deadT.count=di;deadBranches.count=di;
    leafCards.count=lc;pineCards.count=pc;rocks.count=ri;
    for(const m of[birchT,firT,deadT,deadBranches,leafCards,pineCards,rocks]){
      m.instanceMatrix.needsUpdate=true;
      if(m.instanceColor)m.instanceColor.needsUpdate=true;
      m.computeBoundingSphere();
    }
  };
  scatterForest();
}

/* ---------------- grass: wind-blown instanced tufts ---------------- */
const grassData=[];
let grassMesh=null;
{
  const c=document.createElement('canvas');c.width=128;c.height=256;
  const g=c.getContext('2d');
  for(let i=0;i<110;i++){ // a fan of meadow blades: dark at the root, sun-bleached at the tip
    const bx=12+Math.random()*104,top=Math.random()*76,lean=(bx-64)*.55+rand(-18,18);
    const grd=g.createLinearGradient(0,256,0,top);
    const[base,tip]=pick([['30,52,20','96,128,52'],['44,68,26','118,138,58'],
      ['58,76,30','142,148,72'],['74,84,36','158,150,84']]);
    grd.addColorStop(0,`rgba(${base},1)`);
    grd.addColorStop(.7,`rgba(${tip},.85)`);
    grd.addColorStop(1,`rgba(${tip},.25)`);
    g.strokeStyle=grd;g.lineWidth=rand(2,4.8);
    g.beginPath();g.moveTo(bx,256);
    g.quadraticCurveTo(bx+lean*.4,160,bx+lean,top);g.stroke();
    if(Math.random()<.22){ // a few blades carry seed heads
      g.fillStyle='rgba(172,152,92,.85)';
      g.beginPath();g.ellipse(bx+lean,top+4,2.8,8,lean*.02,0,TAU);g.fill();
    }
  }
  const tex=new THREE.CanvasTexture(c);tex.colorSpace=THREE.SRGBColorSpace;
  tex.anisotropy=8;
  const p1=new THREE.PlaneGeometry(1.5,1.15,1,3);p1.translate(0,.55,0);
  const p2=p1.clone();p2.rotateY(Math.PI/2);
  const p3=p1.clone();p3.rotateY(Math.PI/4);   // a third card: the clump reads full from every angle
  const gGeo=mergeGeometries([p1,p2,p3]);
  const gMat=new THREE.MeshStandardMaterial({map:tex,alphaTest:.4,side:THREE.DoubleSide,
    roughness:.92,metalness:0,envMapIntensity:.35});
  gMat.onBeforeCompile=s=>{ // sway ∝ height² so roots stay planted
    s.uniforms.uWindT=WindU;
    s.vertexShader='uniform float uWindT;\n'+s.vertexShader.replace('#include <begin_vertex>',
      `#include <begin_vertex>
       vec4 gwp=instanceMatrix*vec4(transformed,1.);
       float gsw=sin(uWindT*1.7+gwp.x*.4+gwp.z*.3)+.5*sin(uWindT*3.3+gwp.z*.9);
       transformed.xz+=gsw*uv.y*uv.y*vec2(.15,.10);`);
  };
  const N=11500;
  grassMesh=new THREE.InstancedMesh(gGeo,gMat,N);
  grassMesh.receiveShadow=false;   // shadow sampling on 9.5k alpha cards is pure GPU tax
  scene.add(grassMesh);
}
function scatterGrass(){
  const N=11500;
  const M=new THREE.Matrix4(),Q=new THREE.Quaternion(),S=new THREE.Vector3(),P=new THREE.Vector3(),E=new THREE.Euler();
  const C=new THREE.Color();
  grassData.length=0;
  let gi=0;
  const want=Math.min(N,Math.round(N*BIOME.grassK));
  const tall=BIOME.grassK>1.5?1.45:1;   // the steppe carries its grass waist-high
  for(let i=0;i<N*4&&gi<want;i++){
    const x=srand(-half+4,half-4),z=srand(-half+4,half-4);
    if(isRoad(x,z)||Math.hypot(x,z)<11)continue;
    // grass grows where grass grows: clumped meadows and bald earth, not confetti
    const cl=smoothNoise((x+half)/cell*.13+31,(z+half)/cell*.13+17);
    if(cl<.42&&srnd()>.22)continue;
    const h=heightAt(x,z);
    E.set(0,srand(TAU),srand(-.1,.1));Q.setFromEuler(E);
    const sc=srand(.6,1.5)*tall;S.set(sc,sc*srand(.8,1.35),sc);
    P.set(x,h,z);M.compose(P,Q,S);
    grassMesh.setMatrixAt(gi,M);
    C.setHSL(srand(.21,.32)+BIOME.grassHue,
      srand(.3,.45)*(BIOME.grassS??1),
      Math.min(.78,srand(.12,.24)*(BIOME.grassL??1)));  // meadow green, steppe straw, frost
    grassMesh.setColorAt(gi,C);
    grassData.push({x,z,h0:h,m:M.clone()});
    gi++;
  }
  grassMesh.count=gi;
  grassMesh.instanceMatrix.needsUpdate=true;
  if(grassMesh.instanceColor)grassMesh.instanceColor.needsUpdate=true;
  grassMesh.computeBoundingSphere();
}
scatterGrass();
const _gM=new THREE.Matrix4(),_gZ=new THREE.Matrix4().makeScale(.0001,.0001,.0001);
function snapGrass(x,z,radius){ // dug earth swallows the grass; piled earth lifts it
  if(!grassMesh)return;
  const r2=(radius+1.5)*(radius+1.5);
  for(let i=0;i<grassData.length;i++){
    const gd=grassData[i];
    const dx=gd.x-x,dz=gd.z-z;
    if(dx*dx+dz*dz>r2)continue;
    const h=heightAt(gd.x,gd.z);
    if(h<gd.h0-.35){grassMesh.setMatrixAt(i,_gZ);}
    else{_gM.copy(gd.m);_gM.elements[13]=h;grassMesh.setMatrixAt(i,_gM);}
  }
  grassMesh.instanceMatrix.needsUpdate=true;
}

/* ---------------- airborne dust: the air itself has body ---------------- */
const crows=[];
{
  const c=document.createElement('canvas');c.width=32;c.height=16;
  const g=c.getContext('2d');g.strokeStyle='rgba(10,10,8,.9)';g.lineWidth=2.2;
  g.beginPath();g.moveTo(2,12);g.quadraticCurveTo(9,2,16,10);g.quadraticCurveTo(23,2,30,12);g.stroke();
  const tex=new THREE.CanvasTexture(c);
  for(let i=0;i<4;i++){
    const sp=new THREE.Sprite(new THREE.SpriteMaterial({map:tex,transparent:true,opacity:.85}));
    sp.scale.set(1.6,.8,1);sp.visible=false;
    sp.userData={ph:rand(TAU),r:rand(14,26),h:rand(18,26),sp2:rand(.25,.45)};
    scene.add(sp);crows.push(sp);
  }
}
let crowCawT=20,gustT=18;
function updateCrows(dt,t){
  const calm=!zombies.some(z=>z.alive)&&(CAMP.mode==='drive'||G.state==='play'&&!CAMP.on&&!BAST.on);
  for(const cr of crows){
    cr.visible=calm;
    if(!calm)continue;
    const u=cr.userData;u.ph+=dt*u.sp2;
    const cx=player.x+Math.cos(u.ph)*u.r,cz=player.z+Math.sin(u.ph)*u.r;
    cr.position.set(cx,heightAt(cx,cz)+u.h+Math.sin(t*2+u.ph)*1.5,cz);
  }
  gustT=(gustT??18)-dt;
  if(gustT<=0){gustT=rand(22,44);
    sNoise(2.4,'lowpass',220,760,.028);}
  if(calm){crowCawT-=dt;
    if(crowCawT<=0){crowCawT=rand(24,50);
      sTone('sawtooth',rand(620,780),rand(380,460),.14,.05);
      setTimeout(()=>sTone('sawtooth',rand(600,740),380,.12,.04),200);}}
}
/* ---------------- wildlife: the country is not only dead things ---------------- */
const DEER=[];
{
  const hideM=new THREE.MeshStandardMaterial({color:0x6a4f35,roughness:.9});
  const darkM=new THREE.MeshStandardMaterial({color:0x3a2c1e,roughness:.95});
  for(let i=0;i<4;i++){
    const g=new THREE.Group();
    const body=new THREE.Mesh(new THREE.CylinderGeometry(.34,.4,1.5,7),hideM);
    body.rotation.z=Math.PI/2;body.position.y=1.05;g.add(body);
    const front=new THREE.Group();front.position.set(.6,1.3,0);g.add(front); // neck+head tip together
    const neck=new THREE.Mesh(new THREE.CylinderGeometry(.11,.16,.85,5),hideM);
    neck.position.set(.18,.2,0);neck.rotation.z=-.5;front.add(neck);
    const head=new THREE.Mesh(new THREE.BoxGeometry(.42,.22,.2),hideM);
    head.position.set(.52,.56,0);front.add(head);
    const earL=new THREE.Mesh(new THREE.ConeGeometry(.06,.2,4),darkM);
    earL.position.set(.4,.72,.12);front.add(earL);
    const earR=earL.clone();earR.position.z=-.12;front.add(earR);
    if(i%2===0){ // a buck carries his crown
      for(const sz of[-.08,.08]){
        const a1=new THREE.Mesh(new THREE.CylinderGeometry(.02,.035,.5,4),darkM);
        a1.position.set(.42,.9,sz);a1.rotation.x=sz*4;a1.rotation.z=.5;front.add(a1);
        const a2=new THREE.Mesh(new THREE.CylinderGeometry(.015,.025,.3,4),darkM);
        a2.position.set(.45,1.02,sz*1.8);a2.rotation.x=sz*7;front.add(a2);
      }
    }
    const tail=new THREE.Mesh(new THREE.ConeGeometry(.09,.26,5),darkM);
    tail.position.set(-.82,1.28,0);tail.rotation.z=1.2;g.add(tail);
    const legs=[];
    for(const[lx,lz]of[[.55,.2],[.55,-.2],[-.55,.2],[-.55,-.2]]){
      const leg=new THREE.Mesh(new THREE.CylinderGeometry(.05,.04,1.0,5),darkM);
      leg.geometry.translate(0,-.5,0);   // pivot at the hip
      leg.position.set(lx,1.0,lz);g.add(leg);legs.push(leg);
    }
    g.traverse(o=>{if(o.isMesh)o.castShadow=true;});
    g.visible=false;scene.add(g);
    DEER.push({mesh:g,legs,front,x:0,z:0,a:0,state:'graze',t:rand(2,6),sp:0,ph:rand(TAU),alive:true});
  }
}
const RABBITS=[];
{
  const furM=new THREE.MeshStandardMaterial({color:0x7a6a52,roughness:.95});
  const tailM=new THREE.MeshStandardMaterial({color:0xd8d2c4,roughness:1});
  for(let i=0;i<6;i++){
    const g=new THREE.Group();
    const body=new THREE.Mesh(new THREE.SphereGeometry(.16,7,6),furM);
    body.scale.set(1,.85,1.4);body.position.y=.16;g.add(body);
    const head=new THREE.Mesh(new THREE.SphereGeometry(.09,6,5),furM);
    head.position.set(0,.28,.2);g.add(head);
    for(const s of[-1,1]){
      const ear=new THREE.Mesh(new THREE.ConeGeometry(.03,.17,4),furM);
      ear.position.set(s*.04,.43,.18);ear.rotation.x=-.15;g.add(ear);
    }
    const tail=new THREE.Mesh(new THREE.SphereGeometry(.05,5,4),tailM);
    tail.position.set(0,.18,-.24);g.add(tail);
    g.traverse(o=>{if(o.isMesh)o.castShadow=true;});
    g.visible=false;scene.add(g);
    RABBITS.push({mesh:g,x:0,z:0,a:0,state:'nibble',t:rand(1,4),hopT:rand(TAU),alive:true,ph:rand(TAU)});
  }
}
let wolfT=50;
/* tumbleweeds: the dry country's only traffic */
const WEEDS=[];
{
  const m=new THREE.MeshStandardMaterial({color:0x8a7448,roughness:1,wireframe:true});
  for(let i=0;i<3;i++){
    const w=new THREE.Mesh(new THREE.IcosahedronGeometry(rand(.45,.7),1),m);
    w.visible=false;w.castShadow=true;scene.add(w);
    WEEDS.push({mesh:w,x:0,z:0,r:w.geometry.parameters.radius,active:false,ph:rand(TAU)});
  }
}
/* geese: a V crossing high, going somewhere better */
const GEESE=[];
{
  const c=document.createElement('canvas');c.width=32;c.height=16;
  const g=c.getContext('2d');g.strokeStyle='rgba(48,44,38,.95)';g.lineWidth=2.6;
  g.beginPath();g.moveTo(2,11);g.quadraticCurveTo(9,3,16,9);g.quadraticCurveTo(23,3,30,11);g.stroke();
  const tex=new THREE.CanvasTexture(c);
  for(let i=0;i<7;i++){
    const sp=new THREE.Sprite(new THREE.SpriteMaterial({map:tex,transparent:true,opacity:.9}));
    sp.scale.set(2.2,1.1,1);sp.visible=false;scene.add(sp);
    GEESE.push(sp);
  }
}
let geeseT=70,geese=null;
/* ducks: where there is water, something is always already using it */
const DUCKS=[];
{
  for(let i=0;i<3;i++){
    const g=new THREE.Group();
    const drake=i%2===0;
    const body=new THREE.Mesh(new THREE.SphereGeometry(.16,7,5),
      new THREE.MeshStandardMaterial({color:drake?0x5a4a38:0x6a5844,roughness:.9}));
    body.scale.set(1,.7,1.5);body.position.y=.1;g.add(body);
    const head=new THREE.Mesh(new THREE.SphereGeometry(.08,6,5),
      new THREE.MeshStandardMaterial({color:drake?0x1e4a2e:0x4a3c30,roughness:.7}));
    head.position.set(0,.26,.18);g.add(head);
    const beak=new THREE.Mesh(new THREE.ConeGeometry(.03,.09,4),
      new THREE.MeshStandardMaterial({color:0xb89030,roughness:.8}));
    beak.rotation.x=Math.PI/2;beak.position.set(0,.25,.3);g.add(beak);
    g.traverse(o=>{if(o.isMesh)o.castShadow=true;});
    g.visible=false;scene.add(g);
    DUCKS.push({mesh:g,pond:null,a:rand(TAU),r:.5,state:'paddle',vy:0,ph:rand(TAU)});
  }
}
function scatterDeer(){
  const ok=!BAST.on;          // no living thing grazes a battlefield
  {
    const wet=ponds.filter(p=>p.visible&&!BIOME.snow); // nobody paddles on ice
    for(const dk of DUCKS){
      dk.pond=ok&&wet.length&&Math.random()<.7?pick(wet):null;
      dk.state='paddle';dk.a=rand(TAU);dk.r=rand(.3,.65);
      dk.mesh.visible=false;
    }
  }
  for(const r of RABBITS){
    r.alive=ok&&Math.random()<.6;
    r.mesh.visible=false;
    if(!r.alive)continue;
    const a=rand(TAU),rr=rand(half*.35,half*.85);
    r.x=clamp(Math.cos(a)*rr,-half+8,half-8);
    r.z=clamp(Math.sin(a)*rr,-half+8,half-8);
    r.a=rand(TAU);r.state='nibble';r.t=rand(1,4);
  }
  for(const d of DEER){
    d.alive=ok&&Math.random()<.75;
    d.mesh.visible=false;
    if(!d.alive)continue;
    const a=rand(TAU),r=rand(half*.45,half*.85);
    d.x=clamp(Math.cos(a)*r,-half+10,half-10);
    d.z=clamp(Math.sin(a)*r,-half+10,half-10);
    d.a=rand(TAU);d.state='graze';d.t=rand(2,6);d.sp=0;
  }
}
function updateWildlife(dt,t,nf){
  { // tumbleweeds roll wherever the country is dry enough to let go of things
    const dry=BIOME.desert||BIOME.grassK>1.5||BIOME.name==='SALT FLATS';
    for(const w of WEEDS){
      w.active=dry&&G.state==='play';
      w.mesh.visible=w.active;
      if(!w.active)continue;
      if(!w.init||Math.hypot(w.x-player.x,w.z-player.z)>85){ // recycle upwind of the player
        w.init=true;
        w.x=player.x+rand(-70,-40);w.z=player.z+rand(-60,60);
      }
      const sp=3.2+Math.sin(t*.5+w.ph)*1.1;     // the wind comes in long breaths
      w.x+=sp*dt;w.z+=Math.sin(t*.33+w.ph)*dt*.9;
      const h=heightAt(w.x,w.z);
      const bounce=Math.abs(Math.sin(t*2.2+w.ph))*.5*Math.min(1,sp/3);
      w.mesh.position.set(w.x,h+w.r+bounce*.6,w.z);
      w.mesh.rotation.z-=sp*dt/w.r;             // rolling, not sliding
      w.mesh.rotation.y=Math.sin(t*.4+w.ph)*.3;
    }
  }
  { // geese: every few minutes a V crosses, and the war means nothing to it
    geeseT-=dt;
    if(geeseT<=0&&!geese&&nf<.6&&!BIOME.ash&&G.state==='play'){
      geeseT=rand(110,220);
      const a=rand(TAU);
      geese={a,x:player.x-Math.cos(a)*180,z:player.z-Math.sin(a)*180,t:0};
      sTone('sawtooth',rand(420,520),rand(300,360),.16,.03);
      setTimeout(()=>sTone('sawtooth',rand(400,500),320,.14,.025),350);
    }
    if(geese){
      geese.t+=dt;
      geese.x+=Math.cos(geese.a)*16*dt;geese.z+=Math.sin(geese.a)*16*dt;
      const px2=-Math.sin(geese.a),pz2=Math.cos(geese.a);
      for(let i=0;i<GEESE.length;i++){
        const row=Math.ceil(i/2),side=i%2?1:-1; // the V
        const gx=geese.x-Math.cos(geese.a)*row*2.4+px2*side*row*2.2,
              gz=geese.z-Math.sin(geese.a)*row*2.4+pz2*side*row*2.2;
        GEESE[i].visible=true;
        GEESE[i].position.set(gx,heightAt(gx,gz)+34+Math.sin(t*1.8+i)*1.2,gz);
      }
      if(geese.t>26){geese=null;for(const s of GEESE)s.visible=false;}
    }else for(const s of GEESE)s.visible=false;
  }
  for(const dk of DUCKS){ // paddling circles until something with boots gets curious
    if(!dk.pond){dk.mesh.visible=false;continue;}
    dk.mesh.visible=true;
    const P=dk.pond;
    if(dk.state==='paddle'){
      dk.a+=dt*.25;
      const rr=P.scale.x*dk.r*(1+Math.sin(t*.3+dk.ph)*.25);
      const x=P.position.x+Math.cos(dk.a)*rr,z=P.position.z+Math.sin(dk.a)*rr;
      dk.mesh.position.set(x,P.position.y+.02+Math.sin(t*2.1+dk.ph)*.025,z);
      dk.mesh.rotation.y=-dk.a;                       // beak leads the turn
      if(Math.hypot(player.x-x,player.z-z)<9){dk.state='fly';dk.vy=2.2;dk.t2=0;
        sNoise(.14,'bandpass',1400,700,.05);          // wings slap the water
        dk.fa=Math.atan2(x-player.x,z-player.z);}
    }else{ // fly: up, away, gone
      dk.t2=(dk.t2||0)+dt;
      dk.mesh.position.x+=Math.sin(dk.fa)*9*dt;
      dk.mesh.position.z+=Math.cos(dk.fa)*9*dt;
      dk.mesh.position.y+=dk.vy*dt;dk.vy=Math.min(4,dk.vy+dt*2);
      dk.mesh.rotation.y=dk.fa;
      dk.mesh.position.y+=Math.sin(t*14)*.02;          // wingbeat
      if(dk.t2>6)dk.pond=null;
    }
  }
  // somewhere out past the treeline, the wolves keep their own count
  if(nf>.6&&!BAST.on&&G.state==='play'){
    wolfT-=dt;
    if(wolfT<=0){
      wolfT=rand(45,95);
      sTone('sine',290,440,1.2,.045);
      setTimeout(()=>sTone('sine',450,235,1.6,.04),1100);
      setTimeout(()=>sTone('sine',300,420,1.1,.022),2600); // a second voice, further off
      setTimeout(()=>sTone('sine',430,250,1.3,.018),3650);
    }
  }
  for(const r of RABBITS){
    if(!r.alive){r.mesh.visible=false;continue;}
    r.mesh.visible=true;
    const pd=Math.hypot(player.x-r.x,player.z-r.z);
    let zd=99;
    for(const z of zombies)if(z.alive&&z.rise<=0){
      const dd=Math.hypot(z.x-r.x,z.z-r.z);if(dd<zd)zd=dd;}
    if(r.state!=='bolt'&&(pd<7||zd<6||(muzzle.intensity>1&&pd<40))){
      r.state='bolt';r.t=rand(2,3.2);
      r.a=Math.atan2(r.x-player.x,r.z-player.z)+rand(-.5,.5);
    }
    r.t-=dt;
    let sp=0;
    if(r.state==='bolt'){
      sp=5.4;r.a+=Math.sin(t*9+r.ph)*dt*2.4;     // a rabbit never runs in a straight line
      if(r.t<=0){r.state='nibble';r.t=rand(2,5);}
    }else if(r.state==='hop'){
      sp=1.4;
      if(r.t<=0){r.state='nibble';r.t=rand(1.5,4);}
    }else if(r.t<=0){r.state='hop';r.a=rand(TAU);r.t=rand(1,2.5);}
    if(sp>0){
      r.hopT+=dt*(sp>3?11:7);
      r.x=clamp(r.x+Math.sin(r.a)*sp*dt,-half+5,half-5);
      r.z=clamp(r.z+Math.cos(r.a)*sp*dt,-half+5,half-5);
    }
    r.mesh.position.set(r.x,heightAt(r.x,r.z)+(sp>0?Math.abs(Math.sin(r.hopT))*.22:0),r.z);
    r.mesh.rotation.y=r.a;
  }
  for(const d of DEER){
    if(!d.alive){d.mesh.visible=false;continue;}
    d.mesh.visible=true;
    // fear: the player too close, the dead too close, or gunfire
    let threatA=null;
    const pd=Math.hypot(player.x-d.x,player.z-d.z);
    if(pd<18||(muzzle.intensity>1&&pd<60))threatA=Math.atan2(d.x-player.x,d.z-player.z);
    if(!threatA)for(const z of zombies){if(!z.alive||z.rise>0)continue;
      const zd=Math.hypot(z.x-d.x,z.z-d.z);
      if(zd<13){threatA=Math.atan2(d.x-z.x,d.z-z.z);break;}}
    if(threatA!==null){d.state='flee';d.fleeA=threatA;d.t=rand(2.5,4);}
    d.t-=dt;
    if(d.state==='flee'){
      d.a=lerp(d.a,d.fleeA,Math.min(1,dt*6));
      d.sp=Math.min(9,d.sp+dt*22);
      if(d.t<=0&&pd>42){d.state='graze';d.t=rand(3,7);}
    }else if(d.state==='amble'){
      d.sp=Math.min(1.6,d.sp+dt*4);
      if(d.t<=0){d.state='graze';d.t=rand(3,8);}
    }else{ // graze
      d.sp=Math.max(0,d.sp-dt*8);
      if(d.t<=0){d.state='amble';d.a=rand(TAU);d.t=rand(2,5);}
    }
    if(d.sp>0){
      d.x+=Math.sin(d.a)*d.sp*dt;d.z+=Math.cos(d.a)*d.sp*dt;
      d.x=clamp(d.x,-half+6,half-6);d.z=clamp(d.z,-half+6,half-6);
    }
    d.mesh.position.set(d.x,heightAt(d.x,d.z),d.z);
    d.mesh.rotation.y=d.a-Math.PI/2;
    const stride=d.sp>4?11:7;
    for(let li=0;li<4;li++)
      d.legs[li].rotation.x=d.sp>.1?Math.sin(t*stride+d.ph+(li%2?Math.PI:0))*.5*Math.min(1,d.sp/3):0;
    // head down to graze, up to run
    const wantTip=d.state==='graze'&&d.sp<.2?-1.05:0;
    d.front.rotation.z=lerp(d.front.rotation.z,wantTip,Math.min(1,dt*3));
  }
}
const DUST_N=240;
const dustGeo=new THREE.BufferGeometry();
const dustPos=new Float32Array(DUST_N*3),dustVel=new Float32Array(DUST_N*3);
for(let i=0;i<DUST_N;i++){
  dustPos[i*3]=rand(-18,18);dustPos[i*3+1]=rand(0,9);dustPos[i*3+2]=rand(-18,18);
  dustVel[i*3]=rand(-.3,.3);dustVel[i*3+1]=rand(-.12,.06);dustVel[i*3+2]=rand(-.3,.3);
}
dustGeo.setAttribute('position',new THREE.BufferAttribute(dustPos,3));
const dustMat=new THREE.PointsMaterial({color:0xffe8c0,size:.045,transparent:true,opacity:.4,
  blending:THREE.AdditiveBlending,depthWrite:false,sizeAttenuation:true});
const dust=new THREE.Points(dustGeo,dustMat);
dust.frustumCulled=false;scene.add(dust);
function updateDust(dt){
  dust.position.set(player.x,player.y,player.z);
  for(let i=0;i<DUST_N;i++){
    let x=dustPos[i*3]+dustVel[i*3]*dt,y=dustPos[i*3+1]+dustVel[i*3+1]*dt,z=dustPos[i*3+2]+dustVel[i*3+2]*dt;
    if(x<-18)x+=36;if(x>18)x-=36;if(z<-18)z+=36;if(z>18)z-=36;
    if(y<-3)y+=12;if(y>9)y-=12;
    dustPos[i*3]=x;dustPos[i*3+1]=y;dustPos[i*3+2]=z;
  }
  dustGeo.attributes.position.needsUpdate=true;
}
const sea=new THREE.Mesh(new THREE.PlaneGeometry(760,260,96,32),
  new THREE.MeshStandardMaterial({color:0x16202a,roughness:.12,metalness:.55,envMapIntensity:1.6}));
sea.material.onBeforeCompile=s=>{ // the dead flat sea learns to breathe
  s.uniforms.uT=WindU;
  s.vertexShader='uniform float uT;\n'+s.vertexShader
    .replace('#include <beginnormal_vertex>',`#include <beginnormal_vertex>
      float swA=position.x*.045+uT*.7, swB=position.y*.085-uT*.5, swC=(position.x+position.y)*.12+uT*1.05;
      float dhdx=.42*.045*cos(swA)+.14*.12*cos(swC);
      float dhdy=.26*.085*cos(swB)+.14*.12*cos(swC);
      objectNormal=normalize(vec3(-dhdx*6.,-dhdy*6.,1.));`)
    .replace('#include <begin_vertex>',`#include <begin_vertex>
      transformed.z+=.42*sin(swA)+.26*sin(swB)+.14*sin(swC);`);
};
sea.rotation.x=-Math.PI/2;sea.position.set(0,-.7,175);sea.visible=false;scene.add(sea);
/* ponds: standing water in the country's hollows; ice where it's cold enough */
const ponds=[];
const pondMat=(()=>{
  const c=document.createElement('canvas');c.width=c.height=128;
  const g=c.getContext('2d');
  const rg=g.createRadialGradient(64,64,30,64,64,64);
  rg.addColorStop(0,'rgba(255,255,255,1)');rg.addColorStop(.78,'rgba(255,255,255,.9)');
  rg.addColorStop(1,'rgba(255,255,255,0)');     // banks fade into the mud
  g.fillStyle=rg;g.fillRect(0,0,128,128);
  const alpha=new THREE.CanvasTexture(c);
  const m=new THREE.MeshStandardMaterial({color:0x141f28,roughness:.07,metalness:.6,
    envMapIntensity:1.9,transparent:true,alphaMap:alpha,depthWrite:false});
  m.onBeforeCompile=s=>{ // a small wind worries the surface
    s.uniforms.uT=WindU;
    s.vertexShader='uniform float uT;\n'+s.vertexShader
      .replace('#include <beginnormal_vertex>',`#include <beginnormal_vertex>
        float pwA=uv.x*34.+uT*1.3,pwB=uv.y*27.-uT*1.05;
        objectNormal=normalize(vec3(-.05*cos(pwA),-.04*cos(pwB),1.));`);
  };
  return m;
})();
const iceMat=new THREE.MeshStandardMaterial({color:0xaec6dd,roughness:.06,metalness:.35,
  envMapIntensity:2.1,transparent:true,opacity:.96,alphaMap:pondMat.alphaMap,depthWrite:false});
for(let i=0;i<5;i++){
  const p=new THREE.Mesh(new THREE.PlaneGeometry(2,2,10,10),pondMat);
  p.rotation.x=-Math.PI/2;p.visible=false;p.renderOrder=1;
  scene.add(p);ponds.push(p);
}
const reeds=(()=>{ // cattails: every pond wears a ragged collar
  const c=document.createElement('canvas');c.width=64;c.height=128;
  const g=c.getContext('2d');
  for(let i=0;i<11;i++){
    const bx=8+Math.random()*48,lean=rand(-7,7),top=rand(4,26);
    const grd=g.createLinearGradient(0,128,0,top);
    grd.addColorStop(0,'rgba(52,72,30,1)');grd.addColorStop(1,'rgba(118,128,62,.9)');
    g.strokeStyle=grd;g.lineWidth=rand(1.6,2.6);
    g.beginPath();g.moveTo(bx,128);g.quadraticCurveTo(bx+lean*.5,70,bx+lean,top);g.stroke();
    if(Math.random()<.5){ // the brown velvet head
      g.fillStyle='rgba(92,58,34,.95)';
      g.beginPath();g.ellipse(bx+lean,top+6,2.4,9,0,0,TAU);g.fill();
    }
  }
  const tex=new THREE.CanvasTexture(c);tex.colorSpace=THREE.SRGBColorSpace;
  const p1=new THREE.PlaneGeometry(1.5,2.6,1,3);p1.translate(0,1.2,0);
  const p2=p1.clone();p2.rotateY(Math.PI/2);
  const geo=mergeGeometries([p1,p2]);
  const mat=new THREE.MeshStandardMaterial({map:tex,alphaTest:.4,side:THREE.DoubleSide,
    roughness:.92,envMapIntensity:.3});
  mat.onBeforeCompile=s=>{
    s.uniforms.uWindT=WindU;
    s.vertexShader='uniform float uWindT;\n'+s.vertexShader.replace('#include <begin_vertex>',
      `#include <begin_vertex>
       vec4 rwp=instanceMatrix*vec4(transformed,1.);
       transformed.xz+=(sin(uWindT*1.4+rwp.x*.5+rwp.z*.4))*uv.y*uv.y*vec2(.13,.09);`);
  };
  const m=new THREE.InstancedMesh(geo,mat,150);
  m.count=0;scene.add(m);
  return m;
})();
function scatterPonds(){
  const want=BIOME.desert||BIOME.name==='SALT FLATS'?0:
    BIOME.name==='DROWNED MIRE'?5:BIOME.shore?1:2;
  let pi=0,ri=0;
  const M=new THREE.Matrix4(),Q=new THREE.Quaternion(),S=new THREE.Vector3(),P=new THREE.Vector3(),E=new THREE.Euler();
  for(let i=0;i<70&&pi<want;i++){
    const x=srand(-half+22,half-22),z=srand(-half+22,half-22);
    if(Math.hypot(x,z)<34||Math.abs(z-roadZ(x))<12)continue;
    for(let pass=0;pass<3;pass++)modifyTerrain(x,z,srand(4.5,7),-.5); // dig the basin
    const h=heightAt(x,z);
    const p=ponds[pi++];
    p.visible=true;
    p.scale.setScalar(srand(4.5,9));
    p.position.set(x,h+.45,z);    // water finds its level partway up the bank
    p.material=BIOME.snow?iceMat:pondMat;
    if(!BIOME.snow){ // reeds stand where the water meets the land
      const n=8+(srnd()*8|0);
      for(let r2=0;r2<n&&ri<150;r2++){
        const a2=srand(TAU),rr=p.scale.x*srand(.8,1.1);
        const rx=x+Math.cos(a2)*rr,rz=z+Math.sin(a2)*rr;
        E.set(0,srand(TAU),srand(-.08,.08));Q.setFromEuler(E);
        const sc=srand(.6,1.1);S.set(sc,sc*srand(.9,1.3),sc);
        P.set(rx,heightAt(rx,rz),rz);M.compose(P,Q,S);
        reeds.setMatrixAt(ri++,M);
      }
    }
  }
  for(let i=pi;i<ponds.length;i++)ponds[i].visible=false;
  reeds.count=ri;
  reeds.instanceMatrix.needsUpdate=true;
  reeds.computeBoundingSphere();
}
const setpieces=new THREE.Group();scene.add(setpieces);
function scatterSetpieces(){
  while(setpieces.children.length)setpieces.remove(setpieces.children[0]);
  const rust=frostable(new THREE.MeshStandardMaterial({color:0x4f4434,roughness:.7,metalness:.45}));
  const rustD=frostable(new THREE.MeshStandardMaterial({color:0x35302a,roughness:.8,metalness:.3}));
  if(srnd()<.75){ // a dead tank, somewhere different every time
    const tank=new THREE.Group();
    const hull=new THREE.Mesh(new THREE.BoxGeometry(6,1.9,3.4),rust);hull.position.y=1.1;hull.castShadow=true;
    const tur=new THREE.Mesh(new THREE.BoxGeometry(2.6,1,2.4),rustD);tur.position.set(-.4,2.5,0);tur.rotation.y=.7;tur.castShadow=true;
    const gun=new THREE.Mesh(new THREE.CylinderGeometry(.12,.16,3.6),rustD);
    gun.rotation.z=Math.PI/2-.12;gun.rotation.y=.7;gun.position.set(1.2,2.6,1.2);gun.castShadow=true;
    for(const s of[-1,1]){
      const tr=new THREE.Mesh(new THREE.BoxGeometry(6.4,1.1,.7),rustD);
      tr.position.set(0,.55,s*1.75);tank.add(tr);
      for(let wx2=-2.2;wx2<=2.2;wx2+=1.1){ // road wheels sunk in the tread line
        const wh=new THREE.Mesh(new THREE.CylinderGeometry(.52,.52,.24,14),rust);
        wh.rotation.x=Math.PI/2;wh.position.set(wx2,.52,s*1.95);tank.add(wh);
      }
    }
    tank.add(hull,tur,gun);
    const tx=srand(-half+30,half-30),tz=srand(-half+30,half-30);
    tank.position.set(tx,heightAt(tx,tz)-.35,tz);
    tank.rotation.y=srand(TAU);tank.rotation.z=.06;
    setpieces.add(tank);
  }
  const brick=frostable(new THREE.MeshStandardMaterial({color:0xc4b5a4,roughness:.9,
    map:brickTex,bumpMap:brickTex,bumpScale:.35}));
  const nWalls=2+(srnd()*3|0);
  for(let wI=0;wI<nWalls;wI++){
    const wx=srand(-half+14,half-14),wz=srand(-half+14,half-14);
    if(Math.abs(wz-roadZ(wx))<10)continue;
    const wall=new THREE.Group();
    let bx=-2.2;
    while(bx<2.2){
      const h=srand(.8,2.4);
      const seg=new THREE.Mesh(new THREE.BoxGeometry(srand(.8,1.4),h,.45),brick);
      seg.position.set(bx,h/2,0);seg.castShadow=true;wall.add(seg);
      bx+=seg.geometry.parameters.width+srand(.05,.3);
    }
    wall.position.set(wx,heightAt(wx,wz),wz);wall.rotation.y=srand(TAU);
    setpieces.add(wall);
    COLLIDERS.push({x:wx,z:wz,r:2.6});
  }
}
scatterSetpieces();

/* ---------------- the dead city: streets you drive through ---------------- */
const facadeTex=(()=>{
  const c=document.createElement('canvas');c.width=c.height=512;
  const g=c.getContext('2d');
  g.fillStyle='#43382f';g.fillRect(0,0,512,512);
  for(let i=0;i<10400;i++){const v=40+Math.random()*45|0;  // brick speckle, twice as fine
    g.fillStyle=`rgba(${v},${v*.9|0},${v*.78|0},.5)`;
    g.fillRect(Math.random()*512,Math.random()*512,4,2.4);}
  for(let yy=0;yy<512;yy+=11){                  // mortar courses the old map was too coarse for
    g.fillStyle='rgba(28,22,17,.28)';g.fillRect(0,yy,512,1.6);
  }
  for(let yy=28;yy<512;yy+=92)for(let xx=28;xx<512;xx+=80){
    const broken=Math.random();
    if(broken<.14)continue;                       // bricked over
    g.fillStyle=broken<.5?'#0c0a08':'#15110c';    // hollow rooms
    g.fillRect(xx,yy,44,60);
    g.fillStyle='rgba(190,178,150,.5)';           // a worn sill below every window
    g.fillRect(xx-3,yy+60,50,4);
    if(broken>.86){g.fillStyle='rgba(0,0,0,.85)'; // blast scorch above the frame
      g.beginPath();g.ellipse(xx+22,yy-8,30,16,0,0,TAU);g.fill();}
  }
  const t=new THREE.CanvasTexture(c);t.anisotropy=8;
  t.wrapS=t.wrapT=THREE.RepeatWrapping;t.colorSpace=THREE.SRGBColorSpace;
  return t;
})();
const cityWalls=new THREE.InstancedMesh(
  new THREE.BoxGeometry(9,10,.6),
  frostable(new THREE.MeshStandardMaterial({map:facadeTex,roughness:.92,color:0xd0c2ae,envMapIntensity:.5,
    bumpMap:facadeTex,bumpScale:.55})),120);
cityWalls.castShadow=cityWalls.receiveShadow=true;
const cityRubble=new THREE.InstancedMesh(
  new THREE.IcosahedronGeometry(1,1),
  frostable(new THREE.MeshStandardMaterial({color:0x8d8276,roughness:.95,
    map:brickTex,bumpMap:brickTex,bumpScale:.4})),90); // collapsed masonry, not grey blobs
cityRubble.castShadow=true;
const cityWins=new THREE.InstancedMesh(
  new THREE.PlaneGeometry(.5,.7),
  new THREE.MeshBasicMaterial({color:0xffffff,transparent:true,opacity:.9,side:THREE.DoubleSide}),44);
cityWins.material.color.setRGB(3.4,2.0,.8);   // someone still pays for lamp oil
cityWins.visible=false;
scene.add(cityWins);
const cityBeams=new THREE.InstancedMesh(
  new THREE.CylinderGeometry(.09,.13,7,8),
  new THREE.MeshStandardMaterial({color:0x17130e,roughness:1}),58);
cityBeams.castShadow=true;
scene.add(cityWalls);scene.add(cityRubble);scene.add(cityBeams);
function scatterCity(){
  const M=new THREE.Matrix4(),Q=new THREE.Quaternion(),S=new THREE.Vector3(),P=new THREE.Vector3(),E=new THREE.Euler();
  const C=new THREE.Color();
  let wi=0,ri=0,bi=0;
  const k=BIOME.city||0;
  const WV=new THREE.Vector3();
  let wn=0;
  const wall=(x,z,ry,w,h,hue)=>{
    if(wi>=118)return;
    E.set(0,ry,srnd()<.1?srand(-.05,.05):0);Q.setFromEuler(E);
    S.set(w/9,h,1);
    P.set(x,heightAt(x,z)+5*h-srand(0,.9),z);
    M.compose(P,Q,S);
    DESTRUCT.push({m:cityWalls,i:wi,x,z});cityWalls.setMatrixAt(wi,M);
    cityWalls.setColorAt(wi++,C.setHSL(hue,.18+srnd()*.1,.34+srnd()*.14));
    if(wn<44&&srnd()<.2){ // a window where a lamp still burns
      WV.set(srand(-w*.3,w*.3),srand(.5,2.5)*h,.36).applyQuaternion(Q);
      const M2=new THREE.Matrix4();
      M2.compose(WV.add(P),Q,new THREE.Vector3(1,1,1));
      cityWins.setMatrixAt(wn++,M2);
    }
  };
  if(k>0){
    // whole houses: a box of walls, some of them stolen by the war
    for(let x=-half+22;x<half-22&&wi<110;x+=srand(16,26)){
      for(const sd of[-1,1]){
        if(srnd()>k*.8)continue;
        const off=srand(13,19);
        const cz=roadZ(x)+off*sd;
        if(Math.abs(cz)>half-14)continue;
        const hw=srand(.7,1.1),hd=srand(.6,.95),hh=srand(.55,1.1);
        const heading=Math.atan2(roadZ(x+2)-roadZ(x-2),4);
        const hue=.06+srnd()*.05;
        const cs=Math.cos(-heading),sn=Math.sin(-heading);
        const put=(lx,lz,ry,w)=>wall(x+lx*cs-lz*sn,cz+lx*sn+lz*cs,ry-heading,w,hh*srand(.8,1.1),hue);
        if(srnd()<.92)put(0,-hd*4.5,0,9*hw);            // street face
        if(srnd()<.75)put(0, hd*4.5,0,9*hw);            // back wall
        if(srnd()<.8) put(-hw*4.5,0,Math.PI/2,9*hd);    // sides: sometimes gone entirely
        if(srnd()<.8) put( hw*4.5,0,Math.PI/2,9*hd);
        // charred rafters leaning where the roof used to be
        if(bi<58&&srnd()<.8)for(let r2=0;r2<2&&bi<58;r2++){
          E.set(srand(-.3,.3),srand(TAU),srand(.6,1.1));Q.setFromEuler(E);
          S.set(1,srand(.7,1.2),1);
          P.set(x+srand(-3,3),heightAt(x,cz)+srand(2,4.5)*hh,cz+srand(-3,3));
          M.compose(P,Q,S);DESTRUCT.push({m:cityBeams,i:bi,x,z:cz});cityBeams.setMatrixAt(bi++,M);
        }
        COLLIDERS.push({x,z:cz,r:Math.max(hw,hd)*4.8});
        if(wi>=110)break;
      }
    }
    // rubble spills toward the road
    for(let i=0;i<88&&ri<88;i++){
      const x=srand(-half+14,half-14);
      const z=roadZ(x)+srand(5,12)*(srnd()<.5?-1:1);
      E.set(srand(TAU),srand(TAU),0);Q.setFromEuler(E);
      S.set(srand(.6,2.4),srand(.4,1.2),srand(.6,2.4));
      P.set(x,heightAt(x,z)+.2,z);
      M.compose(P,Q,S);cityRubble.setMatrixAt(ri++,M);
    }
  }
  cityWalls.count=wi;cityRubble.count=ri;cityBeams.count=bi;cityWins.count=wn;
  cityWins.instanceMatrix.needsUpdate=true;cityWins.computeBoundingSphere();
  cityWalls.instanceMatrix.needsUpdate=true;
  if(cityWalls.instanceColor)cityWalls.instanceColor.needsUpdate=true;
  cityRubble.instanceMatrix.needsUpdate=true;
  cityBeams.instanceMatrix.needsUpdate=true;
  cityWalls.computeBoundingSphere();
  cityRubble.computeBoundingSphere();
  cityBeams.computeBoundingSphere();
}
scatterCity();


/* ---------------- atmosphere: mist + rain + smoke ---------------- */
const mists=[];
{
  const c=document.createElement('canvas');c.width=c.height=128;
  const g=c.getContext('2d');
  const rg=g.createRadialGradient(64,64,8,64,64,62);
  rg.addColorStop(0,'rgba(235,235,228,.5)');rg.addColorStop(.7,'rgba(235,235,228,.16)');rg.addColorStop(1,'rgba(235,235,228,0)');
  g.fillStyle=rg;g.fillRect(0,0,128,128);
  const tex=new THREE.CanvasTexture(c);
  const geo=new THREE.PlaneGeometry(85,85);geo.rotateX(-Math.PI/2);
  for(let i=0;i<9;i++){
    const m=new THREE.Mesh(geo,new THREE.MeshBasicMaterial({map:tex,transparent:true,opacity:.05,depthWrite:false}));
    const x=rand(-130,130),z=rand(-130,130);
    m.position.set(x,heightAt(x,z)+1.7,z);
    m.userData={bx:x,bz:z,ph:rand(TAU),sp:rand(.5,1.3)};
    m.renderOrder=5;
    scene.add(m);mists.push(m);
  }
}
const RAIN_N=420;
const rainGeo=new THREE.BufferGeometry();
rainGeo.setAttribute('position',new THREE.BufferAttribute(new Float32Array(RAIN_N*6),3));
const rainMat=new THREE.LineBasicMaterial({transparent:true,opacity:0});
rainMat.color.setRGB(.5,.62,.85);
const rainMesh=new THREE.LineSegments(rainGeo,rainMat);
rainMesh.frustumCulled=false;scene.add(rainMesh);
const rainDrops=new Float32Array(RAIN_N*3);
for(let i=0;i<RAIN_N;i++){rainDrops[i*3]=rand(-40,40);rainDrops[i*3+1]=rand(0,25);rainDrops[i*3+2]=rand(-40,40);}
function updateRain(dt,nf){
  const k=clamp((nf-.45)*2.2,0,1);
  rainMat.opacity=k*.32;
  if(AU.rainG)AU.rainG.gain.value=k*.009;
  if(k<=0)return;
  const pos=rainGeo.attributes.position.array;
  for(let i=0;i<RAIN_N;i++){
    let x=rainDrops[i*3],y=rainDrops[i*3+1],z=rainDrops[i*3+2];
    y-=42*dt;
    if(y<heightAt(x,z)){
      x=player.x+rand(-34,34);z=player.z+rand(-34,34);
      y=player.y+rand(14,26);
    }
    rainDrops[i*3]=x;rainDrops[i*3+1]=y;rainDrops[i*3+2]=z;
    pos[i*6]=x;pos[i*6+1]=y;pos[i*6+2]=z;
    pos[i*6+3]=x+.12;pos[i*6+4]=y-.72;pos[i*6+5]=z+.06;
  }
  rainGeo.attributes.position.needsUpdate=true;
}
/* snowfall: the white waste keeps its own weather */
const SNOW_N=700;
const snowGeo=new THREE.BufferGeometry();
const snowPos=new Float32Array(SNOW_N*3),snowPh=new Float32Array(SNOW_N);
for(let i=0;i<SNOW_N;i++){snowPos[i*3]=rand(-26,26);snowPos[i*3+1]=rand(0,16);snowPos[i*3+2]=rand(-26,26);snowPh[i]=rand(TAU);}
snowGeo.setAttribute('position',new THREE.BufferAttribute(snowPos,3));
const snowPts=new THREE.Points(snowGeo,new THREE.PointsMaterial({color:0xe8eef8,size:.07,
  map:softDot,transparent:true,opacity:0,depthWrite:false,sizeAttenuation:true}));
snowPts.frustumCulled=false;scene.add(snowPts);
function updateSnow(dt,t){
  const falling=BIOME.snow||BIOME.ash;
  const want=falling&&G.state==='play'?(BIOME.ash?.6:.8):0;
  snowPts.material.opacity+=(want-snowPts.material.opacity)*Math.min(1,dt*1.5);
  if(falling)snowPts.material.color.setHex(BIOME.ash?0x9a948c:0xe8eef8); // snow, or what passes for it
  if(snowPts.material.opacity<.02){snowPts.visible=false;return;}
  snowPts.visible=true;
  snowPts.position.set(player.x,player.y,player.z);
  const fall=BIOME.ash?.65:1.4;                  // ash hangs in the air longer
  for(let i=0;i<SNOW_N;i++){
    let y=snowPos[i*3+1]-dt*(fall+(i%5)*.22);    // each flake falls at its own pace
    snowPos[i*3]+=Math.sin(t*.8+snowPh[i])*dt*.8;
    snowPos[i*3+2]+=Math.cos(t*.66+snowPh[i])*dt*.65;
    if(y<-2)y+=18;
    if(snowPos[i*3]<-26)snowPos[i*3]+=52;else if(snowPos[i*3]>26)snowPos[i*3]-=52;
    if(snowPos[i*3+2]<-26)snowPos[i*3+2]+=52;else if(snowPos[i*3+2]>26)snowPos[i*3+2]-=52;
    snowPos[i*3+1]=y;
  }
  snowGeo.attributes.position.needsUpdate=true;
}
/* falling leaves: the broadleaf woods shed something all year in this country */
const LEAF_N=46;
const leafGeo=new THREE.BufferGeometry();
const leafPos=new Float32Array(LEAF_N*3),leafPh=new Float32Array(LEAF_N),leafCol=new Float32Array(LEAF_N*3);
{
  const C2=new THREE.Color();
  for(let i=0;i<LEAF_N;i++){
    leafPos[i*3]=rand(-25,25);leafPos[i*3+1]=rand(0,11);leafPos[i*3+2]=rand(-25,25);
    leafPh[i]=rand(TAU);
    C2.setHSL(rand(.05,.16),rand(.5,.75),rand(.28,.42));   // every autumn at once
    leafCol[i*3]=C2.r;leafCol[i*3+1]=C2.g;leafCol[i*3+2]=C2.b;
  }
}
leafGeo.setAttribute('position',new THREE.BufferAttribute(leafPos,3));
leafGeo.setAttribute('color',new THREE.BufferAttribute(leafCol,3));
const leafPts=new THREE.Points(leafGeo,new THREE.PointsMaterial({size:.09,vertexColors:true,
  transparent:true,opacity:0,depthWrite:false,sizeAttenuation:true}));
leafPts.frustumCulled=false;scene.add(leafPts);
function updateLeaves(dt,t){
  const leafy=BIOME.treeK>=.7&&!BIOME.snow&&!BIOME.desert&&!BIOME.ash;
  const want=leafy&&G.state==='play'?.85:0;
  leafPts.material.opacity+=(want-leafPts.material.opacity)*Math.min(1,dt*1.2);
  if(leafPts.material.opacity<.02){leafPts.visible=false;return;}
  leafPts.visible=true;
  leafPts.position.set(player.x,0,player.z);
  for(let i=0;i<LEAF_N;i++){
    let y=leafPos[i*3+1]-dt*(.55+(i%4)*.12);
    leafPos[i*3]+=Math.sin(t*1.9+leafPh[i])*dt*1.1;       // the flutter
    leafPos[i*3+2]+=Math.cos(t*1.55+leafPh[i]*1.3)*dt*.9;
    if(y<-1)y+=12;
    if(leafPos[i*3]<-25)leafPos[i*3]+=50;else if(leafPos[i*3]>25)leafPos[i*3]-=50;
    if(leafPos[i*3+2]<-25)leafPos[i*3+2]+=50;else if(leafPos[i*3+2]>25)leafPos[i*3+2]-=50;
    leafPos[i*3+1]=y;
  }
  leafGeo.attributes.position.needsUpdate=true;
}
/* footprints: the snow remembers where you walked; so does the dust */
const prints=[];
{
  const c=document.createElement('canvas');c.width=24;c.height=40;
  const g=c.getContext('2d');
  g.fillStyle='rgba(255,255,255,.95)';
  g.beginPath();g.ellipse(12,13,6.5,10.5,0,0,TAU);g.fill();  // sole
  g.beginPath();g.ellipse(12,32,5,5.5,0,0,TAU);g.fill();     // heel
  const tex=new THREE.CanvasTexture(c);
  const geo=new THREE.PlaneGeometry(.23,.4);geo.rotateX(-Math.PI/2);
  for(let i=0;i<40;i++){
    const m=new THREE.Mesh(geo,new THREE.MeshBasicMaterial({map:tex,alphaMap:tex,transparent:true,
      opacity:0,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-2,color:0x2e3a4e}));
    scene.add(m);prints.push({mesh:m,t:0});
  }
}
let printHead=0,printSide=1,printLastX=0,printLastZ=0;
function updatePrints(dt){
  for(const p of prints){
    if(p.t>0){p.t-=dt;p.mesh.material.opacity=Math.min(.42,p.t*.045);}
    else p.mesh.material.opacity=0;
  }
  if(!(BIOME.snow||BIOME.desert)||G.state!=='play'||!player.alive||player.ride)return;
  const dx=player.x-printLastX,dz=player.z-printLastZ;
  const d=Math.hypot(dx,dz);
  if(d<.8)return;
  printLastX=player.x;printLastZ=player.z;
  if(d>3)return;                       // teleports and respawns leave no tracks
  printSide*=-1;
  const p=prints[printHead];printHead=(printHead+1)%prints.length;
  const ox=-dz/d*.15*printSide,oz=dx/d*.15*printSide;
  p.t=22;
  p.mesh.position.set(player.x+ox,heightAt(player.x+ox,player.z+oz)+.03,player.z+oz);
  p.mesh.rotation.y=Math.atan2(dx,dz);
  p.mesh.material.color.setHex(BIOME.snow?0x39465c:0x2e2114);
}
const smokes=[];
{
  const c=document.createElement('canvas');c.width=c.height=64;
  const g=c.getContext('2d');
  const rg=g.createRadialGradient(32,32,4,32,32,30);
  rg.addColorStop(0,'rgba(238,232,216,.75)');rg.addColorStop(1,'rgba(238,232,216,0)');
  g.fillStyle=rg;g.fillRect(0,0,64,64);
  const tex=new THREE.CanvasTexture(c);
  for(let i=0;i<12;i++){
    const s=new THREE.Sprite(new THREE.SpriteMaterial({map:tex,transparent:true,opacity:0,depthWrite:false}));
    s.live=false;scene.add(s);smokes.push(s);
  }
}
function puffSmoke(p,big=false,soft=false){
  const s=smokes.find(s=>!s.live);if(!s)return;
  s.live=true;s.position.copy(p);
  s.userData=soft?{t:0,life:.45,g:1.0,vy:.8,o0:.10}
    :{t:0,life:big?1.5:.8,g:big?6.5:2,vy:big?2.4:1.1,o0:big?.62:.4};
  s.scale.setScalar(big?1.4:soft?.26:.32);
  s.material.color.copy(scene.fog.color).multiplyScalar(soft?3.4:2.5); // always brighter than the air behind it
  s.material.opacity=s.userData.o0;
}
function updateSmokes(dt){
  for(const s of smokes){
    if(!s.live)continue;
    const u=s.userData;u.t+=dt;
    s.position.y+=u.vy*dt;
    s.scale.setScalar(s.scale.x+u.g*dt);
    s.material.opacity=Math.max(0,(1-u.t/u.life)*u.o0);
    if(u.t>=u.life){s.live=false;s.material.opacity=0;}
  }
}

/* ---------------- particles / tracers / decals ---------------- */
const MAXP=1600;
const pGeo=new THREE.BufferGeometry();
const pPos=new Float32Array(MAXP*3),pCol=new Float32Array(MAXP*3);
pGeo.setAttribute('position',new THREE.BufferAttribute(pPos,3));
pGeo.setAttribute('color',new THREE.BufferAttribute(pCol,3));
const points=new THREE.Points(pGeo,new THREE.PointsMaterial({size:.3,vertexColors:true,
  map:softDot,transparent:true,depthWrite:false}));
points.frustumCulled=false;scene.add(points);
const pVel=new Float32Array(MAXP*3),pLife=new Float32Array(MAXP);
let pHead=0;
for(let i=0;i<MAXP;i++)pPos[i*3+1]=-999;
function burst(x,y,z,n,color,spread=4,up=3){
  const c=new THREE.Color(color);
  for(let i=0;i<n;i++){
    const k=pHead;pHead=(pHead+1)%MAXP;
    pPos[k*3]=x;pPos[k*3+1]=y;pPos[k*3+2]=z;
    pVel[k*3]=rand(-spread,spread);pVel[k*3+1]=rand(up*.3,up);pVel[k*3+2]=rand(-spread,spread);
    const v=rand(.6,1.1);
    pCol[k*3]=c.r*v;pCol[k*3+1]=c.g*v;pCol[k*3+2]=c.b*v;
    pLife[k]=rand(.4,.9);
  }
  pGeo.attributes.color.needsUpdate=true;
}
function updateParticles(dt){
  let any=false;
  for(let i=0;i<MAXP;i++){
    if(pLife[i]<=0)continue;any=true;
    pLife[i]-=dt;
    pVel[i*3+1]-=14*dt;
    pPos[i*3]+=pVel[i*3]*dt;pPos[i*3+1]+=pVel[i*3+1]*dt;pPos[i*3+2]+=pVel[i*3+2]*dt;
    if(pLife[i]<=0)pPos[i*3+1]=-999;
  }
  if(any)pGeo.attributes.position.needsUpdate=true;
}
/* fireflies: the dark keeps a few small lights of its own */
const FIREFLIES=[];
const fireflyPts=(()=>{
  const N=80;
  const geo=new THREE.BufferGeometry();
  geo.setAttribute('position',new THREE.BufferAttribute(new Float32Array(N*3),3));
  geo.setAttribute('color',new THREE.BufferAttribute(new Float32Array(N*3),3));
  for(let i=0;i<N;i++)FIREFLIES.push({a:rand(TAU),r:rand(8,46),sp:rand(.04,.14),
    ph:rand(TAU),bl:rand(1.4,3),y:rand(.5,2.2)});
  const p=new THREE.Points(geo,new THREE.PointsMaterial({size:.14,map:softDot,
    transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,vertexColors:true}));
  p.visible=false;p.frustumCulled=false;scene.add(p);
  return p;
})();
function updateFireflies(dt,t,nf){
  const on=nf>.55&&wxParam('rain',nf)<.05&&G.state==='play'&&!BIOME.snow;
  fireflyPts.visible=on;
  if(!on)return;
  const pos=fireflyPts.geometry.attributes.position.array,
        col=fireflyPts.geometry.attributes.color.array;
  const fade=Math.min(1,(nf-.55)*4);
  for(let i=0;i<FIREFLIES.length;i++){
    const f=FIREFLIES[i];
    f.a+=dt*f.sp;
    const x=player.x+Math.cos(f.a)*f.r+Math.sin(t*.31+f.ph)*2.4,
          z=player.z+Math.sin(f.a*.9+f.ph)*f.r+Math.cos(t*.27+f.ph)*2.4;
    pos[i*3]=x;
    pos[i*3+1]=heightAt(x,z)+f.y+Math.sin(t*.8+f.ph)*.35;
    pos[i*3+2]=z;
    const b=Math.max(0,Math.sin(t*f.bl+f.ph));
    const k=b*b*b*fade;                     // sharp blink, long dark
    col[i*3]=.62*k;col[i*3+1]=k;col[i*3+2]=.2*k;
  }
  fireflyPts.geometry.attributes.position.needsUpdate=true;
  fireflyPts.geometry.attributes.color.needsUpdate=true;
}
const tracers=[];
for(let i=0;i<24;i++){
  const g=new THREE.BufferGeometry();
  g.setAttribute('position',new THREE.BufferAttribute(new Float32Array(6),3));
  const col=new Float32Array([9,7.2,3.6, 1.4,.7,.25]);   // hot to ember along the flight
  g.setAttribute('color',new THREE.BufferAttribute(col,3));
  const l=new THREE.Line(g,new THREE.LineBasicMaterial({transparent:true,opacity:0,vertexColors:true}));
  l.frustumCulled=false;scene.add(l);tracers.push({l,t:0});
}
let trHead=0;
function tracer(a,b){
  const tr=tracers[trHead];trHead=(trHead+1)%tracers.length;
  const p=tr.l.geometry.attributes.position.array;
  p[0]=a.x;p[1]=a.y;p[2]=a.z;p[3]=b.x;p[4]=b.y;p[5]=b.z;
  tr.l.geometry.attributes.position.needsUpdate=true;
  tr.t=.08;tr.l.material.opacity=.9;
}
const decals=[];
{
  const splatTex=(()=>{ // spilled, not stamped: a core, runners, satellite drops
    const c=document.createElement('canvas');c.width=c.height=128;
    const g=c.getContext('2d');
    for(let i=0;i<26;i++){ // the body of it
      const a=Math.random()*TAU,r=Math.pow(Math.random(),1.6)*26;
      g.fillStyle=`rgba(255,255,255,${rand(.5,.95)})`;
      g.beginPath();g.ellipse(64+Math.cos(a)*r,64+Math.sin(a)*r,rand(8,20),rand(6,16),Math.random()*TAU,0,TAU);g.fill();
    }
    for(let i=0;i<34;i++){ // flung droplets, thinning outward
      const a=Math.random()*TAU,r=24+Math.pow(Math.random(),.7)*36;
      g.fillStyle=`rgba(255,255,255,${rand(.35,.8)})`;
      g.beginPath();g.ellipse(64+Math.cos(a)*r,64+Math.sin(a)*r,rand(1.2,4),rand(1,3),a,0,TAU);g.fill();
    }
    const t=new THREE.CanvasTexture(c);return t;
  })();
  const g=new THREE.CircleGeometry(.9,16);g.rotateX(-Math.PI/2);
  for(let i=0;i<50;i++){
    const m=new THREE.Mesh(g,new THREE.MeshBasicMaterial({color:0x551610,transparent:true,opacity:0,
      map:splatTex,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-2}));
    scene.add(m);decals.push(m);
  }
}
let dcHead=0;
function decal(x,z,s=1){
  const d=decals[dcHead];dcHead=(dcHead+1)%decals.length;
  d.position.set(x,heightAt(x,z)+.04,z);
  d.scale.setScalar(s*rand(.8,1.4));d.rotation.y=rand(TAU);
  d.material.opacity=.75;
}
const muzzle=new THREE.PointLight(0xffb050,0,14);scene.add(muzzle);
const boomLight=new THREE.PointLight(0xffaa55,0,44);scene.add(boomLight);
/* muzzle flash billboard */
const flashSpr=(()=>{
  const c=document.createElement('canvas');c.width=c.height=128;
  const g=c.getContext('2d');
  g.translate(64,64);
  for(let i=0;i<6;i++){ // ragged spokes, no two alike
    g.rotate(Math.PI/3+Math.random()*.3);
    const len=44+Math.random()*18,w=4+Math.random()*5;
    const rg=g.createLinearGradient(0,-len,0,len);
    rg.addColorStop(0,'rgba(255,220,140,0)');rg.addColorStop(.5,'rgba(255,230,170,.9)');rg.addColorStop(1,'rgba(255,220,140,0)');
    g.fillStyle=rg;g.fillRect(-w/2,-len,w,len*2);
  }
  const core=g.createRadialGradient(0,0,1,0,0,26); // the hot heart of it
  core.addColorStop(0,'rgba(255,252,230,1)');
  core.addColorStop(.4,'rgba(255,225,150,.75)');
  core.addColorStop(1,'rgba(255,190,90,0)');
  g.fillStyle=core;g.beginPath();g.arc(0,0,26,0,TAU);g.fill();
  const mat=new THREE.SpriteMaterial({map:new THREE.CanvasTexture(c),transparent:true,
    opacity:0,depthWrite:false,blending:THREE.AdditiveBlending});
  mat.color.setRGB(5,3.4,1.4);
  const s=new THREE.Sprite(mat);scene.add(s);return s;
})();
/* ejected brass */
const shellPool=[];
{
  const g=new THREE.CylinderGeometry(.011,.011,.05,6);
  const m=new THREE.MeshStandardMaterial({color:0xe0b65a,metalness:.95,roughness:.18,envMapIntensity:2.2});
  for(let i=0;i<20;i++){
    const s=new THREE.Mesh(g,m);
    s.visible=false;s.live=false;scene.add(s);shellPool.push(s);
  }
}
function ejectShell(){
  const s=shellPool.find(x=>!x.live);if(!s)return;
  s.live=true;s.visible=true;
  const rx=Math.cos(player.yaw),rz=-Math.sin(player.yaw);
  s.position.set(camera.position.x+rx*.3,camera.position.y-.25,camera.position.z+rz*.3);
  s.userData={vx:rx*rand(1.5,2.6)+rand(-.4,.4),vy:rand(2,3),vz:rz*rand(1.5,2.6)+rand(-.4,.4),
    sx:rand(-9,9),sy:rand(-9,9),t:0};
}
function updateShells(dt){
  for(const s of shellPool){
    if(!s.live)continue;
    const u=s.userData;u.t+=dt;
    u.vy-=13*dt;
    s.position.x+=u.vx*dt;s.position.y+=u.vy*dt;s.position.z+=u.vz*dt;
    s.rotation.x+=u.sx*dt;s.rotation.y+=u.sy*dt;
    if(u.t>1||s.position.y<heightAt(s.position.x,s.position.z)){
      s.live=false;s.visible=false;
      if(Math.hypot(s.position.x-player.x,s.position.z-player.z)<6&&Math.random()<.7)
        sTone('sine',rand(2400,3200),1800,.05,.025);
    }
  }
}

/* ---------------- weapons & player ---------------- */
const WEAPONS=[
 {name:'M1 SERVICE RIFLE',price:0,  magSize:30, rate:.13, dmg:13,head:34, spread:.009,adsSpread:.0025,pellets:1,reload:1.4,auto:true, zoom:54,pierce:0,sfx:'shot',   kick:1,  range:140,
  ds:'Dependable. Accurate. Yours.'},
 {name:'M3 GREASE GUN',   price:140,magSize:40, rate:.062,dmg:7, head:15, spread:.02, adsSpread:.01,  pellets:1,reload:1.6,auto:true, zoom:58,pierce:0,sfx:'smg',    kick:.5, range:90,
  ds:'A hose of lead for close work.'},
 {name:'TRENCH SWEEPER',  price:200,magSize:6,  rate:.85, dmg:9, head:16, spread:.07, adsSpread:.05,  pellets:9,reload:1.9,auto:false,zoom:62,pierce:0,sfx:'shotgun',kick:1.7,range:60, knock:.9,shellCost:3,
  ds:'Nine pellets. Throws them back.'},
 {name:'M1903 MARKSMAN',  price:320,magSize:5,  rate:1.05,dmg:85,head:210,spread:.004,adsSpread:.0006,pellets:1,reload:2.3,auto:false,zoom:28,pierce:3,sfx:'dmr',    kick:2.2,range:200,
  ds:'One round, four skulls. Pierces.'},
 {name:'M1919 SUPPORT',   price:460,magSize:100,rate:.085,dmg:11,head:24, spread:.017,adsSpread:.009, pellets:1,reload:3.6,auto:true, zoom:58,pierce:1,sfx:'lmg',    kick:.8, range:130,
  ds:'A hundred-round argument.'},
 {name:'M2 DRAGON',       price:620,magSize:90, rate:.045,dmg:0, head:0,  spread:0,   adsSpread:0,    pellets:0,reload:2.6,auto:true, zoom:72,pierce:0,sfx:'flame',  kick:.08,range:0, flame:true,
  ds:'Sets the world on fire. Literally.'},
 {name:'TRENCH KNIFE',    price:0,  magSize:0,  rate:.42, dmg:46,head:70, spread:.018,adsSpread:.012, pellets:1,reload:0,  auto:false,zoom:66,pierce:0,sfx:'slash',  kick:.35,range:3.1, melee:true,
  ds:'No magazine. No mercy. Always on you.'},
 {name:'M9 BAZOOKA',      price:520,magSize:1,  rate:1.4, dmg:0, head:0,  spread:.006,adsSpread:.002, pellets:0,reload:3.2,auto:false,zoom:50,pierce:0,sfx:'dmr',    kick:2.6,range:220, rocket:true,
  ds:'The argument that remodels terrain. Aim high at range; the round drops.'},
];
function defaultOwned(){return WEAPONS.map((w,i)=>i===0||!!w.melee);}
function defaultMags(){return WEAPONS.map(w=>w.melee?0:w.magSize);}
function normalizeOwned(owned){return WEAPONS.map((w,i)=>!!(owned&&owned[i])||i===0||!!w.melee);}
function normalizeMags(mags){return WEAPONS.map((w,i)=>w.melee?0:clamp(mags&&Number.isFinite(mags[i])?mags[i]:w.magSize,0,w.magSize));}
const player={ride:null,man:null,
  x:6,y:0,z:10,vy:0,yaw:2.6,pitch:-.05,hp:100,maxhp:100,alive:true,
  reserve:90,carryCap:180,
  wid:0,owned:defaultOwned(),
  mags:defaultMags(),
  tool:null,buildType:0,healT:0,
  fireCd:0,digCd:0,reloadT:0,sprint:false,grounded:true,ads:false,fireHeld:false,
  hurtT:0,regenT:0,respawnT:0,bob:0
};
const keys={};
let locked=false,everLocked=false,camShake=0,shopOpen=false,perkOpen=false;
addEventListener('keydown',e=>{
  keys[e.code]=true;
  if(e.code==='Space')e.preventDefault();
  if(e.code==='Tab'){e.preventDefault();if(!BAST.on){updateRoster();$('roster').classList.toggle('on');}}
  if(e.code==='KeyI'&&G.state==='play')toggleInv();
  if(e.code==='KeyC'&&BAST.on&&G.state==='play'&&!shopOpen&&!perkOpen&&!invOpen)cmdUI(!cmdOpen);
  if(cmdOpen){const dg=/^Digit([1-5])$/.exec(e.code);if(dg)giveOrder(+dg[1]);}
  if(e.code==='KeyU'&&G.state==='play')document.body.classList.toggle('hudmin');
  if(e.code==='KeyM'){AU.muted=!AU.muted;if(AU.master)AU.master.gain.value=AU.muted?0:.5;}
  if(G.state!=='play')return;
  if(e.code==='KeyB'){toggleShop();return;}
  if(shopOpen||perkOpen)return;
  const dg=/^Digit([1-9])$/.exec(e.code);
  if(dg&&!cmdOpen)selectWeapon(+dg[1]-1);
  if(e.code==='KeyQ')toggleTool('shovel');
  if(e.code==='KeyT')toggleTool('build');
  if(e.code==='KeyR')startReload();
  if(e.code==='KeyE')interact();
  if(e.code==='KeyG')throwGrenade();
  if(e.code==='KeyV')throwMolotov();
  if(e.code==='KeyX')placeMine();
  if(e.code==='KeyH')useMedkit();
  if(e.code==='KeyZ')throwFlare();
  if(e.code==='KeyF')toggleLamp();
});
addEventListener('keyup',e=>keys[e.code]=false);
let mouseDownL=false,mouseDownR=false;
addEventListener('mousedown',e=>{if(!locked)return;if(e.button===0)mouseDownL=true;if(e.button===2)mouseDownR=true;});
addEventListener('mouseup',e=>{if(e.button===0)mouseDownL=false;if(e.button===2)mouseDownR=false;});
addEventListener('contextmenu',e=>e.preventDefault());
addEventListener('mousemove',e=>{
  if(!locked)return;
  const sens=.0022*(player.ads?Math.max(.3,curW().zoom/72)*.7:1);
  player.yaw-=e.movementX*sens;
  player.pitch=clamp(player.pitch-e.movementY*sens,-1.45,1.45);
});
document.addEventListener('pointerlockchange',()=>{
  locked=document.pointerLockElement===document.body;
  if(locked){everLocked=true;$('resume').classList.remove('show');}
  else if(G.state==='play'&&player.alive&&everLocked&&!shopOpen&&!perkOpen&&!invOpen
    &&(BAST.on||['drive','siege','fall'].includes(CAMP.mode)))$('resume').classList.add('show');
});
function tryLock(){document.body.requestPointerLock&&document.body.requestPointerLock();}
$('resume').addEventListener('click',tryLock);

/* torch */
const lampSpot=new THREE.SpotLight(0xfff2cf,0,75,.42,.72,1.8);
camera.add(lampSpot);
lampSpot.position.set(.05,-.04,-1.3);
const lampTgt=new THREE.Object3D();camera.add(lampTgt);lampTgt.position.set(0,-.1,-4);
lampSpot.target=lampTgt;
let lampOn=true;
function toggleLamp(){
  lampOn=!lampOn;SFX.load();
  toast(lampOn?'TORCH ON':'TORCH OFF, THEY CAN STILL SEE YOU');
}
/* fake-volumetric torch shaft */
const lampCone=(()=>{
  const g=new THREE.ConeGeometry(2.9,15,24,1,true);
  g.translate(0,-7.5,0);g.rotateX(Math.PI/2);
  const m=new THREE.Mesh(g,new THREE.MeshBasicMaterial({color:0xfff0c8,
    transparent:true,opacity:.04,blending:THREE.AdditiveBlending,
    depthWrite:false,side:THREE.DoubleSide}));
  camera.add(m);m.position.set(.12,-.06,0);
  return m;
})();

/* view models, six procedurally built guns, and one knife that never leaves you */
const vm=new THREE.Group();camera.add(vm);scene.add(camera);
const gunModels=[];
{
  const dark=new THREE.MeshStandardMaterial({color:0x2e2e26,roughness:.42,metalness:.65,envMapIntensity:1.1});
  const wood=new THREE.MeshStandardMaterial({color:0x6b4f30,map:woodTex,roughness:.72,envMapIntensity:.6,
    bumpMap:woodTex,bumpScale:.08}); // grain you can almost feel at arm's length
  const steel=new THREE.MeshStandardMaterial({color:0x55554e,roughness:.28,metalness:.88,envMapIntensity:1.4});
  const tank=new THREE.MeshStandardMaterial({color:0x7a2a1c,roughness:.45,metalness:.5,envMapIntensity:1});
  const box=(w,h,d,m)=>new THREE.Mesh(new THREE.BoxGeometry(w,h,d),m);
  const cyl=(r,l,m)=>{const c=new THREE.Mesh(new THREE.CylinderGeometry(r,r,l),m);c.rotation.x=Math.PI/2;return c;};
  const brass=new THREE.MeshStandardMaterial({color:0xb08a3e,metalness:.85,roughness:.3,envMapIntensity:1.3});
  const sling=(g,x1,y1,z1,x2,y2,z2)=>{ // a leather strap, slung the lazy way
    const dx=x2-x1,dy=y2-y1,dz=z2-z1,L=Math.hypot(dx,dy,dz);
    const st=new THREE.Mesh(new THREE.BoxGeometry(.028,.006,L),
      new THREE.MeshStandardMaterial({color:0x46341f,roughness:.6}));
    st.position.set((x1+x2)/2,(y1+y2)/2-.03,(z1+z2)/2);
    st.lookAt(x2,y2,z2);g.add(st);
  };
  const builders=[
    g=>{ // M1 SERVICE RIFLE: walnut, steel, and habit
      const st=box(.07,.105,.46,wood);st.position.set(0,-.02,.3);g.add(st);          // buttstock
      const bp=box(.075,.11,.018,steel);bp.position.set(0,-.02,.53);g.add(bp);       // butt plate
      const fore=box(.068,.075,.5,wood);fore.position.set(0,.005,-.22);g.add(fore);  // fore wood
      const rec=box(.062,.075,.16,dark);rec.position.set(0,.045,.04);g.add(rec);     // receiver
      const br=cyl(.018,.55,steel);br.position.set(0,.045,-.55);g.add(br);           // barrel
      const band=cyl(.026,.03,steel);band.position.set(0,.045,-.4);band.rotation.x=Math.PI/2;g.add(band);
      const band2=cyl(.024,.03,steel);band2.position.set(0,.045,-.18);band2.rotation.x=Math.PI/2;g.add(band2);
      for(const sx of[-1,1]){const wing=box(.008,.05,.02,steel);wing.position.set(sx*.022,.095,-.78);g.add(wing);}
      const fp=box(.006,.045,.006,steel);fp.position.set(0,.1,-.78);g.add(fp);       // front post
      const ch=box(.035,.014,.05,steel);ch.position.set(.052,.05,.07);g.add(ch);     // op-rod handle
      const mg=box(.05,.05,.1,steel);mg.position.set(0,-.025,.0);g.add(mg);          // mag well
      const trg=box(.008,.03,.02,brass);trg.position.set(0,-.055,.02);g.add(trg);
      sling(g,0,-.06,.45,0,.02,-.4);
    },
    g=>{ // M3 GREASE GUN: a plumber's idea of war, lovingly machined
      const tube=cyl(.045,.34,steel);tube.position.set(0,.02,-.02);g.add(tube);
      const shroud=cyl(.03,.2,dark);shroud.position.set(0,.02,-.3);g.add(shroud);
      for(let i2=0;i2<3;i2++){const ring=new THREE.Mesh(new THREE.TorusGeometry(.031,.004,5,10),steel);
        ring.position.set(0,.02,-.24-i2*.06);g.add(ring);}                            // shroud rings
      const br=cyl(.014,.16,steel);br.position.set(0,.02,-.46);g.add(br);
      const mag=box(.034,.22,.06,dark);mag.position.set(0,-.13,-.06);mag.rotation.x=.06;g.add(mag);
      const grip=box(.045,.09,.06,wood);grip.position.set(0,-.085,.1);grip.rotation.x=.3;g.add(grip);
      const ej=box(.05,.012,.09,steel);ej.position.set(.044,.03,-.02);g.add(ej);      // ejection door
      for(const sy of[-1,1]){const rod=box(.012,.012,.26,steel);rod.position.set(sy*.03,-.01,.22);g.add(rod);}
      const rb=box(.07,.012,.03,steel);rb.position.set(0,-.01,.35);g.add(rb);         // wire stock
      const crank=cyl(.008,.05,steel);crank.rotation.z=Math.PI/2;crank.position.set(-.05,.04,.04);g.add(crank);
    },
    g=>{ // TRENCH SWEEPER: two mouths and a bead of brass
      const st=box(.075,.11,.3,wood);st.position.set(0,-.04,.32);g.add(st);
      const cheek=box(.06,.03,.16,wood);cheek.position.set(0,.03,.34);g.add(cheek);
      const breech=box(.08,.1,.12,steel);breech.position.set(0,.01,.1);g.add(breech);
      for(const sx of[-1,1]){
        const br=cyl(.027,.56,steel);br.position.set(sx*.028,.03,-.36);g.add(br);
        const hammer=box(.012,.04,.025,steel);hammer.position.set(sx*.025,.085,.13);hammer.rotation.x=-.5;g.add(hammer);
      }
      const rib=box(.012,.008,.5,dark);rib.position.set(0,.062,-.33);g.add(rib);
      const bead=new THREE.Mesh(new THREE.SphereGeometry(.007,6,5),brass);bead.position.set(0,.07,-.62);g.add(bead);
      const fore2=box(.075,.05,.2,wood);fore2.position.set(0,-.015,-.3);g.add(fore2);
      const lever=box(.03,.01,.05,brass);lever.position.set(0,.065,.16);g.add(lever);
    },
    g=>{ // M1903 MARKSMAN: the long argument, with glass
      const st=box(.062,.1,.5,wood);st.position.set(0,-.025,.32);g.add(st);
      const comb=box(.05,.035,.22,wood);comb.position.set(0,.035,.4);g.add(comb);
      const fore3=box(.058,.07,.55,wood);fore3.position.set(0,0,-.3);g.add(fore3);
      const br=cyl(.014,.6,steel);br.position.set(0,.02,-.82);g.add(br);
      const rec=box(.055,.06,.14,steel);rec.position.set(0,.04,.02);g.add(rec);
      const bolt=cyl(.012,.07,steel);bolt.rotation.z=Math.PI/2;bolt.position.set(.05,.05,.04);g.add(bolt);
      const knob=new THREE.Mesh(new THREE.SphereGeometry(.016,7,5),steel);knob.position.set(.085,.05,.04);g.add(knob);
      const tube2=cyl(.022,.22,dark);tube2.position.set(0,.105,-.02);g.add(tube2);    // scope tube
      for(const so of[-.1,.08]){const ring=new THREE.Mesh(new THREE.TorusGeometry(.024,.005,6,12),steel);
        ring.position.set(0,.105,so-.02);g.add(ring);}
      const occ=cyl(.026,.04,dark);occ.position.set(0,.105,.1);g.add(occ);
      const obj=cyl(.028,.05,dark);obj.position.set(0,.105,-.15);g.add(obj);
      const tur=cyl(.008,.02,brass);tur.rotation.x=0;tur.position.set(0,.135,-.02);g.add(tur);
      sling(g,0,-.07,.45,0,0,-.5);
    },
    g=>{ // M1919 SUPPORT: a hundred-round argument and its furniture
      const rec=box(.085,.1,.34,dark);rec.position.set(0,.02,0);g.add(rec);
      const tray=box(.1,.02,.16,steel);tray.position.set(0,.08,-.02);g.add(tray);     // feed tray
      const br=cyl(.024,.5,steel);br.position.set(0,.03,-.55);g.add(br);
      const jacket=cyl(.034,.3,dark);jacket.position.set(0,.03,-.38);g.add(jacket);
      for(let i3=0;i3<4;i3++){const hole=new THREE.Mesh(new THREE.TorusGeometry(.035,.003,4,8),steel);
        hole.position.set(0,.03,-.28-i3*.07);g.add(hole);}
      const hider=new THREE.Mesh(new THREE.ConeGeometry(.03,.06,7),steel);
      hider.rotation.x=-Math.PI/2;hider.position.set(0,.03,-.82);g.add(hider);
      const mag2=box(.14,.11,.2,0?null:steel);mag2.position.set(-.1,-.03,-.02);g.add(mag2); // belt box
      const lid=box(.142,.012,.2,dark);lid.position.set(-.1,.03,-.02);g.add(lid);
      for(const sx of[-1,1]){const leg=box(.012,.16,.012,steel);
        leg.position.set(sx*.03,-.1,-.62);leg.rotation.x=.5;leg.rotation.z=sx*.25;g.add(leg);}
      const handle=box(.012,.05,.12,wood);handle.position.set(0,.12,.1);g.add(handle);
      const spade=box(.05,.08,.04,wood);spade.position.set(0,-.04,.2);g.add(spade);
    },
    g=>{ // M2 DRAGON: plumbing for the end of the world
      const body=cyl(.04,.34,steel);body.position.set(0,0,-.06);g.add(body);
      const noz=cyl(.018,.34,dark);noz.position.set(0,0,-.4);g.add(noz);
      const tip=cyl(.034,.07,dark);tip.position.set(0,0,-.6);g.add(tip);
      const pilot=new THREE.Mesh(new THREE.SphereGeometry(.012,6,5),new THREE.MeshBasicMaterial());
      pilot.material.color.setRGB(4,1.6,.3);pilot.position.set(0,.025,-.62);g.add(pilot); // the pilot light, always hungry
      const shield=new THREE.Mesh(new THREE.CylinderGeometry(.05,.05,.16,8,1,true,0,Math.PI),dark);
      shield.rotation.z=Math.PI/2;shield.rotation.y=Math.PI/2;shield.position.set(0,.04,-.5);g.add(shield);
      const tk=cyl(.065,.24,tank);tk.position.set(-.04,-.12,.02);g.add(tk);
      const tk2=cyl(.04,.2,tank);tk2.position.set(.06,-.11,.04);g.add(tk2);
      for(const[hx,hz]of[[-.04,-.0],[.06,.02]]){
        const hose=cyl(.012,.18,dark);hose.rotation.x=.9;hose.position.set(hx,-.04,hz-.05);g.add(hose);}
      const valve=new THREE.Mesh(new THREE.TorusGeometry(.022,.005,6,10),brass);
      valve.rotation.x=Math.PI/2;valve.position.set(-.04,.02,.02);g.add(valve);
      const gauge=cyl(.016,.012,brass);gauge.rotation.x=Math.PI/2;gauge.position.set(.0,.045,-.04);g.add(gauge);
    },
    g=>{ // TRENCH KNIFE: close work, carried even when everything else is gone
      const grip=cyl(.035,.22,wood);grip.position.set(0,-.075,.16);g.add(grip);
      const pom=box(.09,.035,.035,steel);pom.position.set(0,-.075,.29);g.add(pom);
      const guard=box(.22,.025,.035,brass);guard.position.set(0,-.055,.035);guard.rotation.z=.08;g.add(guard);
      const blade=new THREE.Mesh(new THREE.ConeGeometry(.04,.58,4),steel);
      blade.rotation.x=-Math.PI/2;blade.rotation.z=Math.PI/4;blade.position.set(.035,-.02,-.25);g.add(blade);
      const fuller=box(.01,.006,.35,dark);fuller.position.set(.035,.005,-.25);g.add(fuller);
      const wrap1=new THREE.Mesh(new THREE.TorusGeometry(.038,.004,6,10),dark);wrap1.position.set(0,-.075,.09);g.add(wrap1);
      const wrap2=wrap1.clone();wrap2.position.z=.2;g.add(wrap2);
    },
    g=>{ // M9 BAZOOKA: a stovepipe with opinions
      const tube=cyl(.062,1.3,dark);tube.rotation.x=Math.PI/2;tube.position.set(.04,.06,-.18);g.add(tube);
      const bell=new THREE.Mesh(new THREE.CylinderGeometry(.085,.062,.14,10),steel);
      bell.rotation.x=Math.PI/2;bell.position.set(.04,.06,-.85);g.add(bell);
      const breech=new THREE.Mesh(new THREE.CylinderGeometry(.07,.085,.12,10),steel);
      breech.rotation.x=Math.PI/2;breech.position.set(.04,.06,.46);g.add(breech);
      const grip=box(.05,.16,.06,wood);grip.position.set(.04,-.08,.1);grip.rotation.x=.2;g.add(grip);
      const grip2=box(.05,.13,.06,wood);grip2.position.set(.04,-.06,-.18);g.add(grip2);
      const sightF=box(.012,.09,.012,steel);sightF.position.set(.04,.15,-.5);g.add(sightF);
      const ring=new THREE.Mesh(new THREE.TorusGeometry(.045,.008,6,14),brass);
      ring.position.set(.04,.16,.05);g.add(ring);
      const strap=box(.02,.005,.9,dark);strap.position.set(-.03,-.02,-.1);strap.rotation.z=.3;g.add(strap);
      const rocketTip=new THREE.Mesh(new THREE.ConeGeometry(.05,.12,8),brass);
      rocketTip.rotation.x=-Math.PI/2;rocketTip.position.set(.04,.06,-.93);g.add(rocketTip);
    },
  ];
  for(let i=0;i<WEAPONS.length;i++){
    const g=new THREE.Group();builders[i](g);
    if(!WEAPONS[i].flame&&!WEAPONS[i].melee){ // shared gun furniture: sights, bolt, trigger guard, grip
      const post=box(.012,.05,.012,steel);post.position.set(0,.09,-.32);g.add(post);
      const ring=new THREE.Mesh(new THREE.TorusGeometry(.024,.006,6,14),steel);
      ring.position.set(0,.085,.12);g.add(ring);
      const bolt=new THREE.Mesh(new THREE.SphereGeometry(.017,6,5),steel);
      bolt.position.set(.05,.025,.06);g.add(bolt);
      const boltArm=cyl(.007,.05,steel);boltArm.rotation.z=Math.PI/2;boltArm.rotation.x=0;
      boltArm.position.set(.028,.025,.06);g.add(boltArm);
      const hood=new THREE.Mesh(new THREE.TorusGeometry(.02,.005,6,12),steel);
      hood.position.set(0,.088,-.32);g.add(hood);
      const plate=box(.012,.06,.16,steel);plate.position.set(.046,.012,.02);g.add(plate);
      const grip=box(.05,.11,.07,wood);grip.position.set(0,-.1,.13);grip.rotation.x=.32;g.add(grip);
      const guard=new THREE.Mesh(new THREE.TorusGeometry(.03,.006,5,10,Math.PI),dark);
      guard.rotation.x=Math.PI/2;guard.rotation.z=Math.PI;guard.position.set(0,-.06,-.02);g.add(guard);
    }
    g.visible=i===0;vm.add(g);gunModels.push(g);
  }
}
const vmShovel=new THREE.Group();
{
  const handle=new THREE.Mesh(new THREE.CylinderGeometry(.022,.022,.8),
    new THREE.MeshStandardMaterial({color:0x57422c,map:woodTex,bumpMap:woodTex,bumpScale:.06,roughness:.8}));
  handle.rotation.x=1.1;handle.position.z=-.15;
  const steel=new THREE.MeshStandardMaterial({color:0x6a6a60,roughness:.38,metalness:.7,
    envMapIntensity:1.1,side:THREE.DoubleSide});
  const blade=new THREE.Mesh(new THREE.CylinderGeometry(.085,.1,.24,12,1,true,0,Math.PI),steel);
  blade.position.set(0,.33,-.49);blade.rotation.x=Math.PI/2-.45;blade.rotation.z=Math.PI;  // a curved spade, dirt-polished
  const collar=new THREE.Mesh(new THREE.CylinderGeometry(.028,.034,.07,10),steel);
  collar.position.set(0,.21,-.43);collar.rotation.x=-.45;
  vmShovel.add(handle,blade,collar);
}
const vmKit=new THREE.Group();
{
  const cloth=new THREE.MeshStandardMaterial({color:0x6b6f4a,roughness:.9,
    map:burlapTex,bumpMap:burlapTex,bumpScale:.2});
  const box=new THREE.Mesh(new THREE.BoxGeometry(.3,.2,.3),cloth);
  const white=new THREE.MeshStandardMaterial({color:0xe8e0d0,roughness:.7});
  const c1=new THREE.Mesh(new THREE.BoxGeometry(.14,.04,.012),white);c1.position.set(0,.04,.151);
  const c2=new THREE.Mesh(new THREE.BoxGeometry(.04,.14,.012),white);c2.position.set(0,.04,.151);
  const strap=new THREE.Mesh(new THREE.BoxGeometry(.31,.03,.31),
    new THREE.MeshStandardMaterial({color:0x46341f,roughness:.55}));
  strap.position.y=.05;
  vmKit.add(box,c1,c2,strap);
}
vm.add(vmShovel,vmKit);
vm.position.set(.32,-.3,-.55);
let vmKick=0,vmSwing=0,vmYawLag=0,lastYawVM=0;
function curW(){return WEAPONS[player.wid];}
function selectWeapon(i){
  if(!WEAPONS[i])return;
  if(!player.owned[i]){toast('LOCKED, REQUISITION AT THE DEPOT (B)');SFX.deny();return;}
  player.tool=null;player.wid=i;player.reloadT=0;
  refreshVM();SFX.load();
}
const BUILD_NAMES=()=>['TURRET, '+G.turretCost+' SCRAP','SANDBAGS, '+Math.round(20*G.buildMul)+' SCRAP','BARBED WIRE, '+Math.round(25*G.buildMul)+' SCRAP'];
function toggleTool(t){
  if(player.tool===t){
    if(t==='build'){player.buildType=(player.buildType+1)%3;toast(BUILD_NAMES()[player.buildType]);}
    else player.tool=null;
  }else{
    player.tool=t;
    if(t==='build')toast(BUILD_NAMES()[player.buildType]);
  }
  refreshVM();SFX.load();
}
function refreshVM(){
  for(let i=0;i<WEAPONS.length;i++)gunModels[i].visible=player.tool===null&&player.wid===i;
  vmShovel.visible=player.tool==='shovel';
  vmKit.visible=player.tool==='build';
  ghost.visible=false;
  $('tShovel').classList.toggle('sel',player.tool==='shovel');
  $('tBuild').classList.toggle('sel',player.tool==='build');
}
const ghost=new THREE.Mesh(new THREE.CylinderGeometry(.9,1.1,1.4,8),
  new THREE.MeshBasicMaterial({color:0x9ab35c,transparent:true,opacity:.4}));
ghost.visible=false;scene.add(ghost);

/* ---------------- zombies ---------------- */
const MAXZ=110;
let zGeoBody,zGeoHead;
{
  const cloth=[],flesh=[];
  const add=(arr,geo,x,y,z,rx=0)=>{geo.rotateX(rx);geo.translate(x,y,z);arr.push(geo);};
  const blob=(r,sx,sy,sz)=>{const g=new THREE.SphereGeometry(r,14,10);g.scale(sx,sy,sz);return g;};
  // what's left of a coat: ribcage, shoulders, hips
  add(cloth,blob(.3,1.0,1.2,.62),0,1.1,0,.15);
  add(cloth,blob(.3,1.08,.42,.55),0,1.42,.05,.1);
  add(cloth,blob(.24,.88,.52,.6),0,.76,0);
  // what's left of a person: neck, skull, jaw, one bare rib
  {const n=new THREE.CylinderGeometry(.07,.095,.2,10);n.translate(0,1.53,.08);flesh.push(n);}
  add(flesh,blob(.17,1,1.14,1.04),0,1.69,.1,.25);
  add(flesh,blob(.085,1,.55,1.2),0,1.52,.22,.5);
  add(flesh,blob(.05,1.2,.8,1),-.15,1.18,.16);
  zGeoBody=mergeGeometries(cloth);
  zGeoHead=mergeGeometries(flesh);
}
const fleshTex=(()=>{ // mottled necrotic skin, near-white base so per-instance tint survives
  const c=document.createElement('canvas');c.width=c.height=256;
  const g=c.getContext('2d'),img=g.createImageData(256,256);
  for(let y=0;y<256;y++)for(let x=0;x<256;x++){
    const i=(y*256+x)*4;
    let v=205+fbm2(x*.045,y*.045,4)*70-35;
    const vein=Math.abs(fbm2(x*.025+60,y*.025+19,3)-.5);
    v-=Math.pow(Math.max(0,1-vein*7),2)*55;            // dark vein web
    v+=(hash(x*7,y*5)-.5)*16;                          // pore-fine grain the old map blurred over
    v-=(hash(x*11,y*17)<.012?60:0);                    // lesions
    img.data[i]=v;img.data[i+1]=v*.96;img.data[i+2]=v*.9;img.data[i+3]=255;
  }
  g.putImageData(img,0,0);
  const t=new THREE.CanvasTexture(c);t.anisotropy=4;
  t.wrapS=t.wrapT=THREE.RepeatWrapping;t.colorSpace=THREE.SRGBColorSpace;
  return t;
})();
const zMat=new THREE.MeshStandardMaterial({color:0xffffff,roughness:.92,
  map:fleshTex,bumpMap:fleshTex,bumpScale:.6});
const zMesh=new THREE.InstancedMesh(zGeoBody,zMat,MAXZ);
zMesh.castShadow=true;zMesh.frustumCulled=false;
scene.add(zMesh);
const zHead=new THREE.InstancedMesh(zGeoHead,zMat,MAXZ);
zHead.castShadow=true;zHead.frustumCulled=false;
scene.add(zHead);
/* articulated limbs, four extra instanced meshes, posed per-frame */
const armGeo=(()=>{ // wasted arm ending in a grasping hand
  const a=new THREE.CylinderGeometry(.048,.066,.5,10);a.rotateX(Math.PI/2);a.translate(0,0,.25);
  const h=new THREE.SphereGeometry(.062,10,7);h.scale(1,.75,1.35);h.translate(0,-.01,.53);
  return mergeGeometries([a,h]);})();
const legGeo=(()=>{
  const l=new THREE.CylinderGeometry(.075,.058,.68,10);l.translate(0,-.34,0);
  const f=new THREE.SphereGeometry(.07,10,7);f.scale(.9,.5,1.6);f.translate(0,-.7,.06);
  return mergeGeometries([l,f]);})();
const LIMBS=[];
function makeLimb(geo){
  const m=new THREE.InstancedMesh(geo,zMat,MAXZ);
  m.castShadow=true;m.frustumCulled=false;
  scene.add(m);LIMBS.push(m);return m;
}
const zArmL=makeLimb(armGeo),zArmR=makeLimb(armGeo),zLegL=makeLimb(legGeo),zLegR=makeLimb(legGeo);
let zEyes;
{
  const e1=new THREE.SphereGeometry(.04,8,6);e1.scale(1,.75,.55);e1.translate(-.085,1.7,.26);
  const e2=new THREE.SphereGeometry(.04,8,6);e2.scale(1,.75,.55);e2.translate(.085,1.7,.26);
  const eyeMat=new THREE.MeshBasicMaterial();
  eyeMat.color.setRGB(1,1,1);   // per-instance HDR colors decide the glow
  zEyes=new THREE.InstancedMesh(mergeGeometries([e1,e2]),eyeMat,MAXZ);
  zEyes.frustumCulled=false;scene.add(zEyes);
}
let zHats;
{
  const dome=new THREE.SphereGeometry(.2,14,9,0,TAU,0,1.5);
  dome.scale(1,.8,1.05);dome.translate(0,1.78,.09);
  const brim=new THREE.CylinderGeometry(.24,.26,.02,16);brim.translate(0,1.71,.09);
  zHats=new THREE.InstancedMesh(mergeGeometries([dome,brim]),
    new THREE.MeshStandardMaterial({color:0x3a3b2c,roughness:.95}),MAXZ);
  zHats.castShadow=true;zHats.frustumCulled=false;scene.add(zHats);
}
const zombies=[];
const _M=new THREE.Matrix4(),_Q=new THREE.Quaternion(),_E=new THREE.Euler(),_S=new THREE.Vector3(),_P=new THREE.Vector3();
_E.order='YXZ';   // yaw first, then the hunch: bodies bend forward, not sideways
const _C=new THREE.Color();
const _M2=new THREE.Matrix4(),_M3=new THREE.Matrix4(),_MZ=new THREE.Matrix4().makeScale(.0001,.0001,.0001);
function limbTo(mesh,mi,M,ox,oy,oz,ang){
  _M2.makeTranslation(ox,oy,oz);
  _M3.copy(M).multiply(_M2);
  _M2.makeRotationX(ang);
  _M3.multiply(_M2);
  mesh.setMatrixAt(mi,_M3);
  mesh.setColorAt(mi,_C);
}
/* every revenant gets its own eyes and its own shade of rot */
const EYE_COL={walker:[7,.9,.45],runner:[8,5,2.4],crawler:[2.6,.5,.3],spitter:[1.6,7,.7],
  exploder:[8,1.4,.2],screamer:[5.5,1.2,7],brute:[9,.5,.3],colossus:[11,.4,.2]};
const _EC=new THREE.Color();
function writeZombie(mi,M,colC,colF,aL,aR,lL,lR,hideEyes,tint=1,eye=null,hat=false,gone=null){
  if(hat)zHats.setMatrixAt(mi,M);
  else{_M3.copy(M).multiply(_MZ);zHats.setMatrixAt(mi,_M3);}
  zMesh.setMatrixAt(mi,M);
  zMesh.setColorAt(mi,_C.set(colC).multiplyScalar(tint));      // the coat
  zHead.setMatrixAt(mi,M);
  zHead.setColorAt(mi,_C.set(colF).multiplyScalar(tint));      // the skin
  _C.set(colF).multiplyScalar(tint);                           // bare arms
  if(gone==='aL'){_M3.copy(M).multiply(_MZ);zArmL.setMatrixAt(mi,_M3);zArmL.setColorAt(mi,_C);}
  else limbTo(zArmL,mi,M,-.3,1.42,.08,aL);
  if(gone==='aR'){_M3.copy(M).multiply(_MZ);zArmR.setMatrixAt(mi,_M3);zArmR.setColorAt(mi,_C);}
  else limbTo(zArmR,mi,M,.3,1.42,.08,aR);
  _C.set(colC).multiplyScalar(tint*.72);                       // trousers, darker
  limbTo(zLegL,mi,M,-.14,.78,0,lL);
  limbTo(zLegR,mi,M,.14,.78,0,lR);
  if(hideEyes){_M3.copy(M).multiply(_MZ);zEyes.setMatrixAt(mi,_M3);}
  else{
    zEyes.setMatrixAt(mi,M);
    const e=eye||EYE_COL.walker;
    zEyes.setColorAt(mi,_EC.setRGB(e[0],e[1],e[2]));
  }
}
function pickKind(){
  const w=G.wave;
  const pool=[['walker',10]];
  if(w>=3)pool.push(['runner',4+w*.3],['crawler',3+w*.3]);
  if(w>=5)pool.push(['spitter',3],['exploder',2+w*.2]);
  if(w>=7)pool.push(['screamer',1.3]);
  let tot=0;for(const p of pool)tot+=p[1];
  let r=Math.random()*tot;
  for(const p of pool){r-=p[1];if(r<=0)return p[0];}
  return 'walker';
}
const ZSTATS={
  walker:  w=>({hp:26+w*7,        sp:rand(2.0,3.1),sc:rand(.92,1.1)}),
  runner:  w=>({hp:(26+w*7)*.55,  sp:rand(4.4,5.4),sc:rand(.85,.95)}),
  crawler: w=>({hp:(26+w*7)*.45,  sp:rand(3.4,4.1),sc:rand(.9,1.05)}),
  spitter: w=>({hp:(26+w*7)*.9,   sp:rand(1.7,2.3),sc:rand(.95,1.1)}),
  exploder:w=>({hp:(26+w*7)*.6,   sp:rand(2.9,3.6),sc:rand(.9,1)}),
  screamer:w=>({hp:(26+w*7)*.7,   sp:rand(1.5,1.8),sc:1.18}),
  brute:   w=>({hp:260+w*45,      sp:rand(1.5,1.8),sc:1.95}),
  colossus:w=>({hp:900+w*60,      sp:1.3,          sc:3.2}),
};
function spawnZombie(kindIn){
  if(zombies.length>=MAXZ)return null;
  const a=rand(TAU),r=half*rand(.88,.97);
  let x=Math.cos(a)*r,z=Math.sin(a)*r;
  if(CAMP.on&&CAMP.mode==='drive'){      // they rise along the road, where the meat is
    const l=leadTruck();
    if(l){
      x=clamp(l.x+rand(-22,60),-half+6,half-6);
      z=clamp(roadZ(x)+(Math.random()<.5?-1:1)*rand(13,42),-half+6,half-6);
      if(Math.hypot(x-player.x,z-player.z)<20)x=clamp(x+34,-half+6,half-6);
    }
  }else if(CAMP.on&&CAMP.mode==='siege'){
    x=clamp(half*rand(.7,.95)*(Math.random()<.5?-1:1),-half+6,half-6);
    z=clamp(roadZ(x)+rand(-50,50),-half+6,half-6);
  }
  const kind=kindIn||pickKind();
  const st=ZSTATS[kind](G.wave);
  const zb={
    x,z,kind,brute:kind==='brute'||kind==='colossus',
    hp:st.hp,speed:st.sp,scale:st.sc,
    phase:rand(TAU),atkT:0,deadT:0,alive:true,rise:1,screamed:false,
    groanT:rand(2,9),spitT:rand(2,4),screamT:rand(4,7),burnT:0,frenzyT:0,
    tint:rand(.74,1.22),hunch:rand(.1,.4),hat:Math.random()<.3,gone:Math.random()<.16?(Math.random()<.5?'aL':'aR'):null,
    cloth:[0x5a5347,0x4a3e33,0x39402c,0x57424a,0x3e4654,0x6a604a][Math.floor(Math.random()*6)],
    flesh:[0x8d8a76,0x9a8f7c,0x7e8a72,0xa39383,0x76705e][Math.floor(Math.random()*5)],// no two rot alike
    quirk:kind==='walker'&&Math.random()<.12?'stare':null,// some of them remember
    gate:Math.random()<.62 // most of the dead remember doors
  };
  zb.speed*=.85;zb.maxhp=zb.hp;
  burst(x,heightAt(x,z)+.3,z,kind==='colossus'?34:12,0x5a4326,3,4);
  if(kind==='colossus')SFX.colossus();
  zombies.push(zb);
  return zb;
}
function zombieTarget(zb){
  for(const f of flarePool){
    if(!f.live||!f.p.landed)continue;
    if(Math.hypot(zb.x-f.p.x,zb.z-f.p.z)<46)return{x:f.p.x,z:f.p.z,kind:'flare',range:2.4};
  }
  if(player.alive){
    const dp=Math.hypot(zb.x-player.x,zb.z-player.z);
    if(dp<(zb.kind==='runner'?26:15))return{x:player.x,z:player.z,kind:'player',range:1.5};
  }
  for(const t of aliveTrucks()){
    const tz=roadZ(t.x);
    if(Math.hypot(zb.x-t.x,zb.z-tz)<17)return{x:t.x,z:tz,kind:'truck',range:2.8,ref:t};
  }
  let ba=null,bad=9;
  for(const al of allies){if(al.down)continue;const d=Math.hypot(zb.x-al.x,zb.z-al.z);if(d<bad){bad=d;ba=al;}}
  if(ba)return{x:ba.x,z:ba.z,kind:'ally',range:1.6,ref:ba};
  let bt=null,bd=10;
  for(const t of turrets){const d=Math.hypot(zb.x-t.x,zb.z-t.z);if(d<bd){bd=d;bt=t;}}
  if(bt)return{x:bt.x,z:bt.z,kind:'turret',range:2.2,ref:bt};
  if(CAMP.on){const l=leadTruck();
    if(l)return{x:l.x,z:roadZ(l.x),kind:'truck',range:2.8,ref:l};
    return{x:player.x,z:player.z,kind:'player',range:1.5};}
  if(WANDER.on){
    if(zb.migrate){
      if(Math.hypot(player.x-zb.x,player.z-zb.z)<9)zb.migrate=null;   // you made it about you
      else if(Math.hypot(zb.migrate.x-zb.x,zb.migrate.z-zb.z)<5)zb.migrate=null;
      else return{x:zb.migrate.x,z:zb.migrate.z,kind:'waypoint',range:1.4};
    }
    for(const s of WANDER.sites)
      if(s.kind==='stranded'&&!s.used&&Math.hypot(zb.x-s.x,zb.z-s.z)<26)
        return{x:s.x,z:s.z,kind:'waypoint',range:.9};
    return{x:player.x,z:player.z,kind:'player',range:1.5};
  }
  if(BAST.on&&zb.gate&&zb.x<-23)
    return{x:-21,z:roadZ(-24),kind:'waypoint',range:.8};   // make for the gate
  return{x:0,z:9.5,kind:'depot',range:8.2};
}
function updateZombies(dt,t){
  let mi=0;
  for(const zb of zombies){
    if(!zb.alive){
      zb.deadT+=dt;
      const corpseLim=BAST.on?(zombies.length>85?9:28):14;
      const melt=clamp((corpseLim-zb.deadT)/1.4,0,1);
      const k=clamp(zb.deadT/.45,0,1);
      _E.set(-1.5*k,zb.face||0,0);_Q.setFromEuler(_E);
      _P.set(zb.x,heightAt(zb.x,zb.z)+.15*(1-k)+.05-Math.min(.45,Math.max(0,zb.deadT-16)*.04),zb.z);
      _S.setScalar(Math.max(.001,zb.scale*melt));
      _M.compose(_P,_Q,_S);
      writeZombie(mi,_M,zb.brute?0x4a2620:(zb.cloth||0x39402c),0x6a6258,-.15,-.2,.12,-.08,true,zb.tint);
      mi++;continue;
    }
    if(zb.sleeping){
      // face-down among the bones, saving their strength
      _E.set(-1.45,zb.face||0,0);_Q.setFromEuler(_E);
      _P.set(zb.x,heightAt(zb.x,zb.z)+.12,zb.z);_S.setScalar(zb.scale);
      _M.compose(_P,_Q,_S);
      writeZombie(mi,_M,zb.cloth||0x39402c,zb.flesh||0x6a6258,-.1,-.1,0,0,true,zb.tint);
      mi++;continue;
    }
    if(zb.rise>0){
      zb.rise-=dt*.8;
      const gy=heightAt(zb.x,zb.z);
      if(Math.random()<.35)burst(zb.x,gy+.15,zb.z,2,0x5a4326,1.6,2.6);
      if(zb.rise<=0&&zb.kind==='runner'&&!zb.screamed){
        zb.screamed=true;
        SFX.scream(clamp(1-Math.hypot(zb.x-player.x,zb.z-player.z)/110,.15,1));
      }
      _E.set(.22,zb.face||0,Math.sin(t*9+zb.phase)*.1);_Q.setFromEuler(_E);
      _P.set(zb.x,gy-1.9*zb.scale*clamp(zb.rise,0,1),zb.z);_S.setScalar(zb.scale);
      _M.compose(_P,_Q,_S);
      writeZombie(mi,_M,0x4a4030,0x5d5444,-1.3+zb.rise*.5,-1.2+zb.rise*.5,0,0,false,zb.tint,EYE_COL[zb.kind],zb.hat&&!zb.brute,zb.gone);
      mi++;continue;
    }
    /* burn DoT */
    if(zb.burnT>0){
      zb.burnT-=dt;
      zb.hp-=zb.burnD*dt;
      if(Math.random()<dt*7)burst(zb.x,heightAt(zb.x,zb.z)+rand(.5,1.6)*zb.scale,zb.z,1,0xff8030,1,3);
      if(zb.hp<=0){damageZombie(zb,.01,null);mi++;continue;}
    }
    zb.frenzyT=Math.max(0,zb.frenzyT-dt);
    const tg=zombieTarget(zb);
    const dx=tg.x-zb.x,dz=tg.z-zb.z,d=Math.hypot(dx,dz)||1;
    {const fw=Math.atan2(dx,dz);
     let fd=fw-(zb.face??fw);fd=Math.atan2(Math.sin(fd),Math.cos(fd));
     zb.face=(zb.face??fw)+fd*Math.min(1,dt*5);}
    zb.stagT=Math.max(0,(zb.stagT||0)-dt);
    const spMul=(zb.frenzyT>0?1.5:1)*(wxFrenzy?1.25:1)*(zb.stagT>0?.4:1)*(zb.march&&zb.x<-58?1.85:1);
    const moveWith=(mx,mz,sp)=>{
      sp*=spMul;
      const stepx=zb.x+mx*sp*dt,stepz=zb.z+mz*sp*dt;
      for(const bg of bags)
        if(Math.hypot(stepx-bg.x,stepz-bg.z)<1.5){
          zb.atkT-=dt;
          if(zb.atkT<=0){zb.atkT=.95;damageBag(bg,zb.brute?34:9);SFX.thud();}
          return;
        }
      let wmul=1;
      for(const wr of wires)
        if(Math.hypot(zb.x-wr.x,zb.z-wr.z)<2.3){wmul=.38;zb.hp-=4*dt;wr.life-=dt*2;break;}
      if(zb.hp<=0){damageZombie(zb,.01,null);return;}
      const hCur=heightAt(zb.x,zb.z),hNext=heightAt(stepx,stepz);
      const slope=(hNext-hCur)/(sp*dt+.0001);
      let mul=wmul;
      if(slope>0)mul*=clamp(1-slope*.78,.12,1);
      zb.x+=mx*sp*mul*dt;zb.z+=mz*sp*mul*dt;
    };
    for(const o of zombies){
      if(o===zb||!o.alive)continue;
      const ox=zb.x-o.x,oz=zb.z-o.z,od=Math.hypot(ox,oz);
      if(od<1.2&&od>0){zb.x+=ox/od*dt*1.2;zb.z+=oz/od*dt*1.2;}
    }
    pushOut2(zb,.3,[CAMP_COLLIDERS]);
    if(!zb.alive){mi++;continue;}
    if(zb.kind==='exploder'&&d<2.9&&tg.kind!=='flare'){
      zb.alive=false;zb.deadT=13.9;
      explode(zb.x,heightAt(zb.x,zb.z)+.8,zb.z,5,60,.8);
      mi++;continue;
    }
    if(zb.kind==='spitter'){
      if(d<12)moveWith(-dx/d,-dz/d,zb.speed);
      else if(d>22)moveWith(dx/d,dz/d,zb.speed);
      zb.spitT-=dt;
      if(zb.spitT<=0&&d<34){zb.spitT=rand(3.2,5);spitAcid(zb,tg);}
      zb.atkT=0;
    }else if(zb.kind==='screamer'){
      if(d<18)moveWith(-dx/d,-dz/d,zb.speed);
      else if(d>30)moveWith(dx/d,dz/d,zb.speed);
      zb.screamT-=dt;
      if(zb.screamT<=0){
        zb.screamT=rand(6,9);
        SFX.wail();
        burst(zb.x,heightAt(zb.x,zb.z)+1.6,zb.z,20,0x9aff30,6,2);
        for(const o of zombies)
          if(o.alive&&o!==zb&&Math.hypot(o.x-zb.x,o.z-zb.z)<30)o.frenzyT=5;
      }
      zb.atkT=0;
    }else if(zb.kind==='colossus'&&d>9){
      moveWith(dx/d,dz/d,zb.speed);
      zb.spitT-=dt;
      if(zb.spitT<=0&&d<60){zb.spitT=rand(4,6);throwRock(zb,tg);}
      zb.atkT=0;
    }else if(d>tg.range){
      if(zb.quirk==='stare'){
        zb.stareC=(zb.stareC??rand(3,8))-dt;
        if(zb.stareC<0){zb.stareC=rand(7,13);zb.stareT=rand(1.4,2.8);}
      }
      if(zb.stareT>0)zb.stareT-=dt;   // it stops. it remembers something. then it doesn't.
      else moveWith(dx/d,dz/d,zb.speed);
      zb.atkT=0;
    }else if(tg.kind==='flare'||tg.kind==='waypoint'){
      zb.atkT=0;  // mill around the light, or press on through the gate
    }else{
      zb.atkT-=dt;
      if(zb.atkT<=0){
        if(zb.brute){
          zb.atkT=1.6;
          SFX.slam();
          const big=zb.kind==='colossus';
          const sx=zb.x+Math.sin(zb.face)*(big?3:1.6),sz=zb.z+Math.cos(zb.face)*(big?3:1.6);
          modifyTerrain(sx,sz,big?3.4:2.4,big?-.7:-.35);
          burst(sx,heightAt(sx,sz)+.4,sz,big?30:18,0x5a4326,5,6);
          const dp=Math.hypot(player.x-sx,player.z-sz);
          camShake=Math.max(camShake,clamp(1.3-dp*.03,0,1)*(big?.9:.6));
          if(tg.kind==='player'&&dp<(big?4.6:3.6))damagePlayer(big?45:30,zb);
          else if(tg.kind==='depot')damageDepot(big?60:26);
          else if(tg.kind==='truck')damageTruck(big?70:34,tg.ref);
          else if(tg.kind==='turret')damageTurret(tg.ref,big?70:34);
          else if(tg.kind==='ally')damageAlly(tg.ref,big?60:28);
        }else{
          zb.atkT=.95;
          if(tg.kind==='player')damagePlayer(8,zb);
          else if(tg.kind==='depot')damageDepot(7);
          else if(tg.kind==='truck')damageTruck(9,tg.ref);
          else if(tg.kind==='turret')damageTurret(tg.ref,10);
          else if(tg.kind==='ally')damageAlly(tg.ref,8);
          SFX.thud();
        }
      }
    }
    zb.groanT-=dt;
    if(zb.groanT<=0){
      zb.groanT=rand(4,12);
      const dp=Math.hypot(zb.x-player.x,zb.z-player.z);
      SFX.groan(clamp(1-dp/60,0,1)*.9,zb.brute?rand(55,75):rand(85,140));
    }
    const gy=heightAt(zb.x,zb.z);
    const crawl=zb.kind==='crawler';
    const animSp=(zb.kind==='runner'?4.4:zb.speed*2.4)*spMul;
    const sway=Math.sin(t*animSp+zb.phase)*(zb.kind==='runner'?.11:.06);
    const bob=Math.abs(Math.sin(t*animSp+zb.phase))*(crawl?.04:.08);
    _E.set(crawl?1.15:zb.kind==='runner'?.45:(zb.hunch||.22),zb.face,sway);_Q.setFromEuler(_E);
    _P.set(zb.x,gy+bob+(crawl?-.25:0),zb.z);
    crawl?_S.set(zb.scale,zb.scale,zb.scale*.9):_S.setScalar(zb.scale);
    _M.compose(_P,_Q,_S);
    const wk=Math.sin(t*animSp+zb.phase);
    const legAmp=crawl?.25:zb.kind==='runner'?.85:.55;
    const armBase=crawl?.9:-.12;
    const armAmp=crawl?.6:.28;
    const flash=zb.hitT&&zb.hitT>0;
    if(flash)zb.hitT-=dt;
    let colC,colF;
    if(flash){colC=colF=0xd86040;}
    else if(zb.burnT>0){colC=colF=Math.floor(t*9)%2?0xc06028:0x7a3a18;}
    else if(zb.kind==='exploder'){colF=Math.sin(t*6+zb.phase)>.2?0x7fae3a:0x5e7a36;colC=zb.cloth;}
    else if(zb.kind==='colossus'){colC=0x5e2a20;colF=0x7a4332;}
    else if(zb.brute){colC=0x8a3528;colF=0x9a6a52;}
    else if(zb.kind==='spitter'){colC=zb.cloth;colF=0x6e8a48;}      // the sickness shows in the skin
    else{colC=zb.frenzyT>0?0x8a6a45:zb.cloth;colF=zb.flesh;}
    writeZombie(mi,_M,colC,colF,
      armBase+wk*armAmp,armBase-wk*armAmp,
      wk*legAmp,-wk*legAmp,false,flash?1:zb.tint,EYE_COL[zb.kind],zb.hat&&!zb.brute,zb.gone);
    mi++;
  }
  zMesh.count=mi;zEyes.count=mi;zHats.count=mi;zHats.instanceMatrix.needsUpdate=true;
  zHead.count=mi;zHead.instanceMatrix.needsUpdate=true;
  if(zHead.instanceColor)zHead.instanceColor.needsUpdate=true;
  zMesh.instanceMatrix.needsUpdate=true;
  zEyes.instanceMatrix.needsUpdate=true;
  if(zMesh.instanceColor)zMesh.instanceColor.needsUpdate=true;
  if(zEyes.instanceColor)zEyes.instanceColor.needsUpdate=true;
  for(const lm of LIMBS){
    lm.count=mi;
    lm.instanceMatrix.needsUpdate=true;
    if(lm.instanceColor)lm.instanceColor.needsUpdate=true;
  }
  for(let i=zombies.length-1;i>=0;i--)
    if(!zombies[i].alive&&zombies[i].deadT>(BAST.on?(zombies.length>85?9:28):14))zombies.splice(i,1);
}
let chain=0,chainT=0;
function damageZombie(zb,dmg,hitPos,isHead){
  if(!zb.alive)return;
  zb.hp-=dmg;zb.hitT=.12;zb.stagT=.22;
  if(isHead)sTone('sine',1900,1500,.06,.12);
  SFX.hitFlesh();
  if(hitPos)burst(hitPos.x,hitPos.y,hitPos.z,7,0xa32417,3,3);
  if(zb.hp<=0){
    zb.alive=false;zb.deadT=0;
    G.kills++;chain++;chainT=3;
    if(zb.questTarget&&WANDER.quest){WANDER.quest.objDone=true;
      say('YOU','The coat stops walking here.',3200);saveWander();}
    { const ch=$('crosshair');ch.classList.remove('kill');void ch.offsetWidth;ch.classList.add('kill');
      setTimeout(()=>ch.classList.remove('kill'),240);
      const sp=document.createElement('div');sp.className='scorePop';
      sp.textContent='+'+(zb.brute?60:zb.kind==='colossus'?400:10)*(chain>4?2:1)+(chain>4?' ×2':'');
      document.body.appendChild(sp);setTimeout(()=>sp.remove(),850);
      if(document.querySelectorAll('.scorePop').length>4)document.querySelector('.scorePop').remove();
    }
    G.scrap+=Math.round((zb.kind==='colossus'?150:zb.brute?40:4)*G.scrapMul*(wxFrenzy?2:1));
    G.score+=(zb.kind==='colossus'?500:zb.brute?120:10)+(chain>=2?Math.min(chain,25)*3:0);
    decal(zb.x,zb.z,zb.kind==='colossus'?3.4:zb.brute?2.2:1);
    burst(zb.x,heightAt(zb.x,zb.z)+1,zb.z,zb.kind==='colossus'?40:16,0x7d1d12,4,4);
    if(zb.kind==='colossus'){camShake=Math.max(camShake,.8);SFX.colossus();}
    sTone('square',1300,950,.04,.09);   // kill-confirm tick
  }
}
function rayZombieAll(org,dir,maxD,maxN){
  const hits=[];
  for(const zb of zombies){
    if(!zb.alive||zb.rise>0)continue;
    const gy=heightAt(zb.x,zb.z);
    const sc=zb.scale;
    const spheres=zb.kind==='crawler'
      ?[[.45*sc,.6*sc,false]]
      :[[1.05*sc,.62*sc,false],[1.66*sc,.30*sc,true]];
    for(const[hy,hr,isHead]of spheres){
      _P.set(zb.x,gy+hy,zb.z).sub(org);
      const tt=_P.dot(dir);
      if(tt<0||tt>maxD)continue;
      const px=org.x+dir.x*tt,py=org.y+dir.y*tt,pz=org.z+dir.z*tt;
      const d2=(px-zb.x)**2+(py-(gy+hy))**2+(pz-zb.z)**2;
      if(d2<hr*hr){hits.push({zb,t:tt,head:isHead});break;}
    }
  }
  hits.sort((a,b)=>a.t-b.t);
  return hits.slice(0,maxN);
}
function igniteZombie(zb,t,dps){zb.burnT=Math.max(zb.burnT||0,t);zb.burnD=dps*G.dmgMul;}

/* ---------------- acid (spitters) ---------------- */
const acidMeshes=[];
{
  const g=new THREE.SphereGeometry(.22,8,6);
  for(let i=0;i<16;i++){
    const am=new THREE.MeshBasicMaterial();
    am.color.setRGB(1.4,6,.5);
    const m=new THREE.Mesh(g,am);
    m.visible=false;m.live=false;scene.add(m);acidMeshes.push(m);
  }
}
let acidFlash=0;
function spitAcid(zb,tg){
  const m=acidMeshes.find(a=>!a.live);if(!m)return;
  const gy=heightAt(zb.x,zb.z)+1.4;
  const T=1.15,grav=16;
  const tx=tg.x+rand(-1.6,1.6),tz=tg.z+rand(-1.6,1.6),ty=heightAt(tx,tz);
  m.live=true;m.visible=true;m.rock=false;
  m.scale.setScalar(1);m.material.color.setRGB(1.4,6,.5);
  m.p={x:zb.x,y:gy,z:zb.z,vx:(tx-zb.x)/T,vy:(ty-gy)/T+.5*grav*T,vz:(tz-zb.z)/T};
  SFX.spit();
}
function throwRock(zb,tg){
  const m=acidMeshes.find(a=>!a.live);if(!m)return;
  const gy=heightAt(zb.x,zb.z)+4.5;
  const T=1.5,grav=16;
  const tx=tg.x+rand(-2.5,2.5),tz=tg.z+rand(-2.5,2.5),ty=heightAt(tx,tz);
  m.live=true;m.visible=true;m.rock=true;
  m.scale.setScalar(3.2);m.material.color.setRGB(.32,.28,.23);
  m.p={x:zb.x,y:gy,z:zb.z,vx:(tx-zb.x)/T,vy:(ty-gy)/T+.5*grav*T,vz:(tz-zb.z)/T};
  sTone('sawtooth',80,30,.5,.3);
}
function updateAcids(dt){
  for(const m of acidMeshes){
    if(!m.live)continue;
    const p=m.p;
    p.vy-=16*dt;p.x+=p.vx*dt;p.y+=p.vy*dt;p.z+=p.vz*dt;
    m.position.set(p.x,p.y,p.z);
    if(p.y<=heightAt(p.x,p.z)+.1){
      m.live=false;m.visible=false;
      if(m.rock){
        explode(p.x,p.y+.5,p.z,3.6,40,.45);
      }else{
        SFX.acidHit();
        burst(p.x,p.y+.2,p.z,14,0x9aff30,3.5,4);
        const dp=Math.hypot(player.x-p.x,player.z-p.z);
        if(player.alive&&dp<3.4){damagePlayer(14,zb);acidFlash=1;}
        for(const t of[...turrets])if(Math.hypot(t.x-p.x,t.z-p.z)<3.2)damageTurret(t,14);
        if(Math.hypot(p.x,p.z)<7.5)damageDepot(8);
        for(const t of aliveTrucks())if(Math.hypot(t.x-p.x,roadZ(t.x)-p.z)<3.6)damageTruck(12,t);
      }
    }
  }
}

/* ---------------- grenades ---------------- */
const nadePool=[];
{
  const g=new THREE.SphereGeometry(.14,8,6);
  for(let i=0;i<6;i++){
    const m=new THREE.Mesh(g,new THREE.MeshStandardMaterial({color:0x2c3322}));
    m.visible=false;m.live=false;scene.add(m);nadePool.push(m);
  }
}
function throwGrenade(){
  if(G.state!=='play'||!player.alive||G.items.nade<=0)return;
  const m=nadePool.find(n=>!n.live);if(!m)return;
  G.items.nade--;
  camera.getWorldDirection(_dir);
  m.live=true;m.visible=true;
  m.p={x:camera.position.x+_dir.x*.7,y:camera.position.y-.12,z:camera.position.z+_dir.z*.7,
    vx:_dir.x*18,vy:_dir.y*18+4.4,vz:_dir.z*18,t:2.1};
  SFX.load();vmSwing=.7;
}
function updateNades(dt){
  for(const m of nadePool){
    if(!m.live)continue;
    const p=m.p;
    p.vy-=21*dt;p.x+=p.vx*dt;p.y+=p.vy*dt;p.z+=p.vz*dt;
    const g=heightAt(p.x,p.z);
    if(p.y<g+.14){p.y=g+.14;p.vy*=-.35;p.vx*=.55;p.vz*=.55;}
    m.position.set(p.x,p.y,p.z);
    p.t-=dt;
    if(p.t<=0){m.live=false;m.visible=false;explode(p.x,p.y,p.z);}
  }
}
function wreckEnvironment(x,z,r){
  const touched=new Set();
  const M0=new THREE.Matrix4().makeScale(0,0,0);
  for(let i=DESTRUCT.length-1;i>=0;i--){
    const d=DESTRUCT[i];
    if(Math.hypot(d.x-x,d.z-z)>r)continue;
    d.m.setMatrixAt(d.i,M0);
    touched.add(d.m);
    if(Math.random()<.4)burst(d.x,heightAt(d.x,d.z)+1.2,d.z,3,0x6a5a40,2,3);
    if(d.tree&&stumps.length<46){
      const st=new THREE.Mesh(stumpGeo,stumpMat);
      st.position.set(d.x,heightAt(d.x,d.z),d.z);
      st.rotation.y=rand(TAU);st.scale.setScalar(rand(.7,1.15));
      st.castShadow=true;scene.add(st);stumps.push(st);
    }
    DESTRUCT.splice(i,1);
  }
  for(const m2 of touched)m2.instanceMatrix.needsUpdate=true;
  for(let i=COLLIDERS.length-1;i>=0;i--)
    if(Math.hypot(COLLIDERS[i].x-x,COLLIDERS[i].z-z)<r)COLLIDERS.splice(i,1);
}
const ROCKETS=[];
const rocketPool=[];
{
  const bodyM=new THREE.MeshStandardMaterial({color:0x4a4d3a,roughness:.6,metalness:.4});
  const tipM=new THREE.MeshStandardMaterial({color:0x8a6a30,metalness:.7,roughness:.35});
  for(let i=0;i<4;i++){
    const g=new THREE.Group();
    const body=new THREE.Mesh(new THREE.CylinderGeometry(.05,.05,.4,7),bodyM);
    body.rotation.x=Math.PI/2;g.add(body);
    const tip=new THREE.Mesh(new THREE.ConeGeometry(.05,.14,7),tipM);
    tip.rotation.x=-Math.PI/2;tip.position.z=-.27;g.add(tip);
    const burn=new THREE.Sprite(new THREE.SpriteMaterial({map:softDot,transparent:true,
      opacity:.9,blending:THREE.AdditiveBlending,depthWrite:false}));
    burn.material.color.setRGB(6,3.2,1);burn.scale.setScalar(.5);burn.position.z=.28;g.add(burn);
    g.visible=false;scene.add(g);rocketPool.push(g);
  }
}
function fireRocket(){
  camera.getWorldDirection(_dir);
  const mesh=rocketPool.find(g=>!g.visible);
  if(mesh)mesh.visible=true;
  ROCKETS.push({x:camera.position.x+_dir.x,y:camera.position.y+_dir.y-.2,z:camera.position.z+_dir.z,
    vx:_dir.x*34,vy:_dir.y*34,vz:_dir.z*34,t:0,mesh});
  SFX.dmr();sNoise(.5,'lowpass',1400,200,.3);
  for(let i=0;i<4;i++)puffSmoke(_tv.set(
    camera.position.x-_dir.x*(1.5+i*.7)+rand(-.3,.3),
    camera.position.y-.3+rand(-.2,.2),
    camera.position.z-_dir.z*(1.5+i*.7)+rand(-.3,.3)),false,true);
  vmKick=Math.min(3,vmKick+2.2);camShake=Math.max(camShake,.7);
}
function updateRockets(dt){
  for(let i=ROCKETS.length-1;i>=0;i--){
    const r=ROCKETS[i];r.t+=dt;
    r.vy-=5.5*dt;   // the round remembers it is heavy
    r.x+=r.vx*dt;r.y+=r.vy*dt;r.z+=r.vz*dt;
    if(r.mesh){
      r.mesh.position.set(r.x,r.y,r.z);
      r.mesh.lookAt(r.x+r.vx,r.y+r.vy,r.z+r.vz);
    }
    if(Math.random()<.85)puffSmoke(_tv.set(r.x,r.y,r.z),false,true);
    let hit=r.t>6||r.y<=heightAt(r.x,r.z)+.25;
    if(!hit)for(const zb of zombies)if(zb.alive&&Math.hypot(zb.x-r.x,zb.z-r.z)<1.4&&Math.abs(r.y-heightAt(zb.x,zb.z)-1)<2){hit=true;break;}
    if(hit){
      if(r.mesh)r.mesh.visible=false;
      ROCKETS.splice(i,1);
      explode(r.x,Math.max(r.y,heightAt(r.x,r.z))+.5,r.z,9.5,210,1.7);
    }
  }
}
function explode(x,y,z,r=8,dmg=150,crater=1.25){
  wreckEnvironment(x,z,r*.8);
  decal(x,z,Math.min(4,r*.35));   // the scorch fits the blast
  modifyTerrain(x,z,crater*3.5,-crater);
  burst(x,y+.6,z,Math.round(r*5.5),0xd08838,r+1,r+2);
  burst(x,y+.3,z,Math.round(r*3.5),0x3a2c1c,r-1,r-1);
  for(const zb of zombies){
    if(!zb.alive)continue;
    const d=Math.hypot(zb.x-x,zb.z-z);
    if(d<r)damageZombie(zb,dmg*(1-d/r)+25,null);
  }
  const dp=Math.hypot(player.x-x,player.z-z);
  if(dp<r*.9&&player.alive)damagePlayer(Math.round(36*(1-dp/(r*.9))));
  for(const tr of[...turrets])if(Math.hypot(tr.x-x,tr.z-z)<r*.65)damageTurret(tr,30);
  for(const bg of[...bags])if(Math.hypot(bg.x-x,bg.z-z)<r*.65)damageBag(bg,60);
  for(const t of aliveTrucks())if(Math.hypot(t.x-x,roadZ(t.x)-z)<r*.65)damageTruck(30,t);
  camShake=Math.max(camShake,clamp(1.5-dp*.015,0,1.3));
  boomLight.position.set(x,y+2,z);boomLight.intensity=300;
  puffSmoke(new THREE.Vector3(x,y+1.6,z),true);
  SFX.boom();
}

/* ---------------- items: molotov · fire · mines · flares · medkit · fortifications ---------------- */
const ITEM_CAPS=()=>({nade:6+G.pocketsLvl,molotov:4+G.pocketsLvl,mine:4+G.pocketsLvl,medkit:3+G.pocketsLvl,flare:4+G.pocketsLvl});
const molotovPool=[];
{
  const g=new THREE.SphereGeometry(.13,8,6);
  for(let i=0;i<4;i++){
    const mm=new THREE.MeshBasicMaterial();mm.color.setRGB(3,1.4,.3);
    const m=new THREE.Mesh(g,mm);
    m.visible=false;m.live=false;scene.add(m);molotovPool.push(m);
  }
}
function throwMolotov(){
  if(G.state!=='play'||!player.alive||G.items.molotov<=0)return;
  const m=molotovPool.find(n=>!n.live);if(!m)return;
  G.items.molotov--;
  camera.getWorldDirection(_dir);
  m.live=true;m.visible=true;
  m.p={x:camera.position.x+_dir.x*.7,y:camera.position.y-.12,z:camera.position.z+_dir.z*.7,
    vx:_dir.x*17,vy:_dir.y*17+4.6,vz:_dir.z*17};
  SFX.load();vmSwing=.7;
}
function updateMolotovs(dt){
  for(const m of molotovPool){
    if(!m.live)continue;
    const p=m.p;
    p.vy-=21*dt;p.x+=p.vx*dt;p.y+=p.vy*dt;p.z+=p.vz*dt;
    m.position.set(p.x,p.y,p.z);
    if(p.y<=heightAt(p.x,p.z)+.15){
      m.live=false;m.visible=false;
      addFirePatch(p.x,p.z,3.6,8);
      for(const zb of zombies)
        if(zb.alive&&Math.hypot(zb.x-p.x,zb.z-p.z)<4.2)igniteZombie(zb,3.5,22);
      SFX.crash();
    }
  }
}
/* burning ground */
const firePool=[];
{
  const c=document.createElement('canvas');c.width=c.height=64;
  const g=c.getContext('2d');
  const rg=g.createRadialGradient(32,34,2,32,32,30);
  rg.addColorStop(0,'rgba(255,200,90,.95)');rg.addColorStop(.45,'rgba(240,110,30,.6)');rg.addColorStop(1,'rgba(180,40,10,0)');
  g.fillStyle=rg;g.fillRect(0,0,64,64);
  const tex=new THREE.CanvasTexture(c);
  for(let i=0;i<26;i++){
    const mat=new THREE.SpriteMaterial({map:tex,transparent:true,opacity:0,depthWrite:false,blending:THREE.AdditiveBlending});
    mat.color.setRGB(2.4,1.1,.4);
    const s=new THREE.Sprite(mat);
    s.live=false;scene.add(s);firePool.push(s);
  }
}
const fireLight=new THREE.PointLight(0xff7826,0,30);scene.add(fireLight);
function addFirePatch(x,z,r,life){
  let s=firePool.find(f=>!f.live);
  if(!s){ // evict the oldest mortal flame; the braziers are forever
    let best=null,bt=-1;
    for(const f of firePool)if(f.userData.life<5000&&f.userData.t>bt){bt=f.userData.t;best=f;}
    if(!best)return;
    s=best;
  }
  s.live=true;
  s.position.set(x,heightAt(x,z)+.8,z);
  s.userData={t:0,life,r};
  s.material.opacity=.85;
}
function updateFires(dt,t){
  if(Math.random()<dt*14){ // stray embers climb from any living fire
    for(const fp of firePool){if(!fp.live)continue;
      if(Math.random()<.25)burst(fp.position.x+rand(-1,1),fp.position.y+rand(.5,1.5),fp.position.z+rand(-1,1),
        1,0xff9030,0.5,5);
      break;}
  }
  let nearest=null,nd=1e9;
  for(const s of firePool){
    if(!s.live)continue;
    const u=s.userData;u.t+=dt;
    if(u.t>=u.life){s.live=false;s.material.opacity=0;continue;}
    const k=1-u.t/u.life;
    s.scale.setScalar(u.r*(1.4+Math.sin(t*13+s.id)*.18)*(.5+k*.5));
    s.material.opacity=.55*k+.25;
    if(Math.random()<dt*4){
      burst(s.position.x+rand(-u.r*.5,u.r*.5),s.position.y,s.position.z+rand(-u.r*.5,u.r*.5),1,0xff8030,1,4);
      if(Math.random()<.4)SFX.crackle();
    }
    for(const zb of zombies)
      if(zb.alive&&Math.hypot(zb.x-s.position.x,zb.z-s.position.z)<u.r)igniteZombie(zb,1.4,20);
    if(player.alive&&Math.hypot(player.x-s.position.x,player.z-s.position.z)<u.r*.8&&Math.random()<dt*2)damagePlayer(5);
    const d=Math.hypot(player.x-s.position.x,player.z-s.position.z);
    if(d<nd){nd=d;nearest=s;}
  }
  if(nearest){
    fireLight.position.set(nearest.position.x,nearest.position.y+1.1,nearest.position.z);
    const want=(15+Math.sin(t*13)*4+Math.sin(t*31)*2.5)*Math.min(2.4,(nearest.userData.r||1));
    fireLight.intensity=lerp(fireLight.intensity,want,Math.min(1,dt*5)); // breathes up, never pops
  }else fireLight.intensity=Math.max(0,fireLight.intensity-dt*40);
}
/* mines */
const minePool=[];
{
  const g=new THREE.CylinderGeometry(.42,.48,.13,10);
  for(let i=0;i<8;i++){
    const grp=new THREE.Group();
    grp.add(new THREE.Mesh(g,new THREE.MeshStandardMaterial({color:0x3a3d2c,roughness:.5,metalness:.4})));
    const dot=new THREE.Mesh(new THREE.SphereGeometry(.05),new THREE.MeshBasicMaterial({color:0xa3271e}));
    dot.position.y=.1;grp.add(dot);grp.userData.dot=dot;
    grp.visible=false;grp.live=false;scene.add(grp);minePool.push(grp);
  }
}
function placeMine(){
  if(G.state!=='play'||!player.alive||G.items.mine<=0)return;
  const m=minePool.find(n=>!n.live);if(!m)return;
  G.items.mine--;
  const fx=-Math.sin(player.yaw),fz=-Math.cos(player.yaw);
  const x=player.x+fx*2.4,z=player.z+fz*2.4;
  m.live=true;m.visible=true;m.armT=1.2;
  m.position.set(x,heightAt(x,z)+.08,z);
  SFX.beep();toast('MINE ARMED IN 1s');
}
function updateMines(dt,t){
  for(const m of minePool){
    if(!m.live)continue;
    if(m.armT>0){m.armT-=dt;m.userData.dot.material.color.set(0xe8c050);continue;}
    m.userData.dot.material.color.set(Math.floor(t*3)%2?0xa3271e:0x441510);
    for(const zb of zombies){
      if(!zb.alive||zb.rise>0)continue;
      if(Math.hypot(zb.x-m.position.x,zb.z-m.position.z)<1.7){
        m.live=false;m.visible=false;
        explode(m.position.x,m.position.y+.5,m.position.z,6,130,.85);
        break;
      }
    }
  }
}
/* decoy flares */
const flarePool=[];
{
  for(let i=0;i<4;i++){
    const mat=new THREE.SpriteMaterial({transparent:true,opacity:0,depthWrite:false,blending:THREE.AdditiveBlending});
    mat.color.setRGB(8,1.2,.8);
    const s=new THREE.Sprite(mat);
    s.scale.setScalar(.8);
    s.live=false;scene.add(s);flarePool.push(s);
  }
}
const flareLight=new THREE.PointLight(0xff4030,0,30);scene.add(flareLight);
function throwFlare(){
  if(G.state!=='play'||!player.alive||G.items.flare<=0)return;
  const f=flarePool.find(n=>!n.live);if(!f)return;
  G.items.flare--;
  camera.getWorldDirection(_dir);
  f.live=true;f.visible=true;
  f.p={x:camera.position.x,y:camera.position.y,z:camera.position.z,
    vx:_dir.x*15,vy:_dir.y*15+5,vz:_dir.z*15,t:12,landed:false};
  f.material.opacity=.95;
  SFX.flare();toast('FLARE OUT, THE DEAD CHASE THE LIGHT');
}
function updateFlares(dt,t){
  let act=null;
  for(const f of flarePool){
    if(!f.live)continue;
    const p=f.p;
    if(!p.landed){
      p.vy-=20*dt;p.x+=p.vx*dt;p.y+=p.vy*dt;p.z+=p.vz*dt;
      if(p.y<=heightAt(p.x,p.z)+.4){p.y=heightAt(p.x,p.z)+.4;p.landed=true;}
    }else{
      p.t-=dt;
      if(Math.random()<dt*8)burst(p.x,p.y,p.z,1,0xff5040,1,3);
      if(p.t<=0){f.live=false;f.visible=false;f.material.opacity=0;continue;}
    }
    f.position.set(p.x,p.y,p.z);
    f.material.opacity=.6+Math.sin(t*22)*.3;
    act=f;
  }
  if(act){flareLight.position.copy(act.position);flareLight.intensity=20+Math.sin(t*19)*8;}
  else flareLight.intensity=0;
}
function useMedkit(){
  if(G.state!=='play'||!player.alive||G.items.medkit<=0)return;
  if(player.hp>=player.maxhp){toast('VITALS NOMINAL');return;}
  G.items.medkit--;
  player.healT=4;
  SFX.chime();toast('MEDKIT, PATCHING UP');
}
/* fortifications: sandbags & wire */
const bags=[],wires=[];
function placeBag(x,z,yaw){
  const grp=new THREE.Group();
  for(const[ox,oy]of[[-.6,.16],[0,.16],[.6,.16],[-.3,.45],[.3,.45]]){
    const b=new THREE.Mesh(bagGeo,bagMat);
    b.scale.set(.8,1,1);                       // nestled, not floating
    b.position.set(ox,oy,0);b.rotation.y=rand(-.12,.12);b.castShadow=true;grp.add(b);
  }
  grp.position.set(x,heightAt(x,z),z);grp.rotation.y=yaw;
  scene.add(grp);
  bags.push({x,z,mesh:grp,hp:160});
  SFX.build();
}
function damageBag(bg,d){
  bg.hp-=d;
  if(bg.hp<=0){
    scene.remove(bg.mesh);bags.splice(bags.indexOf(bg),1);
    burst(bg.x,heightAt(bg.x,bg.z)+.6,bg.z,16,0x8a8060,4,4);
    SFX.thud();
  }
}
function placeWire(x,z,yaw){
  const grp=new THREE.Group();
  const m=new THREE.MeshStandardMaterial({color:0x26261f,roughness:.4,metalness:.7});
  for(let i=-1;i<=1;i++){
    const post=new THREE.Mesh(new THREE.BoxGeometry(.08,.8,.08),m);
    post.position.set(i*1.4,.4,0);grp.add(post);
  }
  for(let j=0;j<3;j++){
    const w=new THREE.Mesh(new THREE.BoxGeometry(3,.025,.025),m);
    w.position.set(0,.2+j*.25,0);w.rotation.z=rand(-.04,.04);grp.add(w);
  }
  grp.position.set(x,heightAt(x,z),z);grp.rotation.y=yaw;
  scene.add(grp);
  wires.push({x,z,mesh:grp,life:90});
  SFX.build();
}

/* ---------------- allied riflemen ---------------- */
const allies=[];
function buildAllyMesh(role,civ){
  const g=new THREE.Group();
  const tint=.85+Math.random()*.3; // no two coats faded alike, and not all of them were issued
  const coatC=Math.random()<.6?0x5d6243:[0x4a3e33,0x55584a,0x3e4654,0x6a5a40][Math.floor(Math.random()*4)];
  const uni=new THREE.MeshStandardMaterial({color:new THREE.Color(coatC).multiplyScalar(tint),roughness:.85,
    bumpMap:fleshTex,bumpScale:.25}); // wool weave: borrowed noise, read as cloth
  const dk=new THREE.MeshStandardMaterial({color:0x3c402f,roughness:.85,bumpMap:fleshTex,bumpScale:.2});
  const lthr=new THREE.MeshStandardMaterial({color:0x46341f,roughness:.55});
  const skin=new THREE.MeshStandardMaterial({color:0xb89a78,roughness:.8,bumpMap:fleshTex,bumpScale:.12});
  const stl=new THREE.MeshStandardMaterial({color:0x4d4d46,roughness:.32,metalness:.85,envMapIntensity:1.2});
  const P=(geo,mat,x,y,z,rx=0,ry=0,rz=0)=>{const m=new THREE.Mesh(geo,mat);
    m.position.set(x,y,z);m.rotation.set(rx,ry,rz);m.castShadow=true;g.add(m);return m;};
  // greatcoat: flared skirt, cinched waist, broad chest
  P(new THREE.CylinderGeometry(.205,.3,.52,14),uni,0,.76,0);
  P(new THREE.CylinderGeometry(.195,.215,.44,14),uni,0,1.21,0);
  P(new THREE.CylinderGeometry(.215,.215,.07,14),lthr,0,1.0,0);           // belt
  P(new THREE.BoxGeometry(.04,.04,.05),stl,0,1.0,.21);                    // buckle
  P(new THREE.BoxGeometry(.1,.13,.06),lthr,-.13,.97,.18);                 // ammo pouches
  P(new THREE.BoxGeometry(.1,.13,.06),lthr,.13,.97,.18);
  P(new THREE.BoxGeometry(.05,.44,.035),lthr,-.1,1.27,.2,-.1);            // webbing straps
  P(new THREE.BoxGeometry(.05,.44,.035),lthr,.1,1.27,.2,.1);
  if(Math.random()<.35){ // a bandolier, scrounged
    const band=P(new THREE.BoxGeometry(.06,.46,.03),lthr,0,1.22,.21,0,0,.6);
    for(let bi=0;bi<4;bi++)P(new THREE.BoxGeometry(.02,.05,.035),
      new THREE.MeshStandardMaterial({color:0xb08a3e,metalness:.8,roughness:.35}),
      -.1+bi*.066,1.32-bi*.075,.225,0,0,.6);
  }
  // pack + bedroll across the shoulders
  P(new THREE.BoxGeometry(.3,.3,.14),dk,0,1.26,-.22);
  P(new THREE.CylinderGeometry(.06,.06,.4,8),dk,0,1.46,-.22,0,0,Math.PI/2);
  // shoulders + arms cradling the rifle at port
  P(new THREE.SphereGeometry(.085,10,7),uni,-.2,1.4,0);
  P(new THREE.SphereGeometry(.085,10,7),uni,.2,1.4,0);
  P(new THREE.CylinderGeometry(.052,.06,.34,10),uni,-.25,1.24,.05,.55,0,.3);
  P(new THREE.CylinderGeometry(.052,.06,.34,10),uni,.25,1.26,.03,.4,0,-.25);
  P(new THREE.CylinderGeometry(.045,.05,.28,10),uni,-.16,1.13,.23,1.3,0,.15);
  P(new THREE.CylinderGeometry(.045,.05,.28,10),uni,.2,1.16,.2,1.25,0,-.1);
  P(new THREE.SphereGeometry(.055,9,6),skin,-.13,1.16,.34);               // hands on the piece
  P(new THREE.SphereGeometry(.055,9,6),skin,.18,1.2,.3);
  // head: weathered face under a brimmed steel helmet
  P(new THREE.SphereGeometry(.142,16,12),skin,0,1.6,.02);
  P(new THREE.SphereGeometry(.012,5,4),dk,-.05,1.63,.145).castShadow=false; // eyes
  P(new THREE.SphereGeometry(.012,5,4),dk,.05,1.63,.145).castShadow=false;
  P(new THREE.SphereGeometry(.02,5,4),skin,0,1.6,.155);                   // nose
  // a face of their own: tone, whiskers, the lot
  const tones=[0xc9a886,0xb89a78,0x8a6a4e,0x6e4f38,0xd9b894];
  skin.color.set(tones[Math.floor(Math.random()*tones.length)]);
  const hairC=new THREE.MeshStandardMaterial({color:[0x2a2018,0x4a3a22,0x6e6e64][Math.floor(Math.random()*3)],roughness:.9});
  if(Math.random()<.45)P(new THREE.BoxGeometry(.075,.018,.025),hairC,0,1.565,.145);    // mustache
  if(Math.random()<.3)P(new THREE.BoxGeometry(.1,.05,.05),hairC,0,1.5,.115);           // beard
  if(Math.random()<.12){                                                                // field glasses
    P(new THREE.TorusGeometry(.026,.005,5,10),stl,-.05,1.63,.15);
    P(new THREE.TorusGeometry(.026,.005,5,10),stl,.05,1.63,.15);
  }
  const hg=Math.random();
  if(hg<.55){ // steel helmet
    const dome=P(new THREE.SphereGeometry(.195,16,11,0,TAU,0,1.8),dk,0,1.645,.01);
    dome.scale.set(1.02,.8,1.1);
    P(new THREE.CylinderGeometry(.222,.242,.022,18),dk,0,1.614,.01);
    if(role==='MEDIC'){ // the cross, so they aim elsewhere
      P(new THREE.BoxGeometry(.09,.02,.012),new THREE.MeshStandardMaterial({color:0xe8e0d0}),0,1.7,.17);
      P(new THREE.BoxGeometry(.02,.09,.012),new THREE.MeshStandardMaterial({color:0xe8e0d0}),0,1.7,.17);
    }
  }else if(hg<.8){ // side cap, tilted the regulation amount of wrong
    const cap=P(new THREE.BoxGeometry(.2,.07,.26),dk,0,1.74,.02,0,0,.18);
    cap.scale.z=.9;
  }else{ // bare-headed: hair and the wind
    P(new THREE.SphereGeometry(.148,12,8,0,TAU,0,1.5),hairC,0,1.64,.0).scale.set(1,.7,1.05);
  }
  if(Math.random()<.4){ // a scarf against the long cold
    P(new THREE.TorusGeometry(.12,.045,6,10),
      new THREE.MeshStandardMaterial({color:[0x7a3a30,0x4a5568,0x8a7a4a][Math.floor(Math.random()*3)],roughness:.95}),
      0,1.44,.02,Math.PI/2);
  }
  if(role&&role!=='MEDIC'){ // role armband on the left arm
    const bandC={SAPPER:0xc8a83a,GUNNER:0x8c2f23,SCOUT:0x5d7a43,CHAPLAIN:0x6a5a8a}[role]||0x6a6a5a;
    P(new THREE.CylinderGeometry(.062,.066,.06,7),
      new THREE.MeshStandardMaterial({color:bandC,roughness:.8}),-.25,1.3,.04,.55,0,.3);
  }
  P(new THREE.BoxGeometry(.018,.13,.018),lthr,-.125,1.52,.03,0,0,.25);    // chin strap
  P(new THREE.BoxGeometry(.018,.13,.018),lthr,.125,1.52,.03,0,0,-.25);
  // legs that hinge at the hip, so the walk reads human
  const mkLeg=sx=>{
    const lg=new THREE.Group();lg.position.set(sx,.62,0);
    const th=new THREE.Mesh(new THREE.CylinderGeometry(.072,.066,.34,10),uni);th.position.y=-.2;th.castShadow=true;lg.add(th);
    const pt=new THREE.Mesh(new THREE.CylinderGeometry(.062,.074,.22,10),dk);pt.position.y=-.47;pt.castShadow=true;lg.add(pt);
    const bt=new THREE.Mesh(new THREE.BoxGeometry(.12,.07,.22),lthr);bt.position.set(0,-.585,.03);bt.castShadow=true;lg.add(bt);
    g.add(lg);return lg;};
  g.userData.legL=mkLeg(-.11);g.userData.legR=mkLeg(.11);
  if(civ){ // a bundle of everything they could carry, held like a child
    const bundle=P(new THREE.BoxGeometry(.34,.26,.2),
      new THREE.MeshStandardMaterial({color:0x7a6a4e,roughness:1,map:woodTex}),0,1.12,.3,.2);
    g.userData.rifle=bundle;g.userData.rifleZ=.3;
    return g;
  }
  // the rifle, held ready across the chest
  const rifle=new THREE.Group();
  const rw=new THREE.Mesh(new THREE.BoxGeometry(.05,.07,.62),
    new THREE.MeshStandardMaterial({color:0x6b4f30,map:woodTex,roughness:.7}));
  const rb=new THREE.Mesh(new THREE.CylinderGeometry(.014,.016,.5,6),stl);
  rb.rotation.x=Math.PI/2;rb.position.set(0,.02,.5);
  const rs=new THREE.Mesh(new THREE.BoxGeometry(.06,.1,.2),
    new THREE.MeshStandardMaterial({color:0x5a4226,map:woodTex,roughness:.75}));
  rs.position.set(0,-.02,-.36);
  rifle.add(rw,rb,rs);
  rifle.traverse(o=>o.castShadow=true);
  rifle.position.set(.05,1.18,.28);
  rifle.rotation.set(.1,-.35,.1);
  g.add(rifle);
  g.userData.rifle=rifle;g.userData.rifleZ=.28;
  return g;
}
const ALLY_NAMES=['Webb','Kovacs','Brandt','Sorel','Okafor','Lindh','Marek','Voss','Quint','Petrov','Ash','Iversen'];
function spawnAlly(px,pz){
  if(allies.length>=((CAMP.on||BAST.on)?6:3))return null;
  const ang=rand(TAU);
  const a={ang,x:px??Math.cos(ang)*13,z:pz??Math.sin(ang)*13,hp:140,maxhp:140,
    fireT:rand(.5,1),wanderT:0,tx:null,tz:null,mesh:buildAllyMesh(),recoil:0,face:rand(TAU),
    dmgMul:1,offerT:0};
  // in the campaign, the rifleman walking beside you IS one of your people
  a.comp=CAMP.on?(compsAlive().find(c=>!allies.some(o=>o.comp===c))||anyComp()):null;
  a.name=a.comp?a.comp.name.split(' ').pop():pick(ALLY_NAMES);
  scene.remove(a.mesh);a.mesh=buildAllyMesh(a.comp?a.comp.role:null);
  a.mesh.scale.setScalar(.92+Math.random()*.14);
  a.mesh.position.set(a.x,heightAt(a.x,a.z),a.z);
  scene.add(a.mesh);
  allies.push(a);
  return a;
}
function allyLine(a){
  const c=a.comp;
  if(c){
    return pick([
      ()=>'Still want '+c.wish+'. Ask me again at Verdun.',
      ()=>c.t1==='funny'?'I had a joke about this road. The road heard it first.':'Stay '+c.t1+'. The '+c.t1+' ones live longer out here.',
      ()=>'I ride with '+TRUCK_NAMES[c.truck]+'. She rattles on the left wheel. It\'s a song now.',
      ()=>c.morale>60?'We\'re going to make it. I\'ve decided. Deciding is free.':'Don\'t promise me anything. Just walk where I can see you.',
      ()=>'My feet say five more miles. My '+c.t2+' half says fifty.',
      ()=>'When I signed on as '+c.role.toLowerCase()+' nobody mentioned the walking. Or the dead. Mostly the walking.',
    ])();
  }
  if(WANDER.on)return pick([
    ()=>'Region '+WANDER.region+'. The country doesn\'t end, it just changes its mind.',
    ()=>'I count my steps some days. The number stopped meaning anything back in the thousands.',
    ()=>'You sleep, I\'ll watch. You watch, I\'ll sleep. That\'s the whole economy.',
    ()=>'When this is over I\'m going to sit in a chair. A real one. For a year.',
    ()=>'We walk until the walking means something. I read that somewhere. Probably a gravestone.',
  ])();
  return pick([
    ()=>'Quiet today. I hate quiet.',
    ()=>'You dig, I shoot. That\'s the whole friendship, and it\'s a good one.',
    ()=>'My boots dried out overnight. Best day of the war so far.',
    ()=>'If I go down, my tags go to records. Promise me that and we\'re square.',
  ])();
}
function damageAlly(a,d){
  if(a.down)return;
  a.hp-=d;
  burst(a.x,heightAt(a.x,a.z)+1.2,a.z,5,0xa32417,3,3);
  if(a.hp<=0){
    if(BAST.on){ // downed, not dead: the clock starts
      a.down=true;a.downT=30;a.hp=0;
      a.mesh.rotation.x=-1.35;
      say(a.name,'I\'m hit! I\'m down, I\'m down at the '+(a.post?'wall':'rear')+'!',4200);
      sTone('sawtooth',300,80,.5,.25);
      return;
    }
    scene.remove(a.mesh);allies.splice(allies.indexOf(a),1);
    decal(a.x,a.z,1.2);
    if(WANDER.on){
      WANDER.story.push('Lost '+a.name+' in region '+WANDER.region+'. '+(allies.length?'The rest kept walking.':'Walked on alone.'));
      say('THE COUNTRY',a.name+' stays here now. You do not.',4200);
      saveWander();
    }else toast('RIFLEMAN DOWN');
    sTone('sawtooth',300,80,.5,.25);
  }
}
function updateAllies(dt,t){
  for(const a of allies){
    if(a.down){ // bleeding out where they fell
      a.downT-=dt;
      a.mesh.position.y=heightAt(a.x,a.z)+.25;
      if(Math.random()<dt*.5)say(a.name,pick(['Still here. Hurry.','Don\'t leave me on this wall.','I can hear them...']),2600);
      if(a.downT<=0){
        scene.remove(a.mesh);allies.splice(allies.indexOf(a),1);
        decal(a.x,a.z,1.2);
        say('THE WALL',a.name+' bled out where they fell. The post stands empty.',4200);
      }
      continue;
    }
    a.recoil=Math.max(0,a.recoil-dt*8);
    a.offerT=Math.max(0,(a.offerT||0)-dt);
    a.wanderT-=dt;
    if(a.wanderT<=0){
      a.wanderT=rand(2.5,6);
      let ax=0,az=0,rr=[11,16];
      if(WANDER.on){ax=player.x;az=player.z;rr=[2,5];}
      else if(BAST.on){ // duty first, then thirst, then the post. travel by the road, like people.
        const mortar=BAST.guns.find(g2=>g2.type==='mortar');
        const viaRoad=(tx2,tz2)=>{ // cross between wall and camp through the gate lane
          const westNow=a.x<-9,westDest=tx2<-9;
          if(westNow!==westDest){ax=-1;az=roadZ(-1);rr=[0,1.2];}
          else{ax=tx2;az=tz2;rr=[0,1.5];}
        };
        if(a.duty==='follow'){ax=player.x;az=player.z;rr=[2,4];}
        else if(a.duty==='gate')viaRoad(-21.5,roadZ(-24));
        else if(a.duty==='mortar'&&mortar)viaRoad(mortar.x+1.2,mortar.z);
        else if((a.ammo??1)<=0)viaRoad(6,15);
        else if(a.post)viaRoad(a.post.x,a.post.z);
      }else if(CAMP.on){ // the riflemen escort the column, not a fixed post
        const l=leadTruck();
        if(CAMP.mode==='fall'){ax=player.x*.5;az=player.z*.5;rr=[4,10];}
        else if(l){ax=l.x-5;az=roadZ(l.x);rr=[4,10];}
      }
      a.tx=ax+Math.cos(a.ang)*rand(rr[0],rr[1])+rand(-2.5,2.5);
      a.tz=az+Math.sin(a.ang)*rand(rr[0],rr[1])+rand(-2.5,2.5);
    }
    const mdx=(a.tx??a.x)-a.x,mdz=(a.tz??a.z)-a.z,md=Math.hypot(mdx,mdz);
    let best=null,bd=45*45;
    for(const zb of zombies){
      if(!zb.alive||zb.rise>0)continue;
      const d2=(zb.x-a.x)**2+(zb.z-a.z)**2;
      if(d2<bd){bd=d2;best=zb;}
    }
    let stepping=false;
    if(md>.6&&!best){
      const asp=md>14?6.2:2.4;
      let dx2=mdx/md,dz2=mdz/md;
      // steering: see the obstacle coming, curve around its shoulder
      let avx=0,avz=0;
      for(const pool of[COLLIDERS,CAMP_COLLIDERS])for(const c of pool){
        const ox=c.x-a.x,oz=c.z-a.z,od2=ox*ox+oz*oz,rr=c.r+1.2;
        if(od2>rr*rr*5)continue;
        const od=Math.sqrt(od2)||1;
        if((ox*dx2+oz*dz2)/od<.2)continue;        // behind or far beside: ignore
        const side=(ox*dz2-oz*dx2)>0?-1:1;        // pass on the open side
        const w2=clamp(1-(od-c.r)/2.4,0,1.2)*side;
        avx+=dz2*w2;avz-=dx2*w2;
      }
      const bl=Math.hypot(dx2+avx*1.5,dz2+avz*1.5)||1;
      dx2=(dx2+avx*1.5)/bl;dz2=(dz2+avz*1.5)/bl;
      a.x+=dx2*asp*dt;a.z+=dz2*asp*dt;
      a.face=Math.atan2(dx2,dz2);
      a.walkPh=(a.walkPh||0)+dt*(md>14?11:6.5);stepping=true;
      // last-resort unstick: hop sideways hard and re-plan
      const moved=Math.hypot(a.x-(a._lx??a.x),a.z-(a._lz??a.z));
      a._stuck=moved<asp*dt*.2?(a._stuck||0)+dt:0;
      if(a._stuck>1.4){
        a._stuck=0;a.wanderT=0;
        const j=Math.random()<.5?1:-1;
        a.x+=Math.cos(a.face)*j*2.6;a.z-=Math.sin(a.face)*j*2.6;
        pushOut2(a,.35,[COLLIDERS,CAMP_COLLIDERS]);  // never hop INTO a wall
      }
      a._lx=a.x;a._lz=a.z;}
    const ud=a.mesh.userData;
    if(ud.legL){
      const sw=stepping?Math.sin(a.walkPh||0)*.55:0;
      ud.legL.rotation.x+= (sw-ud.legL.rotation.x)*.4;
      ud.legR.rotation.x+=(-sw-ud.legR.rotation.x)*.4;
    }
    a.fireT-=dt;
    if(best){
      a.face=Math.atan2(best.x-a.x,best.z-a.z);
      if(a.fireT<=0&&(!BAST.on||(a.ammo??0)>0)){
        a.fireT=rand(.55,.9);
        a.recoil=1;
        if(BAST.on){a.ammo--;
          if(a.ammo===0){a.wanderT=0;say(a.name,'Dry! Falling back to the cache!',3000);}}
        const my=heightAt(a.x,a.z)+1.35;
        _tv.set(a.x+Math.sin(a.face)*.6,my,a.z+Math.cos(a.face)*.6);
        _tv2.set(best.x,heightAt(best.x,best.z)+1.1*best.scale,best.z);
        tracer(_tv,_tv2);
        if(Math.random()<.75){
          damageZombie(best,9*(a.dmgMul||1)*(1+(a.xp||0)*.004)*(BAST.rally?1.35:1),_tv2);
          if(!best.alive){
            const r0=rankOf(a.xp||0);a.xp=(a.xp||0)+1;
            if(rankOf(a.xp)!==r0)say(a.name,'They\'re calling me '+rankOf(a.xp)+' now. Same mud, better hat.',3200);
            else if(a.xp%20===0&&BAST.on)say(a.name,pick(['That\'s twenty more the moat keeps.','Tell Sparrow the wall says thank you.','Still counting. Still standing.']),2600);
          }
        }
        const dp=Math.hypot(a.x-player.x,a.z-player.z);
        SFX.turretShot(clamp(1-dp/50,.05,.8));
      }
    }
    if(BAST.on&&(a.ammo??1)<=0&&Math.hypot(a.x-6,a.z-15)<3){
      if(BAST.cache>=30){BAST.cache-=30;a.ammo=60;a.wanderT=0;
        if(a.duty==='resupply')a.duty='post';
        say(a.name,'Topped off. Back to the wall.',2600);}
    }
    if(BAST.on&&a.duty==='gate'&&Math.hypot(a.x+22,a.z-roadZ(-24))<4){
      a.gateT=(a.gateT??2.5)-dt;
      if(a.gateT<=0){a.gateT=3;
        const slot=[-2.2,0,2.2].find(off=>!bags.some(b=>Math.hypot(b.x+24,b.z-(roadZ(-24)+off))<1.2));
        if(slot===undefined){a.duty='post';a.wanderT=0;say(a.name,'Gate stands. Back to my post.',2600);}
        else{placeBag(-24,roadZ(-24)+slot,Math.PI/2);SFX.build();}
      }
    }
    if(BAST.on&&a.duty==='mortar'){
      const mg=BAST.guns.find(g2=>g2.type==='mortar');
      if(mg&&player.man!==mg&&Math.hypot(a.x-mg.x,a.z-mg.z)<2.4){
        a.mortT=(a.mortT??2)-dt;
        if(a.mortT<=0){a.mortT=4.2;npcMortarFire(mg,a);}
      }
    }
    pushOut2(a,.35,[COLLIDERS,CAMP_COLLIDERS]);
    const gy=heightAt(a.x,a.z);
    a.mesh.position.set(a.x,gy+(stepping?Math.abs(Math.sin(a.walkPh||0))*.05:0),a.z);
    a.mesh.rotation.y=a.face;
    a.mesh.userData.rifle.position.z=(a.mesh.userData.rifleZ??-.32)-a.recoil*.06;
  }
}

/* ---------------- turrets ---------------- */
function buildTurretMesh(){
  const g=new THREE.Group();
  const m=new THREE.MeshStandardMaterial({color:0x5b5f45});
  const md=new THREE.MeshStandardMaterial({color:0x3a3d2c});
  const base=new THREE.Mesh(new THREE.CylinderGeometry(.75,1,.9,14),md);base.position.y=.45;base.castShadow=true;
  const head=new THREE.Group();head.position.y=1.25;
  const hb=new THREE.Mesh(new THREE.BoxGeometry(.8,.5,1),m);hb.castShadow=true;
  const barrel=new THREE.Mesh(new THREE.CylinderGeometry(.07,.07,1.2),md);
  barrel.rotation.x=Math.PI/2;barrel.position.set(0,.06,-.9);
  const lamp=new THREE.Mesh(new THREE.SphereGeometry(.08),new THREE.MeshBasicMaterial({color:0x9ab35c}));
  lamp.position.set(0,.36,.3);
  head.add(hb,barrel,lamp);
  g.add(base,head);
  g.userData={head,lamp};
  return g;
}
function placeTurret(x,z){
  const mesh=buildTurretMesh();
  mesh.position.set(x,heightAt(x,z),z);
  scene.add(mesh);
  const t={x,z,mesh,hp:160,maxhp:160,ammo:60,fireCd:0,scan:rand(TAU)};
  { // crewed-gun furniture: shield, drum, grips
    const head=mesh.userData.head;
    const mm=new THREE.MeshStandardMaterial({color:0x3a3d2c,roughness:.5,metalness:.5});
    const shield=new THREE.Mesh(new THREE.BoxGeometry(1.05,.7,.05),mm);
    shield.position.set(0,.1,-.55);head.add(shield);
    const slit=new THREE.Mesh(new THREE.BoxGeometry(.34,.07,.06),
      new THREE.MeshBasicMaterial({color:0x0a0a08}));
    slit.position.set(0,.18,-.56);head.add(slit);
    const drum=new THREE.Mesh(new THREE.CylinderGeometry(.16,.16,.22,14),mm);
    drum.rotation.z=Math.PI/2;drum.position.set(.42,-.05,0);head.add(drum);
    for(const sx of[-1,1]){const grip=new THREE.Mesh(new THREE.CylinderGeometry(.025,.025,.16,6),
      new THREE.MeshStandardMaterial({color:0x46341f,roughness:.6}));
      grip.rotation.x=Math.PI/2;grip.position.set(sx*.2,-.1,.5);head.add(grip);}
  }
  turrets.push(t);
  SFX.build();
  return t;
}
function damageTurret(t,d){
  t.hp-=d;
  if(t.hp<=0){
    scene.remove(t.mesh);
    turrets.splice(turrets.indexOf(t),1);
    burst(t.x,heightAt(t.x,t.z)+1,t.z,24,0x4a4438,5,5);
    SFX.crash();
    toast('TURRET DESTROYED');
  }
}
const _tv=new THREE.Vector3(),_tv2=new THREE.Vector3();
function updateTurrets(dt,t){
  for(const tr of turrets){
    const head=tr.mesh.userData.head;
    tr.fireCd-=dt;
    let best=null,bd=34*34;
    for(const zb of zombies){
      if(!zb.alive||zb.rise>0)continue;
      const d2=(zb.x-tr.x)**2+(zb.z-tr.z)**2;
      if(d2<bd){bd=d2;best=zb;}
    }
    if(player.man&&player.man.ref===tr){/* a human hand on the spade grips */}
    else head.rotation.y+=Math.sin(t*.5+tr.scan)*.003;   // unmanned iron only watches
    tr.mesh.userData.lamp.material.color.set(
      tr.ammo===0?(Math.floor(t*4)%2?0xa3271e:0x331110):0x9ab35c);
  }
}

/* ---------------- the convoy: every truck has a name and people inside ---------------- */
const TRUCK_NAMES=['MATHILDA','BRUTUS','PILGRIM'];
const truckPaint=(()=>{
  const c=document.createElement('canvas');c.width=c.height=128;
  const g=c.getContext('2d');
  g.fillStyle='#565b44';g.fillRect(0,0,128,128);
  for(let i=0;i<900;i++){const v=70+Math.random()*36|0;
    g.fillStyle=`rgba(${v},${v+6},${v-12},.45)`;g.fillRect(Math.random()*128,Math.random()*128,2.5,1.6);}
  for(let i=0;i<8;i++){g.strokeStyle='rgba(28,26,18,.5)';g.lineWidth=1+Math.random()*1.6;
    g.beginPath();const y=Math.random()*128;g.moveTo(Math.random()*40,y);
    g.lineTo(40+Math.random()*88,y+(Math.random()*22-11));g.stroke();}
  const grad=g.createLinearGradient(0,90,0,128);
  grad.addColorStop(0,'rgba(70,55,35,0)');grad.addColorStop(1,'rgba(70,55,35,.5)'); // road dust
  g.fillStyle=grad;g.fillRect(0,90,128,38);
  const t=new THREE.CanvasTexture(c);t.wrapS=t.wrapT=THREE.RepeatWrapping;
  t.colorSpace=THREE.SRGBColorSpace;return t;
})();
function nameTex(name){
  const c=document.createElement('canvas');c.width=512;c.height=256;
  const g=c.getContext('2d');
  g.fillStyle='#4f5340';g.fillRect(0,0,512,256);
  for(let i=0;i<2800;i++){const v=60+Math.random()*40|0;
    g.fillStyle=`rgba(${v},${v+6},${v-10},.4)`;g.fillRect(Math.random()*512,Math.random()*256,4,3);}
  g.strokeStyle='rgba(30,28,20,.5)';g.lineWidth=4;g.strokeRect(6,6,500,244);
  g.font='88px "Saira Stencil One"';g.textAlign='center';
  g.fillStyle='rgba(226,216,186,.92)';
  g.save();g.translate(256,160);g.rotate(-.02);g.fillText(name,0,0);g.restore();
  g.fillStyle='rgba(140,47,35,.8)';g.font='34px "Special Elite"';
  g.fillText('GREYFIELD MOTOR POOL',256,216);
  for(let i=0;i<5;i++){ // scars over the paint
    g.strokeStyle='rgba(25,22,16,.5)';g.lineWidth=2+Math.random()*4;
    g.beginPath();const y=Math.random()*256;g.moveTo(Math.random()*160,y);
    g.lineTo(160+Math.random()*340,y+(Math.random()*60-30));g.stroke();
  }
  const t=new THREE.CanvasTexture(c);t.colorSpace=THREE.SRGBColorSpace;t.anisotropy=4;return t;
}
function buildTruckMesh(name){
  const g=new THREE.Group();
  const m=new THREE.MeshStandardMaterial({color:0x8a8f74,map:truckPaint,roughness:.78,
    bumpMap:truckPaint,bumpScale:.15}); // dents and chipped paint catch the sun
  const md=new THREE.MeshStandardMaterial({color:0x565a48,map:truckPaint,roughness:.85,
    bumpMap:truckPaint,bumpScale:.15});
  const cab=new THREE.Mesh(new THREE.BoxGeometry(2,1.7,2.2),m);cab.position.set(0,1.5,-2.1);cab.castShadow=true;
  const bed=new THREE.Mesh(new THREE.BoxGeometry(2.2,1.9,4.4),md);bed.position.set(0,1.6,1.2);bed.castShadow=true;
  const canvasTop=new THREE.Mesh(new THREE.CylinderGeometry(1.15,1.15,4.4,16,1,false,0,Math.PI),
    new THREE.MeshStandardMaterial({color:0x6b6f4a,roughness:.95,side:THREE.DoubleSide,
      map:burlapTex,bumpMap:burlapTex,bumpScale:.25}));
  canvasTop.rotation.z=Math.PI/2;canvasTop.rotation.y=Math.PI/2;
  canvasTop.position.set(0,2.55,1.2);canvasTop.castShadow=true;
  for(const[wx,wz]of[[-1,-2],[1,-2],[-1,1],[1,1],[-1,2.6],[1,2.6]]){
    const w=new THREE.Mesh(new THREE.CylinderGeometry(.55,.55,.4,18),
      new THREE.MeshStandardMaterial({color:0x1d1f18,roughness:.95,
        bumpMap:burlapTex,bumpScale:.2})); // the weave reads as tread at this size
    w.rotation.z=Math.PI/2;w.position.set(wx*1.1,.55,wz);g.add(w);
    const hub=new THREE.Mesh(new THREE.CylinderGeometry(.2,.2,.44,12),
      new THREE.MeshStandardMaterial({color:0x55584a,roughness:.4,metalness:.6}));
    hub.rotation.z=Math.PI/2;hub.position.set(wx*1.1,.55,wz);g.add(hub);
  }
  const hood=new THREE.Mesh(new THREE.BoxGeometry(1.7,.62,1.15),m);
  hood.position.set(0,1.05,-2.95);hood.castShadow=true;g.add(hood);
  const cabRoof=new THREE.Mesh(new THREE.CylinderGeometry(1.02,1.02,1.9,16,1,false,0,Math.PI),md);
  cabRoof.rotation.z=Math.PI/2;cabRoof.rotation.y=Math.PI/2;
  cabRoof.scale.set(1,1,.4);cabRoof.position.set(0,2.32,-2.1);g.add(cabRoof);
  const grille=new THREE.Mesh(new THREE.BoxGeometry(1.5,.7,.08),
    new THREE.MeshStandardMaterial({color:0x23251c,roughness:.55,metalness:.5}));
  grille.position.set(0,1.05,-3.55);g.add(grille);
  const bumper=new THREE.Mesh(new THREE.BoxGeometry(2.1,.18,.14),
    new THREE.MeshStandardMaterial({color:0x3c3e32,roughness:.4,metalness:.7}));
  bumper.position.set(0,.62,-3.6);g.add(bumper);
  const glass=new THREE.Mesh(new THREE.BoxGeometry(1.8,.6,.06),
    new THREE.MeshStandardMaterial({color:0x1c2226,roughness:.15,metalness:.6,envMapIntensity:1.6}));
  glass.position.set(0,1.85,-3.18);g.add(glass);
  for(const sx of[-0.6,0.6]){ // headlamps with a hooded brow
    const hl=new THREE.Mesh(new THREE.SphereGeometry(.09,10,7),
      new THREE.MeshStandardMaterial({color:0xfff0c0,emissive:0xffd070,emissiveIntensity:.7}));
    hl.position.set(sx,1.1,-3.25);g.add(hl);
  }
  const spare=new THREE.Mesh(new THREE.CylinderGeometry(.5,.5,.22,16),
    new THREE.MeshStandardMaterial({color:0x2a2c24,roughness:.9}));
  spare.rotation.x=Math.PI/2;spare.position.set(0,1.5,3.5);g.add(spare);
  const jerry=new THREE.Mesh(new THREE.BoxGeometry(.3,.42,.16),
    new THREE.MeshStandardMaterial({color:0x5d6243,roughness:.6,metalness:.3}));
  jerry.position.set(-1.05,1.7,-1.1);g.add(jerry);
  const pipe=new THREE.Mesh(new THREE.CylinderGeometry(.05,.05,1.1,6),
    new THREE.MeshStandardMaterial({color:0x33352a,roughness:.5,metalness:.6}));
  pipe.position.set(1.05,2.1,-1.2);g.add(pipe);
  for(const[wx,wz]of[[-1,-2],[1,-2],[-1,2.6],[1,2.6]]){ // mudguards
    const fender=new THREE.Mesh(new THREE.CylinderGeometry(.66,.66,.46,14,1,true,Math.PI,Math.PI),
      new THREE.MeshStandardMaterial({color:0x4a4d3a,roughness:.7,side:THREE.DoubleSide}));
    fender.rotation.z=Math.PI/2;fender.rotation.y=Math.PI/2;
    fender.position.set(wx*1.1,.72,wz);g.add(fender);
  }
  if(name){ // her name, hand-stenciled on both flanks
    const nt=nameTex(name);
    for(const sx of[-1.16,1.16]){
      const pl=new THREE.Mesh(new THREE.PlaneGeometry(2.6,1.3),
        new THREE.MeshStandardMaterial({map:nt,roughness:.85}));
      pl.position.set(sx,1.7,1.2);pl.rotation.y=sx>0?Math.PI/2:-Math.PI/2;
      g.add(pl);
    }
  }
  g.traverse(o=>{if(o.isMesh)o.castShadow=true;});
  const lampL=new THREE.PointLight(0xffd9a0,14,18);lampL.position.set(0,1.4,-3.4);g.add(lampL);
  const beams=new THREE.Group();
  for(const sx of[-0.6,0.6]){
    const cone=new THREE.Mesh(new THREE.ConeGeometry(1.5,9,10,1,true),
      new THREE.MeshBasicMaterial({color:0xffe9b8,transparent:true,opacity:.05,
        blending:THREE.AdditiveBlending,depthWrite:false,side:THREE.DoubleSide}));
    cone.rotation.x=Math.PI/2-.06;
    cone.position.set(sx,1.05,-7.7);
    beams.add(cone);
  }
  g.add(beams);g.userData.beams=beams;
  g.add(cab,bed,canvasTop);g.visible=false;scene.add(g);
  return{g,lampL};
}
const convoy=[];
for(let i=0;i<3;i++){
  const{g,lampL}=buildTruckMesh(TRUCK_NAMES[i]);
  convoy.push({name:TRUCK_NAMES[i],idx:i,alive:true,x:-half+8-i*11,hp:150,maxhp:150,
    mesh:g,lamp:lampL,engine:null,honkT:0,wreckT:0});
}
function mountGun(t){
  if(t.gun)return;
  const g=new THREE.Group();
  const mm=new THREE.MeshStandardMaterial({color:0x2e3026,roughness:.4,metalness:.7});
  const base=new THREE.Mesh(new THREE.CylinderGeometry(.09,.12,.5,12),mm);g.add(base);
  const barrel=new THREE.Mesh(new THREE.CylinderGeometry(.035,.045,1.1,10),mm);
  barrel.rotation.x=Math.PI/2;barrel.position.set(0,.32,.5);g.add(barrel);
  const shield=new THREE.Mesh(new THREE.BoxGeometry(.7,.5,.05),mm);
  shield.position.set(0,.35,.12);g.add(shield);
  g.traverse(o=>{if(o.isMesh)o.castShadow=true;});
  g.position.set(0,2.05,-2.1);
  t.mesh.add(g);
  t.gun={fireT:0,mesh:g};
}
function aliveTrucks(){return (BAST.on||WANDER.on)?[]:convoy.filter(t=>t.alive);}
function leadTruck(){const a=aliveTrucks();let lead=a[0];for(const t of a)if(t.x>lead.x)lead=t;return lead;}
/* legacy alias so older systems keep working: 'truck' = the lead truck */
const truck={get active(){return CAMP.on&&aliveTrucks().length>0&&CAMP.mode==='drive';},
  get dead(){return aliveTrucks().length===0;},
  get x(){const l=leadTruck();return l?l.x:0;},
  get z(){const l=leadTruck();return l?roadZ(l.x):0;}};
function truckEngine(on){
  const C=AU.ctx;if(!C)return;
  const l=leadTruck();if(!l)return;
  if(on&&!l.engine){
    const o=C.createOscillator();o.type='sawtooth';o.frequency.value=52;
    const g=C.createGain();g.gain.value=0;
    const f=C.createBiquadFilter();f.type='lowpass';f.frequency.value=240;
    o.connect(f);f.connect(g);g.connect(AU.master);o.start();
    l.engine={o,g};
  }else if(!on){
    for(const t of convoy)if(t.engine){
      t.engine.g.gain.linearRampToValueAtTime(0,C.currentTime+.4);
      const e=t.engine;t.engine=null;
      setTimeout(()=>e.o.stop(),600);
    }
  }
}
function damageTruck(d,ref){
  const t=ref&&ref.mesh?ref:nearestTruck(player.x,player.z);
  if(!t||!t.alive)return;
  if(CAMP.mode==='fall')d*=.22;   // the defenders inside are still firing, hurry anyway
  t.hp-=d;
  burst(t.x,heightAt(t.x,roadZ(t.x))+1.5,roadZ(t.x),6,0x886633,4,3);
  if(t.hp<=0)destroyTruck(t);
}
function nearestTruck(x,z){
  let best=null,bd=1e9;
  for(const t of aliveTrucks()){
    const d=Math.hypot(t.x-x,roadZ(t.x)-z);
    if(d<bd){bd=d;best=t;}
  }
  return best;
}
function destroyTruck(t){
  t.alive=false;t.hp=0;t.wreckT=999;
  t.mesh.children.forEach(c=>{if(c.material&&c.material.color)c.material=new THREE.MeshStandardMaterial({color:0x1f1d16});});
  t.lamp.intensity=0;
  if(t.engine){try{t.engine.o.stop()}catch(e){};t.engine=null;}
  const tz=roadZ(t.x);
  burst(t.x,heightAt(t.x,tz)+2,tz,40,0xcc6622,7,8);
  addFirePatch(t.x,tz,3,9);
  SFX.crash();camShake=Math.max(camShake,.8);
  announce(t.name+' IS GONE','the fire takes more than fuel');
  // the people inside: some crawl out, some don't
  const aboard=CAMP.comps.filter(c=>c.alive&&c.truck===t.idx);
  const rest=aliveTrucks();
  for(const c of aboard){
    if(Math.random()<.6&&rest.length){
      c.truck=rest[Math.floor(Math.random()*rest.length)].idx;
      c.morale=Math.max(0,c.morale-25);
      toastQ(c.name+' crawls from the wreck of '+t.name+'.');
    }else killComp(c,'burned with the '+t.name);
  }
  campMorale(-14);
  if(player.ride===t){player.ride=null;vm.visible=true;damagePlayer(20);}
  if(!aliveTrucks().length)campaignOver('convoy');
}
function updateConvoy(dt){
  if(!CAMP.on)return;
  const drive=CAMP.mode==='drive';
  const a=aliveTrucks();
  if(!a.length)return;
  const lead=leadTruck();
  if(AU.ctx&&drive&&!lead.engine)truckEngine(true);
  // halt conditions: combat nearby, blocked road, the player left behind
  let halt=!drive;
  if(drive){
    for(const zb of zombies)if(zb.alive&&zb.rise<=0){
      for(const t of a)if(Math.hypot(zb.x-t.x,zb.z-roadZ(t.x))<20){halt=true;break;}
      if(halt)break;
    }
    const hA=heightAt(lead.x+5,roadZ(lead.x+5));
    if(hA<-.65||hA>1.25){halt=true;
      if(lead.honkT<=0){SFX.horn();toast('ROAD BLOCKED, FIX IT WITH THE SHOVEL');lead.honkT=4;}}
    if(CAMP.fixT>0)halt=true;
    if(player.x<lead.x-55){halt=true;
      if(lead.honkT<=0){SFX.horn();toast('THE CONVOY WAITS, KEEP UP');lead.honkT=5;}}
    lead.honkT-=dt;
  }
  // ordered column: lead first, the rest keep their distance
  const order=[...a].sort((p,q)=>q.x-p.x);
  for(let i=0;i<order.length;i++){
    const t=order[i];
    let want=halt?0:CAMP.speed;
    if(i>0){
      const gap=order[i-1].x-t.x;
      if(gap<9)want=0;else if(gap>14)want=CAMP.speed*1.3;
    }
    t.x+=want*dt;
    if(want>0&&Math.random()<dt*5)
      puffSmoke(new THREE.Vector3(1.05,2.2,-1.2).applyMatrix4(t.mesh.matrixWorld),false,true);
    if(want>0)for(const zb of zombies){
      if(!zb.alive||zb.rise>0)continue;
      if(Math.abs(zb.x-t.x)<3.4&&Math.abs(zb.z-roadZ(t.x))<2.2){
        damageZombie(zb,90,new THREE.Vector3(zb.x,heightAt(zb.x,zb.z)+.8,zb.z));
        SFX.thud();camShake=Math.max(camShake,clamp(.5-Math.hypot(t.x-player.x)*.01,0,.5));
      }
    }
    if(t.engine)t.engine.g.gain.value=want>0?
      clamp(.06-Math.hypot(t.x-player.x,roadZ(t.x)-player.z)*.0008,.008,.06):.015;
    const tz=roadZ(t.x);
    t.mesh.visible=true;
    t.mesh.position.set(t.x,heightAt(t.x,tz)+.1,tz);
    const ahead=roadZ(t.x+2);
    t.mesh.rotation.y=-Math.PI/2-Math.atan2(ahead-tz,2);
    t.lamp.intensity=10+CAMP.nf*16;
    if(t.mesh.userData.beams)t.mesh.userData.beams.visible=CAMP.nf>.4;
    if(t.gun&&CAMP.mode!=='camp'&&player.ride!==t){ // the pintle gun earns its scrap
      t.gun.fireT-=dt;
      if(t.gun.fireT<=0){
        let best=null,bd=28*28;
        for(const zb of zombies){if(!zb.alive||zb.rise>0)continue;
          const d2=(zb.x-t.x)**2+(zb.z-tz)**2;if(d2<bd){bd=d2;best=zb;}}
        if(best){
          t.gun.fireT=.5;
          t.gun.mesh.rotation.y=Math.atan2(best.x-t.x,best.z-tz)-t.mesh.rotation.y;
          _tv.set(t.x,heightAt(t.x,tz)+2.6,tz);
          _tv2.set(best.x,heightAt(best.x,best.z)+1.1*best.scale,best.z);
          tracer(_tv,_tv2);
          if(Math.random()<.7)damageZombie(best,8,_tv2);
          SFX.turretShot(clamp(1-Math.hypot(t.x-player.x,tz-player.z)/55,.05,.7));
        }
      }
    }
  }
  if(drive&&lead.x>half-8)arriveCamp();
}

/* ============================================================
   THE LONG ROAD, campaign engine
   seeded worlds · a convoy of named souls · choices that scar
   ============================================================ */
const CAMP={on:false,mode:'menu',seed:0,leg:0,legCount:9,act:1,nf:0,speed:5.2,
  comps:[],supplies:{food:18,meds:4,fuel:9},morale:70,flags:{},journal:[],
  eventsAt:[],ambushAt:[],nodeName:'',deadQueue:[],momentDone:false,heirlooms:[],
  routeOpts:[],kills0:0,usedEv:{},usedMoments:{},mercy:0,arcRoles:{}};
const toastQueue=[];
function toastQ(msg){toastQueue.push(msg);}
function campMorale(d){CAMP.morale=clamp(CAMP.morale+d,0,100);}

/* ---- the people ---- */
const C_FIRST=['Ada','Bren','Cass','Dmitri','Edda','Felix','Greta','Hale','Imre','Jonas','Kasia','Lev','Mara','Niel','Oskar','Petra','Rosa','Sava','Tomas','Una','Vera','Wim','Yana','Zofia','Anselm','Dora','Emil','Clovis'];
const C_LAST=['Voss','Krieger','Halloway','Brandt','Okonkwo','Marek','Sorel','Vance','Petrov','Lindqvist','Carrow','Ash','Bellamy','Stross','Hark','Quint','Mosel','Farkas','Iversen','Roth'];
const C_ROLE=['MEDIC','SAPPER','GUNNER','SCOUT','CHAPLAIN','COOK','RADIO-OP','MECHANIC'];
const C_TRAIT=['brave','gentle','ruthless','pious','bitter','funny','haunted','greedy','loyal','reckless','careful','quiet','furious','old-blood','superstitious','unbroken'];
const C_WISH=['to see the sea once more','to find a brother who marched ahead to Verdun','to bury a wedding ring in safe ground','to play a piano with all its keys','to forget what happened at the southern line','to teach children their letters again','to plant something and stay long enough to watch it grow','to die anywhere that isn\'t mud','to apologise to someone at Verdun','to hear church bells that aren\'t a warning'];
const SECRETS=['bitten','cultist','gold','deserter','letter'];
function mkComp(role,secret){
  return{name:spick(C_FIRST)+' '+spick(C_LAST),role:role||spick(C_ROLE),
    t1:spick(C_TRAIT),t2:spick(C_TRAIT),wish:spick(C_WISH),
    secret:secret||null,secretKnown:false,alive:true,morale:srand(55,85)|0,
    truck:Math.floor(srnd()*3),bondP:0,id:Math.floor(srnd()*1e9)};
}
function compsAlive(){return CAMP.comps.filter(c=>c.alive);}
function compByRole(r){return compsAlive().find(c=>c.role===r);}
function anyComp(){const a=compsAlive();return a.length?a[Math.floor(Math.random()*a.length)]:null;}
function killComp(c,cause){
  if(!c||!c.alive)return;
  c.alive=false;c.cause=cause;
  CAMP.deadQueue.push(c);
  campMorale(-10-(c.bondP>1?6:0));
  CAMP.journal.push(c.name+', '+cause);
}
const EULOGY=[
  n=>n.name+' carried '+(n.t1==='funny'?'every joke we had left':'more than a pack')+'. The ground takes it all the same.',
  n=>'No one speaks for a long time. Then someone says '+n.name.split(' ')[0]+' still owed them a cigarette, and everyone laughs, and then everyone doesn\'t.',
  n=>'The '+n.role.toLowerCase()+' is gone. Tomorrow someone else will have to know what '+n.name.split(' ')[0]+' knew. No one does.',
  n=>n.name+' wanted '+n.wish+'. Write it down. Someone should want it for them now.',
];

/* ---- biomes: every leg is a different country ---- */
const BIOMES=[
 {name:'GREYFIELD MARCH',tint:[1,1,1],rugged:1,treeK:1,grassK:1,rockK:1,risk:1,nfBias:0,leafHue:0,grassHue:0,
  ds:'Hedgerows and old fences. The war passed through here twice.'},
 {name:'BIRCH HOLLOWS',tint:[.96,1.04,.95],rugged:.85,treeK:1.35,grassK:1.2,rockK:.6,risk:.85,nfBias:0,leafHue:.015,grassHue:.01,
  ds:'White trunks and deep moss. Quiet. Too quiet to trust.'},
 {name:'THE BONE ORCHARD',tint:[1.06,.97,.88],rugged:1.1,treeK:.35,grassK:.5,rockK:1.2,risk:1.3,nfBias:.1,leafHue:-.04,grassHue:-.05,
  ds:'Dead trees in rows, like they were planted for this.'},
 {name:'DROWNED MIRE',tint:[.88,.97,1.05],rugged:.55,treeK:.7,grassK:1.4,rockK:.4,risk:1.15,nfBias:.12,leafHue:.03,grassHue:.04,
  ds:'Black water under the grass. The road is the only solid thing.'},
 {name:'CINDER FENS',tint:[1.14,.9,.82],rugged:1.2,treeK:.45,grassK:.35,rockK:1.6,risk:1.45,nfBias:.18,leafHue:-.06,grassHue:-.07,
  ds:'Still smoking. Whatever burned here, it burned recently.'},
 {name:'THE HIGH SADDLE',tint:[.96,.98,1.04],rugged:2.6,treeK:.55,grassK:.5,rockK:2.6,risk:1.25,nfBias:.06,leafHue:.01,grassHue:0,
  ds:'The road climbs through stone shoulders. Everything echoes twice.'},
 {name:'THE GREY SHORE',tint:[1.12,1.07,.9],rugged:.25,treeK:.2,grassK:.15,rockK:.6,risk:1.05,nfBias:.04,leafHue:0,grassHue:-.04,shore:true,
  ds:'Salt wind and a dead flat sea. Nothing can sneak up on you. Nothing can hide you either.'},
 {name:'THE SHATTERED QUARTER',tint:[1.02,.99,.95],rugged:.7,treeK:.18,grassK:.3,rockK:.8,risk:1.4,nfBias:.12,leafHue:0,grassHue:-.03,city:1,
  ds:'A town that fought back, brick by brick. The bricks lost.'},
 {name:'CATHEDRAL ROW',tint:[.97,.99,1.04],rugged:.8,treeK:.5,grassK:.7,rockK:.7,risk:1.2,nfBias:.08,leafHue:.01,grassHue:.01,city:.6,
  ds:'Houses with their faces blown off, still standing politely in rows.'},
 {name:'SALT FLATS',tint:[1.05,1.05,1.0],rugged:.3,treeK:.15,grassK:.25,rockK:2,risk:1.2,nfBias:.05,leafHue:0,grassHue:-.03,
  ds:'Open ground. You will see them coming. They will see you.'},
 {name:'THE WHITE WASTE',tint:[1.02,1.05,1.14],rugged:1.5,treeK:.5,grassK:.12,rockK:1.6,risk:1.2,nfBias:.08,leafHue:.04,grassHue:.02,
  snow:true,ground:[.62,.66,.74],grassS:.25,grassL:1.9,pineBias:.9,
  ds:'Snow that fell before the war and never left. The cold keeps them slower. And fresher.'},
 {name:'THE LONG STEPPE',tint:[1.06,1.02,.9],rugged:.4,treeK:.1,grassK:2.2,rockK:.5,risk:1.1,nfBias:.04,leafHue:-.05,grassHue:-.075,
  ground:[.31,.26,.13],grassS:.55,grassL:1.3,
  ds:'Grass to every horizon, waist high and whispering. Anything could be walking in it.'},
 {name:'RED HARDPAN',tint:[1.12,.98,.84],rugged:.85,treeK:.06,grassK:.12,rockK:2.4,risk:1.3,nfBias:.06,leafHue:-.07,grassHue:-.09,
  desert:true,ground:[.46,.30,.16],grassS:.5,grassL:1.1,
  ds:'Cracked red earth and rust-coloured dust. Water was the first thing this country forgot.'},
 {name:'THE TEETH',tint:[.94,.97,1.06],rugged:3.6,treeK:.4,grassK:.4,rockK:3,risk:1.35,nfBias:.08,leafHue:.02,grassHue:0,
  pineBias:.75,alpine:true,
  ds:'Stone shoulders and knife ridges, snow on the high ground. The road is a rumour up here.'},
 {name:'ASHFALL',tint:[1.0,.94,.9],rugged:1.05,treeK:.2,grassK:.2,rockK:1.5,risk:1.5,nfBias:.22,leafHue:-.08,grassHue:-.08,
  ash:true,ground:[.16,.15,.15],grassS:.3,grassL:.7,
  ds:'Grey snow that isn\'t snow. Somewhere upwind, something is still burning.'},
];
const NODE_ADJ=['RAVENS\'','PALE','BROKEN','LAST','SAINT EDDA\'S','THE COLONEL\'S','WIDOW\'S','HOLLOW','SUNKEN','IRON','THE LONG','BLACKBIRD'];
const NODE_NOUN=['CAUSEWAY','CROSSING','REACH','MILE','ORCHARD','DITCHES','MARCH','GATE','FIELDS','BEND','REST','PASSAGE'];

/* ---- world building per leg ---- */
function buildWorld(legSeed){
  COLLIDERS.length=0;DESTRUCT.length=0;
  for(const st of stumps)scene.remove(st);stumps.length=0;
  setSeed(legSeed);HSALT=legSeed|0;
  ROAD.a1=srand(6,15);ROAD.f1=srand(.018,.032);ROAD.s1=srnd()<.5?-1:1;
  ROAD.a2=srand(2,7);ROAD.f2=srand(.05,.09);ROAD.s2=srnd()<.5?-1:1;
  genTerrain();
  const pos=tGeo.attributes.position.array;
  for(let v=0;v<VN*VN;v++)pos[v*3+1]=H[v];
  tGeo.attributes.position.needsUpdate=true;
  buildSkirt();
  paintAll();tGeo.computeVertexNormals();
  mapDirty=true;roadCheck();
  scatterPosts();scatterForest();scatterSetpieces();scatterPonds();scatterGrass();scatterCity();
  scatterDeer();
  sea.visible=!!BIOME.shore;
  mountainRing.visible=BIOME.rugged>=1.3;   // the rough countries live in the shadow of rougher ones
  for(const d of decals)d.material.opacity=0;
  envBakedNf=-1;
}
function setBiome(b){BIOME.city=0;BIOME.shore=false;
  BIOME.snow=false;BIOME.desert=false;BIOME.ground=null;
  BIOME.grassS=1;BIOME.grassL=1;BIOME.pineBias=0;
  BIOME.alpine=false;BIOME.ash=false;
  Object.assign(BIOME,b);
  SnowU.value=BIOME.snow?1:(BIOME.alpine?.55:0);}

/* ---- route generation: the map is drawn fresh every campaign ---- */
function genRouteOptions(){
  setSeed(CAMP.seed+CAMP.leg*7919+13);
  const n=CAMP.leg>=CAMP.legCount-1?1:(CAMP.flags.h_deck?3:(srnd()<.4?3:2));
  const opts=[];
  for(let i=0;i<n;i++){
    const last=CAMP.leg>=CAMP.legCount-1;
    const biome=last?BIOMES[4]:BIOMES[Math.floor(srnd()*BIOMES.length)];
    opts.push({
      name:last?'THE GATES OF VERDUN':spick(NODE_ADJ)+' '+spick(NODE_NOUN),
      biome,seed:Math.floor(srnd()*2**31),
      risk:clamp(Math.round(biome.risk+CAMP.act-1+(srnd()<.3?1:0)),1,4),
      reward:last?null:spick(['scrap','meds','fuel','food','recruit',null]),
      last});
  }
  return opts;
}

/* ---- events: the road asks questions ---- */
function sup(k,d){CAMP.supplies[k]=Math.max(0,CAMP.supplies[k]+d);}
const EVENTS=[
 {id:'survivor',w:3,title:'A FIGURE ON THE ROAD',who:()=>'the scout\'s glass picks out a living face',
  txt:()=>'A man stands in the middle of the road with his hands up and his ribs showing. He says his name is '+spick(C_FIRST)+'. He says he hasn\'t eaten in four days. He is between you and the light, and the trucks are slowing, and everyone is looking at you.',
  ch:[{l:'Take him aboard',s:'-2 food · a new rifle when he recovers',
      do:()=>{sup('food',-2);CAMP.mercy++;const c=mkComp(null,Math.random()<.25?spick(SECRETS):null);c.name=c.name;CAMP.comps.push(c);
        toastQ(c.name+' rides with '+TRUCK_NAMES[c.truck]+' now.');spawnAlly();}},
     {l:'Food and directions, nothing more',s:'-1 food · morale holds',
      do:()=>{sup('food',-1);CAMP.mercy++;toastQ('He eats like an animal and doesn\'t say thank you. You don\'t blame him.');}},
     {l:'Drive past',s:'the convoy does not slow for anyone',grim:true,
      do:()=>{campMorale(-6);CAMP.flags.passed_by=(CAMP.flags.passed_by||0)+1;
        toastQ('In the mirror he doesn\'t even wave. He just watches.');}}]},
 {id:'minefield',w:2,title:'BONES AND TRIPWIRE',who:()=>'the sapper kneels at the verge',
  txt:()=>{const s=compByRole('SAPPER');return (s?s.name:'Your sapper')+' holds up a fist and the column stops dead. Anti-personnel mines, theirs or ours, it stopped mattering years ago. A detour through the soft ground would cost daylight. '+(s?s.name.split(' ')[0]+' says they can clear a lane, slowly, on their belly, alone.':'Without a sapper, someone will have to improvise.');},
  ch:[{l:'Clear a lane',s:'slow · someone risks their hands',
      do:()=>{const s=compByRole('SAPPER')||anyComp();
        if(s&&Math.random()<.22){killComp(s,'a mine the size of a soup tin');toastQ('The crack rolls across the field. Nobody runs toward it fast enough.');}
        else toastQ((s?s.name:'They')+' walks back wiping their face, drops six detonators in the mud, and doesn\'t talk for an hour.');}},
     {l:'Detour through the fields',s:'burn fuel · wake the ground',
      do:()=>{sup('fuel',-2);for(let i=0;i<6;i++)spawnZombie();toastQ('The trucks churn through soft earth. Things notice.');}}]},
 {id:'wreck',w:3,title:'A CONVOY THAT DIDN\'T MAKE IT',who:()=>'burned trucks, days old',
  txt:()=>'Three trucks like yours, black and open to the sky. Whoever they were, they were heading the same way. There are packs still lashed to the frames. There are also flies, which means there is also something for the flies.',
  ch:[{l:'Strip the wrecks',s:'+supplies · the smell draws them',
      do:()=>{sup('food',3);sup('meds',1);G.scrap+=40;for(let i=0;i<5;i++)spawnZombie();
        toastQ('Good salvage. Bad feeling.');}},
     {l:'Take only the dog tags',s:'someone at Verdun will want to know',
      do:()=>{CAMP.mercy++;CAMP.flags.tags=true;campMorale(4);
        toastQ('Forty-one tags. The chaplain reads every name aloud as you roll.');}},
     {l:'Don\'t stop',s:'the dead keep their things',grim:true,
      do:()=>{toastQ('Nobody argues. Nobody looks either.');}}]},
 {id:'bridgeout',w:2,act:2,title:'THE FORD',who:()=>'the bridge is in the river',
  txt:()=>'The bridge is a memory held up by two pillars. The ford downstream is shallow enough, probably, but the map calls the far bank an old quarantine zone, and the map was drawn by someone who underlined it twice.',
  ch:[{l:'Risk the ford',s:'fast · the far bank is wrong',
      do:()=>{for(let i=0;i<8;i++)spawnZombie();CAMP.flags.quarantine=true;
        toastQ('The water is fine. The bank is not. Stand to!');}},
     {l:'Work the old bridge',s:'-2 fuel for the winch · safe, slow',
      do:()=>{sup('fuel',-2);toastQ('Four hours of planking and prayer. It holds. Barely.');}}]},
 {id:'radio',w:2,title:'A VOICE ON THE NET',who:()=>'the radio-op waves you over',
  txt:()=>{const r=compByRole('RADIO-OP');return (r?r.name:'The set')+' has found a voice in the static. A woman, calm, on the old military band: "Verdun holds. Gates open at first light for survivors. Verdun holds." It repeats. It has the cadence of a recording. Or of someone reading from a card with a rifle at their back.';},
  ch:[{l:'Answer',s:'break radio silence',
      do:()=>{CAMP.flags.answered=true;toastQ('Silence. Then, not a recording: "How many of you are left?" The set goes dead before you can decide whether to lie.');}},
     {l:'Log it, stay dark',s:'they don\'t need to know you exist yet',
      do:()=>{CAMP.flags.stayedDark=true;toastQ('You write down the frequency. The chaplain says recordings can\'t lie. The radio-op says that\'s exactly what they\'re for.');}}]},
 {id:'orchardman',w:1,title:'THE MAN IN THE ORCHARD',who:()=>'he is pruning the dead trees',
  txt:()=>'An old man moves among the black trees with a pruning hook, tending them like they\'ll bloom again. He doesn\'t look at the trucks. A cottage behind him has light in one window and a garden with, impossibly, cabbages. "You can take what you carry," he says to no one in particular. "Everyone does."',
  ch:[{l:'Take the cabbages',s:'+4 food · he watches',grim:true,
      do:()=>{sup('food',4);campMorale(-4);CAMP.flags.cabbages=true;
        toastQ('He keeps pruning while you strip his garden. That\'s the part nobody forgets.');}},
     {l:'Trade meds for food',s:'-1 meds · +3 food · a fair thing in an unfair year',
      do:()=>{sup('meds',-1);sup('food',3);CAMP.mercy++;campMorale(5);
        toastQ('"For my knees," he says. He gives extra. He insists.');}},
     {l:'Ask him to come',s:'he won\'t. but ask',
      do:()=>{CAMP.mercy++;toastQ('"I planted these for my daughter. When they walk, sometimes one of them is her." He goes back to pruning. You leave him to his orchard and his terrible hope.');}}]},
 {id:'fuelcache',w:2,title:'THE DEPOT SIGN STILL STANDS',who:()=>'an army fuel point, looted but maybe not empty',
  txt:()=>'A fuel point off the road, fence breached, pumps dry. The sapper thinks the buried reserve tank might still hold something. Getting at it means noise, cutting, hammering, an hour of light gone.',
  ch:[{l:'Dig out the reserve',s:'+4 fuel · noise brings teeth',
      do:()=>{sup('fuel',4);for(let i=0;i<7;i++)spawnZombie();toastQ('The tank coughs up four good drums. The treeline coughs up something else.');}},
     {l:'Leave it',s:'fuel is replaceable',
      do:()=>{toastQ('Some doors are better left shut.');}}]},
 {id:'childshoe',w:1,act:2,title:'SMOKE OVER THE RISE',who:()=>'a small camp, recently wrong',
  txt:()=>'A family\'s camp: tarp, cold fire, a pot still half full. Drag marks lead into the grass. From under the truck-bed of your lead vehicle, where no one put anything, comes a sound. There is a child in the cargo netting, maybe eight years old, holding a single shoe that doesn\'t fit them.',
  ch:[{l:'The child rides with the cook',s:'-1 food per camp · the convoy has a stowaway',
      do:()=>{CAMP.flags.child=true;CAMP.mercy+=2;campMorale(8);
        toastQ('The cook builds a nest of flour sacks. The gunner pretends not to keep checking it.');}},
     {l:'Leave the child at the next survivor hold',s:'if you find one',grim:true,
      do:()=>{CAMP.flags.child='promised';toastQ('Everyone agrees it\'s the sensible thing. Nobody meets anybody\'s eyes.');}}]},
 {id:'toll',w:2,act:2,title:'THE TOLL',who:()=>'living men, which is worse',
  txt:()=>'A barricade of farm machinery, and behind it men with rifles that still have bluing on them. Their leader is polite. "Road tax. Fuel or food, your choice. Everyone pays." Behind him, on the barricade, there are coats hanging. Some of the coats are small.',
  ch:[{l:'Pay in fuel',s:'-3 fuel',
      do:()=>{sup('fuel',-3);toastQ('He waves you through like a tollbooth man on a Sunday. The coats turn in the wind.');}},
     {l:'Pay in food',s:'-3 food',
      do:()=>{sup('food',-3);toastQ('He weighs the sacks in his hand, nods, steps aside.');}},
     {l:'Run the barricade',s:'trucks take fire · pay nothing',grim:true,
      do:()=>{const t=nearestTruck(player.x,player.z);if(t){t.hp-=45;if(t.hp<=0)destroyTruck(t);}
        CAMP.flags.toll_blood=true;campMorale(-5);
        toastQ('Rifle fire walks across the cab. You don\'t stop. In the mirror, the polite man is already setting the next trap.');}}]},
 {id:'chapel',w:1,title:'THE LEANING CHAPEL',who:()=>'the chaplain asks for ten minutes',
  txt:()=>{const ch=compByRole('CHAPLAIN');return 'A chapel leans over the road like it\'s reading the trucks. '+(ch?ch.name+' asks for ten minutes inside. Just ten. The roof could come down. The dark inside has corners.':'No one asks to stop, but everyone slows down passing it.');},
  ch:[{l:'Ten minutes',s:'morale rises · time bleeds',
      do:()=>{campMorale(9);for(const c of compsAlive())c.morale=Math.min(100,c.morale+8);
        toastQ('Whatever was said in there, people walk out with their backs straighter.');}},
     {l:'Keep rolling',s:'God can hear you from the road',
      do:()=>{const ch=compByRole('CHAPLAIN');if(ch){ch.morale-=12;ch.bondP--;}
        toastQ('Nobody says anything. The chapel watches you all the way to the bend.');}}]},
 {id:'piper',w:1,act:2,title:'THE PIPER ON THE BERM',who:()=>'a man, a flute, and a congregation',
  txt:()=>'A man walks the railway berm playing a tin flute, badly, beautifully. Behind him, strung out like a wedding procession, walk the dead, dozens, placid, following the sound east. He tips his hat to the convoy without missing a note. He is leading them somewhere. Away from somewhere else.',
  ch:[{l:'Follow his cleared path',s:'no ambushes this leg · -2 fuel on the detour',
      do:()=>{sup('fuel',-2);CAMP.ambushAt=[];toastQ('You roll in the procession\'s wake. The dead don\'t look at the trucks. They only have ears for him.');}},
     {l:'Shoot the flute',s:'scatter the column here, now, while it\'s bunched',grim:true,
      do:()=>{for(let i=0;i<10;i++)spawnZombie();campMorale(-6);CAMP.flags.piper=true;
        toastQ('The note dies mid-bar. Forty heads turn at once. The piper looks at you with something worse than hate: disappointment.');}},
     {l:'Tip your hat back',s:'professional courtesy',
      do:()=>{CAMP.mercy++;toastQ('He plays the convoy a bar of something old as you pass. The dead behind him sway like wheat.');}}]},
 {id:'brutenest',w:2,act:2,title:'THE SINKHOLE',who:()=>'the ground breathes',
  txt:()=>'A sinkhole has opened beside the road, and the road has begun leaning toward it. Down in the dark something big turns over in its sleep. The sapper weighs a charge in one hand and your one good mine in the other, eyebrows raised.',
  ch:[{l:'Collapse it',s:'-1 mine · the big one never wakes · +salvage from the spoil',
      do:()=>{if(G.items.mine>0){G.items.mine--;G.scrap+=70;toastQ('The earth swallows its own throat. In the settling dust: old army crates, conveniently pre-buried.');}
        else{toastQ('No mine to spare. You ease the trucks past on the far verge, engines at a whisper.');spawnZombie('brute');}}},
     {l:'Whisper past',s:'let sleeping colossi lie',
      do:()=>{if(Math.random()<.35){spawnZombie('brute');toastQ('The third truck\'s axle squeals. The ground stops breathing. Then it stands up.');}
        else toastQ('Forty held breaths. The thing below rolls over once and goes still.');}}]},
 {id:'twin',w:1,act:2,title:'THE OTHER CONVOY',who:()=>'on the parallel ridge, exactly your silhouette',
  txt:()=>'Across the valley, on the old high road, a convoy: three trucks, your spacing, your speed. Figures wave from the beds. The radio finds nothing. The scout\'s glass finds the detail that ruins it: they have been waving, identically, since the glass came up. Nobody waves that long.',
  ch:[{l:'Signal back and close the distance',s:'salvage if it\'s real · teeth if it isn\'t',grim:true,
      do:()=>{for(let i=0;i<9;i++)spawnZombie();G.scrap+=55;sup('food',2);
        toastQ('Three trucks, months dead, rigged with cloth arms on cords that wave in the wind. A larder for the things that built it. They\'re already coming.');}},
     {l:'Drive on and don\'t look',s:'the chaplain\'s advice, delivered through teeth',
      do:()=>{campMorale(-3);CAMP.flags.twin=true;toastQ('For an hour the other convoy keeps pace on the ridge. Then the high road bends away, and everyone breathes.');}}]},
 {id:'drop',w:2,title:'GREEN SMOKE',who:()=>'a parachute crate, snagged in a dead oak',
  txt:()=>'A supply chute hangs in a tree like a fat pale fruit, and a green smoke marker burns under it. Someone\'s automated drop system is still flying sorties for an army that no longer exists. Green smoke means medical. It also means every eye in the county is looking at the same tree.',
  ch:[{l:'Race them to it',s:'+meds +ammo · arrive first, leave fast',
      do:()=>{sup('meds',3);G.depotAmmo+=80;player.reserve=Math.min(player.carryCap,player.reserve+60);
        for(let i=0;i<8;i++)spawnZombie();toastQ('The crate cracks open like a promise: morphine, sulfa, clean bandages. The treeline cracks open like the other thing.');}},
     {l:'Let it hang',s:'bait stays bait',
      do:()=>{toastQ('You watch the tree in the mirrors until the smoke is a green thumbprint on the sky. Someone behind you exhales the word "morphine" like a prayer they refused.');}}]},
 {id:'plaguecart',w:1,title:'THE CART',who:()=>'across the road, deliberate',
  txt:()=>'A hay cart has been dragged across the road and heaped with bodies that died of nothing your medic recognises, no bites, no wounds, just black-veined stillness. It is a message, or a quarantine, or a trap. Moving it means touching it.',
  ch:[{l:'Burn it where it stands',s:'-1 molotov · the smoke draws them, the road opens clean',
      do:()=>{if(G.items.molotov>0)G.items.molotov--;
        for(let i=0;i<5;i++)spawnZombie();
        toastQ('It burns wrong, green at the edges. The medic makes everyone ride the next mile with cloth over their faces.');}},
     {l:'Push it clear by hand',s:'fast · someone touches the black veins',grim:true,
      do:()=>{const c=anyComp();
        if(c&&Math.random()<.3){c.morale-=20;CAMP.flags.blackvein=c.name;
          toastQ(c.name+' scrubs their hands until they bleed. The medic says it\'s nothing. The medic checks them four times before dawn.');}
        else toastQ('Gloves, rope, held breath. The cart rolls into the ditch and the road is yours.');}}]},
 {id:'stray',w:1,title:'THE DOG',who:()=>'sitting in the road like an appointment',
  txt:()=>'A dog. An actual dog, ribs like a shipwreck, one ear, tail going like a metronome set to hope. It has clearly decided, with the total certainty available only to dogs, that you are its convoy. The cook is already tearing a strip of jerky. The argument is over before it starts.',
  ch:[{l:'Of course the dog comes',s:'-1 food per camp, +morale forever, it\'s a DOG',
      do:()=>{CAMP.flags.h_dog=true;campMorale(12);CAMP.mercy++;
        toastQ('The dog inspects all three trucks and chooses MATHILDA, which everyone agrees means something.');}},
     {l:'Feed it and drive away',s:'you absolute monster',grim:true,
      do:()=>{sup('food',-1);campMorale(-8);
        toastQ('It follows the trucks for two miles. Nobody talks. The gunner rides facing backwards the whole time.');}}]},
];

/* arc events, the long knives, seeded per campaign */
const ARC_EVENTS={
 bitten:{act:2,title:'THE SLEEVE',who:c=>c.name+' has been wearing long sleeves for two legs',
  txt:c=>'The medic catches it at the water barrel: a crescent of punctures on '+c.name.split(' ')[0]+'\'s forearm, a week old, the skin around it the colour of a storm. They knew. They\'ve known since the orchard. "It\'s not spreading," they say, in the voice of someone praying rather than reporting. Everyone is suddenly very interested in their own boots. The rule exists. Everyone knows the rule.',
  ch:c=>[
    {l:'The rule is the rule',s:'one shot · the convoy survives on rules',grim:true,
     do:()=>{killComp(c,'the rule, applied by your hand');CAMP.flags.rule_kept=true;
       toastQ('You do it yourself because asking someone else would be cowardice. The sound rolls away over the fields and nothing answers it.');}},
    {l:'Quarantine them in the trail truck',s:'a rope, a bell, and hope',
     do:()=>{CAMP.flags.bitten_kept=c.name;c.morale=10;campMorale(-4);
       toastQ(c.name.split(' ')[0]+' rides alone with a bell on a string and a rifle they\'re trusted to use on themselves. Every bump in the road, everyone listens for the bell.');}},
    {l:'Let the medic try the old serum',s:'-2 meds · nobody knows if it ever worked',
     do:()=>{sup('meds',-2);
       if(Math.random()<.5){CAMP.flags.serum_worked=c.name;toastQ('Three days of fever, and then '+c.name.split(' ')[0]+' asks for soup. The medic stares at the empty vial like it owes an explanation.');}
       else{killComp(c,'the serum, which was only ever hope in a bottle');toastQ('The fever wins on the second night. The medic doesn\'t sleep for two more.');}}}]},
 cultist:{act:2,title:'THE OFFERINGS',who:c=>'someone has been feeding the dark',
  txt:c=>'The scout finds it on watch: a neat parcel of your food, set out past the wire, unwrapped like a gift. Not the first, by the flattened grass. '+c.name+' doesn\'t deny it. "They pass us by because I pay," they say, perfectly calm. "Count the legs. Count the attacks we should have had. I keep this convoy alive." The terrible thing is you find yourself counting.',
  ch:c=>[
    {l:'Cast them out',s:'they walk · the convoy is yours again',grim:true,
     do:()=>{killComp(c,'exile, last seen walking back the way you came, unafraid');CAMP.flags.cultist_out=true;
       toastQ('They take nothing but a knife. At the treeline they turn and bow to the convoy, like a host seeing off guests.');}},
    {l:'Let them keep paying',s:'it costs food · does it work? do you want to know?',
     do:()=>{CAMP.flags.cultist_kept=c.name;sup('food',-2);
       toastQ('You post no extra watch. That night nothing comes. You hate how much that proves.');}}]},
 deserter:{act:3,title:'THE PHOTOGRAPH',who:c=>c.name+' goes white at the radio',
  txt:c=>'Verdun\'s broadcast now ends with a list of names wanted by the garrison tribunal. The fourth name is '+c.name+'\'s. They tell you straight: they ordered a line to hold at the southern front, then didn\'t hold it themselves. Two hundred people. "I\'ll walk before we reach the gates," they say. "Or I\'ll stand it. Your convoy. Your call."',
  ch:c=>[
    {l:'They stand trial at Verdun',s:'the truth belongs to the dead too',
     do:()=>{CAMP.flags.deserter_trial=c.name;c.morale-=20;
       toastQ('"Fair," they say, and clean their rifle like it\'s any other evening.');}},
    {l:'New name, new papers',s:'the cook forges. you all lie. forever',grim:true,
     do:()=>{CAMP.flags.deserter_hidden=c.name;campMorale(-3);
       toastQ('The chaplain won\'t help with the forging but doesn\'t stop it either. "Mercy and justice," he says, "rarely ride the same truck."');}}]},
};

/* camp moments, small fires, long shadows */
const MOMENTS=[
 {id:'lullaby',need:()=>CAMP.flags.child===true,title:'THE LULLABY',
  txt:()=>'The child won\'t sleep. The gunner, who once broke a man\'s jaw over a card game, is discovered behind the fuel drums, gravel-voiced, singing the only song they know with the violent parts changed.',
  ch:[{l:'Pretend you saw nothing',do:()=>{campMorale(6);toastQ('Some things grow better unobserved.');}},
      {l:'Sit and listen',do:()=>{campMorale(4);const g=compByRole('GUNNER');if(g)g.bondP++;toastQ('The gunner glares at you, then keeps singing.');}}]},
 {id:'lastletter',title:'THE LETTER NOBODY SENDS',
  txt:()=>{const c=anyComp();return c?c.name+' is writing by firelight, then feeding pages to the flames, then writing again. "It\'s for my sister at Verdun," they say. "Every version makes her hate me less than the truth would."':'The fire eats another page.';},
  ch:[{l:'"Send the true one."',do:()=>{const c=anyComp();if(c){c.bondP++;c.morale+=8;}toastQ('They fold the worst draft into a breast pocket. The true one. You hope.');}},
      {l:'"Some truths can rest."',do:()=>{campMorale(2);toastQ('The fire gets the truth. The pocket gets the kind lie.');}}]},
 {id:'rations',need:()=>CAMP.supplies.food<=compsAlive().length,title:'THE COUNT',
  txt:()=>'The cook does the arithmetic twice and then says it out loud: short rations from here, or short people. The pot is passed and everyone watches everyone else\'s portion with a politeness that has teeth.',
  ch:[{l:'Officers eat last',do:()=>{campMorale(7);CAMP.mercy++;player.hp=Math.max(20,player.hp-15);
       toastQ('You go to sleep hungry. The convoy notices. That kind of arithmetic they like.');}},
      {l:'Equal shares, no exceptions',do:()=>{campMorale(2);toastQ('Fair, and thin.');}},
      {l:'Workers eat first',do:()=>{campMorale(-4);const c=anyComp();if(c)c.morale-=10;
       toastQ('Efficient. The chaplain says nothing in a way everyone hears.');}}]},
 {id:'mutinyTalk',need:()=>CAMP.morale<40,title:'VOICES BY THE FUEL DRUMS',
  txt:()=>'You catch the tail of it in the dark: "-turn south, there\'s nothing at Verdun but a recording and a tribunal. He\'d march us all into the ground for a radio ghost." Silence, when they see you. The fire pops. Somebody has to speak first.',
  ch:[{l:'"Say it to my face."',do:()=>{if(Math.random()<.6){campMorale(10);toastQ('They do. You listen to all of it without flinching, and answer all of it. By morning the word mutiny tastes stale.');}
       else{campMorale(-8);const c=anyComp();if(c){killComp(c,'gone in the night, with a rifle and the south road');toastQ('In the morning, one bedroll is empty.');}}}},
      {l:'Promise a vote at the next camp',do:()=>{CAMP.flags.vote=true;campMorale(3);toastQ('Democracy, at the end of the world. The chaplain laughs for the first time in two legs.');}}]},
 {id:'wishTalk',title:'WHAT COMES AFTER',
  txt:()=>{const c=anyComp();return c?'"When the gates open," '+c.name.split(' ')[0]+' says, "first thing, I want '+c.wish+'." The fire considers this. Wanting things out loud is the bravest thing anyone\'s done all week.':'The fire burns low.';},
  ch:[{l:'Go around the circle',do:()=>{campMorale(8);for(const c of compsAlive())c.morale=Math.min(100,c.morale+6);
       toastQ('Ten wishes spoken into the dark like coins into a well. The watch changes. The wishes stay.');}},
      {l:'"Don\'t jinx it."',do:()=>{campMorale(-2);toastQ('The circle goes quiet. Hope back in its box.');}}]},
 {id:'mechanic',title:'MATHILDA\'S HEART',
  txt:()=>{const m=compByRole('MECHANIC');return (m?m.name:'The mechanic')+' has the lead truck\'s engine open like a patient on a table. "She\'ll make Verdun," they say, not looking up. "After that she\'s done. Don\'t tell the others. They think she\'s immortal."';},
  ch:[{l:'Keep the secret',do:()=>{const m=compByRole('MECHANIC');if(m)m.bondP++;toastQ('Every convoy needs one immortal thing.');}},
      {l:'Tell the convoy the truth',do:()=>{campMorale(-3);CAMP.flags.told_truth=true;toastQ('People pat the fender now when they pass. Gently. Like a horse that\'s earned the field.');}}]},
];

/* ---- heirlooms: rogue-like relics, one per camp, choose or refuse ---- */
const HEIRLOOMS=[
 {nm:'THE CONDUCTOR\'S WATCH',ds:'The convoy rolls 15% faster. It keeps time that hasn\'t existed for years.',ap:()=>CAMP.speed*=1.15},
 {nm:'SAINT EDDA\'S FINGERBONE',ds:'+1 meds at every camp. Relics work, if you work.',ap:()=>CAMP.flags.h_bone=true},
 {nm:'THE ORCHARD SEED',ds:'+2 food at every camp. It grows wherever you sleep. Don\'t look at it directly.',ap:()=>CAMP.flags.h_seed=true},
 {nm:'TIN STAR',ds:'An extra rifleman finds the column at every leg. Authority is a calibre.',ap:()=>CAMP.flags.h_star=true},
 {nm:'GRAVEDIGGER\'S SPADE',ds:'Your shovel moves half again more earth. It has had practice.',ap:()=>CAMP.digMul=1.5},
 {nm:'LUCKY LEFT BOOT',ds:'You move 10% faster. Don\'t ask what happened to the right one.',ap:()=>G.speedMul*=1.1},
 {nm:'THE COLONEL\'S SIDEARM',ds:'All weapons hit 12% harder. It remembers being obeyed.',ap:()=>G.dmgMul*=1.12},
 {nm:'BLACK BELL',ds:'Ambushes ring one breath early, three fewer risers, every time.',ap:()=>CAMP.flags.h_bell=true},
 {nm:'DEAD MAN\'S DECK',ds:'Three roads offered wherever there were two. The dealer folded.',ap:()=>CAMP.flags.h_deck=true},
 {nm:'THE QUARTERMASTER\'S THUMB',ds:'Prices fall by a fifth. He owes you, and he knows it.',ap:()=>CAMP.flags.h_thumb=true},
];
/* ---- drive banter: the trucks talk so the road feels alive ---- */
const BANTER=[
 c=>c.name.split(' ')[0]+' ('+c.role.toLowerCase()+'): "When we get there, I\'m sleeping for a week. Inside a wall. A thick one."',
 c=>c.name.split(' ')[0]+': "Anyone else seen the birds come back? Two crows this morning. First in a month."',
 c=>c.name.split(' ')[0]+' taps the truck rail twice. '+(c.t1==='superstitious'?'Always twice. Never three times.':'Old habit, nobody asks.'),
 c=>c.name.split(' ')[0]+': "My '+(Math.random()<.5?'mother':'sergeant')+' used to say roads remember. Hope this one forgets us."',
 c=>'Radio check. '+c.name.split(' ')[0]+' answers in song. The net stays open three seconds longer than protocol.',
 c=>c.name.split(' ')[0]+': "I still want '+c.wish+'. That\'s still allowed, right?"',
 (c,d)=>c.name.split(' ')[0]+' and '+d.name.split(' ')[0]+' argue about the correct way to brew chicory. It gets heated. It is the best hour of the week.',
 (c,d)=>d.name.split(' ')[0]+' falls asleep on '+c.name.split(' ')[0]+'\'s shoulder. '+c.name.split(' ')[0]+' does not move for forty minutes.',
 c=>c.name.split(' ')[0]+' ('+c.t1+'): "Quiet leg so far." Everyone in earshot tells them to shut up forever.',
];
/* ---------------- game state / waves ---------------- */
const G={state:'menu',wave:0,kills:0,score:0,scrap:60,dirt:0,
  items:{nade:3,molotov:1,mine:1,medkit:1,flare:2,rocket:0},
  dmgMul:1,reloadMul:1,speedMul:1,scrapMul:1,steadyMul:1,
  turretCost:60,buildMul:1,turretCap:120,pocketsLvl:0,
  shots:0,hits:0,perkDone:false,
  depotHp:1000,depotMax:1000,depotAmmo:120,
  intermission:8,spawnLeft:0,bruteLeft:0,colossusWave:false,spawnT:0,hintI:0,hintT:0};
let best=+(localStorage.getItem('trenchfall_best')||0);

/* ---------------- campaign flow ---------------- */
function startCampaign(seed){
  cleanupModes();
  audioInit();
  if(AU.ctx&&AU.ctx.state==='suspended')AU.ctx.resume();
  CAMP.on=true;
  CAMP.seed=seed||((Math.random()*2**31)|0);
  setSeed(CAMP.seed);
  Object.assign(CAMP,{leg:0,act:1,nf:.06,comps:[],supplies:{food:18,meds:4,fuel:9},
    morale:70,flags:{},journal:[],deadQueue:[],mercy:0,usedEv:{},usedMoments:{},kills0:0});
  // five souls + you. two of them carry something heavy.
  const roles=['MEDIC','SAPPER','GUNNER','SCOUT','CHAPLAIN'];
  const secretA=spick(SECRETS),pool2=SECRETS.filter(s=>s!==secretA),secretB=spick(pool2);
  for(let i=0;i<5;i++)CAMP.comps.push(mkComp(roles[i],i===1?secretA:i===3?secretB:null));
  const extra=mkComp(spick(['COOK','RADIO-OP','MECHANIC']));CAMP.comps.push(extra);
  for(const t of convoy){t.alive=true;t.hp=t.maxhp;
    t.mesh.children.forEach(c=>{});t.mesh.visible=false;}
  // rebuild truck materials in case a previous run charred them
  while(convoy.length){const t=convoy.pop();scene.remove(t.mesh);}
  for(let i=0;i<3;i++){
    const{g,lampL}=buildTruckMesh(TRUCK_NAMES[i]);
    convoy.push({name:TRUCK_NAMES[i],idx:i,alive:true,x:-half+8-i*11,hp:150,maxhp:150,
      mesh:g,lamp:lampL,engine:null,honkT:0,wreckT:0});
  }
  Object.assign(G,{kills:0,score:0,scrap:80,dirt:0,
    items:{nade:3,molotov:1,mine:1,medkit:1,flare:2,rocket:0},
    dmgMul:1,reloadMul:1,speedMul:1,scrapMul:1,steadyMul:1,
    turretCost:60,buildMul:1,turretCap:120,pocketsLvl:0,shots:0,hits:0});
  Object.assign(player,{hp:100,maxhp:100,alive:true,reserve:120,carryCap:180,
    wid:0,owned:defaultOwned(),
    mags:defaultMags(),tool:null,buildType:0,healT:0,
    fireCd:0,reloadT:0,respawnT:0,ads:false,fireHeld:false});
  beginLeg({name:'GREYFIELD MARCH, THE FIRST MILE',biome:BIOMES[0],
    seed:(CAMP.seed^0x9e3779b9)>>>0,risk:1,reward:null,prologue:true});
  $('start').classList.remove('show');$('gameover').classList.remove('show');
  musterRoll();
  saveCamp();
}
function beginLeg(node){
  CAMP.leg++;
  CAMP.act=CAMP.leg<=3?1:CAMP.leg<=6?2:3;
  CAMP.nf=clamp((CAMP.leg-1)/(CAMP.legCount-1),0,1)*.8+ (node.biome.nfBias||0);
  CAMP.nodeName=node.name;
  CAMP.momentDone=false;
  setBiome(node.biome);
  buildWorld(node.seed);
  G.wave=clamp(1+CAMP.leg+(node.risk-1),1,14);     // drives enemy stats & variety
  G.depotAmmo=150;G.depotHp=1000;
  // combat-pool reset (the per-leg part of the old startGame)
  for(const t of turrets)scene.remove(t.mesh);turrets.length=0;
  zombies.length=0;
  for(const m of nadePool){m.live=false;m.visible=false;}
  for(const m of molotovPool){m.live=false;m.visible=false;}
  for(const m of acidMeshes){m.live=false;m.visible=false;}
  for(const s of firePool){s.live=false;s.material.opacity=0;}
  for(const f of flarePool){f.live=false;f.visible=false;f.material.opacity=0;}
  for(const m of minePool){m.live=false;m.visible=false;}
  for(const b of bags)scene.remove(b.mesh);bags.length=0;
  for(const w of wires)scene.remove(w.mesh);wires.length=0;
  for(const a of allies)scene.remove(a.mesh);allies.length=0;
  // convoy to the western edge
  let i=0;
  for(const t of convoy){t.x=-half+16-(i++)*11;t.honkT=0;
    if(t.alive){t.mesh.visible=true;}}
  Object.assign(player,{x:-half+24,z:roadZ(-half+24)+5,y:0,vy:0,yaw:-Math.PI/2,pitch:-.04});
  // seeded incident map for this leg
  setSeed(node.seed^0x51ed270b);
  CAMP.eventsAt=[];CAMP.ambushAt=[];
  const nEv=CAMP.leg>=CAMP.legCount?0:(srnd()<.5?2:1);
  for(let e=0;e<nEv;e++)CAMP.eventsAt.push(srand(-half*.55,half*.62));
  CAMP.eventsAt.sort((a,b)=>a-b);
  const nAm=Math.round(1+node.risk*.9);
  for(let aI=0;aI<nAm;aI++)CAMP.ambushAt.push(srand(-half*.7,half*.75));
  CAMP.ambushAt.sort((a,b)=>a-b);
  if(AU.surfG)AU.surfG.gain.value=BIOME.shore?.028:0;
  CAMP.cache=null;beacon.visible=false;
  if(CAMP.leg<CAMP.legCount&&srnd()<.45){
    const cx=srand(-half*.5,half*.6);
    CAMP.cache={x:cx,z:clamp(roadZ(cx)+srand(26,46)*(srnd()<.5?-1:1),-half+10,half-10)};
    beacon.position.set(CAMP.cache.x,heightAt(CAMP.cache.x,CAMP.cache.z)+12,CAMP.cache.z);
    beacon.visible=true;
  }
  CAMP.breakAt=(CAMP.leg>1&&CAMP.leg<CAMP.legCount&&srnd()<.35)?srand(-half*.35,half*.45):null;
  CAMP.fixT=0;
  CAMP.spawnT=4;CAMP.banterT=14;
  CAMP.mode=CAMP.leg>=CAMP.legCount?'siege':'drive';
  if(CAMP.flags.h_star)spawnAlly();
  if(CAMP.leg>1)spawnAlly();   // one rifleman walks escort from leg two on
  if(node.prologue){
    // the campaign opens at home: greyfield is falling, the trucks are loading
    CAMP.mode='fall';CAMP.holdT=0;CAMP.crates=0;CAMP.fallWave=0;
    let pi=0;
    for(const t of convoy){t.x=-4-(pi++)*11;
      t.mesh.position.set(t.x,heightAt(t.x,roadZ(t.x))+.1,roadZ(t.x));t.mesh.visible=t.alive;}
    Object.assign(player,{x:7,z:roadZ(7)+6});
    for(const c of compsAlive())spawnAlly(rand(-8,8),roadZ(0)+rand(-7,7));
    addFirePatch(-9,16,2.2,90);addFirePatch(11,14,1.8,90);   // the base is already burning
    CIVS.length=0;
    for(let k=0;k<3;k++){ // the people the convoy exists for
      const m=buildAllyMesh(null,true);
      m.position.set(-4.5+rand(-1,1),heightAt(-4.5,15),15+rand(-1,1));
      scene.add(m);
      CIVS.push({mesh:m,ph:rand(0,1),sp:rand(.12,.2)});
    }
  }
  G.state='play';
  $('hud').classList.add('on');
  initSlots();refreshVM();updateRoster();
  if(CAMP.mode==='siege')startSiege();
  else if(!node.prologue)announce('LEG '+CAMP.leg+', '+node.name,node.biome.ds);
  tryLock();
}
const CIVS=[];
const beacon=new THREE.Mesh(new THREE.CylinderGeometry(.5,.9,26,8,1,true),
  new THREE.MeshBasicMaterial({color:0x9dff70,transparent:true,opacity:.13,
    blending:THREE.AdditiveBlending,depthWrite:false,side:THREE.DoubleSide}));
beacon.visible=false;scene.add(beacon);
/* ---- drive-mode director: ambushes, stragglers, incidents ---- */
function campaignDirector(dt){
  if(!CAMP.on)return;
  if(CAMP.mode==='drive'){
    const lead=leadTruck();if(!lead)return;
    // scripted trouble
    if(CAMP.ambushAt.length&&lead.x>CAMP.ambushAt[0]){
      CAMP.ambushAt.shift();
      let n=Math.round(4+CAMP.act*2.4+BIOME.risk*2);
      if(CAMP.flags.h_bell){n=Math.max(2,n-3);SFX.beep();toastQ('The black bell rings once, unprompted. Fewer of them make it out of the ground.');}
      camShake=Math.max(camShake,.3);SFX.thud();
      for(let i=0;i<n;i++){const z=spawnZombie();
        if(z){z.rise=1.8;  // slow enough to watch the earth give birth
          const dp=Math.hypot(z.x-player.x,z.z-player.z);
          if(dp<16){z.x+=(z.x-player.x)/Math.max(dp,1)*18;z.z+=(z.z-player.z)/Math.max(dp,1)*18;}
        }}
      SFX.waveHorn();
      announce('AMBUSH','they were waiting in the ground');
      say('LOOKOUT',pick(['Both sides of the road! Both sides!','Out of the ditches, watch the ditches!','They let the lead truck pass. They wanted the middle.']),3000);
      if(CAMP.act>=2&&Math.random()<.4)spawnZombie('brute');
    }
    CAMP.loreT=(CAMP.loreT??40)-dt;
    if(CAMP.loreT<=0){
      CAMP.loreT=rand(80,130);
      say('SIGNAL',pick([
        'Verdun broadcast, repeating: gates open at first light for survivors. It has said first light for six months.',
        'A child\'s voice on the old band, counting to twenty. It never reaches twenty. Nobody talks about it.',
        'The dead don\'t cross running water. The dead don\'t climb. The dead don\'t open doors. All three are wrong.',
        'Before the end, they called it the quiet flu. Three days of fever and you woke up hungry.',
        'Greyfield held for two years. It fell in forty minutes. Nobody who was there will say what changed.',
        'The Bone Orchard was an orchard. The man who planted it is still there, pruning. Leave him be.',
        'Map note, red pencil: the piper works the eastern berms. Do not shoot the piper. Underlined twice.',
        'Verdun\'s tribunal list grows every broadcast. Justice is the last thing still being manufactured.',
      ]),6500);
    }
    // the trucks talk; the road feels lived-in
    CAMP.banterT-=dt;
    if(CAMP.banterT<=0){
      CAMP.banterT=rand(36,58);
      const a=anyComp(),b=anyComp();
      if(a){const line=pick(BANTER)(a,b&&b!==a?b:a);
        const ci=line.indexOf(': ');
        if(ci>0&&ci<26)say(line.slice(0,ci),line.slice(ci+2));
        else say('THE COLUMN',line);}
    }
    if(CAMP.eventsAt.length&&lead.x>CAMP.eventsAt[0]){
      CAMP.eventsAt.shift();
      openEvent(pickRoadEvent());
    }
    if(CAMP.cache&&Math.hypot(player.x-CAMP.cache.x,player.z-CAMP.cache.z)<5){
      CAMP.cache=null;beacon.visible=false;
      G.scrap+=45;sup('food',2);sup('meds',1);player.reserve=Math.min(player.carryCap,player.reserve+40);
      SFX.chime();say('SCOUT','Cache cracked: rations, bandages, two boxes of rounds. Worth the walk.');
    }
    // breakdown: the road collects its toll in axles
    if(CAMP.breakAt!==null&&lead.x>CAMP.breakAt){
      CAMP.breakAt=null;CAMP.fixT=26;CAMP.fixPulse=2;
      addFirePatch(lead.x+4,roadZ(lead.x)+6,2,40);   // someone lights a bonfire; it will be a long stop
      SFX.crash();
      announce(lead.name+' THROWS A WHEEL','dig in, hold the road, the mechanic needs time');
    }
    if(CAMP.fixT>0){
      CAMP.fixT-=dt;
      CAMP.fixPulse-=dt;
      if(CAMP.fixPulse<=0){CAMP.fixPulse=5.5;
        for(let i=0;i<2+CAMP.act;i++){const z=spawnZombie();if(z)z.rise=1.4;}}
      if(CAMP.fixT<=0){SFX.horn();say('MECHANIC','She turns over. Beautiful and furious, like always. MOUNT UP.');}
    }
    // ambient stragglers
    CAMP.spawnT-=dt;
    if(CAMP.spawnT<=0){
      CAMP.spawnT=clamp(9-CAMP.act*1.3-BIOME.risk,3,9)*(wxFrenzy?.5:1);
      const n=1+(Math.random()*CAMP.act|0);
      for(let i=0;i<n;i++)spawnZombie();
    }
  }else if(CAMP.mode==='fall'){
    CAMP.holdT+=dt;
    const nc=Math.min(12,Math.floor(CAMP.holdT/7));
    if(nc>CAMP.crates){CAMP.crates=nc;SFX.thud();
      if(nc%3===0||nc>=12)say('THE LOADERS','Crate '+nc+' aboard.'+(nc>=12?' That\'s everything.':''),2200);}
    // civilians shuffle their lives into the trucks
    const lead=leadTruck();
    for(const cv of CIVS){
      cv.ph+=dt*cv.sp;const k=cv.ph%2,m=k<1?k:2-k;
      const tx=lead?lead.x:0,tz=lead?roadZ(lead.x):0;
      cv.mesh.position.set(-4.5+(tx+2.5+4.5)*m,heightAt(cv.mesh.position.x,cv.mesh.position.z),15+(tz-15)*m);
      cv.mesh.rotation.y=k<1?Math.atan2(tx+4.5,tz-15):Math.atan2(-(tx+4.5),-(tz-15));
      const cp={x:cv.mesh.position.x,z:cv.mesh.position.z};
      pushOut2(cp,.3,[CAMP_COLLIDERS]);
      cv.mesh.position.x=cp.x;cv.mesh.position.z=cp.z;
      cv.mesh.position.y=heightAt(cp.x,cp.z)+Math.abs(Math.sin(cv.ph*9))*.05;
      const cud=cv.mesh.userData;
      if(cud.legL){const sw=Math.sin(cv.ph*9)*.5;cud.legL.rotation.x=sw;cud.legR.rotation.x=-sw;}
    }
    CAMP.spawnT-=dt;
    if(CAMP.spawnT<=0){ // the lookout calls each assault by name and direction
      CAMP.spawnT=clamp(8-CAMP.fallWave*.7,3.5,8);CAMP.fallWave++;
      const dirA=rand(TAU);
      const COMPASS=['EAST','SOUTHEAST','SOUTH','SOUTHWEST','WEST','NORTHWEST','NORTH','NORTHEAST'];
      const dirName=COMPASS[Math.round(((Math.atan2(Math.sin(dirA),Math.cos(dirA))+TAU)%TAU)/(TAU/8))%8];
      const shape=CAMP.fallWave<2?'mob':pick(['mob','runners','crawlers','mob','runners']);
      const place=(z,rMin,rMax,spread)=>{const a=dirA+rand(-spread,spread);
        z.x=Math.cos(a)*rand(rMin,rMax);z.z=Math.sin(a)*rand(rMin,rMax)+9.5;};
      if(shape==='mob'){
        const n=4+Math.min(CAMP.fallWave,6);
        for(let i=0;i<n;i++){const z=spawnZombie('walker');if(z){place(z,42,60,.55);z.rise=1.5;}}
        say('LOOKOUT','Walkers out of the '+dirName.toLowerCase()+' treeline. A whole congregation.',3400);
      }else if(shape==='runners'){
        for(let i=0;i<2+Math.min(CAMP.fallWave,3);i++){const z=spawnZombie('runner');if(z){place(z,50,68,.3);z.rise=1.2;}}
        say('LOOKOUT','RUNNERS, '+dirName+'! They\'re sprinting the open ground!',3400);
        SFX.scream(.7);
      }else{
        for(let i=0;i<3;i++){const z=spawnZombie('crawler');if(z){place(z,16,24,1.2);z.rise=2.2;}}
        say('LOOKOUT','The ground\'s moving inside the wire... under the wire! CRAWLERS!',3400);
      }
      if(CAMP.fallWave%4===0){
        const z=spawnZombie('brute');if(z){place(z,55,70,.2);z.rise=2;}
        flashT=Math.max(flashT,.22);SFX.colossus();
        announce('SOMETHING BIG, '+dirName,'the trees are giving way');
      }
      if(CAMP.fallWave===1)announce('GREYFIELD IS FALLING','every minute held is a crate aboard');
    }
  }else if(CAMP.mode==='siege'){
    if(G.spawnLeft>0||G.bruteLeft>0){
      G.spawnT-=dt;
      if(G.spawnT<=0){
        G.spawnT=clamp(1.6-G.wave*.07,.3,1.6);
        if(G.bruteLeft>0&&Math.random()<.25){G.bruteLeft--;spawnZombie(CAMP.siegeWave>=3?'colossus':'brute');}
        else if(G.spawnLeft>0){G.spawnLeft--;spawnZombie();
          if(G.spawnLeft>0&&Math.random()<.5){G.spawnLeft--;spawnZombie();}}
      }
    }else if(!zombies.some(z=>z.alive)){
      CAMP.intermission=(CAMP.intermission??8)-dt;
      if(CAMP.intermission<=0){
        CAMP.intermission=8;
        CAMP.siegeWave++;
        if(CAMP.siegeWave>3){winCampaign();return;}
        G.spawnLeft=10+CAMP.siegeWave*8;G.bruteLeft=CAMP.siegeWave;G.spawnT=1;
        SFX.waveHorn();
        announce('THE GATES, WAVE '+CAMP.siegeWave+' OF 3',
          CAMP.siegeWave===3?'everything the road owes you comes due':'hold for the gate crews');
      }
    }
  }
}
function startSiege(){
  CAMP.siegeWave=0;CAMP.intermission=4;
  G.spawnLeft=0;G.bruteLeft=0;
  announce('VERDUN IS REAL','the gates are shut, hold until they open');
  SFX.horn();
}
/* ---- event overlay ---- */
let pendingEvent=null;
function pickRoadEvent(){
  // arc events first, when their act has come
  for(const c of compsAlive()){
    if(c.secret&&!c.secretKnown&&ARC_EVENTS[c.secret]&&CAMP.act>=ARC_EVENTS[c.secret].act&&Math.random()<.5){
      c.secretKnown=true;
      return{arc:ARC_EVENTS[c.secret],c};
    }
  }
  const pool=EVENTS.filter(e=>!CAMP.usedEv[e.id]&&(!e.act||CAMP.act>=e.act));
  if(!pool.length)return null;
  let tot=0;for(const e of pool)tot+=e.w;
  let r=Math.random()*tot;
  for(const e of pool){r-=e.w;if(r<=0)return{ev:e};}
  return{ev:pool[0]};
}
function openEvent(pe,now){
  if(!pe)return;
  if(!now&&CAMP.mode==='drive'){      // the column slows first; the card comes after the breath
    CAMP.mode='event';
    say('THE ROAD','Column halting. Something ahead.',2400);
    SFX.horn();
    setTimeout(()=>openEvent(pe,true),1500);
    return;
  }
  pendingEvent=pe;
  CAMP.mode='event';
  document.exitPointerLock&&document.exitPointerLock();
  document.body.classList.add('cine');
  vm.visible=false;
  let title,who,txt,chs;
  if(pe.arc){title=pe.arc.title;who=pe.arc.who(pe.c);txt=pe.arc.txt(pe.c);chs=pe.arc.ch(pe.c);}
  else{const e=pe.ev;CAMP.usedEv[e.id]=true;title=e.title;who=e.who();txt=e.txt();chs=e.ch;}
  // stage it in the world: a figure on the road, the camera goes to look
  const lead=leadTruck();
  const ax=(lead?lead.x:player.x)+13,az=roadZ(ax);
  const HUMAN=['survivor','orchardman','toll','piper','childshoe','stray','radio'];
  if(pe.ev&&HUMAN.includes(pe.ev.id)){
    evActor=buildAllyMesh(null,true);
    evActor.position.set(ax,heightAt(ax,az),az);
    evActor.rotation.y=Math.atan2((lead?lead.x:player.x)-ax,roadZ(lead?lead.x:player.x)-az);
    scene.add(evActor);
  }else if(pe.arc&&pe.c){ // an arc is about one of yours: face them
    const a=allies.find(o=>o.comp===pe.c);
    if(a){a.mesh.rotation.y=Math.atan2(player.x-a.x,player.z-a.z);}
  }
  const look=new THREE.Vector3(ax,heightAt(ax,az)+1.25,az);
  const to=new THREE.Vector3(ax-7.5,heightAt(ax,az)+2.3,az+4.2);
  const from=camera.position.clone();let lt=0;evCamOn=true;
  (function g2(){if(!evCamOn)return;lt=Math.min(1,lt+.02);const e2=1-Math.pow(1-lt,3);
    camera.position.lerpVectors(from,to,e2);camera.lookAt(look);requestAnimationFrame(g2);})();
  const dlg=$('dlg');
  dlg.querySelector('.n').textContent=title;
  dlg.querySelector('.r').textContent=who;
  dlg.querySelector('.q').textContent=txt;
  const wrap=$('dlgC');wrap.innerHTML='';
  for(const ch of chs){
    const d=document.createElement('div');
    d.className='choice'+(ch.grim?' grim':'');
    d.innerHTML=ch.l+(ch.s?'<span class="sub">'+ch.s+'</span>':'');
    d.addEventListener('click',()=>{ch.do();closeEvent();});
    wrap.appendChild(d);
  }
  setTimeout(()=>dlg.classList.add('on'),450);
  SFX.load();
}
let evActor=null,evCamOn=false;
function closeEvent(){
  $('dlg').classList.remove('on');
  document.body.classList.remove('cine');
  vm.visible=!player.ride;
  evCamOn=false;
  if(evActor){scene.remove(evActor);evActor=null;}
  pendingEvent=null;
  CAMP.mode='drive';
  updateRoster();saveCamp();
  tryLock();
}
/* ---- the muster roll: meet your people before the mud does ---- */
const VIGNETTE={
 brave:c=>c.name.split(' ')[0]+' once walked back into a burning mess tent for the regimental kettle. The kettle rides in '+TRUCK_NAMES[c.truck]+'.',
 gentle:c=>'Keeps a tin of sugar for the worst days and hands it out without being asked. Nobody knows how it never runs out.',
 ruthless:c=>'Did what the southern line required. Does not talk about it. The others leave a seat\'s width of respect on either side.',
 pious:c=>'Prays over the fuel cans. When asked why: "Everything that burns deserves a word."',
 bitter:c=>'Reads the Verdun broadcast transcript every night looking for the lie in it. Hasn\'t found it yet. That\'s what worries them.',
 funny:c=>'Has a joke for every kind of weather and two for artillery. The convoy has voted twice on whether this is a war crime.',
 haunted:c=>'Sleeps sitting up, facing whichever way Greyfield is. Best night watch in the column. Nobody asks the obvious question.',
 greedy:c=>'Can smell salvage through a closed truck. Says they\'re saving for something at Verdun. Won\'t say what.',
 loyal:c=>'Carried '+TRUCK_NAMES[c.truck]+'\'s old driver eleven miles. Tells the story like the driver made it.',
 reckless:c=>'Banned from holding the flare gun. Twice.',
 careful:c=>'Counts everything twice: rounds, tins, people. When the count is wrong, everyone knows by their face first.',
 quiet:c=>'Said eight words last week. Three of them saved the scout\'s life.',
 furious:c=>'The anger arrived after Greyfield and never left. They point it at the dead, mostly. Mostly.',
 'old-blood':c=>'Served before the end with the old colors. Still shaves every morning. "Standards," they say, "are a wall too."',
 superstitious:c=>'Taps the truck rail twice, never three times. So far the arithmetic of it is undefeated.',
 unbroken:c=>'Has been bitten at by everything the road owns and outwalked all of it. Smiles like a door that held.',
};
const MUSTER_LINE={
 brave:"Someone has to walk in front. Might as well be someone who doesn't mind.",
 gentle:"I kept sugar back for the bad days. There's enough. There'll be enough.",
 ruthless:"You want it done, or you want to feel good about it? Pick one. I already did.",
 pious:"I prayed over the fuel cans this morning. Everything that burns deserves a word.",
 bitter:"Verdun says the gates open at first light. It's been first light for six months.",
 funny:"Eight hundred kilometres, three trucks, one joke book. We're overprepared.",
 haunted:"I'll take the night watches. I'm awake anyway. Don't ask.",
 greedy:"I'm saving for something at Verdun. No, I won't say what. Yes, it's worth it.",
 loyal:"You drive, I follow. That's the whole arrangement. It's never once been broken.",
 reckless:"They banned me from the flare gun. Twice. Cowards.",
 careful:"Forty tins, six souls, ninety rounds. I count so nobody else has to.",
 quiet:"...",
 furious:"Point me at them. That's all I ask. Just keep pointing me at them.",
 'old-blood':"I shaved this morning. Standards are a wall too, and mine has never been breached.",
 superstitious:"Two taps on the rail. Never three. It has worked every day we are still alive.",
 unbroken:"Everything out there has had a bite at me. I'm still here. It knows that.",
};
function musterRoll(){
  CAMP.mode='muster';
  document.exitPointerLock&&document.exitPointerLock();
  document.body.classList.add('cine');
  vm.visible=false;
  const roll=allies.filter(a=>a.comp);
  // one wide shot of the line, names rolling past like credits
  let cx=0,cz=0;for(const a of roll){cx+=a.x;cz+=a.z;}cx/=roll.length||1;cz/=roll.length||1;
  for(const a of roll){const f=Math.atan2(player.x-a.x,player.z-a.z);a.mesh.rotation.y=f;a.face=f;}
  const look=new THREE.Vector3(cx,heightAt(cx,cz)+1.35,cz);
  const to=new THREE.Vector3(cx+6.5,heightAt(cx,cz)+2.6,cz+5);
  const from=camera.position.clone();let lt=0;
  (function g3(){if(CAMP.mode!=='muster')return;
    lt=Math.min(1,lt+.018);const e=1-Math.pow(1-lt,3);
    camera.position.lerpVectors(from,to,e);camera.lookAt(look);
    requestAnimationFrame(g3);})();
  const l3=$('l3');l3.classList.add('on');
  let i=-1;
  const tick=()=>{
    if(CAMP.mode!=='muster')return;
    i++;
    if(i>=roll.length){
      l3.classList.remove('on');
      document.body.classList.remove('cine');
      vm.visible=true;
      CAMP.mode='fall';
      say('THE DRIVER','Hold the wire. Every minute loads a crate. Come to MATHILDA and say roll when it\'s time.',7000);
      tryLock();
      return;
    }
    const c=roll[i].comp;
    l3.querySelector('.n').textContent=c.name.toUpperCase();
    l3.querySelector('.r').textContent=c.role+' · '+c.t1+' / '+c.t2;
    l3.querySelector('.q').textContent='"'+(MUSTER_LINE[c.t1]||'Greyfield made me. The road can try.')+'"';
    SFX.load();
    setTimeout(tick,2300);
  };
  setTimeout(tick,900);
  return;
  let _legacy=()=>{
  const next=()=>{
    const wrap=$('campChoices');wrap.innerHTML='';
    if(i<roll.length){
      const c=roll[i++];
      $('campTitle').textContent=c.name.toUpperCase();
      $('campWho').textContent=c.role+' · '+c.t1+' / '+c.t2+' · rides with '+TRUCK_NAMES[c.truck];
      $('campBody').textContent=(VIGNETTE[c.t1]||(x=>x.name.split(' ')[0]+' came out of Greyfield with a rifle, a spare pair of socks, and an opinion about both.'))(c)+
        '\n\nWants, more than anything: '+c.wish+'.';
      const d=document.createElement('div');d.className='choice';
      d.innerHTML=(i<roll.length?'Next on the roll':'Close the ledger')+'<span class="sub">'+(roll.length-i)+' name'+(roll.length-i===1?'':'s')+' to go</span>';
      d.addEventListener('click',next);
      wrap.appendChild(d);
      $('camp').classList.add('show');
    }else{
      $('camp').classList.remove('show');
      CAMP.mode='prologue';
      announce('PROLOGUE, REACH THE CONVOY','these are your people. go get their trucks back.');
      tryLock();
    }
  };
  $('campTitle').textContent='THE MUSTER ROLL';
  $('campWho').textContent='outpost greyfield · final strength return';
  $('campBody').textContent='Six souls signed out of a dead outpost this morning. The quartermaster\'s ledger calls them effectives. The road will call them whatever it likes.\n\nRead the names. They\'re yours now.';
  const wrap=$('campChoices');wrap.innerHTML='';
  const d=document.createElement('div');d.className='choice';
  d.innerHTML='Open the ledger';
  d.addEventListener('click',next);
  wrap.appendChild(d);
  };
}
/* ---- camp between legs ---- */
let campStep=0;
function arriveCamp(){
  CAMP.mode='camp';campStep=0;
  truckEngine(false);
  document.exitPointerLock&&document.exitPointerLock();
  G.scrap+=30+CAMP.leg*5;
  campNext();
}
function campNext(){
  const wrap=$('campChoices');wrap.innerHTML='';
  const show=(title,who,body,choices)=>{
    $('campTitle').textContent=title;
    $('campWho').textContent=who;
    $('campBody').textContent=body;
    for(const ch of choices){
      const d=document.createElement('div');
      d.className='choice'+(ch.grim?' grim':'');
      d.innerHTML=ch.l+(ch.s?'<span class="sub">'+ch.s+'</span>':'');
      d.addEventListener('click',()=>{if(ch.do)ch.do();campNext();});
      wrap.appendChild(d);
    }
    $('camp').classList.add('show');
  };
  // 1) bury the dead
  if(CAMP.deadQueue.length){
    const c=CAMP.deadQueue.shift();
    show('A GRAVE BY THE ROAD','for '+c.name+', '+c.cause,
      pick(EULOGY)(c)+'\n\nThe shovel passes from hand to hand. Nobody is excused from digging. That was decided a long time ago, by people now also under mounds like this one.',
      [{l:'Say the words',s:'the chaplain\'s, or your own',do:()=>{campMorale(4);}},
       {l:'Just dig',s:'words are for people with spare breath',grim:true,do:()=>{CAMP.mercy--;}}]);
    return;
  }
  campStep++;
  // 2) night report
  if(campStep===1){
    const fed=compsAlive().length;
    const starve=CAMP.supplies.food<fed;
    sup('food',-fed);
    let rep='LEG '+CAMP.leg+' is behind you. '+compsAlive().length+' souls eat by the fire'+
      (CAMP.flags.child?', plus one small one who eats more than expected':'')+'.\n\n'+
      (starve?'The pot is mostly water. People chew slowly to make it lie to them. (FOOD SHORT, morale suffers)':
       'The cook performs the nightly miracle: same tins, somehow soup.')+
      '\n\nStores: '+CAMP.supplies.food+' food · '+CAMP.supplies.meds+' meds · '+CAMP.supplies.fuel+' fuel · morale '+Math.round(CAMP.morale)+'/100';
    if(starve)campMorale(-10);else campMorale(3);
    if(CAMP.morale<=12&&compsAlive().length){
      const c=anyComp();killComp(c,'walked into the dark, morale broke before they did');
    }
    show('CAMP, '+CAMP.nodeName,'night '+CAMP.leg+' of the long road',rep,
      [{l:'Walk the fire circle',s:'on to the night\'s business',do:null},
       {l:'Open the quartermaster (close with B)',s:'spend scrap on iron',do:()=>{renderShop();$('shop').classList.add('show');shopOpen=true;}}]);
    return;
  }
  // 3) a character moment
  if(campStep===2&&!CAMP.momentDone){
    CAMP.momentDone=true;
    const pool=MOMENTS.filter(m=>!CAMP.usedMoments[m.id]&&(!m.need||m.need()));
    if(pool.length){
      const m=pool[Math.floor(Math.random()*pool.length)];
      CAMP.usedMoments[m.id]=true;
      show(m.title,'around the fire',m.txt(),m.ch.map(c=>({l:c.l,s:c.s,grim:c.grim,do:c.do})));
      return;
    }
    campStep++;
  }
  // 4) heirloom: rogue-like salvage, one per camp
  if(campStep===3){
    setSeed(CAMP.seed+CAMP.leg*131+7);
    const a=Math.floor(srnd()*HEIRLOOMS.length);
    let b=Math.floor(srnd()*HEIRLOOMS.length);if(b===a)b=(b+1)%HEIRLOOMS.length;
    const hs=[HEIRLOOMS[a],HEIRLOOMS[b]];
    show('SALVAGE FROM THE LEG','one rides along · the rest stays buried',
      'Two finds from the day\'s wreckage sit on the tailgate, cleaned and laid on a cloth like surgical tools. Convoy law, older than this convoy: keep one. Never both. Nobody remembers why, and nobody volunteers to find out.',
      hs.map(h=>({l:h.nm,s:h.ds,do:()=>{h.ap();CAMP.heirlooms.push({nm:h.nm,ds:h.ds});toastQ(h.nm+' rides with the convoy now.');}}))
       .concat([{l:'Bury them both',s:'some salvage costs more than it gives',grim:true,do:()=>{campMorale(2);}}]));
    return;
  }
  // 5) the motor pool: patch her plates, arm her bones
  if(campStep===4){
    const opts=[];
    for(const t of aliveTrucks()){
      if(t.hp<t.maxhp)opts.push({l:'Patch '+t.name+' ('+Math.round(t.hp)+'/'+t.maxhp+')',
        s:'25 scrap, +60 plate',do:()=>{if(G.scrap>=25){G.scrap-=25;t.hp=Math.min(t.maxhp,t.hp+60);SFX.build();}else SFX.deny();campStep=3;}});
      if(!t.gun)opts.push({l:'Mount an MG on '+t.name,
        s:'70 scrap, she shoots back from now on',do:()=>{if(G.scrap>=70){G.scrap-=70;mountGun(t);SFX.build();}else SFX.deny();campStep=3;}});
    }
    if(opts.length){
      opts.push({l:'Roll on',s:'the mechanic wipes her hands',do:null});
      show('THE MOTOR POOL','scrap '+G.scrap+' on hand',
        'The mechanic walks the column with a lantern, slapping each fender like a horse\'s flank, reading the day\'s damage with her palms. "Money or miles," she says. "Pick."',opts);
      return;
    }
    campStep=5;
  }
  // 6) heal & perks every 3rd leg
  if(campStep<=5){
    campStep=6;
    player.hp=player.maxhp;
    if(CAMP.flags.h_bone)sup('meds',1);
    if(CAMP.flags.h_seed)sup('food',2);
    if(CAMP.flags.h_dog){campMorale(3);sup('food',-1);}
    if(CAMP.supplies.meds>0)for(const c of compsAlive())c.morale=Math.min(100,c.morale+4);
    if(CAMP.leg%3===0){$('camp').classList.remove('show');offerPerksCamp();return;}
  }
  // 5) the route
  $('camp').classList.remove('show');
  showRoute();
}
function offerPerksCamp(){
  offerPerks();
  const row=$('perkRow');
  // after a perk is chosen the perks overlay closes itself; watch for that
  const iv=setInterval(()=>{
    if(!perkOpen){clearInterval(iv);document.exitPointerLock&&document.exitPointerLock();showRoute();}
  },200);
}
function showRoute(){
  CAMP.routeOpts=genRouteOptions();
  CAMP.mode='route';
  const btns=$('nodeBtns');btns.innerHTML='';
  $('routeTag').textContent='leg '+(CAMP.leg+1)+' of '+CAMP.legCount+' · act '+
    ['I, THE GREEN COUNTRY','II, THE HUNGRY MIDDLE','III, IN SIGHT OF THE WALLS'][CAMP.act-1];
  CAMP.routeOpts.forEach((o,i)=>{
    const d=document.createElement('div');
    d.className='nodeBtn';
    d.innerHTML='<div class="nm">'+o.name+'</div><div class="ds">'+o.biome.ds+
      (o.reward?'<br>RUMOUR: '+({scrap:'salvage yard',meds:'field hospital stores',fuel:'fuel point',food:'grain store',recruit:'survivors signalling'})[o.reward]:'')+
      '</div><div class="rsk" style="color:'+(o.risk>=3?'var(--blood)':o.risk===2?'var(--signal)':'var(--good)')+'">RISK '+'▮'.repeat(o.risk)+'▯'.repeat(4-o.risk)+'</div>';
    d.addEventListener('click',()=>{
      $('route').classList.remove('show');
      // rumoured rewards pay out on arrival commitment
      if(o.reward==='scrap')G.scrap+=60;
      if(o.reward==='meds')sup('meds',2);
      if(o.reward==='fuel')sup('fuel',3);
      if(o.reward==='food')sup('food',5);
      if(o.reward==='recruit'&&CAMP.comps.length<9){const c=mkComp();CAMP.comps.push(c);toastQ(c.name+' joins at the signal fire.');}
      beginLeg(o);saveCamp();
    });
    btns.appendChild(d);
  });
  drawRouteMap();
  $('route').classList.add('show');
}
function drawRouteMap(){
  const c=$('routeMap').getContext('2d');
  // parchment, stained and lived-on
  const g=c.createLinearGradient(0,0,520,330);
  g.addColorStop(0,'#d8cba6');g.addColorStop(1,'#c0ad82');
  c.fillStyle=g;c.fillRect(0,0,520,330);
  setSeed(CAMP.seed^0xabcdef);
  for(let i=0;i<900;i++){c.fillStyle='rgba(90,70,40,'+(srnd()*.08).toFixed(3)+')';
    c.fillRect(srnd()*520,srnd()*330,1.6,1.6);}
  c.strokeStyle='rgba(120,80,30,.16)';c.lineWidth=7;     // someone's mug, twice
  c.beginPath();c.arc(440,58,32,0,TAU);c.stroke();
  c.beginPath();c.arc(452,66,32,0,TAU);c.stroke();
  c.strokeStyle='rgba(90,75,45,.22)';c.lineWidth=1;      // surveyor's contour scribble
  for(let k=0;k<9;k++){
    c.beginPath();let yy=srnd()*330;c.moveTo(0,yy);
    for(let x=0;x<=520;x+=26)c.lineTo(x,yy+Math.sin(x*.02+k*1.7)*14+srnd()*6-3);
    c.stroke();
  }
  // the route, inked by a tired hand
  const px=l=>52+l/(CAMP.legCount)*414;
  setSeed(CAMP.seed^0xabcdef);
  const ys=[165];
  for(let l=1;l<=CAMP.legCount;l++)ys.push(165+Math.sin(l*2.1+srnd()*2)*68);
  c.strokeStyle='#3a2f1c';c.lineWidth=2.2;c.setLineDash([7,5]);
  c.beginPath();c.moveTo(px(0),ys[0]);
  for(let l=1;l<=CAMP.legCount;l++)c.lineTo(px(l)+srnd()*3-1.5,ys[l]+srnd()*3-1.5);
  c.stroke();c.setLineDash([]);
  for(let l=0;l<=CAMP.legCount;l++){
    const done=l<CAMP.leg,here=l===CAMP.leg,x=px(l),y=ys[l];
    if(done){ // struck through in red pencil: behind us now
      c.strokeStyle='rgba(140,47,35,.85)';c.lineWidth=2.4;
      c.beginPath();c.moveTo(x-6,y-6);c.lineTo(x+6,y+6);
      c.moveTo(x+6,y-6);c.lineTo(x-6,y+6);c.stroke();
    }else{
      c.fillStyle=here?'#8c2f23':'rgba(58,47,28,.8)';
      c.beginPath();c.arc(x,y,here?6:4,0,TAU);c.fill();
      if(here){c.strokeStyle='#8c2f23';c.lineWidth=1.6;
        c.beginPath();c.arc(x,y,11,0,TAU);c.stroke();}
    }
  }
  // compass rose
  c.save();c.translate(56,272);
  c.strokeStyle='#3a2f1c';c.fillStyle='#3a2f1c';c.lineWidth=1.4;
  c.beginPath();c.arc(0,0,22,0,TAU);c.stroke();
  c.beginPath();c.moveTo(0,-19);c.lineTo(5,0);c.lineTo(0,19);c.lineTo(-5,0);c.closePath();c.fill();
  c.font='12px "Special Elite"';c.fillText('N',-4,-28);
  c.restore();
  c.fillStyle='#3a2f1c';c.font='15px "Special Elite"';
  c.fillText('GREYFIELD',12,148);
  c.fillText('VERDUN',px(CAMP.legCount)-28,ys[CAMP.legCount]-16);
  c.fillStyle='#8c2f23';c.font='12px "Special Elite"';
  c.fillText('you are here',px(CAMP.leg)-30,ys[CAMP.leg]+26);
}
/* ---- endings ---- */
function winCampaign(){
  CAMP.mode='epilogue';
  document.exitPointerLock&&document.exitPointerLock();
  const alive=compsAlive().length+(CAMP.flags.child===true?1:0);
  const lines=[];
  lines.push('The gates of Verdun open at first light, exactly as the voice promised. The voice, it turns out, has a face, and the face weeps when it counts you.');
  lines.push(alive>=6?'You bring '+alive+' souls through the gate. The garrison stands to attention for the trucks as if they were warships.':
             alive>=3?'You bring '+alive+' souls through the gate. The empty seats ride in with you; nobody pretends otherwise.':
             alive>=1?'You bring '+alive+' through. The wall guard starts to cheer and then sees how few, and the cheer becomes something quieter and better: hats off, all along the wall.':
             'You arrive alone. The gate opens anyway. A city of strangers makes room for one more ghost.');
  if(CAMP.flags.child===true)lines.push('The child is adopted by the entire mess hall simultaneously. The gunner visits every day and claims otherwise.');
  if(CAMP.flags.h_dog)lines.push('The dog walks through the gates like it built them. Within a week it answers to six names and outranks a corporal.');
  if(CAMP.flags.tags)lines.push('Forty-one dog tags go to the records office. Forty-one families stop wondering. It was worth the carrying.');
  if(CAMP.flags.deserter_trial)lines.push(CAMP.flags.deserter_trial+' stands trial in a chapel with the roof half gone. The tribunal hears everything, including what you say. The sentence: to serve on the wall, where the line is never allowed to break again. They thank the court. They mean it.');
  if(CAMP.flags.deserter_hidden)lines.push('A person with a new name works the wall by night. Only you and a forged paper know what the southern front cost them. Mercy and justice, riding the same truck after all.');
  if(CAMP.flags.serum_worked)lines.push(CAMP.flags.serum_worked+' donates blood twice a week to the research wing. "The cure rode in on your convoy," the doctors say. They might even be right.');
  if(CAMP.flags.bitten_kept)lines.push('The bell on the trail truck never rang. '+CAMP.flags.bitten_kept+' walks through the gate untied, unbitten by anything but doubt. The medic still won\'t say it\'s over. The bell goes on a shelf.');
  if(CAMP.flags.cultist_kept)lines.push('On the last night, the offerings stopped. Nothing came anyway. '+CAMP.flags.cultist_kept+' stares at the dark like an investor watching a market crash.');
  if(CAMP.mercy>=5)lines.push('Word travels the way word does: there\'s a convoy that stops. By spring, three more convoys run the long road, and stopping is policy.');
  else if(CAMP.mercy<=-1||CAMP.flags.passed_by>=2)lines.push('Word travels the way word does: there\'s a convoy that doesn\'t stop. The road stays empty behind you. You got here. The arithmetic worked. The arithmetic is all that did.');
  const wishes=compsAlive().map(c=>c.name.split(' ')[0]+' goes looking for '+c.wish.replace(/^to /,''));
  if(wishes.length)lines.push('And the wishes, spoken at fires along eight hundred kilometres: '+wishes.join('. ')+'. Some of them will even find it.');
  lines.push('\nThe long road holds '+CAMP.journal.length+' graves with your shovel-work on them. Verdun holds '+alive+' futures with your name on them. The ledger is what it is. Sleep.');
  showEpilogue('THE GATES OPEN',lines.join('\n\n'),true);
}
function campaignOver(why){
  CAMP.mode='over';G.state='over';
  truckEngine(false);
  document.exitPointerLock&&document.exitPointerLock();
  const lines=[];
  if(why==='convoy')lines.push('The last truck burns on the road with everything that mattered inside it. The walking dark closes over the wreck like water over a stone.');
  else lines.push('The road wins, the way the road usually does.');
  if(CAMP.journal.length)lines.push('The graves you dug along the way: '+CAMP.journal.join(' · '));
  lines.push('Somewhere east, a recorded voice keeps promising that Verdun holds, to a road with no one left on it.');
  showEpilogue('THE ROAD ENDS',lines.join('\n\n'),false);
}
function showEpilogue(title,text,won){
  $('goTitle').textContent=title;
  $('goTag').textContent=won?'verdun holds':'the convoy is lost';
  $('goWave').textContent=CAMP.leg;
  $('goKills').textContent=G.kills;
  $('goScore').textContent=won?compsAlive().length+(CAMP.flags.child===true?1:0):0;
  $('goAcc').textContent=(G.shots>0?Math.round(G.hits/G.shots*100):0)+'%';
  $('goBest').textContent=text;
  $('gameover').classList.add('show');
  $('hud').classList.remove('on');
  localStorage.removeItem('tlr_save');
  CAMP.on=won?CAMP.on:false;
}
/* ---- roster (TAB) ---- */
function updateRoster(){
  const r=$('roster');r.innerHTML='';
  for(const c of CAMP.comps){
    const d=document.createElement('div');
    d.className='compRow'+(c.alive?'':' dead');
    d.innerHTML='<div class="cn">'+c.name+'</div><div class="ct">'+c.role+' · '+c.t1+' / '+c.t2+
      (c.alive?' · '+TRUCK_NAMES[c.truck]:' · '+(c.cause||''))+'</div>'+
      (c.alive?'<div class="cm"><i style="width:'+c.morale+'%"></i></div>':'');
    r.appendChild(d);
  }
}
/* ---- save / load ---- */
function saveCamp(){
  if(!CAMP.on)return;
  try{
    localStorage.setItem('tlr_save',JSON.stringify({
      seed:CAMP.seed,leg:CAMP.leg,act:CAMP.act,supplies:CAMP.supplies,morale:CAMP.morale,
      flags:CAMP.flags,journal:CAMP.journal,mercy:CAMP.mercy,usedEv:CAMP.usedEv,usedMoments:CAMP.usedMoments,
      comps:CAMP.comps,trucks:convoy.map(t=>({alive:t.alive,hp:t.hp,gun:!!t.gun})),
      scrap:G.scrap,items:G.items,owned:player.owned,reserve:player.reserve,
      muls:[G.dmgMul,G.reloadMul,G.speedMul,G.scrapMul,G.steadyMul,G.turretCost,G.buildMul,G.turretCap],
      maxhp:player.maxhp}));
  }catch(e){}
}
function continueCampaign(){
  let s;try{s=JSON.parse(localStorage.getItem('tlr_save'));}catch(e){}
  if(!s){startCampaign();return;}
  startCampaign(s.seed);
  Object.assign(CAMP,{leg:s.leg-0,act:s.act,supplies:s.supplies,morale:s.morale,flags:s.flags,
    journal:s.journal,mercy:s.mercy,usedEv:s.usedEv,usedMoments:s.usedMoments});
  CAMP.comps=s.comps;CAMP.leg=Math.max(0,s.leg-1);
  s.trucks.forEach((ts,i)=>{convoy[i].alive=ts.alive;convoy[i].hp=ts.hp;if(ts.gun)mountGun(convoy[i]);});
  G.scrap=s.scrap;G.items=s.items;player.owned=normalizeOwned(s.owned);player.mags=normalizeMags(player.mags);
  player.reserve=s.reserve;player.maxhp=s.maxhp;
  [G.dmgMul,G.reloadMul,G.speedMul,G.scrapMul,G.steadyMul,G.turretCost,G.buildMul,G.turretCap]=s.muls;
  showRoute(); // resume at the map: pick the next leg
  $('hud').classList.add('on');
}

/* ---------------- weather director ---------------- */
const WX=[
 {id:'CLEAR SKIES', n:[36,22],f:[155,105],rain:0,  cover:.15,storm:0,tint:[1,1,1],       frenzy:false},
 {id:'OVERCAST',    n:[30,19],f:[120,85], rain:0,  cover:.7, storm:0,tint:[.96,.97,1.02],frenzy:false},
 {id:'FOG BANK',    n:[14,10],f:[54,42],  rain:0,  cover:.5, storm:0,tint:[.97,.98,1],   frenzy:false},
 {id:'RAIN',        n:[26,17],f:[100,72], rain:.65,cover:.75,storm:0,tint:[.93,.96,1.05],frenzy:false},
 {id:'THUNDERSTORM',n:[22,14],f:[80,60],  rain:1,  cover:.92,storm:1,tint:[.74,.79,.98], frenzy:false},
 {id:'BLOOD FOG',   n:[15,10],f:[58,44],  rain:0,  cover:.55,storm:0,tint:[1.32,.8,.76], frenzy:true},
];
let wxCur=0,wxNext=0,wxBlend=1,wxTimer=55,wxFrenzy=false;
function wxPick(){
  if(G.wave>=5&&Math.random()<.14)return 5;
  return pick([0,1,2,3,4].filter(i=>i!==wxNext));
}
function wxParam(key,nf){
  const A=WX[wxCur][key],B=WX[wxNext][key];
  const a=Array.isArray(A)?lerp(A[0],A[1],nf):A;
  const b=Array.isArray(B)?lerp(B[0],B[1],nf):B;
  return lerp(a,b,wxBlend);
}
function wxTint(out){
  const A=WX[wxCur].tint,B=WX[wxNext].tint;
  for(let i=0;i<3;i++)out[i]=lerp(A[i],B[i],wxBlend);
}
function updateWeather(dt){
  wxTimer-=dt;
  if(wxTimer<=0){
    wxCur=wxNext;wxNext=wxPick();wxBlend=0;wxTimer=rand(70,130);
    if(WX[wxNext].frenzy){
      announce('BLOOD FOG','they hunger twice as hard, scrap doubled');
      SFX.wail();
      for(let i=0;i<6;i++)spawnZombie();
    }else toast('WEATHER, '+WX[wxNext].id);
  }
  wxBlend=Math.min(1,wxBlend+dt/15);
  wxFrenzy=(wxBlend>.5?WX[wxNext]:WX[wxCur]).frenzy===true;
}

function nextWave(){
  G.wave++;
  G.perkDone=false;
  G.spawnLeft=5+G.wave*4;
  G.colossusWave=G.wave%10===0;
  if(G.colossusWave)G.bruteLeft=Math.max(1,Math.floor(G.wave/10));
  else if(G.wave%5===0)G.bruteLeft=1+Math.floor(G.wave/5);
  else G.bruteLeft=0;
  G.spawnT=1;
  SFX.waveHorn();
  if(G.colossusWave)SFX.colossus();
  announce('WAVE '+G.wave,
    G.colossusWave?'the ground itself is afraid':
    G.wave%5===0?'heavy footsteps in the dark':'hold the line');
}
function damageDepot(d){
  G.depotHp-=d;
  if(G.depotHp<=0){G.depotHp=0;gameOver();}
}
function dmgArcFrom(sx,sz){
  const rel=Math.atan2(sx-player.x,sz-player.z)-(player.yaw+Math.PI);
  const el=document.createElement('div');
  el.className='dmgArc';
  el.style.transform='rotate('+(-rel)+'rad)';
  document.body.appendChild(el);
  setTimeout(()=>{el.style.opacity=0;},350);
  setTimeout(()=>el.remove(),1200);
}
function damagePlayer(d,src){
  if(src)dmgArcFrom(src.x,src.z);
  if(!player.alive)return;
  player.hp-=d;player.hurtT=1;player.regenT=6;
  camShake=Math.max(camShake,.35);
  SFX.hurt();
  if(player.hp<=0){
    player.alive=false;player.respawnT=5;
    player.man=null;player.ride=null;vm.visible=true;
    if(typeof mortarRing!=='undefined')mortarRing.visible=false;
    player.reserve=Math.floor(player.reserve/2);
    $('respawn').classList.add('show');
    document.exitPointerLock&&document.exitPointerLock();
  }
}
function gameOver(){
  if(WANDER.on){
    WANDER.on=false;
    gameOver._bw=WANDER.region;
    $('goTitle').textContent='THE COUNTRY KEEPS YOU';
    $('goTag').textContent=WANDER.region+' regions · '+Math.floor(WANDER.t/60)+' minutes · '+G.kills+' put down';
    WANDER.story.push('Fell in region '+WANDER.region+', '+Math.floor(WANDER.t/60)+' minutes out. The crows know the rest.');
    localStorage.removeItem('tlr_wander');
    $('contW').style.display='none';
    gameOver._story='YOUR STORY: '+WANDER.story.join(' ');
  }else if(BAST.on){
    const bb=+(localStorage.getItem('tlr_bastion_best')||0);
    if(BAST.wave>bb)localStorage.setItem('tlr_bastion_best',BAST.wave);
    gameOver._bw=BAST.wave;
    localStorage.removeItem('tlr_bastion_run');
    $('contB').style.display='none';
    $('goTitle').textContent='THE WALL FALLS';
    $('goTag').textContent='night '+BAST.wave+' · best '+Math.max(BAST.wave,bb);
  }else{gameOver._bw=null;$('goTitle').textContent='THE ROAD ENDS';$('goTag').textContent='the convoy is lost';}
  G.state='over';BAST.on=false;player.man=null;
  if(BAST.rotorG){try{BAST.rotorG.o.stop()}catch(e){};BAST.rotorG=null;}
  truckEngine(false);
  $('goWave').textContent=G.wave;
  $('goKills').textContent=G.kills;
  $('goScore').textContent=G.score.toLocaleString();
  $('goAcc').textContent=(G.shots>0?Math.round(G.hits/G.shots*100):0)+'%';
  if(gameOver._bw!=null){$('goWave').textContent=gameOver._bw;$('goScore').textContent=G.kills;}
  shopOpen=false;perkOpen=false;
  $('shop').classList.remove('show');$('perks').classList.remove('show');
  const nb=G.score>best;
  if(nb){best=G.score;localStorage.setItem('trenchfall_best',best);}
  $('goBest').textContent=gameOver._story||(nb?'NEW RECORD, previous best beaten':'best: '+best.toLocaleString());
  gameOver._story=null;
  document.exitPointerLock&&document.exitPointerLock();
  $('resume').classList.remove('show');
  const finish=()=>{
    document.body.classList.remove('cine');
    $('gameover').classList.add('show');
    $('hud').classList.remove('on');
  };
  if(gameOver._bw!=null){ // the camera lifts away from the dying wall
    document.body.classList.add('cine');
    $('hud').classList.remove('on');
    setTimeout(finish,3800);
  }else finish();
  SFX.crash();
}
function startGame(){
  audioInit();
  if(AU.ctx&&AU.ctx.state==='suspended')AU.ctx.resume();
  for(const t of turrets)scene.remove(t.mesh);
  turrets.length=0;zombies.length=0;
  H.set(H0);
  {const pos=tGeo.attributes.position.array;
   for(let v=0;v<VN*VN;v++)pos[v*3+1]=H[v];
   tGeo.attributes.position.needsUpdate=true;tGeo.computeVertexNormals();}
  paintAll();mapDirty=true;roadCheck();
  Object.assign(G,{state:'play',wave:0,kills:0,score:0,scrap:60,dirt:0,
    items:{nade:3,molotov:1,mine:1,medkit:1,flare:2,rocket:0},
    dmgMul:1,reloadMul:1,speedMul:1,scrapMul:1,steadyMul:1,
    turretCost:60,buildMul:1,turretCap:120,pocketsLvl:0,
    shots:0,hits:0,perkDone:false,colossusWave:false,
    depotHp:1000,depotAmmo:120,intermission:10,spawnLeft:0,bruteLeft:0,hintI:0,hintT:0});
  Object.assign(player,{x:6,y:0,z:12,vy:0,yaw:2.6,pitch:-.05,hp:100,maxhp:100,alive:true,
    reserve:90,carryCap:180,wid:0,owned:defaultOwned(),
    mags:defaultMags(),tool:null,buildType:0,healT:0,
    fireCd:0,reloadT:0,respawnT:0,ads:false,fireHeld:false});
  Object.assign(truck,{active:false,dead:false,timer:30,state:'off'});
  truck.mesh.visible=false;
  chain=0;chainT=0;acidFlash=0;camShake=0;everLocked=false;lampOn=true;
  shopOpen=false;perkOpen=false;
  wxCur=0;wxNext=0;wxBlend=1;wxTimer=55;wxFrenzy=false;
  for(const m of nadePool){m.live=false;m.visible=false;}
  for(const m of molotovPool){m.live=false;m.visible=false;}
  for(const m of acidMeshes){m.live=false;m.visible=false;}
  for(const s of firePool){s.live=false;s.material.opacity=0;}
  for(const f of flarePool){f.live=false;f.visible=false;f.material.opacity=0;}
  for(const m of minePool){m.live=false;m.visible=false;}
  for(const b of bags)scene.remove(b.mesh);bags.length=0;
  for(const w of wires)scene.remove(w.mesh);wires.length=0;
  for(const a of allies)scene.remove(a.mesh);allies.length=0;
  spawnAlly();spawnAlly();
  $('shop').classList.remove('show');$('perks').classList.remove('show');
  initSlots();refreshVM();
  for(const d of decals)d.material.opacity=0;
  $('start').classList.remove('show');
  $('gameover').classList.remove('show');
  $('resume').classList.remove('show');
  $('hud').classList.add('on');
  tryLock();
  announce('DIG IN','first wave imminent');
}
$('startBtn').addEventListener('click',()=>startCampaign());
$('againBtn').addEventListener('click',()=>{ $('gameover').classList.remove('show');startCampaign(); });
$('bastBtn').addEventListener('click',()=>startBastion(false));
$('contB').addEventListener('click',()=>startBastion(true));
try{const bsv=JSON.parse(localStorage.getItem('tlr_bastion_run'));
  if(bsv&&bsv.runSeed){$('contB').style.display='';
    $('contBms').textContent='night '+bsv.wave+' held · '+bsv.crew.length+' still on the wall';}
}catch(e){}
$('wandBtn').addEventListener('click',()=>startWander(false));
$('contW').addEventListener('click',()=>startWander(true));
try{const wsv=JSON.parse(localStorage.getItem('tlr_wander'));
  if(wsv&&wsv.runSeed){$('contW').style.display='';
    $('contWms').textContent='region '+wsv.region+' · '+Math.floor(wsv.t/60)+' minutes walked · the country remembers';}
}catch(e){}
for(const it of document.querySelectorAll('.mItem'))
  it.addEventListener('mouseenter',()=>{if(AU.ctx&&!AU.muted)sTone('sine',1450,1430,.04,.02);});
try{
  const sv=JSON.parse(localStorage.getItem('tlr_save'));
  if(sv&&sv.leg)$('contBtn').innerHTML='CONTINUE THE ROAD<span class="ms">leg '+sv.leg+' of 9 · '+(sv.comps?sv.comps.filter(c=>c.alive).length:'?')+' souls still walking</span>';
}catch(e){}
$('contBtn').addEventListener('click',continueCampaign);
if(localStorage.getItem('tlr_save'))$('contBtn').style.display='inline-block';
$('mHow').addEventListener('click',()=>{const b=$('howBox');b.style.display=b.style.display==='none'?'block':'none';});
$('gl').addEventListener('click',()=>{
  if(G.state==='play'&&!locked&&!shopOpen&&!perkOpen&&(BAST.on||CAMP.mode==='drive'))tryLock();
});

let annT=0;
function announce(main,sub){
  $('annMain').textContent=main;$('annSub').textContent=sub;
  $('announce').style.opacity=1;$('announce').classList.add('on');annT=2.6;
  document.body.classList.add('cine');   // letterbox in: the war pauses for a title card
}
let toastT=0;
function toast(msg){
  $('hint').textContent=msg;$('hint').style.color='#e8742c';toastT=4;
}
const HINTS=[
  'PRESS Q, DIG A TRENCH ACROSS THE OPEN GROUND',
  'ZOMBIES CLIMB OUT OF TRENCHES SLOWLY, SHOOT THEM IN THE PIT',
  'B AT THE DEPOT, BUY WEAPONS, ORDNANCE, AND AMMO',
  'T BUILDS, PRESS T AGAIN TO CYCLE TURRET, SANDBAGS, WIRE',
  'G THROWS A FRAG, THE BLAST DIGS ITS OWN CRATER',
  'Z THROWS A DECOY FLARE, THE DEAD CHASE THE LIGHT',
  'V THROWS A MOLOTOV, FIRE HOLDS A TRENCH BETTER THAN YOU DO',
  'X PLANTS A MINE, THEY NEVER LOOK DOWN',
  'CONVOYS REFILL THE DEPOT, IF THE ROAD IS INTACT',
  'SPITTERS LOB ACID OVER YOUR EARTHWORKS, CLOSE THE DISTANCE',
  'KILL SCREAMERS FIRST, THEIR WAIL DRIVES THE HORDE WILD',
  'EXPLODERS GLOW GREEN. DO NOT LET THEM HUG YOU.',
  'CRAWLERS ARE LOW, AIM DOWN',
  'THE MARKSMAN RIFLE PIERCES FOUR BODIES IN A LINE',
  'EVERY THIRD WAVE EARNS A FIELD PROMOTION, CHOOSE WISELY',
  'BLOOD FOG: DOUBLE SCRAP, DOUBLE FURY. HOLD.',
  'F TOGGLES YOUR TORCH, THE NIGHT IS LONG'
];

/* ---------------- shooting / digging / building ---------------- */
const _dir=new THREE.Vector3(),_org=new THREE.Vector3();
function muzzleFlash(end){
  const muzzleP=new THREE.Vector3(.25,-.18,-1).applyMatrix4(camera.matrixWorld);
  tracer(muzzleP,end);
  muzzle.position.copy(muzzleP);muzzle.intensity=60;
  flashSpr.position.copy(muzzleP);
  flashSpr.material.rotation=rand(TAU);
  flashSpr.scale.setScalar(rand(.45,.7));
  flashSpr.material.opacity=1;
  // smoke drifts ahead of the barrel, never across the eye
  camera.getWorldDirection(_dir);
  puffSmoke(muzzleP.clone().addScaledVector(_dir,2.3),false,true);
  ejectShell();
}
function fireWeapon(){
  const w=curW();
  if(w.rocket){
    if(player.fireCd>0||player.reloadT>0)return;
    if((G.items.rocket||0)<=0){toast('NO ROCKETS');SFX.deny();player.fireCd=.4;return;}
    G.items.rocket--;player.fireCd=w.rate;G.shots++;
    fireRocket();muzzle.intensity=60;
    return;
  }
  if(player.reloadT>0)return;
  if(w.melee){fireMelee(w);return;}
  if(player.mags[player.wid]<=0){SFX.dry();startReload();return;}
  if(w.flame){fireFlame(w);return;}
  player.mags[player.wid]--;G.shots++;
  player.fireCd=w.rate;
  vmKick=w.kick;
  if(w.kick>1.4)camShake=Math.max(camShake,.2*G.steadyMul);
  camera.getWorldDirection(_dir);
  _org.copy(camera.position);
  const spread=(player.ads?w.adsSpread:w.spread)*G.steadyMul*(player.crouch?.62:1);
  const base=_dir.clone();
  let endP=null,hitAny=false;
  for(let p=0;p<w.pellets;p++){
    const d=base.clone();
    d.x+=rand(-spread,spread);d.y+=rand(-spread,spread);d.z+=rand(-spread,spread);d.normalize();
    const gr=groundRay(_org,d,w.range);
    const maxD=gr?gr.dist:w.range;
    const hits=rayZombieAll(_org,d,maxD,1+(w.pierce||0));
    let pEnd=null;
    if(hits.length){
      hitAny=true;
      for(const h of hits){
        const pnt=new THREE.Vector3(_org.x+d.x*h.t,_org.y+d.y*h.t,_org.z+d.z*h.t);
        damageZombie(h.zb,(h.head?w.head:w.dmg)*G.dmgMul,pnt,h.head);
        if(h.head)G.score+=5;
        if(w.knock){h.zb.x+=d.x*w.knock;h.zb.z+=d.z*w.knock;}
        pEnd=pnt;
      }
    }else if(gr){
      burst(gr.point.x,gr.point.y+.1,gr.point.z,3,0x8a7a55,2.5,2);
      burst(gr.point.x,gr.point.y+.12,gr.point.z,1,0xffd080,1.2,3.5); // one hot spark
      pEnd=gr.point;
    }else pEnd=new THREE.Vector3(_org.x+d.x*w.range,_org.y+d.y*w.range,_org.z+d.z*w.range);
    if(!endP)endP=pEnd;
    if(w.pellets<=2||p%3===0)
      tracer(new THREE.Vector3(.25,-.18,-1).applyMatrix4(camera.matrixWorld),pEnd);
  }
  if(hitAny){G.hits++;
    $('crosshair').classList.add('hit');
    setTimeout(()=>$('crosshair').classList.remove('hit'),90);}
  muzzleFlash(endP);
  SFX[w.sfx]();
}
function fireMelee(w){
  player.fireCd=w.rate;G.shots++;
  vmSwing=1.15;vmKick=w.kick;camShake=Math.max(camShake,.035);
  camera.getWorldDirection(_dir);
  _org.copy(camera.position);
  let best=null,bestScore=-Infinity;
  for(const zb of zombies){
    if(!zb.alive||zb.rise>0)continue;
    const gy=heightAt(zb.x,zb.z),sc=zb.scale;
    const hx=zb.x-_org.x,hy=gy+1.05*sc-_org.y,hz=zb.z-_org.z;
    const d=Math.hypot(hx,hy,hz);
    if(d>w.range+.35*sc)continue;
    const dot=(hx*_dir.x+hy*_dir.y+hz*_dir.z)/(d||1);
    if(dot<.58)continue;
    const score=dot*2-d*.28;
    if(score>bestScore){bestScore=score;best={zb,gy,sc,head:dot>.9&&d<2.5};}
  }
  SFX[w.sfx]();
  if(!best)return;
  const pnt=new THREE.Vector3(best.zb.x,best.gy+(best.head?1.65:1.0)*best.sc,best.zb.z);
  damageZombie(best.zb,(best.head?w.head:w.dmg)*G.dmgMul,pnt,best.head);
  best.zb.x+=_dir.x*.22;best.zb.z+=_dir.z*.22;
  G.hits++;
  $('crosshair').classList.add('hit');
  setTimeout(()=>$('crosshair').classList.remove('hit'),90);
}
function mgShot(t){
  if(player.fireCd>0)return;
  if(player.reserve<=0){SFX.dry();return;}
  player.fireCd=.085;player.reserve--;G.shots++;
  camera.getWorldDirection(_dir);
  _org.copy(camera.position);
  const gr=groundRay(_org,_dir,150);
  const maxD=gr?gr.dist:150;
  const hits=rayZombieAll(_org,_dir,maxD,2);
  let endP;
  if(hits.length){G.hits++;
    for(const h of hits){
      endP=new THREE.Vector3(_org.x+_dir.x*h.t,_org.y+_dir.y*h.t,_org.z+_dir.z*h.t);
      damageZombie(h.zb,16,endP,h.head);
    }
  }else endP=gr?gr.point:new THREE.Vector3(_org.x+_dir.x*150,_org.y+_dir.y*150,_org.z+_dir.z*150);
  const tz=roadZ(t.x);
  _tv.set(t.x,heightAt(t.x,tz)+2.8,tz);
  tracer(_tv,endP);
  muzzle.position.copy(_tv);muzzle.intensity=55;
  SFX.lmg();camShake=Math.max(camShake,.07);
}
function fireFlame(w){
  player.mags[player.wid]--;
  player.fireCd=w.rate;G.shots++;
  camera.getWorldDirection(_dir);
  const muzzleP=new THREE.Vector3(.2,-.2,-.85).applyMatrix4(camera.matrixWorld);
  for(let i=0;i<5;i++){
    const k=pHead;pHead=(pHead+1)%MAXP;
    pPos[k*3]=muzzleP.x;pPos[k*3+1]=muzzleP.y;pPos[k*3+2]=muzzleP.z;
    const sp=rand(13,19);
    pVel[k*3]=_dir.x*sp+rand(-2,2);pVel[k*3+1]=_dir.y*sp+rand(1,3);pVel[k*3+2]=_dir.z*sp+rand(-2,2);
    pCol[k*3]=rand(2,4);pCol[k*3+1]=rand(.5,1.2);pCol[k*3+2]=.08;   // HDR flame → blooms
    pLife[k]=rand(.3,.55);
  }
  pGeo.attributes.color.needsUpdate=true;
  muzzle.position.copy(muzzleP);muzzle.intensity=45;
  let hitAny=false;
  for(const zb of zombies){
    if(!zb.alive||zb.rise>0)continue;
    const dx=zb.x-player.x,dz=zb.z-player.z,d=Math.hypot(dx,dz);
    if(d<16){
      const dot=(dx*_dir.x+dz*_dir.z)/(d||1);
      if(dot>.82){igniteZombie(zb,2.6,26);hitAny=true;}
    }
  }
  if(hitAny)G.hits++;
  if(Math.random()<.05){
    const gr=groundRay(camera.position,_dir,18);
    if(gr)addFirePatch(gr.point.x,gr.point.z,2.2,4);
  }
  SFX.flame();
}
function startReload(){
  const w=curW();
  if(w.melee)return;
  if(player.tool!==null||player.reloadT>0||player.mags[player.wid]>=w.magSize)return;
  if(player.reserve<(w.shellCost||1))return;
  player.reloadT=w.reload*G.reloadMul;SFX.reload();
}
function finishReload(){
  const w=curW(),cost=w.shellCost||1;
  const want=w.magSize-player.mags[player.wid];
  const can=Math.min(want,Math.floor(player.reserve/cost));
  player.mags[player.wid]+=can;player.reserve-=can*cost;
}
function shovel(raise){
  camera.getWorldDirection(_dir);
  const gr=groundRay(camera.position,_dir,16);
  if(!gr)return;
  player.digCd=.3;vmSwing=1;
  if(raise){
    if(G.dirt<1){toast('NO SPOIL, DIG FIRST');return;}
    const ch=modifyTerrain(gr.point.x,gr.point.z,3.1*(CAMP.digMul||1),.5);
    if(ch>0){G.dirt--;SFX.raise();burst(gr.point.x,gr.point.y+.3,gr.point.z,10,0x6b5535,3,3);}
  }else{
    const ch=modifyTerrain(gr.point.x,gr.point.z,3.1*(CAMP.digMul||1),-.55);
    if(ch>0){G.dirt=Math.min(G.dirt+1,40);SFX.dig();burst(gr.point.x,gr.point.y+.3,gr.point.z,12,0x5a4326,4,4);}
    else toast('CANNOT DIG HERE');
  }
}
function turretSpotOk(x,z){
  if(Math.hypot(x,z-9.5)<9)return{ok:false,why:'TOO CLOSE TO CAMP'};
  if(isRoad(x,z))return{ok:false,why:'NOT ON THE ROAD'};
  if(turrets.length>=8)return{ok:false,why:'TURRET LIMIT REACHED'};
  for(const t of turrets)if(Math.hypot(x-t.x,z-t.z)<4)return{ok:false,why:'TOO CLOSE TO ANOTHER TURRET'};
  const s=Math.abs(heightAt(x+1,z)-heightAt(x-1,z))+Math.abs(heightAt(x,z+1)-heightAt(x,z-1));
  if(s>1.6)return{ok:false,why:'GROUND TOO STEEP'};
  return{ok:true};
}
function interact(){
  if(G.state!=='play'||!player.alive)return;
  if(!BAST.on&&Math.hypot(player.x,player.z-9.5)<11){
    const want=player.carryCap-player.reserve;
    const take=Math.min(want,G.depotAmmo);
    if(take>0){G.depotAmmo-=take;player.reserve+=take;SFX.load();toast('RESTOCKED +'+take+' RDS');}
    else if(want<=0)toast('CARRYING FULL LOAD');
    else toast('DEPOT DRY, WAIT FOR CONVOY');
    return;
  }
  if(WANDER.on){
    const lm=WANDER.landmark;
    if(lm&&lm.kind==='bell'&&!lm.rung&&Math.hypot(player.x-lm.x,player.z-lm.z)<4.5){
      lm.rung=true;
      SFX.chime();setTimeout(SFX.chime,500);setTimeout(SFX.chime,1100);
      for(let i=0;i<8;i++){const z=spawnZombie();
        if(z){const a2=rand(TAU);z.x=player.x+Math.cos(a2)*rand(45,70);
          z.z=player.z+Math.sin(a2)*rand(45,70);z.rise=rand(.5,2);}}
      say('THE COUNTRY','You rang it. Of course you rang it. Everything heard.',4600);
      WANDER.story.push('Rang the bell in region '+WANDER.region+'. Regretted it shortly after.');
      G.score+=120;saveWander();
      return;
    }
    const q=WANDER.quest;
    if(q&&q.taken&&!q.objDone&&q.type==='fetch'&&Math.hypot(player.x-q.x,player.z-q.z)<3){
      q.objDone=true;SFX.chime();
      say('YOU','Got it. Now to carry it back across all that open ground.',3600);
      WANDER.story.push('Found what '+q.giver.toLowerCase()+' asked for.');
      saveWander();
      return;
    }
    for(const s of WANDER.sites){
      if(!s.used&&Math.hypot(player.x-s.x,player.z-s.z)<3.4){
        if(s.kind==='quester'){
          const q2=WANDER.quest;
          if(!q2)return;
          if(q2.turned){say(q2.giver,'Square, you and me. The country is watching someone else now.',3200);return;}
          if(!q2.taken){
            wanderTalk(q2.giver,'they look at you like the last page of a book',
              q2.type==='fetch'
                ?'My brother walked out toward the far hills and never walked back. Something of his is still lying out there. Bring it home and I will make it worth the boots you wear out.'
                :'A big one wears my husband\'s coat. Took it off his back, took him with it. I want the coat to stop walking. Can you make that happen?',
              [['Take the work','the marker goes on your compass',()=>{
                  q2.taken=true;
                  if(q2.type==='hunt')spawnQuestBrute();
                  WANDER.story.push('Took work from '+q2.giver.toLowerCase()+'.');saveWander();}],
               ['Walk on','some debts are not yours',null]]);
            return;
          }
          if(q2.taken&&!q2.objDone){say(q2.giver,q2.type==='fetch'?'Still out there. The compass knows the way.':'It still walks. I still wait.',3200);return;}
          if(q2.objDone&&!q2.turned){
            q2.turned=true;G.score+=250;
            if(q2.type==='fetch'){G.scrap+=70;G.items.medkit++;
              say(q2.giver,'That\'s his. That\'s... thank you. Take this, all of it. He\'d laugh at what it\'s worth now.',5200);}
            else{player.maxhp+=10;player.hp=Math.min(player.maxhp,player.hp+30);
              say(q2.giver,'It\'s done walking. Sit, eat something warm. You look like you carry more than most. Now you can carry a little more.',5200);}
            WANDER.story.push('Settled '+q2.giver.toLowerCase()+'\'s debt in region '+WANDER.region+'.');
            SFX.chime();saveWander();
            return;
          }
        }
        if(s.kind==='hermit'){
          const met=+(localStorage.getItem('tlr_hermit')||0)+1;
          localStorage.setItem('tlr_hermit',met);
          s.used=true;
          WANDER.story.push('Found the hermit\'s fire. Meeting '+met+'.');
          wanderTalk('THE HERMIT','he does not look up from the kettle',
            met===1?'Sit. The dead don\'t come to this fire, and I don\'t ask why anymore. Take what you can carry and leave the silence as you found it.':
            met===2?'You again. Different country, same fire. Either you\'re following me or the road is folding. Sit. The kettle remembers you.':
            met===3?'Three fires, three countries, one face. That makes you family by walker\'s law. Take this. I carried it long enough.':
            'There you are. The kettle\'s on. The world ends slower with company.',
            [['Trade 30 scrap for supplies','+40 rounds · +1 medkit',()=>{
                if(G.scrap>=30){G.scrap-=30;player.reserve=Math.min(player.carryCap,player.reserve+40);G.items.medkit++;SFX.buy();}
                else SFX.deny();}],
             ['Sit a while','rest by a fire the dead avoid',()=>{
                player.hp=Math.min(player.maxhp,player.hp+30);G.score+=50;SFX.chime();}],
             ['Sleep by the fire','wake at the next dusk or dawn. the fire keeps most things away',()=>{
                const wnf2=0.5-0.5*Math.cos(WANDER.t/150*TAU);
                const toDawn=wnf2>.5;
                const period=300,ph=WANDER.t%period;
                WANDER.t+=toDawn?(period-ph)+2:(150-ph+(ph>150?period:0))+2;
                fadeBlink();
                player.hp=Math.min(player.maxhp,player.hp+15);
                WANDER.story.push('Slept at the hermit\'s fire until '+(toDawn?'dawn':'dark')+'.');
                if(Math.random()<.35){
                  for(let i2=0;i2<6;i2++){const z2=spawnZombie();
                    if(z2){const a2=rand(TAU);z2.x=player.x+Math.cos(a2)*rand(24,34);
                      z2.z=player.z+Math.sin(a2)*rand(24,34);z2.rise=rand(1.5,4);}}
                  setTimeout(()=>say('THE HERMIT','Up. UP. The fire kept most of them away. Most.',4200),2300);
                }else SFX.chime();}],
             met===3?['Take the walker\'s charm','+10% speed, forever this run',()=>{
                G.speedMul*=1.1;WANDER.story.push('The hermit gave up his charm. Family, by walker\'s law.');SFX.chime();}]
              :['Leave quietly','the silence as you found it',null]]);
          return;
        }
        if(s.kind==='stranded'){
          s.used=true;scene.remove(s.mesh);
          WANDER.story.push('Pulled a stranger out of the teeth in region '+WANDER.region+'.');
          const a=spawnAlly(player.x+2,player.z+2);
          if(a){a.name=pick(ALLY_NAMES);a.dmgMul=1.2;
            say(a.name,'You came. Nobody comes. I\'m with you now, wherever it goes.',4200);}
          G.score+=200;SFX.chime();saveWander();
          return;
        }
        if(s.kind==='drifter'){
          wanderTalk(s.name.toUpperCase(),'a rifle across the knees, a fire that doesn\'t smoke',
            'Heard you coming a mile off. You walk loud for somebody still breathing. Sit if you want. I\'ve got a fire, a rifle, and no appointments.',
            [['Walk with me','40 scrap · they fight beside you',()=>{
                if(allies.length>=3){say(s.name,'You\'ve got people enough. Keep them breathing.',3400);return;}
                if(G.scrap<40){SFX.deny();say(s.name,'Goodwill doesn\'t load a rifle. Forty scrap says you mean it.',3800);return;}
                G.scrap-=40;s.used=true;scene.remove(s.mesh);
                const a=spawnAlly(s.x+1.5,s.z+1.5);
                if(a){a.name=s.name;a.dmgMul=1.15;
                  say(a.name,'Settled, then. I shoot whatever looks at you wrong.',3800);}
                WANDER.story.push(s.name+' joined the walk in region '+WANDER.region+'.');
                G.score+=150;SFX.chime();saveWander();}],
             ['Ask what they\'ve seen','the country, read aloud',()=>{
                if(s.told){say(s.name,'Told you what I know. The rest you walk yourself.',3000);return;}
                s.told=true;G.score+=40;
                const lm3=WANDER.landmark;
                say(s.name,lm3&&!lm3.found
                  ?'There\'s '+lm3.name.toLowerCase()+' out that way, if old maps mean anything. Worth seeing before the grass takes it.'
                  :'Columns moving at night, more every week. Sleep high, cook small, ring nothing.',5200);}],
             ['Walk on','two fires is one too many',null]]);
          return;
        }
      }
    }
    for(const L of WANDER.loot){
      if(!L.taken&&Math.hypot(player.x-L.x,player.z-L.z)<2.6){
        L.taken=true;scene.remove(L.mesh);
        const roll=Math.random();
        const k2=L.rich?2:1;
        if(roll<.35){player.reserve=Math.min(player.carryCap,player.reserve+50*k2);toast('CACHE: +'+(50*k2)+' ROUNDS');}
        else if(roll<.6){G.items.medkit+=k2;toast('CACHE: '+(k2>1?'MEDKITS':'A MEDKIT')+', STILL SEALED');}
        else if(roll<.8){G.scrap+=45*k2;toast('CACHE: +'+(45*k2)+' SCRAP');}
        else if(L.rich&&!player.owned[7]){player.owned[7]=true;G.items.rocket+=2;
          toast('CACHE: AN M9 BAZOOKA. SOMEBODY LOVED THIS THING.');initSlots();}
        else{G.items.nade+=k2;G.items.molotov+=k2;if(player.owned[7])G.items.rocket++;toast('CACHE: ORDNANCE, LOVINGLY WRAPPED');}
        SFX.chime();G.score+=40*k2;
        return;
      }
    }
  }
  if(BAST.on){
    for(const g of BAST.guns){
      if(Math.hypot(player.x-g.x,player.z-g.z)<2.6){
        if(player.man===g){player.man=null;vm.visible=true;mortarRing.visible=false;toast('OFF THE GUN');}
        else{player.man=g;vm.visible=false;SFX.load();
          toast(g.type==='mortar'?'ON THE MORTAR (LMB LOB · E STEP OFF)':'ON THE CANNON (LMB FIRE · E STEP OFF)');}
        return;
      }
    }
    for(let i=BAST.drops.length-1;i>=0;i--){const d=BAST.drops[i];
      if(d.landed&&Math.hypot(player.x-d.x,player.z-d.z)<2.6){
        scene.remove(d.mesh);BAST.drops.splice(i,1);
        BAST.cache+=d.salvage?260:120;BAST.shells+=d.salvage?10:5;SFX.chime();
        if(d.salvage)say('THE WALL','Her whole load, carried back on one pair of shoulders. Sparrow 4 takes the route tomorrow. She flies higher.',6000);
        toast(d.salvage?'SPARROW\'S LAST LOAD: +260 CACHE · +10 SHELLS':'SPARROW PACKAGE: +120 CACHE · +5 SHELLS');
        return;
      }
    }
    if(Math.hypot(player.x,player.z-9.5)<5&&Math.hypot(player.x-6,player.z-15)>=2.8){
      if(G.scrap>=30){G.scrap-=30;G.depotHp=Math.min(G.depotMax,G.depotHp+100);
        SFX.build();toast('TIMBER AND NAILS: WALL +100 ('+Math.round(G.depotHp)+')');saveBastion();}
      else{toast('NEED 30 SCRAP FOR REPAIRS');SFX.deny();}
      return;
    }
    if(Math.hypot(player.x-6,player.z-15)<2.8){
      if(BAST.cache<=0){toast('CACHE DRY, WAIT FOR SPARROW');SFX.deny();return;}
      const take=Math.min(60,BAST.cache,player.carryCap-player.reserve);
      if(take>0){BAST.cache-=take;player.reserve+=take;SFX.load();
        toast('+'+take+' RDS (CACHE: '+BAST.cache+')');}
      else toast('CARRYING FULL LOAD');
      return;
    }
  }
  if(!BAST.on)for(const t of aliveTrucks()){
    if(Math.hypot(player.x-t.x,player.z-roadZ(t.x))<4.4){
      if(CAMP.mode==='fall'){driverTalk(t);return;}
      if(player.ride===t){player.ride=null;vm.visible=true;SFX.thud();toast('BOOTS IN THE MUD');}
      else{player.ride=t;vm.visible=false;SFX.load();
        toast(t.gun?'ON THE GUN, '+t.name+' (LMB FIRE · E DISMOUNT)':'RIDING '+t.name+' (E TO DISMOUNT)');}
      return;
    }
  }
  for(const t of turrets){
    if(Math.hypot(player.x-t.x,player.z-t.z)<3.2){
      if(player.man&&player.man.ref===t){player.man=null;vm.visible=true;toast('OFF THE GUN');}
      else{player.man={type:'turret',x:t.x,z:t.z,ref:t};vm.visible=false;SFX.load();
        toast('ON THE GUN ('+t.ammo+' RDS · LMB FIRE · R LOAD · E OFF)');}
      return;
    }
  }
  for(const a of allies){
    if(Math.hypot(player.x-a.x,player.z-a.z)<3){
      if(a.down){
        a.down=false;a.hp=70;a.mesh.rotation.x=0;a.wanderT=0;
        if(G.items.medkit>0)G.items.medkit--;
        SFX.load();
        say(a.name,'On my feet. I owe you one I intend to repay.',3200);
        return;
      }
      talkTo(a);return;
    }
  }
}
let invOpen=false;
function rollOut(){
  for(const cv of CIVS)scene.remove(cv.mesh);
  CIVS.length=0;
  CAMP.supplies.food+=Math.ceil(CAMP.crates*.8);
  CAMP.supplies.meds+=Math.floor(CAMP.crates/4);
  G.depotAmmo+=CAMP.crates*15;G.scrap+=CAMP.crates*6;
  CAMP.mode='drive';
  announce('LEG 1, '+CAMP.nodeName,CAMP.crates+' crates aboard. don\'t look back. drive.');
  SFX.horn();
  say('THE COLUMN','Greyfield keeps the fires. We keep the road.');
  saveCamp();
}
function driverTalk(t){
  CAMP._back='fall';CAMP.mode='talk';
  vm.visible=false;
  document.exitPointerLock&&document.exitPointerLock();
  document.body.classList.add('cine');
  const dlg=$('dlg');
  dlg.querySelector('.n').textContent='THE DRIVER, '+t.name;
  dlg.querySelector('.r').textContent='engine running · '+CAMP.crates+' of 12 crates aboard';
  dlg.querySelector('.q').textContent='"'+(CAMP.crates<4?'Barely anything\'s loaded. Buy the loaders time if you can. Or say the word and we run light.':
    CAMP.crates<12?CAMP.crates+' crates lashed. More coming if you can hold the wire. Your call, boss.':
    'That\'s everything Greyfield owed us. Say the word.')+'"';
  const wrap=$('dlgC');wrap.innerHTML='';
  const opt=(l,sub,fn)=>{const d=document.createElement('div');d.className='choice';
    d.innerHTML=l+(sub?'<span class="sub">'+sub+'</span>':'');d.addEventListener('click',fn);wrap.appendChild(d);};
  opt('Roll out. Now.','leave with '+CAMP.crates+' crates of supplies',()=>{
    dlg.classList.remove('on');document.body.classList.remove('cine');vm.visible=true;rollOut();tryLock();});
  opt('We hold longer.','more crates, more pressure',()=>{
    dlg.classList.remove('on');document.body.classList.remove('cine');vm.visible=true;
    CAMP.mode='fall';tryLock();});
  setTimeout(()=>dlg.classList.add('on'),300);
}
function talkTo(a){
  if(!BAST.on&&!WANDER.on&&!['drive','fall','siege'].includes(CAMP.mode))return;
  CAMP._back=CAMP.mode;CAMP.mode='talk';
  document.exitPointerLock&&document.exitPointerLock();
  document.body.classList.add('cine');
  vm.visible=false;
  const c=a.comp;
  const f=Math.atan2(player.x-a.x,player.z-a.z);
  a.mesh.rotation.y=f;a.face=f;
  const hy=heightAt(a.x,a.z)+1.55*a.mesh.scale.x;
  const from=camera.position.clone();
  const to=new THREE.Vector3(a.x+Math.sin(f)*1.35-Math.cos(f)*.5,hy+.04,a.z+Math.cos(f)*1.35+Math.sin(f)*.5);
  const look=new THREE.Vector3(a.x,hy,a.z);
  let lt=0;
  (function glide(){
    if(CAMP.mode!=='talk')return;
    lt=Math.min(1,lt+.025);const e=1-Math.pow(1-lt,3);
    camera.position.lerpVectors(from,to,e);camera.lookAt(look);
    requestAnimationFrame(glide);
  })();
  const dlg=$('dlg');
  dlg.querySelector('.n').textContent=a.name.toUpperCase();
  dlg.querySelector('.r').textContent=c?(c.role+' · '+c.t1+' / '+c.t2+' · morale '+Math.round(c.morale)):'RIFLEMAN';
  const speak=t=>{dlg.querySelector('.q').textContent='"'+t+'"';};
  speak(c?(MUSTER_LINE[c.t1]||allyLine(a)):allyLine(a));
  const wrap=$('dlgC');
  const opt=(l,fn)=>{const d=document.createElement('div');d.className='choice';
    d.textContent=l;d.addEventListener('click',fn);wrap.appendChild(d);};
  const rebuild=()=>{
    wrap.innerHTML='';
    if(c)opt('What do you want, after all this?',()=>{
      speak('I want '+c.wish+'. Write it down somewhere that survives.');
      c.bondP++;c.morale=Math.min(100,c.morale+5);});
    if(c)opt({MEDIC:'How are we for meds?',SAPPER:'How does the road look?',GUNNER:'Ammunition report.',
      SCOUT:'What have you seen out there?',CHAPLAIN:'Say something for the road.',COOK:'How long will the food last?',
      'RADIO-OP':'Anything on the net?',MECHANIC:'How are the trucks holding?'}[c.role]||'Report.',()=>{
      speak({MEDIC:CAMP.supplies.meds+' kits left. Pray for boredom.',
        SAPPER:'Soft ground east. Keep the shovel closer than the rifle.',
        GUNNER:'You\'re carrying '+player.reserve+' rounds. I count everything, remember.',
        SCOUT:'Movement on the ridges at dusk. They follow the column like gulls follow a boat.',
        CHAPLAIN:'May the road be shorter than the night. Amen. That\'s the whole prayer now.',
        COOK:CAMP.supplies.food+' tins between us and the arithmetic.',
        'RADIO-OP':'Verdun, repeating. And under it, sometimes, something humming along.',
        MECHANIC:aliveTrucks().map(t=>t.name+' '+Math.round(t.hp/t.maxhp*100)+'%').join(', ')+'.'}[c.role]||'Holding.');});
    const kit=[];
    if(c)kit.push(c.role==='MEDIC'?'field kit, half full':c.role==='GUNNER'?'spare belts, never enough':'service rifle, oiled');
    if(a.dmgMul>1)kit.push('your 30 rounds, counted twice');
    for(const gv of (a.given||[]))kit.push(gv);
    dlg.querySelector('.r').textContent=(c?(c.role+' · '+c.t1+' / '+c.t2+' · morale '+Math.round(c.morale)):'RIFLEMAN')+
      '  ·  carries: '+(kit.join(', ')||'almost nothing');
    if(G.items.medkit>0)opt('Give them a medkit.',()=>{
      G.items.medkit--;a.hp=a.maxhp;(a.given=a.given||[]).push('your medkit');
      if(c){c.morale=Math.min(100,c.morale+12);c.bondP++;}
      speak('I... thank you. I\'ll make it outlast both of us.');rebuild();});
    if(G.items.nade>0)opt('Slip them a grenade.',()=>{
      G.items.nade--;a.dmgMul=(a.dmgMul||1)+.2;(a.given=a.given||[]).push('a grenade, pocketed');
      speak('Pocket artillery. You know the way to a soldier\'s heart.');rebuild();});
    if(player.reserve>=30)opt('Take 30 rounds. Make them count.',()=>{
      player.reserve-=30;a.dmgMul=1.6;SFX.load();
      if(c){c.morale=Math.min(100,c.morale+8);c.bondP++;}
      speak('Counted and pocketed. They\'ll come back to you the only way that matters.');
      rebuild();});
    opt('Back to it.',()=>{
      dlg.classList.remove('on');
      document.body.classList.remove('cine');
      vm.visible=!player.ride;
      CAMP.mode=CAMP._back||'drive';
      updateRoster();
      tryLock();});
  };
  rebuild();
  setTimeout(()=>dlg.classList.add('on'),500);
}
/* ---- the pack: weapons in hand, pockets, keepsakes ---- */
function toggleInv(){
  if(invOpen){invOpen=false;$('inv').classList.remove('show');
    if(!['camp','route','event','talk','muster'].includes(CAMP.mode))tryLock();return;}
  if(shopOpen||perkOpen||!player.alive||G.state!=='play')return;
  invOpen=true;renderInv();
  $('inv').classList.add('show');
  document.exitPointerLock&&document.exitPointerLock();
}
function renderInv(){
  const grid=$('invGrid');grid.innerHTML='';
  let sel=renderInv.sel||{k:'w',i:player.wid};
  const detail=$('invDetail');
  const showDetail=()=>{
    detail.classList.remove('dswap');void detail.offsetWidth;detail.classList.add('dswap');
    detail.innerHTML='';
    const dn=document.createElement('div');dn.className='dn';
    const dd=document.createElement('div');dd.className='dd';
    detail.appendChild(dn);detail.appendChild(dd);
    if(sel.k==='w'){
      const w=WEAPONS[sel.i];
      dn.textContent=w.name;
      dd.textContent=w.melee?w.ds+'  Always ready.':
        w.ds+'  Magazine '+player.mags[sel.i]+'/'+w.magSize+' · reserve '+player.reserve+'.';
      const stats=[['DAMAGE',w.flame?.8:clamp((w.dmg*(w.pellets||1))/85,0,1)],
        ['RATE',clamp(.045/w.rate,0,1)],['RANGE',w.melee?clamp(w.range/4,0,1):clamp((w.range||90)/200,0,1)],
        ['HANDLING',clamp(1-w.kick/2.2,0,1)]];
      const barEls=[];
      for(const[lbl,v]of stats){
        const r=document.createElement('div');r.className='statRow';
        r.innerHTML='<span>'+lbl+'</span><div class="stB"><i style="width:0%"></i></div>';
        detail.appendChild(r);barEls.push([r.querySelector('i'),v]);
      }
      requestAnimationFrame(()=>requestAnimationFrame(()=>{ // bars sweep to their truth
        for(const[el,v]of barEls)el.style.width=(v*100)+'%';
      }));
      if(player.wid!==sel.i||player.tool){
        const act=document.createElement('div');act.className='act';act.textContent='TAKE UP';
        act.addEventListener('click',()=>{selectWeapon(sel.i);renderInv();});
        detail.appendChild(act);
      }
    }else if(sel.k==='c'){
      const M={nade:['FRAG GRENADE','Craters the earth. Thrown with [G].',null],
        molotov:['MOLOTOV','Eight seconds of burning ground. Thrown with [V].',null],
        mine:['AP MINE','Armed in a second. They never look down. Placed with [X].',null],
        medkit:['FIELD MEDKIT','Sixty vitality over four slow breaths. [H], or use it here.',()=>{useMedkit();renderInv();}],
        flare:['DECOY FLARE','The dead chase the light for twelve seconds. [Z].',null],
        rocket:['M9 ROCKET','High explosive, shaped for regret. Fired from the tube on slot 8.',null]}[sel.i];
      dn.textContent=M[0];dd.textContent=M[1]+'  Carrying ×'+G.items[sel.i]+'.';
      if(M[2]&&G.items[sel.i]>0&&player.hp<player.maxhp){
        const act=document.createElement('div');act.className='act';act.textContent='USE NOW';
        act.addEventListener('click',M[2]);detail.appendChild(act);
      }
    }else if(sel.k==='h'){
      dn.textContent=sel.i.nm;dd.textContent=sel.i.ds;
    }else{dn.textContent='THE PACK';dd.textContent='Pick something up. Everything here has carried someone this far.';}
  };
  let itemN=0;
  const item=(nm,ct,tag,isSel,fn)=>{
    const d=document.createElement('div');d.className='invItem'+(tag==='IN HAND'?' eq':'');
    d.style.animationDelay=(itemN++*.035)+'s';
    d.innerHTML='<div class="nm">'+nm+'</div><div class="ct">'+ct+'</div>'+(tag?'<div class="tag">'+tag+'</div>':'');
    const pick=()=>{for(const o of grid.querySelectorAll('.invItem'))o.classList.remove('sel');
      d.classList.add('sel');fn();};
    d.addEventListener('mouseenter',pick);
    d.addEventListener('click',pick);
    grid.appendChild(d);};
  const sec=t=>{const h=document.createElement('h3');h.textContent=t;grid.appendChild(h);};
  sec('IN HAND, AND ON THE SLING');
  WEAPONS.forEach((wp,i)=>{
    if(!player.owned[i])return;
    item(wp.name,wp.melee?'always ready':'mag '+player.mags[i]+'/'+wp.magSize,
      player.wid===i&&!player.tool?'IN HAND':'',false,
      ()=>{renderInv.sel={k:'w',i};sel=renderInv.sel;showDetail();});
  });
  sec('POCKETS · RESERVE '+player.reserve+' RDS · SCRAP '+G.scrap);
  for(const k of['nade','molotov','mine','medkit','flare','rocket'])
    item({nade:'FRAG',molotov:'MOLOTOV',mine:'AP MINE',medkit:'MEDKIT',flare:'FLARE',rocket:'ROCKET'}[k],
      '×'+G.items[k],'',false,
      ()=>{renderInv.sel={k:'c',i:k};sel=renderInv.sel;showDetail();});
  if(!BAST.on){
    sec('KEEPSAKES OF THE ROAD');
    if(!CAMP.heirlooms.length)item('NOTHING YET','the road hasn\'t paid out. it will.','',false,()=>{});
    for(const h of CAMP.heirlooms)
      item(h.nm,'kept','',false,()=>{renderInv.sel={k:'h',i:h};sel=renderInv.sel;showDetail();});
  }
  showDetail();
}

/* ---------------- shop & perks ---------------- */
const SHOP=[
 ...[1,2,3,4,5].map(i=>({t:'w',i})),
 {t:'ammo',name:'AMMO BUNDLE',price:40,ds:'+100 rounds to your reserve.'},
 {t:'c',k:'nade',  name:'FRAG GRENADE',price:30,ds:'Craters the earth where it lands.'},
 {t:'c',k:'molotov',name:'MOLOTOV',    price:40,ds:'Burning ground, burning dead. 8s.'},
 {t:'c',k:'mine',  name:'AP MINE',     price:50,ds:'Arms in a second. They never look down.'},
 {t:'c',k:'medkit',name:'FIELD MEDKIT',price:60,ds:'60 vitality over four breaths.'},
 {t:'c',k:'flare', name:'DECOY FLARE', price:25,ds:'The dead chase the light. 12 seconds.'},
];
function toggleShop(){
  if(!shopOpen){
    if(perkOpen||!player.alive)return;
    const atCamp=['camp','route'].includes(CAMP.mode);
    const nearWaystation=Math.hypot(player.x,player.z-9.5)<12;
    const lead=leadTruck();
    const nearTruck=CAMP.on&&lead&&Math.hypot(player.x-lead.x,player.z-roadZ(lead.x))<10
      &&!zombies.some(z=>z.alive&&Math.hypot(z.x-player.x,z.z-player.z)<26);
    if(!atCamp&&!nearWaystation&&!nearTruck){
      toast(CAMP.on?'THE QUARTERMASTER RIDES THE LEAD TRUCK, AND NOT UNDER FIRE':'REQUISITIONS, DEPOT ONLY');
      SFX.deny();return;
    }
    shopOpen=true;renderShop();
    $('shop').classList.add('show');
    document.exitPointerLock&&document.exitPointerLock();
  }else{
    shopOpen=false;$('shop').classList.remove('show');
    if(!['camp','route','event'].includes(CAMP.mode))tryLock();
  }
}
function renderShop(){
  $('shopScrap').textContent='SCRAP '+G.scrap;
  const wrap=$('shopWrap');wrap.innerHTML='';
  const caps=ITEM_CAPS();
  for(const it of SHOP){
    const d=document.createElement('div');
    d.className='shopItem';
    let nm,pr,ds,can=true,owned=false;
    if(it.t==='w'){
      const w=WEAPONS[it.i];
      nm=w.name;pr=w.price;ds=w.ds;
      owned=player.owned[it.i];
    }else if(it.t==='ammo'){nm=it.name;pr=it.price;ds=it.ds;can=player.reserve<player.carryCap;}
    else{nm=it.name;pr=it.price;ds=it.ds+' ('+G.items[it.k]+'/'+caps[it.k]+')';can=G.items[it.k]<caps[it.k];}
    if(CAMP.on&&CAMP.flags.h_thumb&&pr)pr=Math.round(pr*.8);
    const poor=G.scrap<pr;
    d.classList.toggle('owned',owned);
    d.classList.toggle('poor',!owned&&(poor||!can));
    d.innerHTML='<div class="nm">'+nm+'</div><div class="pr">'+(owned?'ISSUED':pr+' SCRAP')+'</div><div class="ds">'+ds+'</div>';
    d.addEventListener('click',()=>{
      if(owned||poor||!can){SFX.deny();return;}
      G.scrap-=pr;
      if(it.t==='w'){player.owned[it.i]=true;player.mags[it.i]=WEAPONS[it.i].magSize;
        if(WEAPONS[it.i].rocket)G.items.rocket=(G.items.rocket||0)+3;
        toast(WEAPONS[it.i].name+', PRESS '+(it.i+1));}
      else if(it.t==='ammo')player.reserve=Math.min(player.carryCap,player.reserve+100);
      else G.items[it.k]++;
      SFX.buy();renderShop();
    });
    wrap.appendChild(d);
  }
}
const PERKS=[
 {ic:'✚',nm:'IRON CONSTITUTION',ds:'+30 max vitality. Mended in full.',ap:()=>{player.maxhp+=30;player.hp=player.maxhp;}},
 {ic:'☠',nm:'DUM-DUM ROUNDS',ds:'All weapons hit 20% harder.',ap:()=>G.dmgMul*=1.2},
 {ic:'⟳',nm:'GREASED BOLT',ds:'Reload a quarter faster.',ap:()=>G.reloadMul*=.75},
 {ic:'➤',nm:'TRENCH RUNNER',ds:'Move 12% faster across the mud.',ap:()=>G.speedMul*=1.12},
 {ic:'⚙',nm:'COMBAT ENGINEER',ds:'Builds cost 30% less. Turrets hold 180.',ap:()=>{G.turretCost=Math.round(G.turretCost*.7);G.buildMul*=.7;G.turretCap=180;}},
 {ic:'✦',nm:'SCAVENGER',ds:'Half again more scrap from every kill.',ap:()=>G.scrapMul*=1.5},
 {ic:'▣',nm:'DEEP POCKETS',ds:'+60 reserve cap. +1 to every consumable cap.',ap:()=>{player.carryCap+=60;G.pocketsLvl++;}},
 {ic:'◎',nm:'STEADY HANDS',ds:'A third less spread and recoil.',ap:()=>G.steadyMul*=.65},
];
function offerPerks(){
  perkOpen=true;
  $('perks').classList.add('show');
  document.exitPointerLock&&document.exitPointerLock();
  SFX.perk();
  const avail=[...PERKS],picks=[];
  while(picks.length<3&&avail.length)
    picks.push(avail.splice(Math.floor(Math.random()*avail.length),1)[0]);
  const row=$('perkRow');row.innerHTML='';
  picks.forEach((p,i)=>{
    const d=document.createElement('div');
    d.className='perk fadein d'+(i+1);
    d.innerHTML='<div class="ic">'+p.ic+'</div><div class="nm">'+p.nm+'</div><div class="ds">'+p.ds+'</div>';
    d.addEventListener('click',()=>{
      p.ap();SFX.buy();
      perkOpen=false;$('perks').classList.remove('show');tryLock();
      toast('DOCTRINE, '+p.nm);
    });
    row.appendChild(d);
  });
}
/* ---------------- player update ---------------- */
function updatePlayer(dt,t){
  if(!player.alive){
    player.respawnT-=dt;
    $('respN').textContent=Math.ceil(Math.max(0,player.respawnT));
    if(player.respawnT<=0){
      player.alive=true;player.hp=70;
      if(CAMP.on){
        const l=leadTruck();
        player.x=l?l.x-8:4;player.z=l?roadZ(player.x)+4:10;
        if(CAMP.supplies.meds>0){sup('meds',-1);toastQ('The medic spends supplies pulling you back. (-1 meds)');}
        else{campMorale(-8);toastQ('They drag you into the truck bed. No meds left to soften it.');}
      }else{player.x=4;player.z=10;}
      player.vy=0;
      $('respawn').classList.remove('show');
      tryLock();
    }
    return;
  }
  player.hurtT=Math.max(0,player.hurtT-dt);
  $('hurt').style.opacity=player.hurtT*.7;
  acidFlash=Math.max(0,acidFlash-dt*.8);
  $('acidFx').style.opacity=acidFlash*.8;
  player.regenT-=dt;
  if(player.regenT<=0&&player.hp<player.maxhp)player.hp=Math.min(player.maxhp,player.hp+6*dt);
  if(player.healT>0){player.healT-=dt;player.hp=Math.min(player.maxhp,player.hp+16*dt);}

  if(player.man){
    const g=player.man;
    player.x=g.x;player.z=g.z+ (g.type==='mortar'?1.1:1.2);player.vy=0;player.grounded=true;
    player.y=heightAt(g.x,g.z);
    camera.position.set(player.x,player.y+1.7,player.z);
    camera.rotation.y=player.yaw;camera.rotation.x=player.pitch;
    player.fireCd-=dt;
    if(mouseDownL){if(g.type==='mortar')fireMortar(g);else fireCannon(g);mouseDownL=g.type!=='mortar';}
    muzzle.intensity=Math.max(0,muzzle.intensity-dt*900);
    camShake=Math.max(0,camShake-dt*2.1);
    return;
  }
  if(player.ride){
    const rt=player.ride;
    if(!rt.alive)player.ride=null;
    else{
      const tz=roadZ(rt.x);
      player.x=rt.x;player.z=tz;player.vy=0;player.grounded=true;
      player.y=heightAt(rt.x,tz)+1.7;
      camera.position.set(rt.x,player.y+1.5,tz);
      camera.rotation.y=player.yaw;camera.rotation.x=player.pitch;
      player.fireCd-=dt;
      if(rt.gun){
        rt.gun.mesh.rotation.y=player.yaw-rt.mesh.rotation.y+Math.PI;
        if(mouseDownL)mgShot(rt);
      }
      muzzle.intensity=Math.max(0,muzzle.intensity-dt*900);
      camShake=Math.max(0,camShake-dt*2.1);
      return;
    }
  }
  player.ads=player.tool===null&&mouseDownR;
  $('scope').style.display=player.ads&&player.wid===3?'block':'none';
  $('crosshair').style.display=player.ads&&player.wid===3?'none':'block';
  const fx=-Math.sin(player.yaw),fz=-Math.cos(player.yaw);
  const rx=Math.cos(player.yaw),rz=-Math.sin(player.yaw);
  let mx=0,mz=0;
  if(keys.KeyW){mx+=fx;mz+=fz;}
  if(keys.KeyS){mx-=fx;mz-=fz;}
  if(keys.KeyD){mx+=rx;mz+=rz;}
  if(keys.KeyA){mx-=rx;mz-=rz;}
  const ml=Math.hypot(mx,mz);
  player.crouch=!!(keys.ControlLeft||keys.ControlRight)&&player.grounded;
  player.sprint=!!keys.ShiftLeft&&ml>0&&!player.ads&&!player.crouch;
  const sp=(player.sprint?9.4:5.6)*(player.ads?.55:1)*(player.crouch?.45:1)*G.speedMul;
  if(ml>0){mx/=ml;mz/=ml;}
  const nx=clamp(player.x+mx*sp*dt,-half+2,half-2);
  const nz=clamp(player.z+mz*sp*dt,-half+2,half-2);
  const hNew=heightAt(nx,nz);
  if(hNew-player.y<1.05){player.x=nx;player.z=nz;}
  else{
    const hX=heightAt(nx,player.z),hZ=heightAt(player.x,nz);
    if(hX-player.y<1.05)player.x=nx;
    else if(hZ-player.y<1.05)player.z=nz;
  }
  // the world is solid now: trunks, walls, trucks
  for(const pool of[COLLIDERS,CAMP_COLLIDERS])for(const c of pool){
    const dx=player.x-c.x,dz=player.z-c.z,d2=dx*dx+dz*dz,rr=c.r+.42;
    if(d2<rr*rr&&d2>1e-4){const dd=Math.sqrt(d2);player.x=c.x+dx/dd*rr;player.z=c.z+dz/dd*rr;}
  }
  if(typeof aliveTrucks==='function')for(const t of aliveTrucks()){
    const tz=roadZ(t.x),dx=player.x-t.x,dz=player.z-tz,d2=dx*dx+dz*dz;
    if(d2<7.3&&d2>1e-4){const dd=Math.sqrt(d2);player.x=t.x+dx/dd*2.7;player.z=tz+dz/dd*2.7;}
  }
  player.vy-=24*dt;
  if(keys.Space&&player.grounded){player.vy=8.2;player.grounded=false;}
  player.y+=player.vy*dt;
  const g=heightAt(player.x,player.z);
  if(player.y<=g){player.y=g;player.vy=0;player.grounded=true;}
  else player.grounded=false;

  const prevBob=Math.sin(player.bob);
  player.bob+=dt*(ml>0?(player.sprint?11:7.5):0);
  const stepped=ml>0&&player.grounded&&((prevBob>=0&&Math.sin(player.bob)<0)||(prevBob<0&&Math.sin(player.bob)>=0));
  if(stepped){
    SFX.step();
    if(player.sprint)puffSmoke(_tv.set(player.x+rand(-.2,.2),player.y+heightAt(player.x,player.z)+.25,player.z+rand(-.2,.2)),false,true); // boots kick the dry ground
  }
  player.eyeH=lerp(player.eyeH??1.68,player.crouch?.98:1.68,1-Math.pow(.0001,dt));
  const eye=player.y+player.eyeH+Math.sin(player.bob)*.045*(ml>0?1:0);
  camera.position.set(
    player.x+rand(-1,1)*camShake*.18,
    eye+rand(-1,1)*camShake*.14,
    player.z+rand(-1,1)*camShake*.18);
  camera.rotation.y=player.yaw+rand(-1,1)*camShake*.01+(player.ads?Math.cos(t*1.3)*.0011:0);
  camera.rotation.x=player.pitch+rand(-1,1)*camShake*.01+(player.ads?Math.sin(t*1.7)*.0011:0);
  camShake=Math.max(0,camShake-dt*2.1);

  const wantFov=player.ads?curW().zoom:(player.sprint?80:72);
  if(Math.abs(camera.fov-wantFov)>.2){
    camera.fov=lerp(camera.fov,wantFov,1-Math.pow(.0001,dt));
    camera.updateProjectionMatrix();
  }

  vmKick=Math.max(0,vmKick-dt*9);
  vmSwing=Math.max(0,vmSwing-dt*4);
  const vx0=player.ads?.0:.32,vy0=player.ads?-.225:-.3,vz0=player.ads?-.42:-.55;
  vm.position.set(
    lerp(vm.position.x,vx0+Math.sin(player.bob*.5)*.012,1-Math.pow(.000001,dt)),
    vy0+Math.abs(Math.sin(player.bob))*.018+vmKick*.04,
    vz0+vmKick*.09);
  const yawD=clamp((player.yaw-lastYawVM)*6,-.09,.09);lastYawVM=player.yaw;
  vmYawLag+=(yawD-vmYawLag)*Math.min(1,dt*10);
  vm.rotation.y=vmYawLag;
  vm.rotation.x=vmKick*.16-vmSwing*1.1+vmYawLag*.15;
  vm.rotation.z=vmSwing*.5-vmYawLag*.5;
  updateRockets(dt);
  if(player.reloadT>0){
    player.reloadT-=dt;
    vm.rotation.x+=Math.sin(clamp(player.reloadT/(curW().reload*G.reloadMul),0,1)*Math.PI)*.7;
    if(player.reloadT<=0)finishReload();
  }

  player.fireCd-=dt;player.digCd-=dt;
  if(player.tool===null){
    const w=curW();
    if(mouseDownL&&player.fireCd<=0&&(w.auto||!player.fireHeld))fireWeapon();
    player.fireHeld=mouseDownL;
  }else if(player.tool==='shovel'&&player.digCd<=0){
    if(mouseDownL){shovel(false);mouseDownL=false;}
    else if(mouseDownR){shovel(true);mouseDownR=false;}
  }else if(player.tool==='build'){
    camera.getWorldDirection(_dir);
    const gr=groundRay(camera.position,_dir,18);
    if(gr){
      const bt=player.buildType;
      const cost=bt===0?G.turretCost:Math.round((bt===1?20:25)*G.buildMul);
      const ok=bt===0?turretSpotOk(gr.point.x,gr.point.z).ok:Math.hypot(gr.point.x,gr.point.z)>8.5;
      ghost.visible=true;
      ghost.scale.set(bt===0?1:1.6,bt===0?1:.5,bt===0?1:.7);
      ghost.position.set(gr.point.x,heightAt(gr.point.x,gr.point.z)+.7,gr.point.z);
      ghost.material.color.set(ok&&G.scrap>=cost?0x9ab35c:0xa3271e);
      if(mouseDownL){
        mouseDownL=false;
        if(G.scrap<cost){toast('NEED '+cost+' SCRAP');SFX.deny();}
        else if(!ok)toast(bt===0?turretSpotOk(gr.point.x,gr.point.z).why:'NOT HERE');
        else{
          G.scrap-=cost;
          if(bt===0){placeTurret(gr.point.x,gr.point.z);toast('TURRET PLACED, ARM IT WITH E');}
          else if(bt===1)placeBag(gr.point.x,gr.point.z,player.yaw);
          else placeWire(gr.point.x,gr.point.z,player.yaw);
        }
      }
    }else ghost.visible=false;
  }
  if(player.tool!=='build')ghost.visible=false;

  muzzle.intensity=Math.max(0,muzzle.intensity-dt*900);
  { // crosshair breathes with the weapon's truth
    const w2=curW();
    const sp2=(player.ads?w2.adsSpread:w2.spread)*G.steadyMul*(player.crouch?.62:1);
    const g2=clamp(sp2*900+vmKick*9+(player.sprint?7:0),2,26);
    $('crosshair').style.setProperty('--g',g2.toFixed(1)+'px');
  }
}

/* ---------------- HUD / minimap ---------------- */
function rankOf(xp){return xp>=45?'VET':xp>=25?'SGT':xp>=12?'CPL':xp>=5?'LCPL':'PVT';}
const SLOT_TAGS=['RIF','SMG','SHG','DMR','LMG','FLM','KNF','BZK'];
function initSlots(){
  const s=$('slots');s.innerHTML='';
  for(let i=0;i<WEAPONS.length;i++){
    const d=document.createElement('div');
    d.className='slot';d.id='slot'+i;
    d.textContent=(i+1)+' '+SLOT_TAGS[i];
    s.appendChild(d);
  }
}
const mapC=$('map').getContext('2d');
const mapBg=document.createElement('canvas');mapBg.width=mapBg.height=170;
function renderMapBg(){
  const c=mapBg.getContext('2d');
  const img=c.createImageData(170,170);
  for(let py=0;py<170;py++)for(let px=0;px<170;px++){
    const wx=(px/170-.5)*TER.size,wz=(py/170-.5)*TER.size;
    const h=heightAt(wx,wz),dug=h-((H0[Math.round((wz+half)/cell)*VN+Math.round((wx+half)/cell)])||0);
    const i=(py*170+px)*4;
    let r,g,b;
    if(isRoad(wx,wz)){r=70;g=64;b=54;}
    else if(dug<-.3){const d=clamp(-dug/3,0,1);r=60-d*25;g=42-d*16;b=26-d*10;}
    else if(dug>.3){r=110;g=92;b=60;}
    else{const k=clamp((h+1.5)/4,0,1);r=52+k*30;g=58+k*30;b=30+k*14;}
    img.data[i]=r;img.data[i+1]=g;img.data[i+2]=b;img.data[i+3]=255;
  }
  c.putImageData(img,0,0);
  mapDirty=false;
}
function drawMap(){
  if(mapDirty)renderMapBg();
  mapC.drawImage(mapBg,0,0);
  const s=170/TER.size,ox=85,oy=85;
  const dot=(x,z,col,r=2.4)=>{mapC.fillStyle=col;mapC.beginPath();
    mapC.arc(ox+x*s,oy+z*s,r,0,TAU);mapC.fill();};
  // the road itself
  mapC.strokeStyle='rgba(201,189,146,.5)';mapC.lineWidth=2;
  mapC.beginPath();
  for(let x=-half;x<=half;x+=8){
    const px=ox+x*s,py=oy+roadZ(x)*s;
    if(x===-half)mapC.moveTo(px,py);else mapC.lineTo(px,py);
  }
  mapC.stroke();
  dot(0,roadZ(0),'#c9bd92',3);
  for(const t of turrets)dot(t.x,t.z,'#7fa0c8',2.6);
  for(const a of allies)dot(a.x,a.z,'#9ab35c',2.6);
  for(const t of aliveTrucks())dot(t.x,roadZ(t.x),'#e8c050',3.4);
  if(CAMP.cache)dot(CAMP.cache.x,CAMP.cache.z,'#9dff70',3);
  for(const zb of zombies)if(zb.alive)dot(zb.x,zb.z,zb.brute?'#ff5030':'#a3271e',zb.brute?3.4:2);
  if(roadBlockedAt!==null)dot(roadBlockedAt,roadZ(roadBlockedAt),'#e8742c',3.6);
  if(WANDER.on){
    for(const L of WANDER.loot)if(!L.taken)dot(L.x,L.z,L.rich?'#e8742c':'#9dff70',2.6);
    for(const s of WANDER.sites)if(!s.used)
      dot(s.x,s.z,s.kind==='hermit'?'#e8c050':s.kind==='quester'?'#d8c878':s.kind==='drifter'?'#9dd8a8':'#7fa0c8',3);
    const q=WANDER.quest;
    if(q&&q.taken&&!q.turned)dot(q.objDone?q.gx:q.x,q.objDone?q.gz:q.z,'#ffd060',3.4);
    if(WANDER.landmark&&!WANDER.landmark.found)dot(WANDER.landmark.x,WANDER.landmark.z,'#9fb4d8',3);
    if(WANDER.den&&!WANDER.den.woken)dot(WANDER.den.x,WANDER.den.z,'#a3271e',3);
  }
  if(BAST.on){
    mapC.strokeStyle='#c9bd92';mapC.lineWidth=2;     // the wall
    mapC.beginPath();mapC.moveTo(ox-24*s,oy-54*s);mapC.lineTo(ox-24*s,oy+54*s);mapC.stroke();
    for(const g of BAST.guns)dot(g.x,g.z,player.man===g?'#ffd080':'#7fa0c8',3);
    dot(6,15,'#9dff70',3.2);                          // the cache
    for(const d of BAST.drops)if(d.landed)dot(d.x,d.z,'#9dff70',2.6);
  }
  mapC.save();
  mapC.translate(ox+player.x*s,oy+player.z*s);
  mapC.rotate(-player.yaw);
  mapC.fillStyle='#f0e8c8';
  mapC.beginPath();mapC.moveTo(0,-4.6);mapC.lineTo(3.2,3.4);mapC.lineTo(-3.2,3.4);mapC.closePath();mapC.fill();
  mapC.restore();
}
function fmt(t){const s=Math.max(0,Math.ceil(t));return Math.floor(s/60)+':'+String(s%60).padStart(2,'0');}
let hbT=0;
function updateHUD(dt){
  const alive=zombies.filter(z=>z.alive).length;
  if(CAMP.on){
    $('waveTxt').textContent=CAMP.mode==='siege'?'THE GATES':'LEG '+CAMP.leg+'/'+CAMP.legCount;
    const l=leadTruck();
    const prog=l?clamp((l.x+half)/(2*half)*100,0,100):0;
    $('waveSub').textContent=CAMP.mode==='siege'
      ?'wave '+CAMP.siegeWave+' of 3 · hostiles: '+(alive+G.spawnLeft)
      :CAMP.nodeName+' · '+Math.round(prog)+'% · hostiles: '+alive;
  }else{
    const wnf=WANDER.on?(0.5-0.5*Math.cos(WANDER.t/150*TAU)):0;
    $('waveTxt').textContent=WANDER.on?(wnf<.25?'MORNING':wnf<.5?'AFTERNOON':wnf<.75?'NIGHTFALL':'DEAD OF NIGHT')
      :BAST.on?(BAST.wave>0?'NIGHT '+BAST.wave:'STAND TO'):(G.wave>0?'WAVE '+G.wave:'PREPARE');
    $('waveSub').textContent=WANDER.on
      ?Math.floor(WANDER.t/60)+'m walked · '+WANDER.loot.filter(L=>!L.taken).length+' caches left · hostiles '+alive
      :G.spawnLeft+alive>0?'hostiles: '+(alive+G.spawnLeft+(G.bruteLeft||0)):'next assault '+Math.ceil(BAST.on?BAST.interT:G.intermission)+'s';
  }
  if(chainT>0){chainT-=dt;if(chainT<=0)chain=0;}
  const ct=$('chainTag');
  ct.style.display=chain>=3?'block':'none';
  if(chain>=3)ct.textContent='CHAIN ×'+chain;
  $('depotLbl').textContent=WANDER.on?'THE COUNTRY':BAST.on?'THE WALL':'CONVOY';
  $('depotPct').textContent=WANDER.on?('SCORE '+G.score):BAST.on?('FORT '+Math.round(G.depotHp/G.depotMax*100)+'% · SHELLS '+BAST.shells):(CAMP.supplies?('F'+CAMP.supplies.food+' · M'+CAMP.supplies.meds+' · MOR '+Math.round(CAMP.morale)):'');
  const bars=$('convoyBars');
  if(BAST.on){
    bars.style.display='';
    if(bars.childElementCount!==1){bars.innerHTML='';
      const d=document.createElement('div');d.className='tbar';
      d.innerHTML='<span class="tn">THE WALL</span><div class="bar depot"><i style="width:100%"></i></div>';
      bars.appendChild(d);}
    const wi2=bars.querySelector('i');
    wi2.style.width=Math.max(0,G.depotHp/G.depotMax*100)+'%';
    wi2.style.background=G.depotHp<300?'#a3271e':'';
  }else bars.style.display=WANDER.on?'none':'';
  if(!BAST.on&&bars.childElementCount!==convoy.length){
    bars.innerHTML='';
    for(const t of convoy){
      const d=document.createElement('div');d.className='tbar';
      d.innerHTML='<span class="tn">'+t.name+'</span><div class="bar depot"><i style="width:100%"></i></div>';
      bars.appendChild(d);
    }
  }
  if(!BAST.on)convoy.forEach((t,i)=>{
    const row=bars.children[i];if(!row)return;
    const bar=row.querySelector('i');
    bar.style.width=Math.max(0,t.hp/t.maxhp*100)+'%';
    bar.style.background=t.alive?(t.hp<t.maxhp*.35?'#a3271e':'#c9bd92'):'#3a2420';
    row.querySelector('.tn').style.color=t.alive?'':'#a3271e';
  });
  const cv=$('convoy');
  if(WANDER.on){cv.textContent=WANDER.quest&&WANDER.quest.taken&&!WANDER.quest.turned
      ?'WORK FOR '+WANDER.quest.giver+(WANDER.quest.objDone?' · BRING IT BACK':' · FOLLOW THE ♦')
      :'THE OPEN COUNTRY OWES YOU NOTHING';cv.className='';}
  else if(BAST.on){cv.textContent='CACHE '+BAST.cache+' RDS · [C] COMMAND NET';cv.className=BAST.cache<60?'alert':'';}
  else if(!aliveTrucks().length){cv.textContent='CONVOY LOST';cv.className='alert';}
  else if(roadBlockedAt!==null){cv.textContent='⚠ ROAD BLOCKED AT '+Math.round(roadBlockedAt)+'m, DIG IT CLEAR';cv.className='alert';}
  else if(CAMP.fixT>0){cv.textContent='⚑ REPAIRS, HOLD '+fmt(CAMP.fixT);cv.className='alert';}
  else if(CAMP.mode==='drive'){cv.textContent=zombies.some(z=>z.alive)?'HALTED, CLEAR THE ROAD':'ROLLING EAST';cv.className='';}
  else if(CAMP.mode==='fall'){cv.textContent='⚑ LOADING: '+CAMP.crates+'/12 CRATES · SAY ROLL AT '+(leadTruck()?leadTruck().name:'THE TRUCKS');cv.className='alert';}
  else{cv.textContent=CAMP.mode==='siege'?'PARKED AT THE GATES':'-';cv.className='';}
  $('hpPct').textContent=Math.ceil(player.hp);
  $('hpBar').style.width=clamp(player.hp,0,100)+'%';
  $('hpBar').style.background=player.hp<30?'#a3271e':'#9ab35c';
  $('vitals').classList.toggle('low',player.hp<30&&player.alive);
  { const rb=$('reloadBar');
    if(player.reloadT>0&&!player.tool){
      const w2=curW();rb.className='on';
      rb.firstElementChild.style.width=(100*(1-player.reloadT/(w2.reload*G.reloadMul)))+'%';
    }else rb.className='';
  }
  $('scrap').textContent=G.scrap;
  $('dirt').textContent=G.dirt;
  $('score').textContent=G.score.toLocaleString();
  const w=curW();
  $('wname').textContent=player.tool==='shovel'?'ENTRENCHING TOOL':
    player.tool==='build'?['TURRET KIT','SANDBAG KIT','BARBED WIRE'][player.buildType]:w.name;
  const magN=player.mags[player.wid],magMax=curW().magSize;
  $('mag').textContent=curW().rocket?(G.items.rocket||0):player.tool?'-':(w.melee?'READY':player.reloadT>0?'--':magN);
  $('mag').style.color=player.tool||player.reloadT>0||w.melee?'':(magN<=magMax*.25?'#e8742c':'');
  $('reserve').textContent=player.tool==='shovel'?'SPOIL '+G.dirt:
    player.tool==='build'?'SCRAP '+G.scrap:
    w.melee?'NO AMMO NEEDED':(w.flame?'FUEL ':'RESERVE ')+player.reserve;
  for(let i=0;i<WEAPONS.length;i++){
    const el=$('slot'+i);
    if(!el)continue;
    el.classList.toggle('sel',player.tool===null&&player.wid===i);
    el.classList.toggle('lock',!player.owned[i]);
  }
  $('consum').innerHTML='G <b>'+G.items.nade+'</b>&ensp;V <b>'+G.items.molotov+
    '</b>&ensp;X <b>'+G.items.mine+'</b>&ensp;H <b>'+G.items.medkit+'</b>&ensp;Z <b>'+G.items.flare+'</b>';
  { // the squad strip
    const sq=$('squad');
    const showSq=allies.length&&(BAST.on||CAMP.mode==='drive'||CAMP.mode==='fall');
    sq.className=showSq?'on':'';
    if(showSq){
      if(sq.childElementCount!==allies.length){sq.innerHTML='';
        for(let i=0;i<allies.length;i++){const d=document.createElement('div');d.className='sqRow';
          d.innerHTML='<div class="sn"></div><div class="sb"><i></i></div>';sq.appendChild(d);}}
      allies.forEach((a,i)=>{const row=sq.children[i];if(!row)return;
        row.querySelector('.sn').innerHTML='<b>'+rankOf(a.xp||0)+'</b> '+a.name+
          (a.down?' ✚'+Math.ceil(a.downT):a.duty==='mortar'?' ⌖':a.duty==='follow'?' ▸':'');
        const am=a.ammo??60;
        row.querySelector('.sb>i').style.width=clamp(am/75*100,0,100)+'%';
        row.className='sqRow'+(a.down?' dry':am<=0?' dry':'');});
    }
  }
  { // the compass: only the wanderer needs to know which way is away
    compassEl.className=WANDER.on?'on':'';
    if(WANDER.on){
      const wrap2=a2=>{let d=a2;while(d>Math.PI)d-=TAU;while(d<-Math.PI)d+=TAU;return d;};
      const heading=player.yaw+Math.PI;
      let html='';
      const put=(ang,label,cls,col)=>{
        const d=wrap2(ang-heading);
        if(Math.abs(d)>1.05)return;
        html+='<div class="'+cls+'" style="left:'+(170+d*-155)+'px;color:'+col+'">'+label+'</div>';
      };
      put(Math.PI,'N','cpsMark','#c9bd92');put(Math.PI/2,'E','cpsMark','#8a8068');
      put(0,'S','cpsMark','#8a8068');put(-Math.PI/2,'W','cpsMark','#8a8068');
      for(const L of WANDER.loot)if(!L.taken)
        put(Math.atan2(L.x-player.x,L.z-player.z),'▾','cpsPoi',L.rich?'#e8742c':'#9dff70');
      if(WANDER.den&&!WANDER.den.woken)
        put(Math.atan2(WANDER.den.x-player.x,WANDER.den.z-player.z),'☠','cpsPoi','#a3271e');
      for(const s2 of WANDER.sites)if(!s2.used)
        put(Math.atan2(s2.x-player.x,s2.z-player.z),
          s2.kind==='hermit'?'⌂':s2.kind==='quester'?'?':s2.kind==='drifter'?'+':'!','cpsPoi',
          s2.kind==='hermit'?'#e8c050':s2.kind==='quester'?'#d8c878':s2.kind==='drifter'?'#9dd8a8':'#7fa0c8');
      const q3=WANDER.quest;
      if(q3&&q3.taken&&!q3.turned){
        const qx=q3.objDone?q3.gx:q3.x,qz=q3.objDone?q3.gz:q3.z;
        put(Math.atan2(qx-player.x,qz-player.z),'♦','cpsPoi','#ffd060');
      }
      if(WANDER.landmark&&!WANDER.landmark.found)
        put(Math.atan2(WANDER.landmark.x-player.x,WANDER.landmark.z-player.z),'✦','cpsPoi','#9fb4d8');
      compassEl.innerHTML=html;
    }
  }
  $('tTorch').classList.toggle('sel',lampOn);
  $('weatherTag').textContent=(wxBlend>.5?WX[wxNext]:WX[wxCur]).id;
  // heartbeat + horde drone
  if(AU.hordeG)AU.hordeG.gain.value=Math.min(.06,alive*.0032);
  if(player.alive&&player.hp<35){
    hbT-=dt;
    if(hbT<=0){hbT=.92;SFX.heartbeat();$('hurt').style.opacity=Math.max(+$('hurt').style.opacity||0,.3);}
  }
  let pr='';
  if(player.alive){
    if(Math.hypot(player.x,player.z-9.5)<11)pr='<b>E</b> RESTOCK AMMO (WAYSTATION: '+G.depotAmmo+')';
    else for(const t of turrets)
      if(Math.hypot(player.x-t.x,player.z-t.z)<3.2){
        pr=player.man&&player.man.ref===t?'<b>E</b> STEP OFF · <b>R</b> LOAD':'<b>E</b> MAN THE GUN ('+t.ammo+' RDS)';break;}
    if(!pr&&BAST.on){
      for(const g of BAST.guns)if(Math.hypot(player.x-g.x,player.z-g.z)<2.6){
        pr=player.man===g?'<b>E</b> STEP OFF':'<b>E</b> MAN THE '+g.type.toUpperCase();break;}
      if(!pr)for(const d of BAST.drops)if(d.landed&&Math.hypot(player.x-d.x,player.z-d.z)<2.6){pr='<b>E</b> RECOVER THE PACKAGE';break;}
      if(!pr&&Math.hypot(player.x-6,player.z-15)<2.8)pr='<b>E</b> DRAW FROM THE CACHE ('+BAST.cache+')';
      if(!pr&&Math.hypot(player.x,player.z-9.5)<5)pr='<b>E</b> REPAIR THE WALL (30 SCRAP · +100)';
    }
    if(!pr&&WANDER.on){
      for(const s of WANDER.sites)if(!s.used&&Math.hypot(player.x-s.x,player.z-s.z)<3.4){
        pr=s.kind==='hermit'?'<b>E</b> SIT AT THE HERMIT\'S FIRE':
           s.kind==='quester'?'<b>E</b> HEAR THEM OUT':
           s.kind==='drifter'?'<b>E</b> SHARE THE DRIFTER\'S FIRE':'<b>E</b> REACH THEM IN TIME';break;}
      if(!pr&&WANDER.quest&&WANDER.quest.taken&&!WANDER.quest.objDone&&WANDER.quest.type==='fetch'
        &&Math.hypot(player.x-WANDER.quest.x,player.z-WANDER.quest.z)<3)pr='<b>E</b> TAKE WHAT THEY ASKED FOR';
      if(!pr&&WANDER.landmark&&WANDER.landmark.kind==='bell'&&!WANDER.landmark.rung
        &&Math.hypot(player.x-WANDER.landmark.x,player.z-WANDER.landmark.z)<4.5)pr='<b>E</b> RING IT. GO ON.';
      if(!pr)for(const L of WANDER.loot)if(!L.taken&&Math.hypot(player.x-L.x,player.z-L.z)<2.6){pr='<b>E</b> CRACK THE CACHE';break;}
    }
    if(!pr&&!BAST.on)for(const t of aliveTrucks())
      if(Math.hypot(player.x-t.x,player.z-roadZ(t.x))<4.4){
        pr=player.ride===t?'<b>E</b> DISMOUNT':'<b>E</b> '+(t.gun?'MAN THE GUN ON ':'RIDE ')+t.name;
        break;
      }
    if(!pr)for(const a of allies)
      if(Math.hypot(player.x-a.x,player.z-a.z)<3){
        pr=a.down?'<b>E</b> GET '+a.name.toUpperCase()+' UP ('+Math.ceil(a.downT)+'s)':'<b>E</b> SPEAK WITH '+a.name.toUpperCase()+(a.dmgMul>1?' ✚':'');
        break;
      }
    if(!pr&&player.tool==='shovel')pr='<b>LMB</b> DIG &nbsp;·&nbsp; <b>RMB</b> PILE ('+G.dirt+' SPOIL)';
  }
  $('prompt').innerHTML=pr;
  if(toastT>0){toastT-=dt;if(toastT<=0)$('hint').style.color='';}
  else{
    G.hintT-=dt;
    if(G.hintT<=0){G.hintT=9;
      const pool=BAST.on?[
        'C OPENS THE COMMAND NET, ORDERS GO TO THE NEAREST RIFLEMAN',
        'THE MORTAR CAN BE CREWED BY A SOLDIER, ORDER 2 ON THE NET',
        'SPARROW DROPS FEED THE CACHE, THE CACHE FEEDS EVERYONE',
        'DIG THE MOAT DEEPER BETWEEN NIGHTS, THE DEAD CLIMB BADLY',
        'MAN A WALL GUN WITH E, FEED IT WITH R',
      ]:HINTS;
      $('hint').textContent=pool[G.hintI%pool.length];G.hintI++;}
  }
  if(annT>0){annT-=dt;if(annT<=0){$('announce').style.opacity=0;$('announce').classList.remove('on');document.body.classList.remove('cine');}}
}

/* ============================================================
   THE BASTION, a night that does not end
   one front · earthworks · artillery · the helicopter
   ============================================================ */
const mortarRing=new THREE.Mesh(new THREE.TorusGeometry(3.2,.12,6,28),
  new THREE.MeshBasicMaterial({color:0xff8838,transparent:true,opacity:.55,
    blending:THREE.AdditiveBlending,depthWrite:false}));
mortarRing.rotation.x=-Math.PI/2;mortarRing.visible=false;scene.add(mortarRing);
const BAST={on:false,wave:0,shells:0,cache:0,heliT:30,drops:[],guns:[],heli:null,rotorG:null,interT:0};
function buildGunMesh(type){
  const g=new THREE.Group();
  const iron=new THREE.MeshStandardMaterial({color:0x2c2e26,roughness:.35,metalness:.75,envMapIntensity:1.2});
  if(type==='mortar'){
    const plate=new THREE.Mesh(new THREE.CylinderGeometry(.55,.65,.16,16),iron);plate.position.y=.08;g.add(plate);
    const tube=new THREE.Mesh(new THREE.CylinderGeometry(.13,.16,1.5,14),iron);
    tube.rotation.x=-.9;tube.position.set(0,.75,-.25);g.add(tube);
    const leg=new THREE.Mesh(new THREE.CylinderGeometry(.04,.04,1.1,5),iron);
    leg.rotation.x=.7;leg.position.set(0,.55,.4);g.add(leg);
  }else{
    for(const sx of[-1,1]){
      const wheel=new THREE.Mesh(new THREE.CylinderGeometry(.6,.6,.14,12),
        new THREE.MeshStandardMaterial({color:0x4a3a26,map:woodTex,roughness:.9}));
      wheel.rotation.z=Math.PI/2;wheel.position.set(sx*.65,.6,0);g.add(wheel);
    }
    const barrel=new THREE.Mesh(new THREE.CylinderGeometry(.11,.17,2.3,14),iron);
    barrel.rotation.x=Math.PI/2-.06;barrel.position.set(0,.85,-.6);g.add(barrel);
    const carriage=new THREE.Mesh(new THREE.BoxGeometry(.5,.25,1.6),
      new THREE.MeshStandardMaterial({color:0x4a3a26,map:woodTex,roughness:.85}));
    carriage.position.set(0,.55,.3);g.add(carriage);
  }
  g.traverse(o=>{if(o.isMesh)o.castShadow=true;});
  scene.add(g);return g;
}
function buildFort(){
  // the great berm: raised with the same shovels that dig the graves
  for(let pass=0;pass<6;pass++)
    for(let z=-58;z<=58;z+=3.5)
      modifyTerrain(-24,z,5.5,.55);
  // the moat: dug before the first night, deep enough to slow a tide
  for(let pass=0;pass<4;pass++)
    for(let z=-56;z<=56;z+=3.5){
      if(Math.abs(z-roadZ(-33))<5)continue;
      modifyTerrain(-33,z,4.5,-.6);
    }
  // crest bags
  for(let z=-54;z<=54;z+=2.6){
    if(Math.abs(z-roadZ(-24))<4.5)continue;       // the gate stays open
    const b=new THREE.Mesh(bagGeo,bagMat);
    b.scale.set(1.35,1,.8);
    b.position.set(-24+rand(-.4,.4),heightAt(-24,z)+.18,z);
    b.rotation.y=rand(-.2,.2);b.castShadow=true;
    setpieces.add(b);
  }
  // the field remembers: craters, an abandoned trench line, the convoy that never arrived
  for(let i=0;i<14;i++){
    const cx=srand(-105,-42),cz=srand(-60,60);
    if(Math.abs(cz-roadZ(cx))<6)continue;
    modifyTerrain(cx,cz,srand(2.6,4.6),-1.2);
  }
  { // the old line: a zigzag trench someone else dug, and lost
    let tz2=srand(-30,30);
    for(let tx=-72;tx<-48;tx+=4){
      tz2+=srand(-5,5);
      for(let p2=0;p2<3;p2++)modifyTerrain(tx,tz2,3.4,-.5);
    }
  }
  { // two charred hulks on the road, nose west: somebody ran for it
    const charM2=new THREE.MeshStandardMaterial({color:0x14110d,roughness:1});
    for(const hx of[-86,-78]){
      const hz=roadZ(hx)+srand(-1.5,1.5);
      const hulk=new THREE.Group();
      const cab2=new THREE.Mesh(new THREE.BoxGeometry(2,1.5,2),charM2);cab2.position.set(0,1.2,-2);
      const bed2=new THREE.Mesh(new THREE.BoxGeometry(2.1,1.1,4),charM2);bed2.position.set(0,.9,.8);
      const rib=new THREE.Mesh(new THREE.CylinderGeometry(.05,.05,2.4,5),charM2);
      rib.rotation.z=.4;rib.position.set(.4,2,.6);
      hulk.add(cab2,bed2,rib);
      for(const[wx2,wz2]of[[-1.1,-2],[1.1,-2],[-1.1,1.6],[1.1,1.6]]){ // burned to the rims
        const wh2=new THREE.Mesh(new THREE.CylinderGeometry(.5,.5,.34,14),charM2);
        wh2.rotation.z=Math.PI/2;wh2.position.set(wx2,.5,wz2);hulk.add(wh2);
      }
      hulk.traverse(o=>{if(o.isMesh)o.castShadow=true;});
      hulk.position.set(hx,heightAt(hx,hz),hz);
      hulk.rotation.y=Math.PI/2+srand(-.5,.5);hulk.rotation.z=srand(-.08,.08);
      setpieces.add(hulk);
      COLLIDERS.push({x:hx,z:hz,r:2.6});
    }
    addFirePatch(-82,roadZ(-82)+2,1,9999); // one of them still smolders
  }
  { // sparrow 2: the drop that did not make it home
    const wreckM=new THREE.MeshStandardMaterial({color:0x1a1d16,roughness:.9,metalness:.3});
    const w2=new THREE.Group();
    const body2=new THREE.Mesh(new THREE.CylinderGeometry(.85,.6,4.2,14),wreckM);
    body2.rotation.x=Math.PI/2;body2.rotation.z=.5;w2.add(body2);
    const tail2=new THREE.Mesh(new THREE.CylinderGeometry(.16,.3,3,10),wreckM);
    tail2.rotation.x=Math.PI/2-.4;tail2.position.set(.6,1,3);w2.add(tail2);
    const blade=new THREE.Mesh(new THREE.BoxGeometry(.3,7,.06),wreckM);
    blade.rotation.z=.4;blade.position.set(-1.4,2.4,-.5);w2.add(blade);  // one blade planted in the earth
    w2.traverse(o=>{if(o.isMesh)o.castShadow=true;});
    const sx2=srand(-70,-50),sz2=srand(20,50)*(srnd()<.5?-1:1);
    w2.position.set(sx2,heightAt(sx2,sz2)+.5,sz2);
    w2.rotation.y=srand(TAU);
    setpieces.add(w2);
    COLLIDERS.push({x:sx2,z:sz2,r:2.8});
    addFirePatch(sx2+1.5,sz2,0.8,9999);
  }
  { // a farmhouse shell mid-field: the horde splits around it, riflemen love it
    const brick2=new THREE.MeshStandardMaterial({color:0xa89684,roughness:.95,
      map:brickTex,bumpMap:brickTex,bumpScale:.35});
    const rx=srand(-75,-58),rz=srand(-38,38);
    if(Math.abs(rz-roadZ(rx))>10){
      for(const[ox,oz,w3,ry2]of[[0,0,7,0],[3.6,3,6,Math.PI/2],[-3.6,2,4,Math.PI/2]]){
        const h3=srand(2,3.4);
        const wall3=new THREE.Mesh(new THREE.BoxGeometry(w3,h3,.5),brick2);
        wall3.position.set(rx+ox,heightAt(rx+ox,rz+oz)+h3/2,rz+oz);
        wall3.rotation.y=ry2;wall3.castShadow=true;wall3.receiveShadow=true;
        setpieces.add(wall3);
        COLLIDERS.push({x:rx+ox,z:rz+oz,r:Math.max(2,w3*.4)});
      }
    }
  }
  // braziers along the wall: the night is watching back
  for(const bz of[-40,-20,20,40]){
    addFirePatch(-23,bz,1.2,9999);
  }
  // abatis: a hedge of sharpened stakes down the western slope
  {
    const stakeM=new THREE.MeshStandardMaterial({color:0x3e3122,map:woodTex,roughness:.95});
    const stakes=new THREE.InstancedMesh(new THREE.CylinderGeometry(.02,.09,2.6,5),stakeM,90);
    const M=new THREE.Matrix4(),Q=new THREE.Quaternion(),E=new THREE.Euler(),P=new THREE.Vector3(),S=new THREE.Vector3(1,1,1);
    let si=0;
    for(let z=-52;z<=52&&si<90;z+=rand(1.6,3)){
      if(Math.abs(z-roadZ(-24))<5)continue;
      E.set(0,rand(TAU),-1.05+rand(-.15,.15));Q.setFromEuler(E);
      P.set(-28.5+rand(-1,1),heightAt(-28.5,z)+.7,z);
      M.compose(P,Q,S);stakes.setMatrixAt(si++,M);
    }
    stakes.count=si;stakes.castShadow=true;setpieces.add(stakes);
  }
  // the searchlight: one long white finger reading the dark
  {
    const pole=new THREE.Mesh(new THREE.CylinderGeometry(.09,.12,5,6),
      new THREE.MeshStandardMaterial({color:0x3a342a,roughness:.6,metalness:.4}));
    pole.position.set(-22,heightAt(-22,roadZ(-24)+7)+2.5,roadZ(-24)+7);
    pole.castShadow=true;setpieces.add(pole);
    const housing=new THREE.Mesh(new THREE.CylinderGeometry(.34,.42,.6,8),pole.material);
    housing.rotation.z=Math.PI/2-.3;
    housing.position.copy(pole.position).y+=2.7;setpieces.add(housing);
    const beamG=new THREE.CylinderGeometry(.35,5.5,120,12,1,true);
    beamG.translate(0,-60,0);beamG.rotateX(-Math.PI/2);
    BAST.beam=new THREE.Mesh(beamG,new THREE.ShaderMaterial({
      transparent:true,blending:THREE.AdditiveBlending,depthWrite:false,side:THREE.DoubleSide,
      uniforms:{time:{value:0},glow:{value:.03}},
      vertexShader:`varying vec2 vUv;varying vec3 vN,vV;
        void main(){vUv=uv;vN=normalize(normalMatrix*normal);
          vec4 mv=modelViewMatrix*vec4(position,1.);vV=normalize(-mv.xyz);
          gl_Position=projectionMatrix*mv;}`,
      fragmentShader:`varying vec2 vUv;varying vec3 vN,vV;uniform float time;uniform float glow;
        float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
        float vnoise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);
          return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),
                     mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x),f.y);}
        void main(){
          // soft cylinder silhouette: full through the middle, gone at the rim
          float edge=pow(abs(dot(normalize(vN),normalize(vV))),1.5);
          float along=vUv.y;                 // 1 at the lamp, 0 at the far end
          // dust riding the beam, two layers drifting toward the dark
          float d1=vnoise(vec2(vUv.x*7.,along*30.+time*.6));
          float d2=vnoise(vec2(vUv.x*15.+7.,along*58.-time*.95));
          float dust=max(d1*.6+d2*.4-.38,0.)*2.4;
          float a=(glow*(.55+.45*along)+glow*1.8*dust)*edge;
          a*=.93+.07*sin(time*46.);          // the arc lamp breathes
          gl_FragColor=vec4(vec3(1.,.95,.84),a);
        }`}));
    BAST.beam.position.copy(housing.position);
    scene.add(BAST.beam);
    const sl=new THREE.SpotLight(0xfff2d8,900,150,.11,.45,1.4);
    sl.position.copy(housing.position);
    scene.add(sl);scene.add(sl.target);
    BAST.search=sl;
  }
  // banners at the gate, signal-orange, telling the dark whose wall this is
  for(const gs of[-1,1]){
    const bp=new THREE.Mesh(new THREE.CylinderGeometry(.07,.09,5.6,6),
      new THREE.MeshStandardMaterial({color:0x4a3a26,map:woodTex,roughness:.9}));
    const bz=roadZ(-24)+gs*5.2;
    bp.position.set(-24,heightAt(-24,bz)+2.8,bz);bp.castShadow=true;setpieces.add(bp);
    const bm=new THREE.MeshStandardMaterial({color:0xe8742c,side:THREE.DoubleSide,roughness:.9});
    clothWave(bm,.2);
    const banner=new THREE.Mesh(new THREE.PlaneGeometry(1.7,1,12,6),bm);
    banner.position.set(-23.1,heightAt(-24,bz)+4.9,bz);
    setpieces.add(banner);
  }
  // the gate itself: three courses of bags across the causeway. they will not hold forever.
  for(const gz of[-2.2,0,2.2])placeBag(-24,roadZ(-24)+gz,Math.PI/2);
  BAST.guns=[
    {type:'mortar',x:-12,z:9.5,cd:0,mesh:buildGunMesh('mortar')},
    {type:'cannon',x:-24,z:-16,cd:0,mesh:buildGunMesh('cannon')},
    {type:'cannon',x:-24,z:30,cd:0,mesh:buildGunMesh('cannon')},
  ];
  for(const g of BAST.guns){
    g.mesh.position.set(g.x,heightAt(g.x,g.z),g.z);
    g.mesh.rotation.y=Math.PI/2;          // muzzles toward the west, where they come from
    if(g.type==='mortar'){
      g.mesh.scale.setScalar(1.3);
      for(const co of[[-1.3,.4],[1.2,-.6]]){
        const crate=new THREE.Mesh(new THREE.BoxGeometry(.7,.5,.5),
          new THREE.MeshStandardMaterial({color:0x4a4d3a,map:woodTex,roughness:.85}));
        crate.position.set(g.x+co[0],heightAt(g.x,g.z)+.25,g.z+co[1]);
        crate.castShadow=true;setpieces.add(crate);
      }
    }
    COLLIDERS.push({x:g.x,z:g.z,r:.9});
  }
  // the cache: a crate you will learn to sprint to
  const cache=new THREE.Mesh(new THREE.BoxGeometry(1.6,1.1,1.1),
    new THREE.MeshStandardMaterial({color:0x5d6243,map:woodTex,roughness:.8}));
  cache.position.set(6,heightAt(6,15)+.55,15);cache.castShadow=true;
  setpieces.add(cache);
  // the helicopter, asleep until needed
  const heli=new THREE.Group();
  const body=new THREE.Mesh(new THREE.CylinderGeometry(.9,.7,4.6,8),
    new THREE.MeshStandardMaterial({color:0x3a4232,roughness:.6,metalness:.4}));
  body.rotation.x=Math.PI/2;heli.add(body);
  const tail=new THREE.Mesh(new THREE.CylinderGeometry(.18,.32,3.4,6),body.material);
  tail.rotation.x=Math.PI/2;tail.position.z=3.6;heli.add(tail);
  const rotor=new THREE.Mesh(new THREE.BoxGeometry(9,.06,.32),
    new THREE.MeshStandardMaterial({color:0x1a1c14,roughness:.5}));
  rotor.position.y=1;heli.add(rotor);heli.userData.rotor=rotor;
  const navM=new THREE.MeshBasicMaterial();navM.color.setRGB(8,.6,.4);
  const nav=new THREE.Mesh(new THREE.SphereGeometry(.09,6,5),navM);
  nav.position.set(0,-.4,3.4);heli.add(nav);heli.userData.nav=nav;
  heli.visible=false;scene.add(heli);
  BAST.heli=heli;
}
function cleanupModes(){ // no mode inherits another's furniture
  for(const g of (BAST.guns||[])){if(g.mesh)scene.remove(g.mesh);}
  BAST.guns=[];
  if(BAST.search){scene.remove(BAST.search.target);scene.remove(BAST.search);BAST.search=null;}
  if(BAST.beam){scene.remove(BAST.beam);BAST.beam=null;}
  for(const d of (BAST.drops||[]))scene.remove(d.mesh);
  BAST.drops=[];BAST.heli&&(BAST.heli.visible=false);
  if(BAST.rotorG){try{BAST.rotorG.o.stop()}catch(e){};BAST.rotorG=null;}
  for(const o of (WANDER._meshes||[]))scene.remove(o);
  WANDER._meshes=[];WANDER.loot=[];WANDER.on=false;BAST.on=false;
  for(const b of bags)scene.remove(b.mesh);bags.length=0;
  for(const w of wires)scene.remove(w.mesh);wires.length=0;
  for(const t of turrets)scene.remove(t.mesh);turrets.length=0;
  for(const f of firePool){f.live=false;f.material.opacity=0;}
  zombies.length=0;player.man=null;player.ride=null;for(const r of ROCKETS)if(r.mesh)r.mesh.visible=false;ROCKETS.length=0;
  mortarRing.visible=false;beacon.visible=false;
}
function saveBastion(){
  if(!BAST.on)return;
  try{localStorage.setItem('tlr_bastion_run',JSON.stringify({v:1,
    runSeed:BAST.runSeed,wave:BAST.wave,cache:BAST.cache,shells:BAST.shells,
    depotHp:G.depotHp,scrap:G.scrap,kills:G.kills,score:G.score,items:G.items,
    p:{hp:player.hp,maxhp:player.maxhp,reserve:player.reserve,wid:player.wid,
       owned:player.owned,mags:player.mags},
    crew:allies.map(a=>({name:a.name,xp:a.xp||0,ammo:a.ammo??55,post:a.post?a.post.z:null})),
  }));}catch(e){}
}
function startBastion(load){
  audioInit();if(AU.ctx&&AU.ctx.state==='suspended')AU.ctx.resume();
  cleanupModes();
  CAMP.on=false;BAST.on=true;
  CAMP.comps=[];CAMP.heirlooms=[];CAMP.mode='menu';
  $('roster').classList.remove('on');
  let sv=null;
  if(load){try{sv=JSON.parse(localStorage.getItem('tlr_bastion_run'));}catch(e){}}
  Object.assign(BAST,{wave:sv?sv.wave:0,shells:sv?sv.shells:8,cache:sv?sv.cache:240,
    heliT:34,drops:[],interT:sv?9:5,lastStand:false,rally:false,breachT:0,cleared:false,
    runSeed:sv?sv.runSeed:((Math.random()*2**31)|0)});
  setSeed(BAST.runSeed);
  setBiome(BIOMES[Math.floor(srnd()*BIOMES.length)]);  // tonight's theater, drawn from the deck
  buildWorld((BAST.runSeed^0x9e3779b9)>>>0);
  setSeed((BAST.runSeed^0x51ed2701)>>>0);   // the fort dresses the same way every time
  buildFort();
  Object.assign(G,{state:'play',wave:0,kills:0,score:0,scrap:60,dirt:0,
    items:{nade:3,molotov:1,mine:2,medkit:1,flare:2,rocket:2},
    dmgMul:1,reloadMul:1,speedMul:1,scrapMul:1,steadyMul:1,
    turretCost:60,buildMul:1,turretCap:120,pocketsLvl:0,shots:0,hits:0,
    depotHp:1000,depotMax:1000,depotAmmo:0,spawnLeft:0,bruteLeft:0,intermission:6});
  Object.assign(player,{x:-14,z:roadZ(-14)+2,y:0,vy:0,yaw:Math.PI/2,pitch:-.02,
    hp:100,maxhp:100,alive:true,reserve:90,carryCap:180,
    wid:0,owned:defaultOwned(),
    mags:defaultMags(),tool:null,buildType:0,healT:0,
    fireCd:0,reloadT:0,respawnT:0,ads:false,fireHeld:false,ride:null,man:null});
  if(sv){
    G.scrap=sv.scrap;G.kills=sv.kills;G.score=sv.score;G.items=sv.items;G.depotHp=sv.depotHp;
    Object.assign(player,{hp:sv.p.hp,maxhp:sv.p.maxhp,reserve:sv.p.reserve,
      wid:sv.p.wid,owned:sv.p.owned,mags:sv.p.mags});
  }
  zombies.length=0;
  for(const t of convoy)t.mesh.visible=false;
  for(const a of allies)scene.remove(a.mesh);allies.length=0;
  if(sv&&sv.crew&&sv.crew.length){ // the same crew, the same posts, the same debts
    for(const c of sv.crew){
      const a=spawnAlly(-22,c.post??0);
      if(a){a.name=c.name;a.xp=c.xp;a.ammo=c.ammo;
        if(c.post!==null)a.post={x:-22.5,z:c.post};}
    }
  }else for(const pz of[-32,-12,16,34]){   // the wall crew, each with a post and a finite belt
    const a=spawnAlly(-22,pz);
    if(a){a.post={x:-22.5,z:pz};a.ammo=55+Math.floor(Math.random()*20);}
  }
  $('start').classList.remove('show');$('gameover').classList.remove('show');
  $('hud').classList.add('on');
  initSlots();refreshVM();
  announce('THE BASTION · '+BIOME.name.toUpperCase(),'they come from the west. the wall is yours.');
  tryLock();
}
function bastionWave(){
  BAST.wave++;G.wave=Math.min(14,1+BAST.wave);
  G.spawnLeft=Math.round((14+BAST.wave*5)*(BAST.mod==='swarm'?1.7:1));
  G.bruteLeft=BAST.wave%4===0?Math.ceil(BAST.wave/4):0;
  BAST.colossus=BAST.wave%10===0;
  if(BAST.colossus)G.bruteLeft=Math.max(1,G.bruteLeft);
  else if(BAST.mod==='swarm')G.bruteLeft=0;   // the swarm is numbers, nothing else
  G.spawnT=.5;
  BAST.mod=BAST.planned??((BAST.wave>=3&&BAST.wave%3===0)?pick(['moon','tide','fog','swarm']):null);
  BAST.planned=null;
  if(BAST.mod==='fog'){wxNext=2;wxBlend=0;wxTimer=60;}
  SFX.waveHorn();
  if(BAST.wave%10===0){SFX.colossus();flashT=Math.max(flashT,.3);}
  announce(BAST.wave%10===0?'NIGHT '+BAST.wave+' · IT WALKS':'NIGHT '+BAST.wave,
    BAST.wave%10===0?'the trees are not falling. they are being stepped over.':
    BAST.mod==='moon'?'runners\' moon: they are coming fast and screaming':
    BAST.mod==='tide'?'the crawling tide: watch the grass, not the horizon':
    BAST.mod==='fog'?'dead fog: you will hear them before you see them':
    BAST.wave%4===0?'the ground west of the wall is moving wrong':'stand to the parapet');
  // the wall mends a little between assaults; so do its people
  G.depotHp=Math.min(G.depotMax,G.depotHp+40);
  player.hp=Math.min(player.maxhp,player.hp+25);
  for(const a of allies)a.hp=a.maxhp;
  G.score+=BAST.wave*50;
  if(BAST.wave%5===0&&allies.length<4){
    const taken=allies.map(a=>a.post&&a.post.z);
    const free=[-32,-12,16,34].find(z=>!taken.includes(z))??0;
    const a=spawnAlly(6,15);
    if(a){a.post={x:-22.5,z:free};a.ammo=70;
      say('SPARROW 3','Dropping you a rifleman with the next pass. Treat them better than the last wall did.',5200);}
  }
}
function bastionUpdate(dt){
  // marching spawns, west only
  if(G.spawnLeft>0||G.bruteLeft>0){
    G.spawnT-=dt;
    if(G.spawnT<=0){
      G.spawnT=clamp(1.1-BAST.wave*.05,.25,1.1);
      const kind=G.bruteLeft>0&&Math.random()<.2?(G.bruteLeft--,(BAST.colossus?(BAST.colossus=false,'colossus'):'brute'))
        :(G.spawnLeft--,BAST.mod==='moon'?'runner':BAST.mod==='tide'?(Math.random()<.6?'crawler':null):null);
      for(let sp2=0;sp2<2&&(G.spawnLeft>0||kind);sp2++){
        const k2=sp2===0?kind:(G.spawnLeft>0?(G.spawnLeft--,null):'__skip');
        if(k2==='__skip')break;
        const z=spawnZombie(k2);
        if(z){
          const nearField=BAST.mod==='tide'||BAST.mod==='fog';
          z.x=nearField?rand(-70,-44):-half+rand(4,16);
          z.march=!nearField;
          z.z=clamp(roadZ(z.x)+rand(-46,46),-half+8,half-8);
          z.rise=nearField?rand(1.2,2):rand(.4,1);
        }
      }
    }
  }else if(!zombies.some(z=>z.alive)){
    if(!BAST.cleared&&BAST.wave>0){
      BAST.cleared=true;SFX.chime();
      if(BAST.wave%10===0){BAST.shells+=6;BAST.cache+=120;
        announce('NIGHT '+BAST.wave+' HELD','it fell. sparrow sends six shells out of respect.');}
      else{
        const sn=BAST.snap||{k:0,hp:G.depotHp,sh:0,crew:allies.length};
        const dHp=Math.max(0,Math.round(sn.hp-G.depotHp));
        announce('NIGHT '+BAST.wave+' HELD',
          (G.kills-sn.k)+' put down · wall took '+dHp+' · '+(G.shots-sn.sh)+' rounds spent · '
          +allies.length+' on the wall'+(allies.length<sn.crew?' · we are fewer':''));
      }
      saveBastion();
      const nw=BAST.wave+1;
      BAST.planned=(nw>=3&&nw%3===0)?pick(['moon','tide','fog','swarm']):null;
      if(BAST.planned)setTimeout(()=>say('LOOKOUT',{
        moon:'Next push looks fast. Lean shapes, long strides. Runners.',
        tide:'The grass is wrong out there. They\'re already inside the field. Watch your feet.',
        fog:'Weather\'s turning. Next one comes blind. Trust the searchlight.',
        swarm:'Horizon\'s moving. All of it. No big ones, just... all of it. Feed the guns.'}[BAST.planned],5200),2600);
    }
    if(BAST.cleared&&BAST.wave>0&&BAST.wave%3===0&&!BAST.reqDone){
      BAST.reqDone=true;bastionRequisition();
    }
    BAST.interT-=dt;
    if(BAST.interT<=0){BAST.interT=8;BAST.cleared=false;BAST.reqDone=false;bastionWave();}
  }
  // the helicopter
  BAST.heliT-=dt;
  if(BAST.heliT<=0&&!BAST.heli.visible&&!BAST.sparrowDown&&BAST.wave>=6&&BAST.wave<=9&&Math.random()<.5){
    // one run, the sky answers back
    BAST.sparrowDown=true;BAST.heli.visible=true;BAST.heli.userData.dying=true;
    BAST.heli.position.set(-6,30,-150);
    say('SPARROW 3','Sparrow inbound... wait. Tracking fire? Who is shooting, who is...',5200);
  }
  if(BAST.heli.visible&&BAST.heli.userData.dying){
    BAST.heli.position.z+=30*dt;
    BAST.heli.position.y-=7.5*dt;
    BAST.heli.position.x-=9*dt;
    BAST.heli.userData.rotor.rotation.y+=dt*16;
    if(Math.random()<dt*18)puffSmoke(BAST.heli.position.clone(),true);
    if(BAST.heli.position.y<=heightAt(BAST.heli.position.x,BAST.heli.position.z)+1.5){
      const cx=BAST.heli.position.x,cz2=BAST.heli.position.z;
      BAST.heli.visible=false;BAST.heli.userData.dying=false;BAST.heliT=70;
      explode(cx,heightAt(cx,cz2)+1,cz2,7,80,1.2);
      addFirePatch(cx,cz2,2.6,9999);
      const crate=new THREE.Mesh(new THREE.BoxGeometry(1.2,.9,1.2),
        new THREE.MeshStandardMaterial({color:0x6b6f4a,map:woodTex}));
      crate.position.set(cx+rand(-3,3),heightAt(cx,cz2)+.45,cz2+rand(-3,3));
      crate.castShadow=true;scene.add(crate);
      const flare=new THREE.Mesh(new THREE.CylinderGeometry(.25,.45,10,7,1,true),
        new THREE.MeshBasicMaterial({color:0xff8050,transparent:true,opacity:.18,
          blending:THREE.AdditiveBlending,depthWrite:false,side:THREE.DoubleSide}));
      flare.position.y=5;crate.add(flare);
      BAST.drops.push({mesh:crate,x:crate.position.x,z:crate.position.z,vy:0,landed:true,salvage:true});
      announce('SPARROW IS DOWN','her whole load survived the fall. it lies in the open, west of the wall.');
      if(AU.ctx&&BAST.rotorG){try{BAST.rotorG.o.stop()}catch(e){};BAST.rotorG=null;}
    }
    return;
  }
  if(BAST.heliT<=0&&!BAST.heli.visible){
    BAST.heli.visible=true;BAST.heli.position.set(-6,30,-150);
    say('SPARROW 3','Sparrow inbound from the south. Watch for the chute.');
    if(AU.ctx&&!BAST.rotorG){const o=AU.ctx.createOscillator();o.type='sawtooth';o.frequency.value=26;
      const g2=AU.ctx.createGain();g2.gain.value=.05;const f=AU.ctx.createBiquadFilter();f.type='lowpass';f.frequency.value=180;
      o.connect(f);f.connect(g2);g2.connect(AU.master);o.start();BAST.rotorG={o,g:g2};}
  }
  if(BAST.heli.visible){
    BAST.heli.position.z+=34*dt;
    BAST.heli.userData.rotor.rotation.y+=dt*30;
    if(Math.abs(BAST.heli.position.z-9)<6&&!BAST.dropDone){
      BAST.dropDone=true;
      const dx=rand(-10,14),dz=rand(-6,26);
      const crate=new THREE.Mesh(new THREE.BoxGeometry(1,.8,1),
        new THREE.MeshStandardMaterial({color:0x6b6f4a,map:woodTex}));
      const chute=new THREE.Mesh(new THREE.ConeGeometry(1.6,1.4,8,1,true),
        new THREE.MeshStandardMaterial({color:0xc9bd92,side:THREE.DoubleSide,roughness:1}));
      chute.position.y=1.6;crate.add(chute);crate.position.set(dx,28,dz);
      crate.castShadow=true;scene.add(crate);
      BAST.drops.push({mesh:crate,x:dx,z:dz,vy:0,landed:false});
    }
    if(BAST.heli.position.z>150){
      BAST.heli.visible=false;BAST.dropDone=false;BAST.heliT=rand(38,55);
      if(BAST.rotorG){try{BAST.rotorG.o.stop()}catch(e){};BAST.rotorG=null;}
    }
  }
  for(const d of BAST.drops){
    if(d.landed)continue;
    d.vy=Math.min(d.vy+dt*3,5.5);
    d.mesh.position.y-=d.vy*dt;
    const gy=heightAt(d.x,d.z)+.4;
    if(d.mesh.position.y<=gy){d.mesh.position.y=gy;d.landed=true;
      if(d.mesh.children[0])d.mesh.remove(d.mesh.children[0]);
      const flare=new THREE.Mesh(new THREE.CylinderGeometry(.22,.4,9,7,1,true),
        new THREE.MeshBasicMaterial({color:0x9dff70,transparent:true,opacity:.16,
          blending:THREE.AdditiveBlending,depthWrite:false,side:THREE.DoubleSide}));
      flare.position.y=4.6;d.mesh.add(flare);
      SFX.thud();say('SPARROW 3','Package down. Go get it before they do.');}
  }
  if(BAST.search){
    if(player.man){ // the light crew follows the gunner's eye
      camera.getWorldDirection(_dir);
      const gr3=groundRay(camera.position,_dir,140);
      if(gr3)BAST.search.target.position.lerp(gr3.point,Math.min(1,dt*4));
    }else{
      BAST.searchA=(BAST.searchA||0)+dt*.32;
      BAST.search.target.position.set(-85,0,Math.sin(BAST.searchA)*60+9.5);
    }
    BAST.search.intensity=850+Math.sin((BAST.searchA||0)*7)*120;
    if(BAST.beam){
      BAST.beam.lookAt(BAST.search.target.position);
      BAST.beam.material.uniforms.glow.value=.022+CAMP.nf*.025;
      BAST.beam.material.uniforms.time.value=elapsed;
    }
  }
  if(BAST.heli.visible&&BAST.heli.userData.nav)
    BAST.heli.userData.nav.material.color.setScalar(Math.floor(performance.now()/350)%2?6:0.4);
  // one pass over the dead, however many they are
  let thick=0,overWall=0;
  for(const z of zombies){if(!z.alive)continue;thick++;if(z.rise<=0&&z.x>-22)overWall++;}
  if(thick>8){
    BAST.drumT=(BAST.drumT||0)-dt;
    if(BAST.drumT<=0){
      BAST.drumT=Math.max(.55,1.3-thick*.012);
      sTone('sine',46,38,.22,Math.min(.3,.1+thick*.004));
      if(Math.random()<.3)sTone('sine',62,50,.16,.08);
    }
  }
  // breach watch: anything east of the wall gets called by name
  BAST.breachT=Math.max(0,(BAST.breachT||0)-dt);
  if(BAST.breachT<=0){
    const over=overWall;
    if(over>0){BAST.breachT=8;
      say('LOOKOUT',over===1?'One\'s over the wall! East side, inside the wire!':over+' inside the wire! They\'re behind us!',3400);
      SFX.beep();}
  }
  // the wall's last hour announces itself, once
  if(G.depotHp<300&&!BAST.lastStand){BAST.lastStand=true;BAST.rally=true;
    flashT=Math.max(flashT,.3);SFX.wail();
    announce('THE WALL IS DYING','three hundred left in her. make every sandbag count.');
    const lines=['Then she dies expensive. FIX BAYONETS.','I came here to be buried. Not tonight.',
      'Every round counts twice now. Make them.','If the wall goes, we ARE the wall.'];
    allies.filter(a=>!a.down).forEach((a,i)=>setTimeout(()=>say(a.name,lines[i%lines.length],3600),2800+i*2400));
  }
  if(BAST.lastStand&&G.depotHp>420&&BAST.rally){BAST.rally=false;BAST.lastStand=false;
    say('LOOKOUT','She holds. She actually holds. Stand down from the brink.',4200);
  }
  // gun cooldowns + manned fire
  for(const g of BAST.guns)g.cd=Math.max(0,g.cd-dt);
}
function fireMortar(g){
  if(g.cd>0)return;
  if(BAST.shells<=0){SFX.dry();toast('NO SHELLS, WAIT FOR SPARROW');return;}
  g.cd=2.6;BAST.shells--;
  camera.getWorldDirection(_dir);
  const gr=groundRay(camera.position,_dir,130);
  const tx=gr?gr.point.x:player.x+_dir.x*90, tz=gr?gr.point.z:player.z+_dir.z*90;
  sTone('sine',74,30,.5,.5);sNoise(.22,'lowpass',420,70,.5);camShake=Math.max(camShake,.3);
  setTimeout(()=>sTone('sine',1500,380,.62,.06),430);
  burst(g.x,heightAt(g.x,g.z)+1.6,g.z,8,0xffc060,2,9);
  setTimeout(()=>burst(tx,heightAt(tx,tz)+20,tz,5,0xffa040,1.5,-6),580);
  setTimeout(()=>{const ty=heightAt(tx,tz);
    explode(tx,ty+.5,tz,6.5,130,1.1);},1150);
}
function fireManTurret(o){
  const t=o.ref;
  if(player.fireCd>0)return;
  if(t.ammo<=0){SFX.dry();return;}
  player.fireCd=.085;t.ammo--;G.shots++;
  camera.getWorldDirection(_dir);
  _org.copy(camera.position);
  const gr=groundRay(_org,_dir,130);
  const hits=rayZombieAll(_org,_dir,gr?gr.dist:130,2);
  let endP=gr?gr.point.clone():new THREE.Vector3(_org.x+_dir.x*130,_org.y+_dir.y*130,_org.z+_dir.z*130);
  if(hits.length){G.hits++;
    for(const h of hits){endP.set(_org.x+_dir.x*h.t,_org.y+_dir.y*h.t,_org.z+_dir.z*h.t);
      damageZombie(h.zb,14,endP,h.head);}}
  _tv.set(t.x,heightAt(t.x,t.z)+1.35,t.z);
  tracer(_tv,endP);
  muzzle.position.copy(_tv);muzzle.intensity=45;
  SFX.lmg();camShake=Math.max(camShake,.05);
}
function fireCannon(g){
  if(g.cd>0)return;
  if(BAST.shells<=0){SFX.dry();toast('NO SHELLS, WAIT FOR SPARROW');return;}
  g.cd=1.7;BAST.shells--;
  camera.getWorldDirection(_dir);
  _org.copy(camera.position);
  const hits=rayZombieAll(_org,_dir,140,9);
  let endP=new THREE.Vector3(_org.x+_dir.x*140,_org.y+_dir.y*140,_org.z+_dir.z*140);
  for(const h of hits){
    const p=new THREE.Vector3(_org.x+_dir.x*h.t,_org.y+_dir.y*h.t,_org.z+_dir.z*h.t);
    damageZombie(h.zb,70,p,h.head);
    h.zb.x+=_dir.x*2.2;h.zb.z+=_dir.z*2.2;h.zb.stagT=.6;
    endP=p;
  }
  if(hits.length)G.hits++;G.shots++;
  _tv.set(g.x,heightAt(g.x,g.z)+1,g.z);
  tracer(_tv,endP);tracer(_tv,endP);
  boomLight.position.copy(_tv);boomLight.intensity=900;
  SFX.boom();camShake=Math.max(camShake,.35);
  g.mesh.rotation.y=player.yaw;
  puffSmoke(new THREE.Vector3(_tv.x+_dir.x*1.6,_tv.y+.3,_tv.z+_dir.z*1.6));
}
/* the command net: ARMA habits die hard */
let cmdOpen=false,cmdEl=null;
function cmdUI(show){
  if(!cmdEl){
    cmdEl=document.createElement('div');
    cmdEl.style.cssText='position:fixed;left:50%;bottom:18vh;transform:translateX(-50%);z-index:22;'+
      'background:rgba(16,18,11,.92);border:1px solid rgba(201,189,146,.4);border-left:3px solid #e8742c;'+
      'padding:12px 18px;font-family:"Special Elite",monospace;font-size:14.5px;color:#c9bd92;display:none;'+
      'letter-spacing:.06em;line-height:1.9;box-shadow:0 10px 40px rgba(0,0,0,.6)';
    document.body.appendChild(cmdEl);
  }
  if(show){
    const a=nearestAlly();
    cmdEl.innerHTML='<b style="color:#e8742c;letter-spacing:.25em">COMMAND NET'+
      (a?' · '+a.name.toUpperCase():'')+'</b><br>'+
      '<b>1</b> HOLD YOUR POST<br>'+
      '<b>2</b> CREW THE MORTAR<br>'+
      '<b>3</b> ON ME<br>'+
      '<b>4</b> GO RESUPPLY<br>'+
      '<b>5</b> REBUILD THE GATE<br>'+
      '<span style="color:#7a7d55">[C] CLOSE · orders go to the nearest rifleman</span>';
    cmdEl.style.display='block';
  }else cmdEl.style.display='none';
  cmdOpen=show;
}
function nearestAlly(){
  let best=null,bd=1e9;
  for(const a of allies){const d=Math.hypot(a.x-player.x,a.z-player.z);if(d<bd){bd=d;best=a;}}
  return best;
}
function giveOrder(n){
  const a=nearestAlly();if(!a)return;
  const mortar=BAST.guns.find(g=>g.type==='mortar');
  if(n===1){a.duty='post';say(a.name,'Holding my post. They\'ll have to take it off me.',2600);}
  if(n===2){if(a.duty==='mortar'){say(a.name,'Already on the tube, boss.');}
    else{a.duty='mortar';a.wanderT=0;say(a.name,'Moving to the mortar. Call the rounds, I\'ll send them.',2800);}}
  if(n===3){a.duty='follow';a.wanderT=0;say(a.name,'On you.',1800);}
  if(n===4){a.duty='resupply';a.ammo=0;a.wanderT=0;say(a.name,'Running the cache road. Cover the gap!',2600);}
  if(n===5){a.duty='gate';a.wanderT=0;say(a.name,'On the gate. Bags going up, keep them off my back.',2800);}
  SFX.beep();cmdUI(false);
}
function bastionRequisition(){
  CAMP.mode='event';
  document.exitPointerLock&&document.exitPointerLock();
  const dlg=$('dlg');
  dlg.querySelector('.n').textContent='REQUISITION';
  dlg.querySelector('.r').textContent='sparrow has room for one pallet';
  dlg.querySelector('.q').textContent='"One pallet, wall. Quartermaster says pick and don\'t write letters about it. What\'s it going to be?"';
  const wrap=$('dlgC');wrap.innerHTML='';
  const opts=pick([
    [['Six shells for the tubes','BAST.shells',()=>BAST.shells+=6],['A hundred fifty rounds for the cache','cache',()=>BAST.cache+=150]],
    [['Timber and plate for the fort','+220 wall',()=>G.depotHp=Math.min(G.depotMax,G.depotHp+220)],['Ordnance: mines, bottles, rockets','+2 mines · +2 molotovs · +2 rockets',()=>{G.items.mine+=2;G.items.molotov+=2;G.items.rocket=(G.items.rocket||0)+2;}]],
    [['A crate of scrap','+90 scrap',()=>G.scrap+=90],['Medical: kits for the crew','+2 medkits, the wounded stand faster',()=>G.items.medkit+=2]],
  ]);
  for(const[l,sub,fn]of opts){
    const d=document.createElement('div');d.className='choice';
    d.innerHTML=l+'<span class="sub">'+sub+'</span>';
    d.addEventListener('click',()=>{fn();SFX.buy();saveBastion();
      dlg.classList.remove('on');CAMP.mode='menu';tryLock();});
    wrap.appendChild(d);
  }
  setTimeout(()=>dlg.classList.add('on'),200);
}
function npcMortarFire(g,a){
  if(BAST.shells<=0)return;
  const targets=zombies.filter(z=>z.alive&&z.rise<=0&&z.x<-30);
  if(!targets.length)return;
  BAST.shells--;
  const t=targets[Math.floor(Math.random()*targets.length)];
  const tx=t.x+rand(-3,3),tz=t.z+rand(-3,3);
  sTone('sine',74,30,.5,.4);sNoise(.2,'lowpass',420,70,.4);
  setTimeout(()=>sTone('sine',1500,380,.6,.05),430);
  burst(g.x,heightAt(g.x,g.z)+1.8,g.z,8,0xffc060,2,9);
  setTimeout(()=>burst(tx,heightAt(tx,tz)+20,tz,5,0xffa040,1.5,-6),580);
  setTimeout(()=>{explode(tx,heightAt(tx,tz)+.5,tz,6.5,130,1.1);},1150);
}
window.startBastion=startBastion;
/* lightning made visible: geometry, not just a bright frame */
const boltGeo=new THREE.BufferGeometry();
boltGeo.setAttribute('position',new THREE.BufferAttribute(new Float32Array(11*3),3));
const boltMat=new THREE.LineBasicMaterial({transparent:true,opacity:0,blending:THREE.AdditiveBlending});
boltMat.color.setRGB(9,10,14);
const bolt=new THREE.Line(boltGeo,boltMat);
bolt.frustumCulled=false;scene.add(bolt);
let boltT=0;
function strikeBolt(){
  const bx=player.x+rand(-120,120),bz=player.z+rand(-120,120);
  const p=boltGeo.attributes.position.array;
  let x=bx,z=bz;
  for(let i=0;i<11;i++){
    const y=120-i*(120-heightAt(bx,bz))/10;
    p[i*3]=x;p[i*3+1]=y;p[i*3+2]=z;
    x+=rand(-9,9);z+=rand(-9,9);
  }
  boltGeo.attributes.position.needsUpdate=true;
  boltT=.22;
}
/* ============================================================
   WANDER, the open country: no road, no orders, no one coming
   ============================================================ */

function startWander(load){
  audioInit();if(AU.ctx&&AU.ctx.state==='suspended')AU.ctx.resume();
  cleanupModes();
  CAMP.on=false;BAST.on=false;WANDER.on=true;
  CAMP.comps=[];CAMP.mode='menu';
  let sv=null;
  if(load){try{sv=JSON.parse(localStorage.getItem('tlr_wander'));}catch(e){}}
  WANDER.runSeed=sv?sv.runSeed:((Math.random()*2**31)|0);
  WANDER.region=sv?sv.region:1;
  WANDER.saveRegions=sv?(sv.regions||{}):{};
  Object.assign(G,{state:'play',wave:1,kills:sv?sv.p.kills:0,score:sv?sv.p.score:0,
    scrap:sv?sv.p.scrap:40,dirt:0,
    items:sv?sv.p.items:{nade:1,molotov:1,mine:0,medkit:1,flare:1,rocket:0},
    dmgMul:1,reloadMul:1,speedMul:sv?(sv.p.speedMul||1):1,scrapMul:1,steadyMul:1,
    turretCost:60,buildMul:1,turretCap:120,pocketsLvl:0,shots:0,hits:0,
    depotHp:1000,depotMax:1000,depotAmmo:60,spawnLeft:0,bruteLeft:0,intermission:9});
  Object.assign(player,{x:sv?sv.p.x:0,z:sv?sv.p.z:2,y:0,vy:0,yaw:Math.PI/2,pitch:-.02,
    hp:sv?sv.p.hp:100,maxhp:sv?sv.p.maxhp:100,alive:true,reserve:sv?sv.p.reserve:70,carryCap:180,
    wid:sv?sv.p.wid:0,owned:sv?sv.p.owned:[true,false,false,false,false,false],
    mags:sv?sv.p.mags:WEAPONS.map(w=>w.magSize),tool:null,buildType:0,healT:0,
    fireCd:0,reloadT:0,respawnT:0,ads:false,fireHeld:false,ride:null,man:null});
  zombies.length=0;
  for(const t of convoy)t.mesh.visible=false;
  for(const a of allies)scene.remove(a.mesh);allies.length=0;
  WANDER.t=sv?sv.t:0;WANDER.spawnT=8;WANDER.kills0=G.kills;
  WANDER.sites=[];WANDER.colT=null;WANDER.saveT=30;
  WANDER.story=sv?sv.story:[];
  buildWanderRegion(WANDER.region);
  applyRegionState(WANDER.saveRegions[WANDER.region]);
  const party=sv?(sv.party||(sv.survivor?[sv.survivor]:[])):[]; // legacy saves carried one
  for(const ps of party){
    const a=spawnAlly(player.x+rand(-3,3),player.z+rand(2,4));
    if(a){a.name=ps.name;a.xp=ps.xp||0;a.ammo=ps.ammo??60;a.dmgMul=ps.dmgMul||1;}
  }
  if(!sv)WANDER.story.push('Set out alone into '+BIOME.name.toLowerCase()+'.');
  $('start').classList.remove('show');$('gameover').classList.remove('show');
  $('hud').classList.add('on');
  initSlots();refreshVM();
  announce(load?'REGION '+WANDER.region+' · '+BIOME.name.toUpperCase():'WANDER · '+BIOME.name.toUpperCase(),
    load?'the country kept your place. it keeps everything.':
    WANDER.road?'an old road still crosses this country. walk it, or don\'t.':'no roads out here. walk. scavenge. the dark gets bolder.');
  tryLock();
}
const QN1=['MOTHER','ODD','SAINT','LITTLE','DEAF','LUCKY','SALT','HOLLOW','PATIENT','CROOKED'];
const QN2=['KESTREL','MARTIN','WREN','BRIAR','MOSS','TALLOW','CROW','FENWICK','JUNE','ASH'];
function regionSeed(idx){return (WANDER.runSeed^Math.imul(idx+1,2654435761))>>>0;}
function captureRegionState(){
  return {
    loot:WANDER.loot.map(L=>L.taken?1:0),
    den:!!(WANDER.den&&WANDER.den.woken),
    sites:WANDER.sites.map(s=>({k:s.kind,u:s.used?1:0})),
    quest:WANDER.quest?{taken:WANDER.quest.taken,objDone:WANDER.quest.objDone,turned:WANDER.quest.turned}:null,
    lm:!!(WANDER.landmark&&WANDER.landmark.found),
    rung:!!(WANDER.landmark&&WANDER.landmark.rung),
  };
}
function saveWander(){
  if(!WANDER.on)return;
  WANDER.saveRegions[WANDER.region]=captureRegionState();
  try{localStorage.setItem('tlr_wander',JSON.stringify({v:1,
    runSeed:WANDER.runSeed,region:WANDER.region,t:WANDER.t,story:WANDER.story,
    regions:WANDER.saveRegions,
    party:allies.map(a=>({name:a.name,xp:a.xp||0,ammo:a.ammo??60,dmgMul:a.dmgMul||1})),
    p:{x:player.x,z:player.z,hp:player.hp,maxhp:player.maxhp,reserve:player.reserve,
       wid:player.wid,owned:player.owned,mags:player.mags,scrap:G.scrap,score:G.score,
       kills:G.kills,items:G.items,speedMul:G.speedMul},
  }));}catch(e){}
}
function buildCacheMesh(rich){ // a crate that was packed by hands, not extruded
  const g=new THREE.Group();
  const wood=frostable(new THREE.MeshStandardMaterial({color:rich?0x4a3e33:0x5d6243,map:woodTex,
    roughness:.85,bumpMap:woodTex,bumpScale:.4}));
  const trim=frostable(new THREE.MeshStandardMaterial({color:0x3e3528,map:woodTex,roughness:.9}));
  const box=new THREE.Mesh(new THREE.BoxGeometry(1.04,.74,1.04),wood);
  box.castShadow=true;box.receiveShadow=true;g.add(box);
  for(const sx of[-.45,.45]){ // corner battens
    const sl=new THREE.Mesh(new THREE.BoxGeometry(.1,.78,1.08),trim);
    sl.position.x=sx;sl.castShadow=true;g.add(sl);
  }
  const band=new THREE.Mesh(new THREE.BoxGeometry(1.1,.07,1.1),
    new THREE.MeshStandardMaterial({color:0x4d4a42,metalness:.65,roughness:.45}));
  band.position.y=.14;g.add(band);
  const lid=new THREE.Mesh(new THREE.BoxGeometry(1.12,.07,1.12),trim);
  lid.position.y=.4;lid.rotation.y=.04;lid.castShadow=true;g.add(lid);
  g.rotation.y=Math.random()*TAU;                 // cosmetic: outside the seeded dice
  g.rotation.z=(Math.random()-.5)*.08;            // settled into the ground, not placed
  return g;
}
function buildWanderRegion(idx){
  const seed=regionSeed(idx);
  setSeed(seed);
  setBiome(BIOMES[Math.floor(srnd()*BIOMES.length)]);
  WANDER.road=srnd()<.55;
  for(const o of WANDER._meshes||[])scene.remove(o);
  WANDER._meshes=[];WANDER.loot=[];WANDER.quest=null;WANDER.landmark=null;
  for(const s of WANDER.sites){if(s.mesh)scene.remove(s.mesh);}
  WANDER.sites=[];
  zombies.length=0;
  for(const f of firePool){f.live=false;f.material.opacity=0;}
  buildWorld((seed^0x9e3779b9)>>>0);
  setSeed((seed^0x51ed2701)>>>0);   // content chain, independent of worldgen draws
  for(let i=0;i<11;i++){ // caches: deterministic, region-fixed
    const x=srand(-half+15,half-15),z=srand(-half+15,half-15);
    if(Math.hypot(x,z)<25)continue;
    const c=buildCacheMesh(false);
    c.position.set(x,heightAt(x,z)+.38,z);
    scene.add(c);WANDER._meshes.push(c);
    WANDER.loot.push({x,z,mesh:c,taken:false});
  }
  { // the den
    const a=srand(TAU),r=srand(half*.5,half*.8);
    WANDER.den={x:clamp(Math.cos(a)*r,-half+18,half-18),z:clamp(Math.sin(a)*r,-half+18,half-18),woken:false};
    for(let i=0;i<3;i++){
      const c=buildCacheMesh(true);
      c.position.set(WANDER.den.x+srand(-2,2),heightAt(WANDER.den.x,WANDER.den.z)+.38,WANDER.den.z+srand(-2,2));
      scene.add(c);WANDER._meshes.push(c);
      WANDER.loot.push({x:c.position.x,z:c.position.z,mesh:c,taken:false,rich:true});
    }
  }
  wanderPopulate();
  buildLandmark();
}
function applyRegionState(st){
  if(!st)return;
  st.loot.forEach((tk,i)=>{const L=WANDER.loot[i];
    if(L&&tk){L.taken=true;scene.remove(L.mesh);}});
  if(st.den&&WANDER.den)WANDER.den.woken=true;
  for(const e of st.sites){
    if(typeof e==='number'||!e.u)continue;    // pre-v1 saves: skip safely
    const s=WANDER.sites.find(s2=>s2.kind===e.k&&!s2.used); // one site per kind per region
    if(s){s.used=true;if(s.kind==='stranded'||s.kind==='drifter')scene.remove(s.mesh);}
  }
  if(st.quest&&WANDER.quest)Object.assign(WANDER.quest,st.quest);
  if(WANDER.landmark){WANDER.landmark.found=!!st.lm;WANDER.landmark.rung=!!st.rung;}
  if(!(WANDER.den&&WANDER.den.woken)){ // sleepers only if the den never woke
    for(let i=0;i<7;i++){const z=spawnZombie(i===0?'brute':null);
      if(z){z.x=WANDER.den.x+rand(-9,9);z.z=WANDER.den.z+rand(-9,9);z.rise=999;z.sleeping=true;}}
  }
  if(WANDER.quest&&WANDER.quest.taken&&!WANDER.quest.objDone&&WANDER.quest.type==='hunt')spawnQuestBrute();
}
function spawnQuestBrute(){
  const q=WANDER.quest,z=spawnZombie('brute');
  if(z){z.x=q.x;z.z=q.z;z.rise=rand(.5,1.5);z.questTarget=true;z.cloth=0x5a3526;}
}
function buildLandmark(){
  const kind=spick(['bell','giant','church']);
  const a=srand(TAU),r=srand(half*.3,half*.65);
  const x=clamp(Math.cos(a)*r,-half+20,half-20),z=clamp(Math.sin(a)*r,-half+20,half-20);
  const gy=heightAt(x,z);
  const g=new THREE.Group();
  const stone=frostable(new THREE.MeshStandardMaterial({color:0x6e675a,roughness:.95,
    bumpMap:fleshTex,bumpScale:.5})); // the mottle reads as weathered rock at this scale
  let name='';
  if(kind==='bell'){
    name='THE BELL TOWER';
    const t2=new THREE.Mesh(new THREE.CylinderGeometry(1.5,2,11,14),stone);t2.position.y=5.5;g.add(t2);
    const cap=new THREE.Mesh(new THREE.ConeGeometry(2.2,2,14),stone);cap.position.y=12;g.add(cap);
    const bell=new THREE.Mesh(new THREE.SphereGeometry(.7,14,10),
      new THREE.MeshStandardMaterial({color:0x8a7340,metalness:.7,roughness:.4}));
    bell.position.y=10.2;bell.scale.y=1.2;g.add(bell);
    COLLIDERS.push({x,z,r:2.2});
  }else if(kind==='giant'){
    name='THE STONE GIANT';
    const sizes=[[2.6,0],[2.1,3.4],[1.5,6.2],[.9,8.2]];
    for(const[s2,y2]of sizes){const b=new THREE.Mesh(new THREE.SphereGeometry(s2,14,10),stone);
      b.position.set(srand(-.3,.3),y2+s2*.7,srand(-.3,.3));b.scale.y=.85;g.add(b);}
    COLLIDERS.push({x,z,r:3});
  }else{
    name='THE SUNKEN CHURCH';
    const brick=frostable(new THREE.MeshStandardMaterial({color:0xa89684,roughness:.95,
      map:brickTex,bumpMap:brickTex,bumpScale:.35}));
    for(const[ox,oz,w2,ry]of[[0,-4,9,0],[4.5,0,8,Math.PI/2],[-4.5,0,8,Math.PI/2]]){
      const w3=new THREE.Mesh(new THREE.BoxGeometry(w2,4,.6),brick);
      w3.position.set(ox,.6,oz);w3.rotation.y=ry;g.add(w3);   // half-buried: the land is eating it
    }
    const c1=new THREE.Mesh(new THREE.BoxGeometry(.3,3,.3),stone);c1.position.set(0,4,-4);g.add(c1);
    const c2=new THREE.Mesh(new THREE.BoxGeometry(1.6,.3,.3),stone);c2.position.set(0,4.6,-4);g.add(c2);
    COLLIDERS.push({x,z:z-4,r:4.6});
  }
  g.traverse(o=>{if(o.isMesh){o.castShadow=true;o.receiveShadow=true;}});
  g.position.set(x,gy,z);
  scene.add(g);WANDER._meshes.push(g);
  WANDER.landmark={kind,name,x,z,found:false,rung:false};
}
function wanderPopulate(){
  // sites: the country is inhabited, barely
  for(const s of WANDER.sites){if(s.mesh)scene.remove(s.mesh);if(s.fire)s.fire.live=false;}
  WANDER.sites=[];
  // determinism rule: ALWAYS draw the dice, conditionally use them
  const hr=srnd(),ha=srand(TAU),hd=srand(half*.35,half*.7);
  if(hr<.6){ // THE HERMIT: a fire, a kettle, a man who remembers
    const x=clamp(Math.cos(ha)*hd,-half+15,half-15),z=clamp(Math.sin(ha)*hd,-half+15,half-15);
    const mesh=buildAllyMesh(null,true);
    mesh.position.set(x,heightAt(x,z),z);
    scene.add(mesh);
    addFirePatch(x+1.4,z,1,9999);
    COLLIDERS.push({x:x+1.4,z,r:.8});
    WANDER.sites.push({kind:'hermit',x,z,mesh,used:false});
  }
  const sr=srnd(),sa=srand(TAU),sd=srand(half*.4,half*.75);
  if(sr<.55&&allies.length<3){ // THE STRANDED: alive, for now
    const x=clamp(Math.cos(sa)*sd,-half+15,half-15),z=clamp(Math.sin(sa)*sd,-half+15,half-15);
    const mesh=buildAllyMesh(null,true);
    mesh.position.set(x,heightAt(x,z),z);
    scene.add(mesh);
    WANDER.sites.push({kind:'stranded',x,z,mesh,used:false});
    for(let i=0;i<5;i++){const zb=spawnZombie();
      if(zb){zb.x=x+rand(-14,14);zb.z=z+rand(-14,14);zb.rise=rand(2,5);}}
  }
  // THE ONE WHO ASKS: every country has somebody who wants something
  const qr=srnd(),qa=srand(TAU),qd=srand(half*.3,half*.6),
    qn=spick(QN1)+' '+spick(QN2),qt=srnd()<.5?'fetch':'hunt',
    qa2=srand(TAU),qd2=srand(half*.55,half*.85);
  if(qr<.7){
    const x=clamp(Math.cos(qa)*qd,-half+15,half-15),z=clamp(Math.sin(qa)*qd,-half+15,half-15);
    const tx=clamp(Math.cos(qa2)*qd2,-half+12,half-12),tz=clamp(Math.sin(qa2)*qd2,-half+12,half-12);
    const mesh=buildAllyMesh(null,true);
    mesh.position.set(x,heightAt(x,z),z);
    scene.add(mesh);
    WANDER.sites.push({kind:'quester',x,z,mesh,used:false});
    WANDER.quest={type:qt,giver:qn,gx:x,gz:z,x:tx,z:tz,taken:false,objDone:false,turned:false};
  }
  // THE DRIFTER: armed, fed, unhurried. could be talked into company
  const dr=srnd(),da2=srand(TAU),dd2=srand(half*.35,half*.7),dn=spick(ALLY_NAMES);
  if(dr<.5){
    const x=clamp(Math.cos(da2)*dd2,-half+15,half-15),z=clamp(Math.sin(da2)*dd2,-half+15,half-15);
    const mesh=buildAllyMesh();
    mesh.position.set(x,heightAt(x,z),z);
    scene.add(mesh);
    addFirePatch(x+1.3,z+.5,.8,9999);
    COLLIDERS.push({x:x+1.3,z:z+.5,r:.7});
    WANDER.sites.push({kind:'drifter',name:dn,x,z,mesh,used:false});
  }
}
let fadeEl=null;
function fadeBlink(){
  if(!fadeEl){fadeEl=document.createElement('div');
    fadeEl.style.cssText='position:fixed;inset:0;background:#070604;opacity:0;pointer-events:none;z-index:30;transition:opacity .5s';
    document.body.appendChild(fadeEl);}
  fadeEl.style.opacity=1;
  document.body.classList.add('cine');
  setTimeout(()=>{fadeEl.style.opacity=0;},700);
  setTimeout(()=>document.body.classList.remove('cine'),2400);
}
function travelRegion(){
  fadeBlink();
  WANDER.saveRegions[WANDER.region]=captureRegionState();
  WANDER.region++;
  const heading=Math.abs(player.x)>Math.abs(player.z)?(player.x>0?'east':'west'):(player.z>0?'south':'north');
  player.x=-player.x*.88;player.z=-player.z*.88;
  buildWanderRegion(WANDER.region);
  applyRegionState(WANDER.saveRegions[WANDER.region]);
  for(const al of allies){al.x=player.x+rand(-4,4);al.z=player.z+rand(-4,4);al.tx=al.x;al.tz=al.z;}
  WANDER.story.push('Walked '+heading+' into '+BIOME.name.toLowerCase()+'. Region '+WANDER.region+'.');
  G.score+=100;
  announce('REGION '+WANDER.region+' · '+BIOME.name.toUpperCase(),'the country goes on. so do you.');
  saveWander();
}
function wanderTalk(title,who,text,opts){
  CAMP._back=CAMP.mode;CAMP.mode='talk';
  document.exitPointerLock&&document.exitPointerLock();
  document.body.classList.add('cine');vm.visible=false;
  const dlg=$('dlg');
  dlg.querySelector('.n').textContent=title;
  dlg.querySelector('.r').textContent=who;
  dlg.querySelector('.q').textContent='"'+text+'"';
  const wrap=$('dlgC');wrap.innerHTML='';
  for(const[l,sub,fn]of opts){
    const d=document.createElement('div');d.className='choice';
    d.innerHTML=l+(sub?'<span class="sub">'+sub+'</span>':'');
    d.addEventListener('click',()=>{
      dlg.classList.remove('on');document.body.classList.remove('cine');
      vm.visible=true;CAMP.mode='menu';if(fn)fn();tryLock();});
    wrap.appendChild(d);
  }
  setTimeout(()=>dlg.classList.add('on'),350);
}
function wanderUpdate(dt){
  WANDER.t+=dt;
  const wnf=0.5-0.5*Math.cos(WANDER.t/150*TAU);
  if(wnf>.65&&Math.random()<dt*.08){ // a star lets go of the sky
    const tr=tracers.find(t2=>t2.t<=0);
    if(tr){
      const sx=player.x+rand(-200,200),sz=player.z+rand(-200,200),sy=rand(120,180);
      const p=tr.l.geometry.attributes.position.array;
      p[0]=sx;p[1]=sy;p[2]=sz;
      p[3]=sx+rand(-40,40);p[4]=sy-rand(8,20);p[5]=sz+rand(-40,40);
      tr.l.geometry.attributes.position.needsUpdate=true;
      tr.t=.9;tr.l.material.opacity=.7;
    }
  }
  if(wnf>.75&&!WANDER.nightSaid){WANDER.nightSaid=true;
    say('THE COUNTRY','Dead of night. They move faster when nothing watches.',3600);}
  if(wnf<.5)WANDER.nightSaid=false;
  if(wnf>.75)WANDER.nightLived=true;
  if(wnf<.2&&WANDER.nightLived){ // you watched the night through
    WANDER.nightLived=false;
    player.hp=Math.min(player.maxhp,player.hp+20);
    G.score+=150;
    announce('DAWN','you watched the night through. the country counts it.');
    SFX.chime();
    if(allies.length){
      for(const al of allies)al.dmgMul=(al.dmgMul||1)+.05;
      const al=pick(allies);
      say(al.name,pick([
        'Another dawn. That\'s '+(allies.length+1)+' of us who saw it.',
        'I used to count nights alone. I like this arithmetic better.',
        'You watch east, I\'ll watch west. That\'s the whole constitution of our country.'])
        ,4200);
      WANDER.story.push('Watched a dawn with '+allies.map(a2=>a2.name).join(' and ')+'.');
    }
    if(WANDER.story.length>40)WANDER.story.splice(1,WANDER.story.length-40);
  }
  if(WANDER.den&&!WANDER.den.woken&&Math.hypot(player.x-WANDER.den.x,player.z-WANDER.den.z)<26){
    WANDER.den.woken=true;
    for(const z of zombies)if(z.sleeping){z.sleeping=false;z.rise=rand(1.2,2.4);}
    SFX.wail();flashT=Math.max(flashT,.15);
    announce('THE DEN WAKES','you stepped among them. the hoard is theirs until it isn\'t.');
  }
  G.wave=Math.min(14,1+Math.floor(WANDER.t/75));   // the land learns you are here
  WANDER.spawnT-=dt;
  if(WANDER.spawnT<=0){
    WANDER.spawnT=clamp(9-G.wave*.55,2.6,9)*(wnf>.75?.6:1);
    const n=Math.random()<.25?2+(Math.random()*G.wave/3|0):1;
    for(let i=0;i<n;i++){
      const z=spawnZombie();
      if(z){const a=rand(TAU),r=rand(55,90);
        z.x=clamp(player.x+Math.cos(a)*r,-half+6,half-6);
        z.z=clamp(player.z+Math.sin(a)*r,-half+6,half-6);}
    }
  }
  if(G.kills>=WANDER.kills0+25){WANDER.kills0=G.kills;
    say('THE COUNTRY','Twenty-five more under the grass. It has noticed.',3200);}
  WANDER.colT=(WANDER.colT??rand(70,120))-dt;
  if(WANDER.colT<=0){
    WANDER.colT=rand(110,180);
    const a=rand(TAU),sx=player.x+Math.cos(a)*rand(60,90),sz=player.z+Math.sin(a)*rand(60,90);
    const ha=rand(TAU),ex=clamp(sx+Math.cos(ha)*200,-half+10,half-10),ez=clamp(sz+Math.sin(ha)*200,-half+10,half-10);
    const px=-Math.sin(ha),pz=Math.cos(ha);
    let placed=0;
    for(let i=0;i<12;i++){
      const z=spawnZombie(i===0&&Math.random()<.3?'brute':null);
      if(z){placed++;
        z.x=clamp(sx+px*rand(-7,7)+Math.cos(ha)*i*2.2,-half+6,half-6);
        z.z=clamp(sz+pz*rand(-7,7)+Math.sin(ha)*i*2.2,-half+6,half-6);
        z.rise=rand(.2,1.2);z.migrate={x:ex,z:ez};
      }
    }
    if(placed>6){
      say('THE COUNTRY','A column is moving through. Not for you, unless you make it about you.',4200);
      WANDER.story.push('Watched a column of the dead cross region '+WANDER.region+'.');
    }
  }
  const lm2=WANDER.landmark;
  if(lm2&&!lm2.found&&Math.hypot(player.x-lm2.x,player.z-lm2.z)<24){
    lm2.found=true;G.score+=80;
    announce(lm2.name,{bell:'someone built it to be heard. nobody dared since.',
      giant:'stacked stone, taller than hope. older than the dead.',
      church:'the land is eating it slowly. the cross goes last.'}[lm2.kind]);
    WANDER.story.push('Found '+lm2.name.toLowerCase()+' in region '+WANDER.region+'.');
    saveWander();
  }
  WANDER.saveT=(WANDER.saveT??30)-dt;
  if(WANDER.saveT<=0){WANDER.saveT=30;saveWander();}
  if(Math.abs(player.x)>half-5||Math.abs(player.z)>half-5)travelRegion();
  // the stranded die if you dawdle
  for(const s of WANDER.sites){
    if(s.kind==='stranded'&&!s.used){
      const near=zombies.filter(z=>z.alive&&z.rise<=0&&Math.hypot(z.x-s.x,z.z-s.z)<4).length;
      if(near>0){s.hp=(s.hp??14)-near*dt*2;
        if(s.hp<=0){s.used=true;scene.remove(s.mesh);
          WANDER.story.push('Heard someone calling in region '+WANDER.region+'. Arrived too late.');
          say('THE COUNTRY','The calling stops. The country files it away.',3400);}}
    }
  }
}
window.startWander=startWander;
window.WANDER=WANDER; // dev: the open country, inspectable
window.devWorld=name=>{ // dev: preview any biome from the console
  const b=BIOMES.find(b2=>b2.name.toLowerCase().includes(String(name).toLowerCase()));
  if(!b)return BIOMES.map(b2=>b2.name);
  setBiome(b);buildWorld((Math.random()*2**31)|0);
  return b.name;
};
/* ---------------- main loop ---------------- */
let last=performance.now(),elapsed=0,stormT=14,flashT=0;
const _flashCol=new THREE.Color(.62,.68,.95);
let frameAvg=16,qTimer=4,lowRes=false;
function frame(now){
  requestAnimationFrame(frame);
  const dt=Math.min(.05,(now-last)/1000);last=now;
  elapsed+=dt;
  // adaptive resolution: trade pixels for frames, never stutter
  frameAvg=frameAvg*.96+dt*1000*.04;
  qTimer-=dt;
  if(qTimer<=0){
    qTimer=3;
    const target=Math.min(devicePixelRatio,1.5);
    if(!lowRes&&frameAvg>26){lowRes=true;gtaoPass.enabled=false;renderer.setPixelRatio(1);composer.setPixelRatio(1);composer.setSize(innerWidth,innerHeight);}
    else if(lowRes&&frameAvg<13){lowRes=false;gtaoPass.enabled=true;renderer.setPixelRatio(target);composer.setPixelRatio(target);composer.setSize(innerWidth,innerHeight);}
  }
  sky.position.copy(camera.position);
  skyMat.uniforms.time.value=elapsed;
  gradePass.uniforms.time.value=elapsed;
  WindU.value=elapsed;
  if(G.state==='menu'||G.state==='over'){
    if(!document.body.classList.contains('cine'))document.body.classList.add('cine');
    const a=elapsed*.07;
    camera.position.set(Math.cos(a)*55,26,Math.sin(a)*55);
    camera.lookAt(0,2,0);
    sky.position.copy(camera.position);
    updateGodrays(.25,0);
    updateZombies(dt,elapsed);
    composer.render();
    return;
  }
  const inOverlay=shopOpen||perkOpen||invOpen||['event','camp','route','epilogue','over','muster','talk'].includes(CAMP.mode);
  const paused=G.state==='play'&&!locked&&everLocked&&player.alive&&!shopOpen&&!perkOpen&&!inOverlay;
  if(paused){composer.render();return;}
  if(inOverlay){composer.render();return;}

  const nf=WANDER.on?(0.5-0.5*Math.cos(WANDER.t/150*TAU)):CAMP.on?clamp(CAMP.nf,0,1):clamp(G.wave/7,0,1);
  updateWeather(dt);
  skyMat.uniforms.nightF.value=nf;
  skyMat.uniforms.aurora.value+=((BIOME.snow?1:0)-skyMat.uniforms.aurora.value)*Math.min(1,dt*.5);
  if(mountainRing.visible){const mk=1-nf*.78;mountainRing.material.color.setRGB(.345*mk,.384*mk,.455*mk);}
  skyMat.uniforms.flash.value=flashT;
  skyMat.uniforms.cover.value=wxParam('cover',nf);
  scene.fog.color.lerpColors(DUSK.fog,NIGHT.fog,nf);
  if(flashT>0)scene.fog.color.lerp(_flashCol,Math.min(1,flashT*2.6)); // the strike lights the air itself
  scene.fog.color.r*=lerp(1,BIOME.tint[0],.45);
  scene.fog.color.g*=lerp(1,BIOME.tint[1],.45);
  scene.fog.color.b*=lerp(1,BIOME.tint[2],.45);
  scene.fog.near=wxParam('n',nf)-flashT*12;
  scene.fog.far=wxParam('f',nf)+flashT*120;
  const tnt=[1,1,1];wxTint(tnt);
  gradePass.uniforms.heat.value=BIOME.desert?Math.max(0,1-nf*1.7):0; // the mirage dies with the day
  gradePass.uniforms.tint.value.set(
    tnt[0]*lerp(1,.86,nf*.8),tnt[1]*lerp(1,.95,nf*.8),tnt[2]*lerp(1,1.14,nf*.8));
  sun.color.lerpColors(DUSK.sun,NIGHT.sun,nf);
  sun.intensity=lerp(DUSK.sunI,NIGHT.sunI,nf)+flashT*7;
  hemi.intensity=lerp(DUSK.hemiI,NIGHT.hemiI,nf)+flashT*9;
  lampSpot.intensity=lampOn?50+nf*110:0;
  lampCone.visible=lampOn;
  lampCone.material.opacity=.008+nf*.02;
  const wind=1+Math.sin(elapsed*.13)*.6;
  for(const m of mists){
    const u=m.userData;
    m.position.x=u.bx+Math.sin(elapsed*.02*u.sp*wind+u.ph)*14;
    m.position.z=u.bz+Math.cos(elapsed*.016*u.sp*wind+u.ph)*12;
    m.material.opacity=.065+nf*.05+wxParam('cover',nf)*.04;
  }
  updateRain(dt,wxParam('rain',nf)*(BIOME.snow||BIOME.ash?0:1));  // the waste is too cold, the ashfall too dry
  updateSnow(dt,elapsed);
  updateLeaves(dt,elapsed);
  updatePrints(dt);
  updateSmokes(dt);
  updateShells(dt);
  updateDust(dt);
  updateCrows(dt,elapsed);
  updateFireflies(dt,elapsed,nf);
  updateWildlife(dt,elapsed,nf);
  bakeEnv(nf);
  updateGodrays(nf,flashT);
  cityWins.visible=cityWins.count>0&&nf>.42;
  if(cityWins.visible)cityWins.material.opacity=Math.min(.95,(nf-.42)*2.4);
  flashSpr.material.opacity=Math.max(0,flashSpr.material.opacity-dt*16);
  updateMolotovs(dt);
  updateFires(dt,elapsed);
  updateMines(dt,elapsed);
  updateFlares(dt,elapsed);
  for(let i=wires.length-1;i>=0;i--){
    wires[i].life-=dt;
    if(wires[i].life<=0){scene.remove(wires[i].mesh);wires.splice(i,1);}
  }
  depot.userData.lamp.intensity=20+nf*45+Math.sin(elapsed*23)*6*nf;
  depot.userData.flag.rotation.y=Math.sin(elapsed*1.7)*.3;
  // shadow frustum follows the player → crisp shadows where you look
  sun.position.set(player.x-70,80,player.z-40);
  if(horizonBand){horizonBand.position.x=player.x;horizonBand.position.z=player.z;
    horizonBand.material.color.copy(scene.fog.color).multiplyScalar(.35);} // distant land wears the air's color, darker
  { // park the disc far along the light direction; night and fog swallow it
    const sd=_dir.set(-70,80,-40).normalize();
    sunDisc.position.copy(camera.position).addScaledVector(sd,520);
    sunHalo.position.copy(sunDisc.position);
    const vis=Math.max(0,1-nf*1.15);
    sunDisc.material.opacity=.9*vis;
    sunHalo.material.opacity=.32*vis;
    const md=_dir.set(64,58,38).normalize();   // the moon keeps the opposite watch
    moonDisc.position.copy(camera.position).addScaledVector(md,520);
    moonHalo.position.copy(moonDisc.position);
    const mvis=clamp((nf-.45)*2.2,0,1);
    const hunting=BAST.on&&BAST.mod==='moon';
    moonDisc.material.color.setRGB(hunting?3.1:2.1,hunting?2.1:2.25,hunting?1.7:2.6);
    moonDisc.scale.setScalar(hunting?24:17);
    moonDisc.material.opacity=.85*mvis;
    moonHalo.material.opacity=.2*mvis*(hunting?1.6:1);
  }
  sun.target.position.set(player.x,0,player.z);
  rim.intensity=.35+nf*.4;
  if(wxParam('storm',nf)>.5){
    stormT-=dt;
    if(stormT<=0){
      stormT=rand(6,16);flashT=.26;strikeBolt();
      setTimeout(()=>SFX.thunder(),rand(400,1500));
    }
  }
  flashT=Math.max(0,flashT-dt*1.4);
  if(boltT>0){boltT-=dt;boltMat.opacity=Math.max(0,boltT*4.5);}
  boomLight.intensity=Math.max(0,boomLight.intensity-dt*4500);

  updatePlayer(dt,elapsed);
  updateZombies(dt,elapsed);
  updateTurrets(dt,elapsed);
  updateAllies(dt,elapsed);
  updateConvoy(dt);
  updateAcids(dt);
  updateNades(dt);
  updateParticles(dt);
  for(const tr of tracers){if(tr.t>0){tr.t-=dt;tr.l.material.opacity=Math.max(0,tr.t/.08*.9);}}
  for(const d of decals)if(d.material.opacity>0)d.material.opacity-=dt*.012;

  if(WANDER.on)wanderUpdate(dt);else if(BAST.on)bastionUpdate(dt);else campaignDirector(dt);
  if(toastQueue.length&&toastT<=0)toast(toastQueue.shift());

  updateHUD(dt);
  drawMap();
  composer.render();
}
/* IBL: every PBR material drinks from the baked sky, tuned so it
   fills shadows without flattening the directional light */
scene.traverse(o=>{
  if(!o.material)return;
  const ms=Array.isArray(o.material)?o.material:[o.material];
  for(const m of ms)if(m.isMeshStandardMaterial&&m.envMapIntensity===1)m.envMapIntensity=.45;
});
bakeEnv(0);
requestAnimationFrame(frame);

/* expose for debugging / tests */
window.G=G;window.PLAYER=player;window.ZOMBIES=zombies;window.TURRETS=turrets;window.TRUCK=truck;
window.spawnZombie=spawnZombie;window.modifyTerrain=modifyTerrain;window.heightAt=heightAt;
window.startGame=startCampaign;window.placeTurret=placeTurret;window.damagePlayer=damagePlayer;
window.CAMP=CAMP;window.startCampaign=startCampaign;window.beginLeg=beginLeg;window.arriveCamp=arriveCamp;
window.CONVOY=convoy;window.leadTruck=leadTruck;window.openEvent=openEvent;window.pickRoadEvent=pickRoadEvent;
window.winCampaign=winCampaign;window.buildWorld=buildWorld;window.roadZ=roadZ;
window.throwGrenade=throwGrenade;window.explode=explode;window.selectWeapon=selectWeapon;
window.WEAPONS=WEAPONS;window.toggleShop=toggleShop;window.offerPerks=offerPerks;
window.throwMolotov=throwMolotov;window.placeMine=placeMine;window.throwFlare=throwFlare;
window.addFirePatch=addFirePatch;window.WXSTATE=()=>({cur:WX[wxCur].id,next:WX[wxNext].id,blend:wxBlend,frenzy:wxFrenzy});
window.setWeather=i=>{wxNext=i;wxBlend=0;wxTimer=999;};
window.AUDIO=AU;window.SFX=SFX;
window.getLamp=()=>({on:lampOn,intensity:lampSpot.intensity});window.toggleLamp=toggleLamp;
window.ALLIES=allies;window.spawnAlly=spawnAlly;
window.SCENE=scene;window.TERRAIN=terrain;window.SUN=sun;window.HEMI=hemi;window.RENDERER=renderer;
document.addEventListener('visibilitychange',()=>{
  if(document.hidden){document.exitPointerLock&&document.exitPointerLock();}
  else{last=performance.now();if(AU.ctx&&AU.ctx.state==='suspended')AU.ctx.resume();}
});
addEventListener('error',e=>{
  try{
    const h=$('hint');
    h.textContent='FIELD REPORT: '+(e.message||'unknown error');
    h.style.color='#ff6a4a';
  }catch(_){}
});
console.log('TRENCHFALL ULTRA boot OK, gtao:'+!!gtaoPass+' env:'+!!scene.environment+' grass:'+(grassMesh?grassMesh.count:0));

import"./modulepreload-polyfill-B5Qt9EMX.js";import{WebGLRenderer as ne,SRGBColorSpace as ie,ACESFilmicToneMapping as se,Scene as oe,PerspectiveCamera as re,Color as zt,Fog as le,Vector2 as he,Vector4 as st,Vector3 as G,SphereGeometry as ce,Mesh as at,ShaderMaterial as nt,AdditiveBlending as O,BackSide as de,BufferGeometry as Q,BufferAttribute as F,Points as Y,PointsMaterial as Rt,CanvasTexture as Wt,Sprite as vt,SpriteMaterial as gt,Group as xt,DoubleSide as qt,PlaneGeometry as ue,MeshBasicMaterial as Mt,CapsuleGeometry as jt,CylinderGeometry as Qt,TorusGeometry as pe,ConeGeometry as fe}from"https://cdn.jsdelivr.net/npm/three@0.180.0/build/three.module.js";import{EffectComposer as me}from"https://cdn.jsdelivr.net/npm/three@0.180.0/examples/jsm/postprocessing/EffectComposer.js";import{RenderPass as ve}from"https://cdn.jsdelivr.net/npm/three@0.180.0/examples/jsm/postprocessing/RenderPass.js";import{UnrealBloomPass as ge}from"https://cdn.jsdelivr.net/npm/three@0.180.0/examples/jsm/postprocessing/UnrealBloomPass.js";import{OutputPass as we}from"https://cdn.jsdelivr.net/npm/three@0.180.0/examples/jsm/postprocessing/OutputPass.js";function ye(n){const t=new ne({canvas:n,antialias:!0});t.setPixelRatio(Math.min(window.devicePixelRatio||1,1.5)),t.setSize(window.innerWidth,window.innerHeight),t.outputColorSpace=ie,t.toneMapping=se,t.toneMappingExposure=1.15;const e=new oe,a=new re(62,window.innerWidth/window.innerHeight,.3,900);a.position.set(0,6,26);const u=new zt(266268),r=new zt(259),h=new zt;e.fog=new le(266268,40,420);function l(c){h.lerpColors(u,r,Math.min(1,c)),t.setClearColor(h),e.fog.color.copy(h),e.fog.far=420-150*Math.min(1,c)}l(0);let i=null;try{i=new me(t),i.addPass(new ve(e,a));const c=new ge(new he(window.innerWidth,window.innerHeight),.8,.5,.16);i.addPass(c),i.addPass(new we)}catch(c){console.warn("[HD] post unavailable — direct render",c),i=null}function s(){a.aspect=window.innerWidth/window.innerHeight,a.updateProjectionMatrix(),t.setSize(window.innerWidth,window.innerHeight),i&&i.setSize(window.innerWidth,window.innerHeight)}function p(){if(i)try{i.render();return}catch(c){console.warn("[HD] post render failed — falling back",c),i=null}t.render(e,a)}return{renderer:t,scene:e,camera:a,setSize:s,setDepthK:l,render:p}}let M=null,Z=null,et=null,ht=null,ft=null,ct=null;function be(){if(M)return!0;const n=window.AudioContext||window.webkitAudioContext;if(!n)return!1;M=new n,Z=M.createGain(),Z.gain.value=.5,Z.connect(M.destination),et=M.createDelay(1.2),et.delayTime.value=.42;const t=M.createGain();t.gain.value=.34;const e=M.createGain();e.gain.value=.35,et.connect(t),t.connect(et),et.connect(e),e.connect(Z);const a=M.sampleRate*3,u=M.createBuffer(1,a,M.sampleRate),r=u.getChannelData(0);let h=0;for(let p=0;p<a;p++)h=(h+(Math.random()*2-1)*.04)*.985,r[p]=h*6;const l=M.createBufferSource();l.buffer=u,l.loop=!0;const i=M.createBiquadFilter();i.type="lowpass",i.frequency.value=110,i.Q.value=.6,ht=M.createGain(),ht.gain.value=.5,l.connect(i),i.connect(ht),ht.connect(Z),l.start(),ft=M.createOscillator(),ft.type="triangle",ft.frequency.value=46,ct=M.createGain(),ct.gain.value=0;const s=M.createBiquadFilter();return s.type="lowpass",s.frequency.value=260,ft.connect(s),s.connect(ct),ct.connect(Z),ft.start(),!0}function Me(){const n=()=>{be()&&M.state==="suspended"&&M.resume()};window.addEventListener("pointerdown",n,{once:!1}),window.addEventListener("keydown",n,{once:!1})}function K(n,t,e,a,u,r=!1,h="exp"){if(!M)return;const l=M.currentTime,i=M.createOscillator();i.type=n,i.frequency.setValueAtTime(t,l),h==="exp"?i.frequency.exponentialRampToValueAtTime(Math.max(1,e),l+a):i.frequency.linearRampToValueAtTime(e,l+a);const s=M.createGain();s.gain.setValueAtTime(u,l),s.gain.exponentialRampToValueAtTime(1e-4,l+a),i.connect(s),s.connect(Z),r&&s.connect(et),i.start(l),i.stop(l+a+.05)}function St(n,t,e,a=1){if(!M)return;const u=M.currentTime,r=Math.ceil(M.sampleRate*n),h=M.createBuffer(1,r,M.sampleRate),l=h.getChannelData(0);for(let c=0;c<r;c++)l[c]=(Math.random()*2-1)*(1-c/r);const i=M.createBufferSource();i.buffer=h;const s=M.createBiquadFilter();s.type="bandpass",s.frequency.value=e,s.Q.value=a;const p=M.createGain();p.gain.value=t,i.connect(s),s.connect(p),p.connect(Z),p.connect(et),i.start(u)}function xe(){K("sine",1240,320,.5,.34,!0)}function Pt(){St(.5,.32,140+Math.random()*180,2.5),K("sine",60,34,.6,.16)}function kt(){K("sine",620,980,.35,.12,!0,"lin"),K("sine",930,1470,.5,.08,!0,"lin")}function Se(){St(.25,.16,900,1),K("square",220,660,.2,.06)}function Te(){if(M){for(const n of[0,7,-9])K("sawtooth",90+n,30,2.4,.16,!0);St(1.6,.3,90,.8)}}function Ae(){K("sine",58,40,.28,.3)}function ze(){St(2.2,.6,220,.5),K("sawtooth",120,20,2,.3,!0)}function Pe(){for(const[n,t]of[[392,0],[523,.25],[659,.5],[784,.75]])setTimeout(()=>K("sine",n,n,1.6,.1,!0,"lin"),t*1e3)}function Le(n=4){if(!M)return;const t=M.currentTime;K("square",1350,900,.07,.05);const e=Math.ceil(M.sampleRate*n),a=M.createBuffer(1,e,M.sampleRate),u=a.getChannelData(0);for(let i=0;i<e;i++)u[i]=Math.random()*2-1;const r=M.createBufferSource();r.buffer=a;const h=M.createBiquadFilter();h.type="bandpass",h.frequency.value=1250,h.Q.value=2.2;const l=M.createGain();l.gain.setValueAtTime(0,t),l.gain.linearRampToValueAtTime(.035,t+.1);for(let i=0;i<n*6;i++)l.gain.linearRampToValueAtTime(.012+Math.random()*.035,t+.1+i/6);l.gain.linearRampToValueAtTime(1e-4,t+n),r.connect(h),h.connect(l),l.connect(Z),l.connect(et),r.start(t),r.stop(t+n+.1),setTimeout(()=>K("square",900,1350,.06,.045),n*1e3)}function Ce(n){ct&&ct.gain.setTargetAtTime(n?.22:0,M.currentTime,.08)}function Ee(n){ht&&ht.gain.setTargetAtTime(.35+n*.5,M.currentTime,.4)}const It=60,Gt=7,Tt=`
  uniform float uTime;
  uniform vec4  uPings[4];      // xyz = origin, w = emit time (<0 = unused)
  uniform vec3  uLampPos;
  uniform vec3  uLampDir;
  uniform float uLampOn;
  uniform vec3  uSubPos;
  uniform float uSubSpeed;
  uniform vec4  uFlares[3];     // xyz = position, w = intensity (0 = unused)

  float flareGlow(vec3 p) {
    float g = 0.0;
    for (int i = 0; i < 3; i++) {
      if (uFlares[i].w <= 0.0) continue;
      float d2 = dot(p - uFlares[i].xyz, p - uFlares[i].xyz);
      g += uFlares[i].w * 30.0 / (1.0 + d2 * 0.03);
    }
    return g;
  }

  float sonarGlow(vec3 p) {
    float g = 0.0;
    for (int i = 0; i < 4; i++) {
      float t = uTime - uPings[i].w;
      if (uPings[i].w < 0.0 || t < 0.0 || t > ${Gt.toFixed(1)}) continue;
      float r = t * ${It.toFixed(1)};
      float d = distance(p, uPings[i].xyz);
      float band = exp(-pow((d - r) / 8.0, 2.0)) * 1.4; // the wavefront itself
      // the afterglow is your MAP: pinged rock stays faintly lit while the
      // echo dies, long enough to steer by — this is the game's memory
      float after = exp(-(r - d) * 0.03) * step(d, r) * 0.34;
      g += (band + after) * exp(-t * 0.42);
    }
    return g;
  }

  float lampGlow(vec3 p) {
    vec3 v = p - uLampPos;
    float d = length(v);
    float cone = smoothstep(0.845, 0.97, dot(v / max(d, 0.001), uLampDir));
    return uLampOn * cone * 46.0 / (1.0 + d * d * 0.014);
  }

  // bioluminescent wake — the water itself remembers you passing through it
  float wakeGlow(vec3 p) {
    float d2 = dot(p - uSubPos, p - uSubPos);
    return uSubSpeed * 0.09 / (1.0 + d2 * 0.06);
  }
`;function Fe(n){const t={uTime:{value:0},uPings:{value:[new st(0,0,0,-1),new st(0,0,0,-1),new st(0,0,0,-1),new st(0,0,0,-1)]},uLampPos:{value:new G},uLampDir:{value:new G(0,0,-1)},uLampOn:{value:0},uSubPos:{value:new G},uSubSpeed:{value:0},uFlares:{value:[new st(0,0,0,0),new st(0,0,0,0),new st(0,0,0,0)]}};let e=0;const a=[],u=new ce(1,48,32);for(let l=0;l<4;l++){const i=new at(u,new nt({transparent:!0,depthWrite:!1,side:de,blending:O,uniforms:{uA:{value:0}},vertexShader:"varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }",fragmentShader:`uniform float uA; varying vec3 vP;
        void main(){
          float shimmer = 0.75 + 0.25 * sin(vP.x * 40.0) * sin(vP.y * 34.0 + vP.z * 27.0);
          gl_FragColor = vec4(vec3(0.45, 0.85, 1.0) * uA * 0.15 * shimmer, 1.0);
        }`}));i.visible=!1,i.frustumCulled=!1,n.add(i),a.push({mesh:i,t0:-1})}function r(l,i,s){t.uPings.value[e].set(l,i,s,t.uTime.value);const p=a[e];p.mesh.position.set(l,i,s),p.t0=t.uTime.value,p.mesh.visible=!0,e=(e+1)%4,xe()}function h(l){t.uTime.value+=l;const i=t.uTime.value;for(const s of a){if(s.t0<0)continue;const p=i-s.t0;if(p>Gt){s.t0=-1,s.mesh.visible=!1;continue}const c=Math.max(.1,p*It);s.mesh.scale.setScalar(c),s.mesh.material.uniforms.uA.value=Math.exp(-p*.9)}}return{uniforms:t,ping:r,update:h}}const X=-3050,ke=150,pt=n=>ke-n;function $(n){return{x:34*Math.sin(n*.0042)+14*Math.sin(n*.011+2.4),z:34*Math.sin(n*.0031+1.7)+12*Math.sin(n*.009)}}function dt(n,t){let a=58*(1+.3*Math.sin(n*.006+1))+16*Math.sin(3*t+n*.014)+9*Math.sin(7*t-n*.03+2.1)+5*Math.sin(2*t+n*.005+5);return Math.min(110,Math.max(16,a))}const Dt=[-620,-1350,-2100,-2650].map((n,t)=>{const e=1.1+t*1.9,a=$(n),u=dt(n,e)-7;return{x:a.x+Math.cos(e)*u,y:n,z:a.z+Math.sin(e)*u,th:e}}),rt=42e3,wt=7e3,yt=1400;function Ot(n,t=""){return new nt({uniforms:n,transparent:!0,depthWrite:!1,blending:O,vertexShader:`
      attribute float aSize;
      attribute float aTone;
      varying vec3 vW; varying float vDist; varying float vTone;
      void main() {
        vW = position; vTone = aTone;
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        vDist = -mv.z;
        gl_PointSize = clamp(aSize * 190.0 / vDist, 1.0, 9.0);
        gl_Position = projectionMatrix * mv;
      }`,fragmentShader:`
      ${Tt}
      uniform float uAmbient;
      varying vec3 vW; varying float vDist; varying float vTone;
      void main() {
        float a = smoothstep(0.5, 0.12, length(gl_PointCoord - 0.5));
        float son = sonarGlow(vW);
        float lam = lampGlow(vW);
        float wak = wakeGlow(vW);
        vec3 c = son * vec3(0.36, 0.85, 1.0)          // echoes paint cold cyan
               + lam * vec3(1.0, 0.9, 0.72)           // the lamp is warm and honest
               + wak * vec3(0.2, 0.65, 0.6)
               + flareGlow(vW) * vec3(0.55, 1.0, 0.7) // dropped flares hold their ground
               + uAmbient * vec3(0.10, 0.22, 0.34);   // the last daylight, near the top
        c *= (0.65 + vTone * 0.5) * exp(-vDist * 0.0035);
        ${t}
        gl_FragColor = vec4(c, a);
      }`})}function De(n,t){const e={...t,uAmbient:{value:.9}},a=new Float32Array(rt*3),u=new Float32Array(rt),r=new Float32Array(rt);function h(S,v,b){const T=v+Math.random()*(b-v),A=Math.random()*Math.PI*2,f=Math.random()<.8?Math.random()*4:Math.random()*14,C=dt(T,A)-f,W=$(T);a[S*3]=W.x+Math.cos(A)*C,a[S*3+1]=T+(Math.random()-.5)*1.5,a[S*3+2]=W.z+Math.sin(A)*C,u[S]=.7+Math.random()*1.3,r[S]=Math.random()}for(let S=0;S<rt;S++)h(S,-520,220);const l=new Q;l.setAttribute("position",new F(a,3)),l.setAttribute("aSize",new F(u,1)),l.setAttribute("aTone",new F(r,1));const i=new Y(l,Ot(e));i.frustumCulled=!1,n.add(i);const s=new Float32Array(wt*3),p=new Float32Array(wt),c=new Float32Array(wt),g=$(X);for(let S=0;S<wt;S++){const v=Math.random()*Math.PI*2,b=Math.sqrt(Math.random())*(dt(X,v)-2);s[S*3]=g.x+Math.cos(v)*b,s[S*3+1]=X+Math.random()*2.4+Math.sin(b*.4)*1.2,s[S*3+2]=g.z+Math.sin(v)*b,p[S]=.7+Math.random()*1.2,c[S]=Math.random()}const y=new Q;y.setAttribute("position",new F(s,3)),y.setAttribute("aSize",new F(p,1)),y.setAttribute("aTone",new F(c,1));const z=new Y(y,Ot(e));z.frustumCulled=!1,n.add(z);const m=new Float32Array(yt*3),w=new Float32Array(yt),x=new Float32Array(yt);for(let S=0;S<yt;S++){const v=Math.random()*Math.PI*2,b=Math.pow(Math.random(),1.6)*34;m[S*3]=g.x+Math.cos(v)*b,m[S*3+1]=X+1.5+Math.random()*(9-b*.2),m[S*3+2]=g.z+Math.sin(v)*b,w[S]=.9+Math.random()*2.1,x[S]=Math.random()*Math.PI*2}const P=new Q;P.setAttribute("position",new F(m,3)),P.setAttribute("aSize",new F(w,1)),P.setAttribute("aPhase",new F(x,1));const D=new Y(P,new nt({uniforms:e,transparent:!0,depthWrite:!1,blending:O,vertexShader:`
      attribute float aSize; attribute float aPhase;
      uniform float uTime;
      varying float vGlow; varying float vDist;
      void main() {
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        vDist = -mv.z;
        vGlow = 0.55 + 0.45 * sin(uTime * 0.9 + aPhase);
        gl_PointSize = clamp(aSize * 230.0 / vDist, 1.0, 12.0);
        gl_Position = projectionMatrix * mv;
      }`,fragmentShader:`
      varying float vGlow; varying float vDist;
      void main() {
        float a = smoothstep(0.5, 0.1, length(gl_PointCoord - 0.5));
        vec3 c = vec3(0.85, 1.0, 0.92) * vGlow * exp(-vDist * 0.0022);
        gl_FragColor = vec4(c * 0.8, a);
      }`}));D.frustumCulled=!1,n.add(D);let R=0;function E(S,v){e.uAmbient.value=.9*Math.max(0,1-pt(v)/900);const b=3e3;let T=!1;const A=v+240,f=Math.max(v-520,X-4),C=v-260;for(let W=0;W<b;W++){const L=(R+W)%rt;a[L*3+1]>A&&C>f&&(h(L,f,C),T=!0)}R=(R+b)%rt,T&&(l.attributes.position.needsUpdate=l.attributes.aSize.needsUpdate=l.attributes.aTone.needsUpdate=!0)}function V(S,v,b=3.4){const T=$(S.y),A=S.x-T.x,f=S.z-T.z,C=Math.hypot(A,f)||.001,W=Math.atan2(f,A),L=dt(S.y,W)-b;if(C<=L)return null;const k=-A/C,N=-f/C,_=v.x*-k+v.z*-N;return S.x=T.x+A/C*L,S.z=T.z+f/C*L,_>0&&(v.x+=k*_*1.6,v.z+=N*_*1.6),{speed:_}}return{update:E,collide:V,garden:{x:g.x,z:g.z}}}const tt=720,Lt=2400,Ct=420;function Re(n,t){const e={...t},a=new Float32Array(tt*3),u=new Float32Array(tt),r=new Float32Array(tt),h=new Float32Array(tt),l=new Float32Array(tt);function i(v,b,T,A,f=300){const C=Math.random()<.18?2+(Math.random()*4|0):1;for(let W=0;W<C&&v+W<tt;W++){const L=v+W;a[L*3]=b+(Math.random()-.5)*f+W*.9,a[L*3+1]=T+(Math.random()-.5)*f-W*.5,a[L*3+2]=A+(Math.random()-.5)*f+W*.4;const k=Math.random()<.16;u[L]=k?.8+Math.random()*.8:1.6+Math.random()*2.6,r[L]=k?.85+Math.random()*.15:Math.random()*.35,h[L]=Math.random()*Math.PI*2,l[L]=k?4.5+Math.random()*4:.5+Math.random()*.9}return C}for(let v=0;v<tt;)v+=i(v,0,-80,0,420);const s=new Q;s.setAttribute("position",new F(a,3)),s.setAttribute("aSize",new F(u,1)),s.setAttribute("aHue",new F(r,1)),s.setAttribute("aPhase",new F(h,1)),s.setAttribute("aRate",new F(l,1));const p=new Y(s,new nt({uniforms:e,transparent:!0,depthWrite:!1,blending:O,vertexShader:`
      attribute float aSize; attribute float aHue; attribute float aPhase; attribute float aRate;
      uniform float uTime;
      varying float vHue; varying float vPulse; varying vec3 vW; varying float vDist;
      void main() {
        vW = position; vHue = aHue;
        vec3 p = position;
        p.x += sin(uTime * 0.22 + aPhase) * 2.2;        // the slow drift of things
        p.y += sin(uTime * 0.16 + aPhase * 1.7) * 1.6;  // that never touch bottom
        vPulse = pow(0.5 + 0.5 * sin(uTime * aRate + aPhase), 3.0);
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        vDist = -mv.z;
        gl_PointSize = clamp(aSize * (0.4 + vPulse) * 210.0 / vDist, 1.0, 14.0);
        gl_Position = projectionMatrix * mv;
      }`,fragmentShader:`
      ${Tt}
      varying float vHue; varying float vPulse; varying vec3 vW; varying float vDist;
      void main() {
        float a = smoothstep(0.5, 0.08, length(gl_PointCoord - 0.5));
        vec3 cold = vec3(0.3, 0.9, 1.0), warm = vec3(1.0, 0.75, 0.4);
        vec3 col = mix(cold, warm, vHue);
        // a passing wavefront startles them into flaring — the trench answers
        float startle = sonarGlow(vW) * 2.4;
        float b = vPulse * 0.55 + startle + lampGlow(vW) * 0.4 + wakeGlow(vW) * 0.8;
        gl_FragColor = vec4(col * b * exp(-vDist * 0.003), a);
      }`}));p.frustumCulled=!1,n.add(p);const c=new Float32Array(Lt*3);for(let v=0;v<Lt;v++)c[v*3]=(Math.random()-.5)*260,c[v*3+1]=-130+Math.random()*260,c[v*3+2]=(Math.random()-.5)*260;const g=new Q;g.setAttribute("position",new F(c,3));const y=new Y(g,new Rt({color:10467016,size:.55,sizeAttenuation:!0,transparent:!0,opacity:.34,depthWrite:!1}));y.frustumCulled=!1,n.add(y);const z=Dt.length*Ct,m=new Float32Array(z*3),w=new Float32Array(z);Dt.forEach((v,b)=>{for(let T=0;T<Ct;T++){const A=b*Ct+T,f=Math.random()*3.2,C=Math.random()*Math.PI*2;m[A*3]=v.x+Math.cos(C)*f,m[A*3+1]=v.y,m[A*3+2]=v.z+Math.sin(C)*f,w[A]=Math.random()}});const x=new Q;x.setAttribute("position",new F(m,3)),x.setAttribute("aSeed",new F(w,1));const P=new Y(x,new nt({uniforms:e,transparent:!0,depthWrite:!1,blending:O,vertexShader:`
      attribute float aSeed;
      uniform float uTime;
      varying float vK; varying float vDist;
      void main() {
        float h = mod(uTime * (3.5 + aSeed * 4.0) + aSeed * 40.0, 40.0); // rise & recycle
        vK = 1.0 - h / 40.0;
        vec3 p = position + vec3(sin(uTime * 0.8 + aSeed * 50.0) * (1.0 + h * 0.12), h, cos(uTime * 0.7 + aSeed * 60.0) * (1.0 + h * 0.12));
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        vDist = -mv.z;
        gl_PointSize = clamp((1.4 + aSeed) * 170.0 / vDist, 1.0, 8.0);
        gl_Position = projectionMatrix * mv;
      }`,fragmentShader:`
      varying float vK; varying float vDist;
      void main() {
        float a = smoothstep(0.5, 0.1, length(gl_PointCoord - 0.5));
        vec3 c = mix(vec3(1.0, 0.42, 0.12), vec3(1.0, 0.85, 0.5), vK);
        gl_FragColor = vec4(c * vK * 0.9 * exp(-vDist * 0.003), a);
      }`}));P.frustumCulled=!1,n.add(P);const D=6,R=[],E=(()=>{const v=document.createElement("canvas");v.width=v.height=64;const b=v.getContext("2d"),T=b.createRadialGradient(32,32,0,32,32,32);return T.addColorStop(0,"rgba(255,255,255,1)"),T.addColorStop(.25,"rgba(170,255,200,.85)"),T.addColorStop(1,"rgba(0,0,0,0)"),b.fillStyle=T,b.fillRect(0,0,64,64),new Wt(v)})();for(let v=0;v<D;v++){const b=new vt(new gt({map:E,transparent:!0,blending:O,depthWrite:!1,opacity:0}));b.visible=!1,n.add(b),R.push({sp:b,active:!1,life:0,max:22,x:0,y:0,z:0,vy:0,eaten:!1})}function V(v,b,T){const A=R.find(f=>!f.active);return A?(Object.assign(A,{active:!0,eaten:!1,life:A.max,x:v,y:b,z:T,vy:-1.2}),A.sp.visible=!0,A):null}function S(v,b){let T=!1;for(let f=0;f<tt;f++){const C=a[f*3+1]-b.y;(Math.abs(C)>340||Math.abs(a[f*3]-b.x)>340)&&(i(f,b.x,b.y-120,b.z,300),T=!0)}T&&(s.attributes.position.needsUpdate=!0);let A=!1;for(let f=0;f<Lt;f++)(Math.abs(c[f*3+1]-b.y)>140||Math.abs(c[f*3]-b.x)>140||Math.abs(c[f*3+2]-b.z)>140)&&(c[f*3]=b.x+(Math.random()-.5)*260,c[f*3+1]=b.y+(Math.random()<.7?-1:1)*Math.random()*130,c[f*3+2]=b.z+(Math.random()-.5)*260,A=!0);A&&(g.attributes.position.needsUpdate=!0);for(const f of R){if(!f.active)continue;if(f.life-=v,f.vy=Math.max(f.vy-v*.4,-2.2),f.y+=f.vy*v,f.life<=0||f.eaten){f.active=!1,f.sp.visible=!1;continue}const C=Math.min(1,f.life/4)*(.8+.2*Math.sin(performance.now()*.02+f.x));f.sp.position.set(f.x,f.y,f.z),f.sp.scale.setScalar(3.6+C*2.2),f.sp.material.opacity=.7*C}}return{update:S,dropFlare:V,flares:R}}const I=46,Vt=3.3;class We{constructor(t,e){this.state="DEEP",this.head=new G(0,-700,0),this.vel=new G,this.segs=[];for(let i=0;i<I;i++)this.segs.push(new G(0,-700-i*Vt,0));this.target=new G,this.orbitA=0,this.stateT=0,this.speed=8,this.onStrike=null,this.onEatFlare=null,this.uRage={value:0};const a=new Float32Array((I+2)*3),u=new Float32Array(I+2),r=new Float32Array(I+2),h=new Float32Array(I+2);for(let i=0;i<I;i++)u[i]=4.6-i/I*3.6,r[i]=i*.6;u[I]=u[I+1]=2.4,r[I]=0,r[I+1]=3,h[I]=h[I+1]=1,this.geo=new Q,this.geo.setAttribute("position",new F(a,3)),this.geo.setAttribute("aSize",new F(u,1)),this.geo.setAttribute("aPhase",new F(r,1)),this.geo.setAttribute("aEye",new F(h,1)),this.pos=a;const l=new nt({uniforms:{...e,uRage:this.uRage},transparent:!0,depthWrite:!1,blending:O,vertexShader:`
        attribute float aSize; attribute float aPhase; attribute float aEye;
        uniform float uTime;
        varying vec3 vW; varying float vDist; varying float vPulse; varying float vEye;
        void main() {
          vW = position;
          vEye = aEye;
          vPulse = 0.5 + 0.5 * sin(uTime * 0.7 + aPhase);
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          vDist = -mv.z;
          gl_PointSize = clamp(aSize * 210.0 / vDist, 1.5, 26.0);
          gl_Position = projectionMatrix * mv;
        }`,fragmentShader:`
        ${Tt}
        uniform float uRage;
        varying vec3 vW; varying float vDist; varying float vPulse; varying float vEye;
        void main() {
          float a = smoothstep(0.5, 0.1, length(gl_PointCoord - 0.5));
          // its own lights: faint, patient, wrong. Sonar betrays the whole spine.
          float self = 0.10 + vPulse * 0.10 + vEye * 0.5;
          float b = self + sonarGlow(vW) * 3.0 + lampGlow(vW) * 0.8 + flareGlow(vW) * 0.4;
          vec3 calm = mix(vec3(0.5, 0.9, 0.75), vec3(0.9, 1.0, 0.95), vEye);
          vec3 rage = vec3(1.0, 0.28, 0.18);
          gl_FragColor = vec4(mix(calm, rage, uRage) * b * exp(-vDist * 0.0028), a);
        }`});this.points=new Y(this.geo,l),this.points.frustumCulled=!1,t.add(this.points),this._tmp=new G}distTo(t){return this.head.distanceTo(t)}hearPing(){(this.state==="APPROACH"||this.state==="LURK")&&(this.speed+=7)}update(t,e){const{sub:a,attention:u}=e;this.stateT+=t;let r=null;for(const y of e.flares)if(!(!y.active||y.eaten)&&(this._tmp.set(y.x,y.y,y.z),this.head.distanceTo(this._tmp)<260)){r=y;break}const h=this.distTo(a);switch(this.state){case"DEEP":{this.target.set(a.x,Math.min(a.y-260,-640),a.z),this.speed=7,e.depth>640&&this._go("LURK");break}case"LURK":{this.orbitA+=t*.14;const y=$(a.y-190);this.target.set(y.x+Math.cos(this.orbitA)*34,a.y-190,y.z+Math.sin(this.orbitA)*34),this.speed=9,r&&(this.target.set(r.x,r.y,r.z),this.speed=18),u>55&&this._go("APPROACH");break}case"APPROACH":{r?(this.target.set(r.x,r.y,r.z),this.speed=22):(this.target.copy(a),this.speed=Math.min(this.speed+t*3,17)),!r&&u>82&&h<95&&(this._go("STRIKE"),Te()),u<30&&!r&&this._go("LURK");break}case"STRIKE":{this.target.copy(a),this.speed=36,h<7&&(this.onStrike&&this.onStrike(),this._go("FLEE")),this.stateT>9&&this._go("APPROACH");break}case"FLEE":{const y=$(a.y-320);this.target.set(y.x,Math.max(a.y-320,X+60),y.z),this.speed=26,this.stateT>11&&this._go("LURK");break}}r&&this.head.distanceTo(this._tmp.set(r.x,r.y,r.z))<9&&(r.eaten=!0,this.onEatFlare&&this.onEatFlare(),this._go("FLEE")),this.uRage.value+=((this.state==="STRIKE"?1:0)-this.uRage.value)*Math.min(1,t*4),this._tmp.copy(this.target).sub(this.head);const l=this._tmp.length()||.001;this._tmp.divideScalar(l);const i=Math.min(1,t*(this.state==="STRIKE"?2.6:1.1));this.vel.lerp(this._tmp.multiplyScalar(this.speed),i),this.head.addScaledVector(this.vel,t);const s=performance.now()*.001;this.head.x+=Math.sin(s*1.7)*t*6,this.head.z+=Math.cos(s*1.4)*t*6;let p=this.head;for(let y=0;y<I;y++){const z=this.segs[y],m=p.x-z.x,w=p.y-z.y,x=p.z-z.z,P=Math.hypot(m,w,x)||.001,D=(P-Vt)/P;z.x+=m*D,z.y+=w*D,z.z+=x*D,z.x+=Math.sin(s*2.2-y*.42)*.06*(1+y*.04),this.pos[y*3]=z.x,this.pos[y*3+1]=z.y,this.pos[y*3+2]=z.z,p=z}const c=this.vel.x/(this.vel.length()||1),g=this.vel.z/(this.vel.length()||1);this.pos[I*3]=this.head.x+c*2-g*1.6,this.pos[I*3+1]=this.head.y+1.2,this.pos[I*3+2]=this.head.z+g*2+c*1.6,this.pos[(I+1)*3]=this.head.x+c*2+g*1.6,this.pos[(I+1)*3+1]=this.head.y+1.2,this.pos[(I+1)*3+2]=this.head.z+g*2-c*1.6,this.geo.attributes.position.needsUpdate=!0}_go(t){this.state=t,this.stateT=0}}function Ie(n){const e=new xt,a={uTime:{value:0},uFade:{value:1}},u=new nt({uniforms:a,transparent:!0,depthWrite:!1,blending:O,side:qt,vertexShader:`
      varying vec2 vUv; varying float vSeed;
      attribute float aSeed;
      void main() { vUv = uv; vSeed = aSeed; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,fragmentShader:`
      uniform float uTime; uniform float uFade;
      varying vec2 vUv; varying float vSeed;
      void main() {
        // interference of two scrolling waves = the caustic shimmer
        float c = sin(vUv.x * 21.0 + uTime * 0.7 + vSeed * 40.0)
                * sin(vUv.x * 13.0 - uTime * 0.43 + vSeed * 17.0);
        c = 0.55 + 0.45 * c;
        float body = smoothstep(0.0, 0.28, vUv.x) * smoothstep(1.0, 0.72, vUv.x); // soft shaft edges
        float fall = pow(vUv.y, 1.7);                                             // dies with depth
        gl_FragColor = vec4(vec3(0.35, 0.62, 0.85) * c * body * fall * uFade * 0.14, 1.0);
      }`});for(let h=0;h<14;h++){const l=9+Math.random()*16,i=new ue(l,320,1,1),s=new Float32Array(i.attributes.position.count).fill(Math.random());i.setAttribute("aSeed",new F(s,1));const p=new at(i,u),c=h/14*Math.PI*2,g=20+Math.random()*46;p.position.set(Math.cos(c)*g,80,Math.sin(c)*g),p.rotation.y=c+Math.PI/2+(Math.random()-.5)*.5,p.rotation.z=(Math.random()-.5)*.14,e.add(p)}e.renderOrder=-1,n.add(e);function r(h,l){a.uTime.value+=h,a.uFade.value=Math.max(0,1-l/520),e.visible=a.uFade.value>.01}return{update:r}}const ot=320;function Ge(n,t){const e=new Float32Array(ot*3),a=new Float32Array(ot*3),u=new Float32Array(ot);for(let c=0;c<ot;c++)e[c*3]=(Math.random()-.5)*90,e[c*3+1]=-120-Math.random()*60,e[c*3+2]=(Math.random()-.5)*90,a[c*3]=(Math.random()-.5)*4,a[c*3+2]=(Math.random()-.5)*4,u[c]=Math.random()*Math.PI*2;const r=new Q;r.setAttribute("position",new F(e,3)),r.setAttribute("aPhase",new F(u,1));const h=new Y(r,new nt({uniforms:t,transparent:!0,depthWrite:!1,blending:O,vertexShader:`
      attribute float aPhase;
      uniform float uTime;
      varying vec3 vW; varying float vDist; varying float vTw;
      void main() {
        vW = position;
        vTw = 0.6 + 0.4 * sin(uTime * 7.0 + aPhase);   // scale flicker = tail-beat
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        vDist = -mv.z;
        gl_PointSize = clamp(1.5 * vTw * 190.0 / vDist, 1.0, 6.0);
        gl_Position = projectionMatrix * mv;
      }`,fragmentShader:`
      ${Tt}
      varying vec3 vW; varying float vDist; varying float vTw;
      void main() {
        float a = smoothstep(0.5, 0.1, length(gl_PointCoord - 0.5));
        // silver bodies: mostly your light reflected, plus a whisper of their own
        float b = 0.06 * vTw + sonarGlow(vW) * 2.0 + lampGlow(vW) * 1.6 + flareGlow(vW) * 0.5 + wakeGlow(vW);
        gl_FragColor = vec4(vec3(0.75, 0.88, 0.92) * b * exp(-vDist * 0.003), a);
      }`}));h.frustumCulled=!1,n.add(h);const l=12;let i=0;const s=new G(0,-140,0);function p(c,g){s.y+=(g.sub.y-90-s.y)*Math.min(1,c*.4);const y=$(s.y);s.x+=(y.x-s.x)*Math.min(1,c*.5),s.z+=(y.z-s.z)*Math.min(1,c*.5);for(let z=0;z<ot;z++){const m=z*3;let w=0,x=0,P=0,D=0,R=0,E=0,V=0,S=0,v=0,b=0;for(let L=0;L<l;L++){const k=(i+z*l+L)%ot*3;if(k===m)continue;const N=e[m]-e[k],_=e[m+1]-e[k+1],U=e[m+2]-e[k+2],J=N*N+_*_+U*U;if(!(J>900)&&(b++,V+=e[k],S+=e[k+1],v+=e[k+2],D+=a[k],R+=a[k+1],E+=a[k+2],J<3.5*3.5&&J>1e-4)){const it=1/J;w+=N*it,x+=_*it,P+=U*it}}let T=w*6+D*.06,A=x*6+R*.06,f=P*6+E*.06;b>0&&(T+=(V/b-e[m])*.35,A+=(S/b-e[m+1])*.35,f+=(v/b-e[m+2])*.35),T+=(s.x-e[m])*.12,A+=(s.y-e[m+1])*.12,f+=(s.z-e[m+2])*.12;for(const L of g.pings){if(L.w<0)continue;const k=g.time-L.w;if(k<0||k>Gt)continue;const N=k*It,_=e[m]-L.x,U=e[m+1]-L.y,J=e[m+2]-L.z,it=Math.sqrt(_*_+U*U+J*J)||.001,Ht=Math.exp(-((it-N)*(it-N))/60);if(Ht>.05){const At=Ht*42/it;T+=_*At,A+=U*At,f+=J*At}}{const L=e[m]-g.levHead.x,k=e[m+1]-g.levHead.y,N=e[m+2]-g.levHead.z,_=L*L+k*k+N*N;if(_<6400){const U=260/(_+20);T+=L*U,A+=k*U,f+=N*U}}a[m]+=T*c,a[m+1]+=A*c,a[m+2]+=f*c;const C=Math.sqrt(a[m]*a[m]+a[m+1]*a[m+1]+a[m+2]*a[m+2])||.001,W=14;C>W&&(a[m]*=W/C,a[m+1]*=W/C,a[m+2]*=W/C),e[m]+=a[m]*c,e[m+1]+=a[m+1]*c,e[m+2]+=a[m+2]*c}i=(i+7)%ot,r.attributes.position.needsUpdate=!0}return{update:p}}const Nt=[{d:320,id:"LOG 01",text:"VELA-1, day one. Meridian says this survey is routine. The trench does not feel routine. It feels attended."},{d:700,id:"LOG 02",text:"Something answered my sonar today. Same shape as my ping, half a second late. Like an echo... learning."},{d:1050,id:"LOG 03",text:"I have stopped pinging. It comes when I ping. Brilliant, Maren — now you are navigating blind AND deaf."},{d:1420,id:"LOG 04",text:"Dropped ballast to climb. It circled below me the whole way. It is not attacking. It is herding."},{d:1800,id:"LOG 05",text:"New theory. It does not want the sub. It wants the LIGHT. It carries its own — old ones, dim, half dead. I think it has been alone down here for a very long time."},{d:2180,id:"LOG 06",text:"If you are hearing this, you followed me. Of course you did. Listen: lamp OFF when it is near. Give it flares. It is gentle with things that glow."},{d:2560,id:"LOG 07",text:"There is light below me. Not mine. A whole field of it, breathing. It is the most beautiful thing I have ever seen. I am going down."},{d:2930,id:"LOG 08",text:"Final buoy. My cell is dead, but the garden keeps my lamp lit. Tell Meridian I am not lost. Some things fall where they belong."}];function Bt(n){const t=document.createElement("canvas");t.width=t.height=64;const e=t.getContext("2d"),a=e.createRadialGradient(32,32,0,32,32,32);for(const[u,r]of n)a.addColorStop(u,r);return e.fillStyle=a,e.fillRect(0,0,64,64),new Wt(t)}function _e(n,t){const e=Bt([[0,"rgba(255,220,150,1)"],[.3,"rgba(255,170,60,.8)"],[1,"rgba(0,0,0,0)"]]),a=Nt.map((w,x)=>{const P=150-w.d,D=.6+x*2.3,R=$(P),E=dt(P,D)-6,V=new vt(new gt({map:e,transparent:!0,blending:O,depthWrite:!1}));return V.position.set(R.x+Math.cos(D)*E,P,R.z+Math.sin(D)*E),n.add(V),{sp:V,log:w,played:!1,i:x}}),u=260,r=new Float32Array(u*3);for(let x=0;x<u;x++){const P=-1270-Math.random()*90,D=3.1+(Math.random()-.5)*1.2,R=dt(P,D)-Math.random()*5,E=$(P);r[x*3]=E.x+Math.cos(D)*R,r[x*3+1]=P,r[x*3+2]=E.z+Math.sin(D)*R}const h=new Q;h.setAttribute("position",new F(r,3));const l=new Y(h,new Rt({color:9082016,size:1.1,transparent:!0,opacity:.55,depthWrite:!1}));l.frustumCulled=!1,n.add(l);const i=$(X),s=new xt,p=new Mt({color:1582123}),c=new at(new jt(1.05,2.4,6,12),p);c.rotation.x=Math.PI/2;const g=new at(new Qt(.5,.7,.8,10),p);g.position.set(0,1.1,.2);const y=new vt(new gt({map:Bt([[0,"rgba(255,214,150,1)"],[.4,"rgba(255,170,90,.6)"],[1,"rgba(0,0,0,0)"]]),transparent:!0,blending:O,depthWrite:!1,opacity:.85}));y.position.set(0,.15,-1.9),y.scale.setScalar(2.2),s.add(c,g,y),s.position.set(i.x+9,X+1.6,i.z-6),s.rotation.set(.12,2.1,.18),n.add(s);let z=0;function m(w,x,P,D){const R=performance.now()*.001;for(const E of a){const V=E.played?.35:Math.sin(R*3.2+E.i)>.4?1:.15;E.sp.material.opacity=.85*V,E.sp.scale.setScalar(2.4+V*1.6),!E.played&&D&&P>=E.log.d&&(E.played=!0,z++,Le(Math.min(9,2+E.log.text.length*.052)),t.log(E.log.id,`VELA-1 · ${E.log.d}m`,E.log.text))}}return{update:m,get found(){return z},total:Nt.length}}const He=(n,t,e)=>Math.max(t,Math.min(e,n));function Ut(n){const t=document.createElement("canvas");t.width=t.height=64;const e=t.getContext("2d"),a=e.createRadialGradient(32,32,0,32,32,32);for(const[u,r]of n)a.addColorStop(u,r);return e.fillStyle=a,e.fillRect(0,0,64,64),new Wt(t)}class Oe{constructor(t,e,a){this.camera=e,this.pos=new G(0,0,0),this.vel=new G(0,-2,0),this.yaw=0,this.pitch=-.25,this.roll=0,this.aim=new G(0,0,-1),this.thrust=0,this.boost=!1,this.brake=!1,this.lampOn=!0,this.steer={x:0,y:0},this.sonarU=a;const u=new xt,r=new Mt({color:1121314}),h=new at(new jt(1.05,2.4,6,12),r);h.rotation.x=Math.PI/2;const l=new at(new Qt(.5,.7,.8,10),r);l.position.set(0,1.1,.2);const i=new at(new pe(.55,.14,8,18),new Mt({color:659990}));i.position.z=2.2,u.add(h,l,i);const s=new vt(new gt({map:Ut([[0,"rgba(255,214,150,1)"],[.4,"rgba(255,170,90,.6)"],[1,"rgba(0,0,0,0)"]]),transparent:!0,blending:O,depthWrite:!1,opacity:.9}));s.position.set(0,.15,-1.9),s.scale.setScalar(1.15),s.material.opacity=.7,this.beacon=new vt(new gt({map:Ut([[0,"rgba(255,90,70,1)"],[1,"rgba(0,0,0,0)"]]),transparent:!0,blending:O,depthWrite:!1})),this.beacon.position.set(0,1.8,.2),this.beacon.scale.setScalar(1.4),u.add(s,this.beacon),this.beams=[];const p=new Mt({color:16771524,transparent:!0,opacity:.022,blending:O,depthWrite:!1,side:qt,fog:!1});for(const y of[-.9,.9]){const z=new at(new fe(5.5,52,20,1,!0),p);z.rotation.x=Math.PI/2,z.position.set(y,0,-26-1.4);const m=new xt;m.add(z),u.add(m),this.beams.push(m)}t.add(u),this.g=u;const c=240;this.bubbles={i:0,pos:new Float32Array(c*3),life:new Float32Array(c),n:c},this.bubbles.pos.fill(1e5);const g=new Q;g.setAttribute("position",new F(this.bubbles.pos,3)),this.bubblePts=new Y(g,new Rt({color:12576495,size:.5,transparent:!0,opacity:.5,depthWrite:!1})),this.bubblePts.frustumCulled=!1,t.add(this.bubblePts),this.camPos=new G(0,4,18),this.camLook=new G,this._camWant=new G,this._camLookWant=new G,this.fovK=62,this.shake=0}addShake(t){this.shake=Math.min(1.6,this.shake+t)}update(t){this.yaw-=this.steer.x*1.9*t;const e=He(-this.steer.y*1.5,-1.25,1.25);this.pitch+=(e-this.pitch)*Math.min(1,t*5),this.roll+=(-this.steer.x*.5-this.roll)*Math.min(1,t*4);const a=Math.cos(this.pitch);this.aim.set(-Math.sin(this.yaw)*a,Math.sin(this.pitch),-Math.cos(this.yaw)*a);const u=this.boost?30:15;this.thrust>0&&this.vel.addScaledVector(this.aim,u*this.thrust*t),this.vel.y-=2.6*t;const r=this.brake?2.4:.55;this.vel.multiplyScalar(Math.exp(-r*t));const h=this.vel.length(),l=this.boost?27:17;h>l&&this.vel.multiplyScalar(l/h),this.pos.addScaledVector(this.vel,t),this.g.position.copy(this.pos),this.g.rotation.set(0,0,0),this.g.rotateY(this.yaw),this.g.rotateX(-this.pitch),this.g.rotateZ(this.roll),this.beacon.material.opacity=Math.sin(performance.now()*.006)>.6?.95:.06;for(const g of this.beams)g.visible=this.lampOn;const i=this.sonarU;if(i.uSubPos.value.copy(this.pos),i.uSubSpeed.value=h,i.uLampPos.value.copy(this.pos).addScaledVector(this.aim,1.6),i.uLampDir.value.copy(this.aim),i.uLampOn.value+=((this.lampOn?1:0)-i.uLampOn.value)*Math.min(1,t*8),this.thrust>0&&Math.random()<t*40){const g=this.bubbles,y=g.i;g.i=(g.i+1)%g.n,g.pos[y*3]=this.pos.x-this.aim.x*2.4+(Math.random()-.5)*.6,g.pos[y*3+1]=this.pos.y-this.aim.y*2.4,g.pos[y*3+2]=this.pos.z-this.aim.z*2.4+(Math.random()-.5)*.6,g.life[y]=1.6}const s=this.bubbles;for(let g=0;g<s.n;g++)s.life[g]<=0||(s.life[g]-=t,s.pos[g*3+1]+=t*3.2,s.life[g]<=0&&(s.pos[g*3+1]=1e5));this.bubblePts.geometry.attributes.position.needsUpdate=!0;const p=13+h*.35;this._camWant.copy(this.pos).addScaledVector(this.aim,-p),this._camWant.y+=3.4,this.camPos.lerp(this._camWant,1-Math.exp(-5.5*t)),this._camLookWant.copy(this.pos).addScaledVector(this.aim,9),this.camLook.lerp(this._camLookWant,1-Math.exp(-7*t)),this.shake>.002&&(this.camPos.x+=(Math.random()*2-1)*this.shake*.5,this.camPos.y+=(Math.random()*2-1)*this.shake*.3,this.shake*=Math.exp(-6*t)),this.camera.position.copy(this.camPos),this.camera.lookAt(this.camLook);const c=this.boost?72:62;this.fovK+=(c-(this.fovK||62))*Math.min(1,t*4),this.camera.fov=this.fovK,this.camera.updateProjectionMatrix()}}function Ve(n,t={}){n.innerHTML=`
    <div id="bootTag">HADAL · DESCENT</div>

    <div id="depthPanel" class="panel">
      <label>DEPTH</label>
      <div id="depthNum">150<small>m</small></div>
      <div id="depthRate">▼ 0.0 m/s</div>
    </div>

    <div id="status" class="panel">
      <div class="bar-row"><label>HULL</label><div class="track"><i id="hullBar"></i></div></div>
      <div class="bar-row"><label>CELL</label><div class="track"><i id="cellBar"></i></div></div>
      <div class="bar-row"><label>FLARES</label><div id="flarePips"></div></div>
    </div>

    <div id="presence" class="panel">
      <label>PRESENCE</label>
      <div id="presTrack"><i id="presBar"></i></div>
      <div id="presWord">STILL</div>
    </div>

    <div id="pingUI"><svg viewBox="0 0 40 40"><circle id="pingArc" cx="20" cy="20" r="16"/></svg><span>SONAR</span></div>

    <div id="zoneCard"><div class="zc-title" id="zcTitle"></div><div class="zc-sub" id="zcSub"></div></div>
    <div id="radioLog"><div class="rl-head"><span class="rl-dot"></span><span id="rlId"></span><span id="rlMeta"></span></div><div id="rlText"></div></div>
    <div id="ventTag">◈ VENT FIELD — CELLS RECHARGING</div>
    <div id="hurt"></div>
    <div id="hint">move mouse steer · <b>W</b> thrust · <b>SHIFT</b> burst · <b>S</b> hold · <b>SPACE/CLICK</b> ping · <b>F</b> lamp · <b>E</b> flare</div>

    <div id="intro"><div class="card">
      <div class="h-title">HADAL</div>
      <div class="h-tag">the trench remembers light</div>
      <div class="h-body">
        Six months ago, VELA-1 went down this trench and never came back up.<br>
        The pilot was your sister. Meridian Salvage wrote her off. You stole the other sub.<br><br>
        Her log buoys are still transmitting, one per depth band. Follow them down.<br>
        Your sonar is the only sight you have — and every ping is a voice in the dark.<br>
        Something very old and very long lives down there. <b>It listens.</b>
      </div>
      <div class="h-keys">
        <span><i>MOUSE</i> steer</span><span><i>W · SHIFT</i> thrust · burst</span>
        <span><i>SPACE</i> ping</span><span><i>F</i> lamp</span><span><i>E</i> drop flare</span>
      </div>
      <button id="diveBtn">FLOOD THE TANKS</button>
    </div></div>

    <div id="endscreen"><div class="card">
      <div class="h-title" id="endTitle"></div>
      <div class="h-tag" id="endSub"></div>
      <div class="end-stats" id="endStats"></div>
      <button id="againBtn">DIVE AGAIN</button>
    </div></div>
  `;const e=w=>n.querySelector(w),a={depth:e("#depthNum"),rate:e("#depthRate"),hull:e("#hullBar"),cell:e("#cellBar"),pips:e("#flarePips"),presBar:e("#presBar"),presWord:e("#presWord"),presence:e("#presence"),pingArc:e("#pingArc"),pingUI:e("#pingUI"),zone:e("#zoneCard"),zcTitle:e("#zcTitle"),zcSub:e("#zcSub"),radio:e("#radioLog"),rlId:e("#rlId"),rlMeta:e("#rlMeta"),rlText:e("#rlText"),vent:e("#ventTag"),hurt:e("#hurt"),intro:e("#intro"),end:e("#endscreen"),endTitle:e("#endTitle"),endSub:e("#endSub"),endStats:e("#endStats")};e("#diveBtn").onclick=()=>{a.intro.classList.add("gone"),t.onStart&&t.onStart()},e("#againBtn").onclick=()=>location.reload();const u=2*Math.PI*16;a.pingArc.style.strokeDasharray=`${u}`;let r=0,h=0;function l(w,x){a.zcTitle.textContent=w,a.zcSub.textContent=x,a.zone.classList.add("show"),r=3.6}function i(){h=.5}const s=[];let p=null;function c(w,x,P){s.push({id:w,meta:x,text:P})}function g(w){if(!p){const x=s.shift();if(!x){a.radio.classList.remove("show");return}p={...x,i:0,hold:4.5},a.rlId.textContent=`◉ ${x.id} RECOVERED`,a.rlMeta.textContent=x.meta,a.rlText.textContent="",a.radio.classList.add("show")}p.i<p.text.length?(p.i=Math.min(p.text.length,p.i+w*34),a.rlText.textContent=p.text.slice(0,Math.floor(p.i))+(Math.floor(p.i)<p.text.length?"▌":"")):(p.hold-=w,p.hold<=0&&(p=null,s.length||a.radio.classList.remove("show")))}const y=[[.18,"STILL",""],[.45,"LISTENING",""],[.72,"AWARE","warn"],[.92,"HUNTING","bad"],[2,"STRIKE","bad"]];function z(w,x){a.depth.innerHTML=`${Math.max(0,Math.round(w.depth))}<small>m</small>`,a.rate.textContent=`${w.rate>=0?"▼":"▲"} ${Math.abs(w.rate).toFixed(1)} m/s`,a.hull.style.width=`${Math.max(0,w.hull)}%`,a.hull.className=w.hull>55?"":w.hull>25?"mid":"low",a.cell.style.width=`${Math.max(0,w.battery)}%`,a.cell.className=w.battery>30?"cell":"cell low",a.pips.innerHTML="◆".repeat(w.flares)+"<em>"+"◇".repeat(Math.max(0,6-w.flares))+"</em>";const P=Math.max(0,Math.min(1,w.presence));a.presBar.style.height=`${P*100}%`;const D=y.find(E=>P<=E[0])||y[4];a.presWord.textContent=D[1],a.presence.className=`panel ${D[2]}`,a.presence.classList.toggle("pulse",P>.72);const R=Math.max(0,Math.min(1,w.pingCd));a.pingArc.style.strokeDashoffset=`${u*R}`,a.pingUI.classList.toggle("ready",R<=0),r>0&&(r-=x,r<=0&&a.zone.classList.remove("show")),h>0&&(h-=x,a.hurt.style.opacity=Math.max(0,h*1.6).toFixed(2)),a.vent.classList.toggle("show",!!w.nearVent),g(x)}function m(w,x){a.endTitle.textContent=x?"TOUCHDOWN":"HULL LOST",a.endTitle.className=`h-title ${x?"win":"lose"}`,a.endSub.textContent=x?w.logs>=w.logsTotal?"VELA-1 sits in the garden, lamp lit. she was right. you found every word she left you":"the garden takes your light, and gives it back — VELA-1 rests here":`the trench keeps what it is given · ${Math.round(w.depth)}m`,a.endStats.innerHTML=`
      <div><span>${Math.round(w.maxDepth)}m</span>deepest</div>
      <div><span>${Math.floor(w.time/60)}:${String(Math.floor(w.time%60)).padStart(2,"0")}</span>in the water</div>
      <div><span>${w.logs}/${w.logsTotal}</span>logs found</div>
      <div><span>${w.pings}</span>pings</div>
      <div><span>${w.strikes}</span>strikes survived</div>`,a.end.classList.add("show")}return{update:z,zone:l,hurt:i,showEnd:m,log:c}}const Yt=document.getElementById("gl"),Ne=document.getElementById("hud");window.HD={ready:!1,stats:{},test:{}};const B=ye(Yt),q=Fe(B.scene),$t=De(B.scene,q.uniforms),lt=Re(B.scene,q.uniforms),H=new We(B.scene,q.uniforms),Be=Ie(B.scene),Ue=Ge(B.scene,q.uniforms),d=new Oe(B.scene,B.camera,q.uniforms);Me();const o={phase:"intro",time:0,hull:100,battery:100,flares:6,attention:0,pingCd:0,pings:0,strikes:0,maxDepth:pt(0),nearVent:!1,wasNearVent:!1,heartT:0},bt=[{d:380,t:"MIDNIGHT",s:"no sun has ever been here"},{d:1200,t:"ABYSSAL",s:"the pressure sings against the hull"},{d:2300,t:"HADAL",s:"the trench remembers light"},{d:3050,t:"THE FLOOR",s:"something down here is glowing"}];let mt=0;function Zt(){o.phase==="intro"&&(o.phase="dive",d.brake=!1,j.zone("TWILIGHT","the last of the light — dive"))}const j=Ve(Ne,{onStart:Zt}),ut=_e(B.scene,j);function _t(){o.phase!=="dive"||o.pingCd>0||(o.pingCd=1.4,o.pings++,o.battery=Math.max(0,o.battery-1.2),o.attention=Math.min(100,o.attention+16),q.ping(d.pos.x,d.pos.y,d.pos.z),H.hearPing())}function Xt(){o.phase!=="dive"||o.flares<=0||!lt.dropFlare(d.pos.x-d.aim.x*4,d.pos.y-d.aim.y*4-1.5,d.pos.z-d.aim.z*4)||(o.flares--,o.attention=Math.min(100,o.attention+6),Se())}H.onStrike=()=>{o.hull-=26,o.strikes++,o.attention=25,d.addShake(1.3),j.hurt()};H.onEatFlare=()=>{o.attention=Math.max(0,o.attention-30),kt()};window.addEventListener("mousemove",n=>{const t=n.clientX/window.innerWidth*2-1,e=n.clientY/window.innerHeight*2-1,a=u=>Math.abs(u)<.08?0:(u-Math.sign(u)*.08)/.92;d.steer.x=a(Math.max(-1,Math.min(1,t))),d.steer.y=a(Math.max(-1,Math.min(1,e)))});Yt.addEventListener("mousedown",n=>{n.button===0&&_t()});window.addEventListener("keydown",n=>{const t=n.key.toLowerCase();t==="w"&&(d.thrust=1),t==="s"&&(d.brake=!0),t==="shift"&&(d.boost=!0),t===" "&&(_t(),n.preventDefault()),t==="f"&&(d.lampOn=!d.lampOn),t==="e"&&Xt(),t==="r"&&(o.phase==="won"||o.phase==="lost")&&location.reload()});window.addEventListener("keyup",n=>{const t=n.key.toLowerCase();t==="w"&&(d.thrust=0),t==="s"&&(d.brake=!1),t==="shift"&&(d.boost=!1)});window.addEventListener("resize",B.setSize);function Jt(){o.phase="won",Pe(),j.showEnd(ee(),!0)}function te(){o.phase="lost",ze(),d.addShake(1.6),j.showEnd(ee(),!1)}function ee(){return{depth:pt(d.pos.y),maxDepth:o.maxDepth,time:o.time,pings:o.pings,strikes:o.strikes,logs:ut.found,logsTotal:ut.total}}let Kt=performance.now(),Et=0;function ae(n){const t=Math.max(0,Math.min((n-Kt)/1e3,.05));Kt=n;const e=pt(d.pos.y),a=o.phase==="dive";if(o.phase==="intro"&&(d.brake=!0,d.thrust=0),a){o.time+=t,o.maxDepth=Math.max(o.maxDepth,e),mt<bt.length&&e>=bt[mt].d&&(j.zone(bt[mt].t,bt[mt].s),kt(),mt++);const h=d.boost&&d.thrust>0&&o.battery>0;o.battery<=0&&(d.lampOn=!1,d.boost=!1),o.battery=Math.min(100,o.battery+t*(.45-(d.lampOn?.7:0)-(h?4:0))),Ce(h),o.attention=Math.max(0,Math.min(100,o.attention+t*((d.thrust>0?2.2:0)+(h?7:0)+(d.lampOn?.8:0)-(o.nearVent?12:4.2)))),o.nearVent=Dt.some(s=>Math.abs(s.y-d.pos.y)<30&&Math.hypot(s.x-d.pos.x,s.z-d.pos.z)<26),o.nearVent&&(o.battery=Math.min(100,o.battery+t*9),o.hull=Math.min(100,o.hull+t*2),o.wasNearVent||kt()),o.wasNearVent=o.nearVent;const l=$t.collide(d.pos,d.vel);l&&l.speed>4.5?(o.hull-=(l.speed-4.5)*2.6,o.attention=Math.min(100,o.attention+l.speed*1.4),d.addShake(.25+l.speed*.04),j.hurt(),Pt()):l&&Et<=0&&(Et=.7,Pt()),Et-=t,H.update(t,{sub:d.pos,depth:e,attention:o.attention,flares:lt.flares,nearVent:o.nearVent});const i=Ft();i>.72&&(o.heartT-=t,o.heartT<=0&&(o.heartT=Math.max(.45,1.05-i*.5),Ae())),d.pos.y<=X+5&&(-d.vel.y>10&&(o.hull-=20,d.vel.y*=-.3,d.addShake(.8),j.hurt(),Pt()),o.hull>0&&Jt()),o.hull<=0&&te(),o.pingCd=Math.max(0,o.pingCd-t)}const u=q.uniforms.uFlares.value;let r=0;for(const h of lt.flares){if(r>=3)break;h.active&&!h.eaten&&u[r++].set(h.x,h.y,h.z,Math.min(1,h.life/4))}for(;r<3;r++)u[r].w=0;q.update(t),d.update(t),$t.update(t,d.pos.y),lt.update(t,d.pos),Be.update(t,e),Ue.update(t,{sub:d.pos,levHead:H.head,pings:q.uniforms.uPings.value,time:q.uniforms.uTime.value}),ut.update(t,d.pos,e,a),!a&&o.phase!=="intro"&&H.update(t,{sub:d.pos,depth:e,attention:0,flares:lt.flares,nearVent:!1}),o.phase==="intro"&&H.update(t,{sub:d.pos,depth:0,attention:0,flares:lt.flares,nearVent:!1}),B.setDepthK(e/1600),Ee(Math.min(1,e/2800)),j.update({depth:e,rate:-d.vel.y,hull:o.hull,battery:o.battery,flares:o.flares,presence:Ft(),pingCd:o.pingCd/1.4,nearVent:o.nearVent},t),window.HD.stats={phase:o.phase,depth:Math.round(e),rate:+(-d.vel.y).toFixed(1),hull:Math.round(o.hull),battery:Math.round(o.battery),attention:Math.round(o.attention),presence:+Ft().toFixed(2),lev:{state:H.state,dist:Math.round(H.distTo(d.pos))},flares:o.flares,pings:o.pings,strikes:o.strikes,logs:ut.found,pos:[Math.round(d.pos.x),Math.round(d.pos.y),Math.round(d.pos.z)]},B.render(),requestAnimationFrame(ae)}function Ft(){if(H.state==="STRIKE")return 1;const n=Math.max(0,1-H.distTo(d.pos)/300);return Math.max(o.attention/100*.66,n*(H.state==="APPROACH"?1:.8))}requestAnimationFrame(ae);window.HD.test={start:()=>{document.getElementById("intro")?.classList.add("gone"),Zt()},ping:()=>{o.pingCd=0,_t()},flare:()=>Xt(),lamp:n=>{d.lampOn=n??!d.lampOn},thrust:(n=1)=>{d.thrust=n},steer:(n=0,t=0)=>{d.steer.x=n,d.steer.y=t},warp:(n=1e3)=>{const t=150-n,e=$(t);return d.pos.set(e.x,t,e.z),d.vel.set(0,-2,0),pt(d.pos.y)},attention:(n=90)=>{o.attention=n},battery:(n=100)=>{o.battery=n},damage:(n=20)=>{o.hull-=n,j.hurt()},win:()=>Jt(),lose:()=>te(),levInfo:()=>({state:H.state,dist:Math.round(H.distTo(d.pos)),head:H.head.toArray().map(n=>Math.round(n))}),logs:()=>({found:ut.found,total:ut.total})};requestAnimationFrame(()=>{window.HD.ready=!0,console.log(`[HD] ready — depth=${Math.round(pt(d.pos.y))}m hull=${o.hull}`)});

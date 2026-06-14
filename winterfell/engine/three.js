// Single source of the three.js (WebGPU build) used by THE LONG NIGHT.
// Imported by full CDN URL so vite's dev resolver leaves it untouched and we
// stay fully isolated from the repo's node_modules three@0.160 (which has no
// WebGPU build). Pinned to 0.180.0 — verified to ship three.webgpu.js + TSL.
export * from 'https://cdn.jsdelivr.net/npm/three@0.180.0/build/three.webgpu.js';

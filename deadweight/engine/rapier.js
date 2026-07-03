// rapier shim — the physics engine, pinned. rapier3d-compat embeds its WASM
// as base64 so one ESM import works from CDN with no fetch permissions.
export * from 'https://cdn.jsdelivr.net/npm/@dimforge/rapier3d-compat@0.14.0/+esm';

// engine/core/state.js
// Owns shared mutable runtime state across engine/core modules.
// Must not import anything from core; exports a single mutable context object.

export const state = {
  // Timeline & Canvas dimensions
  TL: null,
  W: 0,
  H: 0,
  width: 0,
  height: 0,

  // Three.js core rendering objects
  renderer: null,
  scene: null,
  camera: null,
  comp: null,
  cg: null,
  camLook: null,
  camInfo: {},

  // Postprocessing composer and passes
  composer: null,
  bloom: null,
  gtao: null,
  bokeh: null,
  grade: null,

  // Lighting
  sun: null,
  hemi: null,
  amb: null,
  baseHemi: 1,
  LA: null,
  LB: null,

  // Environment & Reflections
  ENV: null,
  skyTex: {},

  // Assets & Character registries/caches
  sets: {},
  chars: {},
  sceneCache: new Map(), // dead code from original world.js (preserved)
  MAPS: {},
  KITS: {},
  COVERS: {},
  lastState: {},

  // Camera occlusion caches
  occluders: new Map(),
  proxyCache: new Map(),

  // Portals
  PORT: {},
  prt: null,
  pcam: null,
  _uwBG: null,

  // Living set, NPC extras, crowds, motes
  extras: [],
  extraPlans: new Map(),
  swayOf: new Map(),
  motes: null,
  NPCM: new Map(),

  // Active scene tracking
  curScene: null,
};

export const W = state;

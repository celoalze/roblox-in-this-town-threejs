// engine/core/world.js
// Public facade for the engine runtime: re-exports init, shotTimes, lint, frame, grab.
// Must maintain the public API contract used by page.html and render.mjs.

export { init } from './scene.js';
export { shotTimes } from './camera.js';
export { lint, frame, grab } from './frame.js';

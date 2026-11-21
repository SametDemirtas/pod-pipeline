// Test doubles for the core's ports. They run on Node only: the in-memory
// catalog uses node:async_hooks, and the contract suites in ./contract use vitest.
export * from './fakes.js';
export * from './in-memory-catalog.js';
export * from './file-fakes.js';
export * from './in-memory-mockups.js';
export * from './print-catalog-fakes.js';
export * from './scene-fakes.js';
export * from './upscale-fakes.js';
export * from './rotation-fakes.js';
export * from './listing-fakes.js';
export * from './research-fakes.js';
export * from './pin-fakes.js';
export * from './batch-fakes.js';

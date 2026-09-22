// Vite inlines `?worker&url` imports at transform time; kept alone here so a test can mock them.
export { default as browserWorkerUrl } from './worker.js?worker&url';
export { default as nodeWorkerAssetUrl } from './worker.node.js?worker&url';

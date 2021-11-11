export type {
  DocumentOptions,
  GlobalOptions,
  QwikDocument,
  QwikGlobal,
  RenderToDocumentOptions,
  RenderToStringOptions,
  RenderToStringResult,
} from './types';
export {
  createDocument,
  createGlobal,
  createTimer,
  serializeDocument,
  renderToDocument,
  renderToString,
} from './document';
export { getImports } from './prefetch';
export { getQwikLoaderScript, getQwikPrefetchScript } from './scripts';
export { QwikLoader, QwikPrefetch } from './components';
export { setServerPlatform } from './platform';

/**
 * @alpha
 */
export const versions = {
  qwik: (globalThis as any).QWIK_VERSION,
  domino: (globalThis as any).DOMINO_VERSION,
};

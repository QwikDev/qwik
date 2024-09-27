import { setPlatform } from '@qwikdev/core';
import type { ResolvedManifest } from '@qwikdev/core/optimizer';
import { createPlatform } from './platform';
import { resolveManifest } from './ssr-render';
import type { QwikManifest } from './types';

export { getQwikLoaderScript, getQwikPrefetchWorkerScript } from './scripts';
export { renderToStream, renderToString, resolveManifest } from './ssr-render';
export type {
  InOrderAuto,
  InOrderDisabled,
  InOrderStreaming,
  PrefetchImplementation,
  PrefetchResource,
  PrefetchStrategy,
  QwikLoaderOptions,
  Render,
  RenderOptions,
  RenderResult,
  RenderToStream,
  RenderToStreamOptions,
  RenderToStreamResult,
  RenderToString,
  RenderToStringOptions,
  RenderToStringResult,
  SerializeDocumentOptions,
  StreamingOptions,
  SymbolsToPrefetch,
} from './types';
export { versions } from './utils';

/** @public */
export async function setServerPlatform(manifest: QwikManifest | ResolvedManifest | undefined) {
  const platform = createPlatform({ manifest }, resolveManifest(manifest));
  setPlatform(platform);
}

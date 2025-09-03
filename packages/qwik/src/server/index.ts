import { setPlatform } from '@qwik.dev/core';
import { createPlatform } from './platform';
import type { ResolvedManifest } from '@qwik.dev/core/optimizer';
import { resolveManifest } from './ssr-render';
import type { QwikManifest } from './types';

export type {
  PrefetchResource,
  PrefetchImplementation,
  PrefetchStrategy,
  PreloaderOptions,
  RenderToStringOptions,
  RenderToStringResult,
  Render,
  RenderToStream,
  RenderToString,
  RenderOptions,
  RenderResult,
  RenderToStreamOptions,
  SerializeDocumentOptions,
  RenderToStreamResult,
  QwikLoaderOptions,
  StreamingOptions,
  InOrderAuto,
  InOrderDisabled,
  InOrderStreaming,
  SymbolsToPrefetch,
} from './types';
export { resolveManifest, renderToString, renderToStream } from './ssr-render';
export { versions } from './utils';
export {
  getQwikLoaderScript,
  getQwikPrefetchWorkerScript,
  getQwikBackpatchExecutorScript,
} from './scripts';

/** @public */
export async function setServerPlatform(manifest?: Partial<QwikManifest | ResolvedManifest>) {
  const platform = createPlatform({ manifest }, resolveManifest(manifest));
  setPlatform(platform);
}

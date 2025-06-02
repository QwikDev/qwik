import { setPlatform } from '@builder.io/qwik';
import { createPlatform } from './platform';
import type { ResolvedManifest } from '@builder.io/qwik/optimizer';
import { resolveManifest } from './render';
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
export { renderToString, renderToStream, resolveManifest } from './render';
export { versions } from './utils';
export { getQwikLoaderScript, getQwikPrefetchWorkerScript } from './scripts';

/** @public */
export async function setServerPlatform(manifest?: Partial<QwikManifest | ResolvedManifest>) {
  const platform = createPlatform({ manifest }, resolveManifest(manifest));
  setPlatform(platform);
}

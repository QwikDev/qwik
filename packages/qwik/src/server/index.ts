import { setPlatform } from '@builder.io/qwik';
import { createPlatform } from './platform';
import type { ResolvedManifest } from '@builder.io/qwik/optimizer';
import { resolveManifest } from './ssr-render';
import type { QwikManifest } from './types';

export type {
  PrefetchResource,
  PrefetchImplementation,
  PrefetchStrategy,
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
export { getQwikLoaderScript, getQwikPrefetchWorkerScript } from './scripts';

/** @public */
export async function setServerPlatform(manifest: QwikManifest | ResolvedManifest | undefined) {
  const platform = createPlatform({ manifest }, resolveManifest(manifest));
  setPlatform(platform);
}

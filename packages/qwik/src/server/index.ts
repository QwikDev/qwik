import { setPlatform } from '@builder.io/qwik';
import type { ResolvedManifest } from '@builder.io/qwik/optimizer';
import { createPlatform } from './platform';
import { resolveManifest } from './render';
import type { QwikManifest } from './types';

export { renderToStream, renderToString, resolveManifest } from './render';
export { getQwikLoaderScript } from './scripts';
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

/**
 * @public
 */
export async function setServerPlatform(manifest: QwikManifest | ResolvedManifest | undefined) {
  const platform = createPlatform({ manifest }, resolveManifest(manifest));
  setPlatform(platform);
}

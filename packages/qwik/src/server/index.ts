import { setPlatform } from '@qwik.dev/core';
import { createPlatform } from './platform';
import type { ResolvedManifest } from '@qwik.dev/core/optimizer';
import { resolveManifest } from './manifest';
import type { QwikManifest } from './types';

export type {
  RenderToStringOptions,
  RenderToStringResult,
  Render,
  RenderToStream,
  RenderToString,
  RenderOptions,
  RenderResult,
  SnapshotResult,
  RenderToStreamOptions,
  SerializeDocumentOptions,
  RenderToStreamResult,
  QwikLoaderOptions,
} from './types';
export { resolveManifest } from './manifest';
export { renderToString, renderToStream } from './ssr-render';
export {
  renderToStringCompiled as _renderToStringCompiled,
  type SsrRenderRoot as _SsrRenderRoot,
} from './ssr-render';
export { versions } from './utils';
export { getQwikLoaderScript } from './scripts';

/** @public */
export async function setServerPlatform(manifest?: Partial<QwikManifest | ResolvedManifest>) {
  const platform = createPlatform({ manifest }, resolveManifest(manifest));
  setPlatform(platform);
}

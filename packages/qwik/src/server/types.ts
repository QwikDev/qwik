import type { SnapshotResult } from '../core/object/store';
import type { QwikManifest, QwikBundle, QwikSymbol, GlobalInjections } from '../optimizer/src';

/**
 * Partial Document used by Qwik Framework.
 *
 * A set of properties which the Qwik Framework expects to find on document.
 * @public
 */
export interface QwikDocument extends Document {}

/**
 * @public
 */
export interface SerializeDocumentOptions {
  manifest?: QwikManifest;
  qrlMapper?: QrlMapper;
  url?: URL | string;
  html?: string;
  debug?: boolean;
}

/**
 * @alpha
 */
export interface PrefetchStrategy {
  implementation?: PrefetchImplementation;
  symbolsToPrefetch?: SymbolsToPrefetch;
}

/**
 * @alpha
 */
export type PrefetchImplementation =
  | 'link-prefetch-html'
  | 'link-prefetch'
  | 'link-preload-html'
  | 'link-preload'
  | 'link-modulepreload-html'
  | 'link-modulepreload'
  | 'worker-fetch'
  | 'none';

/**
 * all: Prefetch all QRLs used by the app.
 * all-document: Prefetch all QRLs used by the document.
 * events-document: Prefetch event QRLs used by the document. Default
 *
 * @alpha
 */
export type SymbolsToPrefetch =
  | 'all'
  | 'events-document'
  | ((opts: { manifest: QwikManifest }) => PrefetchResource[]);

/**
 * @alpha
 */
export interface PrefetchResource {
  url: string;
  imports: PrefetchResource[];
}

export { QwikManifest, QwikBundle, QwikSymbol, GlobalInjections };

/**
 * @public
 */
export type QrlMapper = (symbolName: string) => [string, string] | undefined;

/**
 * @public
 */
export interface RenderToStringResult {
  prefetchResources: PrefetchResource[];
  snapshotResult: SnapshotResult | null;
  html: string;
  timing: {
    createDocument: number;
    render: number;
    toString: number;
  };
}

export { SnapshotResult };

/**
 * @public
 */
export interface RenderToStringOptions extends SerializeDocumentOptions {
  /**
   * Defaults to `true`
   */
  snapshot?: boolean;

  /**
   * Specifies the root of the JS files of the client build.
   * Setting a base, will cause the render of the `q:base` attribute in the `q:container` element.
   */
  base?: string;

  /**
   * Specifies if the Qwik Loader script is added to the document or not. Defaults to `{ include: true }`.
   */
  qwikLoader?: { events?: string[]; include?: boolean };

  prefetchStrategy?: PrefetchStrategy;
  /**
   * When set, the app is serialized into a fragment. And the returned html is not a complete document.
   * Defaults to `undefined`
   */
  fragmentTagName?: string;
}

/**
 * @public
 */
export type RenderToString = (opts: RenderToStringOptions) => Promise<RenderToStringResult>;

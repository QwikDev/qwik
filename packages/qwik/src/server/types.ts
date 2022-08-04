import type { SnapshotResult, StreamWriter } from '@builder.io/qwik';
import type { QwikManifest, SymbolMapperFn, SymbolMapper } from '@builder.io/qwik/optimizer';

/**
 * @alpha
 */
export interface SerializeDocumentOptions {
  manifest?: QwikManifest;
  symbolMapper?: SymbolMapperFn;
  url?: URL | string;
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
 * auto: Prefetch all possible QRLs used by the document. Default
 *
 * @alpha
 */
export type SymbolsToPrefetch = 'auto' | ((opts: { manifest: QwikManifest }) => PrefetchResource[]);

/**
 * @alpha
 */
export interface PrefetchResource {
  url: string;
  imports: PrefetchResource[];
}

/**
 * @alpha
 */
export interface RenderToStreamResult extends RenderResult {}

/**
 * @alpha
 */
export interface RenderToStringResult extends RenderResult {
  html: string;
}

/**
 * @alpha
 */
export interface RenderResult {
  prefetchResources: PrefetchResource[];
  snapshotResult: SnapshotResult | null;
  timing: {
    createDocument: number;
    render: number;
    snapshot: number;
    toString: number;
  };
}

/**
 * @alpha
 */
export interface QwikLoaderOptions {
  events?: string[];
  include?: 'always' | 'never' | 'auto';
  position?: 'top' | 'bottom';
}

/**
 * @alpha
 */
export interface RenderOptions extends SerializeDocumentOptions {
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
  qwikLoader?: QwikLoaderOptions;

  prefetchStrategy?: PrefetchStrategy | null;

  /**
   * When set, the app is serialized into a fragment. And the returned html is not a complete document.
   * Defaults to `undefined`
   */
  fragmentTagName?: string;

  envData?: Record<string, any>;
}

/**
 * @alpha
 */
export interface RenderToStringOptions extends RenderOptions {}

/**
 * @alpha
 */
export interface InOrderAuto {
  strategy: 'auto';
}

/**
 * @alpha
 */
export interface InOrderDisabled {
  strategy: 'disabled';
}

/**
 * @alpha
 */
export type InOrderStreaming = InOrderAuto | InOrderDisabled;

/**
 * @alpha
 */
export interface StreamingOptions {
  inOrder?: InOrderStreaming;
}

/**
 * @alpha
 */
export interface RenderToStreamOptions extends RenderOptions {
  stream: StreamWriter;
  streaming?: StreamingOptions;
}

/**
 * @alpha
 */
export type RenderToString = (opts: RenderToStringOptions) => Promise<RenderToStringResult>;

/**
 * @alpha
 */
export type RenderToStream = (opts: RenderToStreamOptions) => Promise<RenderToStreamResult>;

/**
 * @alpha
 */
export type Render = RenderToString | RenderToStream;

export { SnapshotResult, SymbolMapper, QwikManifest, StreamWriter };

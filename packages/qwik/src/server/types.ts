import type { SnapshotResult, StreamWriter } from '@builder.io/qwik';
import type {
  QwikManifest,
  SymbolMapperFn,
  SymbolMapper,
  ResolvedManifest,
} from '@builder.io/qwik/optimizer';

/** @public */
export interface SerializeDocumentOptions {
  manifest?: QwikManifest | ResolvedManifest;
  symbolMapper?: SymbolMapperFn;
  debug?: boolean;
}

/** @public */
export interface PrefetchStrategy {
  implementation?: PrefetchImplementation;
  symbolsToPrefetch?: SymbolsToPrefetch;
}

/** @public */
export interface PrefetchImplementation {
  /**
   * `js-append`: Use JS runtime to create each `<link>` and append to the body.
   *
   * `html-append`: Render each `<link>` within html, appended at the end of the body.
   */
  linkInsert?: 'js-append' | 'html-append' | null;
  /**
   * Value of the `<link rel="...">` attribute when link is used. Defaults to `prefetch` if links
   * are inserted.
   */
  linkRel?: 'prefetch' | 'preload' | 'modulepreload' | null;
  /**
   * `always`: Always include the worker fetch JS runtime.
   *
   * `no-link-support`: Only include the worker fetch JS runtime when the browser doesn't support
   * `<link>` prefetch/preload/modulepreload.
   */
  workerFetchInsert?: 'always' | 'no-link-support' | null;
  /**
   * Dispatch a `qprefetch` event with detail data containing the bundles that should be prefetched.
   * The event dispatch script will be inlined into the document's HTML so any listeners of this
   * event should already be ready to handle the event.
   *
   * This implementation will inject a script similar to:
   *
   * ```
   * <script type="module">
   *   document.dispatchEvent(new CustomEvent("qprefetch", { detail:{ "bundles": [...] } }))
   * </script>
   * ```
   *
   * By default, the `prefetchEvent` implementation will be set to `always`.
   */
  prefetchEvent?: 'always' | null;
}

/**
 * Auto: Prefetch all possible QRLs used by the document. Default
 *
 * @public
 */
export type SymbolsToPrefetch = 'auto' | ((opts: { manifest: QwikManifest }) => PrefetchResource[]);

/** @public */
export interface PrefetchResource {
  url: string;
  imports: PrefetchResource[];
}

/** @public */
export interface RenderToStreamResult extends RenderResult {
  flushes: number;
  size: number;
  timing: {
    firstFlush: number;
    render: number;
    snapshot: number;
  };
}

/** @public */
export interface RenderToStringResult extends RenderResult {
  html: string;
  timing: {
    render: number;
    snapshot: number;
  };
}

/** @public */
export interface RenderResult {
  prefetchResources: PrefetchResource[];
  snapshotResult: SnapshotResult | undefined;
  isStatic: boolean;
  manifest?: QwikManifest;
  /** @internal TODO: Move to snapshotResult */
  _symbols?: string[];
}

/** @public */
export interface QwikLoaderOptions {
  events?: string[];
  include?: 'always' | 'never' | 'auto';
  position?: 'top' | 'bottom';
}

/**
 * Options which determine how the Qwik Prefetch Service Worker is added to the document.
 *
 * Qwik Prefetch Service Worker is used to prefetch resources so that the QwikLoader will always
 * have a cache hit. This will ensure that there will not be any delays for the end user while
 * interacting with the application.
 *
 * @public
 */
export interface QwikPrefetchServiceWorkerOptions {
  /**
   * Should the Qwik Prefetch Service Worker be added to the container. Defaults to `false` until
   * the QwikCity Service Worker is deprecated.
   */
  include?: boolean;
  /**
   * Where should the Qwik Prefetch Service Worker be added to the container. Defaults to `top` to
   * get prefetching going as fast as possible.
   */
  position?: 'top' | 'bottom';
}

/** @public */
export interface RenderOptions extends SerializeDocumentOptions {
  /** Defaults to `true` */
  snapshot?: boolean;

  /**
   * Specifies the root of the JS files of the client build. Setting a base, will cause the render
   * of the `q:base` attribute in the `q:container` element.
   */
  base?: string | ((options: RenderOptions) => string);

  /** Language to use when rendering the document. */
  locale?: string | ((options: RenderOptions) => string);

  /**
   * Specifies if the Qwik Loader script is added to the document or not.
   *
   * Defaults to `{ include: true }`.
   */
  qwikLoader?: QwikLoaderOptions;

  /**
   * Specifies if the Qwik Prefetch Service Worker script is added to the document or not.
   *
   * Defaults to `{ include: false }`. NOTE: This may be change in the future.
   */
  qwikPrefetchServiceWorker?: QwikPrefetchServiceWorkerOptions;

  prefetchStrategy?: PrefetchStrategy | null;

  /**
   * When set, the app is serialized into a fragment. And the returned html is not a complete
   * document. Defaults to `html`
   */
  containerTagName?: string;
  containerAttributes?: Record<string, string>;
  serverData?: Record<string, any>;
}

/** @public */
export interface RenderToStringOptions extends RenderOptions {}

/** @public */
export interface InOrderAuto {
  strategy: 'auto';
  maximunInitialChunk?: number;
  maximunChunk?: number;
}

/** @public */
export interface InOrderDisabled {
  strategy: 'disabled';
}

/** @public */
export interface InOrderDirect {
  strategy: 'direct';
}

/** @public */
export type InOrderStreaming = InOrderAuto | InOrderDisabled | InOrderDirect;

/** @public */
export interface StreamingOptions {
  inOrder?: InOrderStreaming;
}

/** @public */
export interface RenderToStreamOptions extends RenderOptions {
  stream: StreamWriter;
  streaming?: StreamingOptions;
}

/** @public */
export type RenderToString = (opts: RenderToStringOptions) => Promise<RenderToStringResult>;

/** @public */
export type RenderToStream = (opts: RenderToStreamOptions) => Promise<RenderToStreamResult>;

/** @public */
export type Render = RenderToString | RenderToStream;

export type { SnapshotResult, SymbolMapper, QwikManifest, StreamWriter };

import type { SnapshotResult, StreamWriter } from '@builder.io/qwik';
import type {
  QwikManifest,
  ResolvedManifest,
  SymbolMapper,
  SymbolMapperFn,
} from '@builder.io/qwik/optimizer';

/** @public */
export interface SerializeDocumentOptions {
  manifest?: Partial<QwikManifest | ResolvedManifest>;
  symbolMapper?: SymbolMapperFn;
  debug?: boolean;
}

/** @public */
export interface PrefetchStrategy {
  implementation?: PrefetchImplementation;
  symbolsToPrefetch?: SymbolsToPrefetch;
}

/** @public */
export interface PreloaderOptions {
  /**
   * Maximum number of preload links to add during SSR. These instruct the browser to preload likely
   * bundles before the preloader script is active. This most likely includes the core and the
   * preloader script itself. Setting this to 0 will disable all preload links.
   *
   * Preload links can delay LCP, which is a Core Web Vital, but it can increase TTI, which is not a
   * Core Web Vital but more noticeable to the user.
   *
   * Defaults to `5`
   */
  ssrPreloads?: number;
  /**
   * The minimum probability for a bundle to be added as a preload link during SSR.
   *
   * Defaults to `0.7` (70% probability)
   */
  ssrPreloadProbability?: number;
  /**
   * Log preloader debug information to the console.
   *
   * Defaults to `false`
   */
  debug?: boolean;
  /**
   * Maximum number of simultaneous preload links that the preloader will maintain. If you set this
   * higher, the browser will have all JS files in memory sooner, but it will contend with other
   * resource downloads. Furthermore, if a bundle suddenly becomes more likely, it will have to wait
   * longer to be preloaded.
   *
   * Bundles that reach 100% probability (static imports of other bundles) will always be preloaded
   * immediately, no limit.
   *
   * Defaults to `25`
   */
  maxIdlePreloads?: number;
  /**
   * The minimum probability for a bundle to be added to the preload queue.
   *
   * Defaults to `0.35` (35% probability)
   */
  preloadProbability?: number;
}

/** @public @deprecated Use `preloader` instead */
export interface PrefetchImplementation {
  /** @deprecated No longer used. */
  linkRel?: 'prefetch' | 'preload' | 'modulepreload' | null;
  /** @deprecated No longer used. */
  linkFetchPriority?: 'auto' | 'low' | 'high' | null;
  /** @deprecated No longer used. */
  linkInsert?: 'js-append' | 'html-append' | null;
  /** @deprecated No longer used. */
  workerFetchInsert?: 'always' | 'no-link-support' | null;
  /** @deprecated No longer used. */
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
}

/** @public */
export interface QwikLoaderOptions {
  include?: 'always' | 'never' | 'auto';
  position?: 'top' | 'bottom';
}

/**
 * @deprecated This is no longer used as the preloading happens automatically in qrl-class.ts.
 * @public
 */
export interface QwikPrefetchServiceWorkerOptions {
  /** @deprecated This is no longer used as the preloading happens automatically in qrl-class.ts. */
  include?: boolean;
  /** @deprecated This is no longer used as the preloading happens automatically in qrl-class.ts. */
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

  preloader?: PreloaderOptions | false;

  /** @deprecated Use `preloader` instead */
  qwikPrefetchServiceWorker?: QwikPrefetchServiceWorkerOptions;

  /** @deprecated Use `preloader` instead */
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

export type { QwikManifest, SnapshotResult, StreamWriter, SymbolMapper };

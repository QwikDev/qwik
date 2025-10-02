import type { SnapshotResult } from '@qwik.dev/core';
import type { StreamWriter } from '@qwik.dev/core/internal';
import type {
  QwikManifest,
  ServerQwikManifest,
  ResolvedManifest,
  SymbolMapper,
  SymbolMapperFn,
} from '@qwik.dev/core/optimizer';

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
   *
   * This makes sure that the most likely bundles are preloaded ahead of time.
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
   * @deprecated The minimum probability for a bundle to be added to the preload queue.
   *
   *   Defaulted to `0.35` (35% probability).
   *
   *   Deprecated because this could cause performance issues with bundles fetched on on click instead
   *   of being preloaded ahead of time.
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
export type SymbolsToPrefetch =
  | 'auto'
  | ((opts: { manifest: ServerQwikManifest }) => PrefetchResource[]);

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
    firstFlush: number;
    render: number;
    snapshot: number;
  };
}

/** @public */
export interface RenderResult {
  snapshotResult: SnapshotResult | undefined;
  isStatic: boolean;
  manifest?: ServerQwikManifest;
}

/** @public */
export type QwikLoaderOptions =
  | 'module'
  | 'inline'
  | 'never'
  | {
      /** @deprecated No longer used. */
      include?: 'always' | 'never' | 'auto';
      /** @deprecated No longer used. */
      position?: 'top' | 'bottom';
    };

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
   * Specifies how the Qwik Loader is included in the document. This enables interactivity and lazy
   * loading.
   *
   * `module`: Use a `<script>` tag to load the Qwik Loader. Subsequent page loads will have the
   * script cached and instantly running.
   *
   * `inline`: This embeds the Qwik Loader script directly in the document. This adds about 3kB
   * before compression, which typically is reduced to about 1.6kB with gzip.
   *
   * `never`: Do not include the Qwik Loader script. This is mostly useful when embedding multiple
   * containers on the same page.
   *
   * Defaults to `module`.
   *
   * Note that the Qwik Loader is absolutely required for Qwik to work. There must be an instance of
   * it loaded for any interactivity to happen.
   */
  qwikLoader?: QwikLoaderOptions;

  /** Specifies how preloading is handled. This ensures that code is instantly available when needed. */
  preloader?: PreloaderOptions | false;

  /** @deprecated Use `preloader` instead */
  prefetchStrategy?: PrefetchStrategy | null;

  /**
   * When set, the app is serialized into a fragment. And the returned html is not a complete
   * document. Defaults to `html`
   */
  containerTagName?: string;
  containerAttributes?: Record<string, string>;
  /** Metadata that can be retrieved during SSR with `useServerData()`. */
  serverData?: Record<string, any>;
}

/** @public */
export interface RenderToStringOptions extends RenderOptions {}

/** @public */
export interface InOrderAuto {
  strategy: 'auto';
  maximumInitialChunk?: number;
  maximumChunk?: number;
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

/**
 * Flags for VNodeData (Flags con be bitwise combined)
 *
 * @internal
 */
export const enum VNodeDataFlag {
  /// Initial state.
  NONE = 0,
  /// Indicates that multiple Text nodes are present and can't be derived from HTML.
  TEXT_DATA = 1,
  /// Indicates that the virtual nodes are present and can't be derived from HTML.
  VIRTUAL_NODE = 2,
  /// Indicates that the element nodes are present and some data can't be derived from HTML.
  ELEMENT_NODE = 4,
  /// Indicates that serialized data is referencing this node and so we need to retrieve a reference to it.
  REFERENCE = 8,
  /// Should be output during serialization.
  SERIALIZE = 16,
}

export type BackpatchEntry = {
  attrName: string;
  value: string | boolean | null;
};

export type { QwikManifest, ServerQwikManifest, SnapshotResult, StreamWriter, SymbolMapper };

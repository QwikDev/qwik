import type { SnapshotResult, StreamWriter } from '@qwik.dev/core';
import type {
  QwikManifest,
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
export interface PrefetchImplementation {
  /**
   * Maximum number of preload links to add during SSR. These instruct the browser to preload likely
   * bundles before the preloader script is active. This includes the 2 preloads used for the
   * preloader script itself and the bundle information. Setting this to 0 will disable all preload
   * links.
   *
   * Defaults to `5`
   */
  maxPreloads?: number;
  /**
   * The minimum probability of a bundle to be added as a preload link during SSR.
   *
   * Defaults to `0.6` (60% probability)
   */
  minProbability?: number;
  /**
   * If true, the preloader will log debug information to the console.
   *
   * Defaults to `false`
   */
  debug?: boolean;
  /**
   * Maximum number of simultaneous preload links that the preloader will maintain.
   *
   * Defaults to `5`
   */
  maxSimultaneousPreloads?: number;
  /**
   * The minimum probability for a bundle to be added to the preload queue.
   *
   * Defaults to `0.25` (25% probability)
   */
  minPreloadProbability?: number;
  /**
   * Value of the `<link rel="...">` attribute when links are added. The preloader itself will
   * autodetect which attribute to use based on the browser capabilities.
   *
   * Defaults to `modulepreload`.
   */
  linkRel?: 'prefetch' | 'preload' | 'modulepreload' | null;
  /** Value of the `<link fetchpriority="...">` attribute when links are added. Defaults to `null`. */
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
    firstFlush: number;
    render: number;
    snapshot: number;
  };
}

/** @public */
export interface RenderResult {
  snapshotResult: SnapshotResult | undefined;
  isStatic: boolean;
  manifest?: QwikManifest;
}

/** @public */
export interface QwikLoaderOptions {
  include?: 'always' | 'never' | 'auto';
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

export type { QwikManifest, SnapshotResult, StreamWriter, SymbolMapper };

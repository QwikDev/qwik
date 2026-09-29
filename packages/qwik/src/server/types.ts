import type { QRL, RenderRoot, StreamWriter } from '@qwik.dev/core';
import type {
  QwikManifest,
  ResolvedManifest,
  ServerQwikManifest,
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
export type QwikLoaderOptions =
  | 'module'
  | 'inline'
  | 'never'
  | {
      include?: 'always' | 'never' | 'auto';
    };

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
   * Defaults to `7`
   */
  ssrPreloads?: number;
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
}

/** @public */
export interface RenderOptions<Props = undefined> extends SerializeDocumentOptions {
  props?: Props;
  base?: string | ((options: RenderOptions<Props>) => string);
  locale?: string | ((options: RenderOptions<Props>) => string);
  qwikLoader?: QwikLoaderOptions;
  /** Specifies how preloading is handled. This ensures that code is instantly available when needed. */
  preloader?: PreloaderOptions | false;
  containerTagName?: string;
  containerAttributes?: Record<string, string>;
  serverData?: Record<string, any>;
  /**
   * Testing-only: fixes the container `q:instance` hash so output is byte-reproducible. The hash
   * namespaces per-render globals, so it must stay unique per container in a real document.
   */
  instanceHash?: string;
}

/** @public */
export interface RenderToStringOptions<Props = undefined> extends RenderOptions<Props> {}

/** @public */
export interface RenderToStreamOptions<Props = undefined> extends RenderOptions<Props> {
  stream: StreamWriter;
  outOfOrder?: boolean;
}

/** @public */
export interface SnapshotResult {
  funcs: string[];
  qrls: QRL[];
  mode: 'render' | 'listeners' | 'static';
}

/** @public */
export interface RenderResult {
  snapshotResult?: SnapshotResult;
  isStatic: boolean;
  manifest?: ServerQwikManifest;
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
  timing: RenderToStreamResult['timing'];
}

/** @public */
export type RenderToString = <Props = undefined>(
  root: RenderRoot<Props>,
  opts?: RenderToStringOptions<Props>
) => Promise<RenderToStringResult>;

/** @public */
export type RenderToStream = <Props = undefined>(
  root: RenderRoot<Props>,
  opts: RenderToStreamOptions<Props>
) => Promise<RenderToStreamResult>;

/** @public */
export type Render = RenderToString | RenderToStream;

export type { QwikManifest, ResolvedManifest, ServerQwikManifest, StreamWriter, SymbolMapper };

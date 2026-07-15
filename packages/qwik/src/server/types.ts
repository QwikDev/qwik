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
export interface RenderOptions<Props = undefined> extends SerializeDocumentOptions {
  props?: Props;
  base?: string | ((options: RenderOptions<Props>) => string);
  locale?: string | ((options: RenderOptions<Props>) => string);
  qwikLoader?: QwikLoaderOptions;
  containerTagName?: string;
  containerAttributes?: Record<string, string>;
  serverData?: Record<string, any>;
}

/** @public */
export interface RenderToStringOptions<Props = undefined> extends RenderOptions<Props> {}

/** @public */
export interface RenderToStreamOptions<Props = undefined> extends RenderOptions<Props> {
  stream: StreamWriter;
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

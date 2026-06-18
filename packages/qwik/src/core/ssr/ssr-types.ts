/** @file Public types for the SSR */

import type { ChoreBits } from '../../server/qwik-copy';
import type {
  Container,
  JSXChildren,
  JSXOutput,
  ResolvedManifest,
  SerializationContext,
  ValueOrPromise,
} from '../../server/qwik-types';
import type { VNodeData } from '../../server/vnode-data';
import type { Props } from '../shared/jsx/jsx-runtime';
import type { JSXNodeInternal } from '../shared/jsx/types/jsx-node';
import type { QRL } from '../shared/qrl/qrl.public';
import type { SsrNodeFlags } from '../shared/types';
import type { _EFFECT_BACK_REF } from '../reactive-primitives/backref';
import type { EffectProperty, EffectSubscription } from '../reactive-primitives/types';
import type { ResourceReturnInternal } from '../use/use-resource';

/** @internal */
export interface SSRRootRefPathChunk {
  readonly path: number[];
}

/** @internal */
export type SSRWriteChunk = string | number | SSRRootRefPathChunk;

/** @internal */
export type SSRSegmentWriteChunk =
  | string
  | { readonly type: 'root-ref'; readonly localId: number }
  | { readonly type: 'root-ref-path'; readonly localPath: number[] };

/** @internal */
export interface StreamWriter {
  write(chunk: string): ValueOrPromise<void>;
  waitForDrain?(): ValueOrPromise<void>;
}

/** @internal */
export interface SSRInternalStreamWriter extends StreamWriter {
  writeRootRef(id: number): ValueOrPromise<void>;
  writeRootRefPath(path: number[]): ValueOrPromise<void>;
  toString(remap?: number[]): string;
  /** Mark the current write position so a later `truncate` can discard everything written after it. */
  checkpoint(): number;
  /**
   * Discard everything written since `checkpoint`. Only valid while the output is still buffered
   * (no flush has happened in between) — e.g. inside a stream block or a segment writer.
   */
  truncate(checkpoint: number): void;
}

export interface ISsrNode {
  id: string;
  flags: SsrNodeFlags;
  dirty: ChoreBits;
  parentComponent: ISsrNode | null;
  children: ISsrNode[] | null;
  vnodeData: VNodeData;
  currentFile: string | null;
  readonly [_EFFECT_BACK_REF]: Map<EffectProperty | string, EffectSubscription> | null;
  setProp(name: string, value: any): void;
  getProp(name: string): any;
  removeProp(name: string): void;
  addChild(child: ISsrNode): void;
  setTreeNonUpdatable(): void;
}

/** @internal */
export interface ISsrComponentFrame {
  componentNode: ISsrNode;
  slots: (string | JSXChildren)[];
  scopedStyleIds: Set<string>;
  projectionScopedStyle: string | null;
  projectionComponentFrame: ISsrComponentFrame | null;
  projectionDepth: number;
  consumeChildrenForSlot(projectionNode: ISsrNode, slotName: string): JSXChildren | null;
  distributeChildrenIntoSlots(
    children: JSXChildren,
    parentScopedStyle: string | null,
    parentComponentFrame: ISsrComponentFrame | null
  ): void;
  hasSlot(slotName: string): boolean;
}

export type SymbolToChunkResolver = (symbol: string) => string;

/**
 * Opaque snapshot of the container's render state, taken by `checkpoint()` and restored by
 * `rollback()`. Used to discard a partially-rendered subtree (e.g. an `<ErrorBoundary>` whose child
 * threw) so the fallback can be rendered in its place. The shape is internal to the container.
 */
export interface SSRBufferCheckpoint {
  readonly __brand: 'SSRBufferCheckpoint';
}

export interface SSRRenderJSXOptions {
  currentStyleScoped: string | null;
  parentComponentFrame: ISsrComponentFrame | null;
}

export interface SegmentRenderContext {
  container: SSRSegmentContainer;
  writer: SSRInternalStreamWriter;
  htmlChunks: SSRSegmentWriteChunk[];
}

export type SSROutOfOrderSegment = SegmentRenderContext;

export interface SSRContainer extends Container {
  readonly tag: string;
  readonly isHtml: boolean;
  readonly size: number;
  readonly writer: SSRInternalStreamWriter;
  readonly streamHandler: IStreamHandler;
  readonly serializationCtx: SerializationContext;
  readonly symbolToChunkResolver: SymbolToChunkResolver;
  readonly resolvedManifest: ResolvedManifest;
  readonly outOfOrderStreaming: boolean;
  additionalHeadNodes: Array<JSXNodeInternal>;
  additionalBodyNodes: Array<JSXNodeInternal>;
  $noScriptHere$: number;

  /**
   * Lets the container place a root-level `useOn` placeholder `<script>` itself when injecting it
   * inline would put it at an illegal position. Returns `true` if the container took the node, in
   * which case the caller must not inject it into the component's JSX.
   */
  $deferRootPlaceholder$(scriptNode: JSXNodeInternal<string>): boolean;

  write(text: string): void;

  openContainer(): void;
  closeContainer(): ValueOrPromise<void>;

  openElement(
    elementName: string,
    key: string | null,
    varAttrs: Props,
    constAttrs: Props | null,
    styleScopedId: string | null,
    currentFile: string | null,
    hasMovedCaptures?: boolean
  ): string | undefined;
  closeElement(): ValueOrPromise<void>;

  openFragment(attrs: Props): void;
  closeFragment(): void;

  openProjection(attrs: Props): void;
  closeProjection(): void;

  openComponent(attrs: Props): void;
  getComponentFrame(projectionDepth: number): ISsrComponentFrame | null;
  getParentComponentFrame(): ISsrComponentFrame | null;
  closeComponent(): Promise<void>;

  textNode(text: string): void;
  htmlNode(rawHtml: string): void;
  commentNode(text: string): void;
  addRoot(obj: any): number | string | undefined;
  getOrCreateLastNode(): ISsrNode;
  /** Snapshot render state so a later `rollback` can discard everything rendered since. */
  checkpoint(): SSRBufferCheckpoint;
  /** Restore render state to a `checkpoint`, discarding HTML, vnode-data, nodes and roots since. */
  rollback(checkpoint: SSRBufferCheckpoint): void;
  addUnclaimedProjection(frame: ISsrComponentFrame, name: string, children: JSXChildren): void;
  isStatic(): boolean;
  render(jsx: JSXOutput): Promise<void>;
  renderJSX(jsx: JSXOutput, options: SSRRenderJSXOptions): Promise<void>;
  $runQueuedRender$<T>(render: () => ValueOrPromise<T>): ValueOrPromise<T>;
  /**
   * Allocate the next out-of-order boundary id. Pass `markUsed: false` to reserve an id without
   * arming the OOOS executor — used by `<ErrorBoundary>`, which only needs the executor if it
   * actually throws (creating the fallback `segment()` then marks OOOS used).
   */
  nextOutOfOrderId(markUsed?: boolean): number;
  emitOutOfOrderSegmentScripts(scripts: string): void;
  segment(
    segmentId: string,
    jsx: JSXOutput,
    options: SSRRenderJSXOptions
  ): Promise<SSROutOfOrderSegment>;
  queueOutOfOrderSegment(segment: Promise<void>): void;
  emitOutOfOrderExecutorIfNeeded(): void;
  emitInlineScript(script: string): void;
  writeScript(attrs: Props, body?: string): void;

  emitPreloaderPre(): void;

  emitQwikLoaderAtTopIfNeeded(): void;

  emitPatchDataIfNeeded(): void;
  emitBackpatchDataAndExecutorIfNeeded(): void;

  addBackpatchEntry(
    ssrNodeId: string,
    attrName: string,
    serializedValue: string | boolean | null
  ): void;
}

export interface SSRSegmentContainer extends SSRContainer {
  $rootContainer$: SSRContainer;
  $recordExternalRootEffect$(
    producer: unknown,
    effect: EffectSubscription,
    prop: string | symbol | null,
    sourceEffects?: Map<string | symbol, Set<EffectSubscription>>
  ): void;
  $finalizeOutOfOrderSegment$(
    segmentId: string,
    segment: SSROutOfOrderSegment
  ): Promise<{ html: string; scripts: string }>;
}

/** @internal */
export interface IStreamHandler {
  flush(): ValueOrPromise<void>;
  waitForPendingFlush(): ValueOrPromise<void>;
  streamBlockStart(): void;
  streamBlockEnd(): ValueOrPromise<void>;
}

/** @public */
export interface SnapshotMetaValue {
  w?: string; // q:watches
  s?: string; // q:seq
  h?: string; // q:host
  c?: string; // q:context
}

/** @public */
export type SnapshotMeta = Record<string, SnapshotMetaValue>;

/** @public @deprecated not longer used in v2 */
export interface SnapshotState {
  ctx: SnapshotMeta;
  refs: Record<string, string>;
  objs: any[];
  subs: any[];
}

/** @public */
export interface SnapshotListener {
  key: string;
  qrl: QRL<any>;
  el: Element;
}

/** @public */
export interface SnapshotResult {
  /** @deprecated Not longer used in v2 */
  state?: SnapshotState;
  funcs: string[];
  qrls: QRL[];
  /** @deprecated Not longer used in v2 */
  objs?: any[];
  resources: ResourceReturnInternal<any>[];
  mode: 'render' | 'listeners' | 'static';
}

/** @public */
export interface RenderSSROptions {
  containerTagName: string;
  containerAttributes: Record<string, string>;
  stream: StreamWriter;
  base?: string;
  serverData?: Record<string, any>;
  manifestHash: string;
}

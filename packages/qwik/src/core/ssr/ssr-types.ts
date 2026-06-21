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
  addUnclaimedProjection(frame: ISsrComponentFrame, name: string, children: JSXChildren): void;
  isStatic(): boolean;
  render(jsx: JSXOutput): Promise<void>;
  renderJSX(jsx: JSXOutput, options: SSRRenderJSXOptions): Promise<void>;
  $runQueuedRender$<T>(render: () => ValueOrPromise<T>): ValueOrPromise<T>;
  /**
   * Allocate the next out-of-order boundary id. Pass `markUsed: false` to reserve an id without
   * arming the OOOS executor (used by `<ErrorBoundary>`, which only needs it if it throws).
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
  emitErrorSwapExecutorIfNeeded(): void;
  /**
   * Register an ErrorBoundary `qErr(id)` swap to run when this segment reveals. An inline `qErr`
   * script inside a segment's `<template>` is inert, so a boundary rendered inside a segment defers
   * its swap to the segment finalization, which emits it at the root right after `qO(segmentId)`.
   * No-op outside a segment (standalone boundaries emit `qErr` inline).
   */
  $registerErrorSwap$(boundaryId: number): void;
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
  /** Ids of ErrorBoundaries inside this segment that errored; their `qErr` runs after the reveal. */
  $errorSwapIds$: number[];
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

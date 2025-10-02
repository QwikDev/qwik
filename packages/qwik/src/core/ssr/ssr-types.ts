/** @file Public types for the SSR */

import type {
  Container,
  JSXChildren,
  JSXOutput,
  ResolvedManifest,
  SerializationContext,
  ValueOrPromise,
} from '../../server/qwik-types';
import type { VNodeData } from '../../server/vnode-data';
import type { Signal } from '../reactive-primitives/signal.public';
import type { JSXNodeInternal } from '../shared/jsx/types/jsx-node';
import type { QRL } from '../shared/qrl/qrl.public';
import type { SsrNodeFlags } from '../shared/types';
import type { ResourceReturnInternal } from '../use/use-resource';

export type SsrAttrKey = string;
export type SsrAttrValue = string | Signal<any> | boolean | object | null;
export type SsrAttrs = Array<SsrAttrKey | SsrAttrValue>;

/** @internal */
export interface StreamWriter {
  write(chunk: string): void;
}

export interface ISsrNode {
  id: string;
  flags: SsrNodeFlags;
  parentComponent: ISsrNode | null;
  vnodeData: VNodeData;
  currentFile: string | null;
  setProp(name: string, value: any): void;
  getProp(name: string): any;
  removeProp(name: string): void;
  addChild(child: ISsrNode): void;
  setTreeNonUpdatable(): void;
}

/** @internal */
export interface ISsrComponentFrame {
  componentNode: ISsrNode;
  scopedStyleIds: Set<string>;
  projectionScopedStyle: string | null;
  projectionComponentFrame: ISsrComponentFrame | null;
  projectionDepth: number;
  releaseUnclaimedProjections(
    unclaimedProjections: (ISsrComponentFrame | JSXChildren | string)[]
  ): void;
  consumeChildrenForSlot(projectionNode: ISsrNode, slotName: string): JSXChildren | null;
  distributeChildrenIntoSlots(
    children: JSXChildren,
    parentScopedStyle: string | null,
    parentComponentFrame: ISsrComponentFrame | null
  ): void;
  hasSlot(slotName: string): boolean;
}

export type SymbolToChunkResolver = (symbol: string) => string;

export interface SSRContainer extends Container {
  readonly tag: string;
  readonly isHtml: boolean;
  readonly size: number;
  readonly writer: StreamWriter;
  readonly serializationCtx: SerializationContext;
  readonly symbolToChunkResolver: SymbolToChunkResolver;
  readonly resolvedManifest: ResolvedManifest;
  additionalHeadNodes: Array<JSXNodeInternal>;
  additionalBodyNodes: Array<JSXNodeInternal>;
  unclaimedProjectionComponentFrameQueue: ISsrComponentFrame[];

  write(text: string): void;

  openContainer(): void;
  closeContainer(): ValueOrPromise<void>;

  openElement(
    elementName: string,
    varAttrs: SsrAttrs | null,
    constAttrs?: SsrAttrs | null,
    currentFile?: string | null
  ): string | undefined;
  closeElement(): ValueOrPromise<void>;

  openFragment(attrs: SsrAttrs): void;
  closeFragment(): void;

  openProjection(attrs: SsrAttrs): void;
  closeProjection(): void;

  openComponent(attrs: SsrAttrs): void;
  getComponentFrame(projectionDepth: number): ISsrComponentFrame | null;
  getParentComponentFrame(): ISsrComponentFrame | null;
  closeComponent(): void;

  textNode(text: string): void;
  htmlNode(rawHtml: string): void;
  commentNode(text: string): void;
  addRoot(obj: any): number | undefined;
  getOrCreateLastNode(): ISsrNode;
  addUnclaimedProjection(frame: ISsrComponentFrame, name: string, children: JSXChildren): void;
  isStatic(): boolean;
  render(jsx: JSXOutput): Promise<void>;

  emitPreloaderPre(): void;

  emitQwikLoaderAtTopIfNeeded(): void;

  emitPatchDataIfNeeded(): void;

  addBackpatchEntry(
    ssrNodeId: string,
    attrName: string,
    serializedValue: string | boolean | null
  ): void;
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

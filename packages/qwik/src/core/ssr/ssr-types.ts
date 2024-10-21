/** @file Public types for the SSR */

import type {
  Container,
  JSXChildren,
  JSXOutput,
  SerializationContext,
  ValueOrPromise,
} from '../../server/qwik-types';
import type { PrefetchResource } from '../../server/types';
import type { QRL } from '../shared/qrl/qrl.public';
import type { JSXNode } from '../shared/jsx/types/jsx-node';
import type { ResourceReturnInternal } from '../use/use-resource';
import type { Signal } from '../signal/signal.public';
import type { VNodeData } from '../../server/vnode-data';

export type SsrAttrKey = string;
export type SsrAttrValue = string | Signal<any> | boolean | Object | null;
export type SsrAttrs = Array<SsrAttrKey | SsrAttrValue>;

/** @internal */
export interface StreamWriter {
  write(chunk: string): void;
}

export interface ISsrNode {
  id: string;
  currentComponentNode: ISsrNode | null;
  vnodeData?: VNodeData;
  setProp(name: string, value: any): void;
  getProp(name: string): any;
  removeProp(name: string): void;
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
  readonly writer: StreamWriter;
  readonly prefetchResources: PrefetchResource[];
  readonly serializationCtx: SerializationContext;
  readonly symbolToChunkResolver: SymbolToChunkResolver;
  readonly buildBase: string;
  additionalHeadNodes: Array<JSXNode>;
  additionalBodyNodes: Array<JSXNode>;
  unclaimedProjectionComponentFrameQueue: ISsrComponentFrame[];

  openContainer(): void;
  closeContainer(): ValueOrPromise<void>;

  openElement(
    elementName: string,
    varAttrs: SsrAttrs | null,
    constAttrs?: SsrAttrs | null
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
  addRoot(obj: any): number;
  getLastNode(): ISsrNode;
  addUnclaimedProjection(frame: ISsrComponentFrame, name: string, children: JSXChildren): void;
  isStatic(): boolean;
  render(jsx: JSXOutput): Promise<void>;

  emitQwikLoaderAtTopIfNeeded(): void;
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

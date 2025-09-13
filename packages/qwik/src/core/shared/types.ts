import type { ContextId } from '../use/use-context';
import type { ISsrNode, StreamWriter, SymbolToChunkResolver } from '../ssr/ssr-types';
import type { Scheduler } from './scheduler';
import type { SerializationContext } from './serdes/index';
import type { VNode } from '../client/vnode-impl';

export interface DeserializeContainer {
  $getObjectById$: (id: number | string) => unknown;
  element: HTMLElement | null;
  getSyncFn: (id: number) => (...args: unknown[]) => unknown;
  $state$?: unknown[];
  $storeProxyMap$: ObjToProxyMap;
  $forwardRefs$: Array<number> | null;
  $initialQRLs$: Array<string> | null;
  readonly $scheduler$: Scheduler | null;
}

export interface Container {
  readonly $version$: string;
  readonly $scheduler$: Scheduler;
  readonly $storeProxyMap$: ObjToProxyMap;
  /// Current language locale
  readonly $locale$: string;
  /// Retrieve Object from paused serialized state.
  readonly $getObjectById$: (id: number | string) => any;
  readonly $serverData$: Record<string, any>;
  $currentUniqueId$: number;
  $buildBase$: string | null;

  handleError(err: any, $host$: HostElement | null): void;
  getParentHost(host: HostElement): HostElement | null;
  setContext<T>(host: HostElement, context: ContextId<T>, value: T): void;
  resolveContext<T>(host: HostElement, contextId: ContextId<T>): T | undefined;
  setHostProp<T>(host: HostElement, name: string, value: T): void;
  getHostProp<T>(host: HostElement, name: string): T | null;
  $appendStyle$(content: string, styleId: string, host: HostElement, scoped: boolean): void;
  /**
   * When component is about to be executed, it may add/remove children. This can cause problems
   * with the projection because deleting content will prevent the projection references from
   * looking up vnodes. Therefore before we execute the component we need to ensure that all of its
   * references to vnode are resolved.
   *
   * @param renderHost - Host element to ensure projection is resolved.
   */
  ensureProjectionResolved(host: HostElement): void;
  serializationCtxFactory(
    NodeConstructor: {
      new (...rest: any[]): { __brand__: 'SsrNode' };
    } | null,
    DomRefConstructor: {
      new (...rest: any[]): { __brand__: 'DomRef' };
    } | null,
    symbolToChunkResolver: SymbolToChunkResolver,
    writer?: StreamWriter
  ): SerializationContext;
}

export type HostElement = VNode | ISsrNode;

export interface QElement extends HTMLElement {
  qDispatchEvent?: (event: Event, scope: QwikLoaderEventScope) => boolean;
  vNode?: VNode;
}

export type qWindow = Window & {
  qwikevents: {
    events: Set<string>;
    roots: Set<Node>;
    push: (...e: (string | (EventTarget & ParentNode))[]) => void;
  };
};

export type QwikLoaderEventScope = '-document' | '-window' | '';

/**
 * A friendly name tag for a VirtualVNode.
 *
 * Theses are used to give a name to a VirtualVNode. This is useful for debugging and testing.
 *
 * The name is only added in development mode and is not included in production builds.
 */
export const DEBUG_TYPE = 'q:type';

export const enum VirtualType {
  Virtual = 'V',
  Fragment = 'F',
  WrappedSignal = 'S',
  Awaited = 'A',
  Component = 'C',
  InlineComponent = 'I',
  Projection = 'P',
}

export const VirtualTypeName: Record<string, string> = {
  [VirtualType.Virtual]: /* ********* */ 'Virtual', //
  [VirtualType.Fragment]: /* ******** */ 'Fragment', //
  [VirtualType.WrappedSignal]: /* *** */ 'Signal', //
  [VirtualType.Awaited]: /* ********* */ 'Awaited', //
  [VirtualType.Component]: /* ******* */ 'Component', //
  [VirtualType.InlineComponent]: /* * */ 'InlineComponent', //
  [VirtualType.Projection]: /* ****** */ 'Projection', //
};

export const enum QContainerValue {
  PAUSED = 'paused',
  RESUMED = 'resumed',
  // these values below are used in the qwik loader as a plain text for the q:container selector
  // standard dangerouslySetInnerHTML
  HTML = 'html',
  // textarea
  TEXT = 'text',
}

export type ObjToProxyMap = WeakMap<any, any>;

export interface QContainerElement extends Element {
  qFuncs?: Function[];
  _qwikjson_?: any;
}

/** @public */
export type SerializationStrategy =
  // TODO: implement this in the future
  // 'auto' |
  'never' | 'always';

export const enum SsrNodeFlags {
  Updatable = 1,
}

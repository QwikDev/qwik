import { qError, QError_invalidRefValue } from '../error/error';
import type { ResourceReturnInternal, SubscriberEffect } from '../use/use-task';
import { seal } from '../util/qdev';
import { isFunction } from '../util/types';
import type { QRL } from '../qrl/qrl.public';
import { fromKebabToCamelCase } from '../util/case';
import { QContainerAttr } from '../util/markers';
import { isElement } from '../util/element';
import { createSubscriptionManager, type SubscriberSignal } from '../state/common';
import { isSignalV1, type Signal, type SignalImpl } from '../state/signal';
import { directGetAttribute } from '../render/fast-calls';
import type { QContext } from '../state/context';
import { isServerPlatform } from '../platform/platform';
import type { StoreTracker } from '../state/store';

export type GetObject = (id: string) => any;
// v2 allows numbers
export type GetObjID = (obj: any) => string | number | null;
export type MustGetObjID = (obj: any) => string;

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

export type ObjToProxyMap = WeakMap<any, any>;

/** @public */
export interface PauseContext {
  getObject: GetObject;
  meta: SnapshotMeta;
  refs: Record<string, string>;
}

/** @public */
export interface ContainerState extends StoreTracker {
  readonly $containerEl$: Element;

  readonly $taskNext$: Set<SubscriberEffect>;
  readonly $taskStaging$: Set<SubscriberEffect>;

  readonly $opsNext$: Set<SubscriberSignal>;

  readonly $hostsNext$: Set<QContext>;
  readonly $hostsStaging$: Set<QContext>;
  readonly $base$: string;

  $hostsRendering$: Set<QContext> | undefined;
  $renderPromise$: Promise<void> | undefined;

  $serverData$: Record<string, any>;
  $elementIndex$: number;

  $pauseCtx$: PauseContext | undefined;
  $styleMoved$: boolean;
  readonly $styleIds$: Set<string>;
  readonly $events$: Set<string>;
  readonly $inlineFns$: Map<string, number>;
}

const CONTAINER_STATE = Symbol('ContainerState');

/** @internal */
export const _getContainerState = (containerEl: Element): ContainerState => {
  let state = (containerEl as any)[CONTAINER_STATE] as ContainerState;
  if (!state) {
    (containerEl as any)[CONTAINER_STATE] = state = createContainerState(
      containerEl,
      directGetAttribute(containerEl, 'q:base') ?? '/'
    );
  }
  return state;
};

export const createContainerState = (containerEl: Element, base: string) => {
  const containerAttributes: Record<string, string> = {};
  if (containerEl) {
    const attrs = containerEl.attributes;
    if (attrs) {
      for (let index = 0; index < attrs.length; index++) {
        const attr = attrs[index];
        containerAttributes[attr.name] = attr.value;
      }
    }
  }
  // @ts-expect-error - v1 code missing StoreTracker
  const containerState: ContainerState = {
    $containerEl$: containerEl,

    $elementIndex$: 0,
    $styleMoved$: false,

    $proxyMap$: new WeakMap(),

    $opsNext$: new Set(),

    $taskNext$: new Set(),
    $taskStaging$: new Set(),

    $hostsNext$: new Set(),
    $hostsStaging$: new Set(),

    $styleIds$: new Set(),
    $events$: new Set(),

    $serverData$: { containerAttributes },
    $base$: base,
    $renderPromise$: undefined,
    $hostsRendering$: undefined,
    $pauseCtx$: undefined,
    $subsManager$: undefined as any,
    $inlineFns$: new Map(),
  };
  (containerState as any).$subsManager$ = createSubscriptionManager(containerState);
  seal(containerState);
  return containerState;
};

export const removeContainerState = (containerEl: Element) => {
  delete (containerEl as any)[CONTAINER_STATE];
};

export const setRef = (value: any, elm: Element) => {
  if (isFunction(value)) {
    return value(elm);
  } else if (isSignalV1(value)) {
    if (isServerPlatform()) {
      // During SSR, assigning a ref should not cause reactivity because
      // the expectation is that the ref is filled in on the client
      return ((value as SignalImpl<Element>).untrackedValue = elm);
    } else {
      return ((value as Signal<Element>).value = elm);
    }
  }
  throw qError(QError_invalidRefValue, value);
};

export const SHOW_ELEMENT = 1;
export const SHOW_COMMENT = 128;
export const FILTER_ACCEPT = 1;
export const FILTER_REJECT = 2;
export const FILTER_SKIP = 3;

export const isContainer = (el: Node) => {
  return isElement(el) && el.hasAttribute(QContainerAttr);
};

export const intToStr = (nu: number) => {
  return nu.toString(36);
};

export const strToInt = (nu: string) => {
  return parseInt(nu, 36);
};

export const getEventName = (attribute: string) => {
  const colonPos = attribute.indexOf(':');
  if (attribute) {
    return fromKebabToCamelCase(attribute.slice(colonPos + 1));
  } else {
    return attribute;
  }
};

export interface QContainerElement extends Element {
  qFuncs?: Function[];
  _qwikjson_?: any;
}

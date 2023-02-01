import { qError, QError_invalidRefValue } from '../error/error';
import { isServer } from '../platform/platform';
import type { Ref } from '../use/use-ref';
import type { ResourceReturnInternal, SubscriberEffect } from '../use/use-task';
import { logWarn } from '../util/log';
import { qSerialize, qTest, seal } from '../util/qdev';
import { isFunction, isObject } from '../util/types';
import type { QwikElement } from '../render/dom/virtual-element';
import type { RenderContext } from '../render/types';
import type { QRL } from '../qrl/qrl.public';
import { fromKebabToCamelCase } from '../util/case';
import { QContainerAttr } from '../util/markers';
import { isElement } from '../util/element';
import { createSubscriptionManager, SubscriberSignal, SubscriptionManager } from '../state/common';
import type { Signal } from '../state/signal';
import { directGetAttribute } from '../render/fast-calls';
import { assertTrue } from '../error/assert';

export type GetObject = (id: string) => any;
export type GetObjID = (obj: any) => string | null;
export type MustGetObjID = (obj: any) => string;

/**
 * @alpha
 */
export interface SnapshotMetaValue {
  w?: string; // q:watches
  s?: string; // q:seq
  h?: string; // q:host
  c?: string; // q:context
}

/**
 * @alpha
 */
export type SnapshotMeta = Record<string, SnapshotMetaValue>;

/**
 * @alpha
 */
export interface SnapshotState {
  ctx: SnapshotMeta;
  refs: Record<string, string>;
  objs: any[];
  subs: any[];
}

/**
 * @alpha
 */
export interface SnapshotListener {
  key: string;
  qrl: QRL<any>;
  el: Element;
}

/**
 * @alpha
 */
export interface SnapshotResult {
  state: SnapshotState;
  qrls: QRL[];
  objs: any[];
  resources: ResourceReturnInternal<any>[];
  mode: 'render' | 'listeners' | 'static';
}

export type ObjToProxyMap = WeakMap<any, any>;

/**
 * @alpha
 */
export interface PauseContext {
  getObject: GetObject;
  meta: SnapshotMeta;
  refs: Record<string, string>;
}

/**
 * @alpha
 */
export interface ContainerState {
  readonly $containerEl$: Element;

  readonly $proxyMap$: ObjToProxyMap;
  $subsManager$: SubscriptionManager;

  readonly $watchNext$: Set<SubscriberEffect>;
  readonly $watchStaging$: Set<SubscriberEffect>;

  readonly $opsNext$: Set<SubscriberSignal>;

  readonly $hostsNext$: Set<QwikElement>;
  readonly $hostsStaging$: Set<QwikElement>;
  readonly $base$: string;

  $hostsRendering$: Set<QwikElement> | undefined;
  $renderPromise$: Promise<RenderContext> | undefined;

  $serverData$: Record<string, any>;
  $elementIndex$: number;

  $pauseCtx$: PauseContext | undefined;
  readonly $styleIds$: Set<string>;
  readonly $events$: Set<string>;
}

const CONTAINER_STATE = Symbol('ContainerState');

/**
 * @internal
 */
export const _getContainerState = (containerEl: Element): ContainerState => {
  let set = (containerEl as any)[CONTAINER_STATE] as ContainerState;
  if (!set) {
    assertTrue(!isServer(), 'Container state can only be created lazily on the browser');
    (containerEl as any)[CONTAINER_STATE] = set = createContainerState(
      containerEl,
      directGetAttribute(containerEl, 'q:base') ?? '/'
    );
  }
  return set;
};

export const createContainerState = (containerEl: Element, base: string) => {
  const containerState: ContainerState = {
    $containerEl$: containerEl,

    $elementIndex$: 0,

    $proxyMap$: new WeakMap(),

    $opsNext$: new Set(),

    $watchNext$: new Set(),
    $watchStaging$: new Set(),

    $hostsNext$: new Set(),
    $hostsStaging$: new Set(),

    $styleIds$: new Set(),
    $events$: new Set(),

    $serverData$: {},
    $base$: base,
    $renderPromise$: undefined,
    $hostsRendering$: undefined,
    $pauseCtx$: undefined,
    $subsManager$: null as any,
  };
  seal(containerState);
  containerState.$subsManager$ = createSubscriptionManager(containerState);
  return containerState;
};

export const setRef = (value: any, elm: Element) => {
  if (isFunction(value)) {
    return value(elm);
  } else if (isObject(value)) {
    if ('current' in value) {
      return ((value as Ref<Element>).current = elm);
    } else if ('value' in value) {
      return ((value as Signal<Element>).value = elm);
    }
  }
  throw qError(QError_invalidRefValue, value);
};

export const addQwikEvent = (prop: string, containerState: ContainerState) => {
  const eventName = getEventName(prop);
  if (!qTest && !isServer()) {
    try {
      const qwikevents = ((globalThis as any).qwikevents ||= []);
      qwikevents.push(eventName);
    } catch (err) {
      logWarn(err);
    }
  }
  if (qSerialize) {
    containerState.$events$.add(eventName);
  }
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

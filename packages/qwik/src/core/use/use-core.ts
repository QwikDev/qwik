import type { QwikDocument } from '../document';
import { assertDefined } from '../shared/error/assert';
import { QError, qError } from '../shared/error/error';
import type { QRLInternal } from '../shared/qrl/qrl-class';
import type { QRL } from '../shared/qrl/qrl.public';
import {
  ComputedEvent,
  QContainerSelector,
  QLocaleAttr,
  RenderEvent,
  ResourceEvent,
  TaskEvent,
} from '../shared/utils/markers';
import { isPromise, retryOnPromise } from '../shared/utils/promises';
import { seal } from '../shared/utils/qdev';
import { isArray } from '../shared/utils/types';
import { setLocale } from './use-locale';
import type { Container, HostElement } from '../shared/types';
import { vnode_getNode, vnode_isElementVNode, vnode_isVNode } from '../client/vnode';
import { _getQContainerElement } from '../client/dom-container';
import type { ContainerElement } from '../client/types';
import {
  WrappedSignal,
  type EffectPropData,
  type EffectSubscriptions,
  type EffectSubscriptionsProp,
} from '../signal/signal';
import type { Signal } from '../signal/signal.public';

declare const document: QwikDocument;

// Simplified version of `ServerRequestEvent` from `@qwik.dev/router` package.
export interface SimplifiedServerRequestEvent<T = unknown> {
  url: URL;
  locale: string | undefined;
  request: Request;
}

export interface StyleAppend {
  styleId: string;
  content: string | null;
}

// Simplified version of `ServerRequestEvent` from `@qwik.dev/router` package.
export interface ServerRequestEvent<T = unknown> {
  url: URL;
  locale: string | undefined;
  request: Request;
}

export type PossibleEvents =
  | Event
  | SimplifiedServerRequestEvent
  | typeof TaskEvent
  | typeof RenderEvent
  | typeof ComputedEvent
  | typeof ResourceEvent;

export interface RenderInvokeContext extends InvokeContext {
  // The below are just always-defined attributes of InvokeContext.
  $hostElement$: HostElement;
  $event$: PossibleEvents;
  $waitOn$: Promise<unknown>[];
  $container$: Container;
}

export type InvokeTuple = [Element, Event, URL?];

/** The shared state during an invoke() call */
export interface InvokeContext {
  /* The URL of the QRL */
  $url$: URL | undefined;
  /** The next available index for the sequentialScope array */
  $i$: number;
  /** The Virtual parent component for the current component code */
  $hostElement$: HostElement | undefined;
  /** The current DOM element */
  $element$: Element | undefined;
  /** The event we're currently handling */
  $event$: PossibleEvents | undefined;
  /** The QRL function we're currently executing */
  $qrl$: QRL | undefined;
  $effectSubscriber$: EffectSubscriptions | undefined;
  $locale$: string | undefined;
  $container$: Container | undefined;
}

let _context: InvokeContext | undefined;

/** @public */
export const tryGetInvokeContext = (): InvokeContext | undefined => {
  if (!_context) {
    const context = typeof document !== 'undefined' && document && document.__q_context__;
    if (!context) {
      return undefined;
    }
    if (isArray(context)) {
      return (document.__q_context__ = newInvokeContextFromTuple(context as InvokeTuple));
    }
    return context as InvokeContext;
  }
  return _context;
};

export const getInvokeContext = (): InvokeContext => {
  const ctx = tryGetInvokeContext();
  if (!ctx) {
    throw qError(QError.useMethodOutsideContext);
  }
  return ctx;
};

export const useInvokeContext = (): RenderInvokeContext => {
  const ctx = tryGetInvokeContext();
  if (!ctx || ctx.$event$ !== RenderEvent) {
    throw qError(QError.useInvokeContext);
  }
  assertDefined(ctx.$hostElement$, `invoke: $hostElement$ must be defined`, ctx);
  assertDefined(ctx.$effectSubscriber$, `invoke: $effectSubscriber$ must be defined`, ctx);

  return ctx as RenderInvokeContext;
};

export function useBindInvokeContext<FN extends (...args: any) => any>(
  this: unknown,
  fn: FN | undefined
): typeof fn {
  if (fn == null) {
    return fn;
  }
  const ctx = getInvokeContext();
  return function (this: unknown, ...args: Parameters<FN>) {
    return (invokeApply<FN>).call(this, ctx, fn!, args);
  } as FN;
}

/** Call a function with the given InvokeContext and given arguments. */
export function invoke<FN extends (...args: any) => any>(
  this: unknown,
  context: InvokeContext | undefined,
  fn: FN,
  ...args: Parameters<FN>
): ReturnType<FN> {
  return invokeApply.call(this, context, fn, args);
}

/** Call a function with the given InvokeContext and array of arguments. */
export function invokeApply<FN extends (...args: any) => any>(
  this: unknown,
  context: InvokeContext | undefined,
  fn: FN,
  args: Parameters<FN>
): ReturnType<FN> {
  const previousContext = _context;
  let returnValue: ReturnType<FN>;
  try {
    _context = context;
    returnValue = fn.apply(this, args);
  } finally {
    _context = previousContext;
  }
  return returnValue;
}

export const waitAndRun = (ctx: RenderInvokeContext, callback: () => unknown) => {
  const waitOn = ctx.$waitOn$;
  if (waitOn.length === 0) {
    const result = callback();
    if (isPromise(result)) {
      waitOn.push(result);
    }
  } else {
    waitOn.push(Promise.all(waitOn).then(callback));
  }
};

export const newInvokeContextFromTuple = ([element, event, url]: InvokeTuple) => {
  const container = element.closest(QContainerSelector);
  const locale = container?.getAttribute(QLocaleAttr) || undefined;
  locale && setLocale(locale);
  return newInvokeContext(locale, undefined, element, event, url);
};

// TODO how about putting url and locale (and event/custom?) in to a "static" object
export const newInvokeContext = (
  locale?: string,
  hostElement?: HostElement,
  element?: Element,
  event?: PossibleEvents,
  url?: URL
): InvokeContext => {
  // ServerRequestEvent has .locale, but it's not always defined.
  const $locale$ =
    locale || (typeof event === 'object' && event && 'locale' in event ? event.locale : undefined);
  const ctx: InvokeContext = {
    $url$: url,
    $i$: 0,
    $hostElement$: hostElement,
    $element$: element,
    $event$: event,
    $qrl$: undefined,
    $effectSubscriber$: undefined,
    $locale$,
    $container$: undefined,
  };
  seal(ctx);
  return ctx;
};

/**
 * Don't track listeners for this callback
 *
 * @public
 */
export const untrack = <T>(fn: () => T): T => {
  return invoke(undefined, fn);
};

const trackInvocation = /*#__PURE__*/ newInvokeContext(
  undefined,
  undefined,
  undefined,
  RenderEvent
);

/**
 * @param fn
 * @param subscriber
 * @param property `true` - subscriber is component `false` - subscriber is VNode `string` -
 *   subscriber is property
 * @param container
 * @returns
 */
export const trackSignal = <T>(
  fn: () => T,
  subscriber: EffectSubscriptions[EffectSubscriptionsProp.EFFECT],
  property: EffectSubscriptions[EffectSubscriptionsProp.PROPERTY],
  container: Container,
  data?: EffectPropData
): T => {
  const previousSubscriber = trackInvocation.$effectSubscriber$;
  const previousContainer = trackInvocation.$container$;
  try {
    trackInvocation.$effectSubscriber$ = [subscriber, property];
    if (data) {
      trackInvocation.$effectSubscriber$.push(data);
    }
    trackInvocation.$container$ = container;
    return invoke(trackInvocation, fn);
  } finally {
    trackInvocation.$effectSubscriber$ = previousSubscriber;
    trackInvocation.$container$ = previousContainer;
  }
};

export const trackSignalAndAssignHost = (
  value: Signal,
  host: HostElement,
  property: EffectSubscriptions[EffectSubscriptionsProp.PROPERTY],
  container: Container,
  data?: EffectPropData
) => {
  if (value instanceof WrappedSignal && value.$hostElement$ !== host && host) {
    value.$hostElement$ = host;
  }
  return retryOnPromise(() => trackSignal(() => value.value, host, property, container, data));
};

/** @internal */
export const _getContextElement = (): unknown => {
  const iCtx = tryGetInvokeContext();
  if (iCtx) {
    const hostElement = iCtx.$hostElement$;
    let element: Element | null = null;
    if (vnode_isVNode(hostElement) && vnode_isElementVNode(hostElement)) {
      element = vnode_getNode(hostElement) as Element | null;
    }

    return element ?? (iCtx.$qrl$ as QRLInternal)?.$setContainer$(undefined);
  }
};

/** @internal */
export const _getContextEvent = (): unknown => {
  const iCtx = tryGetInvokeContext();
  if (iCtx) {
    return iCtx.$event$;
  }
};

/** @internal */
export const _jsxBranch = <T>(input?: T) => {
  return input;
};

/** @internal */
export const _waitUntilRendered = (elm: Element) => {
  const containerEl = _getQContainerElement(elm);
  if (!containerEl) {
    return Promise.resolve();
  }
  const container = (containerEl as ContainerElement).qContainer;
  return container?.renderDone ?? Promise.resolve();
};

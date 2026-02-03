import { isDev } from '@qwik.dev/core/build';
import type { SignalImpl } from 'packages/qwik/src/server/qwik-types';
import { getDomContainer } from '../client/dom-container';
import { vnode_locate } from '../client/vnode-utils';
import { unwrapStore } from '../index';
import { WrappedSignalImpl } from '../reactive-primitives/impl/wrapped-signal-impl';
import { isSignal, type Signal } from '../reactive-primitives/signal.public';
import { getSubscriber } from '../reactive-primitives/subscriber';
import type { SubscriptionData } from '../reactive-primitives/subscription-data';
import type { Consumer, EffectProperty, EffectSubscription } from '../reactive-primitives/types';
import { assertDefined } from '../shared/error/assert';
import { QError, qError } from '../shared/error/error';
import type { Container, HostElement } from '../shared/types';
import { RenderEvent, ResourceEvent, TaskEvent } from '../shared/utils/markers';
import { seal } from '../shared/utils/qdev';
import { isObject } from '../shared/utils/types';
import { setLocale } from './use-locale';

// Simplified version of `ServerRequestEvent` from `@qwik.dev/router` package.
export interface SimplifiedServerRequestEvent<T = unknown> {
  url: URL;
  locale: string | undefined;
  request: Request;
}

export type PossibleEvents =
  | Event
  | SimplifiedServerRequestEvent
  | typeof TaskEvent
  | typeof RenderEvent
  | typeof ResourceEvent;

export interface RenderInvokeContext extends InvokeContext {
  // The below are just always-defined attributes of InvokeContext.
  $hostElement$: HostElement;
  $event$: typeof RenderEvent;
  $waitOn$: Promise<unknown> | undefined;
  $container$: Container;
}

/** The shared state during an invoke() call */
export interface InvokeContext {
  /** The Virtual parent component for the current component code */
  $hostElement$: HostElement | undefined;
  /** The event we're currently handling */
  $event$: PossibleEvents | undefined;
  $effectSubscriber$: EffectSubscription | undefined;
  $locale$: string | undefined;
  $container$: Container | undefined;
}

let _context: InvokeContext | undefined;

export const tryGetInvokeContext = (): InvokeContext | undefined => {
  return _context;
};

export const getInvokeContext = (): InvokeContext => {
  const ctx = tryGetInvokeContext();
  if (!ctx) {
    throw qError(QError.useMethodOutsideContext);
  }
  return ctx;
};

/** @internal */
export const useInvokeContext = (): RenderInvokeContext => {
  const ctx = tryGetInvokeContext();
  if (!ctx || ctx.$event$ !== RenderEvent) {
    throw qError(QError.useInvokeContext);
  }
  isDev && assertDefined(ctx.$hostElement$, `invoke: $hostElement$ must be defined`, ctx);
  isDev && assertDefined(ctx.$effectSubscriber$, `invoke: $effectSubscriber$ must be defined`, ctx);

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
export function invoke<FN extends (...args: any[]) => any>(
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
  try {
    _context = context;
    return fn.apply(this, args);
  } finally {
    _context = previousContext;
  }
}

export const newInvokeContextFromDOM = (event: Event, element: Element) => {
  const domContainer = getDomContainer(element);
  const hostElement = vnode_locate(domContainer.rootVNode, element);
  const locale = domContainer.$locale$;
  locale && setLocale(locale);
  const context = newInvokeContext(locale, hostElement, event);
  context.$container$ = domContainer;
  return context;
};

export function newRenderInvokeContext(
  locale: string | undefined,
  hostElement: HostElement,
  container: Container
): RenderInvokeContext {
  const ctx: RenderInvokeContext = {
    $hostElement$: hostElement,
    $event$: RenderEvent,
    $effectSubscriber$: undefined,
    $locale$: locale,
    $container$: container,
    $waitOn$: undefined,
  };
  seal(ctx);
  return ctx;
}

// TODO how about putting url and locale (and event/custom?) in to a "static" object
export function newInvokeContext(
  locale?: string,
  hostElement?: HostElement,
  event?: Exclude<PossibleEvents, typeof RenderEvent>
): InvokeContext {
  // ServerRequestEvent has .locale, but it's not always defined.
  const $locale$ =
    locale || (event && isObject(event) && 'locale' in event ? event.locale : undefined);
  const ctx: InvokeContext = {
    $hostElement$: hostElement,
    $event$: event,
    $effectSubscriber$: undefined,
    $locale$,
    $container$: undefined,
  };
  seal(ctx);
  return ctx;
}

/**
 * Get the value of the expression without tracking listeners. A function will be invoked, signals
 * will return their value, and stores will be unwrapped (they return the backing object).
 *
 * When you pass a function, you can also pass additional arguments that the function will receive.
 *
 * Note that stores are not unwrapped recursively.
 *
 * @param expr - The function or object to evaluate without tracking.
 * @param args - Additional arguments to pass when `expr` is a function.
 * @public
 */
export const untrack = <T, A extends any[]>(
  expr: ((...args: A) => T) | Signal<T> | T,
  ...args: A
): T => {
  if (typeof expr === 'function') {
    if (_context) {
      const sub = _context.$effectSubscriber$;
      try {
        _context.$effectSubscriber$ = undefined;
        return (expr as (...args: A) => T)(...args);
      } finally {
        _context.$effectSubscriber$ = sub;
      }
    } else {
      return (expr as (...args: A) => T)(...args);
    }
  }
  if (isSignal(expr)) {
    return (expr as SignalImpl<T>).untrackedValue;
  }
  return unwrapStore(expr);
};

const trackInvocation = /*#__PURE__*/ newRenderInvokeContext(undefined, undefined!, undefined!);

/**
 * @param fn
 * @param subscriber
 * @param property `true` - subscriber is component `false` - subscriber is VNode `string` -
 *   subscriber is property
 * @param container
 * @param data - Additional subscription data
 * @returns
 */
export const trackSignal = <T>(
  fn: () => T,
  subscriber: Consumer,
  property: EffectProperty | string,
  container: Container,
  data?: SubscriptionData
): T => {
  const previousSubscriber = trackInvocation.$effectSubscriber$;
  const previousContainer = trackInvocation.$container$;
  try {
    trackInvocation.$effectSubscriber$ = getSubscriber(subscriber, property, data);
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
  property: EffectProperty | string,
  container: Container,
  data?: SubscriptionData
) => {
  if (value instanceof WrappedSignalImpl && value.$hostElement$ !== host && host) {
    value.$hostElement$ = host;
  }
  return trackSignal(() => value.value, host, property, container, data);
};

/** @internal */
export const _getContextHostElement = () => {
  return tryGetInvokeContext()?.$hostElement$;
};

/** @internal */
export const _getContextEvent = (): unknown => {
  const iCtx = tryGetInvokeContext();
  if (iCtx) {
    return iCtx.$event$;
  }
};

/** @internal */
export const _getContextContainer = (): Container | undefined => {
  const iCtx = tryGetInvokeContext();
  if (iCtx) {
    return iCtx.$container$ as Container;
  }
};

/**
 * @deprecated
 * @internal
 * No longer used since v2
 */
export const _jsxBranch = <T>(input?: T) => {
  return input;
};

/** @internal */
export const _waitUntilRendered = (container: Container): Promise<void> => {
  return container.$renderPromise$ || Promise.resolve();
};

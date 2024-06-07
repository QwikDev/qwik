import { _getContainerState } from '../container/container';
import type { QwikDocument } from '../document';
import { assertDefined } from '../error/assert';
import { qError, QError_useInvokeContext, QError_useMethodOutsideContext } from '../error/error';
import type { QRLInternal } from '../qrl/qrl-class';
import type { QRL } from '../qrl/qrl.public';
import type { QwikElement } from '../render/dom/virtual-element';
import type { RenderContext } from '../render/types';
import { getContext, HOST_FLAG_DYNAMIC } from '../state/context';
import {
  ComputedEvent,
  QContainerSelector,
  QLocaleAttr,
  RenderEvent,
  ResourceEvent,
  TaskEvent,
} from '../util/markers';
import { isPromise } from '../util/promises';
import { seal } from '../util/qdev';
import { isArray } from '../util/types';
import { setLocale } from './use-locale';
import type { Subscriber } from '../state/common';
import type { Signal } from '../state/signal';

declare const document: QwikDocument;

// Simplified version of `ServerRequestEvent` from `@builder.io/qwik-city` package.
export interface SimplifiedServerRequestEvent<T = unknown> {
  url: URL;
  locale: string | undefined;
  request: Request;
}

export interface StyleAppend {
  styleId: string;
  content: string | null;
}

// Simplified version of `ServerRequestEvent` from `@builder.io/qwik-city` package.
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
  $renderCtx$: RenderContext;
  /** The parent document */
  $doc$: Document;
  // The below are just always-defined attributes of InvokeContext.
  $hostElement$: QwikElement;
  $event$: PossibleEvents;
  $waitOn$: Promise<unknown>[];
  $subscriber$: Subscriber | null;
}

export type InvokeTuple = [Element, Event, URL?];

/** The shared state during an invoke() call */
export interface InvokeContext {
  /* The URL of the QRL */
  $url$: URL | undefined;
  /** The next available index for the sequentialScope array */
  $i$: number;
  /** The Virtual parent component for the current component code */
  $hostElement$: QwikElement | undefined;
  /** The current DOM element */
  $element$: Element | undefined;
  /** The event we're currently handling */
  $event$: PossibleEvents | undefined;
  /** The QRL function we're currently executing */
  $qrl$: QRL | undefined;
  /** Promises that need awaiting before the current invocation is done */
  $waitOn$: Promise<unknown>[] | undefined;
  /** The current subscriber for registering signal reads */
  $subscriber$: Subscriber | null | undefined;
  $renderCtx$: RenderContext | undefined;
  $locale$: string | undefined;
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
    throw qError(QError_useMethodOutsideContext);
  }
  return ctx;
};

export const useInvokeContext = (): RenderInvokeContext => {
  const ctx = tryGetInvokeContext();
  if (!ctx || ctx.$event$ !== RenderEvent) {
    throw qError(QError_useInvokeContext);
  }
  assertDefined(ctx.$hostElement$, `invoke: $hostElement$ must be defined`, ctx);
  assertDefined(ctx.$waitOn$, `invoke: $waitOn$ must be defined`, ctx);
  assertDefined(ctx.$renderCtx$, `invoke: $renderCtx$ must be defined`, ctx);
  assertDefined(ctx.$subscriber$, `invoke: $subscriber$ must be defined`, ctx);

  return ctx as RenderInvokeContext;
};
export const useContainerState = () => {
  const ctx = useInvokeContext();
  return ctx.$renderCtx$.$static$.$containerState$;
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
  hostElement?: QwikElement,
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
    $waitOn$: undefined,
    $subscriber$: undefined,
    $renderCtx$: undefined,
    $locale$,
  };
  seal(ctx);
  return ctx;
};

export const getWrappingContainer = (el: QwikElement): Element | null => {
  return el.closest(QContainerSelector);
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
 * Mark sub as a listener for the signal
 *
 * @public
 */
export const trackSignal = <T>(signal: Signal, sub: Subscriber): T => {
  trackInvocation.$subscriber$ = sub;
  return invoke(trackInvocation, () => signal.value);
};

/** @internal */
export const _getContextElement = (): unknown => {
  const iCtx = tryGetInvokeContext();
  if (iCtx) {
    return (
      iCtx.$element$ ?? iCtx.$hostElement$ ?? (iCtx.$qrl$ as QRLInternal)?.$setContainer$(undefined)
    );
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
  const iCtx = tryGetInvokeContext();
  if (iCtx && iCtx.$hostElement$ && iCtx.$renderCtx$) {
    const hostElement = iCtx.$hostElement$;
    const elCtx = getContext(hostElement, iCtx.$renderCtx$.$static$.$containerState$);
    elCtx.$flags$ |= HOST_FLAG_DYNAMIC;
  }
  return input;
};

/** @internal */
export const _waitUntilRendered = (elm: Element) => {
  const containerEl = getWrappingContainer(elm);
  if (!containerEl) {
    return Promise.resolve();
  }
  const containerState = _getContainerState(containerEl);
  return containerState.$renderPromise$ ?? Promise.resolve();
};

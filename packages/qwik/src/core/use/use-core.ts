import { isArray } from '../util/types';
import { assertDefined } from '../error/assert';
import type { QwikDocument } from '../document';
import { QContainerSelector, RenderEvent } from '../util/markers';
import type { QRL } from '../qrl/qrl.public';
import { qError, QError_useInvokeContext, QError_useMethodOutsideContext } from '../error/error';
import type { RenderContext } from '../render/types';
import type { SubscriberEffect, SubscriberHost } from './use-watch';
import type { QwikElement } from '../render/dom/virtual-element';
import { seal } from '../util/qdev';
import { isPromise } from '../util/promises';

declare const document: QwikDocument;

export interface StyleAppend {
  styleId: string;
  content: string | null;
}

export interface RenderInvokeContext extends InvokeContext {
  $url$: URL;
  $seq$: number;
  $doc$: Document;
  $hostElement$: QwikElement;
  $element$: Element;
  $event$: any;
  $qrl$: QRL<any>;
  $waitOn$: Promise<any>[];
  $subscriber$: SubscriberEffect | SubscriberHost | null;
  $renderCtx$: RenderContext;
}

export type InvokeTuple = [Element, Event, URL?];

export interface InvokeContext {
  $url$: URL | undefined;
  $seq$: number;
  $hostElement$: QwikElement | undefined;
  $element$: Element | undefined;
  $event$: any | undefined;
  $qrl$: QRL<any> | undefined;
  $waitOn$: Promise<any>[] | undefined;
  $subscriber$: SubscriberEffect | SubscriberHost | null | undefined;
  $renderCtx$: RenderContext | undefined;
}

let _context: InvokeContext | undefined;

export const tryGetInvokeContext = (): InvokeContext | undefined => {
  if (!_context) {
    const context = typeof document !== 'undefined' && document && document.__q_context__;
    if (!context) {
      return undefined;
    }
    if (isArray(context)) {
      return (document.__q_context__ = newInvokeContextFromTuple(context as any));
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
  const ctx = getInvokeContext();
  if (ctx.$event$ !== RenderEvent) {
    throw qError(QError_useInvokeContext);
  }
  assertDefined(ctx.$hostElement$, `invoke: $hostElement$ must be defined`, ctx);
  assertDefined(ctx.$waitOn$, `invoke: $waitOn$ must be defined`, ctx);
  assertDefined(ctx.$renderCtx$, `invoke: $renderCtx$ must be defined`, ctx);
  assertDefined(ctx.$subscriber$, `invoke: $subscriber$ must be defined`, ctx);

  return ctx as any;
};

export const useBindInvokeContext = <T extends ((...args: any[]) => any) | undefined>(
  callback: T
): T => {
  if (callback == null) {
    return callback;
  }
  const ctx = getInvokeContext();
  return ((...args: any[]) => {
    return invoke(ctx, callback.bind(undefined, ...args));
  }) as T;
};
export const invoke = <ARGS extends any[] = any[], RET = any>(
  context: InvokeContext | undefined,
  fn: (...args: ARGS) => RET,
  ...args: ARGS
): RET => {
  const previousContext = _context;
  let returnValue: RET;
  try {
    _context = context;
    returnValue = fn.apply(null, args);
  } finally {
    _context = previousContext;
  }
  return returnValue;
};

export const waitAndRun = (ctx: RenderInvokeContext, callback: () => any) => {
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

export const newInvokeContextFromTuple = (context: InvokeTuple) => {
  const element = context[0];
  return newInvokeContext(undefined, element, context[1], context[2]);
};

export const newInvokeContext = (
  hostElement?: QwikElement,
  element?: Element,
  event?: any,
  url?: URL
): InvokeContext => {
  const ctx = {
    $seq$: 0,
    $hostElement$: hostElement,
    $element$: element,
    $event$: event,
    $url$: url,
    $qrl$: undefined,
    $props$: undefined,
    $renderCtx$: undefined,
    $subscriber$: undefined,
    $waitOn$: undefined,
  };
  seal(ctx);
  return ctx;
};

export const getWrappingContainer = (el: QwikElement): Element | null => {
  return el.closest(QContainerSelector);
};

import type { ValueOrPromise } from '../util/types';
import type { Props } from '../props/props.public';
import { assertDefined } from '../assert/assert';
import type { QwikDocument } from '../document';
import type { QRLInternal } from '../import/qrl-class';
import { QContainerSelector, QHostAttr } from '../util/markers';
import { getDocument } from '../util/dom';

declare const document: QwikDocument;

export interface StyleAppend {
  type: 'style';
  scope: string;
  content: string;
}

export function isStyleTask(obj: any): obj is StyleAppend {
  return obj && typeof obj === 'object' && obj.type === 'style';
}

export interface InvokeContext {
  doc?: Document;
  hostElement?: Element;
  element?: Element;
  event: any;
  url: URL | null;
  qrl?: QRLInternal;
  subscriptions: boolean;
  waitOn?: ValueOrPromise<any>[];
  props?: Props;
}

let _context: InvokeContext | undefined;

export function tryGetInvokeContext(): InvokeContext | undefined {
  if (!_context) {
    const context = typeof document !== 'undefined' && document && document.__q_context__;
    if (!context) {
      return undefined;
    }
    if (Array.isArray(context)) {
      const element = context[0];
      const hostElement = getHostElement(element)!;
      assertDefined(element);
      return (document.__q_context__ = newInvokeContext(
        getDocument(element),
        hostElement,
        element,
        context[1],
        context[2]
      ));
    }
    return context as InvokeContext;
  }
  return _context;
}

export function getInvokeContext(): InvokeContext {
  const ctx = tryGetInvokeContext();
  if (!ctx) {
    throw new Error("Q-ERROR: invoking 'use*()' method outside of invocation context.");
  }
  return ctx;
}

export function useInvoke<ARGS extends any[] = any[], RET = any>(
  context: InvokeContext,
  fn: (...args: ARGS) => RET,
  ...args: ARGS
): ValueOrPromise<RET> {
  const previousContext = _context;
  let returnValue: RET;
  try {
    _context = context;
    returnValue = fn.apply(null, args);
  } finally {
    const currentCtx = _context!;
    _context = previousContext;
    if (currentCtx.waitOn && currentCtx.waitOn.length > 0) {
      // eslint-disable-next-line no-unsafe-finally
      return Promise.all(currentCtx.waitOn).then(() => returnValue);
    }
  }
  return returnValue;
}
export function newInvokeContext(
  doc?: Document,
  hostElement?: Element,
  element?: Element,
  event?: any,
  url?: URL
): InvokeContext {
  return {
    doc,
    hostElement,
    element,
    event: event,
    url: url || null,
    qrl: undefined,
    subscriptions: event === 'qRender',
  };
}

/**
 * @private
 */
export function useWaitOn(promise: ValueOrPromise<any>): void {
  const ctx = getInvokeContext();
  (ctx.waitOn || (ctx.waitOn = [])).push(promise);
}

export function getHostElement(el: Element): Element | null {
  let foundSlot = false;
  let node: Element | null = el;
  while (node) {
    const isHost = node.hasAttribute(QHostAttr);
    const isSlot = node.tagName === 'Q:SLOT';
    if (isHost) {
      if (!foundSlot) {
        break;
      } else {
        foundSlot = false;
      }
    }
    if (isSlot) {
      foundSlot = true;
    }
    node = node.parentElement;
  }
  return node;
}

export function getContainer(el: Element): Element | null {
  return el.closest(QContainerSelector);
}

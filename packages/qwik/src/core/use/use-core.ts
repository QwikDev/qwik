import type { ValueOrPromise } from '../util/types';
import type { Props } from '../props/props.public';
import { assertDefined } from '../assert/assert';
import type { QwikDocument } from '../document';
import { QContainerSelector, QHostAttr } from '../util/markers';
import { getDocument } from '../util/dom';
import type { QRL } from '../import/qrl.public';
import type { Subscriber } from './use-subscriber';
import type { RenderContext } from '../render/cursor';

declare const document: QwikDocument;

export const CONTAINER = Symbol('container');

export interface StyleAppend {
  type: 'style';
  styleId: string;
  content: string;
}

export function isStyleTask(obj: any): obj is StyleAppend {
  return obj && typeof obj === 'object' && obj.type === 'style';
}

/**
 * @public
 */
export interface InvokeContext {
  url: URL | null;
  seq: number;
  doc?: Document;
  hostElement?: Element;
  element?: Element;
  event: any;
  qrl?: QRL<any>;
  waitOn?: ValueOrPromise<any>[];
  props?: Props;
  subscriber?: Subscriber | null;
  renderCtx?: RenderContext;
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
    seq: 0,
    doc,
    hostElement,
    element,
    event: event,
    url: url || null,
    qrl: undefined,
  };
}

/**
 * @alpha
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
  let container = (el as any)[CONTAINER];
  if (!container) {
    container = el.closest(QContainerSelector);
    (el as any)[CONTAINER] = container;
  }
  return container;
}

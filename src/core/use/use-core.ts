import { assertNotEqual } from '../assert/assert';
import type { QwikDocument } from '../document';
import type { QRL } from '../import/qrl.public';
import { unwrapProxy } from '../object/q-object';
import type { QObject } from '../object/q-object';
import { getProps } from '../props/props.public';

declare const document: QwikDocument;

export function safeQSubscribe(qObject: QObject<any>): void {
  assertNotEqual(unwrapProxy(qObject), qObject, 'Expecting Proxy');
  _context && _context.subscriptions && qObject && _context.subscriptions.add(qObject);
}

interface InvokeContext {
  hostElement: Element;
  event: any;
  url: URL | null;
  qrl?: QRL;
  subscriptions?: Set<QObject<any>>;
  waitOn?: Promise<any>[];
}

let _context: InvokeContext;

export function getInvokeContext(): InvokeContext {
  if (!_context) {
    const context = typeof document !== 'undefined' && document && document.__q_context__;
    if (!context) {
      // TODO(misko): centralize
      throw new Error("Q-ERROR: invoking 'use*()' method outside of invocation context.");
    }
    if (Array.isArray(context)) {
      return (document.__q_context__ = newInvokeContext(context[0], context[1], context[2]));
    }
    return context as InvokeContext;
  }
  return _context;
}

export function useInvoke<ARGS extends any[] = any[], RET = any>(
  context: InvokeContext,
  fn: (...args: ARGS) => RET,
  ...args: ARGS
): RET {
  const previousContext = _context;
  try {
    _context = context;
    return fn.apply(null, args);
  } finally {
    const subscriptions = _context.subscriptions;
    if (subscriptions) {
      const element = _context.hostElement;
      element && ((getProps(element) as any)[':subscriptions'] = subscriptions);
    }
    _context = previousContext;
  }
}
export function newInvokeContext(element: Element, event?: any, url?: URL): InvokeContext {
  return {
    hostElement: element,
    event: event,
    url: url || null,
    qrl: undefined,
    subscriptions: event === 'qRender' ? new Set() : undefined,
  };
}

/**
 * @private
 */
export function useWaitOn(promise: Promise<any>): void {
  const ctx = getInvokeContext();
  (ctx.waitOn || (ctx.waitOn = [])).push(promise);
}

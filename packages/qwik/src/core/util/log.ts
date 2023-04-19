import type { QwikElement } from '../render/dom/virtual-element';
import type { QContext } from '../state/context';
import { isElement, isNode } from './element';
import { qDev } from './qdev';

const STYLE = qDev
  ? `background: #564CE0; color: white; padding: 2px 3px; border-radius: 2px; font-size: 0.8em;`
  : '';

export const logError = (message?: any, ...optionalParams: any[]) => {
  const err = message instanceof Error ? message : createError(message);
  const messageStr = err.stack || err.message;
  console.error('%cQWIK ERROR', STYLE, messageStr, ...printParams(optionalParams));
  return err;
};

export const createError = (message?: string) => {
  const err = new Error(message);
  return err;
};

export const logErrorAndStop = (message?: any, ...optionalParams: any[]) => {
  const err = logError(message, ...optionalParams);
  // eslint-disable-next-line no-debugger
  debugger;
  return err;
};

const _printed = /*#__PURE__*/ new Set<string>();

export const logOnceWarn = (message?: any, ...optionalParams: any[]) => {
  if (qDev) {
    const key = 'warn' + String(message);
    if (!_printed.has(key)) {
      _printed.add(key);
      logWarn(message, ...optionalParams);
    }
  }
};

export const logWarn = (message?: any, ...optionalParams: any[]) => {
  if (qDev) {
    console.warn('%cQWIK WARN', STYLE, message, ...printParams(optionalParams));
  }
};

export const logDebug = (message?: string, ...optionalParams: any[]) => {
  if (qDev) {
    // eslint-disable-next-line no-console
    console.debug('%cQWIK', STYLE, message, ...printParams(optionalParams));
  }
};

export const tryGetContext = (element: QwikElement): QContext | undefined => {
  return (element as any)['_qc_'];
};

const printParams = (optionalParams: any[]) => {
  if (qDev) {
    return optionalParams.map((p) => {
      if (isNode(p) && isElement(p)) {
        return printElement(p);
      }
      return p;
    });
  }
  return optionalParams;
};

const printElement = (el: Element) => {
  const ctx = tryGetContext(el);
  const isServer: boolean = /*#__PURE__*/ (() =>
    typeof process !== 'undefined' && !!process.versions && !!process.versions.node)();

  return {
    tagName: el.tagName,
    renderQRL: ctx?.$componentQrl$?.getSymbol(),
    element: isServer ? undefined : el,
    ctx: isServer ? undefined : ctx,
  };
};

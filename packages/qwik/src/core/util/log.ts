import type { QwikElement } from '../render/dom/virtual-element';
import type { QContext } from '../state/context';
import { isElement, isNode } from './element';
import { qDev, qTest } from './qdev';

const STYLE = qDev
  ? `background: #564CE0; color: white; padding: 2px 3px; border-radius: 2px; font-size: 0.8em;`
  : '';

export const logError = (message?: any, ...optionalParams: any[]) => {
  const error = createAndLogError(true, message, ...optionalParams);

  // make sure to throw the error in test mode so that the test fails
  // TODO: uncomment the following to fix any unit test that MUST fail and catch it
  // if (qTest) {
  //   throw error;
  // }

  return error;
};

export const throwErrorAndStop = (message?: any, ...optionalParams: any[]): never => {
  const error = createAndLogError(false, message, ...optionalParams);
  // eslint-disable-next-line no-debugger
  debugger;
  throw error;
};

export const logErrorAndStop = (message?: any, ...optionalParams: any[]) => {
  const err = createAndLogError(true, message, ...optionalParams);
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

const createAndLogError = (
  asyncThrow: boolean,
  message?: Error | string,
  ...optionalParams: any[]
) => {
  const hasOptions = optionalParams.length > 0;
  // if three are params sent, then do not add the message (if string) in the Error object.
  const err = message instanceof Error ? message : new Error(hasOptions ? '' : message);

  if (hasOptions) {
    // // Display the error message first, then the optional params, and finally the stack trace.
    // // This gives a better developer experience so the printed params do not get lost in the stack
    console.error(
      '%cQWIK ERROR',
      STYLE,
      err.message || message,
      ...printParams(optionalParams),
      err.stack?.replace('Error: ', '')
    );
  } else {
    console.error('%cQWIK ERROR', STYLE, err.stack || err.message);
  }

  asyncThrow &&
    !qTest &&
    setTimeout(() => {
      // throwing error asynchronously to avoid breaking the current call stack.
      // We throw so that the error is delivered to the global error handler for
      // reporting it to a third-party tools such as Qwik Insights, Sentry or New Relic.
      throw err;
    }, 0);

  return err;
};

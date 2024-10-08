import { qDev, qTest } from './qdev';

const STYLE = qDev
  ? `background: #564CE0; color: white; padding: 2px 3px; border-radius: 2px; font-size: 0.8em;`
  : '';

export const logError = (message?: any, ...optionalParams: any[]) => {
  return createAndLogError(false, message, ...optionalParams);
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
    console.warn('%cQWIK WARN', STYLE, message, ...optionalParams);
  }
};

export const logDebug = (message?: string, ...optionalParams: any[]) => {
  if (qDev) {
    // eslint-disable-next-line no-console
    console.debug('%cQWIK', STYLE, message, ...optionalParams);
  }
};

const createAndLogError = (asyncThrow: boolean, message?: any, ...optionalParams: any[]) => {
  const err = message instanceof Error ? message : new Error(message);

  // display the error message first, then the optional params, and finally the stack trace
  // the stack needs to be displayed last because the given params will be lost among large stack traces so it will
  // provide a bad developer experience
  console.error('%cQWIK ERROR', STYLE, err.message, ...optionalParams, err.stack);

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

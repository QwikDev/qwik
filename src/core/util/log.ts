import { qDev } from './qdev';

const STYLE = qDev
  ? `background: #564CE0; color: white; padding: 2px 3px; border-radius: 2px; font-size: 0.8em;`
  : '';

export const logError = (message?: any, ...optionalParams: any[]) => {
  // eslint-disable-next-line no-console
  console.error('%cQWIK ERROR', STYLE, message, ...optionalParams);
};

export const logWarn = (message?: any, ...optionalParams: any[]) => {
  // eslint-disable-next-line no-console
  console.warn('%cQWIK WARN', STYLE, message, ...optionalParams);
};

export const logDebug = (message?: any, ...optionalParams: any[]) => {
  if (qDev) {
    // eslint-disable-next-line no-console
    console.debug('%cQWIK', STYLE, message, ...optionalParams);
  }
};

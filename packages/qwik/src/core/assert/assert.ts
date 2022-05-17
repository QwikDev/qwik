import { logError } from '../util/log';
import { qDev } from '../util/qdev';

export function assertDefined(value: any, text?: string) {
  if (qDev) {
    if (value != null) return;
    throw newError(text || 'Expected defined value');
  }
}

export function assertNotPromise(value: any, text?: string) {
  if (qDev) {
    if (!(value instanceof Promise)) return;
    throw newError(text || 'Expected defined value.');
  }
}

export function assertDefinedAndNotPromise(value: any, text?: string) {
  if (qDev) {
    assertDefined(value, text);
    assertNotPromise(value, text);
  }
}

export function assertInstanceOf(value: any, type: any, text?: string) {
  if (qDev) {
    if (value instanceof type) return;
    throw newError(
      text || `Expected value '${value}' to be instance of '${type}' but was '${typeOf(value)}'.`
    );
  }
}

export function assertString(value: any, text?: string) {
  if (qDev) {
    if (typeof value === 'string') return;
    throw newError(text || `Expected value '${value}' to be 'string' but was '${typeOf(value)}'.`);
  }
}

export function assertNotEqual(value1: any, value2: any, text?: string) {
  if (qDev) {
    if (value1 !== value2) return;
    throw newError(text || `Expected '${value1}' !== '${value2}'.`);
  }
}

export function assertEqual(value1: any, value2: any, text?: string) {
  if (qDev) {
    if (value1 === value2) return;
    throw newError(text || `Expected '${value1}' === '${value2}'.`);
  }
}

export function assertLessOrEqual(value1: any, value2: any, text?: string) {
  if (qDev) {
    if (value1 <= value2) return;
    throw newError(text || `Expected '${value1}' <= '${value2}'.`);
  }
}

export function assertLess(value1: any, value2: any, text?: string) {
  if (qDev) {
    if (value1 < value2) return;
    throw newError(text || `Expected '${value1}' < '${value2}'.`);
  }
}

export function assertGreaterOrEqual(value1: any, value2: any, text?: string) {
  if (qDev) {
    if (value1 >= value2) return;
    throw newError(text || `Expected '${value1}' >= '${value2}'.`);
  }
}

export function assertGreater(value1: any, value2: any, text?: string) {
  if (qDev) {
    if (value1 > value2) return;
    throw newError(text || `Expected '${value1}' > '${value2}'.`);
  }
}

function typeOf(value: any) {
  if (value === null) return 'null';
  const type = typeof value;
  if (type === 'object') {
    return value?.constructor?.name || '<unknown>';
  } else {
    return type;
  }
}

function newError(text: string) {
  debugger; // eslint-disable-line no-debugger
  const error = new Error(text);
  logError(error); // eslint-disable-line no-console
  return error;
}

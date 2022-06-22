import { logErrorAndStop } from '../util/log';
import { qDev } from '../util/qdev';
import { isString } from '../util/types';

export const assertDefined = (value: any, text?: string) => {
  if (qDev) {
    if (value != null) return;
    throw logErrorAndStop(text || 'Expected defined value');
  }
};

export const assertNotPromise = (value: any, text?: string) => {
  if (qDev) {
    if (!(value instanceof Promise)) return;
    throw logErrorAndStop(text || 'Expected defined value.');
  }
};

export const assertDefinedAndNotPromise = (value: any, text?: string) => {
  if (qDev) {
    assertDefined(value, text);
    assertNotPromise(value, text);
  }
};

export const assertInstanceOf = (value: any, type: any, text?: string) => {
  if (qDev) {
    if (value instanceof type) return;
    throw logErrorAndStop(
      text || `Expected value '${value}' to be instance of '${type}' but was '${typeOf(value)}'.`
    );
  }
};

export const assertString = (value: any, text?: string) => {
  if (qDev) {
    if (isString(value)) return;
    throw logErrorAndStop(
      text || `Expected value '${value}' to be 'string' but was '${typeOf(value)}'.`
    );
  }
};

export const assertNotEqual = (value1: any, value2: any, text?: string) => {
  if (qDev) {
    if (value1 !== value2) return;
    throw logErrorAndStop(text || `Expected '${value1}' !== '${value2}'.`);
  }
};

export const assertEqual = (value1: any, value2: any, text?: string) => {
  if (qDev) {
    if (value1 === value2) return;
    throw logErrorAndStop(text || `Expected '${value1}' === '${value2}'.`);
  }
};

export const assertLessOrEqual = (value1: any, value2: any, text?: string) => {
  if (qDev) {
    if (value1 <= value2) return;
    throw logErrorAndStop(text || `Expected '${value1}' <= '${value2}'.`);
  }
};

export const assertLess = (value1: any, value2: any, text?: string) => {
  if (qDev) {
    if (value1 < value2) return;
    throw logErrorAndStop(text || `Expected '${value1}' < '${value2}'.`);
  }
};

export const assertGreaterOrEqual = (value1: any, value2: any, text?: string) => {
  if (qDev) {
    if (value1 >= value2) return;
    throw logErrorAndStop(text || `Expected '${value1}' >= '${value2}'.`);
  }
};

export const assertGreater = (value1: any, value2: any, text?: string) => {
  if (qDev) {
    if (value1 > value2) return;
    throw logErrorAndStop(text || `Expected '${value1}' > '${value2}'.`);
  }
};

const typeOf = (value: any) => {
  if (value === null) return 'null';
  const type = typeof value;
  if (type === 'object') {
    return value?.constructor?.name || '<unknown>';
  } else {
    return type;
  }
};

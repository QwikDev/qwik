import { qDev } from './qdev';

export const EMPTY_ARRAY = [];
export const EMPTY_OBJ = {};

if (qDev) {
  Object.freeze(EMPTY_ARRAY);
  Object.freeze(EMPTY_OBJ);
  Error.stackTraceLimit = 9999;
}

// import { qDev } from './qdev';

import { qDev } from './qdev';

export const EMPTY_ARRAY = [] as any[];
export const EMPTY_OBJ = {} as Record<string, any>;

if (qDev) {
  Object.freeze(EMPTY_ARRAY);
  Object.freeze(EMPTY_OBJ);
}

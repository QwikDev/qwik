import { isDev } from '@qwik.dev/core/build';
import { assertTrue } from '../shared/error/assert';

/** @internal */
export const mapApp_findIndx = <T>(array: (T | null)[], key: string, start: number): number => {
  isDev && assertTrue(start % 2 === 0, 'Expecting even number.');
  let bottom = (start as number) >> 1;
  let top = (array.length - 2) >> 1;
  while (bottom <= top) {
    const mid = bottom + ((top - bottom) >> 1);
    const midKey = array[mid << 1] as string;
    if (midKey === key) {
      return mid << 1;
    }
    if (midKey < key) {
      bottom = mid + 1;
    } else {
      top = mid - 1;
    }
  }
  return (bottom << 1) ^ -1;
};

/** @internal */
export const mapArray_set = <T>(
  array: (T | null)[],
  key: string,
  value: T | null,
  start: number,
  allowNullValue: boolean = false
) => {
  const indx = mapApp_findIndx(array, key, start);
  if (indx >= 0) {
    if (value == null && !allowNullValue) {
      array.splice(indx, 2);
    } else {
      array[indx + 1] = value;
    }
  } else if (value != null || allowNullValue) {
    array.splice(indx ^ -1, 0, key as any, value);
  }
};

export const mapApp_remove = <T>(array: (T | null)[], key: string, start: number): T | null => {
  const indx = mapApp_findIndx(array, key, start);
  let value: T | null = null;
  if (indx >= 0) {
    value = array[indx + 1];
    array.splice(indx, 2);
    return value;
  }
  return value;
};

/** @internal */
export const mapArray_get = <T>(array: (T | null)[], key: string, start: number): T | null => {
  const indx = mapApp_findIndx(array, key, start);
  if (indx >= 0) {
    return array[indx + 1] as T | null;
  } else {
    return null;
  }
};

export const mapArray_has = <T>(array: (T | null)[], key: string, start: number): boolean => {
  return mapApp_findIndx(array, key, start) >= 0;
};

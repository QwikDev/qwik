import { assertTrue } from '../shared/error/assert';

export const mapApp_findIndx = <T>(
  elementVNode: (T | null)[],
  key: string,
  start: number
): number => {
  assertTrue(start % 2 === 0, 'Expecting even number.');
  let bottom = (start as number) >> 1;
  let top = (elementVNode.length - 2) >> 1;
  while (bottom <= top) {
    const mid = bottom + ((top - bottom) >> 1);
    const midKey = elementVNode[mid << 1] as string;
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

export const mapArray_set = <T>(
  elementVNode: (T | null)[],
  key: string,
  value: T | null,
  start: number
) => {
  const indx = mapApp_findIndx(elementVNode, key, start);
  if (indx >= 0) {
    if (value == null) {
      elementVNode.splice(indx, 2);
    } else {
      elementVNode[indx + 1] = value;
    }
  } else if (value != null) {
    elementVNode.splice(indx ^ -1, 0, key as any, value);
  }
};

export const mapApp_remove = <T>(
  elementVNode: (T | null)[],
  key: string,
  start: number
): T | null => {
  const indx = mapApp_findIndx(elementVNode, key, start);
  let value: T | null = null;
  if (indx >= 0) {
    value = elementVNode[indx + 1];
    elementVNode.splice(indx, 2);
    return value;
  }
  return value;
};

export const mapArray_get = <T>(
  elementVNode: (T | null)[],
  key: string,
  start: number
): T | null => {
  const indx = mapApp_findIndx(elementVNode, key, start);
  if (indx >= 0) {
    return elementVNode[indx + 1] as T | null;
  } else {
    return null;
  }
};

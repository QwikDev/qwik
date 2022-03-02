import type { QObject } from '../object/q-object';
import { QObjAttr } from '../util/markers';

export interface QObjectMap {
  add(qObject: QObject<any>): number;
  get(index: number): QObject<any> | undefined;
  indexOf(object: QObject<any>): number | undefined;
  array: QObject<any>[];
}

export function newQObjectMap(element: Element): QObjectMap {
  const map = new Map<QObject<any>, number>();
  const array: QObject<any>[] = [];
  let added = element.hasAttribute(QObjAttr);

  return {
    array,
    get(index: number): QObject<any> | undefined {
      return array[index];
    },
    indexOf(obj: string): number | undefined {
      return map.get(obj);
    },
    add(object: QObject<any>) {
      const index = map.get(object);
      if (index === undefined) {
        map.set(object, array.length);
        array.push(object);
        if (!added) {
          element.setAttribute(QObjAttr, '');
          added = true;
        }
        return array.length - 1;
      }
      return index;
    },
  } as QObjectMap;
}

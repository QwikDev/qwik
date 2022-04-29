import type { QObject } from '../object/q-object';
import { QObjAttr } from '../util/markers';

export interface QObjectMap {
  add(qObject: QObject<any>): number;
  get(index: number): QObject<any> | undefined;
  indexOf(object: QObject<any>): number | undefined;
  array: QObject<any>[];
}

export function newQObjectMap(element: Element): QObjectMap {
  const array: QObject<any>[] = [];
  let added = element.hasAttribute(QObjAttr);

  return {
    array,
    get(index: number): QObject<any> | undefined {
      return array[index];
    },
    indexOf(obj: string): number | undefined {
      const index = array.indexOf(obj);
      return index === -1 ? undefined : index;
    },
    add(object: QObject<any>) {
      const index = array.indexOf(object);
      if (index === -1) {
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

import { assertDefined } from '../assert/assert';
import { getQObjectId, QObject_addDoc } from '../object/q-object';
import type { QObject } from '../object/q-object';
import { AttributeMarker } from '../util/markers';
import { newQProps, QPropsContext } from './q-props';

const Q_OBJECT_ATTR = 'q:obj';

export type QObjRefMap = Map<
  string,
  {
    obj: QObject<any>;
    count: number;
    isSub: boolean;
  }
>;

export interface QObjectMap {
  element: Element;
  forEach(fn: (value: QObject<any>, objectId: string) => void): void;
  set(objectId: string, qObject: QObject<any>): void;
  get(objectId: string): QObject<any> | undefined;
}

export function updateSubscriptions(
  element: Element,
  map: QObjRefMap,
  idSubscriptionSet: Set<QObject<any>>
) {
  map.forEach((value, key) => {
    const qObj = value.obj;
    if (idSubscriptionSet.has(value.obj)) {
      // do nothing; already subscribed
      if (!value.isSub) {
        setMapFacade(map, getQObjectId(qObj)!, qObj, element, true, 1);
      }
    } else if (value.isSub) {
      // Unsubscribe
      value.isSub = false;
      releaseRef(value, map, key);
    }
    idSubscriptionSet.delete(qObj);
  });
  idSubscriptionSet.forEach((qObj) =>
    setMapFacade(map, getQObjectId(qObj)!, qObj, element, true, 1)
  );
  writeQObjAttr(element, map);
}

export function writeQObjAttr(element: Element, map: QObjRefMap) {
  const list: string[] = [];
  map.forEach((v, k) => {
    if (v.isSub) k = '!' + k;
    v.count == 1 ? list.push(k) : list.push('#' + v.count, k);
  });
  if (list.length) {
    element.setAttribute(Q_OBJECT_ATTR, list.join(' '));
  } else {
    element.removeAttribute(Q_OBJECT_ATTR);
  }
}

export function newQObjectMap(element: Element, map: QObjRefMap): QObjectMap {
  return {
    element: element,
    forEach(fn: (v: QObject<any>, k: string) => void) {
      return map.forEach((v, k) => {
        fn(v.obj, k);
      });
    },
    get(key: string): QObject<any> | undefined {
      const value = map.get(key);
      return value?.obj;
    },
    set(key: string, qObj: QObject<any>) {
      if (!isDomId(key)) {
        setMapFacade(map, key, qObj, element, false, 1);
        writeQObjAttr(element, map);
      }
    },
  } as QObjectMap;
}

function isDomId(key: string): boolean {
  const prefix = key.charAt(0);
  return (
    prefix === AttributeMarker.ELEMENT_ID_PREFIX ||
    prefix === AttributeMarker.ELEMENT_ID_Q_PROPS_PREFIX
  );
}

export function setMapFacade(
  map: QObjRefMap,
  key: string,
  qObj: QObject<any>,
  element: Element,
  subscribed: boolean,
  count: number
) {
  assertDefined(key);
  let value = map.get(key);
  if (qObj) {
    QObject_addDoc(qObj, element.ownerDocument);
    if (value) {
      value.count += count;
      value.isSub = value.isSub || subscribed;
    } else {
      map.set(key, (value = { obj: qObj, count, isSub: subscribed }));
    }
  } else {
    if (value) {
      value = releaseRef(value, map, key);
    }
  }
  return value;
}

function releaseRef(
  value: { obj: QObject<any>; count: number; isSub: boolean },
  map: QObjRefMap,
  key: string
) {
  value.count--;
  if (value.count == 0) {
    map.delete(key);
    return undefined;
  }
  return value;
}

export function loadObjectsFromState(element: Element, storeMap: Record<string, QObject<any>>) {
  const qProps = newQProps(element);
  const objs = element.getAttribute(Q_OBJECT_ATTR);
  if (objs) {
    const parts = objs.split(' ');
    const qMap = (qProps as QPropsContext).__qRefs__;
    let lastCount: number = 1;
    parts.forEach((key) => {
      if (key.startsWith('#')) {
        lastCount = Number(key.substr(1));
      } else {
        let isSubscribed = false;
        if (key.startsWith('!')) {
          key = key.substr(1);
          isSubscribed = true;
        }
        const qObj = storeMap[key];
        setMapFacade(qMap, key, qObj, element, isSubscribed, lastCount);
      }
    });
  }
}

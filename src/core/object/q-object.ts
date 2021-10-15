import { assertDefined, assertEqual, assertNotEqual } from '../assert/assert';
import { qNotifyRender } from '../render/q-notify-render';
import { safeQSubscribe } from '../use/use-core.public';
import type { QObject as IQObject } from './q-object.public';
export const Q_OBJECT_PREFIX_SEP = ':';

export function _qObject<T>(obj: T, prefix?: string, isId: boolean = false): T {
  assertEqual(unwrapProxy(obj), obj, 'Unexpected proxy at this location');
  const id = isId
    ? (prefix as string)
    : (prefix == null ? '' : prefix + Q_OBJECT_PREFIX_SEP) + generateId();
  const proxy = readWriteProxy(obj as any as IQObject<T>, id);
  Object.assign(proxy, obj);
  return proxy;
}

function QObject_notifyWrite(id: string, doc: Document | null) {
  if (doc) {
    doc.querySelectorAll(idToComponentSelector(id)).forEach(qNotifyRender);
  }
}

function QObject_notifyRead(target: any) {
  const proxy = proxyMap.get(target);
  assertDefined(proxy);
  safeQSubscribe(proxy);
}

export function QObject_addDoc(qObj: IQObject<any>, doc: Document) {
  assertNotEqual(unwrapProxy(qObj), qObj, 'Expected Proxy');
  qObj[QObjectDocumentSymbol] = doc;
}

export function getQObjectId(obj: any): string | null {
  return (obj && typeof obj === 'object' && obj[QObjectIdSymbol]) || null;
}

function idToComponentSelector(id: string): any {
  id = id.replace(/([^\w\d])/g, (_, v) => '\\' + v);
  return '[q\\:obj*=' + (isStateObj(id) ? '' : '\\!') + id + ']';
}

export function isStateObj(id: any): boolean {
  if (id && typeof id !== 'string') {
    id = getQObjectId(id)!;
    assertDefined(id);
  }
  return id.indexOf(Q_OBJECT_PREFIX_SEP) !== -1;
}

/**
 * Creates a proxy which notifies of any writes.
 */
export function readWriteProxy<T extends object>(target: T, id: string): T {
  if (!target || typeof target !== 'object') return target;
  let proxy = proxyMap.get(target);
  if (proxy) return proxy;
  proxy = new Proxy(target, new ReadWriteProxyHandler(id)) as any as T;
  proxyMap.set(target, proxy);
  return proxy;
}

const QOjectTargetSymbol = ':target:';
const QObjectIdSymbol = ':id:';
const QObjectDocumentSymbol = ':doc:';

export function unwrapProxy<T>(proxy: T): T {
  if (proxy && typeof proxy == 'object') {
    const value = (proxy as any)[QOjectTargetSymbol];
    if (value) return value;
  }
  return proxy;
}

export function wrap<T>(value: T): T {
  if (value && typeof value === 'object') {
    const nakedValue = unwrapProxy(value);
    if (nakedValue !== value) {
      // already a proxy return;
      return value;
    }

    const proxy = proxyMap.get(value);
    return proxy ? proxy : readWriteProxy(value as any, generateId());
  } else {
    return value;
  }
}

class ReadWriteProxyHandler<T extends object> implements ProxyHandler<T> {
  private id: string;
  private doc: Document | null = null;
  constructor(id: string) {
    this.id = id;
  }

  get(target: T, prop: string): any {
    if (prop === QOjectTargetSymbol) return target;
    if (prop === QObjectIdSymbol) return this.id;
    const value = (target as any)[prop];
    QObject_notifyRead(target);
    return wrap(value);
  }

  set(target: T, prop: string, newValue: any): boolean {
    if (prop === QObjectDocumentSymbol) {
      this.doc = newValue;
    } else {
      const unwrappedNewValue = unwrapProxy(newValue);
      const oldValue = (target as any)[prop];
      if (oldValue !== unwrappedNewValue) {
        (target as any)[prop] = unwrappedNewValue;
        QObject_notifyWrite(this.id, this.doc);
      }
    }
    return true;
  }

  has(target: T, property: string | symbol) {
    if (property === QOjectTargetSymbol) return true;
    return Object.prototype.hasOwnProperty.call(target, property);
  }

  ownKeys(target: T): ArrayLike<string | symbol> {
    return Object.getOwnPropertyNames(target);
  }
}

const proxyMap: WeakMap<any, any> = new WeakMap();

function generateId() {
  return (
    // TODO(misko): For now I have removed the data as I think it is overkill
    // and makes the output unnecessarily big.
    // new Date().getTime().toString(36) +
    Math.round(Math.random() * Number.MAX_SAFE_INTEGER).toString(36)
  );
}

import { suite } from 'uvu';
import { equal } from 'uvu/assert';
import { _getContainerState } from '../container/container';
import { createSubscriptionManager, getProxyFlags, unwrapProxy } from './common';
import { QObjectRecursive } from './constants';
import { createPropsState, createProxy, getOrCreateProxy } from './store';

const qObject = suite('q-object');
const container = _getContainerState({ getAttribute: () => null } as any);
const map: any = {
  $subsManager$: createSubscriptionManager(container),
  $proxyMap$: new WeakMap(),
};

qObject('should create QObject', () => {
  const obj = getOrCreateProxy({ salutation: 'Hello', name: 'World' }, map);
  equal(obj, { salutation: 'Hello', name: 'World' });
});

qObject('should not copy proxy flags metadata', () => {
  const target = createPropsState();
  const proxy = createProxy(target, container);
  equal(getProxyFlags(proxy), 2);
  equal(getProxyFlags(target), 2);

  const targetCopy = Object.assign({}, target);
  const proxyCopy = Object.assign({}, proxy);
  equal(getProxyFlags(targetCopy), undefined);
  equal(getProxyFlags(proxyCopy), undefined);
});

qObject('should support basic operations', () => {
  const value = { a: 1, b: 2 };
  const proxy = getOrCreateProxy(value, map);
  equal(proxy.a, 1);
  equal(proxy.b, 2);
  equal(unwrapProxy(proxy as any), value);
  equal(++proxy.b, 3);
  equal('b' in proxy, true);
  equal(Object.keys(proxy), Object.keys(value));
});

qObject('should support child objects', () => {
  const child = { a: 1, b: 2 };
  const parent = { child: child };
  const proxy = getOrCreateProxy(parent, map, QObjectRecursive);
  equal(proxy.child.a, 1);
  const pChild = proxy.child;
  proxy.child = pChild;
  const child2 = {};
  proxy.child = child2 as any;
  equal(parent.child, child2);
});

qObject('should support arrays', () => {
  const child = { a: 'a' };
  const list = [1, child];
  const pList = getOrCreateProxy(list, map);
  equal(Object.keys(pList), Object.keys(list));
  equal(pList, list);
  const copy = [] as any;
  for (const key in pList) {
    if (Object.prototype.hasOwnProperty.call(pList, key)) {
      copy[key] = pList[key];
    }
  }
  copy.length = 0;
  for (const v of pList) {
    copy.push(v);
  }
  equal(copy, list);

  pList.push(2, child);
  equal(pList, [1, child, 2, child]);
});

qObject('should support equality', () => {
  // TODO(misko): I don't think it is possible with proxy.
});

qObject.run();

import {
  createSubscriptionManager,
  getOrCreateProxy,
  QObjectRecursive,
  unwrapProxy,
} from './q-object';

describe('q-object', () => {
  beforeEach(() => {});
  const map: any = {
    $subsManager$: createSubscriptionManager(),
    $proxyMap$: new WeakMap(),
  };

  it('should create QObject', () => {
    const obj = getOrCreateProxy({ salutation: 'Hello', name: 'World' }, map);
    expect(obj).toEqual({ salutation: 'Hello', name: 'World' });
  });

  describe('read write proxy', () => {
    it('should support basic operations', () => {
      const value = { a: 1, b: 2 };
      const proxy = getOrCreateProxy(value, map);
      expect(proxy.a).toBe(1);
      expect(proxy.b).toBe(2);
      expect(unwrapProxy(proxy as any)).toBe(value);
      expect(++proxy.b).toBe(3);
      expect('b' in proxy).toBe(true);
      expect(Object.keys(proxy)).toEqual(Object.keys(value));
    });

    it('should support child objects', () => {
      const child = { a: 1, b: 2 };
      const parent = { child: child };
      const proxy = getOrCreateProxy(parent, map, QObjectRecursive);
      expect(proxy.child.a).toBe(1);
      const pChild = proxy.child;
      expect(proxy.child).not.toBe(child);
      proxy.child = pChild;
      const child2 = {};
      proxy.child = child2 as any;
      expect(parent.child).toBe(child2);
    });

    describe('array', () => {
      it('should support arrays', () => {
        const child = { a: 'a' };
        const list = [1, child];
        const pList = getOrCreateProxy(list, map);
        expect(Object.keys(pList)).toEqual(Object.keys(list));
        expect(pList).toEqual(list);
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
        expect(copy).toEqual(list);

        pList.push(2, child);
        expect(pList).toEqual([1, child, 2, child]);
      });
    });

    it('should support equality', () => {
      // TODO(misko): I don't think it is possible with proxy.
    });
  });
});

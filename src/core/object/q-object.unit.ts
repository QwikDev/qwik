import { ElementFixture } from '../../testing/element_fixture';
import { didQPropsChange } from '../props/q-props';
import { qProps, QProps } from '../props/q-props.public';
import { getQObjectId, readWriteProxy, unwrapProxy } from './q-object';
import { qObject } from './q-object';

describe('q-object', () => {
  let fixture: ElementFixture;
  let host: HTMLElement;
  let qHost: QProps;
  beforeEach(() => {
    fixture = new ElementFixture();
    host = fixture.host;
    qHost = qProps(host);
  });

  it('should create QObject', () => {
    const obj = qObject({ salutation: 'Hello', name: 'World' });
    expect(obj).toEqual({ salutation: 'Hello', name: 'World' });
  });

  describe('read write proxy', () => {
    it('should support basic operations', () => {
      const value = { a: 1, b: 2 };
      const proxy = readWriteProxy(value, '123');
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
      const proxy = readWriteProxy(parent, '123');
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
        const pList = readWriteProxy(list, '123');
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
      // TODO(misko): write more tests for other array methods which can access data
    });

    it('should support equality', () => {
      // TODO(misko): I don't think it is possible with proxy.
    });
  });

  describe('DOM reference tracking', () => {
    it('should add root when adding attribute', () => {
      const obj = qObject({ salutation: 'Hello', name: 'World' });
      const id = getQObjectId(obj)!;

      qHost.propA = obj;
      expect(didQPropsChange(qHost)).toBe(true);
      expect(didQPropsChange(qHost)).toBe(false);
      qHost.propA = obj;
      expect(didQPropsChange(qHost)).toBe(false);
      expect(host.getAttribute('q:obj')).toEqual(id);
      expect(qHost.propA).toEqual(obj);

      qHost.propA = obj;
      qHost.propB = obj;
      expect(didQPropsChange(qHost)).toBe(true);
      qHost.propA = obj;
      qHost.propB = obj;
      expect(didQPropsChange(qHost)).toBe(false);
      expect(host.getAttribute('q:obj')).toEqual('#2 ' + id);
      expect(qHost.propA).toEqual(obj);
      expect(qHost.propB).toEqual(obj);
    });
  });

  describe('getObjectId', () => {
    it('should add ID to dome element', () => {
      const id = getQObjectId(fixture.host)!;
      expect(id).toBeDefined();
      expect(id.charAt(0)).toBe('#');
      expect(getQObjectId(fixture.host)).toBe(id);
    });
  });
});

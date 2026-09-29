import { assert, describe, it } from 'vitest';
import { JSXNodeImpl } from '../jsx/jsx-node';
import { createPropsProxy } from '../jsx/props-proxy';
import { _CONST_PROPS, _VAR_PROPS } from './constants';
import { _restProps } from './prop';

describe('_restProps', () => {
  describe('plain object fallback', () => {
    it('copies own enumerable string keys and excludes omitted keys', () => {
      const rest = _restProps({ drop: 1, keep: 2, also: 3 }, ['drop']);
      assert.deepEqual({ ...rest }, { keep: 2, also: 3 });
    });

    it('preserves rest data for a non-component arrow (regression for silent loss)', () => {
      const requestInit = _restProps({ url: '/api/orders', method: 'POST', body: 'payload' }, [
        'url',
      ]) as Record<string, unknown>;
      assert.equal(requestInit.method, 'POST');
      assert.equal(requestInit.body, 'payload');
      assert.isUndefined(requestInit.url);
    });

    it('handles own __proto__ as a data property without mutating the prototype', () => {
      const input = JSON.parse('{"drop":1,"__proto__":{"isAdmin":true},"keep":2}');
      const rest = _restProps(input, ['drop']) as Record<string, unknown> & { isAdmin?: boolean };

      assert.isTrue(Object.hasOwn(rest, '__proto__'));
      assert.strictEqual(Object.getPrototypeOf(rest), Object.prototype);
      assert.isUndefined(rest.isAdmin);
      assert.equal(rest.keep, 2);
    });

    it('preserves enumerable symbol keys and ignores omit for symbols', () => {
      const symbolKey = Symbol('key');
      const rest = _restProps({ drop: 1, [symbolKey]: 2 }, ['drop']);
      assert.equal(Reflect.get(rest, symbolKey), 2);
    });

    it('does not copy inherited properties', () => {
      const proto = { inherited: 'nope' };
      const input = Object.create(proto);
      input.own = 'yes';
      const rest = _restProps(input, []) as Record<string, unknown>;
      assert.equal(rest.own, 'yes');
      assert.isFalse(Object.hasOwn(rest, 'inherited'));
    });

    it('does not copy non-enumerable own properties', () => {
      const input: Record<string, unknown> = { visible: 1 };
      Object.defineProperty(input, 'hidden', { value: 2, enumerable: false });
      const rest = _restProps(input, []) as Record<string, unknown>;
      assert.equal(rest.visible, 1);
      assert.isFalse(Object.hasOwn(rest, 'hidden'));
    });

    it('supports primitive object-rest sources', () => {
      const rest = _restProps('ab');
      assert.deepEqual({ ...rest }, { 0: 'a', 1: 'b' });
    });

    it('throws on nullish sources like native rest-destructuring', () => {
      assert.throws(() => _restProps(null), TypeError);
      assert.throws(() => _restProps(undefined), TypeError);
    });
  });

  describe('props proxy path', () => {
    it('returns a props proxy that preserves var and const props minus omitted keys', () => {
      const proxy = createPropsProxy(
        new JSXNodeImpl(null, { a: 1, drop: 2 }, { b: 3 }, null, 0, null)
      );
      const rest = _restProps(proxy, ['drop']) as any;

      // still a props proxy
      assert.isTrue(_VAR_PROPS in rest);
      assert.deepEqual(rest[_VAR_PROPS], { a: 1 });
      assert.deepEqual(rest[_CONST_PROPS], { b: 3 });
      assert.equal(rest.a, 1);
      assert.equal(rest.b, 3);
      assert.isUndefined(rest.drop);
    });
  });
});

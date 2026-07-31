import { assert, suite, test } from 'vitest';
import { isPropsProxy, type PropsProxy } from '../jsx/props-proxy';
import { _restProps } from './prop';

const plainProps = (props: Record<string, unknown>) => props as unknown as PropsProxy;

suite('_restProps', () => {
  test('should copy the own keys of a plain object', () => {
    assert.deepEqual(_restProps(plainProps({ a: 1, b: 2, c: 3 }), ['a']), { b: 2, c: 3 });
  });

  test('should copy every key of a plain object when nothing is omitted', () => {
    assert.deepEqual(_restProps(plainProps({ a: 1, b: 2 })), { a: 1, b: 2 });
  });

  test('should return a plain object for a plain object', () => {
    const rest = _restProps(plainProps({ a: 1, b: 2 }), ['a']);
    assert.isFalse(isPropsProxy(rest));
    assert.deepEqual(Object.keys(rest), ['b']);
  });

  test('should write into the given target for a plain object', () => {
    const target = { existing: true };
    assert.strictEqual(_restProps(plainProps({ a: 1, b: 2 }), ['a'], target), target);
    assert.deepEqual(target, { existing: true, b: 2 });
  });
});

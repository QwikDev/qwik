import { assert, test } from 'vitest';
import { jsx, Fragment } from './jsx-runtime';
import { isJSXNode } from './jsx-node';
import type { FunctionComponent } from './types/jsx-node';

test('key', () => {
  // <div key="val"/>
  const v = jsx('div', {}, 'val');
  assert.deepEqual(v.props, {});
  assert.deepEqual(v.key, 'val');
});

test('name/value props', () => {
  // <div id="val"/>
  const v = jsx('div', { id: 'val' });
  assert.deepEqual(v.props, { id: 'val' });
});

test('boolean props', () => {
  // <input checked/>
  const v = jsx('input', { checked: true });
  assert.deepEqual(v.props, { checked: true });
});

test('no props', () => {
  // <div/>
  const v = jsx('div', {});
  assert.deepEqual(v.props, {});
  assert.deepEqual(v.key, null);
});
test('tag', () => {
  const v = jsx('div', {});
  assert.deepEqual(v.type, 'div');
});

test('Function Component', () => {
  const Cmp: FunctionComponent<any> = () => jsx('fn-cmp', {});
  const v = jsx(Cmp, {});
  assert.deepEqual(v.type, Cmp);
});

test('Fragment', () => {
  const v = jsx(Fragment, {});
  assert.deepEqual(v.type, Fragment);
});
test('valid JSXNode', () => {
  const v = jsx('div', {});
  assert.deepEqual(isJSXNode(v), true);
});
test('invalid string', () => {
  assert.deepEqual(isJSXNode('text'), false);
});
test('invalid class', () => {
  assert.deepEqual(isJSXNode(class {}), false);
});
test('invalid array', () => {
  assert.deepEqual(isJSXNode([]), false);
});
test('invalid null/undefined', () => {
  assert.deepEqual(isJSXNode(null), false);
  assert.deepEqual(isJSXNode(undefined), false);
});

import { h, Fragment } from './jsx-runtime';
import { isJSXNode } from './jsx-node';
import type { FunctionComponent } from './types/jsx-node';
import { test, assert } from 'vitest';

test('key', () => {
  // <div key="val"/>
  const v = h('div', { key: 'val' });
  assert.deepEqual(v.props, {});
  assert.deepEqual(v.key, 'val');
});

test('name/value props', () => {
  // <div id="val"/>
  const v = h('div', { id: 'val' });
  assert.deepEqual(v.props, { id: 'val' });
});

test('boolean props', () => {
  // <input checked/>
  const v = h('input', { checked: true });
  assert.deepEqual(v.props, { checked: true });
});

test('no props', () => {
  // <div/>
  const v = h('div', null);
  assert.deepEqual(v.props, {});
  assert.deepEqual(v.key, null);
});

test('tag', () => {
  const v = h('div', null);
  assert.deepEqual(v.type, 'div');
});

test('Function Component', () => {
  const Cmp: FunctionComponent<any> = () => h('fn-cmp', null);
  const v = h(Cmp, {});
  assert.deepEqual(v.type, Cmp);
});

test('Fragment', () => {
  // <><div/></>
  const v = h(Fragment, null, h('div', null));
  assert.deepEqual(v.type, Fragment);
});
test('valid JSXNode', () => {
  // <div/>
  const v = h('div', null);
  assert.deepEqual(isJSXNode(v), true);
});

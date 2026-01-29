import { h } from './factory';
import { isJSXNode, Fragment } from './jsx-runtime';
import type { FunctionComponent, JSXNodeInternal } from './types/jsx-node';
import { type ProcessedJSXNode, processNode } from '../dom/render-dom';
import { test, assert } from 'vitest';

test('map multiple nodes, flatten', () => {
  // <parent>
  //   a
  //   {[1, 2].map((n) => (
  //     <child>{n}</child>
  //   ))}
  //   b
  // </parent>;
  const v = processNode(
    h(
      'parent',
      null,
      'a',
      [1, 2].map((n) => h('child', null, n)),
      'b'
    ) as JSXNodeInternal
  ) as ProcessedJSXNode;
  assert.deepEqual(v.$children$.length, 4);
  assert.deepEqual(v.$children$[0].$text$, 'a');
  assert.deepEqual(v.$children$[1].$type$, 'child');
  assert.deepEqual(v.$children$[1].$children$.length, 1);
  assert.deepEqual(v.$children$[2].$type$, 'child');
  assert.deepEqual(v.$children$[2].$children$.length, 1);
  assert.deepEqual(v.$children$[3].$text$, 'b');
});

test('one child node', () => {
  // <parent><child></child></parent>
  const v = processNode(h('parent', null, h('child', null)) as JSXNodeInternal) as ProcessedJSXNode;
  assert.deepEqual(v.$children$.length, 1);
  assert.deepEqual(v.$children$[0].$type$, 'child');
  assert.deepEqual(v.$children$[0].$props$, {});
  assert.deepEqual(v.$children$[0].$children$, []);
});

test('text w/ expression', () => {
  // <div>1 {2} 3</div>
  const v = processNode(h('div', null, '1 ', 2, ' 3') as JSXNodeInternal) as ProcessedJSXNode;
  assert.deepEqual(v.$children$[0].$type$, '#text');
  assert.deepEqual(v.$children$[0].$text$, '1 ');
  assert.deepEqual(v.$children$[0].$key$, null);

  assert.deepEqual(v.$children$[1].$type$, '#text');
  assert.deepEqual(v.$children$[1].$text$, '2');
  assert.deepEqual(v.$children$[1].$key$, null);

  assert.deepEqual(v.$children$[2].$type$, '#text');
  assert.deepEqual(v.$children$[2].$text$, ' 3');
  assert.deepEqual(v.$children$[2].$key$, null);
});

test('text child', () => {
  // <div>text</div>
  const v = processNode(h('div', null, 'text') as JSXNodeInternal) as ProcessedJSXNode;
  assert.deepEqual(v.$children$[0].$type$, '#text');
  assert.deepEqual(v.$children$[0].$text$, 'text');
  assert.deepEqual(v.$children$[0].$key$, null);
});

test('no children', () => {
  // <div/>
  const v = processNode(h('div', null) as JSXNodeInternal) as ProcessedJSXNode;
  assert.deepEqual(v.$children$, []);
});

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

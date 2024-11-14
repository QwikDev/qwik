import { assert, test } from 'vitest';
import { type ProcessedJSXNode, processNode } from '../dom/render-dom';
import { jsx, isJSXNode, Fragment } from './jsx-runtime';
import type { FunctionComponent, JSXNodeInternal } from './types/jsx-node';

test('map multiple nodes', () => {
  // <parent>
  //   {[1,2].map(n => (<child>{n}</child>))}
  // </parent>
  const v = processNode(
    jsx('parent', {
      children: [1, 2].map((n) => jsx('child', { children: n })),
    }) as JSXNodeInternal
  ) as ProcessedJSXNode;
  assert.deepEqual(v.$children$.length, 2);
  assert.deepEqual(v.$children$[0].$type$, 'child');
  assert.deepEqual(v.$children$[1].$type$, 'child');
});

test('one child node', () => {
  // <parent><child></child></parent>
  const v = processNode(
    jsx('parent', { children: jsx('child', {}) }) as JSXNodeInternal
  ) as ProcessedJSXNode;
  assert.deepEqual(v.$children$.length, 1);
  assert.deepEqual(v.$children$[0].$type$, 'child');
  assert.deepEqual(v.$children$[0].$props$, {});
  assert.deepEqual(v.$children$[0].$children$, []);
});

test('text w/ expression', () => {
  // <div>1 {2} 3</div>
  const v = processNode(
    jsx('div', { children: ['1 ', 2, ' 3'] }) as JSXNodeInternal
  ) as ProcessedJSXNode;
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
  const v = processNode(jsx('div', { children: 'text' }) as JSXNodeInternal) as ProcessedJSXNode;
  assert.deepEqual(v.$children$[0].$type$, '#text');
  assert.deepEqual(v.$children$[0].$text$, 'text');
  assert.deepEqual(v.$children$[0].$key$, null);
});

test('no children', () => {
  // <div/>
  const v = processNode(jsx('div', {}) as JSXNodeInternal) as ProcessedJSXNode;
  assert.deepEqual(v.$children$, []);
});
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

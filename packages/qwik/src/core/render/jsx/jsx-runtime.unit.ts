import { suite } from 'uvu';
import { equal } from 'uvu/assert';
import { processNode, type ProcessedJSXNode } from '../dom/render-dom';
import { Fragment, isJSXNode, jsx } from './jsx-runtime';
import type { FunctionComponent } from './types/jsx-node';

const jsxSuite = suite('jsx-runtime');
jsxSuite('map multiple nodes', () => {
  // <parent>
  //   {[1,2].map(n => (<child>{n}</child>))}
  // </parent>
  const v = processNode(
    jsx('parent', {
      children: [1, 2].map((n) => jsx('child', { children: n })),
    })
  ) as ProcessedJSXNode;
  equal(v.$children$.length, 2);
  equal(v.$children$[0].$type$, 'child');
  equal(v.$children$[1].$type$, 'child');
});

jsxSuite('one child node', () => {
  // <parent><child></child></parent>
  const v = processNode(jsx('parent', { children: jsx('child', {}) })) as ProcessedJSXNode;
  equal(v.$children$.length, 1);
  equal(v.$children$[0].$type$, 'child');
  equal(v.$children$[0].$props$, {});
  equal(v.$children$[0].$children$, []);
});

jsxSuite('text w/ expression', () => {
  // <div>1 {2} 3</div>
  const v = processNode(jsx('div', { children: ['1 ', 2, ' 3'] })) as ProcessedJSXNode;
  equal(v.$children$[0].$type$, '#text');
  equal(v.$children$[0].$text$, '1 ');
  equal(v.$children$[0].$key$, null);

  equal(v.$children$[1].$type$, '#text');
  equal(v.$children$[1].$text$, '2');
  equal(v.$children$[1].$key$, null);

  equal(v.$children$[2].$type$, '#text');
  equal(v.$children$[2].$text$, ' 3');
  equal(v.$children$[2].$key$, null);
});

jsxSuite('text child', () => {
  // <div>text</div>
  const v = processNode(jsx('div', { children: 'text' })) as ProcessedJSXNode;
  equal(v.$children$[0].$type$, '#text');
  equal(v.$children$[0].$text$, 'text');
  equal(v.$children$[0].$key$, null);
});

jsxSuite('no children', () => {
  // <div/>
  const v = processNode(jsx('div', {})) as ProcessedJSXNode;
  equal(v.$children$, []);
});
jsxSuite('key', () => {
  // <div key="val"/>
  const v = jsx('div', {}, 'val');
  equal(v.props, {});
  equal(v.key, 'val');
});

jsxSuite('name/value props', () => {
  // <div id="val"/>
  const v = jsx('div', { id: 'val' });
  equal(v.props, { id: 'val' });
});

jsxSuite('boolean props', () => {
  // <input checked/>
  const v = jsx('input', { checked: true });
  equal(v.props, { checked: true });
});

jsxSuite('no props', () => {
  // <div/>
  const v = jsx('div', {});
  equal(v.props, {});
  equal(v.key, null);
});
jsxSuite('tag', () => {
  const v = jsx('div', {});
  equal(v.type, 'div');
});

jsxSuite('Function Component', () => {
  const Cmp: FunctionComponent<any> = () => jsx('fn-cmp', {});
  const v = jsx(Cmp, {});
  equal(v.type, Cmp);
});

jsxSuite('Fragment', () => {
  const v = jsx(Fragment, {});
  equal(v.type, Fragment);
});
jsxSuite('valid JSXNode', () => {
  const v = jsx('div', {});
  equal(isJSXNode(v), true);
});
jsxSuite('invalid string', () => {
  equal(isJSXNode('text'), false);
});
jsxSuite('invalid class', () => {
  equal(isJSXNode(class {}), false);
});
jsxSuite('invalid array', () => {
  equal(isJSXNode([]), false);
});
jsxSuite('invalid null/undefined', () => {
  equal(isJSXNode(null), false);
  equal(isJSXNode(undefined), false);
});
jsxSuite.run();

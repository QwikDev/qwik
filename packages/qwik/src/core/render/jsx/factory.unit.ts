import { suite } from 'uvu';
import { equal } from 'uvu/assert';
import { processNode, type ProcessedJSXNode } from '../dom/render-dom';
import { h } from './factory';
import { Fragment, isJSXNode } from './jsx-runtime';
import type { FunctionComponent } from './types/jsx-node';

const jsxSuite = suite('classic jsx factory h()');
jsxSuite('map multiple nodes, flatten', () => {
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
    )
  ) as ProcessedJSXNode;
  equal(v.$children$.length, 4);
  equal(v.$children$[0].$text$, 'a');
  equal(v.$children$[1].$type$, 'child');
  equal(v.$children$[1].$children$.length, 1);
  equal(v.$children$[2].$type$, 'child');
  equal(v.$children$[2].$children$.length, 1);
  equal(v.$children$[3].$text$, 'b');
});

jsxSuite('one child node', () => {
  // <parent><child></child></parent>
  const v = processNode(h('parent', null, h('child', null))) as ProcessedJSXNode;
  equal(v.$children$.length, 1);
  equal(v.$children$[0].$type$, 'child');
  equal(v.$children$[0].$props$, {});
  equal(v.$children$[0].$children$, []);
});

jsxSuite('text w/ expression', () => {
  // <div>1 {2} 3</div>
  const v = processNode(h('div', null, '1 ', 2, ' 3')) as ProcessedJSXNode;
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
  const v = processNode(h('div', null, 'text')) as ProcessedJSXNode;
  equal(v.$children$[0].$type$, '#text');
  equal(v.$children$[0].$text$, 'text');
  equal(v.$children$[0].$key$, null);
});

jsxSuite('no children', () => {
  // <div/>
  const v = processNode(h('div', null)) as ProcessedJSXNode;
  equal(v.$children$, []);
});

jsxSuite('key', () => {
  // <div key="val"/>
  const v = h('div', { key: 'val' });
  equal(v.props, {});
  equal(v.key, 'val');
});

jsxSuite('name/value props', () => {
  // <div id="val"/>
  const v = h('div', { id: 'val' });
  equal(v.props, { id: 'val' });
});

jsxSuite('boolean props', () => {
  // <input checked/>
  const v = h('input', { checked: true });
  equal(v.props, { checked: true });
});

jsxSuite('no props', () => {
  // <div/>
  const v = h('div', null);
  equal(v.props, {});
  equal(v.key, null);
});

jsxSuite('tag', () => {
  const v = h('div', null);
  equal(v.type, 'div');
});

jsxSuite('Function Component', () => {
  const Cmp: FunctionComponent<any> = () => h('fn-cmp', null);
  const v = h(Cmp, {});
  equal(v.type, Cmp);
});

jsxSuite('Fragment', () => {
  // <><div/></>
  const v = h(Fragment, null, h('div', null));
  equal(v.type, Fragment);
});
jsxSuite('valid JSXNode', () => {
  // <div/>
  const v = h('div', null);
  equal(isJSXNode(v), true);
});
jsxSuite.run();

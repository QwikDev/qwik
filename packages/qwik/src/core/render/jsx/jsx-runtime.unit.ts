import { Host } from './host.public';
import { jsx, isJSXNode, Fragment, processNode } from './jsx-runtime';
import type { FunctionComponent, ProcessedJSXNode } from './types/jsx-node';

describe('jsx-runtime', () => {
  describe('children', () => {
    it('map multiple nodes', () => {
      // <parent>
      //   {[1,2].map(n => (<child>{n}</child>))}
      // </parent>
      const v = processNode(
        jsx('parent', {
          children: [1, 2].map((n) => jsx('child', { children: n })),
        })
      ) as ProcessedJSXNode;
      expect(v.$children$).toHaveLength(2);
      expect(v.$children$[0].$type$).toEqual('child');
      expect(v.$children$[1].$type$).toEqual('child');
    });

    it('one child node', () => {
      // <parent><child></child></parent>
      const v = processNode(jsx('parent', { children: jsx('child', {}) })) as ProcessedJSXNode;
      expect(v.$children$).toHaveLength(1);
      expect(v.$children$[0].$type$).toEqual('child');
      expect(v.$children$[0].$props$).toEqual({});
      expect(v.$children$[0].$children$).toEqual([]);
    });

    it('text w/ expression', () => {
      // <div>1 {2} 3</div>
      const v = processNode(jsx('div', { children: ['1 ', 2, ' 3'] })) as ProcessedJSXNode;
      expect(v.$children$[0].$type$).toEqual('#text');
      expect(v.$children$[0].$text$).toEqual('1 ');
      expect(v.$children$[0].$key$).toEqual(null);

      expect(v.$children$[1].$type$).toEqual('#text');
      expect(v.$children$[1].$text$).toEqual('2');
      expect(v.$children$[1].$key$).toEqual(null);

      expect(v.$children$[2].$type$).toEqual('#text');
      expect(v.$children$[2].$text$).toEqual(' 3');
      expect(v.$children$[2].$key$).toEqual(null);
    });

    it('text child', () => {
      // <div>text</div>
      const v = processNode(jsx('div', { children: 'text' })) as ProcessedJSXNode;
      expect(v.$children$[0].$type$).toEqual('#text');
      expect(v.$children$[0].$text$).toEqual('text');
      expect(v.$children$[0].$key$).toEqual(null);
    });

    it('no children', () => {
      // <div/>
      const v = processNode(jsx('div', {})) as ProcessedJSXNode;
      expect(v.$children$).toEqual([]);
    });
  });

  describe('props', () => {
    it('key', () => {
      // <div key="val"/>
      const v = jsx('div', {}, 'val');
      expect(v.props).toEqual({});
      expect(v.key).toEqual('val');
    });

    it('name/value props', () => {
      // <div id="val"/>
      const v = jsx('div', { id: 'val' });
      expect(v.props).toEqual({ id: 'val' });
    });

    it('boolean props', () => {
      // <input checked/>
      const v = jsx('input', { checked: true });
      expect(v.props).toEqual({ checked: true });
    });

    it('no props', () => {
      // <div/>
      const v = jsx('div', {});
      expect(v.props).toEqual({});
      expect(v.key).toBeNull();
    });
  });

  describe('type', () => {
    it('tag', () => {
      const v = jsx('div', {});
      expect(v.type).toBe('div');
    });

    it('Function Component', () => {
      const Cmp: FunctionComponent<any> = () => jsx('fn-cmp', {});
      const v = jsx(Cmp, {});
      expect(v.type).toBe(Cmp);
    });

    it('Host', () => {
      const v = jsx(Host, {});
      expect(v.type).toBe(Host);
    });

    it('Fragment', () => {
      const v = jsx(Fragment, {});
      expect(v.type).toBe(Fragment);
    });
  });

  describe('isJSXNode', () => {
    it('valid JSXNode', () => {
      const v = jsx('div', {});
      expect(isJSXNode(v)).toBe(true);
    });
    it('invalid string', () => {
      expect(isJSXNode('text')).toBe(false);
    });
    it('invalid class', () => {
      expect(isJSXNode(class {})).toBe(false);
    });
    it('invalid array', () => {
      expect(isJSXNode([])).toBe(false);
    });
    it('invalid null/undefined', () => {
      expect(isJSXNode(null)).toBe(false);
      expect(isJSXNode(undefined)).toBe(false);
    });
  });
});

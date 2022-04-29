import { Host } from './host.public';
import { jsx, isJSXNode, Fragment } from './jsx-runtime';
import type { FunctionComponent } from './types/jsx-node';

describe('jsx-runtime', () => {
  describe('children', () => {
    it('map multiple nodes', () => {
      // <parent>
      //   {[1,2].map(n => (<child>{n}</child>))}
      // </parent>
      const v = jsx('parent', {
        children: [1, 2].map((n) => jsx('child', { children: n })),
      });
      expect(v.children).toHaveLength(2);
      expect((v.children![0] as any).type).toEqual('child');
      expect((v.children![1] as any).type).toEqual('child');
    });

    it('one child node', () => {
      // <parent><child></child></parent>
      const v = jsx('parent', { children: jsx('child', {}) });
      expect(v.children).toHaveLength(1);
      expect((v.children![0] as any).type).toEqual('child');
      expect((v.children![0] as any).props).toEqual({});
      expect((v.children![0] as any).children).toEqual([]);
    });

    it('text w/ expression', () => {
      // <div>1 {2} 3</div>
      const v = jsx('div', { children: ['1 ', 2, ' 3'] });
      expect((v.children[0] as any).type).toEqual('#text');
      expect((v.children[0] as any).text).toEqual('1 ');
      expect((v.children[0] as any).key).toEqual(null);

      expect((v.children[1] as any).type).toEqual('#text');
      expect((v.children[1] as any).text).toEqual('2');
      expect((v.children[1] as any).key).toEqual(null);

      expect((v.children[2] as any).type).toEqual('#text');
      expect((v.children[2] as any).text).toEqual(' 3');
      expect((v.children[2] as any).key).toEqual(null);
    });

    it('text child', () => {
      // <div>text</div>
      const v = jsx('div', { children: 'text' });
      expect((v.children[0] as any).type).toEqual('#text');
      expect((v.children[0] as any).text).toEqual('text');
      expect((v.children[0] as any).key).toEqual(null);
    });

    it('no children', () => {
      // <div/>
      const v = jsx('div', {});
      expect(v.children).toEqual([]);
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

import { Host } from './host.public';
import { h } from './factory';
import { isJSXNode, Fragment } from './jsx-runtime';
import type { FunctionComponent } from './types/jsx-node';

describe('classic jsx factory h()', () => {
  describe('children', () => {
    it('map multiple nodes, flatten', () => {
      // <parent>
      //   a
      //   {[1, 2].map((n) => (
      //     <child>{n}</child>
      //   ))}
      //   b
      // </parent>;
      const v = h(
        'parent',
        null,
        'a',
        [1, 2].map((n) => h('child', null, n)),
        'b'
      );
      expect(v.children).toHaveLength(4);
      expect(v.children[0].text).toEqual('a');
      expect((v.children[1] as any).type).toEqual('child');
      expect((v.children[1] as any).children).toHaveLength(1);
      expect((v.children[2] as any).type).toEqual('child');
      expect((v.children[2] as any).children).toHaveLength(1);
      expect(v.children[3].text).toEqual('b');
    });

    it('one child node', () => {
      // <parent><child></child></parent>
      const v = h('parent', null, h('child', null));
      expect(v.children).toHaveLength(1);
      expect((v.children[0] as any).type).toEqual('child');
      expect((v.children[0] as any).props).toEqual({ children: [] });
      expect((v.children[0] as any).children).toEqual([]);
    });

    it('text w/ expression', () => {
      // <div>1 {2} 3</div>
      const v = h('div', null, '1 ', 2, ' 3');
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
      const v = h('div', null, 'text');
      expect((v.children[0] as any).type).toEqual('#text');
      expect((v.children[0] as any).text).toEqual('text');
      expect((v.children[0] as any).key).toEqual(null);
    });

    it('no children', () => {
      // <div/>
      const v = h('div', null);
      expect(v.children).toEqual([]);
    });
  });

  describe('props', () => {
    it('key', () => {
      // <div key="val"/>
      const v = h('div', { key: 'val' });
      expect(v.props).toEqual({ children: [] });
      expect(v.key).toEqual('val');
    });

    it('name/value props', () => {
      // <div id="val"/>
      const v = h('div', { id: 'val' });
      expect(v.props).toEqual({ id: 'val', children: [] });
    });

    it('boolean props', () => {
      // <input checked/>
      const v = h('input', { checked: true });
      expect(v.props).toEqual({ checked: true, children: [] });
    });

    it('no props', () => {
      // <div/>
      const v = h('div', null);
      expect(v.props).toEqual({ children: [] });
      expect(v.key).toBeNull();
    });
  });

  describe('type', () => {
    it('tag', () => {
      const v = h('div', null);
      expect(v.type).toBe('div');
    });

    it('Function Component', () => {
      const Cmp: FunctionComponent<any> = () => h('fn-cmp', null);
      const v = h(Cmp, {});
      expect(v.type).toBe(Cmp);
    });

    it('Host', () => {
      const v = h(Host, null);
      expect(v.type).toBe(Host);
    });

    it('Fragment', () => {
      // <><div/></>
      const v = h(Fragment, null, h('div', null));
      expect(v.type).toBe(Fragment);
    });
  });

  describe('isJSXNode', () => {
    it('valid JSXNode', () => {
      // <div/>
      const v = h('div', null);
      expect(isJSXNode(v)).toBe(true);
    });
  });
});

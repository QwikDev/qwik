import { describe, expect, it } from 'vitest';
import { SsrNode } from './ssr-node';
import {
  _vnode_getProp as vnode_getProp,
  _vnode_setProp as vnode_setProp,
} from '@qwik.dev/core/internal';

describe('ssr-node', () => {
  it('should store attrs in standalone object (via props)', () => {
    const attrs = {};
    const ssrNode = new SsrNode(null, '1', attrs, [], null);
    vnode_setProp(ssrNode, 'a', 1);
    expect(attrs).toEqual({ a: 1 });
    expect(ssrNode.props).toBe(attrs);
  });

  it('should store local props separately from attrs', () => {
    const attrs = {};
    const ssrNode = new SsrNode(null, '1', attrs, [], null);
    vnode_setProp(ssrNode, ':localProp', 'value');
    vnode_setProp(ssrNode, 'serializable', 'data');
    expect(attrs).toEqual({ serializable: 'data' });
    expect(vnode_getProp(ssrNode, ':localProp', null)).toBe('value');
  });
});

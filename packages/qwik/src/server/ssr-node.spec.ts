import { describe, expect, it } from 'vitest';
import { SsrNode } from './ssr-node';

describe('ssr-node', () => {
  it('should store attrs in standalone object', () => {
    const attrs = {};
    const ssrNode = new SsrNode(null, '1', attrs, [], null);
    ssrNode.setProp('a', 1);
    expect(attrs).toEqual({ a: 1 });
  });

  it('should store local props separately from attrs', () => {
    const attrs = {};
    const ssrNode = new SsrNode(null, '1', attrs, [], null);
    ssrNode.setProp(':localProp', 'value');
    ssrNode.setProp('serializable', 'data');
    expect(attrs).toEqual({ serializable: 'data' });
    expect(ssrNode.getProp(':localProp')).toBe('value');
  });
});

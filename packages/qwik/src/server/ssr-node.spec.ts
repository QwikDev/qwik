import { _EMPTY_ARRAY } from '@qwik.dev/core';
import { describe, expect, it } from 'vitest';
import { SsrNode } from './ssr-node';
import { OPEN_FRAGMENT, type VNodeData } from './vnode-data';
import { VNodeDataFlag } from './types';

describe('ssr-node', () => {
  it('should create empty array as attrs if attributesIndex is -1', () => {
    const vNodeData: VNodeData = [VNodeDataFlag.VIRTUAL_NODE];
    vNodeData.push(OPEN_FRAGMENT);
    const ssrNode = new SsrNode(null, '1', -1, [], vNodeData, null);
    ssrNode.setProp('a', 1);
    expect(vNodeData[(ssrNode as any).attributesIndex]).toEqual(['a', 1]);
  });

  it('should create new empty array as attrs if attrs are equal to EMPTY_ARRAY', () => {
    const vNodeData: VNodeData = [VNodeDataFlag.VIRTUAL_NODE];
    const attrs = _EMPTY_ARRAY;
    vNodeData.push(attrs, OPEN_FRAGMENT);
    const ssrNode = new SsrNode(null, '1', 1, [], vNodeData, null);
    ssrNode.setProp('a', 1);
    expect(vNodeData[(ssrNode as any).attributesIndex]).toEqual(['a', 1]);
  });
});

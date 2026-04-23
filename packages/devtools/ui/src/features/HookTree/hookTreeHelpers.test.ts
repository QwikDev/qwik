import { describe, expect, it, beforeEach } from 'vitest';
import {
  toTreeNodes,
  treeIdFingerprint,
  findNodeById,
  findNodeByDomAttr,
  getElementType,
  valueToTree,
  buildDetailTree,
  resetNodeId,
} from './hookTreeHelpers';
import type { VNodeTreeNode } from '../../devtools/page-data-source';

describe('toTreeNodes', () => {
  it('converts flat VNodeTreeNode array to TreeNode array', () => {
    const input: VNodeTreeNode[] = [
      { id: 'q-1', name: 'Root', props: { 'q:id': '1' } },
    ];
    const result = toTreeNodes(input);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('q-1');
    expect(result[0].name).toBe('Root');
    expect(result[0].label).toBe('Root');
    expect(result[0].props).toEqual({ 'q:id': '1' });
    expect(result[0].children).toBeUndefined();
  });

  it('recursively converts children', () => {
    const input: VNodeTreeNode[] = [
      {
        id: 'q-1',
        name: 'Root',
        children: [
          { id: 'q-2', name: 'Child' },
          {
            id: 'q-3',
            name: 'Child2',
            children: [{ id: 'q-4', name: 'Grandchild' }],
          },
        ],
      },
    ];
    const result = toTreeNodes(input);
    expect(result[0].children).toHaveLength(2);
    expect(result[0].children![1].children).toHaveLength(1);
    expect(result[0].children![1].children![0].name).toBe('Grandchild');
  });

  it('handles empty array', () => {
    expect(toTreeNodes([])).toEqual([]);
  });
});

describe('treeIdFingerprint', () => {
  it('joins node IDs in DFS order', () => {
    const nodes: VNodeTreeNode[] = [
      {
        id: 'a',
        children: [{ id: 'b' }, { id: 'c', children: [{ id: 'd' }] }],
      },
    ];
    expect(treeIdFingerprint(nodes)).toBe('a,b,c,d');
  });

  it('returns empty string for empty array', () => {
    expect(treeIdFingerprint([])).toBe('');
  });

  it('produces different fingerprints for different structures', () => {
    const treeA: VNodeTreeNode[] = [{ id: 'a', children: [{ id: 'b' }] }];
    const treeB: VNodeTreeNode[] = [{ id: 'a', children: [{ id: 'c' }] }];
    expect(treeIdFingerprint(treeA)).not.toBe(treeIdFingerprint(treeB));
  });

  it('produces same fingerprint for identical structures', () => {
    const tree: VNodeTreeNode[] = [{ id: 'q-1', children: [{ id: 'q-2' }] }];
    expect(treeIdFingerprint(tree)).toBe(treeIdFingerprint(tree));
  });
});

describe('findNodeById', () => {
  const tree = toTreeNodes([
    {
      id: 'q-1',
      name: 'Root',
      children: [
        { id: 'q-2', name: 'Layout' },
        {
          id: 'q-3',
          name: 'RouterOutlet',
          children: [{ id: 'q-4', name: 'About' }],
        },
      ],
    },
  ]);

  it('finds root node', () => {
    expect(findNodeById(tree, 'q-1')?.name).toBe('Root');
  });

  it('finds deeply nested node', () => {
    expect(findNodeById(tree, 'q-4')?.name).toBe('About');
  });

  it('returns null for non-existent ID', () => {
    expect(findNodeById(tree, 'q-999')).toBeNull();
  });

  it('returns null for empty tree', () => {
    expect(findNodeById([], 'q-1')).toBeNull();
  });
});

describe('findNodeByDomAttr', () => {
  const tree = toTreeNodes([
    {
      id: 'q-5',
      name: 'Layout',
      props: { 'q:id': '5', __colonId: 'XN_0' },
      children: [{ id: 'q-9', name: 'Link', props: { 'q:id': '9' } }],
    },
  ]);

  it('finds by q:id', () => {
    expect(findNodeByDomAttr(tree, '5', null)?.name).toBe('Layout');
  });

  it('finds by colonId', () => {
    expect(findNodeByDomAttr(tree, null, 'XN_0')?.name).toBe('Layout');
  });

  it('finds nested by q:id', () => {
    expect(findNodeByDomAttr(tree, '9', null)?.name).toBe('Link');
  });

  it('returns null when not found', () => {
    expect(findNodeByDomAttr(tree, '999', null)).toBeNull();
  });
});

describe('getElementType', () => {
  it('detects null', () => expect(getElementType(null)).toBe('null'));
  it('detects array', () => expect(getElementType([])).toBe('array'));
  it('detects boolean', () => expect(getElementType(true)).toBe('boolean'));
  it('detects number', () => expect(getElementType(42)).toBe('number'));
  it('detects string', () => expect(getElementType('hello')).toBe('string'));
  it('detects object', () => expect(getElementType({})).toBe('object'));
  it('detects function', () =>
    expect(getElementType(() => {})).toBe('function'));
});

describe('valueToTree', () => {
  beforeEach(() => resetNodeId());

  it('handles null', () => {
    const node = valueToTree('x', null, 0);
    expect(node?.label).toContain('null');
  });

  it('handles string', () => {
    const node = valueToTree('name', 'hello', 0);
    expect(node?.label).toContain('name');
    expect(node?.label).toContain('hello');
  });

  it('handles number', () => {
    const node = valueToTree('count', 42, 0);
    expect(node?.label).toContain('42');
  });

  it('handles array with children', () => {
    const node = valueToTree('items', [1, 2, 3], 0);
    expect(node?.elementType).toBe('array');
    expect(node?.children).toHaveLength(3);
  });

  it('handles nested object', () => {
    const node = valueToTree('data', { foo: 'bar', count: 1 }, 0);
    expect(node?.elementType).toBe('object');
    expect(node?.children).toHaveLength(2);
  });

  it('handles function marker', () => {
    const node = valueToTree(
      'onClick',
      { __type: 'function', __name: 'handler' },
      0,
    );
    expect(node?.label).toContain('handler');
  });

  it('respects depth limit', () => {
    const node = valueToTree('deep', { a: 1 }, 9);
    expect(node).toBeNull();
  });
});

describe('buildDetailTree', () => {
  beforeEach(() => resetNodeId());

  it('groups entries by hookType', () => {
    const entries = [
      { hookType: 'useSignal', variableName: 'count', data: 0 },
      { hookType: 'useSignal', variableName: 'name', data: 'test' },
      { hookType: 'useStore', variableName: 'state', data: { x: 1 } },
    ];
    const tree = buildDetailTree(entries);
    expect(tree).toHaveLength(2);
    expect(tree[0].label).toBe('useSignal');
    expect(tree[0].children).toHaveLength(2);
    expect(tree[1].label).toBe('useStore');
    expect(tree[1].children).toHaveLength(1);
  });

  it('handles empty entries', () => {
    expect(buildDetailTree([])).toEqual([]);
  });
});

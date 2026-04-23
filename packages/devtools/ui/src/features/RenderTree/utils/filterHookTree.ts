import type { TreeNode } from '../../../components/Tree/type';
import type { HookFilterItem } from '../types';

export function filterHookTree(
  nodes: TreeNode[],
  filters: HookFilterItem[],
): TreeNode[] {
  return nodes.filter((node) =>
    filters.some((filter) => filter.key === node.label && filter.display),
  );
}

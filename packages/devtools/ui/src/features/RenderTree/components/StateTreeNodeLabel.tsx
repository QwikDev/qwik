import { component$ } from '@qwik.dev/core';
import type { TreeNode } from '../../../components/Tree/type';
import { getValueColorClass } from '../utils/getValueColorClass';

interface StateTreeNodeLabelProps {
  node: TreeNode;
}

export const StateTreeNodeLabel = component$<StateTreeNodeLabelProps>(
  ({ node }) => {
    const label = node.label || node.name || '';
    const parts = label.split(':');

    if (node.children && parts.length === 1) {
      return <span class="font-semibold text-pink-400">{label}</span>;
    }

    if (parts.length > 1) {
      const key = parts[0];
      const value = parts.slice(1).join(':').trim();
      const valueClass = getValueColorClass(node, value);

      return (
        <>
          <span class="text-blue-400">{key}</span>
          <span class="text-foreground/70"> : </span>
          <span class={valueClass}>{value}</span>
        </>
      );
    }

    return <span>{label}</span>;
  },
);

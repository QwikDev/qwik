import type { TreeNode } from '../../../components/Tree/type';

export function getValueColorClass(node: TreeNode, valueText: string): string {
  switch (node.elementType) {
    case 'string':
      return 'text-red-400';
    case 'number':
      return 'text-green-400';
    case 'boolean':
      return 'text-amber-400';
    case 'function':
      return 'text-purple-400';
    case 'array':
      return 'text-muted-foreground';
    case 'object':
      return /(Array\[|Object\s\{|Class\s\{)/.test(valueText)
        ? 'text-muted-foreground'
        : 'text-foreground';
    default:
      return 'text-foreground';
  }
}

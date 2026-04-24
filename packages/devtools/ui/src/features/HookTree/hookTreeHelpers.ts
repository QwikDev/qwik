import type { TreeNode, ElementType } from '../../components/Tree/type';
import type { VNodeTreeNode, ComponentDetailEntry } from '../../devtools/page-data-source';
import type { HookType } from '../RenderTree/types';

/** VNodeTreeNode -> TreeNode conversion */
export function toTreeNodes(vnodes: VNodeTreeNode[]): TreeNode[] {
  return vnodes.map((v) => ({
    id: v.id,
    name: v.name,
    label: v.name,
    props: v.props as
      | Record<string, string | number | boolean | null | undefined | object>
      | undefined,
    children: v.children ? toTreeNodes(v.children) : undefined,
  }));
}

/** Quick structural fingerprint from node IDs. */
export function treeIdFingerprint(nodes: VNodeTreeNode[]): string {
  const ids: string[] = [];
  const walk = (list: VNodeTreeNode[]) => {
    for (const n of list) {
      ids.push(n.id);
      if (n.children) {
        walk(n.children);
      }
    }
  };
  walk(nodes);
  return ids.join(',');
}

/** Tree search helpers */
export function findNodeById(nodes: TreeNode[], id: string): TreeNode | null {
  for (const node of nodes) {
    if (node.id === id) {
      return node;
    }
    if (node.children) {
      const found = findNodeById(node.children, id);
      if (found) {
        return found;
      }
    }
  }
  return null;
}

export function findNodeByDomAttr(
  nodes: TreeNode[],
  qId: string | null,
  colonId: string | null
): TreeNode | null {
  for (const node of nodes) {
    const props = node.props as Record<string, unknown> | undefined;
    if (qId && props?.['q:id'] === qId) {
      return node;
    }
    if (colonId && props?.__colonId === colonId) {
      return node;
    }
    if (node.children) {
      const found = findNodeByDomAttr(node.children, qId, colonId);
      if (found) {
        return found;
      }
    }
  }
  return null;
}

let _nodeId = 0;
export function resetNodeId(): void {
  _nodeId = 0;
}
export function nextId(): string {
  return `detail-${_nodeId++}`;
}

export function getElementType(val: unknown): ElementType {
  if (val === null) {
    return 'null';
  }
  if (Array.isArray(val)) {
    return 'array';
  }
  const t = typeof val;
  if (t === 'boolean') {
    return 'boolean';
  }
  if (t === 'number') {
    return 'number';
  }
  if (t === 'string') {
    return 'string';
  }
  if (t === 'function') {
    return 'function';
  }
  if (t === 'object') {
    return 'object';
  }
  return 'string';
}

interface SerializedFunction {
  __type: 'function';
  __name?: string;
}

function isSerializedFunction(val: unknown): val is SerializedFunction {
  return typeof val === 'object' && val !== null && (val as any).__type === 'function';
}

export function valueToTree(key: string, val: unknown, depth: number): TreeNode | null {
  if (depth > 8) {
    return null;
  }

  if (val === null || val === undefined) {
    return { id: nextId(), label: `${key}: ${val}`, elementType: 'null' };
  }

  if (isSerializedFunction(val)) {
    const name = val.__name || 'anonymous';
    return {
      id: nextId(),
      label: `${key}: fn ${name}()`,
      elementType: 'function',
    };
  }

  const t = typeof val;

  if (t === 'string' || t === 'number' || t === 'boolean') {
    return {
      id: nextId(),
      name: key,
      label: `${key}: ${JSON.stringify(val)}`,
      elementType: getElementType(val),
    };
  }

  if (Array.isArray(val)) {
    const children = val
      .map((item, i) => valueToTree(`[${i}]`, item, depth + 1))
      .filter((n): n is TreeNode => n !== null);
    return {
      id: nextId(),
      name: key,
      label: `${key} (${val.length})`,
      elementType: 'array',
      children: children.length > 0 ? children : undefined,
    };
  }

  if (t === 'object') {
    const obj = val as Record<string, unknown>;
    const className = obj.__className as string | undefined;
    const entries = Object.keys(obj).filter((k) => k !== '__className' && k !== '__display');
    const children = entries
      .map((k) => valueToTree(k, obj[k], depth + 1))
      .filter((n): n is TreeNode => n !== null);
    const displayLabel = className ? `${key}: ${className}` : key;
    return {
      id: nextId(),
      name: key,
      label: displayLabel,
      elementType: 'object',
      children: children.length > 0 ? children : undefined,
    };
  }

  return {
    id: nextId(),
    label: `${key}: ${String(val)}`,
    elementType: 'string',
  };
}

export function buildDetailTree(entries: ComponentDetailEntry[]): TreeNode[] {
  _nodeId = 0;
  const byType = new Map<string, ComponentDetailEntry[]>();
  for (const e of entries) {
    const group = byType.get(e.hookType) || [];
    group.push(e);
    byType.set(e.hookType, group);
  }

  const result: TreeNode[] = [];
  for (const [hookType, items] of byType) {
    const children: TreeNode[] = [];
    for (const item of items) {
      const child = valueToTree(item.variableName, item.data, 0);
      if (child) {
        children.push(child);
      }
    }
    result.push({
      id: nextId(),
      name: hookType as HookType,
      label: hookType,
      children: children.length > 0 ? children : undefined,
    });
  }
  return result;
}

import type { Node } from 'oxc-parser';

interface VisitContext {
  parent: Node | null;
  key: string | null;
}

export function visit(node: unknown, visitor: (node: Node, context: VisitContext) => false | void) {
  visitNode(node, visitor, null, null);
}

function visitNode(
  node: unknown,
  visitor: (node: Node, context: VisitContext) => false | void,
  parent: Node | null,
  key: string | null
) {
  if (!isObjectNode(node)) {
    return;
  }
  if (visitor(node, { parent, key }) === false) {
    return;
  }
  for (const [key, value] of Object.entries(node)) {
    if (Array.isArray(value)) {
      for (const item of value) {
        visitNode(item, visitor, node, key);
      }
    } else if (isObjectNode(value)) {
      visitNode(value, visitor, node, key);
    }
  }
}

function isObjectNode(node: unknown): node is Node {
  return !!node && typeof node === 'object' && 'type' in node && typeof node.type === 'string';
}

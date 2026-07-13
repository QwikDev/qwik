import type { Node } from 'oxc-parser';
import { unwrapExpression } from '../ast-utils';

export interface JsxBranchExpression {
  condition: Node;
  then: Node;
  else: Node | null;
}

export function getJsxBranchExpression(node: unknown): JsxBranchExpression | null {
  const expr = unwrapExpression(node);
  if (!isObjectNode(expr)) {
    return null;
  }
  switch (expr.type) {
    case 'ConditionalExpression':
      if (!isBranchOutput(expr.consequent) && !isBranchOutput(expr.alternate)) {
        return null;
      }
      return {
        condition: expr.test,
        then: expr.consequent,
        else: isEmptyBranchExpression(expr.alternate) ? null : expr.alternate,
      };
    case 'LogicalExpression':
      return expr.operator === '&&' ? { condition: expr.left, then: expr.right, else: null } : null;
    default:
      return null;
  }
}

export function getStaticBranchCondition(node: unknown): boolean | null {
  const expr = unwrapExpression(node);
  if (!isObjectNode(expr) || expr.type !== 'Literal') {
    return null;
  }
  if (expr.value === true) {
    return true;
  }
  return expr.value === false || expr.value === null ? false : null;
}

export function isEmptyBranchExpression(node: unknown): boolean {
  const expr = unwrapExpression(node);
  return (
    isObjectNode(expr) &&
    expr.type === 'Literal' &&
    (expr.value === null || expr.value === false || expr.value === true)
  );
}

function isBranchOutput(node: unknown): boolean {
  const expr = unwrapExpression(node);
  if (!isObjectNode(expr)) {
    return false;
  }
  switch (expr.type) {
    case 'JSXElement':
    case 'JSXFragment':
    case 'CallExpression':
      return true;
    case 'ConditionalExpression':
      return isBranchOutput(expr.consequent) || isBranchOutput(expr.alternate);
    case 'LogicalExpression':
      return expr.operator === '&&';
    default:
      return false;
  }
}

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

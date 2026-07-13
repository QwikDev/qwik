import type { Node } from 'oxc-parser';
import {
  getIdentifierName,
  getJsxAttributeName,
  isFunctionLike,
  unwrapExpression,
} from '../ast-utils';
import type { AstFunction, AstJsxNode } from '../types';

export interface JsxBranchExpression {
  condition: Node;
  then: Node;
  else: Node | null;
}

export interface JsxMapExpression {
  source: Node;
  callback: AstFunction;
  row: AstJsxNode;
  key: Node;
  itemName: string;
  indexName: string | null;
}

export function getJsxMapExpression(node: unknown): JsxMapExpression | null {
  const expr = unwrapExpression(node);
  if (expr?.type !== 'CallExpression') {
    return null;
  }
  const callee = unwrapExpression(expr.callee);
  if (
    callee?.type !== 'MemberExpression' ||
    callee.computed ||
    getIdentifierName(callee.property) !== 'map'
  ) {
    return null;
  }
  const callback = unwrapExpression(expr.arguments[0]);
  if (!isFunctionLike(callback) || callback.async || callback.params.length > 2) {
    return null;
  }
  const itemName = getIdentifierName(callback.params[0]);
  const indexName = callback.params[1] === undefined ? null : getIdentifierName(callback.params[1]);
  if (itemName === null || (callback.params[1] !== undefined && indexName === null)) {
    return null;
  }
  const row = unwrapExpression(callback.body);
  if (row?.type !== 'JSXElement' && row?.type !== 'JSXFragment') {
    return null;
  }
  const key = getRowKey(row);
  if (key === null) {
    return null;
  }
  return {
    source: callee.object,
    callback,
    row,
    key,
    itemName,
    indexName,
  };
}

function getRowKey(row: AstJsxNode): Node | null {
  const children = row.type === 'JSXElement' ? [row] : row.children;
  for (const child of children) {
    if (child.type !== 'JSXElement') {
      continue;
    }
    const key = child.openingElement.attributes.find(
      (attr) => attr.type === 'JSXAttribute' && getJsxAttributeName(attr.name) === 'key'
    );
    if (key?.type === 'JSXAttribute' && key.value?.type === 'JSXExpressionContainer') {
      return unwrapExpression(key.value.expression) ?? null;
    }
  }
  return null;
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

import type { AnyNode, ParamRecord, PropRecord } from './types';

export function visit(node: unknown, visitor: (node: AnyNode) => void) {
  if (!isObjectNode(node)) {
    return;
  }
  visitor(node);
  for (const value of Object.values(node)) {
    if (Array.isArray(value)) {
      for (const item of value) {
        visit(item, visitor);
      }
    } else if (isObjectNode(value)) {
      visit(value, visitor);
    }
  }
}

export function getParams(fn: AnyNode): ParamRecord[] {
  return (fn.params ?? []).map((param: AnyNode) => ({
    name: getIdentifierName(param),
  }));
}

export function getStaticExpressionValue(
  expr: AnyNode | null | undefined
): { supported: true; value: PropRecord['value'] } | { supported: false } {
  if (!expr) {
    return { supported: false };
  }
  if (
    expr.type === 'StringLiteral' ||
    expr.type === 'NumericLiteral' ||
    expr.type === 'BooleanLiteral'
  ) {
    return { supported: true, value: expr.value };
  }
  if (expr.type === 'NullLiteral') {
    return { supported: true, value: null };
  }
  if (expr.type === 'Literal') {
    if (
      typeof expr.value === 'string' ||
      typeof expr.value === 'number' ||
      typeof expr.value === 'boolean' ||
      expr.value === null
    ) {
      return { supported: true, value: expr.value };
    }
  }
  return { supported: false };
}

export function getJsxName(name: AnyNode | null | undefined): string | null {
  if (!name) {
    return null;
  }
  if (name.type === 'JSXIdentifier' || name.type === 'Identifier') {
    return name.name;
  }
  return null;
}

export function getIdentifierName(node: AnyNode | null | undefined): string | null {
  if (!node) {
    return null;
  }
  if (node.type === 'Identifier' || node.type === 'BindingIdentifier') {
    return node.name;
  }
  return null;
}

export function isFunctionLike(node: AnyNode | null | undefined) {
  return (
    !!node &&
    (node.type === 'ArrowFunctionExpression' ||
      node.type === 'FunctionExpression' ||
      node.type === 'FunctionDeclaration')
  );
}

export function isCallExpression(node: AnyNode | null | undefined): node is AnyNode {
  return !!node && node.type === 'CallExpression';
}

export function isIdentifierNamed(node: AnyNode | null | undefined, name: string) {
  return !!node && node.type === 'Identifier' && node.name === name;
}

export function isJsxNode(node: AnyNode | null | undefined): node is AnyNode {
  return !!node && (node.type === 'JSXElement' || node.type === 'JSXFragment');
}

export function unwrapExpression(node: AnyNode | null | undefined): AnyNode | null | undefined {
  let current = node;
  while (current?.type === 'ParenthesizedExpression') {
    current = current.expression;
  }
  return current;
}

export function isNativeTag(name: string) {
  return /^[a-z][a-zA-Z0-9-]*$/.test(name);
}

export function isEventProp(name: string) {
  return name.endsWith('$') || /^on[A-Z]/.test(name) || name.includes(':on');
}

export function normalizeJsxText(value: string) {
  if (!value.includes('\n') && !value.includes('\r')) {
    return value;
  }
  return value
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .join(' ');
}

function isObjectNode(node: unknown): node is AnyNode {
  return !!node && typeof node === 'object' && typeof (node as AnyNode).type === 'string';
}

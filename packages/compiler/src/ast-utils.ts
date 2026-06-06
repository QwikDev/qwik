import type {
  AstFunction,
  AstJsxNode,
  AstNode,
  ParamRecord,
  PropRecord,
  SourceRange,
} from './types';

export function visit(node: unknown, visitor: (node: AstNode) => void) {
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

export function getParams(fn: AstFunction): ParamRecord[] {
  return fn.params.map((param) => ({
    name: getIdentifierName(param),
  }));
}

export function getStaticExpressionValue(
  expr: unknown
): { supported: true; value: PropRecord['value'] } | { supported: false } {
  if (!isObjectNode(expr)) {
    return { supported: false };
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

export function getJsxName(name: unknown): string | null {
  if (!isObjectNode(name)) {
    return null;
  }
  if (name.type === 'JSXIdentifier' || name.type === 'Identifier') {
    return name.name;
  }
  return null;
}

export function getJsxAttributeName(name: unknown): string | null {
  const simpleName = getJsxName(name);
  if (simpleName) {
    return simpleName;
  }
  if (isObjectNode(name) && name.type === 'JSXNamespacedName') {
    const namespace = getJsxName(name.namespace);
    const property = getJsxName(name.name);
    return namespace && property ? `${namespace}:${property}` : null;
  }
  return null;
}

export function getIdentifierName(node: unknown): string | null {
  if (!isObjectNode(node)) {
    return null;
  }
  if (node.type === 'Identifier') {
    return node.name;
  }
  return null;
}

export function getRange(node: unknown): SourceRange | null {
  if (!hasSourceRange(node)) {
    return null;
  }
  if (Array.isArray(node.range) && node.range.length === 2) {
    return [node.range[0], node.range[1]];
  }
  if (typeof node.start === 'number' && typeof node.end === 'number') {
    return [node.start, node.end];
  }
  return null;
}

export function isFunctionLike(node: unknown): node is AstFunction {
  if (!isObjectNode(node)) {
    return false;
  }
  return (
    node.type === 'ArrowFunctionExpression' ||
    node.type === 'FunctionExpression' ||
    node.type === 'FunctionDeclaration'
  );
}

export function isCallExpression(
  node: unknown
): node is Extract<AstNode, { type: 'CallExpression' }> {
  return isObjectNode(node) && node.type === 'CallExpression';
}

export function isIdentifierNamed(node: unknown, name: string) {
  return isObjectNode(node) && node.type === 'Identifier' && node.name === name;
}

export function isJsxNode(node: unknown): node is AstJsxNode {
  return isObjectNode(node) && (node.type === 'JSXElement' || node.type === 'JSXFragment');
}

export function unwrapExpression(node: unknown): AstNode | null | undefined {
  let current = node;
  while (isObjectNode(current) && current.type === 'ParenthesizedExpression') {
    current = current.expression;
  }
  return isObjectNode(current) ? current : null;
}

export function isNativeTag(name: string) {
  return /^[a-z][a-zA-Z0-9-]*$/.test(name);
}

export function isEventProp(name: string) {
  return name.endsWith('$') || /^on[A-Z]/.test(name) || name.includes(':on');
}

export function jsxEventToHtmlAttribute(jsxEvent: string, isPassive = false): string | null {
  if (!jsxEvent.endsWith('$')) {
    return null;
  }

  const [prefix, index] = getEventScopeDataFromJsxEvent(jsxEvent, isPassive);
  if (index === -1) {
    return null;
  }
  return prefix + normalizeJsxEventName(jsxEvent.slice(index, -1));
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

function getEventScopeDataFromJsxEvent(jsxEvent: string, isPassive: boolean): [string, number] {
  if (jsxEvent.startsWith('window:on')) {
    return [isPassive ? 'q-wp:' : 'q-w:', 9];
  }
  if (jsxEvent.startsWith('document:on')) {
    return [isPassive ? 'q-dp:' : 'q-d:', 11];
  }
  if (jsxEvent.startsWith('on')) {
    return [isPassive ? 'q-ep:' : 'q-e:', 2];
  }
  return ['', -1];
}

function normalizeJsxEventName(name: string): string {
  if (name === 'DOMContentLoaded') {
    return '-d-o-m-content-loaded';
  }
  return fromCamelToKebabCase(name.charAt(0) === '-' ? name.slice(1) : name.toLowerCase());
}

function fromCamelToKebabCase(value: string) {
  return value.replace(/([A-Z-])/g, (part) => '-' + part.toLowerCase());
}

function isObjectNode(node: unknown): node is AstNode {
  return !!node && typeof node === 'object' && 'type' in node && typeof node.type === 'string';
}

function hasSourceRange(
  node: unknown
): node is { start?: number; end?: number; range?: [number, number] } {
  return !!node && typeof node === 'object';
}

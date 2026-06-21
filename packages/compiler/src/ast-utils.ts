import type {
  AstFunction,
  AstJsxNode,
  AstNode,
  NamedPropRecord,
  ParamRecord,
  SourceRange,
} from './types';

export type StaticSourceTextPart =
  | { kind: 'text'; value: string }
  | { kind: 'source'; sourceName: string; expressionRange: SourceRange };

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
  return fn.params.map((param) => {
    const expr = unwrapExpression(param);
    if (isObjectNode(expr) && expr.type === 'AssignmentPattern') {
      return {
        name: getIdentifierName(expr.left),
        bindingRange: getRange(expr.left),
        defaultRange: getRange(expr.right),
      };
    }
    return {
      name: getIdentifierName(param),
      bindingRange: getRange(param),
      defaultRange: null,
    };
  });
}

export function getStaticExpressionValue(
  expr: unknown
): { supported: true; value: NamedPropRecord['value'] } | { supported: false } {
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

export function getSignalValueSourceName(node: unknown): string | null {
  const expr = unwrapExpression(node);
  if (!isObjectNode(expr) || expr.type !== 'MemberExpression') {
    return null;
  }
  if (expr.computed) {
    return null;
  }
  const property = expr.property;
  if (!isObjectNode(property) || property.type !== 'Identifier' || property.name !== 'value') {
    return null;
  }
  const object = expr.object;
  return isObjectNode(object) && object.type === 'Identifier' ? object.name : null;
}

export function isStaticSourceTextExpression(node: unknown): boolean {
  return getStaticSourceTextExpressionParts(node) !== null;
}

export function getStaticSourceTextExpressionParts(node: unknown): StaticSourceTextPart[] | null {
  const analysis = analyzeStaticSourceTextExpression(node);
  return analysis?.guaranteedString ? analysis.parts : null;
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
  const lines = value.replace(/\r\n?/g, '\n').split('\n');
  let lastNonEmptyLine = -1;
  for (let i = 0; i < lines.length; i++) {
    if (/[^ \t]/.test(lines[i])) {
      lastNonEmptyLine = i;
    }
  }
  if (lastNonEmptyLine === -1) {
    return '';
  }

  let text = '';
  for (let i = 0; i < lines.length; i++) {
    let line = lines[i].replace(/\t/g, ' ');
    const isFirstLine = i === 0;
    const isLastLine = i === lines.length - 1;
    const isLastNonEmptyLine = i === lastNonEmptyLine;
    if (!isFirstLine) {
      line = line.replace(/^ +/, '');
    }
    if (!isLastLine) {
      line = line.replace(/ +$/, '');
    }
    if (line) {
      text += line;
      if (!isLastNonEmptyLine) {
        text += ' ';
      }
    }
  }
  return text;
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

function analyzeStaticSourceTextExpression(
  node: unknown
): { parts: StaticSourceTextPart[]; guaranteedString: boolean } | null {
  const expr = unwrapExpression(node);
  if (!isObjectNode(expr)) {
    return null;
  }
  if (expr.type === 'Literal') {
    const value = expr.value;
    if (typeof value === 'string') {
      return { parts: [{ kind: 'text', value }], guaranteedString: true };
    }
    if (typeof value === 'number' || typeof value === 'bigint') {
      return { parts: [{ kind: 'text', value: String(value) }], guaranteedString: false };
    }
    return null;
  }
  const sourceName = getSignalValueSourceName(expr);
  const expressionRange = getRange(expr);
  if (sourceName !== null && expressionRange !== null) {
    return {
      parts: [{ kind: 'source', sourceName, expressionRange }],
      guaranteedString: false,
    };
  }
  if (expr.type === 'BinaryExpression' && expr.operator === '+') {
    const left = analyzeStaticSourceTextExpression(expr.left);
    const right = analyzeStaticSourceTextExpression(expr.right);
    if (!left || !right || (!left.guaranteedString && !right.guaranteedString)) {
      return null;
    }
    return {
      parts: [...left.parts, ...right.parts],
      guaranteedString: true,
    };
  }
  return null;
}

function isObjectNode(node: unknown): node is AstNode {
  return !!node && typeof node === 'object' && 'type' in node && typeof node.type === 'string';
}

function hasSourceRange(
  node: unknown
): node is { start?: number; end?: number; range?: [number, number] } {
  return !!node && typeof node === 'object';
}

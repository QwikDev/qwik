import type { AstFunction, AstNode, ParamRecord, SourceRange } from './types';

export type StaticSourceTextPart =
  | { kind: 'text'; value: string }
  | {
      kind: 'source';
      sourceName: string;
      sourceRange: SourceRange;
      expressionRange: SourceRange;
    };

export type SourceExpressionPredicate = (
  sourceName: string,
  sourceRange: SourceRange,
  expressionRange: SourceRange
) => boolean;

const PROMISE_STATIC_METHODS = new Set(['all', 'allSettled', 'any', 'race', 'reject', 'resolve']);

export function isObviousPromiseExpression(
  expression: AstNode,
  isGlobalPromise: (node: AstNode) => boolean
): boolean {
  if (expression.type === 'ImportExpression') {
    return true;
  }
  if (expression.type === 'NewExpression') {
    const callee = unwrapExpression(expression.callee);
    return callee != null && isGlobalPromise(callee);
  }
  if (expression.type !== 'CallExpression') {
    return false;
  }
  const callee = unwrapExpression(expression.callee);
  if (callee?.type === 'ArrowFunctionExpression' || callee?.type === 'FunctionExpression') {
    return callee.async;
  }
  if (callee?.type !== 'MemberExpression' || callee.computed) {
    return false;
  }
  const object = unwrapExpression(callee.object);
  const method = getIdentifierName(callee.property);
  return (
    object != null &&
    isGlobalPromise(object) &&
    method !== null &&
    PROMISE_STATIC_METHODS.has(method)
  );
}

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
      const props = getParamPropAnalysis(expr.left);
      return {
        name: getIdentifierName(expr.left),
        bindingRange: getRange(expr.left),
        defaultRange: getRange(expr.right),
        propAliases: props.aliases,
        canProjectProps: props.canProject,
      };
    }
    const props = getParamPropAnalysis(param);
    return {
      name: getIdentifierName(param),
      bindingRange: getRange(param),
      defaultRange: null,
      propAliases: props.aliases,
      canProjectProps: props.canProject,
    };
  });
}

export function getStaticExpressionValue(
  expr: unknown
): { supported: true; value: string | number | boolean | null } | { supported: false } {
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

function getParamPropAnalysis(node: unknown): {
  aliases: ParamRecord['propAliases'];
  canProject: boolean;
} {
  const pattern = unwrapAssignmentLeft(node);
  if (!isObjectNode(pattern) || pattern.type !== 'ObjectPattern') {
    return { aliases: [], canProject: false };
  }
  const aliases: ParamRecord['propAliases'] = [];
  let canProject = true;
  for (const prop of pattern.properties ?? []) {
    if (!isObjectNode(prop) || prop.type !== 'Property' || prop.computed) {
      canProject = false;
      continue;
    }
    const propName = getStaticPropertyName(prop.key);
    const localName = getDirectBindingLocalName(prop.value);
    if (propName !== null && localName !== null) {
      aliases.push({ localName, propName });
    } else {
      canProject = false;
    }
  }
  return { aliases, canProject };
}

function unwrapAssignmentLeft(node: unknown): unknown {
  const expr = unwrapExpression(node);
  if (isObjectNode(expr) && expr.type === 'AssignmentPattern') {
    return unwrapAssignmentLeft(expr.left);
  }
  return expr;
}

function getStaticPropertyName(node: unknown): string | null {
  if (!isObjectNode(node)) {
    return null;
  }
  if (node.type === 'Identifier') {
    return node.name;
  }
  if (node.type === 'Literal' && typeof node.value === 'string') {
    return node.value;
  }
  return null;
}

function getDirectBindingLocalName(node: unknown): string | null {
  const expr = unwrapExpression(node);
  return getIdentifierName(expr);
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

export function unwrapExpression(node: unknown): AstNode | null | undefined {
  let current = node;
  while (isObjectNode(current) && current.type === 'ParenthesizedExpression') {
    current = current.expression;
  }
  return isObjectNode(current) ? current : null;
}

function getSignalValueSourceName(node: unknown): string | null {
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

export function getStaticSourceTextExpressionParts(
  node: unknown,
  isKnownSourceName: SourceExpressionPredicate = acceptAnySourceName
): StaticSourceTextPart[] | null {
  const analysis = analyzeStaticSourceTextExpression(node, isKnownSourceName);
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
  node: unknown,
  isKnownSourceName: SourceExpressionPredicate
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
  const sourceRange = expr.type === 'MemberExpression' ? getRange(expr.object) : null;
  const expressionRange = getRange(expr);
  if (
    sourceName !== null &&
    sourceRange !== null &&
    expressionRange !== null &&
    isKnownSourceName(sourceName, sourceRange, expressionRange)
  ) {
    return {
      parts: [{ kind: 'source', sourceName, sourceRange, expressionRange }],
      guaranteedString: false,
    };
  }
  if (expr.type === 'BinaryExpression' && expr.operator === '+') {
    const left = analyzeStaticSourceTextExpression(expr.left, isKnownSourceName);
    const right = analyzeStaticSourceTextExpression(expr.right, isKnownSourceName);
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

function acceptAnySourceName(): boolean {
  return true;
}

function isObjectNode(node: unknown): node is AstNode {
  return !!node && typeof node === 'object' && 'type' in node && typeof node.type === 'string';
}

function hasSourceRange(
  node: unknown
): node is { start?: number; end?: number; range?: [number, number] } {
  return !!node && typeof node === 'object';
}

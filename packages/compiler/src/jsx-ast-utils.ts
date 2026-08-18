import type { JSXAttributeItem, JSXAttributeValue, JSXElement, Node } from 'oxc-parser';
import {
  getIdentifierName,
  getJsxAttributeName,
  getJsxName,
  getStaticExpressionValue,
  isEventProp,
  isFunctionLike,
  unwrapExpression,
} from './ast-utils';
import type { AstFunction, AstJsxNode, AstNode } from './types';
import type { StaticProp } from './plan-types';

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

export function getStaticJsxAttributeValue(
  value: JSXAttributeValue | null
): StaticProp['value'] | undefined {
  if (value === null) {
    return true;
  }
  const expression =
    value.type === 'JSXExpressionContainer' ? unwrapExpression(value.expression) : value;
  const staticValue = getStaticExpressionValue(expression);
  return staticValue.supported ? staticValue.value : undefined;
}

export function getStaticObjectProperties(
  value: unknown
): readonly { readonly name: string; readonly value: StaticProp['value'] }[] | null {
  const expression = unwrapExpression(value);
  if (!isObjectNode(expression) || expression.type !== 'ObjectExpression') {
    return null;
  }
  const output: { name: string; value: StaticProp['value'] }[] = [];
  for (const property of expression.properties) {
    if (property.type === 'SpreadElement') {
      const nested = getStaticObjectProperties(property.argument);
      if (nested === null) {
        return null;
      }
      output.push(...nested);
      continue;
    }
    if (
      property.type !== 'Property' ||
      property.kind !== 'init' ||
      property.computed ||
      property.method ||
      property.shorthand
    ) {
      return null;
    }
    const name =
      property.key.type === 'Identifier'
        ? property.key.name
        : property.key.type === 'Literal' &&
            (typeof property.key.value === 'string' || typeof property.key.value === 'number')
          ? String(property.key.value)
          : null;
    const staticValue = getStaticExpressionValue(property.value);
    if (name === null || name === '__proto__' || !staticValue.supported) {
      return null;
    }
    output.push({ name, value: staticValue.value });
  }
  return output;
}

export type ExpandableObjectProperty =
  | { readonly kind: 'static'; readonly name: string; readonly value: StaticProp['value'] }
  | {
      readonly kind: 'bind';
      readonly name: 'bind:value' | 'bind:checked';
      readonly value: AstNode;
    }
  | {
      readonly kind: 'ref';
      readonly name: 'ref';
      readonly value: AstNode;
    };

/**
 * Expands the same side-effect-free object literals as getStaticObjectProperties, plus direct bind
 * and ref values. Other dynamic values stay opaque so their object-evaluation semantics are kept.
 */
export function getExpandableObjectProperties(
  value: unknown
): readonly ExpandableObjectProperty[] | null {
  const expression = unwrapExpression(value);
  if (!isObjectNode(expression) || expression.type !== 'ObjectExpression') {
    return null;
  }
  const output: ExpandableObjectProperty[] = [];
  for (const property of expression.properties) {
    if (property.type === 'SpreadElement') {
      const nested = getExpandableObjectProperties(property.argument);
      if (nested === null) {
        return null;
      }
      output.push(...nested);
      continue;
    }
    if (
      property.type !== 'Property' ||
      property.kind !== 'init' ||
      property.computed ||
      property.method ||
      property.shorthand
    ) {
      return null;
    }
    const name =
      property.key.type === 'Identifier'
        ? property.key.name
        : property.key.type === 'Literal' &&
            (typeof property.key.value === 'string' || typeof property.key.value === 'number')
          ? String(property.key.value)
          : null;
    if (name === null || name === '__proto__') {
      return null;
    }
    const dynamicValue = unwrapExpression(property.value);
    if (
      name === 'ref' &&
      isObjectNode(dynamicValue) &&
      (dynamicValue.type === 'Identifier' ||
        dynamicValue.type === 'Literal' ||
        isFunctionLike(dynamicValue))
    ) {
      output.push({ kind: 'ref', name, value: dynamicValue });
      continue;
    }
    if ((name === 'bind:value' || name === 'bind:checked') && isObjectNode(dynamicValue)) {
      output.push({ kind: 'bind', name, value: dynamicValue });
      continue;
    }
    const staticValue = getStaticExpressionValue(property.value);
    if (staticValue.supported) {
      output.push({ kind: 'static', name, value: staticValue.value });
      continue;
    }
    return null;
  }
  return output;
}

export function getJsxAttributeExpression(
  value: JSXAttributeValue | null | undefined
): AstNode | null {
  return value?.type === 'JSXExpressionContainer'
    ? (unwrapExpression(value.expression) ?? null)
    : null;
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
  const row = getCallbackReturnedJsx(callback);
  if (row === null) {
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

export function getJsxMapKeyAttribute(
  node: unknown
): Extract<JSXAttributeItem, { type: 'JSXAttribute' }> | null {
  const map = getJsxMapExpression(node);
  return map === null ? null : getRowKeyAttribute(map.row);
}

function getCallbackReturnedJsx(callback: AstFunction): AstJsxNode | null {
  const body = unwrapExpression(callback.body);
  switch (body?.type) {
    case 'JSXElement':
    case 'JSXFragment':
      return body;
    case 'BlockStatement':
      for (const statement of body.body) {
        if (statement.type === 'ReturnStatement') {
          const returned = unwrapExpression(statement.argument);
          return returned?.type === 'JSXElement' || returned?.type === 'JSXFragment'
            ? returned
            : null;
        }
      }
      return null;
    default:
      return null;
  }
}

function getRowKey(row: AstJsxNode): Node | null {
  const key = getRowKeyAttribute(row);
  return key?.value?.type === 'JSXExpressionContainer'
    ? (unwrapExpression(key.value.expression) ?? null)
    : null;
}

function getRowKeyAttribute(
  row: AstJsxNode
): Extract<JSXAttributeItem, { type: 'JSXAttribute' }> | null {
  const children = row.type === 'JSXElement' ? [row] : row.children;
  for (const child of children) {
    if (child.type !== 'JSXElement') {
      continue;
    }
    const key = child.openingElement.attributes.find(
      (attr) => attr.type === 'JSXAttribute' && getJsxAttributeName(attr.name) === 'key'
    );
    if (key?.type === 'JSXAttribute') {
      return key;
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

/**
 * A value the props object can carry per key without code: a literal, a bare reference, or a direct
 * `source.value` read. Anything else needs its own expression segment.
 */
function isSerializablePropExpression(value: JSXAttributeValue | null | undefined): boolean {
  if (getStaticJsxAttributeValue(value ?? null) !== undefined) {
    return true;
  }
  const expression = unwrapExpression(getJsxAttributeExpression(value));
  if (expression?.type === 'Identifier') {
    return true;
  }
  if (
    expression?.type === 'MemberExpression' &&
    !expression.computed &&
    getIdentifierName(expression.property) === 'value' &&
    unwrapExpression(expression.object)?.type === 'Identifier'
  ) {
    return true;
  }
  // An expression wrapping a `$` boundary resolves to a QRL, which serializes on its own.
  let hasBoundary = false;
  visit(expression, (node) => {
    hasBoundary ||=
      node.type === 'CallExpression' && (getIdentifierName(node.callee)?.endsWith('$') ?? false);
  });
  return hasBoundary;
}

/**
 * True when a component prop's value only survives resume as a per-key QRL segment: a computed
 * expression over something that can change. Serializable values (literals, bare references, direct
 * `source.value` reads, `$` boundaries) and event/bind/ref props stay inline.
 */
export function isComputedComponentProp(attribute: JSXAttributeItem): boolean {
  if (attribute.type === 'JSXSpreadAttribute') {
    return false;
  }
  const name = getJsxAttributeName(attribute.name);
  if (
    name === null ||
    name === 'key' ||
    name === 'q:slot' ||
    name === 'ref' ||
    name.startsWith('bind:') ||
    isEventProp(name)
  ) {
    return false;
  }
  return !isSerializablePropExpression(attribute.value);
}

/**
 * A call to one of these is JSX in call form, so every pass that looks for JSX must accept it. Only
 * the local names matter: the callers already know the import came from Qwik.
 */
export function isJsxCallExpression(node: unknown, calleeNames: ReadonlySet<string>): boolean {
  if (calleeNames.size === 0) {
    return false;
  }
  const call = unwrapExpression(node);
  if (call?.type !== 'CallExpression') {
    return false;
  }
  const callee = unwrapExpression(call.callee);
  return callee?.type === 'Identifier' && calleeNames.has(getIdentifierName(callee) ?? '');
}

/**
 * `jsx('div', { class: c, children: x })` is JSX written as a call, which the runtime cannot
 * execute. Rebuilding it as an element keeps one lowering path for both spellings. Synthetic nodes
 * borrow the ranges of the real argument nodes, so bindings and segments still resolve.
 *
 * Returns null for shapes JSX syntax cannot express either — a computed tag, a non-literal props
 * object, or the automatic runtime's third `key` argument.
 */
export function getJsxCallElement(node: unknown): JSXElement | null {
  const call = unwrapExpression(node);
  if (call?.type !== 'CallExpression' || call.arguments.length !== 2) {
    return null;
  }
  const [type, props] = call.arguments;
  const name = jsxCallName(type);
  if (name === null || !isObjectNode(props) || props.type !== 'ObjectExpression') {
    return null;
  }
  const attributes: JSXAttributeItem[] = [];
  const children: Node[] = [];
  for (const property of props.properties) {
    if (property.type === 'SpreadElement') {
      attributes.push(
        spanOf(property, { type: 'JSXSpreadAttribute', argument: property.argument })
      );
      continue;
    }
    if (property.type !== 'Property' || property.kind !== 'init' || property.computed) {
      return null;
    }
    const propertyName = getJsxName(property.key) ?? staticStringKey(property.key);
    if (propertyName === null) {
      return null;
    }
    const value = spanOf(property.value, {
      type: 'JSXExpressionContainer',
      expression: property.value,
    });
    if (propertyName === 'children') {
      children.push(value);
      continue;
    }
    attributes.push(
      spanOf(property, {
        type: 'JSXAttribute',
        name: spanOf(property.key, { type: 'JSXIdentifier', name: propertyName }),
        value,
      })
    );
  }
  return spanOf(call, {
    type: 'JSXElement',
    openingElement: spanOf(call, {
      type: 'JSXOpeningElement',
      name,
      attributes,
      typeArguments: null,
      selfClosing: children.length === 0,
    }),
    closingElement: null,
    children,
  }) as unknown as JSXElement;
}

/** A literal tag becomes an element name; an identifier keeps its node so its binding resolves. */
function jsxCallName(type: unknown): Node | null {
  const expression = unwrapExpression(type);
  if (expression?.type === 'Identifier') {
    return expression;
  }
  const literal = staticStringKey(expression);
  return literal === null
    ? null
    : spanOf(expression, { type: 'JSXIdentifier', name: literal } as never);
}

function staticStringKey(node: unknown): string | null {
  return isObjectNode(node) && node.type === 'Literal' && typeof node.value === 'string'
    ? node.value
    : null;
}

/** Synthetic nodes carry the source span of the real node they stand for. */
function spanOf<T extends object>(source: unknown, node: T): T & Node {
  const range = isObjectNode(source) ? ((source as unknown as Node).start ?? 0) : 0;
  const end = isObjectNode(source) ? ((source as unknown as Node).end ?? range) : range;
  return { ...node, start: range, end } as T & Node;
}

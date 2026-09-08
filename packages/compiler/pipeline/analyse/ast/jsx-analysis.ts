import type {
  ArrowFunctionExpression,
  CallExpression,
  ConditionalExpression,
  Expression,
  JSXElement,
  JSXFragment,
  JSXText,
  LogicalExpression,
  Node,
} from 'oxc-parser';
import type { BindingGraph } from './bindings';
import { identifierName, readReturnedBody, unwrapExpression } from './utils';
import { findRuntimeJsx } from './returns-jsx';
import { UnsupportedError } from '../../errors';

export const enum JsxValueKind {
  Element = 'element',
  Fragment = 'fragment',
  Conditional = 'conditional',
  Logical = 'logical',
  Collection = 'collection',
  Text = 'text',
  Empty = 'empty',
  Value = 'value',
}

export type JsxValue = Readonly<
  { hasJsxValue: boolean } & (
    | { kind: JsxValueKind.Element; node: JSXElement }
    | { kind: JsxValueKind.Fragment; node: JSXFragment; children: readonly JsxValue[] }
    | {
        kind: JsxValueKind.Conditional;
        node: ConditionalExpression;
        then: JsxValue;
        else: JsxValue;
      }
    | { kind: JsxValueKind.Logical; node: LogicalExpression; left: JsxValue; right: JsxValue }
    | {
        kind: JsxValueKind.Collection;
        node: CallExpression;
        callback: ArrowFunctionExpression;
        source: Expression;
        body: ReturnType<typeof readReturnedBody>;
        row: JsxValue | null;
      }
    | { kind: JsxValueKind.Text; node: JSXText }
    | { kind: JsxValueKind.Empty | JsxValueKind.Value; node: Node }
  )
>;

export interface JsxAnalysis {
  read(node: Node): JsxValue;
  expressionRoots(node: Node): (JSXElement | JSXFragment)[];
}

/** Share value structure without entering element children or arbitrary calls. */
export function createJsxAnalysis(bindings?: BindingGraph): JsxAnalysis {
  const values = new WeakMap<Node, JsxValue>();
  function read(source: Node): JsxValue {
    const node = unwrapExpression(source)!;
    if (node.type === 'JSXExpressionContainer') {
      return read(node.expression);
    }
    const known = values.get(node);
    if (known !== undefined) {
      return known;
    }
    values.set(node, { kind: JsxValueKind.Value, node, hasJsxValue: false });
    const value = analyse(node);
    values.set(node, value);
    return value;
  }

  function analyse(node: Node): JsxValue {
    switch (node.type) {
      case 'JSXElement':
        return { kind: JsxValueKind.Element, node, hasJsxValue: true };
      case 'JSXFragment':
        return {
          kind: JsxValueKind.Fragment,
          node,
          hasJsxValue: true,
          children: node.children.map(read),
        };
      case 'ConditionalExpression': {
        const then = read(node.consequent);
        const otherwise = read(node.alternate);
        return {
          kind: JsxValueKind.Conditional,
          node,
          then,
          else: otherwise,
          hasJsxValue: then.hasJsxValue || otherwise.hasJsxValue,
        };
      }
      case 'LogicalExpression': {
        const left = read(node.left);
        const right = read(node.right);
        return {
          kind: JsxValueKind.Logical,
          node,
          left,
          right,
          hasJsxValue: left.hasJsxValue || right.hasJsxValue,
        };
      }
      case 'CallExpression': {
        const callback = node.arguments[0];
        if (
          node.callee.type === 'MemberExpression' &&
          identifierName(node.callee.property) === 'map' &&
          node.arguments.length === 1 &&
          callback.type === 'ArrowFunctionExpression'
        ) {
          const body = readReturnedBody(callback.body);
          return {
            kind: JsxValueKind.Collection,
            node,
            callback,
            source: node.callee.object,
            body,
            row: body === null ? null : read(body.expression),
            hasJsxValue: false,
          };
        }
        break;
      }
      case 'SequenceExpression':
        return {
          kind: JsxValueKind.Value,
          node,
          hasJsxValue: read(node.expressions.at(-1)!).hasJsxValue,
        };
      case 'ArrayExpression':
        return {
          kind: JsxValueKind.Value,
          node,
          hasJsxValue: node.elements.some(
            (element) => element !== null && read(element).hasJsxValue
          ),
        };
      case 'ObjectExpression':
        return {
          kind: JsxValueKind.Value,
          node,
          hasJsxValue: node.properties.some(
            (property) =>
              read(property.type === 'SpreadElement' ? property.argument : property.value)
                .hasJsxValue
          ),
        };
      case 'SpreadElement':
        return { kind: JsxValueKind.Value, node, hasJsxValue: read(node.argument).hasJsxValue };
      case 'MemberExpression':
        return { kind: JsxValueKind.Value, node, hasJsxValue: read(node.object).hasJsxValue };
      case 'ChainExpression':
        return { kind: JsxValueKind.Value, node, hasJsxValue: read(node.expression).hasJsxValue };
      case 'JSXText':
        return { kind: JsxValueKind.Text, node, hasJsxValue: false };
      case 'JSXEmptyExpression':
        return { kind: JsxValueKind.Empty, node, hasJsxValue: false };
      case 'Literal':
        if (node.value === null) {
          return { kind: JsxValueKind.Empty, node, hasJsxValue: false };
        }
        break;
      case 'Identifier': {
        const binding = bindings?.reference(node);
        if (bindings !== undefined && binding != null) {
          const hasJsxValue = bindings
            .declarationsOf(binding)
            .some(
              (declaration) =>
                declaration.type === 'VariableDeclarator' &&
                declaration.init !== null &&
                read(declaration.init).hasJsxValue
            );
          return { kind: JsxValueKind.Value, node, hasJsxValue };
        }
        if (node.name === 'undefined') {
          return { kind: JsxValueKind.Empty, node, hasJsxValue: false };
        }
      }
    }
    return { kind: JsxValueKind.Value, node, hasJsxValue: false };
  }

  return { read, expressionRoots };
}

/** Containers preserve native evaluation while embedded JSX becomes render values. */
function expressionRoots(source: Node): (JSXElement | JSXFragment)[] {
  const node = unwrapExpression(source)!;
  switch (node.type) {
    case 'JSXElement':
    case 'JSXFragment':
      return [node];
    case 'ArrayExpression':
      return node.elements.flatMap((element) => (element === null ? [] : expressionRoots(element)));
    case 'ObjectExpression':
      return node.properties.flatMap((property) =>
        property.type === 'SpreadElement'
          ? expressionRoots(property.argument)
          : [...expressionRoots(property.key), ...expressionRoots(property.value)]
      );
    case 'SpreadElement':
      return expressionRoots(node.argument);
    case 'ConditionalExpression':
      return [node.test, node.consequent, node.alternate].flatMap(expressionRoots);
    case 'LogicalExpression':
      return [node.left, node.right].flatMap(expressionRoots);
    case 'MemberExpression':
      return [node.object, ...(node.computed ? [node.property] : [])].flatMap(expressionRoots);
    case 'ChainExpression':
      return expressionRoots(node.expression);
    default:
      if (findRuntimeJsx(node) !== null) {
        throw new UnsupportedError('JSX inside an expression value');
      }
      return [];
  }
}

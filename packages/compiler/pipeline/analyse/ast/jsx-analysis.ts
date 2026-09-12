import type {
  ArrowFunctionExpression,
  CallExpression,
  ConditionalExpression,
  Expression,
  Function as FunctionNode,
  JSXElement,
  JSXFragment,
  JSXText,
  LogicalExpression,
  Node,
} from 'oxc-parser';
import type { BindingGraph } from './bindings';
import type { LocalId } from '../../schema';
import { identifierName, isFunctionLike, readReturnedBody, unwrapExpression } from './utils';
import { UnsupportedError } from '../../errors';
import { isNode, type WalkableNode } from './ast-types';

export interface JsxFactory {
  fn: ArrowFunctionExpression | FunctionNode;
  roots: JsxExpressionRoot[];
}

export type JsxExpressionRoot = JSXElement | JSXFragment | ArrowFunctionExpression | FunctionNode;

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
    | { kind: JsxValueKind.Fragment; node: JSXFragment | JSXElement; children: readonly JsxValue[] }
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
  expressionRoots(node: Node): JsxExpressionRoot[];
  factory(node: Node): JsxFactory | null;
  scopedRoots(nodes: readonly Node[]): JsxExpressionRoot[];
}

/** Share JSX value structure and callback scopes across lowering consumers. */
export function createJsxAnalysis(
  bindings?: BindingGraph,
  coreBindings: ReadonlyMap<LocalId, string> = new Map()
): JsxAnalysis {
  const values = new WeakMap<Node, JsxValue>();
  const factories = new WeakMap<Node, JsxFactory | null>();
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
      case 'JSXFragment':
        if (node.type === 'JSXElement') {
          const name = node.openingElement.name;
          const binding = bindings?.reference(name);
          if (
            name.type !== 'JSXIdentifier' ||
            !/^[A-Z]/.test(name.name) ||
            binding == null ||
            coreBindings.get(binding) !== 'Fragment'
          ) {
            return { kind: JsxValueKind.Element, node, hasJsxValue: true };
          }
          if (
            node.openingElement.attributes.some(
              (attribute) =>
                attribute.type !== 'JSXAttribute' ||
                attribute.name.type !== 'JSXIdentifier' ||
                attribute.name.name !== 'key'
            )
          ) {
            throw new UnsupportedError('Fragment attributes other than key');
          }
        }
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
      case 'CallExpression':
      case 'NewExpression': {
        const callback = node.arguments[0];
        if (
          node.type === 'CallExpression' &&
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
        return {
          kind: JsxValueKind.Value,
          node,
          hasJsxValue: node.arguments.some((argument) => read(argument).hasJsxValue),
        };
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
        // `null` and booleans render nothing.
        if (node.value === null || typeof node.value === 'boolean') {
          return { kind: JsxValueKind.Empty, node, hasJsxValue: false };
        }
        break;
      case 'Identifier': {
        const binding = bindings?.reference(node);
        if (bindings !== undefined && binding != null) {
          const hasJsxValue = bindings
            .assignedValuesOf(binding)
            .some((assigned) => read(assigned).hasJsxValue);
          return { kind: JsxValueKind.Value, node, hasJsxValue };
        }
        if (node.name === 'undefined') {
          return { kind: JsxValueKind.Empty, node, hasJsxValue: false };
        }
      }
    }
    return { kind: JsxValueKind.Value, node, hasJsxValue: false };
  }

  function factory(source: Node): JsxFactory | null {
    const node = unwrapExpression(source)!;
    if (!factories.has(node)) {
      factories.set(node, readFactory(node, factory));
    }
    return factories.get(node)!;
  }
  return {
    read,
    expressionRoots: (node) => scopedRoots([node], factory),
    factory,
    scopedRoots: (nodes) => scopedRoots(nodes, factory),
  };
}

function readFactory(source: Node, factory: JsxAnalysis['factory']): JsxFactory | null {
  const fn = unwrapExpression(source)!;
  if (!isFunctionLike(fn)) {
    return null;
  }
  const roots = scopedRoots([...fn.params, ...(fn.body === null ? [] : [fn.body])], factory);
  return roots.length === 0 ? null : { fn, roots };
}

function scopedRoots(nodes: readonly Node[], factory: JsxAnalysis['factory']): JsxExpressionRoot[] {
  const roots: JsxExpressionRoot[] = [];
  const visit = (node: unknown): void => {
    if (Array.isArray(node)) {
      node.forEach(visit);
      return;
    }
    if (!isNode(node)) {
      return;
    }
    if (node.type === 'JSXElement' || node.type === 'JSXFragment') {
      roots.push(node);
      return;
    }
    if (isFunctionLike(node)) {
      if (factory(node) !== null) {
        roots.push(node);
      }
      return;
    }
    for (const key of Object.keys(node)) {
      if (key !== 'parent') {
        visit((node as WalkableNode)[key]);
      }
    }
  };
  visit(nodes);
  return roots;
}

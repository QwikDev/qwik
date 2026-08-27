import type { JSXAttributeItem, JSXChild, JSXElement, Node } from 'oxc-parser';
import { OpKind, PropKind, type Op, type Prop } from '../schema';
import { normalizeJsxText } from './ast/jsx-text';
import { normalizeAttributeName, VOID_ELEMENTS } from '../html';
import { InvalidModuleError, UnsupportedError } from '../errors';
import { eventScopeName } from './events';
import { lowerEventAttribute } from './lower-event';
import { lowerTextHole } from './lower-hole';
import { lowerBranch } from './lower-branch';
import { unwrapExpression } from './ast/utils';
import { lowerExpressionValue } from './lower-expr';
import type { LowerContext } from './lower-context';

/**
 * Lowers a JSX render tree to structural ops. Text stays RAW in the plan — each generator folds
 * with its own escaping (SSR streams raw, CSR templates escape). Dynamic arms land per example.
 */
export function lowerJsx(element: JSXElement, ctx: LowerContext): Op {
  const opening = element.openingElement;
  const nameNode = opening.name;
  if (nameNode.type !== 'JSXIdentifier' || !/^[a-z]/.test(nameNode.name)) {
    throw new UnsupportedError('a non-native JSX tag');
  }
  const tag = nameNode.name;
  const props = opening.attributes.map((attribute) => lowerAttribute(attribute, ctx));
  const children: Op[] = [];
  for (const child of element.children) {
    const lowered = lowerChild(child, ctx);
    if (lowered !== null) {
      children.push(lowered);
    }
  }
  if (VOID_ELEMENTS.has(tag) && children.length > 0) {
    throw new InvalidModuleError(
      'invalid-void-children',
      `The void element <${tag}> cannot have children.`,
      [element.start, element.end]
    );
  }
  return {
    op: OpKind.Element,
    tag,
    void: VOID_ELEMENTS.has(tag),
    styleScopedId: null,
    runtimeScope: false,
    props,
    propsEffect: null,
    children,
  };
}

/** `null`/`undefined` literals in a branch arm render nothing. */
function isNullArm(node: Node | null): boolean {
  if (node === null) {
    return false;
  }
  if (node.type === 'Literal' && node.value === null) {
    return true;
  }
  return node.type === 'Identifier' && node.name === 'undefined';
}

function lowerChild(child: JSXChild, ctx: LowerContext): Op | null {
  switch (child.type) {
    case 'JSXText': {
      const text = normalizeJsxText(child.value);
      return text === '' ? null : { op: OpKind.Static, html: text };
    }
    case 'JSXElement':
      return lowerJsx(child, ctx);
    case 'JSXExpressionContainer': {
      const expression = child.expression;
      switch (expression.type) {
        // `{/* comment */}` renders nothing.
        case 'JSXEmptyExpression':
          return null;
        case 'ConditionalExpression': {
          const thenJsx = unwrapExpression(expression.consequent);
          const elseJsx = unwrapExpression(expression.alternate);
          const thenIsJsx = thenJsx?.type === 'JSXElement';
          const elseIsJsx = elseJsx?.type === 'JSXElement';
          if (!thenIsJsx && !elseIsJsx) {
            return lowerTextHole(expression, ctx);
          }
          // A null-literal else drops the arm (like `&&`); a null-literal then stays as an
          // EMPTY then program — legacy never inverts the condition.
          return lowerBranch(
            expression.test,
            {
              expression: isNullArm(thenJsx) ? null : expression.consequent,
              range: [expression.consequent.start, expression.consequent.end],
            },
            {
              expression: isNullArm(elseJsx) ? null : expression.alternate,
              range: [expression.alternate.start, expression.alternate.end],
            },
            ctx
          );
        }
        case 'LogicalExpression': {
          if (expression.operator !== '&&') {
            return lowerTextHole(expression, ctx);
          }

          return lowerBranch(
            expression.left,
            { expression: expression.right, range: [expression.right.start, expression.right.end] },
            null,
            ctx
          );
        }
        default:
          return lowerTextHole(expression, ctx);
      }
    }
    default:
      throw new UnsupportedError(`JSX child ${child.type}`);
  }
}

function lowerAttribute(attribute: JSXAttributeItem, ctx: LowerContext): Prop {
  if (attribute.type !== 'JSXAttribute') {
    throw new UnsupportedError('a JSX spread attribute');
  }
  const nameNode = attribute.name;
  if (nameNode.type !== 'JSXIdentifier') {
    throw new UnsupportedError('a namespaced JSX attribute');
  }
  const authored = nameNode.name;
  const scope = eventScopeName(authored);
  if (scope !== null) {
    return lowerEventAttribute(attribute, ctx, authored, scope);
  }
  const value = attribute.value;
  if (value === null) {
    // Absent authored value = bare attribute (`<main hidden>`).
    return { k: PropKind.Static, name: normalizeAttributeName(authored), value: true };
  }
  switch (value.type) {
    case 'Literal':
      return {
        k: PropKind.Static,
        name: normalizeAttributeName(authored),
        value: value.value,
      };
    case 'JSXExpressionContainer': {
      if (value.expression.type === 'JSXEmptyExpression') {
        return {
          k: PropKind.Static,
          name: normalizeAttributeName(authored),
          value: null,
        };
      }
      const name = normalizeAttributeName(authored);
      return {
        k: PropKind.Dynamic,
        name,
        value: lowerExpressionValue(value.expression, ctx, name),
        effect: null,
      };
    }
    default:
      throw new UnsupportedError('a dynamic JSX attribute value');
  }
}

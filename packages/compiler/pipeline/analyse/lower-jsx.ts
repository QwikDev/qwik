import { OpKind, PropKind, type Op, type Prop } from '../schema';
import type { AstNode } from './ast/ast-types';
import { isNode } from './ast/ast-types';
import { normalizeJsxText } from './ast/jsx-text';
import { normalizeAttributeName, VOID_ELEMENTS } from '../html';
import { InvalidModuleError, UnsupportedError } from '../errors';
import { eventScopeName } from './events';
import { lowerEventAttribute } from './lower-event';
import { lowerTextHole } from './lower-hole';
import type { LowerContext } from './lower-context';

/**
 * Lowers a JSX render tree to structural ops. Text stays RAW in the plan — each generator folds
 * with its own escaping (SSR streams raw, CSR templates escape). Dynamic arms land per example.
 */
export function lowerJsx(element: AstNode, ctx: LowerContext): Op {
  const opening = element.openingElement as AstNode;
  const nameNode = opening.name as AstNode & { name?: string };
  if (nameNode.type !== 'JSXIdentifier' || !/^[a-z]/.test(String(nameNode.name))) {
    throw new UnsupportedError('a non-native JSX tag');
  }
  const tag = String(nameNode.name);
  const props = (opening.attributes as AstNode[]).map((attribute) =>
    lowerAttribute(attribute, ctx)
  );
  const children: Op[] = [];
  for (const child of (element.children as AstNode[]) ?? []) {
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

function lowerChild(child: AstNode, ctx: LowerContext): Op | null {
  switch (child.type) {
    case 'JSXText': {
      const text = normalizeJsxText(String(child.value));
      return text === '' ? null : { op: OpKind.Static, html: text };
    }
    case 'JSXElement':
      return lowerJsx(child, ctx);
    case 'JSXExpressionContainer': {
      // `{/* comment */}` renders nothing.
      if ((child.expression as AstNode).type === 'JSXEmptyExpression') {
        return null;
      }
      return lowerTextHole(child.expression as AstNode, ctx);
    }
    default:
      throw new UnsupportedError(`JSX child ${child.type}`);
  }
}

function lowerAttribute(attribute: AstNode, ctx: LowerContext): Prop {
  if (attribute.type !== 'JSXAttribute') {
    throw new UnsupportedError('a JSX spread attribute');
  }
  const nameNode = attribute.name as AstNode & { name?: string };
  if (nameNode.type !== 'JSXIdentifier') {
    throw new UnsupportedError('a namespaced JSX attribute');
  }
  const authored = String(nameNode.name);
  const scope = eventScopeName(authored);
  if (scope !== null) {
    return lowerEventAttribute(attribute, ctx, authored, scope);
  }
  const value = attribute.value;
  if (
    value != null &&
    !(isNode(value) && value.type === 'Literal' && typeof value.value === 'string')
  ) {
    throw new UnsupportedError('a dynamic JSX attribute value');
  }
  return {
    k: PropKind.Static,
    name: normalizeAttributeName(authored),
    // Absent authored value = bare attribute (`<main hidden>`).
    value: value == null ? true : (value.value as string),
  };
}

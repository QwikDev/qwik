import { OpKind, PropKind, type Op, type Prop } from '../schema';
import type { AstNode } from './ast/ast-types';
import { isNode } from './ast/ast-types';
import { normalizeAttributeName, VOID_ELEMENTS } from '../html';
import { InvalidModuleError, UnsupportedError } from '../errors';

/**
 * Lowers fully static JSX to structural element ops. Text stays RAW in the plan — each generator
 * folds with its own escaping (SSR streams raw, CSR templates escape).
 */
export function lowerStaticJsx(element: AstNode): Op {
  const opening = element.openingElement as AstNode;
  const nameNode = opening.name as AstNode & { name?: string };
  if (nameNode.type !== 'JSXIdentifier' || !/^[a-z]/.test(String(nameNode.name))) {
    throw new UnsupportedError('a non-native JSX tag');
  }
  const tag = String(nameNode.name);
  const props = (opening.attributes as AstNode[]).map(lowerStaticAttribute);
  const children: Op[] = [];
  for (const child of (element.children as AstNode[]) ?? []) {
    const lowered = lowerStaticChild(child);
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

function lowerStaticChild(child: AstNode): Op | null {
  switch (child.type) {
    case 'JSXText': {
      const text = normalizeJsxText(String(child.value));
      return text === '' ? null : { op: OpKind.Static, html: text };
    }
    case 'JSXElement':
      return lowerStaticJsx(child);
    case 'JSXExpressionContainer': {
      // `{/* comment */}` renders nothing; real expressions are dynamic holes, not static HTML.
      if ((child.expression as AstNode).type === 'JSXEmptyExpression') {
        return null;
      }
      throw new UnsupportedError('a dynamic JSX child expression');
    }
    default:
      throw new UnsupportedError(`JSX child ${child.type}`);
  }
}

function lowerStaticAttribute(attribute: AstNode): Prop {
  if (attribute.type !== 'JSXAttribute') {
    throw new UnsupportedError('a JSX spread attribute');
  }
  const nameNode = attribute.name as AstNode & { name?: string };
  if (nameNode.type !== 'JSXIdentifier') {
    throw new UnsupportedError('a namespaced JSX attribute');
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
    name: normalizeAttributeName(String(nameNode.name)),
    // Absent authored value = bare attribute (`<main hidden>`).
    value: value == null ? true : (value.value as string),
  };
}

/** JSX whitespace normalization: whole-whitespace lines vanish, interior runs join with one space. */
export function normalizeJsxText(value: string): string {
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
    if (i !== 0) {
      line = line.replace(/^ +/, '');
    }
    if (i !== lines.length - 1) {
      line = line.replace(/ +$/, '');
    }
    if (line) {
      text += line;
      if (i !== lastNonEmptyLine) {
        text += ' ';
      }
    }
  }
  return text;
}

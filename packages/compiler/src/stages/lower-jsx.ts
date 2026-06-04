import {
  getJsxName,
  getStaticExpressionValue,
  isEventProp,
  isNativeTag,
  normalizeJsxText,
} from '../ast-utils';
import { createDiagnostic } from '../diagnostics';
import type { AnyNode, CompilerContext, FragmentNode, PropRecord, RenderNode } from '../types';

export function lowerStaticJsxToIr(ctx: CompilerContext) {
  for (const component of ctx.manifest.components) {
    if (component.params.length > 0) {
      component.supported = false;
      ctx.manifest.diagnostics.push(
        createDiagnostic(
          ctx.input.path,
          `Props are not supported yet in vdomless static components (${formatExportName(component.exportName)}).`
        )
      );
      continue;
    }
    if (component.jsx === null) {
      component.supported = false;
      ctx.manifest.diagnostics.push(
        createDiagnostic(
          ctx.input.path,
          `Expected ${formatExportName(component.exportName)} to return static JSX.`
        )
      );
      continue;
    }
    component.root = lowerJsxNode(ctx, component.jsx);
  }
}

function lowerJsxNode(ctx: CompilerContext, node: AnyNode): RenderNode {
  if (node.type === 'JSXElement') {
    return lowerJsxElement(ctx, node);
  }
  if (node.type === 'JSXFragment') {
    return lowerJsxFragment(ctx, node);
  }
  return {
    kind: 'expr',
    role: 'child',
    reason: `Unsupported JSX node: ${node.type}.`,
  };
}

function lowerJsxFragment(ctx: CompilerContext, node: AnyNode): FragmentNode {
  return {
    kind: 'fragment',
    children: lowerJsxChildren(ctx, node.children ?? []),
  };
}

function lowerJsxElement(ctx: CompilerContext, node: AnyNode): RenderNode {
  const opening = node.openingElement ?? node.opening;
  const name = getJsxName(opening?.name);
  if (!name) {
    return {
      kind: 'expr',
      role: 'child',
      reason: 'Only simple JSX element names are supported in vdomless static components.',
    };
  }
  if (!isNativeTag(name)) {
    return {
      kind: 'expr',
      role: 'child',
      reason: `Component JSX <${name} /> is not supported yet in vdomless static components.`,
    };
  }

  return {
    kind: 'element',
    tag: name,
    props: lowerJsxAttributes(ctx, opening?.attributes ?? []),
    children: lowerJsxChildren(ctx, node.children ?? []),
  };
}

function lowerJsxAttributes(ctx: CompilerContext, attributes: AnyNode[]): PropRecord[] {
  const props: PropRecord[] = [];
  for (const attr of attributes) {
    if (attr.type === 'JSXSpreadAttribute') {
      props.push({
        name: '__unsupported_spread',
        value: null,
      });
      ctx.manifest.diagnostics.push(
        createDiagnostic(ctx.input.path, 'JSX spread props are not supported yet.')
      );
      continue;
    }
    if (attr.type !== 'JSXAttribute') {
      continue;
    }

    let name = getJsxName(attr.name);
    if (!name) {
      ctx.manifest.diagnostics.push(
        createDiagnostic(ctx.input.path, 'Only simple JSX attribute names are supported.')
      );
      continue;
    }
    if (name === 'className') {
      name = 'class';
    }
    if (isEventProp(name)) {
      ctx.manifest.diagnostics.push(
        createDiagnostic(ctx.input.path, `Event prop "${name}" is not supported yet.`)
      );
      continue;
    }

    const value = lowerStaticAttributeValue(ctx, attr.value, name);
    if (value.supported) {
      props.push({
        name,
        value: value.value,
      });
    }
  }
  return props;
}

function lowerStaticAttributeValue(
  ctx: CompilerContext,
  valueNode: AnyNode | null | undefined,
  name: string
): { supported: true; value: PropRecord['value'] } | { supported: false } {
  if (!valueNode) {
    return { supported: true, value: true };
  }
  if (valueNode.type === 'StringLiteral' || valueNode.type === 'Literal') {
    return { supported: true, value: valueNode.value };
  }
  if (valueNode.type === 'JSXExpressionContainer') {
    const expr = valueNode.expression;
    const value = getStaticExpressionValue(expr);
    if (value.supported) {
      return value;
    }
  }

  ctx.manifest.diagnostics.push(
    createDiagnostic(ctx.input.path, `Dynamic JSX attribute "${name}" is not supported yet.`)
  );
  return { supported: false };
}

function lowerJsxChildren(ctx: CompilerContext, children: AnyNode[]): RenderNode[] {
  const nodes: RenderNode[] = [];
  for (const child of children) {
    if (child.type === 'JSXText') {
      const value = normalizeJsxText(child.value ?? child.raw ?? '');
      if (value) {
        nodes.push({ kind: 'text', value });
      }
      continue;
    }
    if (child.type === 'JSXElement' || child.type === 'JSXFragment') {
      nodes.push(lowerJsxNode(ctx, child));
      continue;
    }
    if (child.type === 'JSXExpressionContainer') {
      if (child.expression?.type === 'JSXEmptyExpression') {
        continue;
      }
      nodes.push({
        kind: 'expr',
        role: 'child',
        reason: 'Dynamic JSX children are not supported yet.',
      });
      continue;
    }
    nodes.push({
      kind: 'expr',
      role: 'child',
      reason: `Unsupported JSX child: ${child.type}.`,
    });
  }
  return nodes;
}

function formatExportName(name: string) {
  return name === 'default' ? 'default export' : `export "${name}"`;
}

import {
  getJsxAttributeName,
  getJsxName,
  getRange,
  getSignalValueSourceName,
  getStaticExpressionValue,
  isEventProp,
  isNativeTag,
  isFunctionLike,
  jsxEventToHtmlAttribute,
  normalizeJsxText,
  unwrapExpression,
} from '../ast-utils';
import { createDiagnostic } from '../diagnostics';
import type {
  JSXAttributeItem,
  JSXAttributeValue,
  JSXChild,
  JSXElement,
  JSXFragment,
} from 'oxc-parser';
import type {
  AstJsxNode,
  CompilerContext,
  DynamicBinding,
  FragmentNode,
  PropRecord,
  RenderNode,
  SourceRange,
} from '../types';

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

function lowerJsxNode(ctx: CompilerContext, node: AstJsxNode): RenderNode {
  if (node.type === 'JSXElement') {
    return lowerJsxElement(ctx, node);
  }
  return lowerJsxFragment(ctx, node);
}

function lowerJsxFragment(ctx: CompilerContext, node: JSXFragment): FragmentNode {
  return {
    kind: 'fragment',
    children: lowerJsxChildren(ctx, node.children),
  };
}

function lowerJsxElement(ctx: CompilerContext, node: JSXElement): RenderNode {
  const opening = node.openingElement;
  const name = getJsxName(opening.name);
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
    props: lowerJsxAttributes(ctx, opening.attributes),
    children: lowerJsxChildren(ctx, node.children),
  };
}

function lowerJsxAttributes(ctx: CompilerContext, attributes: JSXAttributeItem[]): PropRecord[] {
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

    let name = getJsxAttributeName(attr.name);
    if (!name) {
      ctx.manifest.diagnostics.push(
        createDiagnostic(ctx.input.path, 'Only simple JSX attribute names are supported.')
      );
      continue;
    }
    const eventName = jsxEventToHtmlAttribute(name);
    if (eventName) {
      const expr =
        attr.value?.type === 'JSXExpressionContainer'
          ? unwrapExpression(attr.value.expression)
          : null;
      if (isFunctionLike(expr)) {
        const segment = findEventSegment(ctx, name, getRange(attr));
        if (segment) {
          props.push({
            name: eventName,
            value: null,
            qrlSegmentId: segment.id,
          });
        }
        continue;
      }
      ctx.manifest.diagnostics.push(
        createDiagnostic(ctx.input.path, `Event prop "${name}" must be an inline function.`)
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

    const dynamicValue = lowerDynamicSourceAttributeValue(ctx, attr.value);
    if (dynamicValue) {
      props.push({
        name,
        value: null,
        binding: dynamicValue,
      });
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

function lowerDynamicSourceAttributeValue(
  ctx: CompilerContext,
  valueNode: JSXAttributeValue | null
): Extract<DynamicBinding, { kind: 'source' }> | null {
  if (valueNode?.type !== 'JSXExpressionContainer') {
    return null;
  }
  const expression = unwrapExpression(valueNode.expression);
  const sourceName = getSignalValueSourceName(expression);
  const expressionRange = getRange(expression);
  if (sourceName === null || expressionRange === null) {
    return null;
  }
  return {
    kind: 'source',
    sourceName,
    expressionRange,
  };
}

function findEventSegment(ctx: CompilerContext, ctxName: string, range: PropRange) {
  return ctx.manifest.segments.find(
    (segment) =>
      segment.kind === 'eventHandler' &&
      segment.ctxName === ctxName &&
      rangesEqual(segment.range, range)
  );
}

type PropRange = ReturnType<typeof getRange>;

function rangesEqual(left: PropRange, right: PropRange): boolean {
  return !!left && !!right && left[0] === right[0] && left[1] === right[1];
}

function lowerStaticAttributeValue(
  ctx: CompilerContext,
  valueNode: JSXAttributeValue | null,
  name: string
): { supported: true; value: PropRecord['value'] } | { supported: false } {
  if (!valueNode) {
    return { supported: true, value: true };
  }
  if (valueNode.type === 'Literal') {
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

function lowerJsxChildren(ctx: CompilerContext, children: JSXChild[]): RenderNode[] {
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
      const expression = unwrapExpression(child.expression);
      const expressionRange = getRange(expression);
      if (expressionRange) {
        const binding = createDynamicTextBinding(ctx, expression, expressionRange);
        if (binding) {
          nodes.push({
            kind: 'dynamicText',
            expressionRange,
            binding,
          });
          continue;
        }
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

function createDynamicTextBinding(
  ctx: CompilerContext,
  expression: unknown,
  expressionRange: SourceRange
): DynamicBinding | null {
  const sourceName = getSignalValueSourceName(expression);
  if (sourceName !== null) {
    return {
      kind: 'source',
      sourceName,
      expressionRange,
    };
  }
  const segment = findTextSegment(ctx, expressionRange);
  return segment
    ? {
        kind: 'expression',
        expressionRange,
        qrlSegmentId: segment.id,
      }
    : null;
}

function findTextSegment(ctx: CompilerContext, range: SourceRange) {
  return ctx.manifest.segments.find(
    (segment) => segment.kind === 'jsxText' && rangesEqual(segment.range, range)
  );
}

function formatExportName(name: string) {
  return name === 'default' ? 'default export' : `export "${name}"`;
}

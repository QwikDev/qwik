import {
  getJsxAttributeName,
  getJsxName,
  getRange,
  getSignalValueSourceName,
  getStaticExpressionValue,
  getStaticSourceTextExpressionParts,
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
  ComponentPropRecord,
  CompilerContext,
  DynamicBinding,
  FragmentNode,
  PropRecord,
  RenderNode,
  SourceRange,
  BranchNode,
} from '../types';

export function lowerStaticJsxToIr(ctx: CompilerContext) {
  for (const component of ctx.manifest.components) {
    const propsName = getPropsParamName(ctx, component.params, component.exportName);
    if (propsName === false) {
      component.supported = false;
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
    component.root = lowerJsxNode(ctx, component.jsx, propsName);
  }
}

function getPropsParamName(
  ctx: CompilerContext,
  params: Array<{ name: string | null }>,
  exportName: string
): string | null | false {
  if (params.length === 0) {
    return null;
  }
  if (params.length === 1 && params[0].name !== null) {
    return params[0].name;
  }
  ctx.manifest.diagnostics.push(
    createDiagnostic(
      ctx.input.path,
      `Only one simple props parameter is supported in vdomless static components (${formatExportName(exportName)}).`
    )
  );
  return false;
}

function lowerJsxNode(
  ctx: CompilerContext,
  node: AstJsxNode,
  propsName: string | null
): RenderNode {
  if (node.type === 'JSXElement') {
    return lowerJsxElement(ctx, node, propsName);
  }
  return lowerJsxFragment(ctx, node, propsName);
}

function lowerJsxFragment(
  ctx: CompilerContext,
  node: JSXFragment,
  propsName: string | null
): FragmentNode {
  return {
    kind: 'fragment',
    children: lowerJsxChildren(ctx, node.children, propsName),
  };
}

function lowerJsxElement(
  ctx: CompilerContext,
  node: JSXElement,
  propsName: string | null
): RenderNode {
  const opening = node.openingElement;
  const name = getJsxName(opening.name);
  if (!name) {
    return unsupportedNode(
      ctx,
      'Only simple JSX element names are supported in vdomless static components.'
    );
  }
  if (!isNativeTag(name)) {
    if (isComponentTagName(name)) {
      return {
        kind: 'component',
        name,
        props: lowerComponentAttributes(ctx, opening.attributes),
        children: lowerJsxChildren(ctx, node.children, propsName),
      };
    }
    return unsupportedNode(
      ctx,
      `Only PascalCase component JSX names are supported in vdomless static components (${name}).`
    );
  }

  return {
    kind: 'element',
    tag: name,
    props: lowerJsxAttributes(ctx, opening.attributes),
    children: lowerJsxChildren(ctx, node.children, propsName),
  };
}

function isComponentTagName(name: string): boolean {
  return /^[A-Z][A-Za-z0-9_$]*$/.test(name);
}

function lowerJsxAttributes(ctx: CompilerContext, attributes: JSXAttributeItem[]): PropRecord[] {
  const props: PropRecord[] = [];
  for (const attr of attributes) {
    if (attr.type === 'JSXSpreadAttribute') {
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

function lowerComponentAttributes(
  ctx: CompilerContext,
  attributes: JSXAttributeItem[]
): ComponentPropRecord[] {
  const props: ComponentPropRecord[] = [];
  for (const attr of attributes) {
    if (attr.type === 'JSXSpreadAttribute') {
      ctx.manifest.diagnostics.push(
        createDiagnostic(ctx.input.path, 'JSX spread props are not supported yet.')
      );
      continue;
    }
    if (attr.type !== 'JSXAttribute') {
      continue;
    }

    const name = getJsxAttributeName(attr.name);
    if (!name) {
      ctx.manifest.diagnostics.push(
        createDiagnostic(ctx.input.path, 'Only simple JSX attribute names are supported.')
      );
      continue;
    }
    const value = lowerComponentAttributeValue(ctx, attr.value, name);
    if (value !== null) {
      props.push({ name, ...value });
    }
  }
  return props;
}

function lowerComponentAttributeValue(
  ctx: CompilerContext,
  valueNode: JSXAttributeValue | null,
  name: string
): Pick<ComponentPropRecord, 'value' | 'expressionRange'> | null {
  if (!valueNode) {
    return { value: true };
  }
  if (valueNode.type === 'Literal') {
    return { value: valueNode.value };
  }
  if (valueNode.type === 'JSXExpressionContainer') {
    if (valueNode.expression?.type === 'JSXEmptyExpression') {
      ctx.manifest.diagnostics.push(
        createDiagnostic(ctx.input.path, `Empty JSX attribute "${name}" is not supported yet.`)
      );
      return null;
    }
    const expr = unwrapExpression(valueNode.expression);
    const staticValue = getStaticExpressionValue(expr);
    if (staticValue.supported) {
      return { value: staticValue.value };
    }
    const expressionRange = getRange(expr);
    if (expressionRange !== null) {
      return { expressionRange };
    }
  }

  ctx.manifest.diagnostics.push(
    createDiagnostic(ctx.input.path, `Dynamic JSX attribute "${name}" is not supported yet.`)
  );
  return null;
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

function lowerJsxChildren(
  ctx: CompilerContext,
  children: JSXChild[],
  propsName: string | null
): RenderNode[] {
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
      nodes.push(lowerJsxNode(ctx, child, propsName));
      continue;
    }
    if (child.type === 'JSXExpressionContainer') {
      if (child.expression?.type === 'JSXEmptyExpression') {
        continue;
      }
      const expression = unwrapExpression(child.expression);
      if (isPropsChildrenExpression(expression, propsName)) {
        nodes.push({ kind: 'children', propsName: propsName! });
        continue;
      }
      const expressionRange = getRange(expression);
      if (expressionRange) {
        const branch = lowerBranchExpression(ctx, expression, expressionRange, propsName);
        if (branch) {
          nodes.push(branch);
          continue;
        }
        const textParts = lowerStaticSourceTextExpression(expression);
        if (textParts) {
          nodes.push(...textParts);
          continue;
        }
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
      ctx.manifest.diagnostics.push(
        createDiagnostic(ctx.input.path, 'Dynamic JSX children are not supported yet.')
      );
      continue;
    }
    ctx.manifest.diagnostics.push(
      createDiagnostic(ctx.input.path, `Unsupported JSX child: ${child.type}.`)
    );
  }
  return nodes;
}

function lowerBranchExpression(
  ctx: CompilerContext,
  expression: unknown,
  expressionRange: SourceRange,
  propsName: string | null
): BranchNode | null {
  const expr = unwrapExpression(expression);
  if (!isAstNode(expr)) {
    return null;
  }
  if (expr.type === 'ConditionalExpression') {
    const conditionRange = getRange(expr.test);
    const consequentRange = getRange(expr.consequent);
    const alternateRange = getRange(expr.alternate);
    if (conditionRange === null || consequentRange === null || alternateRange === null) {
      return null;
    }
    const conditionSegment = findBranchSegment(ctx, 'branchCondition', conditionRange);
    const thenSegment = findBranchSegment(ctx, 'branchRender', consequentRange);
    const elseSegment = isEmptyBranchExpression(expr.alternate)
      ? null
      : findBranchSegment(ctx, 'branchRender', alternateRange);
    if (
      !conditionSegment ||
      !thenSegment ||
      (!isEmptyBranchExpression(expr.alternate) && !elseSegment)
    ) {
      return null;
    }
    return {
      kind: 'branch',
      expressionRange,
      conditionRange,
      conditionSegmentId: conditionSegment.id,
      thenSegmentId: thenSegment.id,
      elseSegmentId: elseSegment?.id,
      thenChildren: lowerExpressionChildren(ctx, expr.consequent, propsName),
      elseChildren: lowerExpressionChildren(ctx, expr.alternate, propsName),
    };
  }
  if (expr.type === 'LogicalExpression' && expr.operator === '&&') {
    const conditionRange = getRange(expr.left);
    const consequentRange = getRange(expr.right);
    if (conditionRange === null || consequentRange === null) {
      return null;
    }
    const conditionSegment = findBranchSegment(ctx, 'branchCondition', conditionRange);
    const thenSegment = findBranchSegment(ctx, 'branchRender', consequentRange);
    if (!conditionSegment || !thenSegment) {
      return null;
    }
    return {
      kind: 'branch',
      expressionRange,
      conditionRange,
      conditionSegmentId: conditionSegment.id,
      thenSegmentId: thenSegment.id,
      thenChildren: lowerExpressionChildren(ctx, expr.right, propsName),
      elseChildren: [],
    };
  }
  return null;
}

function lowerExpressionChildren(
  ctx: CompilerContext,
  expression: unknown,
  propsName: string | null
): RenderNode[] {
  const expr = unwrapExpression(expression);
  if (!isAstNode(expr) || isEmptyBranchExpression(expr)) {
    return [];
  }
  if (isPropsChildrenExpression(expr, propsName)) {
    return [{ kind: 'children', propsName: propsName! }];
  }
  if (expr.type === 'JSXElement' || expr.type === 'JSXFragment') {
    return [lowerJsxNode(ctx, expr, propsName)];
  }
  const range = getRange(expr);
  if (range !== null) {
    const branch = lowerBranchExpression(ctx, expr, range, propsName);
    if (branch) {
      return [branch];
    }
    const textParts = lowerStaticSourceTextExpression(expr);
    if (textParts) {
      return textParts;
    }
    const binding = createDynamicTextBinding(ctx, expr, range);
    if (binding) {
      return [
        {
          kind: 'dynamicText',
          expressionRange: range,
          binding,
        },
      ];
    }
  }
  if (expr.type === 'Literal') {
    const value = expr.value;
    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'bigint') {
      return [{ kind: 'text', value: String(value) }];
    }
    return [];
  }
  ctx.manifest.diagnostics.push(
    createDiagnostic(ctx.input.path, 'Dynamic JSX branch children are not supported yet.')
  );
  return [];
}

function lowerStaticSourceTextExpression(expression: unknown): RenderNode[] | null {
  const parts = getStaticSourceTextExpressionParts(expression);
  if (!parts) {
    return null;
  }
  return mergeAdjacentTextNodes(
    parts.map((part): RenderNode => {
      if (part.kind === 'text') {
        return { kind: 'text', value: part.value };
      }
      return {
        kind: 'dynamicText',
        expressionRange: part.expressionRange,
        binding: {
          kind: 'source',
          sourceName: part.sourceName,
          expressionRange: part.expressionRange,
        },
      };
    })
  );
}

function mergeAdjacentTextNodes(nodes: RenderNode[]): RenderNode[] {
  const merged: RenderNode[] = [];
  for (const node of nodes) {
    const previous = merged[merged.length - 1];
    if (previous?.kind === 'text' && node.kind === 'text') {
      previous.value += node.value;
    } else {
      merged.push(node);
    }
  }
  return merged;
}

function isPropsChildrenExpression(expression: unknown, propsName: string | null): boolean {
  const expr = unwrapExpression(expression);
  if (propsName === null || !isAstNode(expr) || expr.type !== 'MemberExpression') {
    return false;
  }
  if (expr.computed) {
    return false;
  }
  const object = expr.object;
  const property = expr.property;
  return (
    isAstNode(object) &&
    object.type === 'Identifier' &&
    object.name === propsName &&
    isAstNode(property) &&
    property.type === 'Identifier' &&
    property.name === 'children'
  );
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

function findBranchSegment(
  ctx: CompilerContext,
  kind: 'branchCondition' | 'branchRender',
  range: SourceRange
) {
  return ctx.manifest.segments.find(
    (segment) => segment.kind === kind && rangesEqual(segment.range, range)
  );
}

function findTextSegment(ctx: CompilerContext, range: SourceRange) {
  return ctx.manifest.segments.find(
    (segment) => segment.kind === 'jsxText' && rangesEqual(segment.range, range)
  );
}

function isEmptyBranchExpression(node: unknown): boolean {
  const expr = unwrapExpression(node);
  if (!isAstNode(expr)) {
    return true;
  }
  if (expr.type === 'Literal') {
    return expr.value === null || expr.value === false || expr.value === true;
  }
  return false;
}

function isAstNode(node: unknown): node is { type: string; [key: string]: any } {
  return (
    !!node && typeof node === 'object' && 'type' in node && typeof (node as any).type === 'string'
  );
}

function unsupportedNode(ctx: CompilerContext, message: string): FragmentNode {
  ctx.manifest.diagnostics.push(createDiagnostic(ctx.input.path, message));
  return { kind: 'fragment', children: [] };
}

function formatExportName(name: string) {
  return name === 'default' ? 'default export' : `export "${name}"`;
}

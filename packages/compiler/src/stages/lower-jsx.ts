import {
  getJsxAttributeName,
  getJsxName,
  getIdentifierName,
  getRange,
  getSignalValueSourceName,
  getStaticExpressionValue,
  getStaticSourceTextExpressionParts,
  isCallExpression,
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
  ComponentNamedPropRecord,
  ComponentRecord,
  ComponentSlotRecord,
  ComponentPropRecord,
  CompilerContext,
  DynamicBinding,
  FragmentNode,
  NamedPropRecord,
  PropRecord,
  RenderNode,
  SourceRange,
  BranchNode,
  ForNode,
  SlotNode,
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
    for (const value of component.jsxValues) {
      value.root = lowerJsxNode(ctx, value.jsx, propsName, component);
    }
    component.root = lowerJsxNode(ctx, component.jsx, propsName, component);
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
  if (params.length === 1) {
    return params[0].name;
  }
  ctx.manifest.diagnostics.push(
    createDiagnostic(
      ctx.input.path,
      `Only one props parameter is supported in vdomless static components (${formatExportName(exportName)}).`
    )
  );
  return false;
}

function lowerJsxNode(
  ctx: CompilerContext,
  node: AstJsxNode,
  propsName: string | null,
  component: ComponentRecord
): RenderNode {
  if (node.type === 'JSXElement') {
    return lowerJsxElement(ctx, node, propsName, component);
  }
  return lowerJsxFragment(ctx, node, propsName, component);
}

function lowerJsxFragment(
  ctx: CompilerContext,
  node: JSXFragment,
  propsName: string | null,
  component: ComponentRecord
): FragmentNode {
  return {
    kind: 'fragment',
    children: lowerJsxChildren(ctx, node.children, propsName, component),
  };
}

function lowerJsxElement(
  ctx: CompilerContext,
  node: JSXElement,
  propsName: string | null,
  component: ComponentRecord
): RenderNode {
  const opening = node.openingElement;
  const name = getJsxName(opening.name);
  if (!name) {
    return unsupportedNode(
      ctx,
      'Only simple JSX element names are supported in vdomless static components.'
    );
  }
  if (name === 'Slot') {
    return lowerSlotElement(ctx, node, propsName, component);
  }
  if (!isNativeTag(name)) {
    if (isComponentTagName(name)) {
      return {
        kind: 'component',
        name,
        props: lowerComponentAttributes(ctx, opening.attributes),
        slots: lowerComponentSlots(ctx, node.children, propsName, component),
      };
    }
    return unsupportedNode(
      ctx,
      `Only PascalCase component JSX names are supported in vdomless static components (${name}).`
    );
  }

  const propsSegment = findDomPropsSegment(ctx, getRange(opening));
  return {
    kind: 'element',
    tag: name,
    propsSegmentId: propsSegment?.id ?? null,
    props: lowerJsxAttributes(ctx, opening.attributes, propsSegment !== undefined),
    children: lowerJsxChildren(ctx, node.children, propsName, component),
  };
}

function lowerSlotElement(
  ctx: CompilerContext,
  node: JSXElement,
  propsName: string | null,
  component: ComponentRecord
): SlotNode {
  const name = getStaticSlotName(ctx, node.openingElement.attributes);
  const children = lowerJsxChildren(ctx, node.children, propsName, component);
  const range = children.length > 0 ? getRange(node) : null;
  const segment = range === null ? null : findSlotRenderSegment(ctx, range);
  return {
    kind: 'slot',
    name,
    fallbackSegmentId: children.length > 0 ? (segment?.id ?? null) : null,
    children,
  };
}

function lowerComponentSlots(
  ctx: CompilerContext,
  children: JSXChild[],
  propsName: string | null,
  component: ComponentRecord
): ComponentSlotRecord[] {
  const slots: ComponentSlotRecord[] = [];
  for (const child of children) {
    if (isEmptyJsxChild(child)) {
      continue;
    }
    const slotName = getProjectionSlotName(ctx, child);
    const rendered = lowerJsxChildren(ctx, [child], propsName, component);
    if (rendered.length === 0) {
      continue;
    }
    const range = getRange(child);
    const segment = range === null ? null : findSlotRenderSegment(ctx, range);
    if (segment == null) {
      continue;
    }
    slots.push({
      name: slotName,
      segmentId: segment.id,
      children: rendered,
    });
  }
  return slots;
}

function isComponentTagName(name: string): boolean {
  return /^[A-Z][A-Za-z0-9_$]*$/.test(name);
}

function getStaticSlotName(ctx: CompilerContext, attributes: JSXAttributeItem[]): string {
  for (const attr of attributes) {
    if (attr.type !== 'JSXAttribute' || getJsxAttributeName(attr.name) !== 'name') {
      continue;
    }
    const name = readStaticSlotAttribute(attr.value);
    if (name !== null) {
      return name;
    }
    ctx.manifest.diagnostics.push(
      createDiagnostic(ctx.input.path, 'Dynamic Slot name is not supported in vdomless yet.')
    );
    return '';
  }
  return '';
}

function getProjectionSlotName(ctx: CompilerContext, child: JSXChild): string {
  if (child.type !== 'JSXElement') {
    return '';
  }
  for (const attr of child.openingElement.attributes) {
    if (attr.type !== 'JSXAttribute' || getJsxAttributeName(attr.name) !== 'q:slot') {
      continue;
    }
    const name = readStaticSlotAttribute(attr.value);
    if (name !== null) {
      return name;
    }
    ctx.manifest.diagnostics.push(
      createDiagnostic(ctx.input.path, 'Dynamic q:slot is not supported in vdomless yet.')
    );
    return '';
  }
  return '';
}

function readStaticSlotAttribute(valueNode: JSXAttributeValue | null): string | null {
  if (!valueNode) {
    return '';
  }
  if (valueNode.type === 'Literal' && typeof valueNode.value === 'string') {
    return valueNode.value;
  }
  if (valueNode.type === 'JSXExpressionContainer') {
    const value = getStaticExpressionValue(unwrapExpression(valueNode.expression));
    return value.supported && typeof value.value === 'string' ? value.value : null;
  }
  return null;
}

function isEmptyJsxChild(child: JSXChild): boolean {
  if (child.type === 'JSXText') {
    return normalizeJsxText(child.value ?? child.raw ?? '') === '';
  }
  return child.type === 'JSXExpressionContainer' && child.expression?.type === 'JSXEmptyExpression';
}

function lowerJsxAttributes(
  ctx: CompilerContext,
  attributes: JSXAttributeItem[],
  forcePropsObject = false
): PropRecord[] {
  if (forcePropsObject || attributes.some((attr) => attr.type === 'JSXSpreadAttribute')) {
    return lowerSpreadJsxAttributes(ctx, attributes);
  }

  const props: PropRecord[] = [];
  for (const attr of attributes) {
    if (attr.type !== 'JSXAttribute') {
      continue;
    }

    const originalName = getJsxAttributeName(attr.name);
    if (!originalName) {
      ctx.manifest.diagnostics.push(
        createDiagnostic(ctx.input.path, 'Only simple JSX attribute names are supported.')
      );
      continue;
    }
    if (originalName === 'key') {
      continue;
    }
    let name = originalName;
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
            kind: 'named',
            name: eventName,
            value: null,
            qrlSegmentId: segment.id,
          });
        }
        continue;
      }
      const expressionRange = getDynamicExpressionRange(expr);
      if (expressionRange !== null) {
        props.push({
          kind: 'named',
          name: eventName,
          value: null,
          expressionRange,
        });
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
        kind: 'named',
        name,
        value: null,
        binding: dynamicValue,
      });
      continue;
    }

    const value = lowerStaticAttributeValue(attr.value);
    if (value.supported) {
      props.push({
        kind: 'named',
        name,
        value: value.value,
      });
      continue;
    }
    const expressionValue = lowerDynamicExpressionAttributeValue(ctx, originalName, attr.value);
    if (expressionValue) {
      props.push({
        kind: 'named',
        name,
        value: null,
        binding: expressionValue,
      });
      continue;
    }
    ctx.manifest.diagnostics.push(
      createDiagnostic(ctx.input.path, `Dynamic JSX attribute "${name}" is not supported yet.`)
    );
  }
  return props;
}

function lowerSpreadJsxAttributes(
  ctx: CompilerContext,
  attributes: JSXAttributeItem[]
): PropRecord[] {
  const props: PropRecord[] = [];
  for (const attr of attributes) {
    if (attr.type === 'JSXSpreadAttribute') {
      const expressionRange = getRange(attr.argument);
      if (expressionRange !== null) {
        props.push({
          kind: 'spread',
          expressionRange,
        });
      }
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
    if (name === 'key') {
      continue;
    }

    const eventName = jsxEventToHtmlAttribute(name);
    if (eventName) {
      const expr =
        attr.value?.type === 'JSXExpressionContainer'
          ? unwrapExpression(attr.value.expression)
          : null;
      if (isFunctionLike(expr)) {
        const segment = findJsxFunctionPropSegment(ctx, name, getRange(attr));
        if (segment) {
          props.push({
            kind: 'named',
            name,
            value: null,
            qrlSegmentId: segment.id,
          });
        }
        continue;
      }
      const expressionRange = getDynamicExpressionRange(expr);
      if (expressionRange !== null) {
        props.push({
          kind: 'named',
          name,
          value: null,
          expressionRange,
        });
        continue;
      }
      ctx.manifest.diagnostics.push(
        createDiagnostic(ctx.input.path, `Event prop "${name}" must be an expression.`)
      );
      continue;
    }

    if (isEventProp(name)) {
      ctx.manifest.diagnostics.push(
        createDiagnostic(ctx.input.path, `Event prop "${name}" is not supported yet.`)
      );
      continue;
    }

    const value = lowerObjectAttributeValue(ctx, attr.value, name);
    if (value !== null) {
      props.push({
        kind: 'named',
        name,
        ...value,
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
      const expressionRange = getRange(attr.argument);
      if (expressionRange !== null) {
        props.push({
          kind: 'spread',
          expressionRange,
        });
      }
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
    if (name === 'key') {
      continue;
    }
    const expr =
      attr.value?.type === 'JSXExpressionContainer'
        ? unwrapExpression(attr.value.expression)
        : null;
    if (name.endsWith('$') && isFunctionLike(expr)) {
      const segment = findJsxFunctionPropSegment(ctx, name, getRange(attr));
      if (segment) {
        props.push({
          kind: 'named',
          name,
          qrlSegmentId: segment.id,
        });
      }
      continue;
    }
    const value = lowerComponentAttributeValue(ctx, attr.value, name);
    if (value !== null) {
      props.push({ kind: 'named', name, ...value });
    }
  }
  return props;
}

function lowerComponentAttributeValue(
  ctx: CompilerContext,
  valueNode: JSXAttributeValue | null,
  name: string
): Pick<ComponentNamedPropRecord, 'value' | 'expressionRange'> | null {
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

function lowerDynamicExpressionAttributeValue(
  ctx: CompilerContext,
  name: string,
  valueNode: JSXAttributeValue | null
): Extract<DynamicBinding, { kind: 'expression' }> | null {
  if (valueNode?.type !== 'JSXExpressionContainer') {
    return null;
  }
  const expression = unwrapExpression(valueNode.expression);
  const expressionRange = getRange(expression);
  if (expressionRange === null) {
    return null;
  }
  const segment = findJsxExpressionPropSegment(ctx, name, expressionRange);
  return segment
    ? {
        kind: 'expression',
        expressionRange,
        qrlSegmentId: segment.id,
      }
    : null;
}

function lowerObjectAttributeValue(
  ctx: CompilerContext,
  valueNode: JSXAttributeValue | null,
  name: string
): Pick<NamedPropRecord, 'value' | 'expressionRange'> | null {
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
    const expressionRange = getDynamicExpressionRange(expr);
    if (expressionRange !== null) {
      return { value: null, expressionRange };
    }
  }

  ctx.manifest.diagnostics.push(
    createDiagnostic(ctx.input.path, `Dynamic JSX attribute "${name}" is not supported yet.`)
  );
  return null;
}

function getDynamicExpressionRange(expr: unknown): SourceRange | null {
  const expression = unwrapExpression(expr);
  if (!expression || expression.type === 'JSXEmptyExpression') {
    return null;
  }
  return getRange(expression);
}

function findEventSegment(ctx: CompilerContext, ctxName: string, range: PropRange) {
  return ctx.manifest.segments.find(
    (segment) =>
      segment.kind === 'eventHandler' &&
      segment.ctxName === ctxName &&
      rangesEqual(segment.range, range)
  );
}

function findJsxFunctionPropSegment(ctx: CompilerContext, ctxName: string, range: PropRange) {
  return ctx.manifest.segments.find(
    (segment) =>
      (segment.kind === 'eventHandler' || segment.kind === 'jsxProp') &&
      segment.ctxName === ctxName &&
      rangesEqual(segment.range, range)
  );
}

function findDomPropsSegment(ctx: CompilerContext, range: PropRange) {
  return ctx.manifest.segments.find(
    (segment) => segment.kind === 'jsxSpreadProps' && rangesEqual(segment.range, range)
  );
}

function findJsxExpressionPropSegment(ctx: CompilerContext, ctxName: string, range: SourceRange) {
  return ctx.manifest.segments.find(
    (segment) =>
      segment.kind === 'jsxProp' &&
      segment.ctxName === ctxName &&
      segment.functionRange === null &&
      rangesEqual(segment.range, range)
  );
}

type PropRange = ReturnType<typeof getRange>;

function rangesEqual(left: PropRange, right: PropRange): boolean {
  return !!left && !!right && left[0] === right[0] && left[1] === right[1];
}

function lowerStaticAttributeValue(
  valueNode: JSXAttributeValue | null
): { supported: true; value: NamedPropRecord['value'] } | { supported: false } {
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

  return { supported: false };
}

function lowerJsxChildren(
  ctx: CompilerContext,
  children: JSXChild[],
  propsName: string | null,
  component: ComponentRecord
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
      nodes.push(lowerJsxNode(ctx, child, propsName, component));
      continue;
    }
    if (child.type === 'JSXExpressionContainer') {
      if (child.expression?.type === 'JSXEmptyExpression') {
        continue;
      }
      const expression = unwrapExpression(child.expression);
      if (isJsxValueExpression(expression, component)) {
        const expressionRange = getRange(expression);
        if (expressionRange) {
          nodes.push({ kind: 'dynamicJsx', expressionRange, invoke: true });
          continue;
        }
      }
      if (isPropsChildrenExpression(expression, propsName)) {
        nodes.push({ kind: 'slot', name: '', fallbackSegmentId: null, children: [] });
        continue;
      }
      const expressionRange = getRange(expression);
      if (expressionRange) {
        const staticBranch = lowerStaticBranchExpression(ctx, expression, propsName, component);
        if (staticBranch) {
          nodes.push(...staticBranch);
          continue;
        }
        const branch = lowerBranchExpression(
          ctx,
          expression,
          expressionRange,
          propsName,
          component
        );
        if (branch) {
          nodes.push(branch);
          continue;
        }
        const forNode = lowerForExpression(ctx, expression, expressionRange, propsName, component);
        if (forNode) {
          nodes.push(forNode);
          continue;
        }
        if (isDynamicJsxCallExpression(expression)) {
          nodes.push({ kind: 'dynamicJsx', expressionRange, invoke: false });
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

function lowerForExpression(
  ctx: CompilerContext,
  expression: unknown,
  expressionRange: SourceRange,
  propsName: string | null,
  component: ComponentRecord
): ForNode | null {
  const call = parseMapCall(ctx, expression);
  if (call === null) {
    return null;
  }
  const rowJsx = getCallbackReturnedJsx(call.callback);
  if (rowJsx === null) {
    ctx.manifest.diagnostics.push(
      createDiagnostic(ctx.input.path, 'vdomless JSX .map() rows must return JSX.')
    );
    return null;
  }

  const keyExpression = findRowKeyExpression(rowJsx);
  if (keyExpression === null) {
    ctx.manifest.diagnostics.push(
      createDiagnostic(ctx.input.path, 'vdomless JSX .map() rows require an explicit key.')
    );
    return null;
  }

  const keyRange = getRange(keyExpression);
  const rowRange = getRange(rowJsx);
  if (keyRange === null || rowRange === null) {
    return null;
  }

  const keySegment = findForSegment(ctx, 'forKey', keyRange);
  const renderSegment = findForSegment(ctx, 'forRender', rowRange);
  if (!keySegment || !renderSegment) {
    return null;
  }

  return {
    kind: 'for',
    expressionRange,
    sourceName: call.sourceName,
    keySegmentId: keySegment.id,
    renderSegmentId: renderSegment.id,
    children: lowerExpressionChildren(ctx, rowJsx, propsName, component),
    usesItemSignal: usesIdentifierIgnoringKey(rowJsx, call.itemName),
    usesIndexSignal:
      call.indexName === null ? false : usesIdentifierIgnoringKey(rowJsx, call.indexName),
  };
}

function parseMapCall(
  ctx: CompilerContext,
  expression: unknown
): { sourceName: string; callback: any; itemName: string; indexName: string | null } | null {
  const expr = unwrapExpression(expression);
  if (!isAstNode(expr) || expr.type !== 'CallExpression') {
    return null;
  }
  const callee = unwrapExpression(expr.callee);
  if (!isAstNode(callee) || callee.type !== 'MemberExpression' || callee.computed) {
    return null;
  }
  const property = callee.property;
  if (!isAstNode(property) || property.type !== 'Identifier') {
    return null;
  }
  if (property.name === 'forEach' || property.name === 'flatMap') {
    ctx.manifest.diagnostics.push(
      createDiagnostic(
        ctx.input.path,
        `vdomless JSX loops support .map(), not .${property.name}().`
      )
    );
    return null;
  }
  if (property.name !== 'map') {
    return null;
  }

  const sourceName = getSignalValueSourceName(callee.object);
  if (sourceName === null) {
    ctx.manifest.diagnostics.push(
      createDiagnostic(ctx.input.path, 'vdomless JSX .map() source must be a signal value.')
    );
    return null;
  }

  const callback = unwrapExpression(getCallArgumentExpression(expr.arguments?.[0]));
  if (!isFunctionLike(callback)) {
    ctx.manifest.diagnostics.push(
      createDiagnostic(ctx.input.path, 'vdomless JSX .map() requires an inline callback.')
    );
    return null;
  }

  const itemName = getIdentifierName(callback.params?.[0]);
  const indexName =
    callback.params?.[1] === undefined ? null : getIdentifierName(callback.params[1]);
  if (itemName === null || (callback.params?.[1] !== undefined && indexName === null)) {
    ctx.manifest.diagnostics.push(
      createDiagnostic(
        ctx.input.path,
        'vdomless JSX .map() callback parameters must be identifiers.'
      )
    );
    return null;
  }

  return { sourceName, callback, itemName, indexName };
}

function getCallArgumentExpression(argument: unknown): unknown {
  if (isAstNode(argument) && argument.type === 'SpreadElement') {
    return argument.argument;
  }
  return argument;
}

function getCallbackReturnedJsx(callback: any): AstJsxNode | null {
  const body = unwrapExpression(callback.body);
  if (!isAstNode(body)) {
    return null;
  }
  if (body.type === 'JSXElement' || body.type === 'JSXFragment') {
    return body;
  }
  if (body.type !== 'BlockStatement') {
    return null;
  }
  for (const statement of body.body ?? []) {
    if (isAstNode(statement) && statement.type === 'ReturnStatement') {
      const argument = unwrapExpression(statement.argument);
      return isAstNode(argument) &&
        (argument.type === 'JSXElement' || argument.type === 'JSXFragment')
        ? argument
        : null;
    }
  }
  return null;
}

function findRowKeyExpression(rowJsx: AstJsxNode): unknown | null {
  if (rowJsx.type === 'JSXElement') {
    return findKeyExpression(rowJsx.openingElement.attributes);
  }
  for (const child of rowJsx.children ?? []) {
    if (child.type === 'JSXElement') {
      const key = findKeyExpression(child.openingElement.attributes);
      if (key !== null) {
        return key;
      }
    }
  }
  return null;
}

function findKeyExpression(attributes: JSXAttributeItem[]): unknown | null {
  for (const attr of attributes) {
    if (attr.type !== 'JSXAttribute' || getJsxAttributeName(attr.name) !== 'key') {
      continue;
    }
    if (attr.value?.type !== 'JSXExpressionContainer') {
      return null;
    }
    return unwrapExpression(attr.value.expression);
  }
  return null;
}

function usesIdentifierIgnoringKey(node: unknown, name: string): boolean {
  const expr = unwrapExpression(node);
  if (!isAstNode(expr)) {
    return false;
  }
  if (expr.type === 'JSXAttribute' && getJsxAttributeName(expr.name) === 'key') {
    return false;
  }
  if (expr.type === 'Identifier' && expr.name === name) {
    return true;
  }
  for (const value of Object.values(expr)) {
    if (Array.isArray(value)) {
      for (const item of value) {
        if (usesIdentifierIgnoringKey(item, name)) {
          return true;
        }
      }
    } else if (usesIdentifierIgnoringKey(value, name)) {
      return true;
    }
  }
  return false;
}

function lowerBranchExpression(
  ctx: CompilerContext,
  expression: unknown,
  expressionRange: SourceRange,
  propsName: string | null,
  component: ComponentRecord
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
      thenChildren: lowerExpressionChildren(ctx, expr.consequent, propsName, component),
      elseChildren: lowerExpressionChildren(ctx, expr.alternate, propsName, component),
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
      thenChildren: lowerExpressionChildren(ctx, expr.right, propsName, component),
      elseChildren: [],
    };
  }
  return null;
}

function lowerStaticBranchExpression(
  ctx: CompilerContext,
  expression: unknown,
  propsName: string | null,
  component: ComponentRecord
): RenderNode[] | null {
  const expr = unwrapExpression(expression);
  if (!isAstNode(expr)) {
    return null;
  }
  if (expr.type === 'ConditionalExpression') {
    const condition = getStaticBranchCondition(expr.test);
    return condition === null
      ? null
      : lowerExpressionChildren(
          ctx,
          condition ? expr.consequent : expr.alternate,
          propsName,
          component
        );
  }
  if (expr.type === 'LogicalExpression' && expr.operator === '&&') {
    const condition = getStaticBranchCondition(expr.left);
    return condition === null
      ? null
      : condition
        ? lowerExpressionChildren(ctx, expr.right, propsName, component)
        : [];
  }
  return null;
}

function getStaticBranchCondition(expression: unknown): boolean | null {
  const expr = unwrapExpression(expression);
  if (!isAstNode(expr)) {
    return null;
  }
  if (expr.type === 'Literal') {
    if (expr.value === true) {
      return true;
    }
    if (expr.value === false || expr.value === null) {
      return false;
    }
  }
  return null;
}

function lowerExpressionChildren(
  ctx: CompilerContext,
  expression: unknown,
  propsName: string | null,
  component: ComponentRecord
): RenderNode[] {
  const expr = unwrapExpression(expression);
  if (!isAstNode(expr) || isEmptyBranchExpression(expr)) {
    return [];
  }
  if (isPropsChildrenExpression(expr, propsName)) {
    return [{ kind: 'slot', name: '', fallbackSegmentId: null, children: [] }];
  }
  if (isJsxValueExpression(expr, component)) {
    const expressionRange = getRange(expr);
    return expressionRange ? [{ kind: 'dynamicJsx', expressionRange, invoke: true }] : [];
  }
  if (expr.type === 'JSXElement' || expr.type === 'JSXFragment') {
    return [lowerJsxNode(ctx, expr, propsName, component)];
  }
  const range = getRange(expr);
  if (range !== null) {
    const staticBranch = lowerStaticBranchExpression(ctx, expr, propsName, component);
    if (staticBranch) {
      return staticBranch;
    }
    const branch = lowerBranchExpression(ctx, expr, range, propsName, component);
    if (branch) {
      return [branch];
    }
    const forNode = lowerForExpression(ctx, expr, range, propsName, component);
    if (forNode) {
      return [forNode];
    }
    if (isDynamicJsxCallExpression(expr)) {
      return [{ kind: 'dynamicJsx', expressionRange: range, invoke: false }];
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

function isJsxValueExpression(expression: unknown, component: ComponentRecord): boolean {
  const expr = unwrapExpression(expression);
  return (
    isAstNode(expr) &&
    expr.type === 'Identifier' &&
    component.jsxValues.some((value) => value.name === expr.name)
  );
}

function isDynamicJsxCallExpression(expression: unknown): boolean {
  return isCallExpression(unwrapExpression(expression));
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

function findForSegment(ctx: CompilerContext, kind: 'forKey' | 'forRender', range: SourceRange) {
  return ctx.manifest.segments.find(
    (segment) => segment.kind === kind && rangesEqual(segment.range, range)
  );
}

function findSlotRenderSegment(ctx: CompilerContext, range: SourceRange) {
  return ctx.manifest.segments.find(
    (segment) => segment.kind === 'slotRender' && rangesEqual(segment.range, range)
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

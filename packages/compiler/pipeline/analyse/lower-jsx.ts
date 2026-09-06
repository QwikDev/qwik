import type { Expression, JSXAttributeItem, JSXChild, JSXElement, Node } from 'oxc-parser';
import {
  BoundaryKind,
  ComponentPropsKind,
  ComponentTargetKind,
  ExprKind,
  FnBodyKind,
  HandlerKind,
  LifetimeCommit,
  LifetimeOwner,
  OpKind,
  ProjectionKind,
  PropKind,
  PropsPartKind,
  ProgramBodyKind,
  QrlBodyKind,
  QrlPayloadKind,
  SeedKind,
  ValueKind,
  type Op,
  type Prop,
  type Qrl,
  type QrlUse,
} from '../schema';
import { normalizeJsxText } from './ast/jsx-text';
import { normalizeAttributeName, VOID_ELEMENTS } from '../html';
import { InvalidModuleError, UnsupportedError } from '../errors';
import { eventScopeName } from './events';
import { lowerEventAttribute } from './lower-event';
import { lowerText } from './lower-hole';
import { lowerBranch, type BranchArm } from './lower-branch';
import { identifierName, unwrapExpression } from './ast/utils';
import { JsxValueKind, type JsxValue } from './ast/jsx-analysis';
import {
  lowerExpressionValue,
  lowerInlineExpressionValue,
  recordPayloadAliasReads,
  trySignalReadValue,
} from './lower-expr';
import type { LowerContext } from './lower-context';
import { pushPayload, pushQrl, QrlIdentityKind } from './lower-context';
import { lowerArray } from './lower-array';
import { lowerCaptures } from './ast/capture-analysis';
import { findRuntimeJsx } from './ast/returns-jsx';
import { QwikDirective, SegmentContext } from '../words';

/**
 * Lowers a JSX render tree to structural ops. Text stays RAW in the plan — each generator folds
 * with its own escaping (SSR streams raw, CSR templates escape). Dynamic arms land per example.
 */
export function lowerJsx(element: JSXElement, ctx: LowerContext): Op {
  const opening = element.openingElement;
  const nameNode = opening.name;
  if (nameNode.type !== 'JSXIdentifier') {
    throw new UnsupportedError('a non-native JSX tag');
  }
  const attributes = opening.attributes.filter((attribute) => !isKeyAttribute(attribute));
  if (/^[A-Z]/.test(nameNode.name)) {
    const binding = ctx.bindings.reference(nameNode);
    if (binding === null) {
      throw new InvalidModuleError(
        'unresolved-component',
        `The component "${nameNode.name}" is not declared in this scope.`,
        [nameNode.start, nameNode.end]
      );
    }
    if (ctx.coreBindings.get(binding) === 'Slot') {
      return lowerSlotMarker(element, ctx);
    }
    return {
      op: OpKind.Component,
      target: { t: ComponentTargetKind.Raw, binding },
      props: lowerComponentProps(attributes, ctx),
      projections: lowerProjections(element.children, ctx),
      id: { kind: SeedKind.Component, ordinal: ctx.componentCounter.next++ },
      lifetime: 0,
      blockingSuspense: false,
    };
  }
  if (!/^[a-z]/.test(nameNode.name)) {
    throw new UnsupportedError('a non-native JSX tag');
  }
  const tag = nameNode.name;
  const props = attributes
    .map((attribute) => lowerAttribute(attribute, ctx, 'element'))
    .filter((prop) => prop !== null);
  const children = lowerJsxChildren(element.children, ctx);
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

function lowerComponentProps(attributes: readonly JSXAttributeItem[], ctx: LowerContext) {
  if (
    attributes.some(
      (attribute) =>
        attribute.type === 'JSXSpreadAttribute' &&
        trySignalReadValue(attribute.argument, ctx) !== null
    )
  ) {
    return lowerComponentPropsProxy(attributes, ctx);
  }
  return {
    c: ComponentPropsKind.Entries as const,
    props: attributes
      .map((attribute) => lowerAttribute(attribute, ctx, 'component'))
      .filter((prop) => prop !== null),
  };
}

function lowerComponentPropsProxy(attributes: readonly JSXAttributeItem[], ctx: LowerContext) {
  const parts: Qrl['propsParts'] = [];
  const expressions: Expression[] = [];
  const payloads: number[] = [];
  const addExpression = (
    expression: Expression,
    part: { kind: PropsPartKind.Spread } | { kind: PropsPartKind.Expression; name: string }
  ) => {
    if (findRuntimeJsx(expression) !== null) {
      throw new UnsupportedError('JSX inside an expression value');
    }
    const payload = pushPayload(ctx, [expression.start, expression.end]);
    expressions.push(expression);
    payloads.push(payload);
    parts.push({ ...part, value: payload });
  };
  for (const attribute of attributes) {
    if (attribute.type === 'JSXSpreadAttribute') {
      addExpression(attribute.argument, { kind: PropsPartKind.Spread });
      continue;
    }
    if (jsxAttributeName(attribute) === QwikDirective.Slot) {
      continue;
    }
    if (attribute.name.type !== 'JSXIdentifier') {
      throw new UnsupportedError('a namespaced JSX attribute');
    }
    const name = attribute.name.name;
    const scope = eventScopeName(name);
    if (scope !== null) {
      const lowered = lowerEventAttribute(attribute, ctx, name, scope);
      if (lowered === null) {
        continue;
      }
      const { event, expression } = lowered;
      const handler = event.handlers.length === 1 ? event.handlers[0] : null;
      if (handler?.h !== HandlerKind.Value || handler.value.v !== ValueKind.Qrl) {
        throw new UnsupportedError('a non-QRL component event handler');
      }
      expressions.push(expression);
      parts.push({ kind: PropsPartKind.Event, name, use: handler.value.use });
      continue;
    }
    const value = attribute.value;
    if (value === null) {
      parts.push({ kind: PropsPartKind.Static, name, value: true });
    } else if (value.type === 'Literal') {
      parts.push({ kind: PropsPartKind.Static, name, value: value.value });
    } else if (value.type === 'JSXExpressionContainer') {
      if (value.expression.type === 'JSXEmptyExpression') {
        parts.push({ kind: PropsPartKind.Static, name, value: null });
      } else {
        addExpression(value.expression, { kind: PropsPartKind.Expression, name });
      }
    } else {
      throw new UnsupportedError('a dynamic JSX attribute value');
    }
  }
  const { captures, args, refs } = lowerCaptures(expressions, ctx, 'component props', {
    allowProps: true,
  });
  for (const payload of payloads) {
    recordPayloadAliasReads(ctx, payload, refs);
  }
  const range: [number, number] = [attributes[0].start, attributes[attributes.length - 1].end];
  const { use } = pushQrl(
    ctx,
    {
      identity: { kind: QrlIdentityKind.Segment, nameCtx: 'props' },
      ctxName: 'props',
      boundary: { kind: BoundaryKind.Implicit, role: 'expression' },
      payloadKind: QrlPayloadKind.Value,
      authoredAsync: false,
      body: {
        b: QrlBodyKind.Expr,
        expr: { kind: ExprKind.Js, payload: payloads[0] },
        initialOnly: false,
      },
      captures,
      params: { authored: 0, used: [], sources: [] },
      origin: {
        range,
        functionRange: range,
        calleeRange: null,
        argumentRanges: [],
        paramRanges: [],
        bodyRange: range,
        bodyKind: FnBodyKind.Expression,
      },
      propsParts: parts,
    },
    args
  );
  return { c: ComponentPropsKind.Proxy as const, compute: use };
}

/** Lowers a JSX child list — the shared path for fragment-rooted trees. */
export function lowerJsxChildren(children: readonly JSXChild[], ctx: LowerContext): Op[] {
  return mergeStaticText(
    flattenJsxChildren(children, ctx).flatMap((child) => lowerChild(child, ctx))
  );
}

function mergeStaticText(ops: Op[]): Op[] {
  const merged: Op[] = [];
  for (const op of ops) {
    const previous = merged[merged.length - 1];
    if (previous?.op === OpKind.Static && op.op === OpKind.Static) {
      previous.html += op.html;
    } else {
      merged.push(op);
    }
  }
  return merged;
}

function flattenJsxChildren(children: readonly JSXChild[], ctx: LowerContext): JSXChild[] {
  return children.flatMap((child) => {
    const value = ctx.jsx.read(child);
    return value.kind === JsxValueKind.Fragment
      ? flattenJsxChildren(value.node.children, ctx)
      : [child];
  });
}

function lowerChild(child: JSXChild, ctx: LowerContext): Op[] {
  switch (child.type) {
    case 'JSXText': {
      const text = normalizeJsxText(child.value);
      return text === '' ? [] : [{ op: OpKind.Static, html: text }];
    }
    case 'JSXElement':
      return [lowerJsx(child, ctx)];
    case 'JSXExpressionContainer':
      return child.expression.type === 'JSXEmptyExpression'
        ? []
        : lowerRenderExpression(child.expression, ctx);
    default:
      throw new UnsupportedError(`JSX child ${child.type}`);
  }
}

export function lowerRenderExpression(expression: Expression, ctx: LowerContext): Op[] {
  expression = unwrapExpression(expression);
  if (isPropsChildren(expression, ctx)) {
    return [createSlotOp(ctx)];
  }
  const value = ctx.jsx.read(expression);
  const branch = readRenderBranch(value);
  if (branch !== null) {
    return [
      lowerBranch(branch.test, branch.then, branch.else, ctx, (arm) =>
        lowerRenderExpression(arm, ctx)
      ),
    ];
  }
  switch (value.kind) {
    case JsxValueKind.Element:
      return [lowerJsx(value.node, ctx)];
    case JsxValueKind.Fragment:
      return lowerJsxChildren(value.node.children, ctx);
    case JsxValueKind.Collection:
      return [lowerArray(value.node, ctx)];
  }
  return lowerText(expression, ctx);
}

function readRenderBranch(value: JsxValue) {
  if (value.kind === JsxValueKind.Conditional && value.hasJsxValue) {
    return {
      test: value.node.test,
      then: createBranchArm(value.node.consequent, value.then),
      else: createBranchArm(value.node.alternate, value.else),
    };
  }
  if (value.kind === JsxValueKind.Logical && value.node.operator === '&&') {
    return {
      test: value.node.left,
      then: createBranchArm(value.node.right, value.right),
      else: null,
    };
  }
  return null;
}

function createBranchArm(expression: Expression, value: JsxValue): BranchArm {
  return {
    expression: value.kind === JsxValueKind.Empty ? null : expression,
    range: [expression.start, expression.end],
  };
}

function lowerSlotMarker(element: JSXElement, ctx: LowerContext): Op {
  const attributes = element.openingElement.attributes;
  const nameAttribute = attributes.find((attribute) => jsxAttributeName(attribute) === 'name');
  if (attributes.some((attribute) => attribute !== nameAttribute)) {
    throw new UnsupportedError('Slot attributes');
  }
  if (nameAttribute === undefined) {
    return createSlotOp(ctx, '', lowerSlotFallback(element.children, ctx));
  }
  const name = readSlotName(nameAttribute);
  return typeof name === 'string'
    ? createSlotOp(ctx, name, lowerSlotFallback(element.children, ctx))
    : lowerDynamicSlot(element, name, ctx);
}

/** A changing slot name owns one reactive render range. */
function lowerDynamicSlot(element: JSXElement, name: Expression, ctx: LowerContext): Op {
  const captures = lowerCaptures([name, ...element.children], ctx, 'a dynamic slot', {
    allowProps: true,
  });
  const lifetime = ctx.plan.lifetimes.length;
  ctx.plan.lifetimes.push({
    id: lifetime,
    parent: 0,
    owner: LifetimeOwner.Slot,
    commit: LifetimeCommit.AtomicRange,
  });
  const program = ctx.plan.programs.length;
  ctx.plan.programs.push({
    body: { kind: ProgramBodyKind.Ops, ops: [] },
    setup: [],
    params: [],
    lifetime,
    needsId: false,
    async: false,
  });
  const range: [number, number] = [element.start, element.end];
  const { use } = pushQrl(
    ctx,
    {
      identity: { kind: QrlIdentityKind.Segment, nameCtx: SegmentContext.DynamicSlot },
      ctxName: SegmentContext.DynamicSlot,
      boundary: { kind: BoundaryKind.Implicit, role: 'dynamic-slot' },
      payloadKind: QrlPayloadKind.Function,
      authoredAsync: false,
      body: { b: QrlBodyKind.Program, program },
      captures: captures.captures,
      params: { authored: 0, used: [], sources: [] },
      origin: {
        range,
        functionRange: range,
        calleeRange: null,
        argumentRanges: [],
        paramRanges: [],
        bodyRange: range,
        bodyKind: FnBodyKind.Expression,
      },
    },
    captures.args
  );
  const slot = createSlotOp(ctx, '', lowerSlotFallback(element.children, ctx), {
    nameValue: lowerInlineExpressionValue(name, ctx, captures.refs),
  });
  ctx.plan.programs[program].body = { kind: ProgramBodyKind.Ops, ops: [slot] };
  return { op: OpKind.DynamicSlot, render: use, id: slot.id, lifetime };
}

function lowerSlotFallback(children: readonly JSXChild[], ctx: LowerContext): QrlUse | null {
  const fallbackChildren = flattenJsxChildren(children, ctx).filter(isProjectionChild);
  return fallbackChildren.length === 0
    ? null
    : lowerRenderQrl(
        fallbackChildren,
        ctx,
        'a slot fallback',
        SegmentContext.Projection,
        'slot-fallback'
      );
}

function createSlotOp(
  ctx: LowerContext,
  name = '',
  fallback: Extract<Op, { op: OpKind.Slot }>['fallback'] = null,
  options: Pick<Extract<Op, { op: OpKind.Slot }>, 'nameValue'> = {}
): Extract<Op, { op: OpKind.Slot }> {
  return {
    op: OpKind.Slot,
    name,
    ...options,
    fallback,
    id: { kind: SeedKind.Slot, ordinal: ctx.slotCounter.next++ },
  };
}

function isPropsChildren(node: Node, ctx: LowerContext): boolean {
  const expression = unwrapExpression(node);
  if (expression?.type === 'Identifier') {
    const binding = ctx.bindings.reference(expression);
    return binding !== null && ctx.propsMembers.get(binding) === 'children';
  }
  if (
    expression?.type !== 'MemberExpression' ||
    expression.computed ||
    identifierName(expression.property) !== 'children'
  ) {
    return false;
  }
  const object = unwrapExpression(expression.object);
  return (
    object?.type === 'Identifier' &&
    ctx.propsBinding !== null &&
    ctx.bindings.reference(object) === ctx.propsBinding
  );
}

function lowerProjections(
  children: readonly JSXChild[],
  ctx: LowerContext
): Extract<Op, { op: OpKind.Component }>['projections'] {
  return flattenJsxChildren(children, ctx)
    .filter(isProjectionChild)
    .flatMap((child) => {
      const names = [...new Set(collectProjectionNames(ctx.jsx.read(child)))];
      return names.map((name) => lowerProjection(child, name, ctx));
    });
}

function lowerProjection(
  child: JSXChild,
  name: string,
  ctx: LowerContext
): Extract<Op, { op: OpKind.Component }>['projections'][number] {
  const id = { kind: SeedKind.Projection, ordinal: ctx.projectionCounter.next++ } as const;
  const forwardedSlot = readForwardedSlot(child, ctx);
  if (forwardedSlot !== null) {
    return {
      kind: ProjectionKind.Forward,
      name,
      sourceName: forwardedSlot.sourceName,
      fallback: lowerSlotFallback(forwardedSlot.children, ctx),
      id,
    };
  }
  const use = lowerRenderQrl(
    [child],
    ctx,
    'a component projection',
    SegmentContext.Projection,
    'projection',
    () => lowerProjectedChildren([child], name, ctx)
  );
  return {
    kind: ProjectionKind.Render,
    name,
    use,
    id,
  };
}

function lowerProjectedChildren(
  children: readonly JSXChild[],
  name: string,
  ctx: LowerContext
): Op[] {
  return mergeStaticText(
    flattenJsxChildren(children, ctx).flatMap((child) => {
      if (!collectProjectionNames(ctx.jsx.read(child)).includes(name)) {
        return [];
      }
      if (
        child.type === 'JSXExpressionContainer' &&
        child.expression.type !== 'JSXEmptyExpression'
      ) {
        return lowerProjectedExpression(child.expression, name, ctx);
      }
      return lowerChild(child, ctx);
    })
  );
}

function lowerProjectedExpression(expression: Expression, name: string, ctx: LowerContext): Op[] {
  expression = unwrapExpression(expression);
  const value = ctx.jsx.read(expression);
  if (value.kind === JsxValueKind.Fragment) {
    return lowerProjectedChildren(value.node.children, name, ctx);
  }
  if (value.kind === JsxValueKind.Collection) {
    return [lowerArray(value.node, ctx, (row) => lowerProjectedExpression(row, name, ctx))];
  }
  const branch = readRenderBranch(value);
  if (branch !== null) {
    return [
      lowerBranch(
        branch.test,
        selectProjectionArm(branch.then, name, ctx),
        branch.else === null ? null : selectProjectionArm(branch.else, name, ctx),
        ctx,
        (arm) => lowerProjectedExpression(arm, name, ctx)
      ),
    ];
  }
  return lowerRenderExpression(expression, ctx);
}

function selectProjectionArm(arm: BranchArm, name: string, ctx: LowerContext): BranchArm {
  if (
    arm.expression === null ||
    collectProjectionNames(ctx.jsx.read(arm.expression)).includes(name)
  ) {
    return arm;
  }
  return { ...arm, expression: null };
}

function collectProjectionNames(value: JsxValue): string[] {
  switch (value.kind) {
    case JsxValueKind.Element:
      return [readProjectionName(value.node)];
    case JsxValueKind.Fragment:
      return value.children.flatMap(collectProjectionNames);
    case JsxValueKind.Empty:
      return [];
    case JsxValueKind.Text:
      return normalizeJsxText(value.node.value) === '' ? [] : [''];
    case JsxValueKind.Collection:
      if (value.row !== null) {
        return collectProjectionNames(value.row);
      }
      break;
    case JsxValueKind.Conditional:
      return [...collectProjectionNames(value.then), ...collectProjectionNames(value.else)];
    case JsxValueKind.Logical:
      if (value.node.operator === '&&') {
        return collectProjectionNames(value.right);
      }
  }
  return [''];
}

function readForwardedSlot(
  child: JSXChild,
  ctx: LowerContext
): { sourceName: string; children: readonly JSXChild[] } | null {
  if (child.type !== 'JSXElement' || child.openingElement.name.type !== 'JSXIdentifier') {
    return null;
  }
  const binding = ctx.bindings.reference(child.openingElement.name);
  if (binding === null || ctx.coreBindings.get(binding) !== 'Slot') {
    return null;
  }
  const attributes = child.openingElement.attributes;
  if (
    attributes.some((attribute) => {
      const name = jsxAttributeName(attribute);
      return name !== 'name' && name !== QwikDirective.Slot;
    })
  ) {
    return null;
  }
  const nameAttribute = attributes.find((attribute) => jsxAttributeName(attribute) === 'name');
  return {
    sourceName: nameAttribute === undefined ? '' : readStaticSlotName(nameAttribute),
    children: child.children,
  };
}

function lowerRenderQrl(
  children: JSXChild[],
  ctx: LowerContext,
  subject: string,
  nameCtx: SegmentContext,
  role: string,
  lowerBody?: () => Op[]
) {
  const range: [number, number] = [children[0].start, children[children.length - 1].end];
  const { captures, args } = lowerCaptures(children, ctx, subject, { allowProps: true });
  const program = ctx.plan.programs.length;
  ctx.plan.programs.push({
    body: { kind: ProgramBodyKind.Ops, ops: [] },
    setup: [],
    params: [],
    lifetime: 0,
    needsId: false,
    async: false,
  });
  const { use } = pushQrl(
    ctx,
    {
      identity: { kind: QrlIdentityKind.Segment, nameCtx },
      ctxName: nameCtx,
      boundary: { kind: BoundaryKind.Implicit, role },
      payloadKind: QrlPayloadKind.Function,
      authoredAsync: false,
      body: { b: QrlBodyKind.Program, program },
      captures,
      params: { authored: 0, used: [], sources: [] },
      origin: {
        range,
        functionRange: range,
        calleeRange: null,
        argumentRanges: [],
        paramRanges: [],
        bodyRange: range,
        bodyKind: FnBodyKind.Expression,
      },
    },
    args
  );
  ctx.plan.programs[program].body = {
    kind: ProgramBodyKind.Ops,
    ops: lowerBody?.() ?? lowerJsxChildren(children, ctx),
  };
  return use;
}

function isProjectionChild(child: JSXChild): boolean {
  if (child.type === 'JSXText') {
    return normalizeJsxText(child.value) !== '';
  }
  return !(
    child.type === 'JSXExpressionContainer' && child.expression.type === 'JSXEmptyExpression'
  );
}

function readProjectionName(child: JSXChild): string {
  if (child.type !== 'JSXElement') {
    return '';
  }
  const attribute = child.openingElement.attributes.find(
    (attribute) => jsxAttributeName(attribute) === QwikDirective.Slot
  );
  return attribute === undefined ? '' : readStaticSlotName(attribute);
}

function readStaticSlotName(attribute: JSXAttributeItem): string {
  const name = readSlotName(attribute);
  if (typeof name === 'string') {
    return name;
  }
  throw new UnsupportedError('a dynamic slot name');
}

function readSlotName(attribute: JSXAttributeItem): string | Expression {
  if (attribute.type !== 'JSXAttribute') {
    throw new UnsupportedError('a dynamic slot name');
  }
  const value = attribute.value;
  if (value?.type === 'Literal' && typeof value.value === 'string') {
    return value.value;
  }
  if (
    value?.type === 'JSXExpressionContainer' &&
    value.expression.type === 'Literal' &&
    typeof value.expression.value === 'string'
  ) {
    return value.expression.value;
  }
  if (value?.type === 'JSXExpressionContainer' && value.expression.type !== 'JSXEmptyExpression') {
    return value.expression;
  }
  throw new UnsupportedError('a dynamic slot name');
}

function jsxAttributeName(attribute: JSXAttributeItem): string | null {
  if (attribute.type !== 'JSXAttribute') {
    return null;
  }
  const name = attribute.name;
  if (name.type === 'JSXIdentifier') {
    return name.name;
  }
  return name.type === 'JSXNamespacedName' ? `${name.namespace.name}:${name.name.name}` : null;
}

/** `key` is framework-reserved — it feeds collection keying, never the rendered element. */
function isKeyAttribute(attribute: JSXAttributeItem): boolean {
  return (
    attribute.type === 'JSXAttribute' &&
    attribute.name.type === 'JSXIdentifier' &&
    attribute.name.name === 'key'
  );
}

function lowerAttribute(
  attribute: JSXAttributeItem,
  ctx: LowerContext,
  target: 'component' | 'element'
): Prop | null {
  if (attribute.type === 'JSXSpreadAttribute') {
    if (target !== 'component') {
      throw new UnsupportedError('a JSX spread attribute');
    }
    return {
      k: PropKind.Spread,
      value: lowerExpressionValue(attribute.argument, ctx, 'props'),
      effect: null,
    };
  }
  if (jsxAttributeName(attribute) === QwikDirective.Slot) {
    return null;
  }
  if (attribute.name.type !== 'JSXIdentifier') {
    throw new UnsupportedError('a namespaced JSX attribute');
  }
  const authored = attribute.name.name;
  const scope = eventScopeName(authored);
  if (scope !== null) {
    const lowered = lowerEventAttribute(attribute, ctx, authored, scope);
    if (lowered === null) {
      return null;
    }
    const event = lowered.event;
    return target === 'component' ? { ...event, name: authored } : event;
  }
  const name = target === 'component' ? authored : normalizeAttributeName(authored);
  const value = attribute.value;
  if (value === null) {
    // Absent authored value = bare attribute (`<main hidden>`).
    return { k: PropKind.Static, name, value: true };
  }
  switch (value.type) {
    case 'Literal':
      return {
        k: PropKind.Static,
        name,
        value: value.value,
      };
    case 'JSXExpressionContainer': {
      if (value.expression.type === 'JSXEmptyExpression') {
        return {
          k: PropKind.Static,
          name,
          value: null,
        };
      }
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

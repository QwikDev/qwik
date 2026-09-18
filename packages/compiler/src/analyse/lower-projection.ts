/** Slots and projections: markers, names, fallbacks and projected children. */
import type { Expression, JSXAttributeItem, JSXChild, JSXElement } from 'oxc-parser';
import {
  BoundaryKind,
  ExprKind,
  FnBodyKind,
  LifetimeOwner,
  OpKind,
  ProjectionKind,
  QrlBodyKind,
  QrlPayloadKind,
  SeedKind,
  type Op,
  type QrlUse,
} from '../schema';
import { normalizeJsxText } from './ast/jsx-text';
import { UnsupportedError } from '../errors';
import { lowerBranch, type BranchArm } from './lower-branch';
import { jsxAttributeName, unwrapExpression } from './ast/utils';
import { JsxValueKind, type JsxValue } from './ast/jsx-analysis';
import { lowerComputedExpressionValue, lowerInlineExpressionValue } from './lower-expr';
import type { LowerContext } from './lower-context';
import { pushQrl, QrlIdentityKind } from './lower-context';
import { lowerArray } from './lower-array';
import { ValueIrKind } from '../schema/value-ir';
import { QwikDirective, SegmentContext } from '../words';
import {
  flattenJsxChildren,
  lowerChild,
  lowerJsxChildren,
  lowerRenderExpression,
  mergeStaticText,
  readRenderBranch,
} from './lower-children';
import { lowerContentRange, lowerRenderQrl } from './lower-render-qrl';
/** The body is fixed runtime code, so the segment needs no source: the emitters print it. */
export function lowerDynamicSlotSegment(element: JSXElement, ctx: LowerContext): QrlUse {
  const range: [number, number] = [element.start, element.end];
  return pushQrl(ctx, {
    identity: { kind: QrlIdentityKind.Segment, nameCtx: SegmentContext.SlotContent },
    ctxName: SegmentContext.SlotContent,
    boundary: { kind: BoundaryKind.Implicit, role: 'slot' },
    payloadKind: QrlPayloadKind.Function,
    authoredAsync: false,
    body: {
      b: QrlBodyKind.Expr,
      expr: { kind: ExprKind.Ir, ir: { kind: ValueIrKind.Undef } },
      initialOnly: false,
    },
    captures: [],
    params: { authored: 4, used: [], sources: [] },
    origin: {
      range,
      functionRange: range,
      calleeRange: null,
      argumentRanges: [],
      paramRanges: [],
      bodyRange: range,
      bodyKind: FnBodyKind.Expression,
    },
  }).use;
}

export function lowerSlotMarker(element: JSXElement, ctx: LowerContext): Op {
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
export function lowerDynamicSlot(element: JSXElement, name: Expression, ctx: LowerContext): Op {
  return lowerContentRange(
    element,
    [name, ...element.children],
    ctx,
    'a dynamic slot',
    SegmentContext.DynamicSlot,
    LifetimeOwner.Slot,
    (captures) => {
      const slot = createSlotOp(ctx, '', lowerSlotFallback(element.children, ctx), {
        nameValue: lowerInlineExpressionValue(name, ctx, captures.refs),
      });
      return { ops: [slot], id: slot.id };
    }
  );
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
        'slot-fallback',
        (renderContext) => lowerJsxChildren(fallbackChildren, renderContext)
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

export function lowerProjections(
  children: readonly JSXChild[],
  ctx: LowerContext
): Extract<Op, { op: OpKind.Component }>['projections'] {
  return flattenJsxChildren(children, ctx, true)
    .filter(isProjectionChild)
    .flatMap((child) => {
      const names = [...new Set(collectProjectionNames(ctx.jsx.read(child)))];
      return names.map((name) => lowerProjection(child, name, ctx));
    });
}

type ProjectionName = string | Expression;

export function lowerProjection(
  child: JSXChild,
  name: ProjectionName,
  ctx: LowerContext
): Extract<Op, { op: OpKind.Component }>['projections'][number] {
  const id = { kind: SeedKind.Projection, ordinal: ctx.projectionCounter.next++ } as const;
  const forwardedSlot = typeof name === 'string' ? readForwardedSlot(child, ctx) : null;
  if (forwardedSlot !== null && typeof name === 'string') {
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
    (renderContext) => lowerProjectedChildren([child], name, renderContext)
  );
  const childType = readChildType(child);
  if (typeof name === 'string') {
    return { kind: ProjectionKind.Render, name, use, childType, id };
  }
  // The name is read where the consumer's slot resolves, so it ships as a value QRL.
  const nameUse = lowerComputedExpressionValue(name, ctx, SegmentContext.SlotName).resume.qrl;
  return { kind: ProjectionKind.Render, name: '', nameUse, use, childType, id };
}

function lowerProjectedChildren(
  children: readonly JSXChild[],
  name: ProjectionName,
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

function lowerProjectedExpression(
  expression: Expression,
  name: ProjectionName,
  ctx: LowerContext
): Op[] {
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

function selectProjectionArm(arm: BranchArm, name: ProjectionName, ctx: LowerContext): BranchArm {
  if (
    arm.expression === null ||
    collectProjectionNames(ctx.jsx.read(arm.expression)).includes(name)
  ) {
    return arm;
  }
  return { ...arm, expression: null };
}

function collectProjectionNames(value: JsxValue): ProjectionName[] {
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

export function isProjectionChild(child: JSXChild): boolean {
  if (child.type === 'JSXText') {
    return normalizeJsxText(child.value) !== '';
  }
  return !(
    child.type === 'JSXExpressionContainer' && child.expression.type === 'JSXEmptyExpression'
  );
}

export function findDirective(child: JSXChild, name: QwikDirective): JSXAttributeItem | undefined {
  return child.type === 'JSXElement'
    ? child.openingElement.attributes.find((attribute) => jsxAttributeName(attribute) === name)
    : undefined;
}

function readProjectionName(child: JSXChild): ProjectionName {
  const attribute = findDirective(child, QwikDirective.Slot);
  return attribute === undefined ? '' : readSlotName(attribute);
}

function readChildType(child: JSXChild): string | undefined {
  const attribute = findDirective(child, QwikDirective.Type);
  if (attribute === undefined) {
    return undefined;
  }
  const value = attribute.type === 'JSXAttribute' ? attribute.value : null;
  if (value?.type === 'Literal' && typeof value.value === 'string') {
    return value.value;
  }
  throw new UnsupportedError('a dynamic child type');
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

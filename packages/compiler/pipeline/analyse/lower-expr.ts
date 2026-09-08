import {
  BoundaryKind,
  ExprKind,
  FnBodyKind,
  PlaceKind,
  QrlBodyKind,
  QrlPayloadKind,
  ResumeKind,
  ValueKind,
  type PayloadId,
  type Value,
} from '../schema';
import { ValueIrKind, type ValueIR } from '../../src/expr-ir';
import { identifierName } from './ast/utils';
import { lowerRenderExpression, lowerRenderQrl } from './lower-jsx';
import { SegmentContext } from '../words';
import { collectCaptures, lowerCaptures, type CollectedCaptures } from './ast/capture-analysis';
import { UnsupportedError } from '../errors';
import { pushPayload, pushQrl, QrlIdentityKind, type LowerContext } from './lower-context';
import { LocalKind, localReadIr } from './locals';
import type { Expression, Node } from 'oxc-parser';

export type ReactiveValue = Extract<Value, { v: ValueKind.Read } | { v: ValueKind.Computed }>;

export function resolveQrlBinding(expression: Node, ctx: LowerContext) {
  const binding = ctx.bindings.reference(expression);
  return binding !== null && ctx.locals.get(binding)?.kind === LocalKind.Qrl ? binding : null;
}

/** Classifies a JSX expression as a reactive Value: a signal Read, or a Computed value QRL. */
export function lowerExpressionValue(
  expression: Expression,
  ctx: LowerContext,
  /** Segment identity context: 'text' for holes, the attribute name for props. */
  nameCtx: string
): ReactiveValue {
  if (ctx.inlineParams !== null) {
    const inline = tryLowerInlineValue(expression, ctx);
    if (inline !== null) {
      return inline;
    }
    // Reactive reads fall through to the capturing hole path; loop params capture by name.
  }
  const read = trySignalReadValue(expression, ctx);
  if (read !== null) {
    return read;
  }
  return lowerComputedExpressionValue(expression, ctx, nameCtx);
}

export function lowerComputedExpressionValue(
  expression: Expression,
  ctx: LowerContext,
  nameCtx: string,
  payloadKind = QrlPayloadKind.Value,
  role = 'expression'
) {
  const { captures, args, refs } = lowerCaptures(expression, ctx, 'an expression');
  const range: [number, number] = [expression.start, expression.end];
  const payload = lowerExpressionPayload(expression, ctx, refs);
  const ir = tryLowerExprIr(expression, ctx);
  const expr =
    ir === null ? ({ kind: ExprKind.Js, payload } as const) : ({ kind: ExprKind.Ir, ir } as const);
  const { use } = pushQrl(
    ctx,
    {
      identity: { kind: QrlIdentityKind.Segment, nameCtx },
      ctxName: nameCtx,
      boundary: { kind: BoundaryKind.Implicit, role },
      payloadKind,
      authoredAsync: false,
      body: { b: QrlBodyKind.Expr, expr, initialOnly: false },
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
  return {
    v: ValueKind.Computed as const,
    expr,
    resume: { r: ResumeKind.Qrl as const, qrl: use },
    compilerString: false,
  };
}

export function recordPayloadReads(
  ctx: LowerContext,
  payload: PayloadId,
  refs: CollectedCaptures
): void {
  const target = ctx.plan.payloads[payload];
  target.reads.push(
    ...refs.moduleReads.filter(
      ({ range }) => range[0] >= target.range[0] && range[1] <= target.range[1]
    )
  );
  for (const entry of refs.locals) {
    const value = localReadIr(entry.local);
    if (value === null) {
      continue;
    }
    for (const { range, role } of entry.reads) {
      if (range[0] < target.range[0] || range[1] > target.range[1]) {
        continue;
      }
      target.reads.push({
        range,
        binding: entry.local.binding,
        role,
        value,
      });
    }
  }
}

/** Inline rows read their loop params lexically: the expression splices in place, no QRL. */
function tryLowerInlineValue(expression: Expression, ctx: LowerContext): ReactiveValue | null {
  const refs = collectCaptures(expression, ctx, ctx.inlineParams!);
  // A reactive read needs an effect, so it cannot splice — null defers to the hole path.
  if (refs.propsReads.length > 0 || refs.locals.length > 0) {
    return null;
  }
  // Module bindings stay readable: the inline row function nests inside the module scope.
  return lowerInlineExpressionValue(expression, ctx, refs);
}

/** Lowers a value executed inside its enclosing render QRL. */
export function lowerInlineExpressionValue(
  expression: Expression,
  ctx: LowerContext,
  refs: CollectedCaptures
): Extract<Value, { v: ValueKind.Computed }> {
  const payload = lowerExpressionPayload(expression, ctx, refs);
  const ir = tryLowerExprIr(expression, ctx);
  return {
    v: ValueKind.Computed,
    expr: ir === null ? { kind: ExprKind.Js, payload } : { kind: ExprKind.Ir, ir },
    resume: { r: ResumeKind.Inline },
    compilerString: false,
  };
}

/** Embedded JSX shares render lowering with standalone initializers and projections. */
function lowerExpressionPayload(
  expression: Expression,
  ctx: LowerContext,
  refs: CollectedCaptures
): PayloadId {
  const payload = pushPayload(ctx, [expression.start, expression.end]);
  recordPayloadReads(ctx, payload, refs);
  for (const root of ctx.jsx.expressionRoots(expression)) {
    const use = lowerRenderQrl(
      [root],
      ctx,
      'a JSX value',
      SegmentContext.JsxValue,
      'jsx-value',
      () => lowerRenderExpression(root, ctx)
    );
    ctx.plan.payloads[payload].qrls.push({ range: [root.start, root.end], use });
  }
  return payload;
}

/** `count.value` where `count` is a component signal local — a subscription, not a QRL. */
export function trySignalReadValue(
  expression: Expression,
  ctx: LowerContext
): ReactiveValue | null {
  if (expression.type !== 'MemberExpression' || expression.computed) {
    return null;
  }
  const property = expression.computed ? null : identifierName(expression.property);
  const name = identifierName(expression.object);
  if (property !== 'value' || name === null) {
    return null;
  }
  const binding = ctx.bindings.reference(expression.object);
  if (binding === null) {
    return null;
  }
  const local = ctx.locals.get(binding);
  if (local === undefined) {
    return null;
  }
  switch (local.kind) {
    case LocalKind.Const:
    case LocalKind.Mutable:
    case LocalKind.Qrl:
    case LocalKind.PropMember:
    case LocalKind.PropRest:
      return null;
    case LocalKind.Signal:
      return {
        v: ValueKind.Read,
        place: { at: PlaceKind.Slot, index: local.slot },
        expr: { kind: ExprKind.Ir, ir: { kind: ValueIrKind.SignalRead, binding: local.binding } },
      };
    default:
      throw new UnsupportedError(`reading the "${local.kind}" local "${name}"`);
  }
}

/**
 * Lowers an expression to ValueIR when the vocabulary covers it — native generators evaluate IR
 * directly. Null falls back to the JS payload (which the Rust target then refuses).
 */
export function tryLowerExprIr(node: Expression, ctx: LowerContext): ValueIR | null {
  switch (node.type) {
    case 'Literal': {
      const value = node.value;
      return value === null ||
        typeof value === 'string' ||
        typeof value === 'number' ||
        typeof value === 'boolean'
        ? { kind: ValueIrKind.Lit, value }
        : null;
    }
    case 'Identifier': {
      const name = identifierName(node);
      const binding = ctx.bindings.reference(node);
      if (name === null || binding === null) {
        return null;
      }
      if (binding === ctx.propsBinding) {
        return { kind: ValueIrKind.BindingRead, binding };
      }
      const local = ctx.locals.get(binding);
      return local === undefined ? null : localReadIr(local);
    }
    case 'MemberExpression': {
      if (node.computed || node.optional) {
        return null;
      }
      const obj = tryLowerExprIr(node.object, ctx);
      const name = identifierName(node.property);
      return obj === null || name === null ? null : { kind: ValueIrKind.Member, obj, name };
    }
    default:
      return null;
  }
}

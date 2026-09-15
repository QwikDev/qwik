import {
  BoundaryKind,
  ExprKind,
  FnBodyKind,
  PlaceKind,
  QrlBodyKind,
  QrlPayloadKind,
  ResumeKind,
  ValueKind,
  type Expr,
  type PayloadId,
  type Range,
  type Result,
  type Value,
} from '../schema';
import { ValueIrKind, type ValueIR } from '../../src/expr-ir';
import { identifierName, isFunctionLike } from './ast/utils';
import { lowerRenderExpression, lowerRenderQrl } from './lower-jsx';
import { SegmentContext } from '../words';
import {
  createCapturedContext,
  collectCaptures,
  lowerCaptures,
  type CollectedCaptures,
  type LoweredCaptures,
} from './ast/capture-analysis';
import { UnsupportedError } from '../errors';
import { pushPayload, pushQrl, QrlIdentityKind, type LowerContext } from './lower-context';
import { LocalKind, localReadIr, memberReadIr } from './locals';
import type { Expression, Node } from 'oxc-parser';
import { recordFunctionJsx, recordPayloadQrls } from './lower-function';
import { expressionResult } from './results';

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
  nameCtx: string,
  /** Event handlers need a QRL, so a prop member read stays computed there. */
  propMembers = true
): ReactiveValue {
  if (ctx.inlineParams !== null) {
    const inline = tryLowerInlineValue(expression, ctx);
    if (inline !== null) {
      return inline;
    }
    // Reactive reads fall through to the capturing hole path; loop params capture by name.
  }
  const read =
    trySignalReadValue(expression, ctx) ??
    (propMembers ? tryPropMemberRead(expression, ctx) : null);
  if (read !== null) {
    return read;
  }
  return lowerComputedExpressionValue(expression, ctx, nameCtx);
}

/** `props.title`, or a live alias of it: one member the runtime backs with its own source. */
export function tryPropMemberRead(expression: Expression, ctx: LowerContext): ReactiveValue | null {
  const props = ctx.propsBinding;
  const name = props === null ? null : propMemberName(expression, ctx, props);
  if (name === null) {
    return null;
  }
  return {
    v: ValueKind.Read,
    range: [expression.start, expression.end],
    result: expressionResult(expression, ctx),
    place: { at: PlaceKind.Prop, name },
    expr: { kind: ExprKind.Ir, ir: memberReadIr(props!, name) },
  };
}

/** Exactly one member of the props binding: not a deeper path, a default, or a store member. */
function propMemberName(expression: Expression, ctx: LowerContext, props: number): string | null {
  if (expression.type === 'MemberExpression') {
    return !expression.computed &&
      !expression.optional &&
      ctx.bindings.reference(expression.object) === props
      ? identifierName(expression.property)
      : null;
  }
  const binding = expression.type === 'Identifier' ? ctx.bindings.reference(expression) : null;
  const local = binding === null ? undefined : ctx.locals.get(binding);
  const read =
    local?.kind === LocalKind.PropMember && local.defaultValue === undefined ? local.read : null;
  return read?.kind === ValueIrKind.Member &&
    read.obj.kind === ValueIrKind.BindingRead &&
    read.obj.binding === props
    ? read.name
    : null;
}

export function lowerComputedExpressionValue(
  expression: Expression,
  ctx: LowerContext,
  nameCtx: string,
  payloadKind = QrlPayloadKind.Value,
  role = 'expression'
) {
  const result = expressionResult(expression, ctx);
  const lowered = lowerCaptures(expression, ctx, 'an expression');
  ctx = createCapturedContext(ctx, lowered.captures);
  const range: Range = [expression.start, expression.end];
  const payload = lowerExpressionPayload(expression, ctx, lowered.refs);
  const ir = tryLowerExprIr(expression, ctx);
  const expr: Expr = ir === null ? { kind: ExprKind.Js, payload } : { kind: ExprKind.Ir, ir };
  return computedQrlValue(expr, result, ctx, lowered, range, nameCtx, payloadKind, role);
}

/** Several text parts render as one string: the value is a template over the parts. */
export function lowerTemplateValue(
  parts: readonly (string | Expression)[],
  ctx: LowerContext,
  range: Range
) {
  const expressions = parts.filter((part): part is Expression => typeof part !== 'string');
  const lowered = lowerCaptures(expressions, ctx, 'text content');
  ctx = createCapturedContext(ctx, lowered.captures);
  const ir = {
    kind: ValueIrKind.Template as const,
    parts: parts.map((part) =>
      typeof part === 'string'
        ? part
        : (tryLowerExprIr(part, ctx) ?? {
            kind: ExprKind.Js as const,
            payload: lowerExpressionPayload(part, ctx, lowered.refs),
          })
    ),
  };
  return computedQrlValue(
    { kind: ExprKind.Ir, ir },
    { kind: 'string-result' },
    ctx,
    lowered,
    range,
    SegmentContext.Text
  );
}

function computedQrlValue(
  expr: Expr,
  result: Result,
  ctx: LowerContext,
  lowered: LoweredCaptures,
  range: Range,
  nameCtx: string,
  payloadKind = QrlPayloadKind.Value,
  role = 'expression'
) {
  const { use } = pushQrl(
    ctx,
    {
      identity: { kind: QrlIdentityKind.Segment, nameCtx },
      ctxName: nameCtx,
      boundary: { kind: BoundaryKind.Implicit, role },
      payloadKind,
      authoredAsync: false,
      body: { b: QrlBodyKind.Expr, expr, initialOnly: false },
      captures: lowered.captures,
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
    lowered.args
  );
  return {
    v: ValueKind.Computed as const,
    result,
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
    const value =
      ctx.bindings.implicitKind(entry.local.binding) !== null && ctx.locals.has(entry.local.binding)
        ? { kind: ValueIrKind.BindingRead as const, binding: entry.local.binding }
        : localReadIr(entry.local);
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
    range: [expression.start, expression.end],
    result: expressionResult(expression, ctx),
    expr: ir === null ? { kind: ExprKind.Js, payload } : { kind: ExprKind.Ir, ir },
    resume: { r: ResumeKind.Inline },
    compilerString: false,
  };
}

/** Embedded JSX shares render lowering with standalone initializers and projections. */
export function lowerExpressionPayload(
  expression: Expression,
  ctx: LowerContext,
  refs: CollectedCaptures
): PayloadId {
  const payload = pushPayload(ctx, [expression.start, expression.end]);
  recordPayloadReads(ctx, payload, refs);
  recordPayloadJsx(ctx, payload, expression);
  return payload;
}

export function recordPayloadJsx(
  ctx: LowerContext,
  payload: PayloadId,
  expression: Node,
  preserveAsyncContext = false
): void {
  ctx.plan.payloads[payload].result = expressionResult(expression, ctx);
  recordPayloadQrls(ctx, payload, expression);
  const extracted = ctx.plan.payloads[payload].qrls;
  for (const root of ctx.jsx.expressionRoots(expression)) {
    // A root inside an extracted `$()` belongs to that QRL's own payload.
    if (extracted.some(({ range }) => range[0] <= root.start && root.end <= range[1])) {
      continue;
    }
    if (isFunctionLike(root)) {
      recordFunctionJsx(ctx, payload, root, preserveAsyncContext);
      continue;
    }
    const use = lowerRenderQrl(
      [root],
      ctx,
      'a JSX value',
      SegmentContext.JsxValue,
      'jsx-value',
      (renderContext) => lowerRenderExpression(root, renderContext)
    );
    ctx.plan.payloads[payload].qrls.push({ range: [root.start, root.end], use });
  }
}

/** `count.value` where `count` is a component signal local — a subscription, not a QRL. */
export function trySignalReadValue(
  expression: Expression,
  ctx: LowerContext
): ReactiveValue | null {
  // `{count}` renders a signal's value reactively, like `{count.value}`.
  const object =
    expression.type === 'Identifier'
      ? expression
      : expression.type === 'MemberExpression' &&
          !expression.computed &&
          identifierName(expression.property) === 'value'
        ? expression.object
        : null;
  const name = object === null ? null : identifierName(object);
  if (object === null || name === null) {
    return null;
  }
  const binding = ctx.bindings.reference(object);
  if (binding === null) {
    return null;
  }
  const local = ctx.locals.get(binding);
  if (
    local === undefined ||
    (expression.type === 'Identifier' && local.kind !== LocalKind.Signal)
  ) {
    return null;
  }
  switch (local.kind) {
    case LocalKind.Const:
    case LocalKind.Mutable:
    case LocalKind.Store:
    case LocalKind.Qrl:
    case LocalKind.PropMember:
    case LocalKind.PropRest:
    case LocalKind.LoopValue:
      return null;
    case LocalKind.Signal:
      return {
        v: ValueKind.Read,
        range: [expression.start, expression.end],
        // The bare form reads the same value as `.value`, so it classifies the same way.
        result:
          expression.type === 'Identifier'
            ? { kind: ValueIrKind.Member, obj: expressionResult(expression, ctx), name: 'value' }
            : expressionResult(expression, ctx),
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
    case 'UnaryExpression': {
      // `-1` is a literal to authors; keep it one for static folding.
      const operand = node.operator === '-' ? tryLowerExprIr(node.argument, ctx) : null;
      return operand?.kind === ValueIrKind.Lit && typeof operand.value === 'number'
        ? { kind: ValueIrKind.Lit, value: -operand.value }
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

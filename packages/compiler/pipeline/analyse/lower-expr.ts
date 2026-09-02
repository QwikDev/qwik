import {
  BoundaryKind,
  ExprKind,
  FnBodyKind,
  PlaceKind,
  QrlBodyKind,
  QrlPayloadKind,
  ReadRole,
  ResumeKind,
  ValueKind,
  type PayloadId,
  type Value,
} from '../schema';
import { ValueIrKind, type ValueIR } from '../../src/expr-ir';
import { identifierName } from './ast/utils';
import { findRuntimeJsx } from './ast/returns-jsx';
import { collectCaptures, lowerCaptures, type CollectedCaptures } from './ast/capture-analysis';
import { UnsupportedError } from '../errors';
import { pushPayload, pushQrl, QrlIdentityKind, type LowerContext } from './lower-context';
import { LocalKind } from './lower-setup';
import type { Expression } from 'oxc-parser';

export type ReactiveValue = Extract<Value, { v: ValueKind.Read } | { v: ValueKind.Computed }>;

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

function lowerComputedExpressionValue(expression: Expression, ctx: LowerContext, nameCtx: string) {
  switch (expression.type) {
    case 'JSXElement':
    case 'JSXFragment':
      // Branch/collection territory — handled in child position, never a chunk payload.
      throw new UnsupportedError(`the expression "${expression.type}" outside a child position`);
    default: {
      // A payload chunk cannot carry NESTED JSX either — it would ride the payload verbatim.
      if (findRuntimeJsx(expression) !== null) {
        throw new UnsupportedError('JSX inside an expression value');
      }
      const { captures, args, refs } = lowerCaptures(expression, ctx, 'an expression', {
        allowProps: true,
      });
      const range: [number, number] = [expression.start, expression.end];
      const payload = pushPayload(ctx, range);
      recordPayloadAliasReads(ctx, payload, refs);
      const ir = tryLowerExprIr(expression, ctx);
      const expr =
        ir === null
          ? ({ kind: ExprKind.Js, payload } as const)
          : ({ kind: ExprKind.Ir, ir } as const);
      const { use } = pushQrl(
        ctx,
        {
          identity: { kind: QrlIdentityKind.Segment, nameCtx },
          ctxName: nameCtx,
          boundary: { kind: BoundaryKind.Implicit, role: 'expression' },
          payloadKind: QrlPayloadKind.Value,
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
  }
}

export function recordPayloadAliasReads(
  ctx: LowerContext,
  payload: PayloadId,
  refs: CollectedCaptures
): void {
  const target = ctx.plan.payloads[payload];
  for (const entry of refs.locals) {
    if (entry.local.kind !== LocalKind.PropMember) {
      continue;
    }
    for (const read of entry.reads) {
      if (read[0] < target.range[0] || read[1] > target.range[1]) {
        continue;
      }
      target.reads.push({
        range: read,
        binding: entry.local.binding,
        role: ReadRole.Read,
        memberPath: [entry.local.member],
      });
    }
  }
}

/** Inline rows read their loop params lexically: the expression splices in place, no QRL. */
function tryLowerInlineValue(expression: Expression, ctx: LowerContext): ReactiveValue | null {
  if (findRuntimeJsx(expression) !== null) {
    throw new UnsupportedError('JSX inside an expression value');
  }
  const refs = collectCaptures(expression, ctx, ctx.inlineParams!);
  // A reactive read needs an effect, so it cannot splice — null defers to the hole path.
  if (refs.props || refs.locals.length > 0) {
    return null;
  }
  // Module bindings stay readable: the inline row function nests inside the module scope.
  const payload = pushPayload(ctx, [expression.start, expression.end]);
  return {
    v: ValueKind.Computed,
    expr: { kind: ExprKind.Js, payload },
    resume: { r: ResumeKind.Inline },
    compilerString: false,
  };
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
    case 'Identifier': {
      const name = identifierName(node);
      const binding = ctx.bindings.reference(node);
      if (name === null || binding === null) {
        return null;
      }
      if (binding === ctx.propsBinding) {
        return { kind: ValueIrKind.BindingRead, binding };
      }
      // A bare row-index read IS a signal read — the box unwraps at the use site.
      const local = ctx.locals.get(binding);
      if (local?.kind === LocalKind.RowIndex) {
        return { kind: ValueIrKind.SignalRead, binding: local.binding };
      } else if (local?.kind === LocalKind.PropMember) {
        return {
          kind: ValueIrKind.Member,
          obj: { kind: ValueIrKind.BindingRead, binding: local.binding },
          name: local.member,
        };
      }
      return null;
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

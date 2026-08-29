import {
  BoundaryKind,
  ExprKind,
  FnBodyKind,
  PlaceKind,
  QrlBodyKind,
  QrlPayloadKind,
  ValueKind,
  type Value,
} from '../schema';
import { ValueIrKind, type ValueIR } from '../../src/expr-ir';
import { identifierName } from './ast/utils';
import { findRuntimeJsx } from './ast/returns-jsx';
import { lowerCaptures } from './ast/capture-analysis';
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
  const read = trySignalReadValue(expression, ctx);
  if (read !== null) {
    return read;
  }
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
      const { captures, args } = lowerCaptures(expression, ctx, 'an expression', {
        allowProps: true,
      });
      const range: [number, number] = [expression.start, expression.end];
      const payload = pushPayload(ctx, range);
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
        v: ValueKind.Computed,
        expr,
        resume: { qrl: use },
        compilerString: false,
      };
    }
  }
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
  const local = ctx.locals.get(name);
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
      if (name !== null && name === ctx.propsParamName) {
        const binding = ctx.plan.bindings.findIndex((candidate) => candidate.name === name);
        return binding < 0 ? null : { kind: ValueIrKind.BindingRead, binding };
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

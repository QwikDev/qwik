import {
  ArgPass,
  BoundaryKind,
  CaptureAccess,
  ExprKind,
  FnBodyKind,
  PlaceKind,
  QrlBodyKind,
  QrlPayloadKind,
  ValueKind,
  type QrlUse,
  type Value,
} from '../schema';
import { ValueIrKind, type ValueIR } from '../../src/expr-ir';
import type { AstNode } from './ast/ast-types';
import { isNode } from './ast/ast-types';
import { identifierName } from './ast/utils';
import { collectOuterRefs } from './ast/capture-analysis';
import { UnsupportedError } from '../errors';
import { allocateSegment, pushPayload, type LowerContext } from './lower-context';
import { LocalKind } from './lower-setup';

export type ReactiveValue = Extract<Value, { v: ValueKind.Read } | { v: ValueKind.Computed }>;

/** Classifies a JSX expression as a reactive Value: a signal Read, or a Computed value QRL. */
export function lowerExpressionValue(
  expression: AstNode,
  ctx: LowerContext,
  /** Segment identity context: 'text' for holes, the attribute name for props. */
  nameCtx: string
): ReactiveValue {
  const read = trySignalReadValue(expression, ctx);
  if (read !== null) {
    return read;
  }
  const refs = collectOuterRefs(expression, ctx, new Set());
  if (refs.other !== null) {
    throw new UnsupportedError(`an expression capturing "${refs.other}"`);
  }
  const range: [number, number] = [expression.start, expression.end];
  const payload = pushPayload(ctx, range);
  const ir = tryLowerExprIr(expression, ctx);
  const expr =
    ir === null ? ({ kind: ExprKind.Js, payload } as const) : ({ kind: ExprKind.Ir, ir } as const);
  const segment = allocateSegment(ctx, nameCtx);
  const propsBinding = refs.props
    ? ctx.plan.bindings.findIndex((binding) => binding.name === ctx.propsParamName)
    : -1;
  // Captured reactive locals ride as Direct captures ahead of the props object.
  const captures = [
    ...refs.locals.map((entry) => ({
      binding: entry.local.binding,
      access: CaptureAccess.Direct as const,
    })),
    ...(refs.props
      ? [{ binding: propsBinding, access: CaptureAccess.ComponentProp as const }]
      : []),
  ];
  const args: QrlUse['args'] = [
    ...refs.locals.map((entry) => ({
      pass: ArgPass.Binding as const,
      binding: entry.local.binding,
    })),
    ...(refs.props ? [{ pass: ArgPass.Props as const }] : []),
  ];
  ctx.plan.qrls.push({
    id: segment.id,
    parent: null,
    name: segment.name,
    ctxName: nameCtx,
    boundary: { kind: BoundaryKind.Implicit, role: 'expression' },
    markerAttributes: [],
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
    propsParts: [],
  });
  return {
    v: ValueKind.Computed,
    expr,
    resume: { qrl: { qrl: segment.id, args } },
    compilerString: false,
  };
}

/** `count.value` where `count` is a component signal local — a subscription, not a QRL. */
function trySignalReadValue(expression: AstNode, ctx: LowerContext): ReactiveValue | null {
  if (expression.type !== 'MemberExpression' || expression.computed === true) {
    return null;
  }
  const object = expression.object as AstNode;
  const property = identifierName(expression.property);
  const name = identifierName(object);
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
export function tryLowerExprIr(node: AstNode, ctx: LowerContext): ValueIR | null {
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
      if (node.computed === true || node.optional === true) {
        return null;
      }
      const obj = isNode(node.object) ? tryLowerExprIr(node.object, ctx) : null;
      const name = identifierName(node.property);
      return obj === null || name === null ? null : { kind: ValueIrKind.Member, obj, name };
    }
    default:
      return null;
  }
}

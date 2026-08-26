import {
  ArgPass,
  BoundaryKind,
  ExprKind,
  FnBodyKind,
  CaptureAccess,
  OpKind,
  PlaceKind,
  QrlBodyKind,
  QrlPayloadKind,
  Shape,
  ValueKind,
  type Op,
  type QrlUse,
} from '../schema';
import { ValueIrKind } from '../../src/expr-ir';
import type { AstNode } from './ast/ast-types';
import { identifierName } from './ast/utils';
import { collectOuterRefs } from './ast/capture-analysis';
import { UnsupportedError } from '../errors';
import { allocateSegment, pushPayload, type LowerContext } from './lower-context';
import { LocalKind } from './lower-setup';
import { tryLowerExprIr } from './lower-expr-ir';

/** Text hole: a signal `.value` read subscribes directly; other expressions become value QRLs. */
export function lowerTextHole(expression: AstNode, ctx: LowerContext): Op {
  const signalRead = trySignalRead(expression, ctx);
  if (signalRead !== null) {
    return signalRead;
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
  const segment = allocateSegment(ctx, 'text');
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
    ctxName: 'text',
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
  const use: QrlUse = { qrl: segment.id, args };
  return {
    op: OpKind.Hole,
    value: {
      v: ValueKind.Computed,
      expr,
      resume: { qrl: use },
      compilerString: false,
    },
    shape: Shape.Text,
    effect: null,
  };
}

/** `count.value` where `count` is a component signal local — a subscription, not a QRL. */
function trySignalRead(expression: AstNode, ctx: LowerContext): Op | null {
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
        op: OpKind.Hole,
        value: {
          v: ValueKind.Read,
          place: { at: PlaceKind.Slot, index: local.slot },
          expr: { kind: ExprKind.Ir, ir: { kind: ValueIrKind.SignalRead, binding: local.binding } },
        },
        shape: Shape.Text,
        effect: null,
      };
    default:
      throw new UnsupportedError(`reading the "${local.kind}" local "${name}"`);
  }
}

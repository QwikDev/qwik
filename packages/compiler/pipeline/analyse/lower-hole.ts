import {
  ActualPass,
  BoundaryKind,
  ExprKind,
  FnBodyKind,
  FormalAccess,
  OpKind,
  QrlBodyKind,
  QrlPayloadKind,
  Shape,
  ValueKind,
  type Op,
  type QrlUse,
} from '../schema';
import type { AstNode } from './ast/ast-types';
import { collectOuterRefs } from './ast/capture-analysis';
import { UnsupportedError } from '../errors';
import { allocateSegment, pushPayload, type LowerContext } from './lower-context';
import { tryLowerExprIr } from './lower-expr-ir';

/** Text hole: the expression becomes an implicit value QRL invoked during render. */
export function lowerTextHole(expression: AstNode, ctx: LowerContext): Op {
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
    formals: refs.props ? [{ binding: propsBinding, access: FormalAccess.ComponentProp }] : [],
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
  const use: QrlUse = { qrl: segment.id, actuals: refs.props ? [{ pass: ActualPass.Props }] : [] };
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

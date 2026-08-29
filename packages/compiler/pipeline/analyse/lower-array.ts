import type { ArrowFunctionExpression, Expression, JSXElement } from 'oxc-parser';
import {
  BoundaryKind,
  EachSourceKind,
  FnBodyKind,
  LifetimeCommit,
  LifetimeOwner,
  OpKind,
  ProgramBodyKind,
  QrlBodyKind,
  QrlPayloadKind,
  RowKind,
  SeedKind,
  Shape,
  ValueKind,
  type Op,
  type Value,
} from '../schema';
import { SegmentContext } from '../words';
import { UnsupportedError } from '../errors';
import { lowerCaptures } from './ast/capture-analysis';
import { pushPayload, pushQrl, QrlIdentityKind, type LowerContext } from './lower-context';
import { trySignalReadValue } from './lower-expr';
import { lowerJsx } from './lower-jsx';

/** `source.map((item) => <row key={...}/>)` in child position — a keyed, swappable row set. */
export function lowerArray(expression: Expression, ctx: LowerContext): Op {
  switch (expression.type) {
    case 'CallExpression': {
      const callback = expression.arguments[0];
      if (
        expression.callee.type !== 'MemberExpression' ||
        callback?.type !== 'ArrowFunctionExpression'
      ) {
        throw new UnsupportedError('a collection without an inline arrow row');
      }
      switch (callback.body.type) {
        case 'JSXElement':
          return lowerEach(expression.callee.object, callback, callback.body, ctx);
        default:
          throw new UnsupportedError(`the collection row body "${callback.body.type}"`);
      }
    }
    default:
      throw new UnsupportedError(`the collection call "${expression.type}"`);
  }
}

function lowerEach(
  sourceExpression: Expression,
  callback: ArrowFunctionExpression,
  body: JSXElement,
  ctx: LowerContext
): Op {
  if (callback.params.length > 1) {
    throw new UnsupportedError('a collection index parameter');
  }
  const source = lowerReactiveSource(sourceExpression, ctx);
  const lifetime = ctx.plan.lifetimes.length;
  ctx.plan.lifetimes.push({
    id: lifetime,
    parent: 0,
    owner: LifetimeOwner.Collection,
    commit: LifetimeCommit.AtomicReconcile,
  });

  const paramNames = new Set<string>();
  const paramBindings: number[] = [];
  for (const param of callback.params) {
    if (param.type !== 'Identifier') {
      throw new UnsupportedError('a destructured collection row parameter');
    }
    paramNames.add(param.name);
    paramBindings.push(ctx.plan.bindings.findIndex((binding) => binding.name === param.name));
  }

  // The row's segment comes first (legacy order: for_render before for_key), children after.
  const rowCaptures = lowerCaptures(body, ctx, 'a collection row', { localNames: paramNames });
  const program = ctx.plan.programs.length;
  ctx.plan.programs.push({
    body: { kind: ProgramBodyKind.Ops, ops: [] },
    setup: [],
    params: paramBindings,
    lifetime,
    needsId: false,
    async: false,
  });
  const rowRange: [number, number] = [body.start, body.end];
  const { use } = pushQrl(
    ctx,
    {
      identity: { kind: QrlIdentityKind.Segment, nameCtx: SegmentContext.ForRender },
      ctxName: SegmentContext.ForRender,
      boundary: { kind: BoundaryKind.Implicit, role: 'for' },
      payloadKind: QrlPayloadKind.Function,
      authoredAsync: false,
      body: { b: QrlBodyKind.Program, program },
      captures: rowCaptures.captures,
      params: { authored: callback.params.length, used: [], sources: [] },
      origin: {
        range: rowRange,
        functionRange: [callback.start, callback.end],
        calleeRange: null,
        argumentRanges: [],
        paramRanges: callback.params.map((param) => [param.start, param.end] as [number, number]),
        bodyRange: [body.start, body.end],
        bodyKind: FnBodyKind.Expression,
      },
    },
    rowCaptures.args
  );
  const key = lowerKey(body, callback, ctx);
  ctx.plan.programs[program].body = { kind: ProgramBodyKind.Ops, ops: [lowerJsx(body, ctx)] };

  return {
    op: OpKind.Each,
    source,
    key,
    row: { r: RowKind.Chunk, use },
    usesIndexSignal: false,
    id: { kind: SeedKind.For, ordinal: ctx.forCounter.next++ },
    lifetime,
    shape: Shape.Element,
  };
}

/** `signal.value.map(...)` — the runtime iterates the signal container and subscribes. */
function lowerReactiveSource(
  node: Expression,
  ctx: LowerContext
): { s: EachSourceKind; value: Value } {
  const value = trySignalReadValue(node, ctx);
  if (value === null) {
    throw new UnsupportedError('a collection source that is not a signal read');
  }
  return { s: EachSourceKind.Reactive, value };
}

/** The row's `key` attribute — a Function-payload QRL the runtime calls per row with the item. */
function lowerKey(
  row: JSXElement,
  callback: ArrowFunctionExpression,
  ctx: LowerContext
): Value | null {
  const attribute = row.openingElement.attributes.find(
    (candidate) => candidate.type === 'JSXAttribute' && candidate.name.name === 'key'
  );
  if (attribute === undefined || attribute.type !== 'JSXAttribute') {
    return null;
  }
  const value = attribute.value;
  const keyExpression =
    value?.type === 'JSXExpressionContainer'
      ? value.expression.type === 'JSXEmptyExpression'
        ? null
        : value.expression
      : (value ?? null);
  if (keyExpression === null) {
    return null;
  }
  // The loop params are the key fn's own parameters, never captures.
  const paramNames = new Set<string>();
  for (const param of callback.params) {
    if (param.type === 'Identifier') {
      paramNames.add(param.name);
    }
  }
  const { captures, args } = lowerCaptures(keyExpression, ctx, 'a collection key', {
    localNames: paramNames,
  });
  const range: [number, number] = [keyExpression.start, keyExpression.end];
  const payload = pushPayload(ctx, range);
  const { use } = pushQrl(
    ctx,
    {
      identity: { kind: QrlIdentityKind.Segment, nameCtx: SegmentContext.ForKey },
      ctxName: SegmentContext.ForKey,
      boundary: { kind: BoundaryKind.Implicit, role: 'for' },
      payloadKind: QrlPayloadKind.Function,
      authoredAsync: false,
      body: { b: QrlBodyKind.Js, payload },
      captures,
      params: { authored: callback.params.length, used: [], sources: [] },
      origin: {
        range,
        functionRange: [callback.start, callback.end],
        calleeRange: null,
        argumentRanges: [],
        paramRanges: callback.params.map((param) => [param.start, param.end] as [number, number]),
        bodyRange: range,
        bodyKind: FnBodyKind.Expression,
      },
    },
    args
  );
  return { v: ValueKind.Qrl, use };
}

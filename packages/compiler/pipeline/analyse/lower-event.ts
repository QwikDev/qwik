import {
  ArgPass,
  BoundaryKind,
  FnBodyKind,
  CaptureAccess,
  HandlerKind,
  PropKind,
  QrlBodyKind,
  QrlPayloadKind,
  ValueKind,
  type Prop,
  type QrlUse,
} from '../schema';
import type { JSXAttribute } from 'oxc-parser';
import { collectCaptures } from './ast/capture-analysis';
import { UnsupportedError } from '../errors';
import { allocateSegment, pushPayload, type LowerContext } from './lower-context';

/** `on…$` attribute → an event prop referencing an implicit function QRL. */
export function lowerEventAttribute(
  attribute: JSXAttribute,
  ctx: LowerContext,
  authored: string,
  scope: string
): Prop {
  const value = attribute.value;
  if (value === null || value.type !== 'JSXExpressionContainer') {
    throw new UnsupportedError('an event attribute without a handler expression');
  }
  const fn = value.expression;
  if (fn.type !== 'ArrowFunctionExpression') {
    throw new UnsupportedError('an event handler that is not an inline arrow function');
  }
  const params = fn.params;
  const paramNames = new Set<string>();
  for (const param of params) {
    if (param.type !== 'Identifier') {
      throw new UnsupportedError('event handler parameters beyond identifiers');
    }
    paramNames.add(param.name);
  }
  const body = fn.body;
  if (body.type === 'BlockStatement') {
    throw new UnsupportedError('a block-bodied event handler');
  }
  const refs = collectCaptures(body, ctx, paramNames);
  const captured = refs.other ?? (refs.props ? ctx.propsParamName : null);
  if (captured !== null) {
    throw new UnsupportedError(`an event handler capturing "${captured}"`);
  }
  const captures = refs.locals.map((entry) => ({
    binding: entry.local.binding,
    access: CaptureAccess.Direct,
  }));

  const payload = pushPayload(ctx, [fn.start, fn.end]);
  const segment = allocateSegment(ctx, scope);
  ctx.plan.qrls.push({
    id: segment.id,
    parent: null,
    name: segment.name,
    ctxName: authored,
    boundary: { kind: BoundaryKind.Implicit, role: 'event' },
    markerAttributes: [],
    payloadKind: QrlPayloadKind.Function,
    authoredAsync: fn.async === true,
    body: { b: QrlBodyKind.Js, payload },
    captures,
    params: { authored: params.length, used: [], sources: [] },
    origin: {
      range: [attribute.start, attribute.end],
      functionRange: [fn.start, fn.end],
      calleeRange: null,
      argumentRanges: [],
      paramRanges: params.map((param) => [param.start, param.end] as [number, number]),
      bodyRange: [body.start, body.end],
      bodyKind: FnBodyKind.Expression,
    },
    propsParts: [],
  });
  const use: QrlUse = {
    qrl: segment.id,
    args: refs.locals.map((entry) => ({
      pass: ArgPass.Binding,
      binding: entry.local.binding,
    })),
  };
  return {
    k: PropKind.Event,
    name: scope,
    passive: false,
    handlers: [{ h: HandlerKind.Value, value: { v: ValueKind.Qrl, use } }],
  };
}

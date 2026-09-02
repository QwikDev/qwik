import {
  BoundaryKind,
  FnBodyKind,
  HandlerKind,
  PropKind,
  QrlBodyKind,
  QrlPayloadKind,
  ValueKind,
  type Prop,
} from '../schema';
import type { JSXAttribute } from 'oxc-parser';
import { lowerCaptures } from './ast/capture-analysis';
import { UnsupportedError } from '../errors';
import { pushPayload, pushQrl, QrlIdentityKind, type LowerContext } from './lower-context';

/** `on…$` attribute → an event prop referencing an implicit function QRL. */
export function lowerEventAttribute(
  attribute: JSXAttribute,
  ctx: LowerContext,
  authored: string,
  scope: string
): Extract<Prop, { k: PropKind.Event }> {
  const value = attribute.value;
  if (value === null || value.type !== 'JSXExpressionContainer') {
    throw new UnsupportedError('an event attribute without a handler expression');
  }
  const fn = value.expression;
  if (fn.type !== 'ArrowFunctionExpression') {
    throw new UnsupportedError('an event handler that is not an inline arrow function');
  }
  const params = fn.params;
  const paramBindings = new Set<number>();
  for (const param of params) {
    if (param.type !== 'Identifier') {
      throw new UnsupportedError('event handler parameters beyond identifiers');
    }
    const binding = ctx.bindings.declaration(param);
    if (binding === null) {
      throw new UnsupportedError(`the unresolved event parameter "${param.name}"`);
    }
    paramBindings.add(binding);
  }
  const body = fn.body;
  if (body.type === 'BlockStatement') {
    throw new UnsupportedError('a block-bodied event handler');
  }
  const { captures, args } = lowerCaptures(body, ctx, 'an event handler', {
    localBindings: paramBindings,
  });

  const payload = pushPayload(ctx, [fn.start, fn.end]);
  const { use } = pushQrl(
    ctx,
    {
      identity: { kind: QrlIdentityKind.Segment, nameCtx: scope },
      ctxName: authored,
      boundary: { kind: BoundaryKind.Implicit, role: 'event' },
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
    },
    args
  );
  return {
    k: PropKind.Event,
    name: scope,
    passive: false,
    handlers: [{ h: HandlerKind.Value, value: { v: ValueKind.Qrl, use } }],
  };
}

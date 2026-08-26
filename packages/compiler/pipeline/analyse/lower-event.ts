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
import type { AstNode } from './ast/ast-types';
import { isNode } from './ast/ast-types';
import { collectOuterRefs } from './ast/capture-analysis';
import { UnsupportedError } from '../errors';
import { allocateSegment, pushPayload, type LowerContext } from './lower-context';

/** `on…$` attribute → an event prop referencing an implicit function QRL. */
export function lowerEventAttribute(
  attribute: AstNode,
  ctx: LowerContext,
  authored: string,
  scope: string
): Prop {
  const value = attribute.value;
  if (!isNode(value) || value.type !== 'JSXExpressionContainer') {
    throw new UnsupportedError('an event attribute without a handler expression');
  }
  const fn = value.expression as AstNode;
  if (fn.type !== 'ArrowFunctionExpression') {
    throw new UnsupportedError('an event handler that is not an inline arrow function');
  }
  const params = fn.params as AstNode[];
  if (params.some((param) => param.type !== 'Identifier')) {
    throw new UnsupportedError('event handler parameters beyond identifiers');
  }
  const body = fn.body as AstNode;
  if (body.type === 'BlockStatement') {
    throw new UnsupportedError('a block-bodied event handler');
  }
  const paramNames = new Set(
    params.map((param) => String((param as AstNode & { name: string }).name))
  );
  const refs = collectOuterRefs(body, ctx, paramNames);
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

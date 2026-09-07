import { BoundaryKind, HandlerKind, PropKind, ValueKind, type Prop, type Value } from '../schema';
import type { Expression, JSXAttribute } from 'oxc-parser';
import { lowerCaptures } from './ast/capture-analysis';
import { UnsupportedError } from '../errors';
import type { LowerContext } from './lower-context';
import { lowerExpressionValue, lowerInlineExpressionValue } from './lower-expr';
import { lowerFunctionQrl } from './lower-function';
import { LocalKind } from './lower-setup';
import { unwrapExpression } from './ast/utils';

/** `on…$` attribute → an event prop with an authored handler value. */
export function lowerEventAttribute(
  attribute: JSXAttribute,
  ctx: LowerContext,
  authored: string,
  scope: string
): { event: Extract<Prop, { k: PropKind.Event }>; expression: Expression } | null {
  const expression = eventHandlerExpression(attribute);
  if (expression === null) {
    return null;
  }
  let value: Value;
  if (expression.type !== 'ArrowFunctionExpression' && expression.type !== 'FunctionExpression') {
    const binding = ctx.bindings.reference(expression);
    const isQrl = binding !== null && ctx.locals.get(binding)?.kind === LocalKind.Qrl;
    value = isQrl
      ? lowerInlineExpressionValue(
          expression,
          ctx,
          lowerCaptures(expression, ctx, 'an event handler').refs
        )
      : lowerExpressionValue(expression, ctx, authored);
  } else {
    if (expression.body === null) {
      return null;
    }
    const use = lowerFunctionQrl(expression, ctx, {
      nameCtx: scope,
      subject: 'an event handler',
      ctxName: authored,
      boundary: { kind: BoundaryKind.Implicit, role: 'event' },
      origin: {
        range: [attribute.start, attribute.end],
        calleeRange: null,
        argumentRanges: [],
      },
    });
    value = { v: ValueKind.Qrl, use };
  }
  return {
    expression,
    event: {
      k: PropKind.Event,
      name: scope,
      passive: false,
      handlers: [{ h: HandlerKind.Value, value }],
    },
  };
}

function eventHandlerExpression(attribute: JSXAttribute): Expression | null {
  const value = attribute.value;
  if (value === null) {
    return null;
  }
  if (value.type !== 'JSXExpressionContainer') {
    throw new UnsupportedError('an event attribute without a handler expression');
  }
  const expression = value.expression;
  if (expression.type === 'JSXEmptyExpression') {
    return null;
  }
  return unwrapExpression(expression);
}

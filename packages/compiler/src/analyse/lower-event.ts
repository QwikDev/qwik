import {
  BindingScope,
  BoundaryKind,
  HandlerKind,
  PropKind,
  ValueKind,
  type Prop,
  type Value,
} from '../schema';
import type { ArrayExpression, Expression, JSXAttribute } from 'oxc-parser';
import { lowerCaptures } from './ast/capture-analysis';
import { UnsupportedError } from '../errors';
import type { LowerContext } from './lower-context';
import { lowerExpressionValue, lowerInlineExpressionValue, resolveQrlBinding } from './lower-expr';
import { lowerFunctionQrl, lowerMarkerQrl, markerQrlCall } from './lower-function';
import { isFunctionLike, unwrapExpression } from './ast/utils';

/** `on…$` attribute → an event prop with an authored handler value. */
export function lowerEventAttribute(
  attribute: JSXAttribute,
  ctx: LowerContext,
  authored: string,
  scope: string
): { event: Extract<Prop, { k: PropKind.Event }>; expression: Expression } | null {
  const expression = qrlAttributeExpression(attribute);
  if (expression === null) {
    return null;
  }
  const lowerHandler = (handler: Expression): Value => {
    if (handler.type === 'CallExpression') {
      const marker = markerQrlCall(handler, ctx);
      if (marker !== null && marker.marker === undefined) {
        return { v: ValueKind.Qrl, use: lowerMarkerQrl(handler, marker, ctx) };
      }
    }
    if (handler.type !== 'ArrowFunctionExpression' && handler.type !== 'FunctionExpression') {
      return isStaticHandler(handler, ctx)
        ? lowerInlineExpressionValue(
            handler,
            ctx,
            lowerCaptures(handler, ctx, 'an event handler').refs
          )
        : lowerExpressionValue(handler, ctx, authored, false);
    }
    const use = lowerFunctionQrl(handler, ctx, {
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
    return { v: ValueKind.Qrl, use };
  };
  // A handler array flattens; empty entries are ignored, as the runtime ignores them.
  const handlers = (
    expression.type === 'ArrayExpression' ? flattenHandlers(expression) : [expression]
  )
    .filter((handler) => !(isFunctionLike(handler) && handler.body === null))
    .map((handler) => ({ h: HandlerKind.Value as const, value: lowerHandler(handler) }));
  if (handlers.length === 0) {
    return null;
  }
  return {
    expression,
    event: { k: PropKind.Event, name: scope, passive: false, handlers },
  };
}

/** A handler that already is one: a local QRL, or a module binding the module keeps in scope. */
function isStaticHandler(handler: Expression, ctx: LowerContext): boolean {
  if (resolveQrlBinding(handler, ctx) !== null) {
    return true;
  }
  const binding = ctx.bindings.reference(handler);
  const scope = binding === null ? null : ctx.plan.bindings[binding].scope;
  return scope === BindingScope.Import || scope === BindingScope.Module;
}

function flattenHandlers(array: ArrayExpression): Expression[] {
  return array.elements.flatMap((element) => {
    const entry =
      element === null || element.type === 'SpreadElement' ? null : unwrapExpression(element);
    if (entry === null || isEmptyLiteral(entry)) {
      return [];
    }
    return entry.type === 'ArrayExpression' ? flattenHandlers(entry) : [entry];
  });
}

function isEmptyLiteral(expression: Expression): boolean {
  return (
    (expression.type === 'Literal' && expression.value === null) ||
    (expression.type === 'Identifier' && expression.name === 'undefined')
  );
}

/** The expression of a `$` attribute; null when it has no value. */
export function qrlAttributeExpression(attribute: JSXAttribute): Expression | null {
  const value = attribute.value;
  if (value === null) {
    return null;
  }
  if (value.type !== 'JSXExpressionContainer') {
    throw new UnsupportedError('a $ attribute without an expression');
  }
  const expression = value.expression;
  if (expression.type === 'JSXEmptyExpression') {
    return null;
  }
  return unwrapExpression(expression);
}

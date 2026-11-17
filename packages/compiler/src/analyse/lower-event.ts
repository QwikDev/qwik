import {
  BindingScope,
  BoundaryKind,
  BoundaryRole,
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
import {
  liftedLocalQrl,
  lowerFunctionQrl,
  lowerMarkerQrl,
  markerQrlCall,
  type QrlArgumentBoundary,
} from './lower-function';
import { isFunctionLike, unwrapExpression } from './ast/utils';

/** `on…$` attribute → an event prop with an authored handler value. */
export function lowerEventAttribute(
  attribute: JSXAttribute,
  ctx: LowerContext,
  authored: string,
  scope: string,
  role: BoundaryRole.Event | BoundaryRole.EventProp
): { event: Extract<Prop, { k: PropKind.Event }>; expression: Expression } | null {
  const expression = qrlAttributeExpression(attribute);
  if (expression === null) {
    return null;
  }
  const lowerHandler = (handler: Expression): Value =>
    lowerHandlerValue(handler, ctx, {
      nameCtx: scope,
      subject: 'an event handler',
      ctxName: authored,
      boundary: { kind: BoundaryKind.Implicit, role },
      origin: {
        range: [attribute.start, attribute.end],
        calleeRange: null,
        argumentRanges: [],
      },
    });
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
    event: { k: PropKind.Event, name: scope, handlers },
  };
}

/** A handler value: an extracted callback, a `$` marker, a lifted local, a binding or an expression. */
export function lowerHandlerValue(
  handler: Expression,
  ctx: LowerContext,
  boundary: QrlArgumentBoundary
): Value {
  if (handler.type === 'CallExpression') {
    const marker = markerQrlCall(handler, ctx);
    if (marker !== null && marker.marker === undefined) {
      return { v: ValueKind.Qrl, use: lowerMarkerQrl(handler, marker, ctx) };
    }
  }
  if (handler.type !== 'ArrowFunctionExpression' && handler.type !== 'FunctionExpression') {
    const lifted = liftedLocalQrl(handler, ctx);
    if (lifted !== null) {
      return { v: ValueKind.Qrl, use: lifted };
    }
    return isStaticHandler(handler, ctx)
      ? lowerInlineExpressionValue(handler, ctx, lowerCaptures(handler, ctx, boundary.subject).refs)
      : lowerExpressionValue(handler, ctx, boundary.ctxName, false);
  }
  return { v: ValueKind.Qrl, use: lowerFunctionQrl(handler, ctx, boundary) };
}

/**
 * Whether every authored handler is already a value: a callback the compiler extracts, a `$`
 * marker, or a binding. Anything else has to be evaluated, which only an element can do.
 */
export function handlersAreDirect(expression: Expression, ctx: LowerContext): boolean {
  const entries =
    expression.type === 'ArrayExpression' ? flattenHandlers(expression) : [expression];
  return entries.every((entry) => {
    if (isFunctionLike(entry)) {
      return true;
    }
    const marker = entry.type === 'CallExpression' ? markerQrlCall(entry, ctx) : null;
    return (marker !== null && marker.marker === undefined) || isStaticHandler(entry, ctx);
  });
}

/**
 * A handler that already is one: a local QRL, a lifted local (its segment's QRL), or a module
 * binding the module keeps in scope.
 */
function isStaticHandler(handler: Expression, ctx: LowerContext): boolean {
  if (resolveQrlBinding(handler, ctx) !== null) {
    return true;
  }
  const binding = ctx.bindings.reference(handler);
  const scope = binding === null ? null : ctx.plan.bindings[binding].scope;
  return (
    scope === BindingScope.Import ||
    scope === BindingScope.Module ||
    (binding !== null && ctx.lifts.isLifted(binding))
  );
}

function flattenHandlers(array: ArrayExpression): Expression[] {
  return array.elements.flatMap((element) => {
    if (element?.type === 'SpreadElement') {
      throw new UnsupportedError('a spread in an event handler list');
    }
    const entry = element === null ? null : unwrapExpression(element);
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

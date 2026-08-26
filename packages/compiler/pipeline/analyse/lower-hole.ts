import { OpKind, Shape, type Op } from '../schema';
import type { AstNode } from './ast/ast-types';
import { lowerExpressionValue } from './lower-expr';
import type { LowerContext } from './lower-context';

/** Text hole: a signal `.value` read subscribes directly; other expressions become value QRLs. */
export function lowerTextHole(expression: AstNode, ctx: LowerContext): Op {
  return {
    op: OpKind.Hole,
    value: lowerExpressionValue(expression, ctx, 'text'),
    shape: Shape.Text,
    effect: null,
  };
}

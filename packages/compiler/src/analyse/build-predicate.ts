/**
 * A branch test the build already answers. The shapes are the ones an author writes around a build
 * flag: the flag, its negation, and `&&`/`||` over those. Anything else stays a runtime condition.
 */
import { PredicateKind, type ModulePlan, type Predicate } from '../schema';
import { envConstantOf } from './build-env';
import type { LowerContext } from './lower-context';
import { buildConstantOf } from './lower-expr';
import { unwrapExpression } from './ast/utils';
import type { Expression } from 'oxc-parser';

export function buildPredicateOf(test: Expression, ctx: LowerContext): Predicate | undefined {
  const node = unwrapExpression(test);
  if (node.type === 'Identifier') {
    const binding = ctx.bindings.reference(node);
    const constant = binding === null ? null : buildConstantOf(binding, ctx);
    return constant === null ? undefined : { p: PredicateKind.Const, name: constant };
  }
  if (node.type === 'MemberExpression') {
    return envConstantOf(node);
  }
  if (node.type === 'UnaryExpression' && node.operator === '!') {
    const operand = buildPredicateOf(node.argument, ctx);
    return operand === undefined ? undefined : { p: PredicateKind.Not, operand };
  }
  if (node.type === 'LogicalExpression' && (node.operator === '&&' || node.operator === '||')) {
    const left = buildPredicateOf(node.left, ctx);
    const right = left === undefined ? undefined : buildPredicateOf(node.right, ctx);
    return right === undefined
      ? undefined
      : {
          p: node.operator === '&&' ? PredicateKind.And : PredicateKind.Or,
          left: left!,
          right,
        };
  }
  return undefined;
}

export type { ModulePlan };

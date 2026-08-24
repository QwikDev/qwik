import { ValueIrKind, type ValueIR } from '../../src/expr-ir';
import type { AstNode } from './ast/ast-types';
import { isNode } from './ast/ast-types';
import { identifierName } from './ast/utils';
import type { LowerContext } from './lower-context';

/**
 * Lowers an expression to ValueIR when the vocabulary covers it — native generators evaluate IR
 * directly. Null falls back to the JS payload (which the Rust target then refuses).
 */
export function tryLowerExprIr(node: AstNode, ctx: LowerContext): ValueIR | null {
  switch (node.type) {
    case 'Identifier': {
      const name = identifierName(node);
      if (name !== null && name === ctx.propsParamName) {
        const binding = ctx.plan.bindings.findIndex((candidate) => candidate.name === name);
        return binding < 0 ? null : { kind: ValueIrKind.BindingRead, binding };
      }
      return null;
    }
    case 'MemberExpression': {
      if (node.computed === true || node.optional === true) {
        return null;
      }
      const obj = isNode(node.object) ? tryLowerExprIr(node.object, ctx) : null;
      const name = identifierName(node.property);
      return obj === null || name === null ? null : { kind: ValueIrKind.Member, obj, name };
    }
    default:
      return null;
  }
}

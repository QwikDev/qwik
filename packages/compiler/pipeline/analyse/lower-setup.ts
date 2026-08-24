import {
  ArgKind,
  BindTargetKind,
  ExprKind,
  InvokeKind,
  SetupKind,
  type Arg,
  type Setup,
} from '../schema';
import { ValueIrKind, type ValueIR } from '../../src/expr-ir';
import type { AstNode } from './ast/ast-types';
import { isNode } from './ast/ast-types';
import { identifierName } from './ast/utils';
import { UnsupportedError } from '../errors';
import { QwikHook } from '../words';
import { pushPayload, type LowerContext } from './lower-context';

/** What kind of reactive source a setup local holds — read codegen dispatches on it. */
export const enum LocalKind {
  Signal = 'signal',
}

export interface SetupLocal {
  kind: LocalKind;
  slot: number;
  binding: number;
}

/** Component-local reactive sources, resolvable by holes (`count.value` → signal read). */
export type SetupLocals = Map<string, SetupLocal>;

/** Lowers the statements before a component's return: hook calls become typed Setup invokes. */
export function lowerSetup(
  statements: readonly AstNode[],
  ctx: LowerContext
): {
  setup: Setup[];
  locals: SetupLocals;
} {
  const setup: Setup[] = [];
  const locals: SetupLocals = new Map();
  for (const statement of statements) {
    setup.push(lowerSetupStatement(statement, ctx, locals));
  }
  return { setup, locals };
}

function lowerSetupStatement(statement: AstNode, ctx: LowerContext, locals: SetupLocals): Setup {
  if (statement.type !== 'VariableDeclaration' || statement.kind !== 'const') {
    throw new UnsupportedError('a setup statement that is not a const declaration');
  }
  const declarators = statement.declarations as AstNode[];
  if (declarators.length !== 1) {
    throw new UnsupportedError('a setup declaration with multiple declarators');
  }
  const declarator = declarators[0];
  const name = identifierName(declarator.id);
  const init = declarator.init;
  if (name === null || !isNode(init) || init.type !== 'CallExpression') {
    throw new UnsupportedError('a setup declaration that is not a hook call');
  }
  const callee = identifierName(init.callee);
  const hook = callee === null ? undefined : ctx.coreBindings.get(callee);
  switch (hook) {
    case QwikHook.UseSignal:
      return lowerUseSignal(declarator, init, name, ctx, locals);
    default:
      throw new UnsupportedError(`the setup call "${callee ?? '?'}"`);
  }
}

function lowerUseSignal(
  declarator: AstNode,
  init: AstNode,
  name: string,
  ctx: LowerContext,
  locals: SetupLocals
): Setup {
  const args = init.arguments as AstNode[];
  if (args.length > 1) {
    throw new UnsupportedError('useSignal with more than one argument');
  }
  const binding = ctx.plan.bindings.findIndex((candidate) => candidate.name === name);
  const idNode = declarator.id as AstNode;
  locals.set(name, { kind: LocalKind.Signal, slot: locals.size, binding });
  return {
    s: SetupKind.Invoke,
    invoke: {
      op: InvokeKind.UseSignal,
      result: {
        bind: BindTargetKind.Pattern,
        pattern: pushPayload(ctx, [idNode.start, idNode.end]),
        bindings: [binding],
      },
      ...(args.length === 1 ? { initial: lowerInitialArg(args[0], ctx) } : {}),
    },
  };
}

function lowerInitialArg(node: AstNode, ctx: LowerContext): Arg {
  const ir = literalIr(node);
  if (ir !== null) {
    return { a: ArgKind.Expr, expr: { kind: ExprKind.Ir, ir } };
  }
  // IR-uncoverable initials carry source text; native targets refuse them.
  return {
    a: ArgKind.Expr,
    expr: { kind: ExprKind.Js, payload: pushPayload(ctx, [node.start, node.end]) },
  };
}

function literalIr(node: AstNode): ValueIR | null {
  if (node.type === 'Literal') {
    const value = node.value;
    if (
      typeof value === 'string' ||
      typeof value === 'number' ||
      typeof value === 'boolean' ||
      value === null
    ) {
      return { kind: ValueIrKind.Lit, value };
    }
  }
  return null;
}

import {
  CaptureAccess,
  ArgKind,
  BindTargetKind,
  ExprKind,
  InvokeKind,
  SetupKind,
  type Arg,
  type LocalId,
  type Setup,
  type Value,
} from '../schema';
import { ValueIrKind, type ValueIR } from '../../src/expr-ir';
import type {
  Argument,
  BindingPattern,
  CallExpression,
  Directive,
  Statement,
  VariableDeclarator,
} from 'oxc-parser';
import { identifierName } from './ast/utils';
import { UnsupportedError } from '../errors';
import { QwikHook } from '../words';
import { pushPayload, type LowerContext } from './lower-context';
import { lowerCaptures } from './ast/capture-analysis';
import { lowerInlineExpressionValue, recordPayloadAliasReads } from './lower-expr';
import { bindingIdentifiers } from './ast/bindings';
import { findRuntimeJsx } from './ast/returns-jsx';

/** Local value semantics shared by expression and capture lowering. */
export const enum LocalKind {
  Const = 'const',
  Signal = 'signal',
  /** A collection row parameter — captured as LoopValue, delivered per row. */
  LoopValue = 'loop-value',
  /** A collection index parameter — a per-row signal box updated by the reconciler. */
  RowIndex = 'row-index',
  /** A prop member for wrapped destructured props */
  PropMember = 'prop-member',
}

export function lowerConstDeclaration(
  declarator: VariableDeclarator,
  ctx: LowerContext,
  locals: SetupLocals
): Setup {
  if (declarator.init === null) {
    throw new UnsupportedError('a const declaration without an initializer');
  }
  const { refs } = lowerCaptures(declarator, ctx, 'a const initializer', { allowProps: true });
  const value = lowerInlineExpressionValue(declarator.init, ctx, refs);
  return lowerConstBinding(declarator.id, value, ctx, locals);
}

/** Authored patterns keep native defaults, rest and evaluation order. */
export function lowerConstBinding(
  pattern: BindingPattern,
  value: Value,
  ctx: LowerContext,
  locals: SetupLocals
): Setup {
  if (findRuntimeJsx(pattern) !== null) {
    throw new UnsupportedError('JSX inside a binding pattern');
  }
  const bindings = bindingIdentifiers(pattern).map((identifier) => {
    const binding = ctx.bindings.declaration(identifier);
    if (binding === null) {
      throw new UnsupportedError(`the unresolved setup binding "${identifier.name}"`);
    }
    return binding;
  });
  const { refs } = lowerCaptures(pattern, ctx, 'a binding pattern', { allowProps: true });
  const payload = pushPayload(ctx, [pattern.start, pattern.end]);
  recordPayloadAliasReads(ctx, payload, refs);
  for (const binding of bindings) {
    locals.set(binding, { kind: LocalKind.Const, access: CaptureAccess.Direct, slot: -1, binding });
  }
  return {
    s: SetupKind.Const,
    result: {
      bind: BindTargetKind.Pattern,
      pattern: payload,
      bindings,
    },
    value,
  };
}

export type SetupLocal =
  | {
      /** Read-lowering dispatch (how `x`/`x.value` lowers). */
      kind: Exclude<LocalKind, LocalKind.PropMember>;
      /** Delivery contract when a QRL captures this local. */
      access: CaptureAccess;
      slot: number;
      binding: number;
    }
  | {
      kind: LocalKind.PropMember;
      access: CaptureAccess.LoopValue;
      slot: -1;
      binding: number;
      member: string;
    };

/** Local bindings and their expression-read and capture contracts. */
export type SetupLocals = Map<LocalId, SetupLocal>;

/** Lowers the statements before a component's return: hook calls become typed Setup invokes. */
export function lowerSetup(
  statements: readonly (Directive | Statement)[],
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

function lowerSetupStatement(
  statement: Directive | Statement,
  ctx: LowerContext,
  locals: SetupLocals
): Setup {
  if (statement.type !== 'VariableDeclaration' || statement.kind !== 'const') {
    throw new UnsupportedError('a setup statement that is not a const declaration');
  }
  const declarators = statement.declarations;
  if (declarators.length !== 1) {
    throw new UnsupportedError('a setup declaration with multiple declarators');
  }
  const declarator = declarators[0];
  const name = identifierName(declarator.id);
  const init = declarator.init;
  if (name === null || init === null || init.type !== 'CallExpression') {
    throw new UnsupportedError('a setup declaration that is not a hook call');
  }
  const callee = identifierName(init.callee);
  const calleeBinding = ctx.bindings.reference(init.callee);
  const hook = calleeBinding === null ? undefined : ctx.coreBindings.get(calleeBinding);
  switch (hook) {
    case QwikHook.UseSignal:
      return lowerUseSignal(declarator, init, name, ctx, locals);
    default:
      throw new UnsupportedError(`the setup call "${callee ?? '?'}"`);
  }
}

function lowerUseSignal(
  declarator: VariableDeclarator,
  init: CallExpression,
  name: string,
  ctx: LowerContext,
  locals: SetupLocals
): Setup {
  const args = init.arguments;
  if (args.length > 1) {
    throw new UnsupportedError('useSignal with more than one argument');
  }
  const idNode: BindingPattern = declarator.id;
  const binding = ctx.bindings.declaration(idNode);
  if (binding === null) {
    throw new UnsupportedError(`the unresolved setup binding "${name}"`);
  }
  locals.set(binding, {
    kind: LocalKind.Signal,
    access: CaptureAccess.Direct,
    slot: locals.size,
    binding,
  });
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

function lowerInitialArg(node: Argument, ctx: LowerContext): Arg {
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

function literalIr(node: Argument): ValueIR | null {
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

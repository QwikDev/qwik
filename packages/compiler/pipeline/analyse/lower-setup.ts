import {
  CaptureAccess,
  ArgKind,
  BindTargetKind,
  ExprKind,
  InvokeKind,
  SetupKind,
  BoundaryKind,
  ValueKind,
  type BindTarget,
  type Arg,
  type QrlArg,
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
import { identifierName, unwrapExpression } from './ast/utils';
import { UnsupportedError } from '../errors';
import { QwikHook, QwikMarker } from '../words';
import { pushPayload, type LowerContext } from './lower-context';
import { lowerCaptures } from './ast/capture-analysis';
import {
  lowerInlineExpressionValue,
  recordPayloadAliasReads,
  resolveQrlBinding,
} from './lower-expr';
import { findRuntimeJsx } from './ast/returns-jsx';
import { lowerFunctionQrl } from './lower-function';

/** Local value semantics shared by expression and capture lowering. */
export const enum LocalKind {
  Const = 'const',
  Qrl = 'qrl',
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
  const { refs } = lowerCaptures(declarator, ctx, 'a const initializer');
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
  return {
    s: SetupKind.Const,
    ...lowerSetupBinding(
      pattern,
      ctx,
      locals,
      value.v === ValueKind.Qrl ? LocalKind.Qrl : LocalKind.Const
    ),
    value,
  };
}

function lowerSetupBinding(
  pattern: BindingPattern,
  ctx: LowerContext,
  locals: SetupLocals,
  kind: LocalKind.Const | LocalKind.Qrl = LocalKind.Const
): Pick<Extract<Setup, { s: SetupKind.Const }>, 'result' | 'defaultValue'> {
  if (findRuntimeJsx(pattern) !== null) {
    throw new UnsupportedError('JSX inside a binding pattern');
  }
  const bindings = [...ctx.bindings.bindingsOf(pattern)];
  const { refs } = lowerCaptures(pattern, ctx, 'a binding pattern');
  const target = pattern.type === 'AssignmentPattern' ? pattern.left : pattern;
  const defaultValue =
    pattern.type === 'AssignmentPattern'
      ? lowerInlineExpressionValue(pattern.right, ctx, refs)
      : undefined;
  const payload = pushPayload(ctx, [target.start, target.end]);
  recordPayloadAliasReads(ctx, payload, refs);
  const localKind = target.type === 'Identifier' ? kind : LocalKind.Const;
  for (const binding of bindings) {
    locals.set(binding, { kind: localKind, access: CaptureAccess.Direct, slot: -1, binding });
  }
  return {
    result: {
      bind: BindTargetKind.Pattern,
      pattern: payload,
      bindings,
    },
    ...(defaultValue === undefined ? {} : { defaultValue }),
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

/** Component setup shares const lowering while retaining typed hook invokes. */
export function lowerSetup(
  statements: readonly (Directive | Statement)[],
  ctx: LowerContext
): {
  setup: Setup[];
  locals: SetupLocals;
} {
  const setup: Setup[] = [];
  const locals: SetupLocals = new Map();
  const outerLocals = ctx.locals;
  ctx.locals = locals;
  try {
    for (const statement of statements) {
      if (statement.type === 'ExpressionStatement') {
        const call = unwrapExpression(statement.expression);
        const hook = call.type === 'CallExpression' ? resolveSetupHook(call, ctx) : null;
        if (hook !== null && call.type === 'CallExpression') {
          setup.push(lowerSetupHook(call, hook, null, ctx, locals));
          continue;
        }
      }
      if (statement.type !== 'VariableDeclaration' || statement.kind !== 'const') {
        throw new UnsupportedError('a setup statement that is not a const declaration');
      }
      for (const declarator of statement.declarations) {
        setup.push(lowerSetupDeclaration(declarator, ctx, locals));
      }
    }
  } finally {
    ctx.locals = outerLocals;
  }
  return { setup, locals };
}

function lowerSetupDeclaration(
  declarator: VariableDeclarator,
  ctx: LowerContext,
  locals: SetupLocals
): Setup {
  const init = unwrapExpression(declarator.init);
  if (init?.type !== 'CallExpression') {
    return lowerConstDeclaration(declarator, ctx, locals);
  }
  const calleeBinding = ctx.bindings.reference(init.callee);
  const coreApi = calleeBinding === null ? undefined : ctx.coreBindings.get(calleeBinding);
  const hook = resolveSetupHook(init, ctx);
  if (hook !== null && coreApi !== QwikHook.UseComputed) {
    return lowerSetupHook(init, hook, declarator.id, ctx, locals);
  }
  if (coreApi === undefined) {
    return lowerConstDeclaration(declarator, ctx, locals);
  }
  const name = identifierName(declarator.id);
  if (name === null) {
    throw new UnsupportedError('a non-identifier core API binding');
  }
  switch (coreApi) {
    case QwikMarker.Dollar:
      return lowerConstBinding(
        declarator.id,
        {
          v: ValueKind.Qrl,
          use: lowerSetupCallback(init, name, coreApi, ctx),
        },
        ctx,
        locals
      );
    case QwikHook.UseComputed: {
      const qrl = lowerHookCallback(init, name, coreApi, ctx);
      return {
        s: SetupKind.Invoke,
        invoke: {
          op: InvokeKind.UseComputed,
          result: lowerSignalBinding(declarator.id, name, ctx, locals),
          qrl,
        },
      };
    }
    case QwikHook.UseSignal:
      return lowerUseSignal(declarator, init, name, ctx, locals);
    default:
      throw new UnsupportedError(`the setup call "${identifierName(init.callee) ?? '?'}"`);
  }
}

function lowerHookCallback(
  call: CallExpression,
  name: string,
  calleeName: string,
  ctx: LowerContext
): QrlArg {
  const argument = call.arguments[0];
  const expression = argument?.type === 'SpreadElement' ? null : unwrapExpression(argument);
  const binding = expression === null ? null : resolveQrlBinding(expression, ctx);
  const calleeBinding = ctx.bindings.reference(call.callee);
  const isComputed =
    calleeBinding !== null && ctx.coreBindings.get(calleeBinding) === QwikHook.UseComputed;
  if (binding !== null && !call.optional && (!isComputed || call.arguments.length === 1)) {
    return { a: ArgKind.QrlBinding, binding };
  }
  return { a: ArgKind.Qrl, use: lowerSetupCallback(call, name, calleeName, ctx) };
}

function lowerSetupCallback(
  init: CallExpression,
  name: string,
  calleeName: string,
  ctx: LowerContext
) {
  const binding = ctx.bindings.reference(init.callee);
  const coreApi = binding === null ? undefined : ctx.coreBindings.get(binding);
  const argument = init.arguments[0];
  const fn = argument?.type === 'SpreadElement' ? null : unwrapExpression(argument);
  if (
    init.optional ||
    ((coreApi === QwikMarker.Dollar || coreApi === QwikHook.UseComputed) &&
      init.arguments.length !== 1) ||
    (fn?.type !== 'ArrowFunctionExpression' && fn?.type !== 'FunctionExpression')
  ) {
    throw new UnsupportedError(`${calleeName}() without an inline first callback`);
  }
  return lowerFunctionQrl(fn, ctx, {
    nameCtx: name,
    subject: 'a QRL callback',
    ctxName: calleeName,
    boundary:
      coreApi === QwikMarker.Dollar
        ? { kind: BoundaryKind.Explicit }
        : { kind: BoundaryKind.Implicit, role: 'hook' },
    origin: {
      range: [init.start, init.end],
      calleeRange: [init.callee.start, init.callee.end],
      argumentRanges: init.arguments.map((arg) => [arg.start, arg.end]),
    },
  });
}

function resolveSetupHook(call: CallExpression, ctx: LowerContext) {
  const binding = ctx.bindings.reference(call.callee);
  if (binding === null) {
    return null;
  }
  const imported = ctx.plan.imports.find((entry) => entry.binding === binding);
  const name =
    imported !== undefined && imported.imported !== 'default' && imported.imported !== '*'
      ? imported.imported
      : ctx.plan.bindings[binding].name;
  return /^use.+\$$/.test(name) ? { binding, name } : null;
}

function lowerSetupHook(
  call: CallExpression,
  hook: { binding: LocalId; name: string },
  pattern: BindingPattern | null,
  ctx: LowerContext,
  locals: SetupLocals
): Setup {
  const args: Arg[] = [
    lowerHookCallback(call, identifierName(pattern) ?? hook.name, hook.name, ctx),
  ];
  for (const argument of call.arguments.slice(1)) {
    const expression = argument.type === 'SpreadElement' ? argument.argument : argument;
    const { refs } = lowerCaptures(expression, ctx, 'a hook argument');
    const value = lowerInlineExpressionValue(expression, ctx, refs);
    args.push({
      a: argument.type === 'SpreadElement' ? ArgKind.Spread : ArgKind.Expr,
      expr: value.expr,
    });
  }
  return {
    s: SetupKind.Hook,
    binding: hook.binding,
    args,
    result: pattern === null ? null : lowerSetupBinding(pattern, ctx, locals).result,
  };
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
  return {
    s: SetupKind.Invoke,
    invoke: {
      op: InvokeKind.UseSignal,
      result: lowerSignalBinding(declarator.id, name, ctx, locals),
      ...(args.length === 1 ? { initial: lowerInitialArg(args[0], ctx) } : {}),
    },
  };
}

function lowerSignalBinding(
  idNode: BindingPattern,
  name: string,
  ctx: LowerContext,
  locals: SetupLocals
): BindTarget {
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
    bind: BindTargetKind.Pattern,
    pattern: pushPayload(ctx, [idNode.start, idNode.end]),
    bindings: [binding],
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

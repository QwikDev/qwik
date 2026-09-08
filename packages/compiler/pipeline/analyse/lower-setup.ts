import {
  CaptureAccess,
  ArgKind,
  BindTargetKind,
  SetupKind,
  BoundaryKind,
  ValueKind,
  ProgramBodyKind,
  VarKind,
  CallTargetKind,
  type CallTarget,
  type CoreOperation,
  type LocalId,
  type Arg,
  type QrlArg,
  type Setup,
  type Value,
} from '../schema';
import type {
  Argument,
  BindingPattern,
  CallExpression,
  Directive,
  Function as FunctionNode,
  Statement,
  VariableDeclarator,
  VariableDeclaration,
  Node,
} from 'oxc-parser';
import { identifierName, unwrapExpression } from './ast/utils';
import { UnsupportedError } from '../errors';
import { QwikMarker, SegmentContext } from '../words';
import { coreSetupCalls } from './setup-api';
import { LocalKind, type SetupLocals } from './locals';
import { pushPayload, type LowerContext } from './lower-context';
import { collectCaptures, lowerCaptures } from './ast/capture-analysis';
import {
  lowerInlineExpressionValue,
  recordPayloadReads,
  resolveQrlBinding,
  tryLowerExprIr,
} from './lower-expr';
import { findRuntimeJsx } from './ast/returns-jsx';
import { lowerFunctionQrl } from './lower-function';
import { isNode, type WalkableNode } from './ast/ast-types';
import { isFunctionLike } from './ast/utils';
import { lowerRenderExpression, lowerRenderQrl } from './lower-jsx';
import { findComponentCandidates } from './ast/returns-jsx';
import { discoverComponents } from './discover';
import { lowerComponentParameter } from './lower-parameter';

export function lowerConstDeclaration(
  declarator: VariableDeclarator,
  ctx: LowerContext,
  locals: SetupLocals
): Setup {
  if (declarator.init === null) {
    throw new UnsupportedError('a const declaration without an initializer');
  }
  const expression = unwrapExpression(declarator.init);
  if (expression.type === 'JSXElement' || expression.type === 'JSXFragment') {
    const use = lowerRenderQrl(
      [expression],
      ctx,
      'a JSX value',
      SegmentContext.JsxValue,
      'jsx-value',
      () => lowerRenderExpression(expression, ctx)
    );
    return lowerConstBinding(declarator.id, { v: ValueKind.Qrl, use }, ctx, locals);
  }
  const { refs } = lowerCaptures(declarator.init, ctx, 'a const initializer');
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
  kind: LocalKind.Const | LocalKind.Qrl | LocalKind.Signal = LocalKind.Const
): Pick<Extract<Setup, { s: SetupKind.Const }>, 'result' | 'defaultValue'> {
  if (findRuntimeJsx(pattern) !== null) {
    throw new UnsupportedError('JSX inside a binding pattern');
  }
  if (kind === LocalKind.Signal && pattern.type !== 'Identifier') {
    throw new UnsupportedError('a non-identifier core API binding');
  }
  const bindings = [...ctx.bindings.bindingsOf(pattern)];
  const { refs } = lowerCaptures(pattern, ctx, 'a binding pattern');
  const target = pattern.type === 'AssignmentPattern' ? pattern.left : pattern;
  const defaultValue =
    pattern.type === 'AssignmentPattern'
      ? lowerInlineExpressionValue(pattern.right, ctx, refs)
      : undefined;
  const payload = pushPayload(ctx, [target.start, target.end]);
  recordPayloadReads(ctx, payload, refs);
  const localKind = target.type === 'Identifier' ? kind : LocalKind.Const;
  for (const binding of bindings) {
    locals.set(binding, {
      kind: localKind,
      access: CaptureAccess.Direct,
      slot:
        localKind === LocalKind.Signal
          ? [...locals.values()].filter((local) => local.kind === LocalKind.Signal).length
          : -1,
      binding,
    });
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

/** Component setup shares call lowering and result binding classification. */
export function lowerSetup(
  statements: readonly (Directive | Statement)[],
  ctx: LowerContext,
  locals: SetupLocals = new Map()
): {
  setup: Setup[];
  locals: SetupLocals;
} {
  const setup: Setup[] = [];
  const outerLocals = ctx.locals;
  ctx.locals = locals;
  try {
    registerSetupLocals(statements, ctx, locals);
    for (const statement of statements) {
      if (
        statement.type === 'VariableDeclaration' &&
        (statement.kind === 'let' || statement.kind === 'var')
      ) {
        setup.push(...lowerMutableDeclaration(statement, ctx, locals));
        continue;
      }
      if (statement.type === 'FunctionDeclaration') {
        const localComponent = lowerLocalComponent(statement, ctx, locals);
        if (localComponent !== null) {
          setup.push(localComponent);
          continue;
        }
      }
      if (statement.type === 'ExpressionStatement') {
        const expression = unwrapExpression(statement.expression);
        const call = expression.type === 'ChainExpression' ? expression.expression : expression;
        const hook = call.type === 'CallExpression' ? resolveSetupCall(call, ctx) : null;
        if (hook !== null && /^use.+/.test(hook.name) && call.type === 'CallExpression') {
          setup.push(lowerSetupCall(call, hook, null, ctx, locals));
          continue;
        }
      }
      if (statement.type !== 'VariableDeclaration' || statement.kind !== 'const') {
        setup.push(lowerJsStatement(statement, ctx, locals));
        continue;
      }
      for (const declarator of statement.declarations) {
        setup.push(
          lowerLocalComponent({ ...statement, declarations: [declarator] }, ctx, locals) ??
            lowerSetupDeclaration(declarator, ctx, locals)
        );
      }
    }
  } finally {
    ctx.locals = outerLocals;
  }
  return { setup, locals };
}

function registerSetupLocals(
  statements: readonly (Directive | Statement)[],
  ctx: LowerContext,
  locals: SetupLocals
): void {
  for (const binding of ctx.bindings.declaredWithin(statements)) {
    if (locals.has(binding)) {
      continue;
    }
    const authored = ctx.plan.bindings[binding];
    const isMutable = authored.varKind === VarKind.Let || authored.varKind === VarKind.Var;
    locals.set(binding, {
      kind: isMutable ? LocalKind.Mutable : LocalKind.Const,
      access: CaptureAccess.Direct,
      slot: -1,
      binding,
    });
  }
}

function lowerMutableDeclaration(
  statement: VariableDeclaration,
  ctx: LowerContext,
  locals: SetupLocals
): Setup[] {
  const setup: Setup[] = [];
  for (const declarator of statement.declarations) {
    const bindings = ctx.bindings.bindingsOf(declarator.id);
    const registered = bindings.map((binding) => locals.get(binding)!);
    const initial: Setup =
      declarator.init === null
        ? { s: SetupKind.Const, ...lowerSetupBinding(declarator.id, ctx, locals) }
        : lowerSetupDeclaration(declarator, ctx, locals);
    if (initial.s !== SetupKind.Const && initial.s !== SetupKind.Call) {
      throw new UnsupportedError('a mutable setup binding');
    }
    initial.declarationKind = statement.kind === 'let' ? VarKind.Let : VarKind.Var;
    setup.push(initial);
    bindings.forEach((binding, index) => {
      locals.set(binding, registered[index]);
    });
  }
  return setup;
}

function lowerSetupDeclaration(
  declarator: VariableDeclarator,
  ctx: LowerContext,
  locals: SetupLocals
): Setup {
  const expression = unwrapExpression(declarator.init);
  const init = expression?.type === 'ChainExpression' ? expression.expression : expression;
  if (init?.type !== 'CallExpression') {
    return lowerConstDeclaration(declarator, ctx, locals);
  }
  const calleeBinding = ctx.bindings.reference(init.callee);
  const coreApi = calleeBinding === null ? undefined : ctx.coreBindings.get(calleeBinding);
  if (coreApi === QwikMarker.Dollar) {
    const name = identifierName(declarator.id);
    if (name === null) {
      throw new UnsupportedError('a non-identifier core API binding');
    }
    return lowerConstBinding(
      declarator.id,
      { v: ValueKind.Qrl, use: lowerSetupCallback(init, name, coreApi, ctx) },
      ctx,
      locals
    );
  }
  const callee = resolveSetupCall(init, ctx);
  if (expression?.type === 'ChainExpression' && (callee === null || !/^use.+/.test(callee.name))) {
    return lowerConstDeclaration(declarator, ctx, locals);
  }
  if (callee !== null) {
    return lowerSetupCall(init, callee, declarator.id, ctx, locals);
  }
  return lowerConstDeclaration(declarator, ctx, locals);
}

function lowerLocalComponent(
  statement: FunctionNode | VariableDeclaration,
  ctx: LowerContext,
  locals: SetupLocals
): Setup | null {
  const candidates = findComponentCandidates(
    { body: [statement] },
    ctx.jsx,
    ctx.bindings,
    ctx.coreBindings
  );
  if (candidates.length !== 1) {
    return null;
  }
  const component = discoverComponents(candidates)[0];
  const outerProps = ctx.propsBinding;
  const outerMembers = ctx.propsMembers;
  try {
    const parameter = lowerComponentParameter(component, ctx);
    const nestedLocals = new Map([...locals, ...parameter.locals]);
    if (outerProps !== null) {
      nestedLocals.set(outerProps, {
        kind: LocalKind.Const,
        access: CaptureAccess.Direct,
        slot: -1,
        binding: outerProps,
      });
    }
    const setup = lowerSetup(component.setupStatements, ctx, nestedLocals);
    ctx.locals = setup.locals;
    const ops =
      component.renderExpression === null
        ? []
        : lowerRenderExpression(component.renderExpression, ctx);
    const program =
      ctx.plan.programs.push({
        body: { kind: ProgramBodyKind.Ops, ops },
        setup: [...parameter.setup, ...setup.setup],
        params: [],
        lifetime: 0,
        needsId: false,
        async: false,
      }) - 1;
    return {
      s: SetupKind.LocalComponent,
      program,
      id: component.name,
      name: component.name,
      declarationKind: component.declarationKind,
      parameter:
        parameter.surface === null
          ? null
          : { pattern: pushPayload(ctx, component.param!.range), surface: parameter.surface },
    };
  } finally {
    ctx.propsBinding = outerProps;
    ctx.propsMembers = outerMembers;
    ctx.locals = locals;
  }
}

/** Preserve control flow; replace only setup and render boundaries. */
function lowerJsStatement(
  statement: Directive | Statement,
  ctx: LowerContext,
  locals: SetupLocals
): Setup {
  const payload = pushPayload(ctx, [statement.start, statement.end]);
  const target = ctx.plan.payloads[payload];
  const visit = (node: unknown, root = false, parent: Node | null = null): void => {
    if (Array.isArray(node)) {
      node.forEach((child) => visit(child));
      return;
    }
    if (!isNode(node)) {
      return;
    }
    if (
      node.type === 'ForStatement' ||
      node.type === 'ForInStatement' ||
      node.type === 'ForOfStatement'
    ) {
      throw new UnsupportedError('a for loop in component setup');
    }
    if (
      !root &&
      (node.type === 'VariableDeclaration' ||
        node.type === 'FunctionDeclaration' ||
        node.type === 'ExpressionStatement')
    ) {
      const block =
        parent?.type === 'IfStatement' ||
        parent?.type === 'WhileStatement' ||
        parent?.type === 'DoWhileStatement' ||
        parent?.type === 'LabeledStatement';
      (target.setups ??= []).push({
        range: [node.start, node.end],
        setup: lowerSetup([node], ctx, locals).setup,
        block,
      });
      return;
    }
    if (isFunctionLike(node)) {
      if (findRuntimeJsx(node) !== null) {
        throw new UnsupportedError('JSX inside an ordinary setup function');
      }
      return;
    }
    if (node.type === 'ReturnStatement') {
      const ops =
        node.argument === null ? [] : lowerRenderExpression(unwrapExpression(node.argument), ctx);
      const program =
        ctx.plan.programs.push({
          body: { kind: ProgramBodyKind.Ops, ops },
          setup: [],
          params: [],
          lifetime: 0,
          needsId: false,
          async: false,
        }) - 1;
      target.renders.push(
        node.argument === null
          ? { range: [node.start, node.end], program, statement: true }
          : { range: [node.argument.start, node.argument.end], program }
      );
      return;
    }
    if (node.type === 'JSXElement' || node.type === 'JSXFragment') {
      throw new UnsupportedError('JSX outside a setup return');
    }
    for (const key of Object.keys(node)) {
      if (key !== 'parent') {
        visit((node as WalkableNode)[key], false, node);
      }
    }
  };
  visit(statement, true);
  recordPayloadReads(ctx, payload, collectCaptures(statement as Node, ctx, new Set()));
  return { s: SetupKind.Js, payload };
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
  if (binding !== null && !call.optional) {
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
    (coreApi === QwikMarker.Dollar && init.arguments.length !== 1) ||
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

function resolveSetupCall(call: CallExpression, ctx: LowerContext) {
  const binding = ctx.bindings.reference(call.callee);
  if (binding === null) {
    return null;
  }
  const imported = ctx.plan.imports.find((entry) => entry.binding === binding);
  const coreApi = ctx.coreBindings.get(binding);
  const name =
    coreApi ??
    (imported !== undefined && imported.imported !== 'default' && imported.imported !== '*'
      ? imported.imported
      : ctx.plan.bindings[binding].name);
  return /^use.+/.test(name) || ctx.locals.has(binding)
    ? { binding, name, contract: coreApi === undefined ? undefined : coreSetupCalls.get(coreApi) }
    : null;
}

function lowerSetupCall(
  call: CallExpression,
  callee: NonNullable<ReturnType<typeof resolveSetupCall>>,
  pattern: BindingPattern | null,
  ctx: LowerContext,
  locals: SetupLocals
): Setup {
  if (call.optional) {
    throw new UnsupportedError('an optional setup call');
  }
  const contract = pattern === null ? undefined : callee.contract;
  if (contract?.maxArgs !== undefined && call.arguments.length > contract.maxArgs) {
    throw new UnsupportedError(`${callee.name} with more than ${contract.maxArgs} arguments`);
  }
  const args = /^use.+\$$/.test(callee.name)
    ? lowerQrlHookArgs(call, identifierName(pattern) ?? callee.name, callee.name, ctx)
    : call.arguments.map((argument) => lowerHookArg(argument, ctx));
  return {
    s: SetupKind.Call,
    target: lowerCallTarget(call.callee, callee.binding, contract?.operation, ctx),
    args,
    result:
      pattern === null ? null : lowerSetupBinding(pattern, ctx, locals, contract?.result).result,
  };
}

function lowerCallTarget(
  expression: CallExpression['callee'],
  binding: LocalId,
  operation: CoreOperation | undefined,
  ctx: LowerContext
): CallTarget {
  if (operation !== undefined) {
    return { kind: CallTargetKind.Core, operation };
  }
  const value = tryLowerExprIr(expression, ctx);
  return value === null
    ? { kind: CallTargetKind.Binding, binding }
    : { kind: CallTargetKind.Value, value };
}

function lowerQrlHookArgs(
  call: CallExpression,
  name: string,
  calleeName: string,
  ctx: LowerContext
): [QrlArg, ...Arg[]] {
  const args: [QrlArg, ...Arg[]] = [lowerHookCallback(call, name, calleeName, ctx)];
  for (const argument of call.arguments.slice(1)) {
    args.push(lowerHookArg(argument, ctx));
  }
  return args;
}

function lowerHookArg(argument: Argument, ctx: LowerContext): Arg {
  const expression = argument.type === 'SpreadElement' ? argument.argument : argument;
  // Inline arguments retain module references and rewrite local aliases.
  const refs = collectCaptures(expression, ctx, new Set());
  const value = lowerInlineExpressionValue(expression, ctx, refs);
  return {
    a: argument.type === 'SpreadElement' ? ArgKind.Spread : ArgKind.Expr,
    expr: value.expr,
  };
}

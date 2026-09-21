import {
  CaptureAccess,
  BindTargetKind,
  SetupKind,
  BoundaryKind,
  ValueKind,
  ProgramBodyKind,
  VarKind,
  type LocalId,
  type QrlUse,
  type Setup,
  type Value,
} from '../schema';
import type {
  BindingPattern,
  Directive,
  Function as FunctionNode,
  ArrowFunctionExpression,
  BindingIdentifier,
  Statement,
  VariableDeclarator,
  VariableDeclaration,
  Expression,
  Node,
} from 'oxc-parser';
import { identifierName, unwrapExpression } from './ast/utils';
import { UnsupportedError } from '../errors';
import { QwikMarker } from '../words';
import { localReadIr, LocalKind, type SetupLocals } from './locals';
import { pushPayload, type LowerContext } from './lower-context';
import { collectCaptures, lowerCaptures } from './ast/capture-analysis';
import {
  lowerInlineExpressionValue,
  recordPayloadJsx,
  recordPayloadReads,
  tryLowerExprIr,
} from './lower-expr';
import { findRuntimeJsx } from './ast/returns-jsx';
import { isNode, type WalkableNode } from './ast/ast-types';
import { isFunctionLike } from './ast/utils';
import { recordSetupAwaits } from './lower-component-body';
import { lowerRenderExpression } from './lower-children';
import { findComponentCandidates } from './ast/returns-jsx';
import { discoverComponents, type DiscoveredComponent } from './discover';
import { lowerComponentParameter, pathReadIr } from './lower-parameter';
import { readObjectParameter } from './ast/parameter-members';
import { ValueIrKind, type ValueIR } from '../schema/value-ir';

import { lowerSetupCall, lowerSetupCallback, resolveSetupCall } from './lower-setup-call';
import { lowerComponentValue, lowerQrlArgument } from './lower-function';
import { recordFunctionJsx } from './lower-function';
export function lowerConstDeclaration(
  declarator: VariableDeclarator,
  ctx: LowerContext,
  locals: SetupLocals
): Setup {
  if (declarator.init === null) {
    throw new UnsupportedError('a const declaration without an initializer');
  }
  const { refs } = lowerCaptures(declarator.init, ctx, 'a const initializer', new Set(), false);
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

export function lowerSetupBinding(
  pattern: BindingPattern,
  ctx: LowerContext,
  locals: SetupLocals,
  kind: LocalKind.Const | LocalKind.Qrl | LocalKind.Signal | LocalKind.Store = LocalKind.Const
): Pick<Extract<Setup, { s: SetupKind.Const }>, 'result' | 'defaultValue'> {
  if (findRuntimeJsx(pattern) !== null) {
    throw new UnsupportedError('JSX inside a binding pattern');
  }
  if (kind === LocalKind.Signal && pattern.type !== 'Identifier') {
    throw new UnsupportedError('a non-identifier core API binding');
  }
  const bindings = [...ctx.bindings.bindingsOf(pattern)];
  const { refs } = lowerCaptures(pattern, ctx, 'a binding pattern', new Set(), false);
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
        setup.push(
          localComponent ??
            lowerLocalFunction(statement, statement.id!, ctx, locals, (scope) =>
              lowerJsStatement(statement, scope, locals)
            )
        );
        continue;
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
        const init = declarator.init === null ? null : unwrapExpression(declarator.init);
        // A live alias registers locals and emits nothing.
        const entry =
          lowerLocalComponent({ ...statement, declarations: [declarator] }, ctx, locals) ??
          (init !== null && isFunctionLike(init) && declarator.id.type === 'Identifier'
            ? lowerLocalFunction(init, declarator.id, ctx, locals, (scope) =>
                lowerConstDeclaration(declarator, scope, locals)
              )
            : lowerAliasOrSetupDeclaration(declarator, ctx, locals));
        if (entry !== null) {
          setup.push(entry);
        }
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

interface AliasSource {
  read: ValueIR;
  /** The captured root: the props object, a store or a signal. */
  root: LocalId;
  access: CaptureAccess.ComponentProp | CaptureAccess.Direct;
}

/**
 * `props.x`, `store.x.y`, `count.value` and members of another alias stay live: a read of the alias
 * is a read of the source, so no snapshot is taken.
 */
function aliasSource(expression: Expression, ctx: LowerContext): AliasSource | null {
  if (expression.type === 'Identifier') {
    const binding = ctx.bindings.reference(expression);
    if (binding === null) {
      return null;
    }
    const local = ctx.locals.get(binding);
    if (local?.kind === LocalKind.PropMember && local.access !== CaptureAccess.LoopValue) {
      // The alias inherits the member's default too.
      return { read: localReadIr(local)!, root: local.binding, access: local.access };
    }
    const access =
      binding === ctx.propsBinding
        ? CaptureAccess.ComponentProp
        : local?.kind === LocalKind.Store
          ? CaptureAccess.Direct
          : null;
    return access === null
      ? null
      : { read: { kind: ValueIrKind.BindingRead, binding }, root: binding, access };
  }
  if (expression.type !== 'MemberExpression' || expression.optional) {
    return null;
  }
  // A literal index (`list.value[0]`) is as live as a named member.
  const key = expression.computed ? unwrapExpression(expression.property) : null;
  const index =
    key?.type === 'Literal' && (typeof key.value === 'string' || typeof key.value === 'number')
      ? key.value
      : null;
  const name = expression.computed ? null : identifierName(expression.property);
  if (name === null && index === null) {
    return null;
  }
  const object = unwrapExpression(expression.object);
  const signal = object.type === 'Identifier' ? ctx.bindings.reference(object) : null;
  if (signal !== null && name === 'value' && ctx.locals.get(signal)?.kind === LocalKind.Signal) {
    return {
      read: { kind: ValueIrKind.SignalRead, binding: signal },
      root: signal,
      access: CaptureAccess.Direct,
    };
  }
  const source = aliasSource(object, ctx);
  if (source === null) {
    return null;
  }
  const read: ValueIR =
    name === null
      ? { kind: ValueIrKind.Index, obj: source.read, key: { kind: ValueIrKind.Lit, value: index! } }
      : { kind: ValueIrKind.Member, obj: source.read, name };
  return { ...source, read };
}

function lowerAliasOrSetupDeclaration(
  declarator: VariableDeclarator,
  ctx: LowerContext,
  locals: SetupLocals
): Setup | null {
  const alias = lowerAliasDeclaration(declarator, ctx, locals);
  return alias === undefined ? lowerSetupDeclaration(declarator, ctx, locals) : alias;
}

/**
 * `const x = props.y` and `const { a, b: c } = store` register live aliases and emit nothing;
 * `const { a, ...rest } = props` also emits the rest proxy. Undefined when not an alias.
 */
function lowerAliasDeclaration(
  declarator: VariableDeclarator,
  ctx: LowerContext,
  locals: SetupLocals
): Setup | null | undefined {
  const init = declarator.init === null ? null : unwrapExpression(declarator.init);
  const source = init === null ? null : aliasSource(init, ctx);
  if (source === null) {
    return undefined;
  }
  const register = (node: Node, read: ValueIR, defaultValue?: ValueIR) =>
    locals.set(ctx.bindings.declaration(node)!, {
      kind: LocalKind.PropMember,
      access: source.access,
      slot: -1,
      binding: source.root,
      read,
      defaultValue,
    });
  if (declarator.id.type === 'Identifier') {
    register(declarator.id, source.read);
    return null;
  }
  const object = readObjectParameter(declarator.id);
  if (object === null) {
    return undefined;
  }
  // A rest is only live off the props object itself, where a proxy can exclude the named keys.
  const isPropsRest =
    source.read.kind === ValueIrKind.BindingRead && source.root === ctx.propsBinding;
  if (object.rest !== null && !isPropsRest) {
    return undefined;
  }
  const defaults = object.members.map((member) =>
    member.defaultValue === null ? undefined : tryLowerExprIr(member.defaultValue, ctx)
  );
  // A default the IR cannot carry keeps the whole pattern a native snapshot.
  if (defaults.some((value) => value === null)) {
    return undefined;
  }
  object.members.forEach((member, index) =>
    register(member.node, pathReadIr(source.read, member.path, ctx), defaults[index] ?? undefined)
  );
  if (object.rest === null) {
    return null;
  }
  const rest = ctx.bindings.declaration(object.rest)!;
  locals.set(rest, {
    kind: LocalKind.PropRest,
    access: CaptureAccess.Direct,
    binding: rest,
    slot: -1,
  });
  const excluded = [...new Set(object.members.map((member) => member.name))];
  return { s: SetupKind.PropRest, result: rest, props: source.root, excluded };
}

/**
 * A body function stays authored unless a boundary calls it; then it lifts to a segment the callers
 * import statically, and the body binds it to its captures instead of declaring it.
 */
function lowerLocalFunction(
  fn: FunctionNode | ArrowFunctionExpression,
  id: BindingIdentifier,
  ctx: LowerContext,
  locals: SetupLocals,
  lowerAuthored: (scope: LowerContext) => Setup,
  liftBody?: (scope: LowerContext) => QrlUse
): Setup {
  const binding = ctx.bindings.declaration(id)!;
  const name = id.name;
  const entry: Extract<Setup, { s: SetupKind.LocalFunction }> = {
    s: SetupKind.LocalFunction,
    binding,
    hoisted: fn.type === 'FunctionDeclaration',
  };
  // Both forms lower later, in the scope of this statement rather than of the module end.
  const scope = { ...ctx, locals };
  const lift = () =>
    (entry.use ??=
      liftBody === undefined
        ? lowerQrlArgument(fn, scope, {
            nameCtx: name,
            subject: `the local function "${name}"`,
            ctxName: name,
            boundary: { kind: BoundaryKind.Implicit, role: 'function' },
            origin: { range: [fn.start, fn.end], calleeRange: null, argumentRanges: [] },
          })
        : liftBody(scope));
  locals.set(binding, {
    kind: LocalKind.Function,
    access: CaptureAccess.Direct,
    slot: -1,
    binding,
    lift,
  });
  // Never lifted: the authored statement takes the entry's place, in every copy of the setup.
  ctx.pendingFunctions.push(() => {
    if (entry.use === undefined) {
      const authored = lowerAuthored(scope);
      for (const key of Object.keys(entry)) {
        delete (entry as Record<string, unknown>)[key];
      }
      Object.assign(entry, authored);
    }
  });
  return entry;
}

/** Runs once every boundary has been lowered: unreferenced body functions keep their statement. */
export function finalizeLocalFunctions(ctx: LowerContext): void {
  for (const finalize of ctx.pendingFunctions.splice(0)) {
    finalize();
  }
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
  // An anonymous component has no binding to rebind, so it can only stay where it was authored.
  if (component.bindingNode === null) {
    return lowerAuthoredComponent(component, ctx, locals);
  }
  return lowerLocalFunction(
    component.fn,
    component.bindingNode,
    ctx,
    locals,
    (scope) => lowerAuthoredComponent(component, scope, locals),
    (scope) => lowerComponentValue(component, scope, component.name)
  );
}

/** The component prints where it was authored: a closure over the enclosing setup. */
function lowerAuthoredComponent(
  component: DiscoveredComponent,
  ctx: LowerContext,
  locals: SetupLocals
): Setup {
  const outerProps = ctx.propsBinding;
  const outerMembers = ctx.propsMembers;
  const outerScopes = ctx.styleScopes;
  ctx.styleScopes = [];
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
    recordSetupAwaits(ctx, component.fn);
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
        async: component.fn.async === true,
      }) - 1;
    return {
      s: SetupKind.LocalComponent,
      binding:
        component.bindingNode === null ? null : ctx.bindings.declaration(component.bindingNode),
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
    ctx.styleScopes = outerScopes;
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
      recordFunctionJsx(ctx, payload, node);
      return;
    }
    if (node.type === 'ReturnStatement' && ctx.returnsRender) {
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
    if (
      node.type === 'CallExpression' ||
      node.type === 'JSXElement' ||
      node.type === 'JSXFragment'
    ) {
      recordPayloadJsx(ctx, payload, node);
      return;
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

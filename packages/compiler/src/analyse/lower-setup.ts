import {
  CaptureAccess,
  BindTargetKind,
  BindingScope,
  SetupKind,
  ValueKind,
  ProgramBodyKind,
  VarKind,
  type LocalId,
  type Setup,
  type Value,
} from '../schema';
import type {
  BindingPattern,
  Directive,
  Function as FunctionNode,
  BindingIdentifier,
  Statement,
  VariableDeclarator,
  VariableDeclaration,
  Expression,
  Node,
} from 'oxc-parser';
import { identifierName, unwrapExpression } from './ast/utils';
import { allocateGeneratedName } from '../names';
import { UnsupportedError } from '../errors';
import { localReadIr, LocalKind, type SetupLocals } from './locals';
import { liftedLocal, pushPayload, type LowerContext } from './lower-context';
import { collectCaptures, lowerCaptures } from './ast/capture-analysis';
import { memberChainOf } from './ast/bindings';
import {
  lowerInlineExpressionValue,
  propertyValueOf,
  recordPayloadJsx,
  recordPayloadReads,
  tryLowerExprIr,
} from './lower-expr';
import { findRuntimeJsx } from './ast/returns-jsx';
import { forEachChild, isNode } from './ast/ast-types';
import { isFunctionLike } from './ast/utils';
import { lowerComponentBody } from './lower-component-body';
import { lowerRenderExpression } from './lower-children';
import { findComponentCandidates } from './ast/returns-jsx';
import { discoverComponents, type DiscoveredComponent } from './discover';
import { pathReadIr } from './lower-parameter';
import { readObjectParameter } from './ast/parameter-members';
import { ValueIrKind, type ValueIR } from '../schema/value-ir';

import {
  isDollarMarker,
  isSetupHookCall,
  lowerSetupCall,
  lowerSetupCallback,
  resolveSetupCall,
} from './lower-setup-call';
import {
  enterLiftedLocal,
  isDeclaredAlias,
  recordFunctionJsx,
  recordPayloadQrls,
} from './lower-function';
export function lowerConstDeclaration(
  declarator: VariableDeclarator,
  ctx: LowerContext,
  locals: SetupLocals,
  kind: LocalKind.Const | LocalKind.Store = LocalKind.Const
): Setup {
  if (declarator.init === null) {
    throw new UnsupportedError('a const declaration without an initializer');
  }
  const { refs } = lowerCaptures(declarator.init, ctx, 'a const initializer', new Set(), {
    lift: false,
  });
  const value = lowerInlineExpressionValue(declarator.init, ctx, refs);
  return lowerConstBinding(declarator.id, value, ctx, locals, kind);
}

/** Authored patterns keep native defaults, rest and evaluation order. */
export function lowerConstBinding(
  pattern: BindingPattern,
  value: Value,
  ctx: LowerContext,
  locals: SetupLocals,
  kind: LocalKind.Const | LocalKind.Store = LocalKind.Const
): Setup {
  return {
    s: SetupKind.Const,
    ...lowerSetupBinding(pattern, ctx, locals, value.v === ValueKind.Qrl ? LocalKind.Qrl : kind),
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
  const { refs } = lowerCaptures(pattern, ctx, 'a binding pattern', new Set(), { lift: false });
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
        if (!pushLiftedDeclaration(statement.id!, ctx, setup)) {
          setup.push(
            lowerLocalComponent(statement, ctx, locals) ??
              deferAuthoredLocal(ctx, locals, (scope) => lowerJsStatement(statement, scope, locals))
          );
        }
        continue;
      }
      if (statement.type === 'ExpressionStatement') {
        const expression = unwrapExpression(statement.expression);
        const call = expression.type === 'ChainExpression' ? expression.expression : expression;
        const hook = call.type === 'CallExpression' ? resolveSetupCall(call, ctx) : null;
        if (isSetupHookCall(hook) && call.type === 'CallExpression') {
          setup.push(lowerSetupCall(call, hook, null, ctx, locals));
          continue;
        }
      }
      if (statement.type !== 'VariableDeclaration' || statement.kind !== 'const') {
        setup.push(lowerJsStatement(statement, ctx, locals));
        continue;
      }
      for (const declarator of statement.declarations) {
        if (
          declarator.id.type === 'Identifier' &&
          pushLiftedDeclaration(declarator.id, ctx, setup)
        ) {
          continue;
        }
        const init = declarator.init === null ? null : unwrapExpression(declarator.init);
        // A live alias registers locals and emits nothing.
        const entry =
          lowerLocalComponent({ ...statement, declarations: [declarator] }, ctx, locals) ??
          (init !== null && isFunctionLike(init) && declarator.id.type === 'Identifier'
            ? deferAuthoredLocal(ctx, locals, (scope) =>
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

/** Up front, so a boundary before a declaration still finds the local and lifts it. */
function registerSetupLocals(
  statements: readonly (Directive | Statement)[],
  ctx: LowerContext,
  locals: SetupLocals
): void {
  const scope = { ...ctx, locals };
  for (const binding of ctx.bindings.declaredWithin(statements)) {
    if (locals.has(binding)) {
      continue;
    }
    const { varKind } = ctx.plan.bindings[binding];
    const isLifted = ctx.lifts.isLifted(binding);
    locals.set(binding, {
      kind: isLifted
        ? LocalKind.Function
        : varKind === VarKind.Let || varKind === VarKind.Var
          ? LocalKind.Mutable
          : LocalKind.Const,
      access: CaptureAccess.Direct,
      binding,
    });
    if (isLifted) {
      enterLiftedLocal(ctx, binding, scope);
    }
  }
}

function lowerMutableDeclaration(
  statement: VariableDeclaration,
  ctx: LowerContext,
  locals: SetupLocals
): Setup[] {
  const setup: Setup[] = [];
  for (const declarator of statement.declarations) {
    if (declarator.id.type === 'Identifier' && pushLiftedDeclaration(declarator.id, ctx, setup)) {
      continue;
    }
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
  if (isDollarMarker(coreApi)) {
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
  if (expression?.type === 'ChainExpression' && !isSetupHookCall(callee)) {
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

/** The member path a live read walks from its root, such as `['counter', 'steps']`. */
function readPath(read: ValueIR): string[] | null {
  const path: string[] = [];
  let value = read;
  while (value.kind === ValueIrKind.Member || value.kind === ValueIrKind.Index) {
    if (value.kind === ValueIrKind.Member) {
      path.unshift(value.name);
    } else if (value.key.kind === ValueIrKind.Lit) {
      path.unshift(String(value.key.value));
    } else {
      return null;
    }
    value = value.obj;
  }
  return value.kind === ValueIrKind.BindingRead ? path : null;
}

/** The const a use declares as `const alias = <use>`; any other use may replace what it reads. */
function constAliasOf(use: Node, parent: Node | null, ctx: LowerContext): LocalId | null {
  if (
    parent?.type !== 'VariableDeclarator' ||
    parent.init !== use ||
    parent.id.type !== 'Identifier'
  ) {
    return null;
  }
  const declaration = ctx.bindings.parentOf(parent);
  return declaration?.type === 'VariableDeclaration' && declaration.kind === 'const'
    ? ctx.bindings.declaration(parent.id)
    : null;
}

/** A deep `useStore({...})` literal holds an object at `branch`, so its sub-store has an identity. */
function hasBranchLiteral(store: LocalId, branch: readonly string[], ctx: LowerContext): boolean {
  const [declaration] = ctx.bindings.declarationsOf(store);
  const init =
    declaration?.type === 'VariableDeclarator' ? unwrapExpression(declaration.init) : null;
  if (init?.type !== 'CallExpression' || init.arguments.length !== 1) {
    return false;
  }
  let value = unwrapExpression(init.arguments[0]);
  for (let i = 0; i < branch.length; i++) {
    value =
      value?.type === 'ObjectExpression'
        ? unwrapExpression(propertyValueOf(value, branch[i]))
        : null;
  }
  return value?.type === 'ObjectExpression' || value?.type === 'ArrayExpression';
}

/** No use of the store, or of a const alias of it, can put another object at `branch`. */
function isBranchNeverReplaced(
  store: LocalId,
  branch: readonly string[],
  ctx: LowerContext
): boolean {
  const references = ctx.bindings.referencesOf(store);
  for (let i = 0; i < references.length; i++) {
    const { node, parent, path } = memberChainOf(references[i].node, ctx.bindings);
    // A method can replace whatever its receiver holds.
    const isCalled = parent?.type === 'CallExpression' && parent.callee === node;
    const used = isCalled ? path.slice(0, -1) : path;
    let shared = 0;
    while (shared < used.length && used[shared] !== '*' && used[shared] === branch[shared]) {
      shared++;
    }
    if (shared < used.length) {
      // Past the branch or on another one; a computed key may still name the branch.
      if (shared < branch.length && used[shared] === '*') {
        return false;
      }
      continue;
    }
    const alias = constAliasOf(node, parent, ctx);
    if (
      alias === null ||
      (shared < branch.length && !isBranchNeverReplaced(alias, branch.slice(shared), ctx))
    ) {
      return false;
    }
  }
  return true;
}

/** `const counter = store.counter` can hold the sub-store itself when nothing replaces it. */
function isStableStoreBranch(
  declarator: VariableDeclarator,
  source: AliasSource,
  ctx: LowerContext
): boolean {
  if (
    declarator.id.type !== 'Identifier' ||
    ctx.locals.get(source.root)?.kind !== LocalKind.Store
  ) {
    return false;
  }
  const branch = readPath(source.read);
  return (
    branch !== null &&
    branch.length > 0 &&
    hasBranchLiteral(source.root, branch, ctx) &&
    isBranchNeverReplaced(source.root, branch, ctx)
  );
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
  if (init === null) {
    return undefined;
  }
  const object = readObjectParameter(declarator.id);
  const defaults = (object?.members ?? []).map((member) =>
    member.defaultValue === null ? undefined : tryLowerExprIr(member.defaultValue, ctx)
  );
  // A default the IR cannot carry keeps the whole pattern a native snapshot.
  if (defaults.some((value) => value === null)) {
    return undefined;
  }
  let source = aliasSource(init, ctx);
  let setup: Setup | null = null;
  if (source === null) {
    if (object === null || object.rest !== null) {
      return undefined;
    }
    const hookConst = hookResultConst(init, ctx);
    const bound =
      hookConst !== null
        ? { source: directSource(hookConst), setup: null }
        : isHookCall(init, ctx)
          ? bindResultToTemp(declarator, init, ctx, locals)
          : null;
    if (bound === null) {
      return undefined;
    }
    ({ source, setup } = bound);
  }
  if (isStableStoreBranch(declarator, source, ctx)) {
    // A captured sub-store serializes alone, without the rest of the store.
    return lowerConstDeclaration(declarator, ctx, locals, LocalKind.Store);
  }
  const root = source.root;
  const register = (node: Node, read: ValueIR, defaultValue?: ValueIR) =>
    locals.set(ctx.bindings.declaration(node)!, {
      kind: LocalKind.PropMember,
      access: source.access,
      binding: root,
      read,
      defaultValue,
    });
  if (declarator.id.type === 'Identifier') {
    register(declarator.id, source.read);
    return null;
  }
  if (object === null) {
    return undefined;
  }
  // A rest is only live off the props object itself, where a proxy can exclude the named keys.
  const isPropsRest = source.read.kind === ValueIrKind.BindingRead && root === ctx.propsBinding;
  if (object.rest !== null && !isPropsRest) {
    return undefined;
  }
  object.members.forEach((member, index) =>
    register(member.node, pathReadIr(source.read, member.path, ctx), defaults[index] ?? undefined)
  );
  if (object.rest === null) {
    return setup;
  }
  const rest = ctx.bindings.declaration(object.rest)!;
  locals.set(rest, {
    kind: LocalKind.PropRest,
    access: CaptureAccess.Direct,
    binding: rest,
  });
  const excluded = [...new Set(object.members.map((member) => member.name))];
  return { s: SetupKind.PropRest, result: rest, props: root, excluded };
}

function isHookCall(expression: Expression, ctx: LowerContext): boolean {
  return expression.type === 'CallExpression' && isSetupHookCall(resolveSetupCall(expression, ctx));
}

/** The const local `expression` names when its own initializer is a hook call. */
function hookResultConst(expression: Expression, ctx: LowerContext): LocalId | null {
  const binding = expression.type === 'Identifier' ? ctx.bindings.reference(expression) : null;
  if (binding === null || ctx.locals.get(binding)?.kind !== LocalKind.Const) {
    return null;
  }
  const [declarator] = ctx.bindings.declarationsOf(binding);
  if (declarator?.type !== 'VariableDeclarator' || declarator.init === null) {
    return null;
  }
  const declaration = ctx.bindings.parentOf(declarator);
  return declaration?.type === 'VariableDeclaration' &&
    declaration.kind === 'const' &&
    isHookCall(unwrapExpression(declarator.init), ctx)
    ? binding
    : null;
}

function directSource(binding: LocalId): AliasSource {
  return {
    read: { kind: ValueIrKind.BindingRead, binding },
    root: binding,
    access: CaptureAccess.Direct,
  };
}

/**
 * `const { a, b } = useX()` binds the hook result to a generated local so the members alias it: a
 * member read stays a live read of the result, not a snapshot. Only for hook calls.
 */
function bindResultToTemp(
  declarator: VariableDeclarator,
  init: Expression,
  ctx: LowerContext,
  locals: SetupLocals
): { source: AliasSource; setup: Setup } | null {
  const setup = lowerSetupDeclaration(declarator, ctx, locals);
  if (
    (setup.s !== SetupKind.Const && setup.s !== SetupKind.Call) ||
    setup.result?.bind !== BindTargetKind.Pattern
  ) {
    return null;
  }
  const callee = init.type === 'CallExpression' ? unwrapExpression(init.callee) : null;
  const hook =
    callee?.type === 'Identifier' && callee.name.startsWith('use') ? callee.name.slice(3) : '';
  const name = hook === '' ? '_destructured' : `_${hook.replace(/^./, (c) => c.toLowerCase())}`;
  const temp = ctx.bindings.addSynthetic(
    allocateGeneratedName(
      name,
      ctx.plan.bindings.map((binding) => binding.name)
    ),
    BindingScope.Local
  );
  setup.result = { bind: BindTargetKind.Binding, binding: temp };
  locals.set(temp, {
    kind: LocalKind.Const,
    access: CaptureAccess.Direct,
    binding: temp,
  });
  return { setup, source: directSource(temp) };
}

/** A lifted local prints only where its own scope reads it; false when it does not lift. */
function pushLiftedDeclaration(id: BindingIdentifier, ctx: LowerContext, setup: Setup[]): boolean {
  const binding = ctx.bindings.declaration(id)!;
  if (!ctx.lifts.isLifted(binding) || isDeclaredAlias(binding, ctx)) {
    return false;
  }
  if (ctx.lifts.isDeclared(binding)) {
    setup.push({
      s: SetupKind.LocalFunction,
      binding,
      hoisted: ctx.bindings.parentOf(id)?.type === 'FunctionDeclaration',
      use: ctx.liftedLocals.get(binding)!.rebind.use,
    });
  }
  return true;
}

/** Lowers once setup locals declared below it have their final kind; the entry fills every copy. */
function deferAuthoredLocal(
  ctx: LowerContext,
  locals: SetupLocals,
  lowerAuthored: (scope: LowerContext) => Setup
): Setup {
  const entry = {} as Setup;
  const scope = { ...ctx, locals };
  ctx.deferredLocals.push(() => Object.assign(entry, lowerAuthored(scope)));
  return entry;
}

/** Prints the deferred locals from `from` on, in the order they were met. */
export function lowerDeferredLocals(ctx: LowerContext, from = 0): void {
  const queue = ctx.deferredLocals;
  while (queue.length > from) {
    queue.splice(from, 1)[0]();
  }
}

/**
 * Lowers what is still pending once every root is lowered: a local lifted only for boundaries of
 * its own reference cycle has no outside read to lower it. Then fails closed on any read of a
 * lifted local that no boundary rebinds.
 */
export function finishLocals(ctx: LowerContext): void {
  lowerDeferredLocals(ctx);
  for (const binding of ctx.liftedLocals.keys()) {
    liftedLocal(ctx, binding);
  }
  lowerDeferredLocals(ctx);
  for (const [binding, { home, references }] of ctx.lifts.liftables) {
    const isStray = (reference: Node) =>
      !ctx.claimedReads.has(reference) && !ctx.lifts.isOwnRead(reference, home);
    if (ctx.lifts.isLifted(binding) && references.some(isStray)) {
      throw new Error(
        `pipeline: a read of the lifted local "${ctx.plan.bindings[binding].name}" that no boundary rebinds`
      );
    }
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
  return deferAuthoredLocal(ctx, locals, (scope) =>
    lowerAuthoredComponent(component, scope, locals)
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
  try {
    const scoped = new Map(locals);
    if (outerProps !== null) {
      scoped.set(outerProps, {
        kind: LocalKind.Const,
        access: CaptureAccess.Direct,
        binding: outerProps,
      });
    }
    const { program, parameter } = lowerComponentBody(component, ctx, scoped);
    return {
      s: SetupKind.LocalComponent,
      binding:
        component.bindingNode === null ? null : ctx.bindings.declaration(component.bindingNode),
      program,
      id: component.name,
      name: component.name,
      declarationKind: component.declarationKind,
      parameter,
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
  const hasHeaderHook = (node: unknown): boolean => {
    if (Array.isArray(node)) {
      return node.some(hasHeaderHook);
    }
    if (!isNode(node) || isFunctionLike(node)) {
      return false;
    }
    if (node.type === 'CallExpression' && isSetupHookCall(resolveSetupCall(node, ctx))) {
      return true;
    }
    return forEachChild(node, hasHeaderHook) ?? false;
  };
  const visit = (
    node: unknown,
    root = false,
    parent: Node | null = null,
    inLoopHeader = false
  ): void => {
    if (Array.isArray(node)) {
      node.forEach((child) => visit(child, false, parent, inLoopHeader));
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
      // The header declares plain locals; only the body may hold setup work.
      const header =
        node.type === 'ForStatement'
          ? [node.init, node.test, node.update]
          : [node.left, node.right];
      if (hasHeaderHook(header)) {
        throw new UnsupportedError('a setup hook in a for loop header');
      }
      visit(header, false, node, true);
      visit(node.body, false, node);
      return;
    }
    if (
      !root &&
      !inLoopHeader &&
      (node.type === 'VariableDeclaration' ||
        node.type === 'FunctionDeclaration' ||
        node.type === 'ExpressionStatement')
    ) {
      const block =
        parent?.type === 'IfStatement' ||
        parent?.type === 'WhileStatement' ||
        parent?.type === 'DoWhileStatement' ||
        parent?.type === 'ForStatement' ||
        parent?.type === 'ForInStatement' ||
        parent?.type === 'ForOfStatement' ||
        parent?.type === 'LabeledStatement';
      (target.setups ??= []).push({
        range: [node.start, node.end],
        setup: lowerSetup([node], ctx, locals).setup,
        block,
      });
      return;
    }
    if (isFunctionLike(node)) {
      recordPayloadQrls(ctx, payload, node);
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
    forEachChild(node, (child) => visit(child, false, node, inLoopHeader));
  };
  // Recorded first, so the QRLs extracted below drop the reads they replace.
  recordPayloadReads(ctx, payload, collectCaptures(statement as Node, ctx, new Set()));
  visit(statement, true);
  // Nested setups and render programs read through their own payloads.
  const nested = [...(target.setups ?? []), ...target.renders];
  target.reads = target.reads.filter(
    ({ range }) => !nested.some(({ range: [start, end] }) => start <= range[0] && range[1] <= end)
  );
  return { s: SetupKind.Js, payload };
}

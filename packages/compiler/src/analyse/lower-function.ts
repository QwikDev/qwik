import type {
  ArrowFunctionExpression,
  CallExpression,
  Expression,
  IdentifierReference as Identifier,
  Function as FunctionNode,
  Node,
  VariableDeclaration,
  VariableDeclarator,
} from 'oxc-parser';
import {
  BindingScope,
  BoundaryKind,
  BoundaryRole,
  CallTargetKind,
  CaptureAccess,
  FnBodyKind,
  QrlBodyKind,
  QrlPayloadKind,
  type CallTarget,
  type LocalId,
  type Payload,
  type PayloadId,
  type Qrl,
  type QrlUse,
  type Range,
} from '../schema';
import { InvalidModuleError, UnsupportedError } from '../errors';
import { createCapturedContext, lowerCaptures } from './ast/capture-analysis';
import {
  pushPayload,
  pushQrl,
  QrlIdentityKind,
  liftedLocal,
  type LowerContext,
} from './lower-context';
import { readComponentFunction } from './discover';
import { declaredComponentFunction, isComponentDeclaration } from './ast/returns-jsx';
import { pushComponentQrl } from './lower-component-body';
import { lowerComputedExpressionValue, recordPayloadJsx, recordPayloadReads } from './lower-expr';
import { LocalKind, type SetupLocals } from './locals';
import { isFunctionLike, parameterPattern, unwrapExpression } from './ast/utils';
import { isNode, type WalkableNode } from './ast/ast-types';
import { QRL_SUFFIX, QRL_TWIN_SUFFIX, QwikMarker } from '../words';
import { isDollarMarker, resolveSetupCall } from './lower-setup-call';

/** Explicit and implicit boundaries share callback extraction and capture semantics. */
export type QrlArgumentBoundary = Pick<Qrl, 'ctxName' | 'boundary'> & {
  nameCtx: string;
  subject: string;
  origin: Pick<Qrl['origin'], 'range' | 'calleeRange' | 'argumentRanges'>;
};

/** An inline function is the QRL body; any other `$` argument ships as a factory returning it. */
export function lowerQrlArgument(
  argument: Expression,
  ctx: LowerContext,
  boundary: QrlArgumentBoundary
): QrlUse {
  if (isFunctionLike(argument)) {
    return lowerFunctionQrl(argument, ctx, boundary);
  }
  const lifted = liftedLocalQrl(argument, ctx);
  if (lifted !== null) {
    return lifted;
  }
  const binding = argument.type === 'Identifier' ? ctx.bindings.reference(argument) : null;
  if (binding !== null && !ctx.locals.has(binding) && isModuleBinding(ctx, binding)) {
    return aliasQrl(argument as Identifier, binding, ctx, boundary);
  }
  return lowerComputedExpressionValue(argument, ctx, boundary.nameCtx, QrlPayloadKind.Function)
    .resume.qrl;
}

/** A lifted local passed by name is that local's own segment; null for any other value. */
export function liftedLocalQrl(argument: Expression, ctx: LowerContext): QrlUse | null {
  const binding = argument.type === 'Identifier' ? ctx.bindings.reference(argument) : null;
  if (binding === null || !ctx.lifts.isLifted(binding)) {
    return null;
  }
  ctx.claimedReads.add(argument);
  return liftedLocal(ctx, binding).use;
}

const isModuleBinding = (ctx: LowerContext, binding: LocalId): boolean => {
  const scope = ctx.plan.bindings[binding]?.scope;
  return scope === BindingScope.Module || scope === BindingScope.Import;
};

/** `$(Name)` on a module binding: the segment re-exports it, so the QRL resolves to the value. */
function aliasQrl(
  argument: Identifier,
  binding: LocalId,
  ctx: LowerContext,
  boundary: QrlArgumentBoundary
): QrlUse {
  return pushQrl(ctx, {
    identity: { kind: QrlIdentityKind.Segment, nameCtx: boundary.nameCtx },
    ctxName: boundary.ctxName,
    boundary: boundary.boundary,
    payloadKind: QrlPayloadKind.Function,
    authoredAsync: false,
    body: { b: QrlBodyKind.Alias, binding },
    captures: [],
    params: { authored: 0, used: [], sources: [] },
    origin: {
      ...boundary.origin,
      functionRange: [argument.start, argument.end],
      paramRanges: [],
      bodyRange: [argument.start, argument.end],
      bodyKind: FnBodyKind.Expression,
    },
  }).use;
}

export function lowerFunctionQrl(
  fn: ArrowFunctionExpression | FunctionNode,
  ctx: LowerContext,
  boundary: QrlArgumentBoundary
) {
  const body = fn.body;
  if (body === null) {
    throw new UnsupportedError('a bodyless QRL callback');
  }
  const { captures, functions, args, refs } = lowerCaptures(fn, ctx, boundary.subject);
  ctx = createCapturedContext(ctx, captures);
  if (refs.capturedWrite !== null) {
    throw new InvalidModuleError(
      'mutable-capture',
      `Mutating captured binding "${refs.capturedWrite.name}" inside a $ boundary is not allowed; mutate an object, store or signal property instead.`,
      refs.capturedWrite.range
    );
  }
  // A default parameter reading a capture or a rebound lifted local needs the prelude around it.
  const capturesBeforeParams =
    refs.propsReads.some(([start]) => start < body.start) ||
    refs.locals.some(({ reads }) => reads.some(({ range }) => range[0] < body.start)) ||
    ctx.bindings.freeReferences(fn.params).some(({ binding }) => ctx.lifts.isLifted(binding));
  const payload = pushPayload(ctx, [fn.start, fn.end]);
  recordPayloadReads(ctx, payload, refs);
  // Scanning the function itself puts its parameters and locals in scope for nested markers.
  recordPayloadQrls(ctx, payload, fn, boundary);
  recordFunctionJsx(ctx, payload, fn, true);
  return pushQrl(
    ctx,
    {
      identity: { kind: QrlIdentityKind.Segment, nameCtx: boundary.nameCtx },
      ctxName: boundary.ctxName,
      boundary: boundary.boundary,
      payloadKind: QrlPayloadKind.Function,
      authoredAsync: fn.async === true,
      body: {
        b: QrlBodyKind.Js,
        payload,
        // `this`, `arguments`, `new` and `yield` need the authored function form.
        ...(fn.type === 'ArrowFunctionExpression' ? {} : { functionName: fn.id?.name ?? null }),
        ...(fn.generator ? { generator: true as const } : {}),
      },
      captures,
      functions,
      params: {
        authored: fn.params.length,
        ...(fn.params.some((param) => param.type === 'RestElement')
          ? { hasRest: true as const }
          : {}),
        used: [],
        sources: [],
        ...(capturesBeforeParams ? { capturesBeforeParams: true } : {}),
      },
      origin: {
        ...boundary.origin,
        functionRange: [fn.start, fn.end],
        paramRanges: fn.params.map((param) => [param.start, param.end]),
        bodyRange: [body.start, body.end],
        bodyKind: body.type === 'BlockStatement' ? FnBodyKind.Block : FnBodyKind.Expression,
      },
    },
    args
  ).use;
}

/** Records a lifted local of the scope being entered; its segment waits for a boundary read. */
export function enterLiftedLocal(ctx: LowerContext, binding: LocalId, scope: LowerContext): void {
  if (ctx.liftedLocals.has(binding)) {
    return;
  }
  const target = ctx.lifts.liftables.get(binding)!.binding;
  if (target !== binding) {
    // An alias rebinds under its own name to its target's segment.
    enterLiftedLocal(ctx, target, scope);
    const rebind = { binding, use: ctx.liftedLocals.get(target)!.rebind.use };
    ctx.liftedLocals.set(binding, { rebind, lower: () => liftedLocal(ctx, target) });
    return;
  }
  const rebind = { binding, use: { qrl: '', args: [] } };
  const lower = () => Object.assign(rebind.use, lowerLiftedLocal(binding, scope));
  ctx.liftedLocals.set(binding, { rebind, lower });
}

function lowerLiftedLocal(binding: LocalId, scope: LowerContext): QrlUse {
  const { fn, component } = scope.lifts.liftables.get(binding)!;
  const name = scope.plan.bindings[binding].name;
  if (component !== null) {
    return lowerComponentValue({ ...readComponentFunction(fn), statement: component }, scope, name);
  }
  return lowerFunctionQrl(fn, scope, {
    nameCtx: name,
    subject: `the local function "${name}"`,
    ctxName: name,
    boundary: { kind: BoundaryKind.Implicit, role: BoundaryRole.Function },
    origin: { range: [fn.start, fn.end], calleeRange: null, argumentRanges: [] },
  });
}

/**
 * A component below module level. Named, it lifts to a chunk and its scope rides `_capturesObj._`;
 * an unnamed one prints where it stands and closes over the live scope, so it delivers nothing.
 */
export function lowerComponentValue(
  component: Parameters<typeof pushComponentQrl>[0],
  ctx: LowerContext,
  name: string | null
): QrlUse {
  const inline = name === null;
  const ctxName = name ?? QwikMarker.Component;
  const subject = inline ? 'a nested component' : `the local component "${name}"`;
  const { captures, functions, args, refs } = lowerCaptures(component.fn, ctx, subject, new Set(), {
    lift: !inline,
    ownsHooks: true,
  });
  refuseCapturedWrite(refs);
  // Setup locals keep their kind; anything else arrives as a plain value. An inline component
  // closes over the live scope, so a local component it renders can still lift from it.
  const scoped: SetupLocals = new Map(inline ? ctx.locals : []);
  for (const { binding } of [...captures, ...refs.functions]) {
    scoped.set(
      binding,
      ctx.locals.get(binding) ?? { kind: LocalKind.Const, access: CaptureAccess.Direct, binding }
    );
  }
  return pushComponentQrl(component, ctx, {
    identity: { kind: QrlIdentityKind.Segment, nameCtx: name ?? 'component' },
    ctxName,
    ...(inline ? { inline: true as const, captures: [] } : { captures, functions, args }),
    scoped,
  }).use;
}

/** A `$` boundary may read a captured binding, never write it. */
function refuseCapturedWrite(refs: {
  capturedWrite: { name: string; range: [number, number] } | null;
}): void {
  if (refs.capturedWrite !== null) {
    throw new InvalidModuleError(
      'mutable-capture',
      `Mutating captured binding "${refs.capturedWrite.name}" inside a $ boundary is not allowed; mutate an object, store or signal property instead.`,
      refs.capturedWrite.range
    );
  }
}

/** Callback scopes preserve native execution while JSX captures per-call bindings. */
export function recordFunctionJsx(
  ctx: LowerContext,
  payload: PayloadId,
  fn: ArrowFunctionExpression | FunctionNode,
  preserveAsyncContext = false
): void {
  if (preserveAsyncContext) {
    for (const node of ctx.bindings.awaitsOf(fn)) {
      ctx.plan.payloads[payload].awaits.push({
        range: [node.start, node.end],
        argumentRange: [node.argument.start, node.argument.end],
      });
    }
  }
  const factory = ctx.jsx.factory(fn);
  if (factory === null || fn.body === null) {
    return;
  }
  const callbackContext = functionScope(ctx, fn);
  for (const root of factory.roots) {
    if (!isReplaced(ctx.plan.payloads[payload], root)) {
      recordPayloadJsx(callbackContext, payload, root, preserveAsyncContext);
    }
  }
}

/** Code the payload no longer prints: an extracted QRL or a removed lifted declaration. */
export function isReplaced({ qrls, removed = [] }: Payload, node: Node): boolean {
  const isWithin = ([start, end]: Range) => start <= node.start && node.end <= end;
  return qrls.some(({ range }) => isWithin(range)) || removed.some(isWithin);
}

/** A native function's parameters and declarations are plain locals for the QRLs it contains. */
function functionScope(
  ctx: LowerContext,
  fn: ArrowFunctionExpression | FunctionNode
): LowerContext {
  const body = fn.body;
  if (body === null) {
    return ctx;
  }
  const locals = new Map(ctx.locals);
  const scope = { ...ctx, locals, inlineParams: null };
  const parameters = fn.params.flatMap((param) => ctx.bindings.bindingsOf(parameterPattern(param)));
  const declarations = ctx.bindings.declaredWithin(
    body.type === 'BlockStatement' ? body.body : [body]
  );
  for (const binding of [...parameters, ...declarations]) {
    const isLifted = ctx.lifts.isLifted(binding);
    locals.set(binding, {
      kind: isLifted ? LocalKind.Function : LocalKind.Const,
      access: CaptureAccess.Direct,
      binding,
    });
    if (isLifted) {
      enterLiftedLocal(ctx, binding, scope);
    }
  }
  return scope;
}

/** Every `$(fn)` under `node` becomes an explicit QRL that replaces the call in the payload. */
export function recordPayloadQrls(
  ctx: LowerContext,
  payload: PayloadId,
  node: Node,
  /** The QRL whose body `node` is; null for module code. */
  owner: QrlArgumentBoundary | null = null
): void {
  // A lifted local's body is code of its scope, so a component$ in it lifts too.
  const isQrlBody =
    owner !== null &&
    !(
      owner.boundary.kind === BoundaryKind.Implicit && owner.boundary.role === BoundaryRole.Function
    );
  const visit = (current: unknown, scope: LowerContext, twinCtxName: string | null): void => {
    if (Array.isArray(current)) {
      current.forEach((child) => visit(child, scope, twinCtxName));
      return;
    }
    if (!isNode(current) || ctx.extracted.has(current)) {
      return;
    }
    // JSX lowers as a render program that extracts its own `$()`; splicing both would overlap.
    if (current.type === 'JSXElement' || current.type === 'JSXFragment') {
      return;
    }
    // The root is the body a lifted function's own segment compiles.
    const lifted = current === node ? null : liftedDeclaration(current, scope);
    if (lifted !== null) {
      if (isQrlBody && scope.lifts.liftables.get(lifted.binding)!.component !== null) {
        throw new UnsupportedError('a component$ inside a $ boundary');
      }
      ctx.extracted.add(current);
      recordLiftedDeclaration(ctx.plan.payloads[payload], lifted, scope);
      return;
    }
    const componentFn = scope.lifts.componentFunction(current);
    if (componentFn !== null) {
      // A nested component prints where it stands, which no QRL function can do.
      if (owner !== null) {
        throw new UnsupportedError(nestedComponentRefusal(current, scope, owner, isQrlBody));
      }
      ctx.extracted.add(current);
      const target = ctx.plan.payloads[payload];
      target.reads = target.reads.filter(
        ({ range }) => !(range[0] >= current.start && range[1] <= current.end)
      );
      // Its own declarations belong to its setup lowering, not to the enclosing function's scope.
      const component = { ...readComponentFunction(componentFn), statement: current };
      const use = lowerComponentValue(component, { ...scope, inlineParams: null }, null);
      target.qrls.push({ range: [current.start, current.end], use });
      return;
    }
    const call = current.type === 'CallExpression' ? markerQrlCall(current, scope) : null;
    if (call !== null && current.type === 'CallExpression') {
      // `fooQrl($(fn))` is the twin spelling of `foo$(fn)`, so discovery keys on `foo$`
      const named =
        twinCtxName === null || call.marker !== undefined
          ? call
          : { ...call, ctxName: twinCtxName };
      const use = lowerMarkerQrl(current, named, scope);
      ctx.extracted.add(current);
      // The callee and callback are replaced, so their reads belong to no payload of this module.
      const target = ctx.plan.payloads[payload];
      target.reads = target.reads.filter(
        ({ range }) =>
          !(range[0] >= current.callee.start && range[1] <= current.callee.end) &&
          !(range[0] >= call.argument.start && range[1] <= call.argument.end)
      );
      // `$(fn)` is the QRL; `foo$(fn, …)` keeps its call under the twin callee.
      target.qrls.push(
        call.marker === undefined
          ? { range: [current.start, current.end], use }
          : {
              range: [call.argument.start, call.argument.end],
              use,
              marker: {
                calleeRange: [current.callee.start, current.callee.end],
                target: call.marker,
              },
            }
      );
      visit(current.arguments.slice(1), scope, null);
      return;
    }
    if (current.type === 'CallExpression') {
      visit(current.callee, scope, null);
      visit(current.arguments, scope, qrlTwinCtxName(current));
      return;
    }
    const inner = isFunctionLike(current) ? functionScope(scope, current) : scope;
    for (const key of Object.keys(current)) {
      if (key !== 'parent') {
        visit((current as WalkableNode)[key], inner, null);
      }
    }
  };
  visit(node, ctx, null);
}

/** A named component$ in a lifted function lifts, so an unnamed one only needs a name. */
function nestedComponentRefusal(
  value: Node,
  ctx: LowerContext,
  owner: QrlArgumentBoundary,
  isQrlBody: boolean
): string {
  if (isQrlBody) {
    return 'a component$ inside a $ boundary';
  }
  const isNamed = [...ctx.lifts.liftables.values()].some(({ component }) => component === value);
  return isNamed
    ? `a nested component$ in ${owner.subject}`
    : `an unnamed component$ in ${owner.subject}; declare it with a name first (const Name = component$(…))`;
}

/** `fooQrl(...)` → `foo$`; the direct `$()` arguments of that call carry it as ctxName. */
function qrlTwinCtxName(call: CallExpression): string | null {
  const callee = call.callee;
  return callee.type === 'Identifier' && callee.name.endsWith(QRL_TWIN_SUFFIX)
    ? callee.name.slice(0, -QRL_TWIN_SUFFIX.length) + QRL_SUFFIX
    : null;
}

/**
 * The declaration of a lifted local: its segment compiles the body, so the payload skips it. A
 * declared alias prints as authored.
 */
function liftedDeclaration(node: Node, ctx: LowerContext): LiftedDeclaration | null {
  const id =
    node.type === 'FunctionDeclaration' || node.type === 'VariableDeclarator' ? node.id : null;
  const binding = id?.type === 'Identifier' ? ctx.bindings.declaration(id) : null;
  return binding !== null && ctx.lifts.isLifted(binding) && !isDeclaredAlias(binding, ctx)
    ? { declaration: node as LiftedDeclaration['declaration'], binding }
    : null;
}

export function isDeclaredAlias(binding: LocalId, ctx: LowerContext): boolean {
  return ctx.lifts.liftables.get(binding)!.binding !== binding && ctx.lifts.isDeclared(binding);
}

interface LiftedDeclaration {
  declaration: FunctionNode | VariableDeclarator;
  binding: LocalId;
}

/** Removed when no code of its scope reads it; otherwise its value binds to the segment. */
function recordLiftedDeclaration(
  target: Payload,
  { declaration, binding }: LiftedDeclaration,
  ctx: LowerContext
): void {
  target.reads = target.reads.filter(
    ({ range }) => !(range[0] >= declaration.start && range[1] <= declaration.end)
  );
  const removed = ctx.lifts.isDeclared(binding) ? null : unreadDeclarationRange(declaration, ctx);
  if (removed !== null) {
    (target.removed ??= []).push(removed);
    return;
  }
  const value = declaration.type === 'VariableDeclarator' ? declaration.init! : declaration;
  target.qrls.push({
    range: [value.start, value.end],
    use: ctx.liftedLocals.get(binding)!.rebind.use,
    local: { binding, hoisted: value === declaration },
  });
}

/** The declarator and one adjoining comma, or the whole statement once all its declarators go. */
function unreadDeclarationRange(
  declaration: FunctionNode | VariableDeclarator,
  ctx: LowerContext
): Range | null {
  if (declaration.type !== 'VariableDeclarator') {
    return [declaration.start, declaration.end];
  }
  const statement = ctx.bindings.parentOf(declaration) as VariableDeclaration;
  const siblings = statement.declarations;
  const isRemoved = (sibling: VariableDeclarator) => {
    const lifted = liftedDeclaration(sibling, ctx);
    return lifted !== null && !ctx.lifts.isDeclared(lifted.binding);
  };
  const index = siblings.indexOf(declaration);
  const next = siblings[index + 1];
  // The ranges of removed neighbours tile without overlap, keeping one comma between kept ones.
  if (!siblings.every(isRemoved)) {
    return siblings.slice(0, index).every(isRemoved)
      ? [declaration.start, next.start]
      : [siblings[index - 1].end, declaration.end];
  }
  // `if (x) var f = …;` would take the next statement as its body.
  const parent = ctx.bindings.parentOf(statement)?.type;
  if (parent !== 'BlockStatement' && parent !== 'SwitchCase') {
    return null;
  }
  return [index === 0 ? statement.start : declaration.start, next?.start ?? statement.end];
}

/**
 * Outermost owners of an explicit `$()`: the enclosing function, or the call itself at module
 * level.
 */
export function explicitQrlRoots(nodes: readonly Node[], ctx: MarkerScope): Node[] {
  const roots: Node[] = [];
  const containsQrlCall = (node: Node): boolean => {
    let found = false;
    const visit = (current: unknown): void => {
      if (found || !isNode(current)) {
        (Array.isArray(current) ? current : []).forEach(visit);
        return;
      }
      if (
        current.type === 'CallExpression' &&
        (markerQrlCall(current, ctx) !== null ||
          (isComponentDeclaration(current, ctx.bindings, ctx.coreBindings) &&
            declaredComponentFunction(current, ctx.bindings) !== null))
      ) {
        found = true;
        return;
      }
      Object.keys(current).forEach(
        (key) => key !== 'parent' && visit((current as WalkableNode)[key])
      );
    };
    visit(node);
    return found;
  };
  const visit = (node: unknown): void => {
    if (Array.isArray(node)) {
      node.forEach(visit);
      return;
    }
    if (!isNode(node)) {
      return;
    }
    if (
      isFunctionLike(node) ||
      (node.type === 'CallExpression' &&
        (markerQrlCall(node, ctx) !== null || qrlTwinCtxName(node) !== null))
    ) {
      if (containsQrlCall(node)) {
        roots.push(node);
      }
      return;
    }
    Object.keys(node).forEach((key) => key !== 'parent' && visit((node as WalkableNode)[key]));
  };
  visit(nodes);
  return roots;
}

/** What marker resolution reads: the lift analysis resolves markers before lowering starts. */
export type MarkerScope = Pick<LowerContext, 'plan' | 'bindings' | 'coreBindings' | 'locals'>;

export interface MarkerQrlCall {
  argument: Expression;
  name: string;
  ctxName: string;
  boundary: Qrl['boundary'];
  /** Set for a custom `foo$` whose call stays under its twin callee. */
  marker?: Extract<CallTarget, { kind: CallTargetKind.Marker }>;
}

/** `$(value)`, `sync$(fn)` or a custom `foo$(value, …)` whose twins resolve; null otherwise. */
export function markerQrlCall(node: CallExpression, ctx: MarkerScope): MarkerQrlCall | null {
  const first = node.arguments[0];
  const argument =
    first === undefined || first.type === 'SpreadElement' ? null : unwrapExpression(first);
  if (argument === null || node.optional) {
    return null;
  }
  const binding = ctx.bindings.reference(node.callee);
  const core = binding === null ? undefined : ctx.coreBindings.get(binding);
  if (isDollarMarker(core) || core === QwikMarker.Sync) {
    if (node.arguments.length !== 1) {
      return null;
    }
    return core === QwikMarker.Sync
      ? { argument, name: 'sync', ctxName: core, boundary: { kind: BoundaryKind.Sync } }
      : { argument, name: 'qrl', ctxName: core, boundary: { kind: BoundaryKind.Explicit } };
  }
  const callee = resolveSetupCall(node, ctx);
  if (callee === null) {
    return null;
  }
  // A core hook met outside setup lowering (`return useComputed$(...)` in a hook body) still
  // extracts its callback; its twins follow the naming convention (`useComputedQrl`, `useComputed`).
  const stem =
    callee.stem ??
    (callee.contract !== undefined && callee.name.endsWith(QRL_SUFFIX)
      ? callee.name.slice(0, -QRL_SUFFIX.length)
      : null);
  if (stem === null) {
    return null;
  }
  return {
    argument,
    name: callee.name,
    ctxName: callee.name,
    boundary: { kind: BoundaryKind.Implicit, role: BoundaryRole.Hook },
    marker: { kind: CallTargetKind.Marker, binding: callee.binding, stem },
  };
}

/** Extracts a marker call's argument; a `sync$` callback must stand alone, with no captures. */
export function lowerMarkerQrl(
  call: CallExpression,
  { argument, name, ctxName, boundary }: MarkerQrlCall,
  ctx: LowerContext
): QrlUse {
  const use = lowerQrlArgument(argument, ctx, {
    nameCtx: name,
    subject: 'a QRL callback',
    ctxName,
    boundary,
    origin: {
      range: [call.start, call.end],
      calleeRange: [call.callee.start, call.callee.end],
      argumentRanges: call.arguments.map((arg) => [arg.start, arg.end]),
    },
  });
  // A recursive `$(f)` gets f's QRL before its segment is pushed, so only `sync$` looks it up.
  if (boundary.kind !== BoundaryKind.Sync) {
    return use;
  }
  const qrl = ctx.plan.qrls.find((entry) => entry.id === use.qrl)!;
  const reads = qrl.body.b === QrlBodyKind.Js ? ctx.plan.payloads[qrl.body.payload].reads : [];
  if (!isFunctionLike(argument) || qrl.captures.length > 0 || reads.length > 0) {
    throw new InvalidModuleError(
      'sync-capture',
      'A sync$ handler cannot use variables from its scope.',
      [argument.start, argument.end]
    );
  }
  return use;
}

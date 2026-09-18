import type {
  ArrowFunctionExpression,
  CallExpression,
  Expression,
  Function as FunctionNode,
  Node,
} from 'oxc-parser';
import {
  BoundaryKind,
  CallTargetKind,
  CaptureAccess,
  FnBodyKind,
  QrlBodyKind,
  QrlPayloadKind,
  type CallTarget,
  type PayloadId,
  type Qrl,
  type QrlUse,
} from '../schema';
import { InvalidModuleError, UnsupportedError } from '../errors';
import { createCapturedContext, lowerCaptures } from './ast/capture-analysis';
import { pushPayload, pushQrl, QrlIdentityKind, type LowerContext } from './lower-context';
import { readComponentFunction } from './discover';
import { pushComponentQrl } from './lower-component-body';
import { lowerComputedExpressionValue, recordPayloadJsx, recordPayloadReads } from './lower-expr';
import { LocalKind, type SetupLocal, type SetupLocals } from './locals';
import { isFunctionLike, parameterPattern, unwrapExpression } from './ast/utils';
import { isNode, type WalkableNode } from './ast/ast-types';
import { QRL_SUFFIX, QwikMarker } from '../words';
import { resolveSetupCall } from './lower-setup-call';

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
  // A body function passed by name is that function's own segment.
  const binding = argument.type === 'Identifier' ? ctx.bindings.reference(argument) : null;
  const local = binding === null ? undefined : ctx.locals.get(binding);
  if (local?.kind === LocalKind.Function) {
    return local.lift();
  }
  return lowerComputedExpressionValue(argument, ctx, boundary.nameCtx, QrlPayloadKind.Function)
    .resume.qrl;
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
  if (fn.type === 'FunctionExpression' && fn.generator) {
    throw new UnsupportedError('a generator QRL callback');
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
  const capturesBeforeParams =
    refs.propsReads.some(([start]) => start < body.start) ||
    refs.locals.some(({ reads }) => reads.some(({ range }) => range[0] < body.start));
  const payload = pushPayload(ctx, [fn.start, fn.end]);
  recordPayloadReads(ctx, payload, refs);
  // Scanning the function itself puts its parameters and locals in scope for nested markers.
  recordPayloadQrls(ctx, payload, fn, 'qrl');
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
        ...(fn.type === 'FunctionExpression' ? { functionName: fn.id?.name ?? null } : {}),
      },
      captures,
      functions,
      params: {
        authored: fn.params.length,
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

function isComponentMarkerCall(call: CallExpression, ctx: LowerContext): boolean {
  const binding = ctx.bindings.reference(call.callee);
  return binding !== null && ctx.coreBindings.get(binding) === QwikMarker.Component;
}

/**
 * `component$(fn)` below module level: a compiled component value closing over its scope. It prints
 * inline where the call stood, so it needs no chunk and carries no serializable symbol.
 */
function lowerNestedComponent(call: CallExpression, ctx: LowerContext): QrlUse {
  const first = call.arguments[0];
  const fn = first === undefined || first.type === 'SpreadElement' ? null : unwrapExpression(first);
  if (fn === null || call.arguments.length !== 1 || !isFunctionLike(fn)) {
    throw new UnsupportedError('a nested component$ without an inline function');
  }
  return lowerComponentValue(
    { ...readComponentFunction(fn), statement: call },
    functionScope(ctx, fn),
    null
  );
}

/**
 * A component below module level. Named, it lifts to a chunk and its scope rides `_captures`; an
 * unnamed one prints where it stands and closes over the live scope, so it delivers nothing.
 */
export function lowerComponentValue(
  component: Parameters<typeof pushComponentQrl>[0],
  ctx: LowerContext,
  name: string | null
): QrlUse {
  const inline = name === null;
  const ctxName = name ?? QwikMarker.Component;
  const subject = inline ? 'a nested component' : `the local component "${name}"`;
  const { captures, functions, args, refs } = lowerCaptures(
    component.fn,
    ctx,
    subject,
    new Set(),
    !inline
  );
  refuseCapturedWrite(refs);
  // Setup locals keep their kind; anything else arrives as a plain value.
  const scoped: SetupLocals = new Map(
    captures.map(({ binding }): [number, SetupLocal] => [
      binding,
      ctx.locals.get(binding) ?? {
        kind: LocalKind.Const,
        access: CaptureAccess.Direct,
        slot: -1,
        binding,
      },
    ])
  );
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
    recordPayloadJsx(callbackContext, payload, root, preserveAsyncContext);
  }
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
  const parameters = fn.params.flatMap((param) => ctx.bindings.bindingsOf(parameterPattern(param)));
  const declarations = ctx.bindings.declaredWithin(
    body.type === 'BlockStatement' ? body.body : [body]
  );
  for (const binding of [...parameters, ...declarations]) {
    locals.set(binding, {
      kind: LocalKind.Const,
      access: CaptureAccess.Direct,
      slot: -1,
      binding,
    });
  }
  return { ...ctx, locals, inlineParams: null };
}

const extractedCalls = new WeakSet<Node>();

/** Every `$(fn)` under `node` becomes an explicit QRL that replaces the call in the payload. */
export function recordPayloadQrls(
  ctx: LowerContext,
  payload: PayloadId,
  node: Node,
  owner: 'module' | 'qrl' = 'module'
): void {
  const visit = (current: unknown, scope: LowerContext): void => {
    if (Array.isArray(current)) {
      current.forEach((child) => visit(child, scope));
      return;
    }
    if (!isNode(current) || extractedCalls.has(current)) {
      return;
    }
    if (current.type === 'CallExpression' && isComponentMarkerCall(current, scope)) {
      if (owner === 'qrl') {
        throw new UnsupportedError('a component$ inside a $ boundary');
      }
      const use = lowerNestedComponent(current, scope);
      extractedCalls.add(current);
      const target = ctx.plan.payloads[payload];
      target.reads = target.reads.filter(
        ({ range }) => !(range[0] >= current.start && range[1] <= current.end)
      );
      target.qrls.push({ range: [current.start, current.end], use });
      return;
    }
    const call = current.type === 'CallExpression' ? markerQrlCall(current, scope) : null;
    if (call !== null && current.type === 'CallExpression') {
      const use = lowerMarkerQrl(current, call, scope);
      extractedCalls.add(current);
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
      visit(current.arguments.slice(1), scope);
      return;
    }
    const inner = isFunctionLike(current) ? functionScope(scope, current) : scope;
    for (const key of Object.keys(current)) {
      if (key !== 'parent') {
        visit((current as WalkableNode)[key], inner);
      }
    }
  };
  visit(node, ctx);
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
      if (current.type === 'CallExpression' && markerQrlCall(current, ctx) !== null) {
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
      (node.type === 'CallExpression' && markerQrlCall(node, ctx) !== null)
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

type MarkerScope = LowerContext;

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
  if (core === QwikMarker.Dollar || core === QwikMarker.Sync) {
    if (node.arguments.length !== 1) {
      return null;
    }
    return core === QwikMarker.Dollar
      ? { argument, name: 'qrl', ctxName: core, boundary: { kind: BoundaryKind.Explicit } }
      : { argument, name: 'sync', ctxName: core, boundary: { kind: BoundaryKind.Sync } };
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
    boundary: { kind: BoundaryKind.Implicit, role: 'hook' },
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
  const qrl = ctx.plan.qrls.find((entry) => entry.id === use.qrl)!;
  const reads = qrl.body.b === QrlBodyKind.Js ? ctx.plan.payloads[qrl.body.payload].reads : [];
  if (
    boundary.kind === BoundaryKind.Sync &&
    (!isFunctionLike(argument) || qrl.captures.length > 0 || reads.length > 0)
  ) {
    throw new InvalidModuleError(
      'sync-capture',
      'A sync$ handler cannot use variables from its scope.',
      [argument.start, argument.end]
    );
  }
  return use;
}

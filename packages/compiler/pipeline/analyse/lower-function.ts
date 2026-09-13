import type {
  ArrowFunctionExpression,
  CallExpression,
  Function as FunctionNode,
  Node,
} from 'oxc-parser';
import {
  BoundaryKind,
  CaptureAccess,
  FnBodyKind,
  QrlBodyKind,
  QrlPayloadKind,
  type PayloadId,
  type Qrl,
} from '../schema';
import { InvalidModuleError, UnsupportedError } from '../errors';
import { createCapturedContext, lowerCaptures } from './ast/capture-analysis';
import { pushPayload, pushQrl, QrlIdentityKind, type LowerContext } from './lower-context';
import { recordPayloadJsx, recordPayloadReads } from './lower-expr';
import { LocalKind } from './locals';
import { isFunctionLike, unwrapExpression } from './ast/utils';
import { isNode, type WalkableNode } from './ast/ast-types';
import { QwikMarker } from '../words';

/** Explicit and implicit boundaries share callback extraction and capture semantics. */
export function lowerFunctionQrl(
  fn: ArrowFunctionExpression | FunctionNode,
  ctx: LowerContext,
  boundary: Pick<Qrl, 'ctxName' | 'boundary'> & {
    nameCtx: string;
    subject: string;
    origin: Pick<Qrl['origin'], 'range' | 'calleeRange' | 'argumentRanges'>;
  }
) {
  const body = fn.body;
  if (body === null) {
    throw new UnsupportedError('a bodyless QRL callback');
  }
  if (fn.type === 'FunctionExpression' && fn.generator) {
    throw new UnsupportedError('a generator QRL callback');
  }
  const { captures, args, refs } = lowerCaptures(fn, ctx, boundary.subject);
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
  recordPayloadQrls(ctx, payload, body);
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
  const parameters = fn.params.flatMap((param) =>
    ctx.bindings.bindingsOf(
      param.type === 'RestElement'
        ? param.argument
        : param.type === 'TSParameterProperty'
          ? param.parameter
          : param
    )
  );
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
export function recordPayloadQrls(ctx: LowerContext, payload: PayloadId, node: Node): void {
  const visit = (current: unknown, scope: LowerContext): void => {
    if (Array.isArray(current)) {
      current.forEach((child) => visit(child, scope));
      return;
    }
    if (!isNode(current) || extractedCalls.has(current)) {
      return;
    }
    const fn = current.type === 'CallExpression' ? explicitQrlCallback(current, scope) : null;
    if (fn !== null && current.type === 'CallExpression') {
      extractedCalls.add(current);
      const use = lowerFunctionQrl(fn, scope, {
        nameCtx: 'qrl',
        subject: 'a QRL callback',
        ctxName: QwikMarker.Dollar,
        boundary: { kind: BoundaryKind.Explicit },
        origin: {
          range: [current.start, current.end],
          calleeRange: [current.callee.start, current.callee.end],
          argumentRanges: [[fn.start, fn.end]],
        },
      });
      ctx.plan.payloads[payload].qrls.push({ range: [current.start, current.end], use });
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
      if (current.type === 'CallExpression' && explicitQrlCallback(current, ctx) !== null) {
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
      (node.type === 'CallExpression' && explicitQrlCallback(node, ctx))
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

type MarkerScope = Pick<LowerContext, 'bindings' | 'coreBindings'>;

function explicitQrlCallback(
  node: CallExpression,
  ctx: MarkerScope
): (ArrowFunctionExpression | FunctionNode) | null {
  if (node.arguments.length !== 1) {
    return null;
  }
  const binding = ctx.bindings.reference(node.callee);
  if (binding === null || ctx.coreBindings.get(binding) !== QwikMarker.Dollar) {
    return null;
  }
  const argument = node.arguments[0];
  const fn = argument.type === 'SpreadElement' ? null : unwrapExpression(argument);
  return fn !== null && isFunctionLike(fn) ? fn : null;
}

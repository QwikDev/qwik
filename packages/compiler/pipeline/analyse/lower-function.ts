import type { ArrowFunctionExpression, Function as FunctionNode } from 'oxc-parser';
import {
  CaptureAccess,
  FnBodyKind,
  QrlBodyKind,
  QrlPayloadKind,
  type PayloadId,
  type Qrl,
} from '../schema';
import { InvalidModuleError, UnsupportedError } from '../errors';
import { lowerCaptures } from './ast/capture-analysis';
import { pushPayload, pushQrl, QrlIdentityKind, type LowerContext } from './lower-context';
import { recordPayloadJsx, recordPayloadReads } from './lower-expr';
import { LocalKind } from './locals';

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
  ctx.plan.payloads[payload].awaits = ctx.bindings.awaitsOf(fn).map((node) => ({
    range: [node.start, node.end],
    argumentRange: [node.argument.start, node.argument.end],
  }));
  recordPayloadReads(ctx, payload, refs);
  recordFunctionJsx(ctx, payload, fn);
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
  fn: ArrowFunctionExpression | FunctionNode
): void {
  const factory = ctx.jsx.factory(fn);
  if (factory === null || fn.body === null) {
    return;
  }
  const body = fn.body;
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
  const callbackContext = { ...ctx, locals, inlineParams: null };
  for (const root of factory.roots) {
    recordPayloadJsx(callbackContext, payload, root);
  }
}

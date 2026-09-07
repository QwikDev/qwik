import type { ArrowFunctionExpression, Function as FunctionNode } from 'oxc-parser';
import { FnBodyKind, QrlBodyKind, QrlPayloadKind, type Qrl } from '../schema';
import { UnsupportedError } from '../errors';
import { lowerCaptures } from './ast/capture-analysis';
import { findRuntimeJsx } from './ast/returns-jsx';
import { pushPayload, pushQrl, QrlIdentityKind, type LowerContext } from './lower-context';
import { recordPayloadAliasReads } from './lower-expr';

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
  if (findRuntimeJsx(fn) !== null) {
    throw new UnsupportedError(`JSX inside ${boundary.subject}`);
  }
  const { captures, args, refs } = lowerCaptures(fn, ctx, boundary.subject);
  const capturesBeforeParams =
    refs.propsReads.some(([start]) => start < body.start) ||
    refs.locals.some(({ reads }) => reads.some(({ range }) => range[0] < body.start));
  const payload = pushPayload(ctx, [fn.start, fn.end]);
  ctx.plan.payloads[payload].awaits = ctx.bindings.awaitsOf(fn).map((node) => ({
    range: [node.start, node.end],
    argumentRange: [node.argument.start, node.argument.end],
  }));
  recordPayloadAliasReads(ctx, payload, refs);
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

import type { Expression, JSXElement } from 'oxc-parser';
import {
  BoundaryKind,
  FnBodyKind,
  LifetimeCommit,
  LifetimeOwner,
  OpKind,
  ProgramBodyKind,
  QrlBodyKind,
  QrlPayloadKind,
  SeedKind,
  ValueKind,
  type Op,
  type QrlUse,
  type Value,
} from '../schema';
import { lowerCaptures } from './ast/capture-analysis';
import { pushPayload, pushQrl, type LowerContext } from './lower-context';
import { lowerJsx } from './lower-jsx';

/** A branch arm: JSX, or a null literal (`jsx: null`) spanning `range`. */
export interface BranchArm {
  jsx: JSXElement | null;
  range: [number, number];
}

/**
 * `test ? <then/> : <else/>` — a swappable branch range. A null-literal else drops the arm entirely
 * (like `&&`); a null-literal then keeps an EMPTY then program (chunk returns `[]`).
 */
export function lowerBranch(
  test: Expression,
  thenArm: BranchArm,
  elseArm: BranchArm | null,
  ctx: LowerContext
): Op {
  const condition = lowerCondition(test, ctx);
  const lifetime = ctx.plan.lifetimes.length;
  ctx.plan.lifetimes.push({
    id: lifetime,
    parent: 0,
    owner: LifetimeOwner.Branch,
    commit: LifetimeCommit.Immediate,
  });
  const thenProgram = lowerArm(thenArm.jsx, thenArm.range, ctx, 'branch:then', lifetime);
  // A null-literal (or absent, for `&&`) else arm is DROPPED — no program, no chunk.
  const elseProgram =
    elseArm === null || elseArm.jsx === null
      ? null
      : lowerArm(elseArm.jsx, elseArm.range, ctx, 'branch:else', lifetime);
  return {
    op: OpKind.Branch,
    condition,
    then: thenProgram,
    else: elseProgram,
    id: { kind: SeedKind.Branch, ordinal: ctx.branchCounter.next++ },
    lifetime,
  };
}

/** The condition is a Function-payload QRL over the test expression — captures via `_captures`. */
function lowerCondition(test: Expression, ctx: LowerContext): Value {
  const { captures, args } = lowerCaptures(test, ctx, 'a branch condition', { allowProps: true });
  const range: [number, number] = [test.start, test.end];
  const payload = pushPayload(ctx, range);
  const { use } = pushQrl(
    ctx,
    {
      identity: { kind: 'segment', nameCtx: 'branch:condition' },
      ctxName: 'branch:condition',
      boundary: { kind: BoundaryKind.Implicit, role: 'branch' },
      payloadKind: QrlPayloadKind.Function,
      authoredAsync: false,
      body: { b: QrlBodyKind.Js, payload },
      captures,
      params: { authored: 0, used: [], sources: [] },
      origin: {
        range,
        functionRange: range,
        calleeRange: null,
        argumentRanges: [],
        paramRanges: [],
        bodyRange: range,
        bodyKind: FnBodyKind.Expression,
      },
    },
    args
  );
  return { v: ValueKind.Qrl, use };
}

/** An arm is its own render Program plus a Program-body QRL the generators chunk per target. */
function lowerArm(
  jsx: JSXElement | null,
  range: [number, number],
  ctx: LowerContext,
  nameCtx: string,
  lifetime: number
): QrlUse {
  const loweredCaptures =
    jsx === null
      ? { captures: [], args: [] }
      : lowerCaptures(jsx, ctx, 'a branch arm', { allowProps: true });
  // The arm's segment and rows come BEFORE its children's — matching legacy allocation order.
  const program = ctx.plan.programs.length;
  ctx.plan.programs.push({
    body: { kind: ProgramBodyKind.Ops, ops: [] },
    setup: [],
    params: [],
    lifetime,
    needsId: false,
    async: false,
  });
  const { use } = pushQrl(
    ctx,
    {
      identity: { kind: 'segment', nameCtx },
      ctxName: nameCtx,
      boundary: { kind: BoundaryKind.Implicit, role: 'branch' },
      payloadKind: QrlPayloadKind.Function,
      authoredAsync: false,
      body: { b: QrlBodyKind.Program, program },
      captures: loweredCaptures.captures,
      params: { authored: 0, used: [], sources: [] },
      origin: {
        range,
        functionRange: range,
        calleeRange: null,
        argumentRanges: [],
        paramRanges: [],
        bodyRange: range,
        bodyKind: FnBodyKind.Expression,
      },
    },
    loweredCaptures.args
  );
  if (jsx !== null) {
    ctx.plan.programs[program].body = { kind: ProgramBodyKind.Ops, ops: [lowerJsx(jsx, ctx)] };
  }
  return use;
}

import type { Expression, JSXElement } from 'oxc-parser';
import {
  ArgPass,
  BoundaryKind,
  CaptureAccess,
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
import { collectCaptures } from './ast/capture-analysis';
import { UnsupportedError } from '../errors';
import { allocateSegment, pushPayload, type LowerContext } from './lower-context';
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
  const refs = collectCaptures(test, ctx, new Set());
  const captured = refs.other ?? (refs.props ? ctx.propsParamName : null);
  if (captured !== null) {
    throw new UnsupportedError(`a branch condition capturing "${captured}"`);
  }
  const range: [number, number] = [test.start, test.end];
  const payload = pushPayload(ctx, range);
  const segment = allocateSegment(ctx, 'branch:condition');
  ctx.plan.qrls.push({
    id: segment.id,
    parent: null,
    name: segment.name,
    ctxName: 'branch:condition',
    boundary: { kind: BoundaryKind.Implicit, role: 'branch' },
    markerAttributes: [],
    payloadKind: QrlPayloadKind.Function,
    authoredAsync: false,
    body: { b: QrlBodyKind.Js, payload },
    captures: refs.locals.map((entry) => ({
      binding: entry.local.binding,
      access: CaptureAccess.Direct,
    })),
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
    propsParts: [],
  });
  const use: QrlUse = {
    qrl: segment.id,
    args: refs.locals.map((entry) => ({
      pass: ArgPass.Binding,
      binding: entry.local.binding,
    })),
  };
  return { v: ValueKind.Qrl, use };
}

/** An arm is its own render Program plus a Program-body QRL the generators chunk per target. */
function lowerArm(
  jsx: JSXElement | null,
  range: [number, number],
  ctx: LowerContext,
  nameCtx: string,
  lifetime: number
): number {
  if (jsx !== null) {
    // Arm chunks carry no captures yet — a reactive arm would emit free identifiers.
    const refs = collectCaptures(jsx, ctx, new Set());
    if (refs.locals.length > 0) {
      throw new UnsupportedError(`a branch arm capturing "${refs.locals[0].name}"`);
    }
    if (refs.props) {
      throw new UnsupportedError(`a branch arm capturing "${ctx.propsParamName}"`);
    }
    if (refs.other !== null) {
      throw new UnsupportedError(`a branch arm capturing "${refs.other}"`);
    }
  }
  const ops = jsx === null ? [] : [lowerJsx(jsx, ctx)];
  const program = ctx.plan.programs.length;
  ctx.plan.programs.push({
    body: { kind: ProgramBodyKind.Ops, ops },
    setup: [],
    params: [],
    lifetime,
    needsId: false,
    async: false,
  });
  const segment = allocateSegment(ctx, nameCtx);
  ctx.plan.qrls.push({
    id: segment.id,
    parent: null,
    name: segment.name,
    ctxName: nameCtx,
    boundary: { kind: BoundaryKind.Implicit, role: 'branch' },
    markerAttributes: [],
    payloadKind: QrlPayloadKind.Function,
    authoredAsync: false,
    body: { b: QrlBodyKind.Program, program },
    captures: [],
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
    propsParts: [],
  });
  return program;
}

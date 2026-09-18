/** Render QRLs and content ranges: a program plus the QRL its generators chunk. */
import type { JSXChild, JSXElement, Node } from 'oxc-parser';
import {
  BoundaryKind,
  FnBodyKind,
  LifetimeCommit,
  LifetimeOwner,
  OpKind,
  ProgramBodyKind,
  QrlBodyKind,
  QrlPayloadKind,
  type Op,
  type Seed,
  type QrlUse,
} from '../schema';
import type { LowerContext } from './lower-context';
import { pushQrl, QrlIdentityKind } from './lower-context';
import { createCapturedContext, lowerCaptures, type LoweredCaptures } from './ast/capture-analysis';
import { SegmentContext } from '../words';
export function lowerRenderQrl(
  children: JSXChild[],
  ctx: LowerContext,
  subject: string,
  nameCtx: SegmentContext,
  role: string,
  lowerBody: (ctx: LowerContext) => Op[]
) {
  const range: [number, number] = [children[0].start, children[children.length - 1].end];
  const { captures, args } = lowerCaptures(children, ctx, subject);
  const program = ctx.plan.programs.length;
  ctx.plan.programs.push({
    body: { kind: ProgramBodyKind.Ops, ops: [] },
    setup: [],
    params: [],
    lifetime: 0,
    needsId: false,
    async: false,
  });
  const { use } = pushQrl(
    ctx,
    {
      identity: { kind: QrlIdentityKind.Segment, nameCtx },
      ctxName: nameCtx,
      boundary: { kind: BoundaryKind.Implicit, role },
      payloadKind: QrlPayloadKind.Function,
      authoredAsync: false,
      body: { b: QrlBodyKind.Program, program },
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
  ctx.plan.programs[program].body = {
    kind: ProgramBodyKind.Ops,
    ops: lowerBody(createCapturedContext(ctx, captures)),
  };
  return use;
}

/** One render range re-rendered whenever a value its ops track changes. */
export function lowerContentRange(
  element: JSXElement,
  captured: Node[],
  ctx: LowerContext,
  subject: string,
  nameCtx: SegmentContext,
  owner: LifetimeOwner,
  lowerOps: (captures: LoweredCaptures) => { ops: Op[]; id: Seed }
): Op {
  let id: Seed | null = null;
  const { use, lifetime } = lowerRangeProgram(
    [element.start, element.end],
    captured,
    ctx,
    subject,
    nameCtx,
    owner,
    (captures) => {
      const lowered = lowerOps(captures);
      id = lowered.id;
      return lowered.ops;
    }
  );
  return { op: OpKind.Content, render: use, id: id!, lifetime };
}

/** A range's own Program plus the Program-body QRL the generators chunk per target. */
export function lowerRangeProgram(
  range: [number, number],
  captured: Node[],
  ctx: LowerContext,
  subject: string,
  nameCtx: SegmentContext,
  owner: LifetimeOwner,
  lowerOps: (captures: LoweredCaptures) => Op[]
): { use: QrlUse; program: number; lifetime: number } {
  const captures = lowerCaptures(captured, ctx, subject);
  const lifetime = ctx.plan.lifetimes.length;
  ctx.plan.lifetimes.push({ id: lifetime, parent: 0, owner, commit: LifetimeCommit.AtomicRange });
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
      identity: { kind: QrlIdentityKind.Segment, nameCtx },
      ctxName: nameCtx,
      boundary: { kind: BoundaryKind.Implicit, role: nameCtx },
      payloadKind: QrlPayloadKind.Function,
      authoredAsync: false,
      body: { b: QrlBodyKind.Program, program },
      captures: captures.captures,
      functions: captures.functions,
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
    captures.args
  );
  ctx.plan.programs[program].body = { kind: ProgramBodyKind.Ops, ops: lowerOps(captures) };
  return { use, program, lifetime };
}

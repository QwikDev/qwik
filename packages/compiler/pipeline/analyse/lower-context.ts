import type { LocalId, ModulePlan, Payload, Qrl, QrlUse, Range } from '../schema';
import type { BindingGraph } from './ast/bindings';
import type { SetupLocal } from './lower-setup';
import {
  createSegmentSourceIdentity,
  createSegmentSymbolName,
  sanitizeSegmentName,
} from '../segment-identity';

/** Module-wide lowering state: segment ordinals are authored-order across all components. */
export interface LowerContext {
  plan: ModulePlan;
  /** File basename without extension — the segment display-name prefix. */
  sourceName: string;
  sourceIdentity: string;
  segmentCounter: { next: number };
  /** Branch seed ordinals, allocated in authored order. */
  branchCounter: { next: number };
  forCounter: { next: number };
  /** Param bindings of the inline collection row; null = not inside one. */
  inlineParams: ReadonlySet<LocalId> | null;
  bindings: BindingGraph;
  /** Local binding -> imported name for `@qwik.dev/core` imports. */
  coreBindings: ReadonlyMap<LocalId, string>;
  /** The current component's props param binding. */
  propsBinding: LocalId | null;
  /** The current component's reactive locals (binding → kind/slot/binding). */
  locals: ReadonlyMap<LocalId, SetupLocal>;
}

export function createLowerContext(
  plan: ModulePlan,
  path: string,
  scope: string | undefined,
  bindings: BindingGraph,
  coreBindings: ReadonlyMap<LocalId, string> = new Map()
): LowerContext {
  const slash = Math.max(path.lastIndexOf('/'), path.lastIndexOf('\\'));
  const basename = slash === -1 ? path : path.slice(slash + 1);
  return {
    plan,
    sourceName: basename.replace(/\.[cm]?[jt]sx?$/, ''),
    sourceIdentity: createSegmentSourceIdentity(path, scope),
    segmentCounter: { next: 0 },
    branchCounter: { next: 0 },
    forCounter: { next: 0 },
    inlineParams: null,
    bindings,
    coreBindings,
    propsBinding: null,
    locals: new Map(),
  };
}

/** Allocates the next authored-order segment: its plan id and wire symbol. */
export function allocateSegment(ctx: LowerContext, nameCtx: string): { id: string; name: string } {
  const id = `segment_${ctx.segmentCounter.next++}`;
  const displayName = sanitizeSegmentName(`${ctx.sourceName}_${nameCtx}_${id}`);
  return { id, name: createSegmentSymbolName(ctx.sourceIdentity, displayName, 'extracted') };
}

export function pushPayload(ctx: LowerContext, range: Range): number {
  const payload: Payload = {
    range,
    constants: [],
    qrls: [],
    reads: [],
    awaits: [],
    useIds: [],
    renders: [],
    temps: [],
  };
  ctx.plan.payloads.push(payload);
  return ctx.plan.payloads.length - 1;
}

export const enum QrlIdentityKind {
  /** Allocated a `segment_N` id and hashed wire symbol. */
  Segment = 'segment',
  /** An authored declaration carries its own id and name (components). */
  Declared = 'declared',
}

type QrlInput = Omit<Qrl, 'id' | 'parent' | 'name' | 'markerAttributes' | 'propsParts'> & {
  identity:
    | { kind: QrlIdentityKind.Segment; nameCtx: string }
    | { kind: QrlIdentityKind.Declared; id: string; name: string };
};

/** Adds every QRL through the same definition/use boundary. */
export function pushQrl(
  ctx: LowerContext,
  input: QrlInput,
  args: QrlUse['args'] = []
): { index: number; use: QrlUse } {
  const { identity, ...fields } = input;
  const resolved =
    identity.kind === QrlIdentityKind.Segment ? allocateSegment(ctx, identity.nameCtx) : identity;
  const qrl: Qrl = {
    ...fields,
    id: resolved.id,
    parent: null,
    name: resolved.name,
    markerAttributes: [],
    propsParts: [],
  };
  ctx.plan.qrls.push(qrl);
  return {
    index: ctx.plan.qrls.length - 1,
    use: { qrl: qrl.id, args },
  };
}

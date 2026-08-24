import type { ModulePlan, Payload, Range } from '../schema';
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
  bindingNames: ReadonlySet<string>;
  /** The current component's props param name. */
  propsParamName: string | null;
}

export function createLowerContext(
  plan: ModulePlan,
  path: string,
  scope: string | undefined
): LowerContext {
  const slash = Math.max(path.lastIndexOf('/'), path.lastIndexOf('\\'));
  const basename = slash === -1 ? path : path.slice(slash + 1);
  return {
    plan,
    sourceName: basename.replace(/\.[cm]?[jt]sx?$/, ''),
    sourceIdentity: createSegmentSourceIdentity(path, scope),
    segmentCounter: { next: 0 },
    bindingNames: new Set(plan.bindings.map((binding) => binding.name)),
    propsParamName: null,
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

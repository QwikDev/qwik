import type { Node, Program } from 'oxc-parser';
import type { LocalId, ModulePlan, Op, Payload, Qrl, QrlUse, Range, Value } from '../schema';
import type { OpKind } from '../schema';
import type { BindingGraph } from './ast/bindings';
import { createJsxAnalysis, type JsxAnalysis } from './ast/jsx-analysis';
import { createLiftAnalysis, type LiftAnalysis } from './ast/lift-analysis';
import type { SetupLocal } from './locals';
import type { AnalyseOptions } from './analyse-module';
import {
  createSegmentSourceIdentity,
  createSegmentSymbolName,
  sanitizeSegmentName,
} from '../segment-identity';

/** A `<Reveal>` while its children lower: the boundaries it collects, in lexical order. */
export interface RevealScope {
  group: number;
  order: Value | null;
  collapsed: Value | null;
  boundaries: Extract<Op, { op: OpKind.Pending }>[];
}

/** Module-wide lowering state: segment ordinals are authored-order across all components. */
export interface LowerContext {
  plan: ModulePlan;
  /** File basename without extension — the segment display-name prefix. */
  sourceName: string;
  sourceIdentity: string;
  segmentCounter: { next: number };
  /** Which locals lift to a segment of their own, decided before lowering. */
  lifts: LiftAnalysis;
  /** Lifted locals of the scopes entered so far. */
  liftedLocals: Map<LocalId, LiftedLocal>;
  /** References of lifted locals some boundary rebinds or passes as a QRL. */
  claimedReads: Set<Node>;
  /** Calls and declarations a payload already replaced; a nested scan must not replace them twice. */
  extracted: Set<Node>;
  /** Authored locals, lowered once later setup locals they read have their final kind. */
  deferredLocals: (() => void)[];
  /** Branch seed ordinals, allocated in authored order. */
  branchCounter: { next: number };
  componentCounter: { next: number };
  contentCounter: { next: number };
  projectionCounter: { next: number };
  slotCounter: { next: number };
  revealCounter: { next: number };
  /** The open `<Reveal>` of the program being lowered; null outside one. */
  reveal: RevealScope | null;
  forCounter: { next: number };
  styleCounter: { next: number };
  /** `⚡️<id>` per scoped style of the component being lowered. */
  styleScopes: string[];
  /** The foreign namespace the elements being lowered belong to. */
  namespace: 'svg' | 'math' | null;
  /** Enclosing native tags, innermost last, for nesting checks. */
  elementStack: string[];
  /** Param bindings of the inline collection row; null = not inside one. */
  inlineParams: ReadonlySet<LocalId> | null;
  /** Set when dev tools want each element stamped with its authored `file:line:column`. */
  inspectorLocation: ((offset: number) => string) | null;
  bindings: BindingGraph;
  jsx: JsxAnalysis;
  /** Local binding -> imported name for `@qwik.dev/core` imports. */
  coreBindings: ReadonlyMap<LocalId, string>;
  /** The current component's props param binding. */
  propsBinding: LocalId | null;
  /** Destructured prop binding -> authored property name. */
  propsMembers: ReadonlyMap<LocalId, string>;
  /** The current component's reactive locals (binding → kind/slot/binding). */
  locals: ReadonlyMap<LocalId, SetupLocal>;
  /** A component's `return` renders; a hook's `return` is ordinary JavaScript. */
  returnsRender: boolean;
}

export type FunctionRebind = NonNullable<Qrl['functions']>[number];

/** A local with a segment of its own, lowered on its first boundary read. */
export interface LiftedLocal {
  /** The prelude entry every rebind shares; its `use` fills once the segment is pushed. */
  rebind: FunctionRebind;
  /** Lowers the segment in its declaring scope; null once started. */
  lower: (() => void) | null;
}

/** A lifted local's prelude entry; its segment lowers on the first call. */
export function liftedLocal(ctx: LowerContext, binding: LocalId): FunctionRebind {
  const lifted = ctx.liftedLocals.get(binding);
  if (lifted === undefined) {
    throw new Error(
      `pipeline: a read of the lifted local "${ctx.plan.bindings[binding].name}" outside its scope`
    );
  }
  // A recursive read takes the entry before its segment is pushed.
  const lower = lifted.lower;
  lifted.lower = null;
  lower?.();
  return lifted.rebind;
}

export function createLowerContext(
  plan: ModulePlan,
  path: string,
  options: AnalyseOptions,
  bindings: BindingGraph,
  coreBindings: ReadonlyMap<LocalId, string> = new Map(),
  jsx: JsxAnalysis = createJsxAnalysis(bindings, coreBindings),
  program: Pick<Program, 'body'> = { body: [] }
): LowerContext {
  const slash = Math.max(path.lastIndexOf('/'), path.lastIndexOf('\\'));
  const basename = slash === -1 ? path : path.slice(slash + 1);
  const sourceIdentity = createSegmentSourceIdentity(path, options.scope, options.rootDir);
  plan.source.symbolNamespace = createSegmentSymbolName(sourceIdentity, 'module', 'synthetic');
  return {
    plan,
    sourceName: basename.replace(/\.[cm]?[jt]sx?$/, ''),
    sourceIdentity,
    segmentCounter: { next: 0 },
    lifts: createLiftAnalysis(program, { plan, bindings, coreBindings, jsx, locals: new Map() }),
    liftedLocals: new Map(),
    claimedReads: new Set(),
    extracted: new Set(),
    deferredLocals: [],
    branchCounter: { next: 0 },
    componentCounter: { next: 0 },
    contentCounter: { next: 0 },
    projectionCounter: { next: 0 },
    slotCounter: { next: 0 },
    revealCounter: { next: 0 },
    reveal: null,
    forCounter: { next: 0 },
    styleCounter: { next: 0 },
    styleScopes: [],
    inlineParams: null,
    inspectorLocation: null,
    bindings,
    jsx,
    coreBindings,
    propsBinding: null,
    returnsRender: true,
    namespace: null,
    elementStack: [],
    propsMembers: new Map(),
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
    renders: [],
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

type QrlInput = Omit<Qrl, 'id' | 'parent' | 'name' | 'propsParts'> & {
  propsParts?: Qrl['propsParts'];
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
  const { identity, propsParts = [], ...fields } = input;
  const resolved =
    identity.kind === QrlIdentityKind.Segment ? allocateSegment(ctx, identity.nameCtx) : identity;
  const qrl: Qrl = {
    ...fields,
    id: resolved.id,
    parent: null,
    name: resolved.name,
    propsParts,
  };
  ctx.plan.qrls.push(qrl);
  return {
    index: ctx.plan.qrls.length - 1,
    use: { qrl: qrl.id, args },
  };
}

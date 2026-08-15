import type { PlanSetupEntry, PlanValue } from './emit-plan';
import { applyReplacements } from './emit-qrl';
import type {
  ComponentPlan,
  OrderedPropPlan,
  RenderFunctionPlan,
  SegmentPlan,
  SetupPlan,
  ValuePlan,
} from './plan-types';
import {
  planSsr,
  planSsrRenderFunction,
  planSsrSegmentRender,
  type SsrComponentReturnModeResolver,
  type SsrOperation,
  type SsrPropOperation,
  type SsrRenderFunctionTargetPlan,
  type SsrSegmentRenderTargetPlan,
  type SsrSetupOperation,
} from './plan-ssr';
import { SetupOpKind, type SetupOp } from './setup-ir';
import type { SourceRange } from './types';

/**
 * SSR-structural op serialization (specs/01 "PlanOp mirrors SsrOperation"): the layer engines
 * render from — pre-merged statics, `q:id` targets, marker decisions, return modes. The semantic
 * `render` tree stays beside it for linking/analysis; this section is the byte-parity contract.
 */
/**
 * Proof that a dollar-prop expression evaluates to a QRL: every leaf must be a qrl-const read (or
 * an absent-fallback literal); selectors branch, tests may be any lowered value.
 */
function irProvesQrl(
  ir: import('./expr-ir').ValueIR,
  qrlConsts: ReadonlyMap<number, string>,
  qrlValued: ReadonlySet<number>
): boolean {
  switch (ir.kind) {
    case 'binding-read':
      return qrlConsts.has(ir.binding) || qrlValued.has(ir.binding);
    case 'undef':
      return true;
    case 'lit':
      return ir.value === null;
    case 'cond':
      return (
        irProvesQrl(ir.then, qrlConsts, qrlValued) && irProvesQrl(ir.else, qrlConsts, qrlValued)
      );
    case 'logic':
      return (
        irProvesQrl(ir.left, qrlConsts, qrlValued) && irProvesQrl(ir.right, qrlConsts, qrlValued)
      );
    default:
      return false;
  }
}

export const enum SsrOpKind {
  Static = 'static',
  Element = 'element',
  Dynamic = 'dynamic',
  Content = 'content',
  Component = 'component',
  Branch = 'branch',
  Suspense = 'suspense',
  Slot = 'slot',
  Collection = 'collection',
}

/** Component-level SSR annotations — byte contracts decided at plan time. */
export interface PlanSsrAnnotations {
  /** The render chain is proven promise-free: no maybeThen chain, steps stay eager. */
  readonly syncRender: boolean;
  readonly staticRoot: boolean;
  readonly needsRootRange: boolean;
  readonly needsId: boolean;
  readonly idBase: string;
  readonly flushTasks: boolean;
  /** Segments invoked synchronously server-side — engines resolve these eagerly (`.s()`). */
  readonly directSegments: readonly string[];
  readonly usedSegments: readonly string[];
  /** Custom-hook components render under a runtime style scope from the invoke context. */
  readonly runtimeScope?: true;
}

export interface PlanSsrComponent {
  readonly setup: readonly PlanSetupEntry[];
  readonly ops: readonly PlanSsrOp[];
  readonly ssr: PlanSsrAnnotations;
}

/** Block-level SSR annotations for nested render fns. */
export interface PlanSsrFnAnnotations {
  readonly syncRender: boolean;
  readonly needsRootRange: boolean;
  readonly staticRoot?: true;
}

export interface PlanSsrRenderFn {
  /** Backing render segment id (arms/rows/slots resolve to QRLs at runtime). */
  readonly segment?: string;
  /** Render-parameter binding ids (segment rows: item, index). */
  readonly paramBindings?: readonly number[];
  readonly setup: readonly PlanSetupEntry[];
  /** Absent = resume-only: renderable solely via the segment QRL; native engines gate. */
  readonly ops?: readonly PlanSsrOp[];
  readonly ssr: PlanSsrFnAnnotations;
}

export interface PlanSsrRow extends PlanSsrRenderFn {
  readonly symbolName: string;
  readonly params: number;
  readonly rowRoot: boolean;
  readonly rowMarker: boolean;
  readonly slotMarker: boolean;
  readonly usesRowId: boolean;
  readonly surroundingRangeId: 'rangeId' | 'rowId' | null;
}

export type PlanSsrProp =
  | { readonly kind: 'static'; readonly name: string; readonly value: unknown }
  | {
      readonly kind: 'dynamic';
      readonly name: string;
      readonly value: PlanValue;
    }
  | { readonly kind: 'spread'; readonly value: PlanValue }
  | { readonly kind: 'ref'; readonly value: PlanValue }
  | { readonly kind: 'inner-html'; readonly html: string | number | boolean | null }
  | {
      readonly kind: 'event';
      readonly name: string;
      readonly handlers: readonly (
        | { readonly value: PlanValue }
        | { readonly bind: string; readonly checked?: true }
      )[];
    }
  | { readonly kind: string; readonly src: string };

export type PlanSsrOp =
  | { readonly kind: SsrOpKind.Static; readonly html: string }
  | {
      readonly kind: SsrOpKind.Element;
      readonly tag: string;
      readonly voidTag: boolean;
      readonly styleScopedId: string | null;
      readonly props: readonly PlanSsrProp[];
      readonly propsEffect: string | null;
      readonly propsEffectRef?: true;
      readonly children: readonly PlanSsrOp[];
      readonly ssr: {
        /** Planned `q:id` target; null = untargeted. CSR addresses by tree path instead. */
        readonly id: number | null;
        readonly targetUses: number;
        readonly runtimeScope?: true;
      };
    }
  | {
      readonly kind: SsrOpKind.Dynamic;
      readonly output: 'text' | 'content';
      readonly value: PlanValue;
      readonly ssr: {
        /** The value evaluates promise-free. */
        readonly synchronous: boolean;
        /** Live subscription target; null = initial-only inline. */
        readonly target:
          | { readonly kind: 'element'; readonly id: number }
          | { readonly kind: 'range'; readonly id: number | null; readonly marker: number }
          | null;
      };
    }
  | {
      readonly kind: SsrOpKind.Content;
      /** Always segment-bearing: the `<!d=` region re-renders by resuming this QRL. */
      readonly value: PlanValue;
      readonly ssr: { readonly root: boolean };
    }
  | {
      readonly kind: SsrOpKind.Component;
      /** Module plans carry the tag source; the linker resolves to `{ ref }`. */
      readonly target: string | { readonly ref: number };
      /** Set when the tag is a plain local: the engine reads it to pick element or component. */
      readonly tagBinding?: number;
      readonly props: readonly PlanSsrProp[];
      readonly propsSource: string | null;
      readonly slots: readonly {
        readonly name: string;
        readonly idBase: string | null;
        readonly render: PlanSsrRenderFn;
      }[];
      readonly ssr: {
        readonly returnMode: 'sync' | 'maybe-promise';
        readonly idBase: string | null;
        readonly blockingSuspense: boolean;
      };
    }
  | {
      readonly kind: SsrOpKind.Branch;
      readonly condition: string;
      readonly conditionIr?: import('./expr-ir').ValueIR;
      readonly then: PlanSsrRenderFn;
      readonly else: PlanSsrRenderFn | null;
      readonly ssr: { readonly root: boolean; readonly idBase: string | null };
    }
  | {
      readonly kind: SsrOpKind.Suspense;
      readonly content: PlanSsrRenderFn;
      /** Renderable QRL: segment for resume identity; `ops` absent = resume-only. */
      readonly fallback: PlanSsrRenderFn | null;
      /** Runtime-selected fallback: IR whose leaves are proven QRLs; engines evaluate it. */
      readonly fallbackValue?: PlanValue;
      readonly delay: PlanValue | null;
      readonly inOrder: readonly PlanSsrOp[] | null;
      /** Static `<Reveal>` group membership: [groupId, order, collapsed, index, count]. */
      readonly reveal?: readonly [number, string, boolean, number, number];
    }
  | {
      readonly kind: SsrOpKind.Slot;
      readonly name: string;
      readonly fallback: PlanSsrRenderFn | null;
      readonly ssr: { readonly idBase: string | null };
    }
  | {
      readonly kind: SsrOpKind.Collection;
      readonly source:
        | {
            readonly kind: 'direct-array';
            readonly src: string;
            readonly ir?: import('./expr-ir').ValueIR;
          }
        | {
            readonly kind: 'direct-reactive';
            readonly src: string;
            readonly ir?: import('./expr-ir').ValueIR;
          }
        | {
            readonly kind: 'derived';
            readonly segment: string;
            readonly keepSource: boolean;
            readonly ir?: import('./expr-ir').ValueIR;
          };
      readonly key: string | null;
      readonly keyIr?: import('./expr-ir').ValueIR;
      readonly row: PlanSsrRow | { readonly segment: PlanSsrRenderFn };
      readonly usesIndexSignal: boolean;
      readonly ssr: {
        readonly usesRowId: boolean;
        readonly idBase: string | null;
        readonly rowShape: 0 | 1 | 2 | 3;
      };
    };

/** Static style CSS from its argument source: quoted/backticked literal, no interpolation. */
const staticStyleCss = (source: string): string | null => {
  const inner = source.slice(1, -1);
  const quote = source[0];
  if (!['`', "'", '"'].includes(quote) || source[source.length - 1] !== quote) {
    return null;
  }
  // fail closed on interpolation and escape sequences — the JS engine keeps the literal
  if (inner.includes('\\') || (quote === '`' && inner.includes('${'))) {
    return null;
  }
  return inner;
};

const UNPLANNABLE = Symbol('ssr-unplannable');

export type JsStatementRewriter = (
  operation: Extract<SsrSetupOperation, { kind: 'statement' }>
) => { readonly src: string; readonly imports: readonly string[] } | 'skip' | null;

/**
 * Finds the serialized wire block backing a segment inside a component's wire plan — the same block
 * nested emission consumes, reused for standalone chunk generation (rows, arms, slots).
 */
export interface WireBlockMatch {
  readonly render: PlanSsrRenderFn | PlanSsrRow;
  /** Local-component entries carry their props shape and context flag beside the block. */
  readonly props?: unknown;
  readonly providesContext?: boolean;
}

export function findWireBlock(
  wire: PlanSsrComponent,
  segmentId: string
): WireBlockMatch | undefined {
  let found: WireBlockMatch | undefined;
  const visitFn = (fn: PlanSsrRenderFn | PlanSsrRow | undefined | null): void => {
    if (found !== undefined || fn === undefined || fn === null) {
      return;
    }
    if (fn.segment === segmentId && fn.ops !== undefined) {
      found = { render: fn };
      return;
    }
    visitSetup(fn.setup);
    if (fn.ops !== undefined) {
      fn.ops.forEach(visitOp);
    }
  };
  const visitSetup = (setup: readonly PlanSetupEntry[]): void => {
    for (const entry of setup) {
      if ((entry as { kind?: string }).kind === 'render-fn') {
        const renderFn = entry as {
          segment?: string;
          props?: unknown;
          providesContext?: boolean;
          render: PlanSsrRenderFn;
        };
        // local components carry their chunk segment on the entry, not the block
        if (
          found === undefined &&
          renderFn.segment === segmentId &&
          renderFn.render.ops !== undefined
        ) {
          found = {
            render: renderFn.render,
            props: renderFn.props,
            providesContext: renderFn.providesContext === true,
          };
          return;
        }
        visitFn(renderFn.render);
      }
    }
  };
  const visitOp = (operation: PlanSsrOp): void => {
    if (found !== undefined) {
      return;
    }
    switch (operation.kind) {
      case SsrOpKind.Element:
        operation.children.forEach(visitOp);
        break;
      case SsrOpKind.Component:
        operation.slots.forEach((slot) => visitFn(slot.render));
        break;
      case SsrOpKind.Branch:
        visitFn(operation.then);
        visitFn(operation.else);
        break;
      case SsrOpKind.Suspense:
        visitFn(operation.content);
        visitFn(operation.fallback);
        if (operation.inOrder !== null) {
          operation.inOrder.forEach(visitOp);
        }
        break;
      case SsrOpKind.Slot:
        visitFn(operation.fallback);
        break;
      case SsrOpKind.Collection: {
        const row = operation.row;
        if (typeof (row as { symbolName?: unknown }).symbolName === 'string') {
          visitFn(row as PlanSsrRow);
        } else {
          visitFn((row as { segment: PlanSsrRenderFn }).segment);
        }
        break;
      }
      default:
        break;
    }
  };
  visitSetup(wire.setup);
  wire.ops.forEach(visitOp);
  return found;
}

export function emitSsrOpPlan(
  /** Null only in chunk mode: a module-level segment has no owning component. */
  component: ComponentPlan | null,
  segments: readonly SegmentPlan[],
  returnMode: SsrComponentReturnModeResolver,
  source: string,
  bindingName: (binding: number) => string | null = () => null,
  rewriteJsStatement?: JsStatementRewriter,
  /** Serialize this segment's own render block instead of the component's. */
  forSegment?: SegmentPlan,
  /** Serialize a bare render fn (module-level JSX in a plain function). */
  forRender?: RenderFunctionPlan
): PlanSsrComponent | null {
  const slice = (range: SourceRange) => source.slice(range[0], range[1]);

  /** Resolves render-arg placeholders against the value's embedded renders, or fails. */
  const resolveRenderArgs = (ir: unknown, value: ValuePlan): unknown => {
    if (ir === null || typeof ir !== 'object') {
      return ir;
    }
    if (Array.isArray(ir)) {
      return ir.map((item) => resolveRenderArgs(item, value));
    }
    const record = ir as Record<string, unknown>;
    if (record.kind === 'render-arg') {
      const range = record.range as readonly [number, number] | undefined;
      const embedded =
        value.kind === 'expression' && range !== undefined
          ? value.embeddedRenders.find(
              (candidate) => candidate.range[0] >= range[0] && candidate.range[1] <= range[1]
            )
          : undefined;
      if (embedded === undefined) {
        // no render body: the callback's extracted segment carries it as a QRL-backed fn
        const fnSegment =
          range === undefined
            ? undefined
            : segments.find(
                (candidate) =>
                  candidate.kind === 'pluginCallback' &&
                  candidate.functionRange[0] === range[0] &&
                  candidate.functionRange[1] === range[1]
              );
        if (fnSegment === undefined) {
          throw UNPLANNABLE;
        }
        return { kind: 'fn-arg', segment: fnSegment.id };
      }
      const block = renderFnBlock(embedded);
      // the callback's result is a runtime renderable: the root must stay a record
      const ssr = { syncRender: block.ssr.syncRender, needsRootRange: block.ssr.needsRootRange };
      return { kind: 'render-arg', params: record.params, render: { ...block, ssr } };
    }
    const resolved: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(record)) {
      resolved[key] = resolveRenderArgs(entry, value);
    }
    return resolved;
  };

  const planValue = (value: ValuePlan): PlanValue => {
    // a direct `$()` value IS its QRL — the segment form carries it holelessly
    if (value.kind === 'expression' && value.boundaries.length === 1) {
      const boundary = segments.find((candidate) => candidate.id === value.boundaries[0].segmentId);
      if (
        boundary?.kind === 'qrl' &&
        (boundary.qrl?.kind === 'explicit' || boundary.qrl?.kind === 'sync') &&
        boundary.range[0] === value.expression[0] &&
        boundary.range[1] === value.expression[1]
      ) {
        return { kind: 'segment', segment: boundary.id };
      }
    }
    if (value.kind !== 'render-value' && value.ir !== undefined) {
      try {
        return {
          kind: 'ir',
          ir: resolveRenderArgs(value.ir, value) as typeof value.ir,
          ...(value.kind === 'segment' ? { segment: value.segment.segmentId } : {}),
        };
      } catch (error) {
        if (error !== UNPLANNABLE) {
          throw error;
        }
        // unresolved render-arg: fall through to the transitional js form
      }
    }
    if (value.kind === 'segment') {
      return { kind: 'segment', segment: value.segment.segmentId };
    }
    // transitional js form; pure = no QRL boundaries or embedded JSX, embeddable verbatim
    const pure =
      (value.kind === 'expression' &&
        value.boundaries.length === 0 &&
        value.embeddedRenders.length === 0) ||
      value.kind === 'source' ||
      value.kind === 'render-value';
    return { kind: 'js', src: slice(value.expression), ...(pure ? { pure: true as const } : {}) };
  };

  // statement ops live in the semantic setup tree, including local-component nesting
  // and every nested render fn (rows, arms, slots, projections)
  const setupOpByRange = new Map<string, SetupOp>();
  const collectSetupOps = (setup: readonly SetupPlan[]): void => {
    for (const item of setup) {
      if (item.kind === 'statement' && item.op !== undefined) {
        setupOpByRange.set(`${item.range[0]}:${item.range[1]}`, item.op);
      }
      if (item.kind === 'local-component' || item.kind === 'render-value') {
        collectRenderFnOps(item.render);
      }
    }
  };
  const collectRenderFnOps = (fn: RenderFunctionPlan): void => {
    collectSetupOps(fn.setup);
    collectRenderNodes(fn.render.roots);
  };
  const collectRenderNodes = (nodes: RenderFunctionPlan['render']['roots']): void => {
    for (const node of nodes) {
      switch (node.kind) {
        case 'element':
          collectRenderNodes(node.children);
          break;
        case 'component':
          node.slots.forEach((slot) => collectRenderFnOps(slot.render));
          break;
        case 'branch':
          collectRenderFnOps(node.then);
          if (node.else !== null) {
            collectRenderFnOps(node.else);
          }
          break;
        case 'suspense':
          collectRenderFnOps(node.content);
          break;
        case 'slot':
          if (node.fallback !== null) {
            collectRenderFnOps(node.fallback);
          }
          break;
        case 'collection':
          collectRenderFnOps(node.row);
          break;
        default:
          break;
      }
    }
  };
  if (component !== null) {
    collectSetupOps(component.setup);
    collectRenderNodes(component.render.roots);
  }
  if (forSegment?.render != null) {
    // chunk mode: the segment's own tree carries the setup ops its block references
    collectRenderFnOps(forSegment.render);
  }
  if (forRender !== undefined) {
    collectRenderFnOps(forRender);
  }

  // proven QRL locals: `const x = $(...)` setup entries, binding → segment
  const qrlConstSegments = new Map<number, string>();
  for (const setupOp of setupOpByRange.values()) {
    if (setupOp.kind === SetupOpKind.QrlConst) {
      qrlConstSegments.set(setupOp.binding, setupOp.segment);
    }
  }
  // extraction-proven QRL consts (selectors over qrl factories) without their own setup op
  const qrlValuedBindings = new Set<number>(component?.qrlValuedBindings ?? []);

  const setupEntries = (setup: readonly SsrSetupOperation[]): PlanSetupEntry[] =>
    setup.flatMap((entry): PlanSetupEntry[] => {
      if (entry.kind === 'style') {
        const planned = component?.setup.find(
          (item) => item.kind === 'style' && item.styleId === entry.styleId
        );
        const css =
          planned !== undefined && planned.kind === 'style'
            ? staticStyleCss(slice(planned.argumentRange))
            : null;
        // dynamic css or consumed results keep the full statement as a JS hole
        let src: string | undefined;
        if (
          planned !== undefined &&
          planned.kind === 'style' &&
          (css === null || planned.resultUsed)
        ) {
          const helper = entry.scoped ? 'useStylesScoped' : 'useStyles';
          const call = `${helper}(${slice(planned.argumentRange)}, ${JSON.stringify(entry.styleId)})`;
          src = applyReplacements(source, planned.range, [
            {
              range: planned.callRange,
              value: planned.resultUsed
                ? `({ ${entry.scoped ? 'scopeId' : 'styleId'}: ${call} })`
                : call,
            },
          ]).trim();
        }
        return [
          {
            kind: SetupOpKind.Style,
            styleId: entry.styleId,
            scoped: entry.scoped,
            ...(css === null ? {} : { css }),
            ...(planned !== undefined && planned.kind === 'style' && planned.resultUsed
              ? { resultUsed: true as const }
              : {}),
            ...(src === undefined ? {} : { src }),
          },
        ];
      }
      if (entry.kind === 'statement') {
        let op: PlanSetupEntry = setupOpByRange.get(`${entry.range[0]}:${entry.range[1]}`) ?? {
          kind: SetupOpKind.Js,
          src: slice(entry.range),
        };
        if (op.kind === SetupOpKind.UseId) {
          // useId ordinals span the whole component, including ids inside js statements
          op = { ...op, ordinal: entry.useIds[0]?.ordinal ?? 0 } as typeof op;
        }
        if (op.kind === SetupOpKind.Js && rewriteJsStatement !== undefined) {
          // production seam: QRL/useId rewrites applied now so generators emit src verbatim
          const rewritten = rewriteJsStatement(entry);
          if (rewritten === 'skip') {
            return [];
          }
          if (rewritten !== null) {
            op = {
              kind: SetupOpKind.Js,
              src: rewritten.src,
              final: true,
              imports: rewritten.imports,
            };
          }
        }
        // declared binding names are semantic metadata — generators may reuse them
        const local = (op as { binding?: number }).binding;
        const name = local === undefined ? null : bindingName(local);
        return [name === null ? op : ({ ...op, name } as unknown as PlanSetupEntry)];
      }
      if (entry.kind === 'local-component') {
        const parameter = entry.parameter;
        return [
          {
            kind: SetupOpKind.RenderFn,
            component: true as const,
            name: entry.name,
            binding: entry.bindingId,
            segment: entry.segment,
            ...(entry.providesContext ? { providesContext: true } : {}),
            props:
              parameter === null
                ? null
                : parameter.kind === 'identifier'
                  ? { kind: 'identifier', binding: parameter.bindingIds[0] }
                  : {
                      kind: 'object',
                      bindings: parameter.bindingIds.map((b, index) => ({
                        binding: b,
                        name: entry.propNames[index],
                      })),
                    },
            render: targetBlock(entry.target),
          },
        ];
      }
      if (entry.kind === 'render-value') {
        return [
          {
            kind: SetupOpKind.RenderFn,
            name: entry.name,
            binding: entry.bindingId,
            render: {
              setup: [],
              ops: entry.render.operations.map(op),
              ssr: {
                syncRender: entry.render.synchronous,
                needsRootRange: entry.render.needsRootRange,
                ...(entry.render.staticRoot ? { staticRoot: true as const } : {}),
              },
            } as PlanSsrRenderFn,
          },
        ];
      }
      return [{ kind: SetupOpKind.Js, src: slice([0, 0]) }];
    });

  const ssrProp = (item: SsrPropOperation): PlanSsrProp => {
    switch (item.kind) {
      case 'static':
        return { kind: 'static', name: item.name, value: item.value };
      case 'dynamic':
        return {
          kind: 'dynamic',
          name: item.name,
          value: planValue(item.value),
        };
      case 'spread':
        return { kind: 'spread', value: planValue(item.value) };
      case 'ref':
        return { kind: 'ref', value: planValue(item.value) };
      case 'event':
        return {
          kind: 'event',
          name: item.eventName,
          handlers: item.handlers.map((handler) =>
            handler.kind === 'value'
              ? { value: planValue(handler.value) }
              : {
                  bind: slice(handler.signal),
                  ...(handler.name === 'checked' ? { checked: true as const } : {}),
                }
          ),
        };
      case 'inner-html':
        // static innerHTML bakes raw children; dynamic keeps the JS fallback src
        if (typeof item.value !== 'object' || item.value === null) {
          return { kind: 'inner-html', html: item.value };
        }
        return { kind: item.kind, src: slice(item.range) };
    }
  };

  const orderedProp = (item: OrderedPropPlan): PlanSsrProp => {
    switch (item.kind) {
      case 'static':
        return { kind: 'static', name: item.name, value: item.value };
      case 'dynamic':
        return {
          kind: 'dynamic',
          name: item.name,
          value: planValue(item.value),
        };
      case 'spread':
        return { kind: 'spread', value: planValue(item.value) };
      case 'ref':
        return { kind: 'ref', value: planValue(item.value) };
      case 'event':
        return { kind: 'event', name: item.name, handlers: [{ value: planValue(item.value) }] };
      default:
        return { kind: item.kind, src: slice(item.range) };
    }
  };

  // one prop per event name: repeated event props append their handlers
  const orderedProps = (items: readonly OrderedPropPlan[]): PlanSsrProp[] => {
    const props: PlanSsrProp[] = [];
    const eventIndex = new Map<string, number>();
    for (const item of items) {
      if (item.kind === 'event') {
        const handler = { value: planValue(item.value) };
        const index = eventIndex.get(item.name);
        if (index !== undefined) {
          const existing = props[index] as Extract<PlanSsrProp, { kind: 'event' }>;
          props[index] = { ...existing, handlers: [...existing.handlers, handler] };
          continue;
        }
        eventIndex.set(item.name, props.length);
        props.push({ kind: 'event', name: item.name, handlers: [handler] });
        continue;
      }
      props.push(orderedProp(item));
    }
    return props;
  };

  const renderFnBlock = (fn: RenderFunctionPlan): PlanSsrRenderFn => {
    const planned = planSsrRenderFunction(fn, segments, returnMode);
    if (planned === null) {
      throw UNPLANNABLE;
    }
    return { ...(fn.segmentId === null ? {} : { segment: fn.segmentId }), ...targetBlock(planned) };
  };

  const targetBlock = (target: SsrRenderFunctionTargetPlan): PlanSsrRenderFn => ({
    setup: setupEntries(target.setup),
    ops: target.render.operations.map(op),
    ssr: {
      syncRender: target.render.synchronous,
      needsRootRange: target.render.needsRootRange,
      ...(target.render.staticRoot ? { staticRoot: true as const } : {}),
    },
  });

  const rowBlock = (
    row: SsrSegmentRenderTargetPlan,
    symbolName: string,
    params: number
  ): PlanSsrRow => ({
    ...targetBlock(row),
    paramBindings: row.parameterBindingIds.slice(0, params),
    symbolName,
    params,
    rowRoot: row.rowRoot,
    rowMarker: row.rowMarker,
    slotMarker: row.slotMarker,
    usesRowId: row.usesRowId,
    surroundingRangeId: row.surroundingRangeId,
  });

  const op = (operation: SsrOperation): PlanSsrOp => {
    switch (operation.kind) {
      case 'static':
        return { kind: SsrOpKind.Static, html: operation.value };
      case 'element':
        return {
          kind: SsrOpKind.Element,
          tag: operation.tag,
          voidTag: operation.void,
          styleScopedId: operation.styleScopedId,
          props: operation.props.map(ssrProp),
          propsEffect: operation.propsEffect === null ? null : operation.propsEffect.segmentId,
          ...(operation.propsEffect !== null && operation.propsEffectRef
            ? { propsEffectRef: true as const }
            : {}),
          children: operation.children.map(op),
          ssr: {
            id: operation.targetId,
            targetUses: operation.elementTargetUses,
            ...(operation.runtimeStyleScope ? { runtimeScope: true as const } : {}),
          },
        };
      case 'dynamic':
        return {
          kind: SsrOpKind.Dynamic,
          output: operation.output,
          value: planValue(operation.value),
          ssr: {
            synchronous: operation.synchronous,
            target:
              operation.target === null
                ? null
                : operation.target.kind === 'element'
                  ? { kind: 'element', id: operation.target.targetId }
                  : {
                      kind: 'range',
                      id: operation.target.targetId,
                      marker: operation.target.markerIndex,
                    },
          },
        };
      case 'content-effect':
        return {
          kind: SsrOpKind.Content,
          value:
            operation.value === null
              ? { kind: 'segment', segment: operation.segment.segmentId }
              : planValue(operation.value),
          ssr: { root: operation.root },
        };
      case 'component':
        return {
          kind: SsrOpKind.Component,
          target: slice(operation.tagRange),
          ...(operation.tagBinding == null ? {} : { tagBinding: operation.tagBinding }),
          props: orderedProps(operation.props),
          propsSource: operation.propsSource === null ? null : operation.propsSource.segmentId,
          slots: operation.slots.map((slot) => ({
            name: slot.name,
            idBase: slot.idBase,
            render: renderFnBlock(slot.render),
          })),
          ssr: {
            returnMode: operation.returnMode,
            idBase: operation.idBase,
            blockingSuspense: operation.blockingSuspense,
          },
        };
      case 'branch':
        return {
          kind: SsrOpKind.Branch,
          condition: operation.condition.segmentId,
          ...(operation.conditionIr !== undefined ? { conditionIr: operation.conditionIr } : {}),
          then: renderFnBlock(operation.then),
          else: operation.else === null ? null : renderFnBlock(operation.else),
          ssr: { root: operation.root, idBase: operation.idBase },
        };
      case 'suspense': {
        let fallbackValue = operation.fallback;
        let selectedFallback: PlanValue | undefined;
        if (fallbackValue !== null && fallbackValue.kind !== 'segment') {
          const ir = fallbackValue.kind === 'render-value' ? undefined : fallbackValue.ir;
          // a `*$` prop is a QRL no matter what: a bare qrl-const read resolves to its
          // segment; a composite must prove every leaf QRL-valued or the compile fails
          const direct =
            ir !== undefined && ir.kind === 'binding-read'
              ? qrlConstSegments.get(ir.binding)
              : undefined;
          if (direct !== undefined) {
            fallbackValue = {
              kind: 'segment',
              expression: fallbackValue.expression,
              segment: { segmentId: direct, captureBindingIds: [], componentPropBindingIds: [] },
            };
          } else if (ir !== undefined && irProvesQrl(ir, qrlConstSegments, qrlValuedBindings)) {
            selectedFallback = planValue(fallbackValue);
            fallbackValue = null;
          } else {
            throw UNPLANNABLE;
          }
        }
        const fallbackSegment =
          fallbackValue !== null && fallbackValue.kind === 'segment'
            ? segments.find((candidate) => candidate.id === fallbackValue.segment.segmentId)
            : undefined;
        if (fallbackValue !== null && fallbackSegment === undefined) {
          throw UNPLANNABLE;
        }
        const fallbackTarget =
          fallbackSegment === undefined
            ? null
            : planSsrSegmentRender(fallbackSegment, segments, returnMode);
        return {
          kind: SsrOpKind.Suspense,
          content: renderFnBlock(operation.content),
          fallback:
            fallbackSegment === undefined
              ? null
              : fallbackTarget === null
                ? // resume-only: the QRL renders it, no structural ops
                  {
                    segment: fallbackSegment.id,
                    setup: [],
                    ssr: { syncRender: false, needsRootRange: false },
                  }
                : { segment: fallbackSegment.id, ...targetBlock(fallbackTarget) },
          ...(selectedFallback === undefined ? {} : { fallbackValue: selectedFallback }),
          delay: operation.delay === null ? null : planValue(operation.delay),
          inOrder: operation.inOrder === null ? null : operation.inOrder.map(op),
          ...(operation.reveal === null
            ? {}
            : {
                reveal: [
                  operation.reveal.group,
                  operation.reveal.order,
                  operation.reveal.collapsed,
                  operation.reveal.index,
                  operation.reveal.count,
                ] as const,
              }),
        };
      }
      case 'slot':
        return {
          kind: SsrOpKind.Slot,
          name: operation.name,
          fallback: operation.fallback === null ? null : renderFnBlock(operation.fallback),
          ssr: { idBase: operation.idBase },
        };
      case 'collection':
        return {
          kind: SsrOpKind.Collection,
          source:
            operation.source.kind === 'derived'
              ? {
                  kind: 'derived',
                  segment: operation.source.segment.segmentId,
                  keepSource: operation.source.keepSource,
                  ...(operation.source.ir !== undefined ? { ir: operation.source.ir } : {}),
                }
              : operation.source.kind === 'direct-array'
                ? {
                    kind: 'direct-array' as const,
                    src: slice(operation.source.expression),
                    ...(operation.source.ir !== undefined ? { ir: operation.source.ir } : {}),
                  }
                : {
                    kind: 'direct-reactive' as const,
                    src: slice(operation.source.expression),
                    ...(operation.source.ir !== undefined ? { ir: operation.source.ir } : {}),
                  },
          key: operation.key === null ? null : operation.key.segmentId,
          ...(operation.keyIr !== undefined ? { keyIr: operation.keyIr } : {}),
          row:
            operation.row.kind === 'segment'
              ? {
                  segment: {
                    ...renderFnBlock(operation.row.render),
                    paramBindings: operation.row.render.parameterBindingIds,
                  },
                }
              : rowBlock(
                  operation.row.target,
                  operation.row.symbolName,
                  operation.row.usedParameterCount
                ),
          usesIndexSignal: operation.usesIndexSignal,
          ssr: {
            usesRowId: operation.usesRowId,
            idBase: operation.idBase,
            rowShape: operation.rowShape,
          },
        };
    }
  };

  // chunk mode: serialize one segment's own render block with the same machinery
  if (forSegment !== undefined || forRender !== undefined) {
    const target =
      forSegment !== undefined
        ? planSsrSegmentRender(forSegment, segments, returnMode)
        : planSsrRenderFunction(forRender!, segments, returnMode);
    if (target === null) {
      return null;
    }
    try {
      return {
        setup: setupEntries(target.setup),
        ops: target.render.operations.map(op),
        ssr: {
          syncRender: target.render.synchronous,
          needsRootRange: target.render.needsRootRange,
          ...(target.render.staticRoot ? { staticRoot: true as const } : {}),
        },
      } as never;
    } catch (error) {
      if (error === UNPLANNABLE) {
        return null;
      }
      throw error;
    }
  }
  const planned = component === null ? null : planSsr(component, returnMode);
  if (planned === null) {
    return null;
  }
  try {
    return {
      setup: setupEntries(planned.setup),
      ops: planned.render.operations.map(op),
      ssr: {
        syncRender: planned.render.synchronous,
        staticRoot: planned.render.staticRoot,
        needsRootRange: planned.render.needsRootRange,
        needsId: planned.needsId,
        idBase: planned.idBase,
        flushTasks: planned.flushTasks,
        directSegments: planned.directSegmentIds,
        usedSegments: planned.usedSegmentIds,
        ...(planned.runtimeStyleScopeName !== null ? { runtimeScope: true as const } : {}),
      },
    };
  } catch (error) {
    if (error === UNPLANNABLE) {
      return null;
    }
    throw error;
  }
}

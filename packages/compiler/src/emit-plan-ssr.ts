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
      readonly delay: PlanValue | null;
      readonly inOrder: readonly PlanSsrOp[] | null;
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

export function emitSsrOpPlan(
  component: ComponentPlan,
  segments: readonly SegmentPlan[],
  returnMode: SsrComponentReturnModeResolver,
  source: string,
  bindingName: (binding: number) => string | null = () => null,
  rewriteJsStatement?: JsStatementRewriter
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
        boundary.qrl?.kind === 'explicit' &&
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
  collectSetupOps(component.setup);
  collectRenderNodes(component.render.roots);

  const setupEntries = (setup: readonly SsrSetupOperation[]): PlanSetupEntry[] =>
    setup.flatMap((entry): PlanSetupEntry[] => {
      if (entry.kind === 'style') {
        const planned = component.setup.find(
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
          props: operation.props.map(orderedProp),
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
        const fallbackValue = operation.fallback;
        if (fallbackValue !== null && fallbackValue.kind !== 'segment') {
          // fallback$ must be a QRL; value fallbacks are unplannable (compile error eventually)
          throw UNPLANNABLE;
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
          delay: operation.delay === null ? null : planValue(operation.delay),
          inOrder: operation.inOrder === null ? null : operation.inOrder.map(op),
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

  const planned = planSsr(component, returnMode);
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

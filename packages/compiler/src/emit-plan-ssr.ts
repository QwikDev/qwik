import type { PlanSetupEntry, PlanValue } from './emit-plan';
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
  Element = 'el',
  Dynamic = 'dyn',
  Content = 'content',
  Component = 'component',
  Branch = 'branch',
  Suspense = 'suspense',
  Slot = 'slot',
  Collection = 'collection',
}

export interface PlanSsrComponent {
  readonly setup: readonly PlanSetupEntry[];
  /** Segments invoked synchronously server-side — engines resolve these eagerly (`.s()`). */
  readonly directSegmentIds: readonly string[];
  readonly usedSegmentIds: readonly string[];
  readonly ops: readonly PlanSsrOp[];
  readonly synchronous: boolean;
  readonly staticRoot: boolean;
  readonly needsRootRange: boolean;
  readonly needsId: boolean;
  readonly idBase: string;
  readonly flushTasks: boolean;
}

export interface PlanSsrRenderFn {
  /** Backing render segment id (arms/rows/slots resolve to QRLs at runtime). */
  readonly segment?: string;
  /** Render-parameter binding ids (segment rows: item, index). */
  readonly paramBindings?: readonly number[];
  readonly setup: readonly PlanSetupEntry[];
  readonly ops: readonly PlanSsrOp[];
  readonly synchronous: boolean;
  readonly needsRootRange: boolean;
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
  | { readonly p: 'static'; readonly name: string; readonly value: unknown }
  | {
      readonly p: 'dynamic';
      readonly name: string;
      readonly value: PlanValue;
      readonly compilerString: boolean;
    }
  | { readonly p: 'spread'; readonly value: PlanValue }
  | { readonly p: 'inner-html'; readonly html: string | number | boolean | null }
  | {
      readonly p: 'event';
      readonly name: string;
      readonly handlers: readonly ({ readonly value: PlanValue } | { readonly bind: string })[];
    }
  | { readonly p: string; readonly src: string };

export type PlanSsrOp =
  | { readonly o: SsrOpKind.Static; readonly html: string }
  | {
      readonly o: SsrOpKind.Element;
      readonly tag: string;
      readonly id: number | null;
      readonly void: boolean;
      readonly styleScopedId: string | null;
      readonly targetUses: number;
      readonly props: readonly PlanSsrProp[];
      readonly propsEffect: string | null;
      readonly children: readonly PlanSsrOp[];
    }
  | {
      readonly o: SsrOpKind.Dynamic;
      readonly output: 'text' | 'content';
      readonly value: PlanValue;
      readonly synchronous: boolean;
      readonly target:
        | { readonly kind: 'element'; readonly id: number }
        | { readonly kind: 'range'; readonly id: number | null; readonly marker: number }
        | null;
    }
  | {
      readonly o: SsrOpKind.Content;
      readonly segment: string;
      readonly root: boolean;
      readonly value?: PlanValue;
    }
  | {
      readonly o: SsrOpKind.Component;
      /** Module plans carry the tag source; the linker resolves to `{ ref }`. */
      readonly target: string | { readonly ref: number };
      readonly returnMode: 'sync' | 'maybe-promise';
      readonly props: readonly PlanSsrProp[];
      readonly propsSource: string | null;
      readonly idBase: string | null;
      readonly blockingSuspense: boolean;
      readonly slots: readonly {
        readonly name: string;
        readonly idBase: string | null;
        readonly render: PlanSsrRenderFn;
      }[];
    }
  | {
      readonly o: SsrOpKind.Branch;
      readonly condition: string;
      readonly conditionIr?: import('./expr-ir').ValueIR;
      readonly root: boolean;
      readonly idBase: string | null;
      readonly then: PlanSsrRenderFn;
      readonly else: PlanSsrRenderFn | null;
    }
  | {
      readonly o: SsrOpKind.Suspense;
      readonly content: PlanSsrRenderFn;
      readonly fallback: PlanValue | null;
      /** Structural fallback plan (native engines render this; the QRL stays for resume). */
      readonly fallbackRender?: PlanSsrRenderFn;
      readonly delay: PlanValue | null;
      readonly inOrder: readonly PlanSsrOp[] | null;
    }
  | {
      readonly o: SsrOpKind.Slot;
      readonly name: string;
      readonly idBase: string | null;
      readonly fallback: PlanSsrRenderFn | null;
    }
  | {
      readonly o: SsrOpKind.Collection;
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
      readonly usesRowId: boolean;
      readonly idBase: string | null;
      readonly rowShape: 0 | 1 | 2 | 3;
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

export function emitSsrOpPlan(
  component: ComponentPlan,
  segments: readonly SegmentPlan[],
  returnMode: SsrComponentReturnModeResolver,
  source: string
): PlanSsrComponent | null {
  const slice = (range: SourceRange) => source.slice(range[0], range[1]);

  const planValue = (value: ValuePlan): PlanValue => ({
    src: slice(value.expression),
    ...(value.kind !== 'render-value' && value.ir !== undefined ? { ir: value.ir } : {}),
    ...(value.kind === 'segment' ? { segment: value.segment.segmentId } : {}),
  });

  // statement ops live in the semantic setup tree, including local-component nesting
  const setupOpByRange = new Map<string, SetupOp>();
  const collectSetupOps = (setup: readonly SetupPlan[]): void => {
    for (const item of setup) {
      if (item.kind === 'statement' && item.op !== undefined) {
        setupOpByRange.set(`${item.range[0]}:${item.range[1]}`, item.op);
      }
      if (item.kind === 'local-component' || item.kind === 'render-value') {
        collectSetupOps(item.render.setup);
      }
    }
  };
  collectSetupOps(component.setup);

  const setupEntries = (setup: readonly SsrSetupOperation[]): PlanSetupEntry[] =>
    setup.map((entry) => {
      if (entry.kind === 'style') {
        const planned = component.setup.find(
          (item) => item.kind === 'style' && item.styleId === entry.styleId
        );
        const css =
          planned !== undefined && planned.kind === 'style'
            ? staticStyleCss(slice(planned.argumentRange))
            : null;
        return {
          op: SetupOpKind.Style,
          styleId: entry.styleId,
          scoped: entry.scoped,
          ...(css === null ? {} : { css }),
        };
      }
      if (entry.kind === 'statement') {
        return (
          setupOpByRange.get(`${entry.range[0]}:${entry.range[1]}`) ?? {
            op: SetupOpKind.Js,
            src: slice(entry.range),
          }
        );
      }
      if (entry.kind === 'local-component') {
        const parameter = entry.parameter;
        return {
          op: SetupOpKind.LocalComponent,
          name: entry.name,
          binding: entry.bindingId,
          props:
            parameter === null
              ? null
              : parameter.kind === 'identifier'
                ? { kind: 'identifier', binding: parameter.bindingIds[0] }
                : {
                    kind: 'object',
                    bindings: parameter.bindingIds.map((b, index) => ({
                      b,
                      name: entry.propNames[index],
                    })),
                  },
          render: targetBlock(entry.target),
        };
      }
      return { op: SetupOpKind.Js, src: slice([0, 0]) };
    });

  const ssrProp = (item: SsrPropOperation): PlanSsrProp => {
    switch (item.kind) {
      case 'static':
        return { p: 'static', name: item.name, value: item.value };
      case 'dynamic':
        return {
          p: 'dynamic',
          name: item.name,
          value: planValue(item.value),
          compilerString: item.compilerString,
        };
      case 'spread':
        return { p: 'spread', value: planValue(item.value) };
      case 'event':
        return {
          p: 'event',
          name: item.eventName,
          handlers: item.handlers.map((handler) =>
            handler.kind === 'value'
              ? { value: planValue(handler.value) }
              : { bind: slice(handler.signal) }
          ),
        };
      case 'inner-html':
        // static innerHTML bakes raw children; dynamic keeps the JS fallback src
        if (typeof item.value !== 'object' || item.value === null) {
          return { p: 'inner-html', html: item.value };
        }
        return { p: item.kind, src: slice(item.range) };
      default:
        return { p: item.kind, src: slice(item.range) };
    }
  };

  const orderedProp = (item: OrderedPropPlan): PlanSsrProp => {
    switch (item.kind) {
      case 'static':
        return { p: 'static', name: item.name, value: item.value };
      case 'dynamic':
        return {
          p: 'dynamic',
          name: item.name,
          value: planValue(item.value),
          compilerString: false,
        };
      case 'spread':
        return { p: 'spread', value: planValue(item.value) };
      case 'event':
        return { p: 'event', name: item.name, handlers: [{ value: planValue(item.value) }] };
      default:
        return { p: item.kind, src: slice(item.range) };
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
    synchronous: target.render.synchronous,
    needsRootRange: target.render.needsRootRange,
  });

  const rowBlock = (
    row: SsrSegmentRenderTargetPlan,
    symbolName: string,
    params: number
  ): PlanSsrRow => ({
    ...targetBlock(row),
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
        return { o: SsrOpKind.Static, html: operation.value };
      case 'element':
        return {
          o: SsrOpKind.Element,
          tag: operation.tag,
          id: operation.targetId,
          void: operation.void,
          styleScopedId: operation.styleScopedId,
          targetUses: operation.elementTargetUses,
          props: operation.props.map(ssrProp),
          propsEffect: operation.propsEffect === null ? null : operation.propsEffect.segmentId,
          children: operation.children.map(op),
        };
      case 'dynamic':
        return {
          o: SsrOpKind.Dynamic,
          output: operation.output,
          value: planValue(operation.value),
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
        };
      case 'content-effect':
        return {
          o: SsrOpKind.Content,
          segment: operation.segment.segmentId,
          root: operation.root,
          ...(operation.value === null ? {} : { value: planValue(operation.value) }),
        };
      case 'component':
        return {
          o: SsrOpKind.Component,
          target: slice(operation.tagRange),
          returnMode: operation.returnMode,
          props: operation.props.map(orderedProp),
          propsSource: operation.propsSource === null ? null : operation.propsSource.segmentId,
          idBase: operation.idBase,
          blockingSuspense: operation.blockingSuspense,
          slots: operation.slots.map((slot) => ({
            name: slot.name,
            idBase: slot.idBase,
            render: renderFnBlock(slot.render),
          })),
        };
      case 'branch':
        return {
          o: SsrOpKind.Branch,
          condition: operation.condition.segmentId,
          ...(operation.conditionIr !== undefined ? { conditionIr: operation.conditionIr } : {}),
          root: operation.root,
          idBase: operation.idBase,
          then: renderFnBlock(operation.then),
          else: operation.else === null ? null : renderFnBlock(operation.else),
        };
      case 'suspense': {
        const fallbackValue = operation.fallback;
        const fallbackSegment =
          fallbackValue !== null && fallbackValue.kind === 'segment'
            ? segments.find((candidate) => candidate.id === fallbackValue.segment.segmentId)
            : undefined;
        const fallbackTarget =
          fallbackSegment === undefined
            ? null
            : planSsrSegmentRender(fallbackSegment, segments, returnMode);
        return {
          o: SsrOpKind.Suspense,
          content: renderFnBlock(operation.content),
          fallback: operation.fallback === null ? null : planValue(operation.fallback),
          ...(fallbackTarget === null
            ? {}
            : {
                fallbackRender: { segment: fallbackSegment!.id, ...targetBlock(fallbackTarget) },
              }),
          delay: operation.delay === null ? null : planValue(operation.delay),
          inOrder: operation.inOrder === null ? null : operation.inOrder.map(op),
        };
      }
      case 'slot':
        return {
          o: SsrOpKind.Slot,
          name: operation.name,
          idBase: operation.idBase,
          fallback: operation.fallback === null ? null : renderFnBlock(operation.fallback),
        };
      case 'collection':
        return {
          o: SsrOpKind.Collection,
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
          usesRowId: operation.usesRowId,
          idBase: operation.idBase,
          rowShape: operation.rowShape,
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
      directSegmentIds: planned.directSegmentIds,
      usedSegmentIds: planned.usedSegmentIds,
      ops: planned.render.operations.map(op),
      synchronous: planned.render.synchronous,
      staticRoot: planned.render.staticRoot,
      needsRootRange: planned.render.needsRootRange,
      needsId: planned.needsId,
      idBase: planned.idBase,
      flushTasks: planned.flushTasks,
    };
  } catch (error) {
    if (error === UNPLANNABLE) {
      return null;
    }
    throw error;
  }
}

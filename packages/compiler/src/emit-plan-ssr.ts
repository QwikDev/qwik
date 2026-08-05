import type { PlanSetupEntry, PlanValue } from './emit-plan';
import type {
  ComponentPlan,
  OrderedPropPlan,
  RenderFunctionPlan,
  SegmentPlan,
  ValuePlan,
} from './plan-types';
import {
  planSsr,
  planSsrRenderFunction,
  type SsrComponentReturnModeResolver,
  type SsrOperation,
  type SsrPropOperation,
  type SsrRenderFunctionTargetPlan,
  type SsrSegmentRenderTargetPlan,
  type SsrSetupOperation,
} from './plan-ssr';
import { SetupOpKind } from './setup-ir';
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
  | { readonly o: SsrOpKind.Content; readonly segment: string; readonly root: boolean }
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
      readonly root: boolean;
      readonly idBase: string | null;
      readonly then: PlanSsrRenderFn;
      readonly else: PlanSsrRenderFn | null;
    }
  | {
      readonly o: SsrOpKind.Suspense;
      readonly content: PlanSsrRenderFn;
      readonly fallback: PlanValue | null;
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
        | { readonly kind: 'direct-array'; readonly src: string }
        | { readonly kind: 'direct-reactive'; readonly src: string }
        | { readonly kind: 'derived'; readonly segment: string; readonly keepSource: boolean };
      readonly key: string | null;
      readonly row: PlanSsrRow | { readonly segment: PlanSsrRenderFn };
      readonly usesIndexSignal: boolean;
      readonly usesRowId: boolean;
      readonly idBase: string | null;
      readonly rowShape: 0 | 1 | 2 | 3;
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

  const setupEntries = (setup: readonly SsrSetupOperation[]): PlanSetupEntry[] =>
    setup.map((entry) => {
      if (entry.kind === 'style') {
        return { op: SetupOpKind.Style, styleId: entry.styleId, scoped: entry.scoped };
      }
      if (entry.kind === 'statement') {
        const planned = component.setup.find(
          (item) =>
            item.kind === 'statement' &&
            item.range[0] === entry.range[0] &&
            item.range[1] === entry.range[1]
        );
        if (planned !== undefined && planned.kind === 'statement' && planned.op !== undefined) {
          return planned.op;
        }
        return { op: SetupOpKind.Js, src: slice(entry.range) };
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
        return { o: SsrOpKind.Content, segment: operation.segment.segmentId, root: operation.root };
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
          root: operation.root,
          idBase: operation.idBase,
          then: renderFnBlock(operation.then),
          else: operation.else === null ? null : renderFnBlock(operation.else),
        };
      case 'suspense':
        return {
          o: SsrOpKind.Suspense,
          content: renderFnBlock(operation.content),
          fallback: operation.fallback === null ? null : planValue(operation.fallback),
          delay: operation.delay === null ? null : planValue(operation.delay),
          inOrder: operation.inOrder === null ? null : operation.inOrder.map(op),
        };
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
                }
              : { kind: operation.source.kind, src: slice(operation.source.expression) },
          key: operation.key === null ? null : operation.key.segmentId,
          row:
            operation.row.kind === 'segment'
              ? { segment: renderFnBlock(operation.row.render) }
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

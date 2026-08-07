import type { PlanSegmentMeta } from './emit-plan';
import type { PlanValue } from './emit-plan';
import type { PlanSsrComponent, PlanSsrOp, PlanSsrProp, PlanSsrRenderFn } from './emit-plan-ssr';
import { SsrOpKind } from './emit-plan-ssr';
import type { SsrOperation, SsrPlan, SsrPropOperation } from './plan-ssr';
import type { SegmentPlan, SegmentReferencePlan, ValuePlan } from './plan-types';
import type { SourceRange } from './types';

/**
 * Revives the wire SSR plan (`PlanSsrComponent`, the cross-engine contract) into the rich
 * structures `emit-ssr` consumes, so JS module code is generated FROM the plan. Source ranges are
 * rebuilt against a synthetic source assembled from the plan's own `src` strings, which keeps the
 * existing emitter byte-identical wherever revival succeeds. Returns null for any construct the
 * wire cannot express yet — the caller falls back to direct emission, and the snapshot suite
 * guarantees both paths agree.
 */
export interface RevivedSsrComponent {
  readonly plan: SsrPlan;
  readonly source: string;
  readonly segments: ReadonlyMap<string, SegmentPlan>;
}

const UNREVIVABLE = Symbol('plan-unrevivable');

export function reviveSsrComponent(
  wire: PlanSsrComponent,
  segmentMetas: readonly PlanSegmentMeta[]
): RevivedSsrComponent | null {
  // v1 scope: components whose setup is empty; setup statements need wire-side growth first
  if (wire.setup.length > 0) {
    return null;
  }

  let source = '';
  const range = (text: string): SourceRange => {
    const start = source.length;
    source += text;
    // separator keeps accidental adjacent-slice reads visibly wrong instead of silently valid
    source += '\n';
    return [start, start + text.length];
  };

  const segments = new Map<string, SegmentPlan>();
  const segmentRef = (segmentId: string): SegmentReferencePlan => {
    const meta = segmentMetas.find((candidate) => candidate.id === segmentId);
    if (meta === undefined) {
      throw UNREVIVABLE;
    }
    if (!segments.has(segmentId)) {
      // minimal SegmentPlan facade: exactly the fields the SSR emitter reads
      segments.set(segmentId, {
        id: meta.id,
        symbolName: meta.symbolName,
        kind: meta.kind,
        captures: meta.captures.map((capture) => ({
          name: capture.name,
          bindingId: capture.binding,
          source: capture.source,
          access: capture.access,
        })),
        qrl: meta.qrl,
      } as unknown as SegmentPlan);
    }
    return {
      segmentId,
      captureBindingIds: meta.captures.map((capture) => capture.binding),
      componentPropBindingIds: meta.captures
        .filter((capture) => capture.access === 'component-prop')
        .map((capture) => capture.binding),
    };
  };

  const valuePlan = (value: PlanValue): ValuePlan => {
    if (value.opaque === true) {
      throw UNREVIVABLE;
    }
    const expression = range(value.src);
    if (value.segment !== undefined) {
      return {
        kind: 'segment',
        expression,
        segment: segmentRef(value.segment),
        ...(value.ir !== undefined ? { ir: value.ir } : {}),
      };
    }
    return {
      kind: 'expression',
      expression,
      referenceBindingIds: [],
      initialOnly: false,
      compilerString: false,
      boundaries: [],
      embeddedRenders: [],
      ...(value.ir !== undefined ? { ir: value.ir } : {}),
    };
  };

  const prop = (item: PlanSsrProp): SsrPropOperation => {
    switch (item.p) {
      case 'static':
        return {
          kind: 'static',
          name: (item as { name: string }).name,
          value: (item as { value: unknown }).value,
        } as SsrPropOperation;
      case 'dynamic': {
        const dynamic = item as {
          name: string;
          value: PlanValue;
          compilerString: boolean;
        };
        return {
          kind: 'dynamic',
          name: dynamic.name,
          value: valuePlan(dynamic.value),
          compilerString: dynamic.compilerString,
        } as SsrPropOperation;
      }
      case 'inner-html': {
        const innerHtml = (item as { html: string | number | boolean | null }).html;
        return { kind: 'inner-html', value: innerHtml } as unknown as SsrPropOperation;
      }
      case 'event': {
        const event = item as {
          name: string;
          handlers: readonly ({ value: PlanValue } | { bind: string })[];
        };
        return {
          kind: 'event',
          eventName: event.name,
          handlers: event.handlers.map((handler) =>
            'value' in handler
              ? { kind: 'value' as const, value: valuePlan(handler.value) }
              : {
                  kind: 'bind' as const,
                  name: event.name === 'q-e:input' ? ('value' as const) : ('checked' as const),
                  signal: range(handler.bind),
                }
          ),
        } as SsrPropOperation;
      }
      default:
        throw UNREVIVABLE;
    }
  };

  const op = (operation: PlanSsrOp): SsrOperation => {
    switch (operation.o) {
      case SsrOpKind.Static:
        return { kind: 'static', value: operation.html };
      case SsrOpKind.Element:
        if (operation.propsEffect !== null) {
          throw UNREVIVABLE;
        }
        return {
          kind: 'element',
          tag: operation.tag,
          targetId: operation.id,
          props: operation.props.map(prop),
          propsEffect: null,
          propsEffectRef: false,
          children: operation.children.map(op),
          void: operation.void,
          styleScopedId: operation.styleScopedId,
          runtimeStyleScope: operation.runtimeScope === true,
          elementTargetUses: operation.targetUses,
        };
      case SsrOpKind.Dynamic:
        return {
          kind: 'dynamic',
          output: operation.output,
          value: valuePlan(operation.value),
          source: operation.sourceSrc === undefined ? null : range(operation.sourceSrc),
          synchronous: operation.synchronous,
          target:
            operation.target === null
              ? null
              : operation.target.kind === 'element'
                ? { kind: 'element', targetId: operation.target.id }
                : {
                    kind: 'range',
                    targetId: operation.target.id,
                    markerIndex: operation.target.marker,
                  },
        };
      case SsrOpKind.Content:
        return {
          kind: 'content-effect',
          segment: segmentRef(operation.segment),
          root: operation.root,
          value: operation.value === undefined ? null : valuePlan(operation.value),
        };
      case SsrOpKind.Branch:
        return {
          kind: 'branch',
          condition: segmentRef(operation.condition),
          then: renderFn(operation.then),
          else: operation.else === null ? null : renderFn(operation.else),
          root: operation.root,
          idBase: operation.idBase,
        };
      case SsrOpKind.Slot:
        return {
          kind: 'slot',
          name: operation.name,
          fallback: operation.fallback === null ? null : renderFn(operation.fallback),
          idBase: operation.idBase,
        };
      default:
        throw UNREVIVABLE;
    }
  };

  // branch arms and slot fallbacks render via their segment QRL — only the id is read
  const renderFn = (fn: PlanSsrRenderFn): import('./plan-types').RenderFunctionPlan => {
    if (fn.segment === undefined) {
      throw UNREVIVABLE;
    }
    segmentRef(fn.segment);
    return { segmentId: fn.segment } as unknown as import('./plan-types').RenderFunctionPlan;
  };

  try {
    if (wire.hasEmbedded === true) {
      return null;
    }
    const plan: SsrPlan = {
      setup: [],
      render: {
        operations: wire.ops.map(op),
        needsRootRange: wire.needsRootRange,
        usedSegmentIds: [],
        directSegmentIds: [],
        synchronous: wire.synchronous,
        needsContext: false,
        staticRoot: wire.staticRoot,
        runtimeStyleScopeName: wire.runtimeStyleScopeName,
        embeddedRenders: [],
      },
      providesContext: wire.providesContext,
      usedSegmentIds: [...wire.usedSegmentIds],
      directSegmentIds: [...wire.directSegmentIds],
      needsId: wire.needsId,
      idBase: wire.idBase,
      flushTasks: wire.flushTasks,
      runtimeStyleScopeName: wire.runtimeStyleScopeName,
    };
    return { plan, source, segments };
  } catch (error) {
    if (error === UNREVIVABLE) {
      return null;
    }
    throw error;
  }
}

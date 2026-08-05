import type { PlanNode, PlanRenderFn, PlanSegmentMeta, QwikModulePlan } from './emit-plan';
import { PlanNodeKind } from './emit-plan';
import type { PlanSsrComponent, PlanSsrOp, PlanSsrRenderFn } from './emit-plan-ssr';
import { SsrOpKind } from './emit-plan-ssr';

/**
 * Links per-module plans into one entry-rooted `qwik/ssr-plan` (specs/01). Version 0 mirrors the
 * module-plan instability: reads stay binding-keyed and `src` fallbacks survive. v1 scope links a
 * single module — component targets resolve by binding id within it; anything unresolved is kept
 * verbatim and listed in `unresolved` so callers (and the native-readiness report) see it.
 */
export interface QwikSsrPlan {
  readonly format: 'qwik/ssr-plan';
  readonly version: 0;
  readonly entry: number;
  readonly components: readonly LinkedComponent[];
  readonly segments: readonly PlanSegmentMeta[];
  readonly unresolved: readonly (number | string)[];
}

export interface LinkedComponent {
  readonly name: string;
  readonly propsBindings: readonly number[];
  readonly ssr: QwikModulePlan['components'][number]['ssr'];
  readonly setup: QwikModulePlan['components'][number]['setup'];
  readonly render: readonly PlanNode[];
  readonly needsId: boolean;
  readonly idBase: string;
  readonly styleScope: string | null;
  readonly providesContext: boolean;
  readonly hasCustomHook: boolean;
}

export function linkSsrPlan(modulePlan: QwikModulePlan, entryName: string): QwikSsrPlan | null {
  const componentIndexByBinding = new Map<number, number>();
  modulePlan.components.forEach((component, index) => {
    if (component.binding !== null) {
      componentIndexByBinding.set(component.binding, index);
    }
  });
  const componentIndexByName = new Map(
    modulePlan.components.map((component, index) => [component.name, index] as const)
  );
  const entry = modulePlan.components.findIndex((component) => component.name === entryName);
  if (entry < 0) {
    return null;
  }

  const unresolved: (number | string)[] = [];
  const linkNodes = (nodes: readonly PlanNode[]): PlanNode[] => nodes.map(linkNode);
  const linkRenderFn = (fn: PlanRenderFn): PlanRenderFn => ({
    setup: fn.setup,
    render: linkNodes(fn.render),
  });
  const linkNode = (node: PlanNode): PlanNode => {
    switch (node.n) {
      case PlanNodeKind.Element:
        return { ...node, children: linkNodes(node.children) };
      case PlanNodeKind.Component: {
        const target = node.target;
        if (typeof target === 'object') {
          return node; // already linked
        }
        const resolved =
          typeof target === 'number' ? (componentIndexByBinding.get(target) ?? null) : null;
        if (resolved === null) {
          unresolved.push(target);
        }
        return {
          ...node,
          target: resolved !== null ? { ref: resolved } : target,
          slots: node.slots.map((slot) => ({ name: slot.name, render: linkRenderFn(slot.render) })),
        };
      }
      case PlanNodeKind.Branch:
        return {
          ...node,
          then: linkRenderFn(node.then),
          else: node.else === null ? null : linkRenderFn(node.else),
        };
      case PlanNodeKind.Suspense:
        return { ...node, content: linkRenderFn(node.content) };
      case PlanNodeKind.Slot:
        return {
          ...node,
          fallback: node.fallback === null ? null : linkRenderFn(node.fallback),
        };
      case PlanNodeKind.Collection:
        return { ...node, row: linkRenderFn(node.row) };
      default:
        return node;
    }
  };

  const linkSsrOps = (ops: readonly PlanSsrOp[]): PlanSsrOp[] => ops.map(linkSsrOp);
  const linkSsrFn = (fn: PlanSsrRenderFn): PlanSsrRenderFn => ({ ...fn, ops: linkSsrOps(fn.ops) });
  const linkSsrOp = (op: PlanSsrOp): PlanSsrOp => {
    switch (op.o) {
      case SsrOpKind.Element:
        return { ...op, children: linkSsrOps(op.children) };
      case SsrOpKind.Component: {
        const target = op.target;
        if (typeof target !== 'string') {
          return op; // already linked
        }
        const resolved = componentIndexByName.get(target);
        if (resolved === undefined) {
          unresolved.push(target);
          return {
            ...op,
            slots: op.slots.map((slot) => ({ ...slot, render: linkSsrFn(slot.render) })),
          };
        }
        return {
          ...op,
          target: { ref: resolved },
          slots: op.slots.map((slot) => ({ ...slot, render: linkSsrFn(slot.render) })),
        };
      }
      case SsrOpKind.Branch:
        return {
          ...op,
          then: linkSsrFn(op.then),
          else: op.else === null ? null : linkSsrFn(op.else),
        };
      case SsrOpKind.Suspense:
        return {
          ...op,
          content: linkSsrFn(op.content),
          inOrder: op.inOrder === null ? null : linkSsrOps(op.inOrder),
        };
      case SsrOpKind.Slot:
        return { ...op, fallback: op.fallback === null ? null : linkSsrFn(op.fallback) };
      case SsrOpKind.Collection: {
        const row = op.row;
        // inline rows carry a required symbolName; segment rows are { segment: renderFn }
        return {
          ...op,
          row: (typeof (row as { symbolName?: unknown }).symbolName === 'string'
            ? linkSsrFn(row as PlanSsrRenderFn)
            : { segment: linkSsrFn((row as { segment: PlanSsrRenderFn }).segment) }) as never,
        };
      }
      default:
        return op;
    }
  };
  const linkSsrComponent = (ssr: PlanSsrComponent): PlanSsrComponent => ({
    ...ssr,
    ops: linkSsrOps(ssr.ops),
  });

  return {
    format: 'qwik/ssr-plan',
    version: 0,
    entry,
    components: modulePlan.components.map((component) => ({
      name: component.name,
      propsBindings: component.propsBindings,
      ssr: component.ssr === null ? null : linkSsrComponent(component.ssr),
      setup: component.setup,
      render: linkNodes(component.render),
      needsId: component.needsId,
      idBase: component.idBase,
      styleScope: component.styleScope,
      providesContext: component.providesContext,
      hasCustomHook: component.hasCustomHook,
    })),
    segments: modulePlan.segments,
    unresolved,
  };
}

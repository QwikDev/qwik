import { emitSsrOpPlan, type PlanSsrComponent } from './emit-plan-ssr';
import type { ValueIR } from './expr-ir';
import type {
  CollectionPlan,
  ComponentOutput,
  OrderedPropPlan,
  RenderFunctionPlan,
  RenderNodePlan,
  SegmentPlan,
  SetupPlan,
  ValuePlan,
} from './plan-types';
import { SetupOpKind } from './setup-ir';
import type { SetupOp } from './setup-ir';
import type { SourceRange } from './types';

/**
 * Per-module SSR plan emission (specs/01, Phase 3), format version 0 — an intentionally unstable
 * pre-link shape: reads stay keyed by `BindingId`, unlowered sites carry their source text (`src`)
 * as the JS-engine fallback, and the link step later resolves component/binding references and
 * strips JS fallbacks under a native target.
 */
export interface QwikModulePlan {
  readonly format: 'qwik/module-plan';
  readonly version: 0;
  readonly path: string;
  readonly components: readonly PlanComponent[];
  readonly segments: readonly PlanSegmentMeta[];
}

export interface PlanComponent {
  readonly name: string;
  /** Module-scoped binding id; the link step resolves component targets against it. */
  readonly binding: number | null;
  /** SSR-structural ops — the byte-parity layer engines render from; null when unplannable. */
  readonly ssr: PlanSsrComponent | null;
  readonly setup: readonly PlanSetupEntry[];
  readonly render: readonly PlanNode[];
  readonly needsId: boolean;
  readonly idBase: string;
  readonly styleScope: string | null;
  readonly providesContext: boolean;
  readonly hasCustomHook: boolean;
}

export type PlanSetupEntry =
  | SetupOp
  | { readonly op: SetupOpKind.Style; readonly styleId: string; readonly scoped: boolean }
  | { readonly op: SetupOpKind.Js; readonly src: string };

/** Server evaluates `ir` when present; `segment` is the client-resume QRL; `src` the JS fallback. */
export interface PlanValue {
  readonly src: string;
  readonly ir?: ValueIR;
  readonly segment?: string;
}

export interface PlanRenderFn {
  readonly setup: readonly PlanSetupEntry[];
  readonly render: readonly PlanNode[];
}

export const enum PlanNodeKind {
  Text = 'text',
  Element = 'el',
  Dynamic = 'dyn',
  Component = 'component',
  Branch = 'branch',
  Suspense = 'suspense',
  Slot = 'slot',
  Collection = 'collection',
}

export const enum PlanPropKind {
  Static = 'static',
  Dynamic = 'dynamic',
  Spread = 'spread',
  Event = 'event',
  Bind = 'bind',
}

export type PlanNode =
  | { readonly n: PlanNodeKind.Text; readonly value: string }
  | {
      readonly n: PlanNodeKind.Element;
      readonly tag: string;
      readonly props: readonly PlanProp[];
      readonly children: readonly PlanNode[];
    }
  | {
      readonly n: PlanNodeKind.Dynamic;
      readonly output: 'text' | 'content';
      readonly value: PlanValue;
    }
  | {
      readonly n: PlanNodeKind.Component;
      /** Module plans emit a binding id or tag source; the linker resolves to `{ ref }`. */
      readonly target: number | string | { readonly ref: number };
      readonly props: readonly PlanProp[];
      readonly slots: readonly { readonly name: string; readonly render: PlanRenderFn }[];
    }
  | {
      readonly n: PlanNodeKind.Branch;
      readonly condition: PlanValue;
      readonly then: PlanRenderFn;
      readonly else: PlanRenderFn | null;
    }
  | {
      readonly n: PlanNodeKind.Suspense;
      readonly content: PlanRenderFn;
      readonly fallback: PlanValue | null;
      readonly delay: PlanValue | null;
      readonly blocking: boolean;
    }
  | { readonly n: PlanNodeKind.Slot; readonly name: string; readonly fallback: PlanRenderFn | null }
  | {
      readonly n: PlanNodeKind.Collection;
      readonly source: PlanCollectionSource;
      readonly key: PlanValue | null;
      readonly row: PlanRenderFn;
      readonly usesIndexSignal: boolean;
    };

export type PlanCollectionSource =
  | { readonly kind: 'direct-array'; readonly src: string; readonly ir?: ValueIR }
  | { readonly kind: 'direct-reactive'; readonly src: string; readonly signal: string }
  | {
      readonly kind: 'derived';
      readonly src: string;
      readonly segment: string;
      readonly ir?: ValueIR;
    };

export type PlanProp =
  | { readonly p: PlanPropKind.Static; readonly name: string; readonly value: unknown }
  | { readonly p: PlanPropKind.Dynamic; readonly name: string; readonly value: PlanValue }
  | { readonly p: PlanPropKind.Spread; readonly value: PlanValue }
  | {
      readonly p: PlanPropKind.Event;
      readonly name: string;
      readonly passive: boolean;
      readonly value: PlanValue;
    }
  | { readonly p: PlanPropKind.Bind; readonly name: 'value' | 'checked'; readonly value: PlanValue }
  | { readonly p: string; readonly src: string };

export interface PlanSegmentMeta {
  readonly id: string;
  readonly symbolName: string;
  /** Chunk specifier exactly as emitted modules reference it (`./<file-base>`). */
  readonly chunk: string;
  readonly kind: string;
  readonly qrl: { readonly kind: string; readonly role?: string } | null;
  readonly captures: readonly {
    readonly binding: number;
    readonly name: string;
    readonly source: string;
    readonly access: string;
  }[];
}

export function emitModulePlan(
  outputs: readonly ComponentOutput[],
  segments: readonly SegmentPlan[],
  source: string,
  path: string,
  returnMode: import('./plan-ssr').SsrComponentReturnModeResolver
): QwikModulePlan {
  const slice = (range: SourceRange) => source.slice(range[0], range[1]);

  const planValue = (value: ValuePlan): PlanValue => ({
    src: slice(value.expression),
    ...(value.kind !== 'render-value' && value.ir !== undefined ? { ir: value.ir } : {}),
    ...(value.kind === 'segment' ? { segment: value.segment.segmentId } : {}),
  });

  const planSetup = (setup: readonly SetupPlan[]): PlanSetupEntry[] =>
    setup.map((entry) => {
      if (entry.kind === 'style') {
        return { op: SetupOpKind.Style, styleId: entry.styleId, scoped: entry.scoped };
      }
      if (entry.kind === 'statement' && entry.op !== undefined) {
        return entry.op;
      }
      return { op: SetupOpKind.Js, src: slice(entry.range) };
    });

  const planRenderFn = (fn: RenderFunctionPlan): PlanRenderFn => ({
    setup: planSetup(fn.setup),
    render: fn.render.roots.map(planNode),
  });

  const planProp = (prop: OrderedPropPlan): PlanProp => {
    switch (prop.kind) {
      case 'static':
        return { p: PlanPropKind.Static, name: prop.name, value: prop.value };
      case 'dynamic':
        return { p: PlanPropKind.Dynamic, name: prop.name, value: planValue(prop.value) };
      case 'spread':
        return { p: PlanPropKind.Spread, value: planValue(prop.value) };
      case 'event':
        return {
          p: PlanPropKind.Event,
          name: prop.name,
          passive: prop.passive,
          value: planValue(prop.value),
        };
      case 'bind':
        return { p: PlanPropKind.Bind, name: prop.name, value: planValue(prop.value) };
      default:
        return { p: prop.kind, src: slice(prop.range) };
    }
  };

  const planCollectionSource = (collection: CollectionPlan): PlanCollectionSource => {
    const collectionSource = collection.source;
    switch (collectionSource.kind) {
      case 'direct-array':
        return {
          kind: 'direct-array',
          src: slice(collectionSource.expression),
          ...(collectionSource.ir !== undefined ? { ir: collectionSource.ir } : {}),
        };
      case 'direct-reactive':
        return {
          kind: 'direct-reactive',
          src: slice(collectionSource.expression),
          signal: slice(collectionSource.source),
        };
      case 'derived':
        return {
          kind: 'derived',
          src: slice(collectionSource.expression),
          segment: collectionSource.segment.segmentId,
          ...(collectionSource.ir !== undefined ? { ir: collectionSource.ir } : {}),
        };
    }
  };

  const planNode = (node: RenderNodePlan): PlanNode => {
    switch (node.kind) {
      case 'static-text':
        return { n: PlanNodeKind.Text, value: node.value };
      case 'element':
        return {
          n: PlanNodeKind.Element,
          tag: node.tag,
          props: node.props.map(planProp),
          children: node.children.map(planNode),
        };
      case 'dynamic-value':
        return { n: PlanNodeKind.Dynamic, output: node.output, value: planValue(node.value) };
      case 'component':
        return {
          n: PlanNodeKind.Component,
          target: node.bindingId ?? slice(node.tagRange),
          props: node.props.map(planProp),
          slots: node.slots.map((slot) => ({ name: slot.name, render: planRenderFn(slot.render) })),
        };
      case 'branch':
        return {
          n: PlanNodeKind.Branch,
          // src stays empty: the JS engine evaluates branch conditions via the segment
          condition: {
            src: '',
            segment: node.condition.segmentId,
            ...(node.conditionIr !== undefined ? { ir: node.conditionIr } : {}),
          },
          then: planRenderFn(node.then),
          else: node.else === null ? null : planRenderFn(node.else),
        };
      case 'suspense':
        return {
          n: PlanNodeKind.Suspense,
          content: planRenderFn(node.content),
          fallback: node.fallback === null ? null : planValue(node.fallback),
          delay: node.delay === null ? null : planValue(node.delay),
          blocking: node.blocking,
        };
      case 'slot':
        return {
          n: PlanNodeKind.Slot,
          name: node.name,
          fallback: node.fallback === null ? null : planRenderFn(node.fallback),
        };
      case 'collection':
        return {
          n: PlanNodeKind.Collection,
          source: planCollectionSource(node),
          key:
            node.key === null
              ? null
              : {
                  src: '',
                  segment: node.key.segmentId,
                  ...(node.keyIr !== undefined ? { ir: node.keyIr } : {}),
                },
          row: planRenderFn(node.row),
          usesIndexSignal: node.usesIndexSignal,
        };
    }
  };

  return {
    format: 'qwik/module-plan',
    version: 0,
    path,
    components: outputs.map((output) => ({
      name: output.component.exportName ?? '',
      binding: output.component.bindingId,
      ssr: emitSsrOpPlan(output.result, output.result.segments, returnMode, source),
      setup: planSetup(output.result.setup),
      render: output.result.render.roots.map(planNode),
      needsId: output.result.needsId,
      idBase: output.result.idBase,
      styleScope: output.result.styleScope,
      providesContext: output.result.providesContext,
      hasCustomHook: output.result.hasCustomHook,
    })),
    segments: segments.map((segment) => ({
      id: segment.id,
      symbolName: segment.symbolName,
      chunk: `./${path.split('/').pop()}_${segment.symbolName}`,
      kind: segment.kind,
      qrl:
        segment.qrl === null
          ? null
          : {
              kind: segment.qrl.kind,
              ...(segment.qrl.kind === 'implicit' ? { role: segment.qrl.role } : {}),
            },
      captures: segment.captures.map((capture) => ({
        binding: capture.bindingId,
        name: capture.name,
        source: capture.source,
        access: capture.access,
      })),
    })),
  };
}

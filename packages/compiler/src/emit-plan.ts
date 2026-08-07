import { emitSsrOpPlan, type PlanSsrComponent, type PlanSsrRenderFn } from './emit-plan-ssr';
import { isModuleStyleBoundary } from './emit-qrl';
import type { PluginFnPlan } from './expr-lower';
import { shouldResolveSsrSegment } from './emit-segment';
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
  /** Relative-source import bindings; the linker resolves cross-module component targets here. */
  readonly imports: readonly PlanImportMeta[];
  /** Module-level `createContextId` declarations: binding → serialized context name. */
  readonly contexts: readonly PlanContextMeta[];
  /** Auto-lowered module helpers (specs/02 §defs), invoked via `def-call` by table index. */
  readonly defs: readonly PlanDefMeta[];
  /** Plugin-claimed fns (specs/09), invoked via `plugin-call` by fnId. */
  readonly pluginFns: readonly PluginFnPlan[];
}

export interface PlanDefMeta {
  readonly name: string;
  readonly params: readonly number[];
  readonly body: ValueIR;
}

export interface PlanContextMeta {
  readonly binding: number;
  readonly name: string;
  /** Declared variable name — chunks import the context id by it. */
  readonly declaredName?: string;
}

export interface PlanImportMeta {
  readonly binding: number;
  readonly name: string;
  readonly module: string;
  readonly export: string;
}

/** Destructured props as prop-key → binding pairs, or the whole-props identifier binding. */
export type PlanComponentProps =
  | {
      readonly kind: 'object';
      readonly bindings: readonly { readonly b: number; readonly name: string }[];
    }
  | { readonly kind: 'identifier'; readonly binding: number }
  | null;

export interface PlanComponent {
  readonly name: string;
  /** Module-scoped binding id; the link step resolves component targets against it. */
  readonly binding: number | null;
  /** Props parameter binding ids (identifier param: one; object pattern: one per alias). */
  readonly propsBindings: readonly number[];
  /** Props parameter shape; object names assume shorthand patterns (binding name = prop key). */
  readonly props: PlanComponentProps;
  /** SSR-structural ops — the byte-parity layer engines render from; null when unplannable. */
  readonly ssr: PlanSsrComponent | null;
  readonly setup: readonly PlanSetupEntry[];
  readonly render: readonly PlanNode[];
  readonly needsId: boolean;
  readonly idBase: string;
  readonly styleScope: string | null;
  readonly providesContext: boolean;
  readonly hasCustomHook: boolean;
  /** The component function is async (its setup may yield). */
  readonly async?: true;
}

export type PlanSetupEntry =
  | SetupOp
  | {
      readonly op: SetupOpKind.Style;
      readonly styleId: string;
      readonly scoped: boolean;
      /** Inlined static CSS (specs/01 `styles`); absent when the argument is dynamic. */
      readonly css?: string;
      /** The hook's return value is consumed by the component (destructured scopeId etc.). */
      readonly resultUsed?: true;
    }
  | {
      readonly op: SetupOpKind.Js;
      readonly src: string;
      /** Production seam: src already carries the QRL/useId rewrites, generators emit verbatim. */
      readonly final?: true;
      readonly imports?: readonly string[];
    }
  | PlanLocalComponent;

/**
 * A setup-scope component compiled in place. Component-op string targets resolve against the
 * lexical chain of these declarations before module/import resolution; nests via `render.setup`.
 */
export interface PlanLocalComponent {
  readonly op: SetupOpKind.LocalComponent;
  readonly name: string;
  readonly binding: number;
  /** Backing chunk segment id — the component value's serialization identity. */
  readonly segment: string;
  readonly providesContext?: boolean;
  readonly props: PlanComponentProps;
  readonly render: PlanSsrRenderFn;
}

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
  /**
   * True when the emitted module `.s()`-resolves the QRL at load — engines must mirror this, as
   * resolution timing is byte-observable in streaming output.
   */
  readonly resolved: boolean;
  readonly qrl: { readonly kind: string; readonly role?: string } | null;
  /** Client resume strategy for visible tasks (qvisible/qinit/qidle attribute choice). */
  readonly visibleTaskStrategy?: string;
  /** Value never updates after first render — deferred content steps skip capture rooting. */
  readonly initialOnly?: true;
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
  returnMode: import('./plan-ssr').SsrComponentReturnModeResolver,
  imports: readonly PlanImportMeta[] = [],
  contexts: readonly PlanContextMeta[] = [],
  defs: readonly PlanDefMeta[] = [],
  bindingName: (binding: number) => string | null = () => null,
  pluginFns: readonly PluginFnPlan[] = []
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
        const raw = slice(entry.argumentRange);
        const quote = raw[0];
        // inline static CSS only: quoted literal, no interpolation/escapes (fail closed)
        const inner = raw.slice(1, -1);
        const css =
          ['`', "'", '"'].includes(quote) &&
          raw[raw.length - 1] === quote &&
          !inner.includes('\\') &&
          !(quote === '`' && inner.includes('${'))
            ? inner
            : null;
        return {
          op: SetupOpKind.Style,
          styleId: entry.styleId,
          scoped: entry.scoped,
          ...(css === null ? {} : { css }),
        };
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

  const componentProps = (
    parameter: ComponentOutput['result']['shape']['parameter']
  ): PlanComponentProps =>
    parameter === null
      ? null
      : parameter.kind === 'identifier'
        ? { kind: 'identifier', binding: parameter.bindingIds[0] }
        : {
            kind: 'object',
            bindings: parameter.bindingIds.map((b) => ({ b, name: bindingName(b) ?? '' })),
          };

  const components = outputs.map((output) => ({
    name: output.component.exportName ?? '',
    binding: output.component.bindingId,
    propsBindings: output.result.shape.parameter?.bindingIds ?? [],
    props: componentProps(output.result.shape.parameter),
    ssr: emitSsrOpPlan(output.result, output.result.segments, returnMode, source, bindingName),
    setup: planSetup(output.result.setup),
    render: output.result.render.roots.map(planNode),
    needsId: output.result.needsId,
    idBase: output.result.idBase,
    styleScope: output.result.styleScope,
    providesContext: output.result.providesContext,
    hasCustomHook: output.result.hasCustomHook,
    ...(output.component.shape.async ? { async: true as const } : {}),
  }));
  // same eligibility as the emit-ssr hoist loop, so `resolved` matches the emitted `.s()` calls
  const directSegmentIds = new Set(
    components.flatMap((component) => component.ssr?.directSegmentIds ?? [])
  );
  const localComponentSegmentIds = new Set(
    segments.filter((segment) => segment.kind === 'localComponent').map((segment) => segment.id)
  );
  const resolvesEagerly = (segment: SegmentPlan): boolean =>
    segment.qrl?.kind !== 'sync' &&
    !isModuleStyleBoundary(segment) &&
    (segment.parentId === null ||
      directSegmentIds.has(segment.id) ||
      localComponentSegmentIds.has(segment.parentId)) &&
    shouldResolveSsrSegment(segment);

  // inline collection rows never become chunks — drop their table entries (no QRL exists)
  const inlineRowSymbols = collectInlineRowSymbols(components);

  return {
    format: 'qwik/module-plan',
    version: 0,
    path,
    components,
    segments: segments
      .filter((segment) => !inlineRowSymbols.has(segment.symbolName))
      .map((segment) => ({
        id: segment.id,
        symbolName: segment.symbolName,
        chunk: `./${path.split('/').pop()}_${segment.symbolName}`,
        kind: segment.kind,
        resolved: resolvesEagerly(segment),
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
    imports,
    contexts,
    defs,
    pluginFns,
  };
}

/** Symbol names of collection rows emitted inline (specs/01): no chunk, so no segments entry. */
function collectInlineRowSymbols(components: readonly PlanComponent[]): Set<string> {
  const symbols = new Set<string>();
  const walkSetup = (setup: readonly PlanSetupEntry[]): void => {
    for (const entry of setup) {
      if (entry.op === SetupOpKind.LocalComponent) {
        walkFn(entry.render);
      }
    }
  };
  const walkFn = (fn: PlanSsrRenderFn): void => {
    walkSetup(fn.setup);
    walkOps(fn.ops);
  };
  const walkOps = (ops: PlanSsrComponent['ops']): void => {
    for (const op of ops) {
      switch (op.o) {
        case 'el':
          walkOps(op.children);
          break;
        case 'component':
          op.slots.forEach((slot) => walkFn(slot.render));
          break;
        case 'branch':
          walkFn(op.then);
          if (op.else !== null) {
            walkFn(op.else);
          }
          break;
        case 'suspense':
          walkFn(op.content);
          if (op.fallbackRender !== undefined) {
            walkFn(op.fallbackRender);
          }
          if (op.inOrder !== null) {
            walkOps(op.inOrder);
          }
          break;
        case 'slot':
          if (op.fallback !== null) {
            walkFn(op.fallback);
          }
          break;
        case 'collection': {
          const row = op.row;
          if (typeof (row as { symbolName?: unknown }).symbolName === 'string') {
            const inline = row as Extract<typeof op.row, { symbolName: string }>;
            symbols.add(inline.symbolName);
            walkFn(inline);
          } else {
            walkFn((row as { segment: PlanSsrRenderFn }).segment);
          }
          break;
        }
        default:
          break;
      }
    }
  };
  for (const component of components) {
    if (component.ssr !== null) {
      walkSetup(component.ssr.setup);
      walkOps(component.ssr.ops);
    }
  }
  return symbols;
}

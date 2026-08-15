import { emitSsrOpPlan, type PlanSsrComponent, type PlanSsrRenderFn } from './emit-plan-ssr';
import { isModuleStyleBoundary } from './emit-qrl';
import type { PluginFnPlan } from './expr-lower';
import { shouldResolveSsrSegment } from './segment-plan';
import type { ValueIR } from './expr-ir';
import type { ComponentOutput, SegmentPlan, SetupPlan } from './plan-types';
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
  readonly version: 1;
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
  /** Exported `use*` fns with their capabilities — the linker closes these transitively. */
  readonly hooks: readonly PlanHookMeta[];
}

/** Import source for imported hooks; null = declared in this module. */
export interface PlanHookCall {
  readonly module: string | null;
  readonly name: string;
}

export interface PlanHookMeta {
  readonly name: string;
  readonly capabilities: readonly string[];
  readonly calls: readonly PlanHookCall[];
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
      readonly bindings: readonly { readonly binding: number; readonly name: string }[];
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
  readonly needsId: boolean;
  readonly idBase: string;

  readonly providesContext: boolean;
  /** Direct custom-hook calls — capability closure input for the linker. */
  readonly hookCalls?: readonly PlanHookCall[];
  /** The component function is async (its setup may yield). */
  readonly async?: true;
}

export type PlanSetupEntry =
  | SetupOp
  | {
      readonly kind: SetupOpKind.Style;
      readonly styleId: string;
      readonly scoped: boolean;
      /** Inlined static CSS (specs/01 `styles`); absent when the argument is dynamic. */
      readonly css?: string;
      /** The hook's return value is consumed by the component (destructured scopeId etc.). */
      readonly resultUsed?: true;
      /** Full statement JS hole for dynamic css / consumed results. */
      readonly src?: string;
    }
  | {
      readonly kind: SetupOpKind.Js;
      readonly src: string;
      /** Production seam: src already carries the QRL/useId rewrites, generators emit verbatim. */
      readonly final?: true;
      readonly imports?: readonly string[];
    }
  | PlanRenderFnEntry;

/**
 * A setup-scope render fn compiled in place. With `component: true` it is usable as a JSX tag
 * (component-op string targets resolve against the lexical chain of these declarations) and carries
 * its chunk `segment` as serialization identity; without it, a plain render value.
 */
export interface PlanRenderFnEntry {
  readonly kind: SetupOpKind.RenderFn;
  readonly name: string;
  /** Absent for a synthetic closure hoisted from an expression position. */
  readonly binding?: number;
  readonly component?: true;
  /** Backing chunk segment id — the component value's serialization identity. */
  readonly segment?: string;
  readonly providesContext?: boolean;
  readonly props?: PlanComponentProps;
  readonly render: PlanSsrRenderFn;
}

/**
 * A value in render position, in one of three explicit forms:
 *
 * - `ir`: the universal form; optional `segment` is the client-resume QRL.
 * - `segment`: the value IS a QRL-backed fn (expression texts, keys, derived sources).
 * - `js`: transitional src carrier (dies with full lowering); `pure` = embeddable verbatim.
 */
export type PlanValue =
  | { readonly kind: 'ir'; readonly ir: ValueIR; readonly segment?: string }
  | { readonly kind: 'segment'; readonly segment: string }
  | { readonly kind: 'js'; readonly src: string; readonly pure?: true };

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
  /** Sync QRLs are inlined source, not chunks: the function text engines pass to _qrlSync. */
  readonly syncSource?: string;
  /** Client resume strategy for visible tasks (qvisible/qinit/qidle attribute choice). */
  readonly visibleTaskStrategy?: string;
  /** Value never updates after first render — deferred content steps skip capture rooting. */
  readonly initialOnly?: true;
  /** The implementation expects the ambient style scope as a trailing capture. */
  readonly styleScope?: true;
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
  pluginFns: readonly PluginFnPlan[] = [],
  hooks: readonly PlanHookMeta[] = [],
  componentHookCalls: readonly (readonly PlanHookCall[])[] = []
): QwikModulePlan {
  const slice = (range: SourceRange) => source.slice(range[0], range[1]);

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
          kind: SetupOpKind.Style,
          styleId: entry.styleId,
          scoped: entry.scoped,
          ...(css === null ? {} : { css }),
        };
      }
      if (entry.kind === 'statement' && entry.op !== undefined) {
        return entry.op;
      }
      return { kind: SetupOpKind.Js, src: slice(entry.range) };
    });

  const componentProps = (
    parameter: ComponentOutput['result']['shape']['parameter']
  ): PlanComponentProps =>
    parameter === null
      ? null
      : parameter.kind === 'identifier'
        ? { kind: 'identifier', binding: parameter.bindingIds[0] }
        : {
            kind: 'object',
            bindings: parameter.bindingIds.map((b) => ({ binding: b, name: bindingName(b) ?? '' })),
          };

  const components = outputs.map((output, index) => ({
    name: output.component.exportName ?? '',
    binding: output.component.bindingId,
    propsBindings: output.result.shape.parameter?.bindingIds ?? [],
    props: componentProps(output.result.shape.parameter),
    ssr: emitSsrOpPlan(output.result, output.result.segments, returnMode, source, bindingName),
    setup: planSetup(output.result.setup),
    needsId: output.result.needsId,
    idBase: output.result.idBase,
    providesContext: output.result.providesContext,
    ...((componentHookCalls[index]?.length ?? 0) > 0
      ? { hookCalls: componentHookCalls[index] }
      : {}),
    ...(output.component.shape.async ? { async: true as const } : {}),
  }));
  // same eligibility as the emit-ssr hoist loop, so `resolved` matches the emitted `.s()` calls
  const resolvesEagerly = (segment: SegmentPlan): boolean =>
    !isModuleStyleBoundary(segment) && shouldResolveSsrSegment(segment);

  // inline collection rows never become chunks — drop their table entries (no QRL exists)
  const inlineRowSymbols = collectInlineRowSymbols(components);

  return {
    format: 'qwik/module-plan',
    version: 1,
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
        ...(segment.qrl?.kind === 'sync' && segment.argumentRanges[0] != null
          ? { syncSource: slice(segment.argumentRanges[0]) }
          : {}),
        ...(segment.render?.runtimeStyleScopeName == null ? {} : { styleScope: true as const }),
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
    hooks,
  };
}

/** Symbol names of collection rows emitted inline (specs/01): no chunk, so no segments entry. */
function collectInlineRowSymbols(components: readonly PlanComponent[]): Set<string> {
  const symbols = new Set<string>();
  const walkSetup = (setup: readonly PlanSetupEntry[]): void => {
    for (const entry of setup) {
      if (entry.kind === SetupOpKind.RenderFn && entry.component === true) {
        walkFn(entry.render);
      }
    }
  };
  const walkFn = (fn: PlanSsrRenderFn): void => {
    walkSetup(fn.setup);
    if (fn.ops !== undefined) {
      walkOps(fn.ops);
    }
  };
  const walkOps = (ops: PlanSsrComponent['ops']): void => {
    for (const op of ops) {
      switch (op.kind) {
        case 'element':
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
          if (op.fallback !== null) {
            walkFn(op.fallback);
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

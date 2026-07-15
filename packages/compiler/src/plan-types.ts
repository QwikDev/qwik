import type { Diagnostic, TransformModule } from '@qwik.dev/optimizer';
import type { Expression, FunctionBody } from 'oxc-parser';
import type { ParamRecord, SourceRange } from './types';

export type TransformResult =
  | { kind: 'not-applicable' }
  | { kind: 'success'; modules: TransformModule[] }
  | { kind: 'failure'; diagnostics: Diagnostic[] };

export type BindingId = number;
export type LifetimeId = number;
export type SegmentKind =
  | 'event'
  | 'qrl'
  | 'expression'
  | 'collectionSource'
  | 'branchCondition'
  | 'branchRender'
  | 'forKey'
  | 'forRender'
  | 'slotRender'
  | 'collectionRender';
export type SegmentCaptureSource = 'local' | 'param' | 'loop';

export interface ImportBinding {
  readonly source: string;
  readonly importedName: string | 'default' | '*';
  readonly typeOnly: boolean;
  readonly attributes: readonly ImportAttributeBinding[];
  readonly specifierRange?: SourceRange;
  readonly importedRange?: SourceRange;
}

export interface ImportAttributeBinding {
  readonly key: string;
  readonly value: string;
}

export interface BindingInfo {
  readonly id: BindingId;
  readonly name: string;
  readonly kind: 'import' | 'module' | 'param' | 'local' | 'loop';
  readonly declarationRange: SourceRange | null;
  readonly scopeId: number;
  readonly ownerId: number;
  readonly import: ImportBinding | null;
}

export interface ReferenceInfo {
  readonly range: SourceRange;
  readonly bindingId: BindingId | null;
  readonly role: 'read' | 'write' | 'call' | 'shorthand';
}

export interface ExportBindingInfo {
  readonly bindingId: BindingId;
  readonly exportedName: string | 'default';
  readonly range: SourceRange;
}

export interface PreserveItem {
  readonly kind: 'preserve';
  readonly range: SourceRange;
}

export interface ImportItem {
  readonly kind: 'import';
  readonly range: SourceRange;
  readonly bindingIds: readonly BindingId[];
}

export interface ComponentCandidatePlan {
  readonly bindingId: BindingId;
  readonly functionRange: SourceRange;
  /** Full range replaced during module assembly; includes a component$ wrapper when present. */
  readonly replacementRange: SourceRange;
  readonly qualification: 'component$' | 'jsx-tag' | 'exported-jsx';
  readonly exported: boolean;
  readonly exportName: string | 'default';
  readonly localName: string | null;
  readonly declarationKind: 'function' | 'const' | 'defaultFunction' | 'defaultArrow';
}

export interface ComponentCandidateItem {
  readonly kind: 'component-candidate';
  readonly range: SourceRange;
  readonly candidates: readonly ComponentCandidatePlan[];
}

export type ModuleItemPlan = PreserveItem | ImportItem | ComponentCandidateItem;

export interface ModuleAnalysis {
  readonly bindings: readonly BindingInfo[];
  readonly references: readonly ReferenceInfo[];
  readonly exports: readonly ExportBindingInfo[];
  readonly items: readonly ModuleItemPlan[];
}

export type QrlBoundaryPlan =
  | {
      readonly kind: 'explicit';
      readonly markerBindingId: BindingId;
    }
  | {
      readonly kind: 'sync';
      readonly markerBindingId: BindingId;
      readonly source: string;
    }
  | ImplicitDollarPlan;

export interface ImplicitDollarPlan {
  readonly kind: 'implicit';
  readonly markerBindingId: BindingId;
  readonly markerLocalName: string;
  readonly baseName: string;
  readonly source: string | null;
  readonly attributes: readonly ImportAttributeBinding[];
  readonly role: 'generic' | 'serializer' | 'task' | 'visible-task' | 'style' | 'scoped-style';
}

export interface ComponentParameterPlan {
  readonly kind: 'identifier' | 'object';
  readonly range: SourceRange;
  readonly bindingIds: readonly BindingId[];
  readonly param: ParamRecord;
}

export interface ComponentShape {
  readonly bindingId: BindingId;
  readonly async: boolean;
  readonly setup: readonly SourceRange[];
  readonly returnExpression: SourceRange;
  readonly parameter: ComponentParameterPlan | null;
}

export type SetupPlan =
  | {
      readonly kind: 'statement';
      readonly range: SourceRange;
      readonly lifetimeId: LifetimeId;
      readonly referenceBindingIds: readonly BindingId[];
      readonly useIds: readonly UseIdPlan[];
    }
  | {
      readonly kind: 'render-value';
      readonly range: SourceRange;
      readonly lifetimeId: LifetimeId;
      readonly bindingId: BindingId;
      readonly name: string;
      readonly render: RenderFunctionPlan;
    }
  | StyleSetupPlan;

export interface UseIdPlan {
  readonly range: SourceRange;
  readonly ordinal: number;
  readonly standalone: boolean;
}

export interface StyleSetupPlan {
  readonly kind: 'style';
  readonly range: SourceRange;
  readonly lifetimeId: LifetimeId;
  readonly callRange: SourceRange;
  readonly argumentRange: SourceRange;
  readonly scoped: boolean;
  readonly styleId: string;
  readonly resultUsed: boolean;
  readonly referenceBindingIds: readonly BindingId[];
}

export interface LifetimePlan {
  readonly id: LifetimeId;
  readonly parentId: LifetimeId | null;
  readonly ownerId: number;
  readonly owner:
    | 'component'
    | 'render-function'
    | 'dynamic-value'
    | 'component-call'
    | 'branch'
    | 'slot'
    | 'collection'
    | 'effect';
  readonly commit: 'immediate' | 'atomic-range' | 'atomic-reconcile';
}

export interface ComponentPlan {
  readonly shape: ComponentShape;
  readonly setup: readonly SetupPlan[];
  readonly providesContext: boolean;
  readonly needsId: boolean;
  readonly idBase: string;
  readonly styleScope: string | null;
  /** Linear setup may call user code which can register tasks or scoped styles. */
  readonly hasCustomHook: boolean;
  readonly runtimeStyleScopeName: string | null;
  readonly render: RenderPlan;
  /** Bindings used by preserved setup and the lowered component render, excluding segment bodies. */
  readonly referenceBindingIds: readonly BindingId[];
  readonly segments: readonly SegmentPlan[];
  readonly lifetimes: readonly LifetimePlan[];
}

export interface ModuleBoundaryPlan {
  readonly roots: readonly SegmentReferencePlan[];
  readonly segments: readonly SegmentPlan[];
}

export interface RenderPlan {
  readonly roots: readonly RenderNodePlan[];
  readonly effects: readonly RenderEffectPlan[];
}

export type RenderNodePlan =
  | ElementPlan
  | StaticTextPlan
  | DynamicValuePlan
  | ComponentNodePlan
  | BranchPlan
  | SlotPlan
  | CollectionPlan;

export interface ElementPlan {
  readonly kind: 'element';
  readonly tag: string;
  readonly range: SourceRange;
  /** Source-ordered after semantic last-write-wins normalization. */
  readonly props: readonly OrderedPropPlan[];
  readonly propsEffect: ElementPropsEffectPlan | null;
  readonly children: readonly RenderNodePlan[];
}

export interface ElementPropsEffectPlan {
  readonly lifetimeId: LifetimeId;
  readonly effectId: number;
  readonly segment: SegmentReferencePlan;
}

export interface StaticTextPlan {
  readonly kind: 'static-text';
  readonly value: string;
  readonly range: SourceRange;
}

export interface DynamicValuePlan {
  readonly kind: 'dynamic-value';
  readonly output: 'text' | 'content';
  readonly range: SourceRange;
  readonly lifetimeId: LifetimeId;
  readonly effectId: number;
  readonly value: ValuePlan;
}

export interface ComponentNodePlan {
  readonly kind: 'component';
  readonly range: SourceRange;
  readonly tagRange: SourceRange;
  readonly bindingId: BindingId | null;
  readonly needsId: boolean;
  readonly lifetimeId: LifetimeId;
  readonly props: readonly OrderedPropPlan[];
  readonly slots: readonly ComponentProjectionPlan[];
}

export interface ComponentProjectionPlan {
  readonly name: string;
  readonly range: SourceRange;
  readonly lifetimeId: LifetimeId;
  readonly render: RenderFunctionPlan;
}

export interface BranchPlan {
  readonly kind: 'branch';
  readonly range: SourceRange;
  readonly lifetimeId: LifetimeId;
  readonly condition: SegmentReferencePlan;
  readonly then: RenderFunctionPlan;
  readonly else: RenderFunctionPlan | null;
}

export interface SlotPlan {
  readonly kind: 'slot';
  readonly range: SourceRange;
  readonly lifetimeId: LifetimeId;
  readonly name: string;
  readonly fallback: RenderFunctionPlan | null;
}

export interface CollectionPlan {
  readonly kind: 'collection';
  readonly range: SourceRange;
  readonly lifetimeId: LifetimeId;
  readonly source: CollectionSourcePlan;
  readonly key: SegmentReferencePlan | null;
  readonly row: RenderFunctionPlan;
  readonly usesIndexSignal: boolean;
}

export type CollectionSourcePlan =
  | {
      readonly kind: 'direct-array';
      readonly expression: SourceRange;
    }
  | {
      /** A Qwik Source binding proven by import and binding identity. */
      readonly kind: 'direct-reactive';
      /** Full `.map()` receiver retained for diagnostics. */
      readonly expression: SourceRange;
      /** The Source expression before the direct `.value` access. */
      readonly source: SourceRange;
    }
  | {
      readonly kind: 'derived';
      /** Full `.map()` receiver retained for diagnostics and source emission. */
      readonly expression: SourceRange;
      /** Resumable computed segment evaluated by the collection runtime. */
      readonly segment: SegmentReferencePlan;
    };

export type OrderedPropPlan =
  | {
      readonly kind: 'static';
      readonly range: SourceRange;
      readonly name: string;
      readonly value: StaticProp['value'];
    }
  | {
      readonly kind: 'dynamic';
      readonly range: SourceRange;
      readonly name: string;
      readonly value: ValuePlan;
      readonly lifetimeId: LifetimeId;
      readonly effectId: number;
    }
  | {
      readonly kind: 'spread';
      readonly range: SourceRange;
      readonly value: ValuePlan;
      readonly lifetimeId: LifetimeId;
      readonly effectId: number;
    }
  | {
      readonly kind: 'event';
      readonly range: SourceRange;
      readonly name: string;
      readonly value: ValuePlan;
      readonly lifetimeId: LifetimeId;
      readonly effectId: number;
    }
  | {
      readonly kind: 'bind';
      readonly range: SourceRange;
      readonly name: 'value' | 'checked';
      /** The signal expression captured by the built-in input handler. */
      readonly signal: SourceRange;
      /** The same signal represented as an existing reactive attribute source. */
      readonly value: ValuePlan;
      readonly lifetimeId: LifetimeId;
      /** Null when a later prop wins the value while this bind handler remains ordered. */
      readonly effectId: number | null;
    }
  | {
      readonly kind: 'ref';
      readonly range: SourceRange;
      readonly value: ValuePlan;
      readonly mode: 'signal' | 'function' | 'unknown';
    }
  | {
      readonly kind: 'inner-html';
      readonly range: SourceRange;
      readonly value: StaticProp['value'] | ValuePlan;
      readonly lifetimeId: LifetimeId | null;
      readonly effectId: number | null;
    };

export type ValuePlan =
  | {
      readonly kind: 'segment';
      readonly expression: SourceRange;
      readonly segment: SegmentReferencePlan;
    }
  | {
      readonly kind: 'source';
      readonly expression: SourceRange;
      readonly source: SourceRange;
      readonly referenceBindingIds: readonly BindingId[];
    }
  | {
      readonly kind: 'expression';
      readonly expression: SourceRange;
      readonly referenceBindingIds: readonly BindingId[];
      readonly initialOnly: boolean;
      readonly compilerString: boolean;
      /** True nested resumable boundaries; the containing expression is not a boundary. */
      readonly boundaries: readonly SegmentReferencePlan[];
    }
  | {
      readonly kind: 'render-value';
      readonly expression: SourceRange;
      readonly bindingId: BindingId;
    };

export interface SegmentReferencePlan {
  readonly segmentId: string;
  readonly captureBindingIds: readonly BindingId[];
  readonly componentPropBindingIds: readonly BindingId[];
}

export type RenderEffectPlan =
  | {
      readonly kind: 'text' | 'content';
      readonly id: number;
      readonly lifetimeId: LifetimeId;
      readonly range: SourceRange;
      readonly value: ValuePlan;
    }
  | {
      readonly kind: 'attribute';
      readonly id: number;
      readonly lifetimeId: LifetimeId;
      readonly target: SourceRange;
      readonly name: string;
      readonly value: ValuePlan;
    }
  | {
      readonly kind: 'props';
      readonly id: number;
      readonly lifetimeId: LifetimeId;
      readonly target: SourceRange;
      readonly name: string | null;
      readonly value: ValuePlan;
    }
  | {
      readonly kind: 'event';
      readonly id: number;
      readonly lifetimeId: LifetimeId;
      readonly target: SourceRange;
      readonly name: string;
      readonly value: ValuePlan;
    };

export interface RenderFunctionPlan {
  readonly kind: 'branch' | 'slot' | 'collection-row' | 'local-jsx';
  readonly collectionSourceKind: CollectionSourcePlan['kind'] | null;
  readonly range: SourceRange;
  readonly segmentId: string | null;
  readonly lifetimeId: LifetimeId;
  readonly async: boolean;
  /** Target-neutral proof that rendering needs no owner, invoke context, hook, or effect. */
  readonly pure: boolean;
  readonly setup: readonly SetupPlan[];
  readonly parameterBindingIds: readonly BindingId[];
  /** Bindings used by the lowered setup and render tree, after static folding. */
  readonly referenceBindingIds: readonly BindingId[];
  readonly render: RenderPlan;
  readonly lifecycleSegmentIds: readonly string[];
  readonly needsId: boolean;
  readonly styleScope: string | null;
  readonly runtimeStyleScope: boolean;
  readonly runtimeStyleScopeName: string | null;
}

export interface SegmentCapturePlan {
  readonly bindingId: BindingId;
  readonly name: string;
  readonly source: SegmentCaptureSource;
  readonly access: 'direct' | 'loop-value' | 'component-prop';
}

export interface ModuleReferencePlan {
  readonly bindingId: BindingId;
  readonly name: string;
  readonly declarationRange: SourceRange | null;
  readonly import: ImportBinding | null;
}

export interface SegmentPlan {
  readonly id: string;
  readonly symbolName: string;
  readonly parentId: string | null;
  readonly kind: SegmentKind;
  readonly ctxName: string;
  readonly qrl: QrlBoundaryPlan | null;
  readonly payload: 'function' | 'value';
  readonly range: SourceRange;
  readonly functionRange: SourceRange;
  readonly calleeRange: SourceRange | null;
  readonly argumentRanges: readonly (SourceRange | null)[];
  readonly paramRanges: readonly SourceRange[];
  readonly parameterBindingIds: readonly BindingId[];
  /** Shortest positional prefix needed by the lowered body. */
  readonly usedParameterBindingIds: readonly BindingId[];
  readonly bodyRange: SourceRange;
  readonly bodyKind: 'block' | 'expression';
  readonly propsParts: readonly SegmentPropsPartPlan[];
  readonly async: boolean;
  readonly awaits: readonly { readonly range: SourceRange; readonly argumentRange: SourceRange }[];
  readonly captures: readonly SegmentCapturePlan[];
  readonly moduleReferences: readonly ModuleReferencePlan[];
  readonly references: readonly ReferenceInfo[];
  readonly visibleTaskStrategy: 'intersection-observer' | 'document-ready' | 'document-idle' | null;
  readonly lifetimeId: LifetimeId | null;
  readonly render: RenderFunctionPlan | null;
  readonly componentParameter: ComponentParameterPlan | null;
  readonly moduleStyle: {
    readonly styleId: string;
    readonly resultUsed: boolean;
  } | null;
}

export interface ComponentDefinition {
  bindingId: BindingId;
  shape: ComponentShape;
  exported: boolean;
  declarationKind: 'function' | 'const' | 'defaultFunction' | 'defaultArrow';
  exportName: string | 'default';
  localName: string | null;
  functionRange: SourceRange | null;
  replacementRange: SourceRange;
  params: ParamRecord[];
  body: FunctionBody | Expression;
}

export interface ComponentOutput {
  component: ComponentDefinition;
  result: ComponentPlan;
}

export interface StaticProp {
  name: string;
  value: string | number | boolean | null;
}

export type SegmentPropsPartPlan =
  | { readonly kind: 'static'; readonly prop: StaticProp }
  | {
      readonly kind: 'expression';
      readonly name: string;
      readonly range: SourceRange;
    }
  | { readonly kind: 'spread'; readonly range: SourceRange };

export interface SegmentCapture {
  bindingId: BindingId;
  name: string;
  source: SegmentCaptureSource;
}

export interface Segment {
  id: string;
  parentId: string | null;
  name: string;
  kind: Exclude<SegmentKind, 'collectionRender' | 'collectionSource'>;
  ctxName: string;
  qrl: QrlBoundaryPlan | null;
  payload: 'function' | 'value';
  range: SourceRange;
  functionRange: SourceRange;
  calleeRange: SourceRange | null;
  argumentRanges: Array<SourceRange | null>;
  paramRanges: SourceRange[];
  bodyRange: SourceRange;
  bodyKind: 'block' | 'expression';
  async: boolean;
  // Ordered JSX attributes for a props expression. Later entries override earlier ones.
  propsParts?: SegmentPropsPartPlan[];
  awaits: Array<{ range: SourceRange; argumentRange: SourceRange }>;
  captures: SegmentCapture[];
  moduleReferences: string[];
  moduleReferenceBindingIds?: BindingId[];
  references?: ReferenceInfo[];
  visibleTaskStrategy?: 'intersection-observer' | 'document-ready' | 'document-idle' | null;
  // `null` is an intentionally empty branch renderer; `undefined` uses the source expression.
  render?: RenderPlan | null;
}

export interface ModuleDeclaration {
  range: SourceRange;
  names: string[];
  exported: boolean;
}

export interface ExtractedQrls {
  analysis: ModuleAnalysis;
  segments: Segment[];
  moduleDeclarations: ModuleDeclaration[];
  invalidBoundaries: Array<{ range: SourceRange; message: string }>;
}

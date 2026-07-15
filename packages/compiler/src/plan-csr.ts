import { jsxEventToHtmlAttribute } from './ast-utils';
import type { SourceRange } from './types';
import { escapeAttr, escapeText, serializeAttrValue } from './html-utils';
import type {
  BindingId,
  ComponentPlan,
  OrderedPropPlan,
  RenderFunctionPlan,
  RenderNodePlan,
  RenderPlan,
  SegmentPlan,
  SegmentReferencePlan,
  SetupPlan,
  StaticProp,
  UseIdPlan,
  ValuePlan,
  ComponentOutput,
} from './plan-types';

export type CsrRefStep = 'firstChild' | 'nextSibling';

export type CsrRefKind = 'element' | 'text' | 'text-marker' | 'range-start' | 'range-end';

export interface CsrRefPlan {
  readonly id: number;
  readonly kind: CsrRefKind;
  readonly path: readonly CsrRefStep[];
}

export interface CsrRangePlan {
  readonly start: number;
  readonly end: number;
}

export interface CsrSegmentReferencePlan {
  readonly segmentId: string;
  readonly symbolName: string;
  readonly captures: readonly string[];
  readonly stableBoundaries: readonly CsrSegmentReferencePlan[];
  readonly delivery: 'direct' | 'lazy';
}

export type CsrCollectionSourcePlan =
  | { readonly kind: 'direct-array'; readonly expression: string }
  | { readonly kind: 'direct-reactive'; readonly expression: string }
  | {
      readonly kind: 'derived';
      readonly segment: CsrSegmentReferencePlan;
      readonly keepSource: boolean;
    };

export type CsrCardinality = 'one' | 'many' | 'unknown';
export type CsrReturnMode = 'sync' | 'maybe-promise';
export type CsrOutputShape = 'element' | 'node' | 'many' | 'unknown';

export type CsrCollectionRowPlan =
  | { readonly kind: 'segment'; readonly reference: CsrSegmentReferencePlan }
  | {
      readonly kind: 'inline';
      readonly symbolName: string;
      readonly render: CsrPlan;
      readonly parameterRanges: readonly SourceRange[];
      readonly usedParameterCount: number;
      readonly async: boolean;
    };

export type CsrValuePlan =
  | {
      readonly kind: 'segment';
      readonly expression: string;
      readonly reference: CsrSegmentReferencePlan;
      readonly returnMode: 'maybe-promise';
      readonly cardinality: 'unknown';
    }
  | {
      readonly kind: 'source';
      readonly expression: string;
      readonly source: string;
      readonly returnMode: 'sync';
      readonly cardinality: 'unknown';
    }
  | {
      readonly kind: 'expression';
      readonly expression: string;
      readonly returnMode: CsrReturnMode;
      readonly cardinality: CsrCardinality;
      readonly initialOnly: boolean;
      readonly compilerString: boolean;
      readonly boundaries: readonly CsrSegmentReferencePlan[];
      readonly range: SourceRange | null;
    };

export type CsrPropPlan =
  | {
      readonly kind: 'static';
      readonly name: string;
      readonly value: StaticProp['value'];
    }
  | { readonly kind: 'dynamic'; readonly name: string; readonly value: CsrValuePlan }
  | { readonly kind: 'spread'; readonly value: CsrValuePlan }
  | { readonly kind: 'event'; readonly name: string; readonly value: CsrValuePlan }
  | {
      readonly kind: 'bind';
      readonly name: 'value' | 'checked';
      readonly signal: string;
      readonly value: CsrValuePlan;
      readonly controlsValue: boolean;
    }
  | {
      readonly kind: 'ref';
      readonly value: CsrValuePlan;
      readonly mode: 'signal' | 'function' | 'unknown';
    }
  | {
      readonly kind: 'inner-html';
      readonly value: StaticProp['value'] | CsrValuePlan;
    };

export type CsrSetupPlan =
  | {
      readonly kind: 'statement';
      readonly range: SourceRange;
      readonly segmentIds: readonly string[];
      readonly useIds: readonly UseIdPlan[];
    }
  | {
      readonly kind: 'render-value';
      readonly name: string;
      readonly bindingId: BindingId;
      readonly render: CsrPlan;
    }
  | Extract<SetupPlan, { kind: 'style' }>;

export type CsrRootPlan =
  | { readonly kind: 'ref'; readonly ref: number; readonly cardinality: 'one' }
  | {
      readonly kind: 'operation';
      readonly operation: number;
      readonly cardinality: 'one' | 'many';
    };

export interface CsrDirectComponentPlan {
  readonly kind: 'component';
  readonly tag: string;
  readonly cardinality: CsrCardinality;
  readonly outputShape: CsrOutputShape;
  readonly returnMode: CsrReturnMode;
  readonly props: readonly CsrPropPlan[];
  readonly idBase: string | null;
  readonly slots: readonly {
    readonly name: string;
    readonly render: CsrSegmentReferencePlan;
    readonly idBase: string | null;
  }[];
}

export type CsrOutputPlan = CsrValuePlan | CsrDirectComponentPlan;

export type CsrOperationPlan =
  | {
      readonly id: number;
      readonly kind: 'text';
      readonly target: number;
      readonly existing: boolean;
      readonly value: CsrValuePlan;
      readonly awaitInitial: boolean;
    }
  | {
      readonly id: number;
      readonly kind: 'content';
      readonly range: CsrRangePlan;
      readonly value: CsrValuePlan;
      readonly cardinality: CsrCardinality;
    }
  | {
      readonly id: number;
      readonly kind: 'content-effect';
      readonly range: CsrRangePlan;
      readonly segment: CsrSegmentReferencePlan;
    }
  | {
      readonly id: number;
      readonly kind: 'attribute';
      readonly target: number;
      readonly name: string;
      readonly value: CsrValuePlan;
      readonly awaitInitial: boolean;
      readonly styleScopedId: string | null;
      readonly runtimeStyleScope: boolean;
    }
  | {
      readonly id: number;
      readonly kind: 'element-props';
      readonly target: number;
      readonly props: readonly CsrPropPlan[];
      readonly segment: CsrSegmentReferencePlan | null;
      readonly styleScopedId: string | null;
      readonly runtimeStyleScope: boolean;
    }
  | {
      readonly id: number;
      readonly kind: 'runtime-style';
      readonly target: number;
      readonly staticClass: string | null;
    }
  | {
      readonly id: number;
      readonly kind: 'ref';
      readonly target: number;
      readonly value: CsrValuePlan;
      readonly mode: 'signal' | 'function' | 'unknown';
    }
  | {
      readonly id: number;
      readonly kind: 'event';
      readonly target: number;
      readonly name: string;
      readonly handlers: readonly CsrEventHandlerPlan[];
    }
  | {
      readonly id: number;
      readonly kind: 'component';
      readonly range: CsrRangePlan;
      readonly tag: string;
      readonly cardinality: CsrCardinality;
      readonly outputShape: CsrOutputShape;
      readonly returnMode: CsrReturnMode;
      readonly props: readonly CsrPropPlan[];
      readonly idBase: string | null;
      readonly slots: readonly {
        readonly name: string;
        readonly render: CsrSegmentReferencePlan;
        readonly idBase: string | null;
      }[];
    }
  | {
      readonly id: number;
      readonly kind: 'branch';
      readonly range: CsrRangePlan;
      readonly condition: CsrSegmentReferencePlan;
      readonly then: CsrSegmentReferencePlan;
      readonly else: CsrSegmentReferencePlan | null;
      readonly idBase: string | null;
    }
  | {
      readonly id: number;
      readonly kind: 'slot';
      readonly range: CsrRangePlan;
      readonly name: string;
      readonly fallback: CsrSegmentReferencePlan | null;
      readonly idBase: string | null;
    }
  | {
      readonly id: number;
      readonly kind: 'collection';
      readonly range: CsrRangePlan;
      readonly source: CsrCollectionSourcePlan;
      readonly key: CsrSegmentReferencePlan | null;
      readonly row: CsrCollectionRowPlan;
      readonly usesIndexSignal: boolean;
      readonly idBase: string | null;
      readonly rowShape: CsrOutputShape;
      readonly transient: boolean;
    };

export type CsrEventHandlerPlan =
  | { readonly kind: 'value'; readonly value: CsrValuePlan }
  | {
      readonly kind: 'bind';
      readonly name: 'value' | 'checked';
      readonly signal: string;
    };

/** Target-specific plan consumed by the CSR serializer. */
export interface CsrPlan {
  readonly template: string;
  readonly output: CsrOutputPlan | null;
  readonly refs: readonly CsrRefPlan[];
  readonly roots: readonly CsrRootPlan[];
  readonly setup: readonly CsrSetupPlan[];
  readonly operations: readonly CsrOperationPlan[];
  readonly segments: readonly SegmentPlan[];
  readonly directSegmentIds: readonly string[];
  readonly usedSegmentIds: readonly string[];
  readonly returnMode: CsrReturnMode;
  readonly async: boolean;
  readonly needsContext: boolean;
  readonly needsId: boolean;
  readonly idBase: string;
  readonly runtimeStyleScopeName: string | null;
  readonly initializeRuntimeStyleScope: boolean;
}

interface TemplateElement {
  readonly kind: 'element';
  readonly ref: number;
  readonly tag: string;
  readonly attrs: string;
  readonly children: TemplateNode[];
  rawHtml: string | null;
}

interface TemplateText {
  readonly kind: 'text';
  readonly ref: number;
  value: string;
}

interface TemplateMarker {
  readonly kind: 'marker';
  readonly ref: number;
  readonly refKind: Exclude<CsrRefKind, 'element' | 'text'>;
}

type TemplateNode = TemplateElement | TemplateText | TemplateMarker;

const VOID_ELEMENTS = new Set([
  'area',
  'base',
  'br',
  'col',
  'embed',
  'hr',
  'img',
  'input',
  'link',
  'meta',
  'param',
  'source',
  'track',
  'wbr',
]);

export interface CsrComponentTargetInfo {
  readonly cardinality: CsrCardinality;
  readonly outputShape: CsrOutputShape;
  readonly returnMode: CsrReturnMode;
}

export type CsrComponentCardinalityResolver = (
  bindingId: BindingId | null
) => CsrComponentTargetInfo;

export function createCsrComponentCardinalityResolver(
  outputs: readonly ComponentOutput[]
): CsrComponentCardinalityResolver {
  const components = new Map(
    outputs.map((output) => [output.component.bindingId, output.result] as const)
  );
  const cache = new Map<BindingId, CsrComponentTargetInfo>();
  const visiting = new Set<BindingId>();
  const resolve: CsrComponentCardinalityResolver = (bindingId) => {
    if (bindingId === null) {
      return unknownComponentCardinality();
    }
    const cached = cache.get(bindingId);
    if (cached !== undefined) {
      return cached;
    }
    const component = components.get(bindingId);
    if (component === undefined || visiting.has(bindingId)) {
      return unknownComponentCardinality();
    }
    visiting.add(bindingId);
    const outputShape = renderPlanOutputShape(component.render, resolve);
    const info: CsrComponentTargetInfo = {
      outputShape,
      cardinality: outputShapeCardinality(outputShape),
      returnMode:
        component.shape.async || renderPlanReturnMode(component.render, resolve) === 'maybe-promise'
          ? 'maybe-promise'
          : 'sync',
    };
    visiting.delete(bindingId);
    cache.set(bindingId, info);
    return info;
  };
  return resolve;
}

export function planCsr(
  component: ComponentPlan,
  source: string,
  componentCardinality: CsrComponentCardinalityResolver = unknownComponentCardinality,
  componentPropsName = 'props'
): CsrPlan | null {
  return new CsrPlanner(
    component.segments,
    source,
    componentCardinality,
    componentPropsName,
    component.styleScope,
    component.runtimeStyleScopeName,
    component.runtimeStyleScopeName !== null
  ).plan(
    component.render,
    component.setup,
    null,
    component.shape.async,
    component.needsId,
    component.idBase
  );
}

export function planCsrRenderFunction(
  renderFunction: RenderFunctionPlan,
  segments: readonly SegmentPlan[],
  source: string,
  componentCardinality: CsrComponentCardinalityResolver = unknownComponentCardinality,
  componentPropsName = 'props'
): CsrPlan | null {
  return new CsrPlanner(
    segments,
    source,
    componentCardinality,
    componentPropsName,
    renderFunction.styleScope,
    renderFunction.runtimeStyleScopeName,
    false
  ).plan(
    renderFunction.render,
    renderFunction.setup,
    renderFunction.segmentId,
    renderFunction.async,
    renderFunction.needsId,
    ''
  );
}

class CsrPlanner {
  private readonly segmentById: ReadonlyMap<string, SegmentPlan>;
  private readonly template: TemplateNode[] = [];
  private readonly operations: CsrOperationPlan[] = [];
  private readonly roots: CsrRootPlan[] = [];
  private readonly directSegmentIds = new Set<string>();
  private readonly usedSegmentIds = new Set<string>();
  private readonly renderValuePlans = new Map<BindingId, CsrPlan>();
  private nextRef = 0;
  private isAsync = false;
  private needsId = false;
  private nextId = 0;

  constructor(
    private readonly segments: readonly SegmentPlan[],
    private readonly source: string,
    private readonly componentCardinality: CsrComponentCardinalityResolver,
    private readonly componentPropsName: string,
    private readonly styleScopedId: string | null = null,
    private readonly runtimeStyleScopeName: string | null = null,
    private readonly initializeRuntimeStyleScope = false
  ) {
    this.segmentById = new Map(segments.map((segment) => [segment.id, segment]));
  }

  plan(
    render: RenderPlan,
    setup: readonly SetupPlan[],
    ownerSegmentId: string | null,
    async: boolean,
    needsId = false,
    idBase = ''
  ): CsrPlan | null {
    this.isAsync = async;
    this.needsId = needsId;
    const plannedSetup: CsrSetupPlan[] = [];
    for (const item of setup) {
      if (item.kind === 'render-value') {
        const render = new CsrPlanner(
          this.segments,
          this.source,
          this.componentCardinality,
          this.componentPropsName,
          item.render.styleScope,
          item.render.runtimeStyleScopeName
        ).plan(
          item.render.render,
          item.render.setup,
          item.render.segmentId,
          item.render.async,
          item.render.needsId,
          ''
        );
        if (render === null) {
          return null;
        }
        this.renderValuePlans.set(item.bindingId, render);
        for (const segmentId of render.directSegmentIds) {
          this.directSegmentIds.add(segmentId);
        }
        for (const segmentId of render.usedSegmentIds) {
          this.usedSegmentIds.add(segmentId);
        }
        plannedSetup.push({
          kind: 'render-value',
          name: item.name,
          bindingId: item.bindingId,
          render,
        });
        continue;
      }
      if (item.kind === 'style') {
        plannedSetup.push(item);
        continue;
      }
      plannedSetup.push({
        kind: 'statement',
        range: item.range,
        useIds: item.useIds,
        segmentIds: this.segments
          .filter(
            (segment) =>
              isSetupSegment(segment) &&
              segment.parentId === ownerSegmentId &&
              containsRange(item.range, segment.range)
          )
          .sort((left, right) => left.range[0] - right.range[0])
          .map((segment) => segment.id),
      });
    }
    const soleRoot = render.roots.length === 1 ? render.roots[0] : null;
    const directContentValue =
      soleRoot?.kind === 'dynamic-value' &&
      soleRoot.output === 'content' &&
      soleRoot.value.kind !== 'segment'
        ? soleRoot.value
        : null;
    const directOutput =
      directContentValue !== null
        ? this.planValue(directContentValue)
        : soleRoot?.kind === 'component'
          ? this.planComponent(soleRoot)
          : render.roots.length === 0
            ? ({
                kind: 'expression',
                expression: '[]',
                returnMode: 'sync',
                cardinality: 'many',
                initialOnly: true,
                compilerString: false,
                boundaries: [],
                range: null,
              } satisfies CsrValuePlan)
            : null;
    if ((directContentValue !== null || soleRoot?.kind === 'component') && directOutput === null) {
      return null;
    }
    if (directOutput === null) {
      for (const node of render.roots) {
        const root = this.planNode(node, this.template);
        if (root === null) {
          return null;
        }
        const previous = this.roots[this.roots.length - 1];
        if (previous?.kind !== 'ref' || root.kind !== 'ref' || previous.ref !== root.ref) {
          this.roots.push(root);
        }
      }
    }
    const finalized = finalizeTemplate(this.template);
    for (const item of plannedSetup) {
      if (item.kind !== 'statement') {
        continue;
      }
      for (const segmentId of item.segmentIds) {
        this.directSegmentIds.add(segmentId);
        this.usedSegmentIds.add(segmentId);
      }
    }
    return {
      template: finalized.html,
      output: directOutput,
      refs: finalized.refs,
      roots: this.roots,
      setup: plannedSetup,
      operations: this.operations,
      segments: this.segments,
      directSegmentIds: [...this.directSegmentIds],
      usedSegmentIds: [...this.usedSegmentIds],
      returnMode:
        async || (directOutput !== null && directOutput.returnMode === 'maybe-promise')
          ? 'maybe-promise'
          : 'sync',
      async: this.isAsync,
      needsContext:
        finalized.html !== '' ||
        this.operations.length > 0 ||
        directOutput?.kind === 'component' ||
        plannedSetup.some((item) => item.kind === 'render-value' && item.render.needsContext),
      needsId,
      idBase,
      runtimeStyleScopeName: this.runtimeStyleScopeName,
      initializeRuntimeStyleScope: this.initializeRuntimeStyleScope,
    };
  }

  private planNode(
    node: RenderNodePlan,
    parent: TemplateNode[],
    onlyChild = false
  ): CsrRootPlan | null {
    switch (node.kind) {
      case 'static-text': {
        const previous = parent[parent.length - 1];
        if (previous?.kind === 'text') {
          previous.value += node.value;
          return { kind: 'ref', ref: previous.ref, cardinality: 'one' };
        }
        const ref = this.allocateRef();
        parent.push({ kind: 'text', ref, value: node.value });
        return { kind: 'ref', ref, cardinality: 'one' };
      }
      case 'dynamic-value': {
        const value = this.planValue(node.value);
        if (value === null) {
          return null;
        }
        if (node.output === 'text') {
          const target = this.allocateRef();
          const existing = onlyChild;
          parent.push(
            existing
              ? { kind: 'text', ref: target, value: ' ' }
              : { kind: 'marker', ref: target, refKind: 'text-marker' }
          );
          const awaitInitial = value.kind === 'source' || value.kind === 'segment';
          const operation = this.pushOperation({
            kind: 'text',
            target,
            existing,
            value,
            awaitInitial,
          });
          return { kind: 'operation', operation, cardinality: 'one' };
        }
        const range = this.appendRange(parent);
        let operation: number;
        if (value.kind === 'segment') {
          operation = this.pushOperation({
            kind: 'content-effect',
            range,
            segment: value.reference,
          });
        } else {
          operation = this.pushOperation({
            kind: 'content',
            range,
            value,
            cardinality: value.cardinality,
          });
        }
        return { kind: 'operation', operation, cardinality: 'many' };
      }
      case 'element': {
        const ref = this.allocateRef();
        const plannedProps = this.planProps(node.props);
        const propsSegment =
          node.propsEffect === null ? null : this.planSegment(node.propsEffect.segment);
        if (plannedProps === null || (node.propsEffect !== null && propsSegment === null)) {
          return null;
        }
        const hasSpread = plannedProps.some((prop) => prop.kind === 'spread');
        const grouped = propsSegment !== null;
        const attrs = emitStaticAttributes(
          grouped || hasSpread ? [] : plannedProps,
          this.styleScopedId
        );
        const element: TemplateElement = {
          kind: 'element',
          ref,
          tag: node.tag,
          attrs,
          children: [],
          rawHtml: getStaticInnerHtml(grouped || hasSpread ? [] : plannedProps),
        };
        parent.push(element);
        if (grouped) {
          this.pushOperation({
            kind: 'element-props',
            target: ref,
            props: [],
            segment: propsSegment,
            styleScopedId: this.styleScopedId,
            runtimeStyleScope: this.runtimeStyleScopeName !== null,
          });
        } else if (hasSpread) {
          this.pushOperation({
            kind: 'element-props',
            target: ref,
            props: plannedProps,
            segment: null,
            styleScopedId: this.styleScopedId,
            runtimeStyleScope: this.runtimeStyleScopeName !== null,
          });
        } else {
          for (const prop of plannedProps) {
            switch (prop.kind) {
              case 'dynamic':
                this.pushOperation({
                  kind: 'attribute',
                  target: ref,
                  name: normalizeAttributeName(prop.name),
                  value: prop.value,
                  awaitInitial: prop.value.kind === 'source' || prop.value.kind === 'segment',
                  styleScopedId: this.styleScopedId,
                  runtimeStyleScope: this.runtimeStyleScopeName !== null,
                });
                break;
              case 'event':
                this.pushEventOperation(ref, normalizeEventName(prop.name), {
                  kind: 'value',
                  value: prop.value,
                });
                break;
              case 'bind':
                if (prop.controlsValue) {
                  this.pushOperation({
                    kind: 'attribute',
                    target: ref,
                    name: prop.name,
                    value: prop.value,
                    awaitInitial: true,
                    styleScopedId: null,
                    runtimeStyleScope: false,
                  });
                }
                this.pushEventOperation(ref, 'q-e:input', {
                  kind: 'bind',
                  name: prop.name,
                  signal: prop.signal,
                });
                break;
              case 'ref':
                this.pushOperation({
                  kind: 'ref',
                  target: ref,
                  value: prop.value,
                  mode: prop.mode,
                });
                break;
              case 'inner-html':
                if (isCsrValuePlan(prop.value)) {
                  this.pushOperation({
                    kind: 'element-props',
                    target: ref,
                    props: [prop],
                    segment: null,
                    styleScopedId: this.styleScopedId,
                    runtimeStyleScope: this.runtimeStyleScopeName !== null,
                  });
                }
                break;
            }
          }
        }
        if (
          this.runtimeStyleScopeName !== null &&
          !grouped &&
          !hasSpread &&
          !plannedProps.some(
            (prop) => prop.kind === 'dynamic' && normalizeAttributeName(prop.name) === 'class'
          )
        ) {
          this.pushOperation({
            kind: 'runtime-style',
            target: ref,
            staticClass: staticClassValue(plannedProps, this.styleScopedId),
          });
        }
        if (element.rawHtml === null) {
          for (const child of node.children) {
            if (this.planNode(child, element.children, node.children.length === 1) === null) {
              return null;
            }
          }
        }
        return { kind: 'ref', ref, cardinality: 'one' };
      }
      case 'component': {
        const component = this.planComponent(node);
        if (component === null) {
          return null;
        }
        const range = this.appendRange(parent);
        const operation = this.pushOperation({
          ...component,
          range,
        });
        return { kind: 'operation', operation, cardinality: 'many' };
      }
      case 'branch': {
        if (node.then.segmentId === null) {
          return null;
        }
        const condition = this.planSegment(node.condition);
        const then = this.planRenderFunction(node.then, 'lazy');
        const otherwise = node.else === null ? null : this.planRenderFunction(node.else, 'lazy');
        if (condition === null || then === null || (node.else !== null && otherwise === null)) {
          return null;
        }
        const range = this.appendRange(parent);
        const operation = this.pushOperation({
          kind: 'branch',
          range,
          condition,
          then,
          else: otherwise,
          idBase: node.then.needsId || node.else?.needsId === true ? this.idExpression('b') : null,
        });
        return { kind: 'operation', operation, cardinality: 'many' };
      }
      case 'slot': {
        const fallback = node.fallback === null ? null : this.planRenderFunction(node.fallback);
        if (node.fallback !== null && fallback === null) {
          return null;
        }
        const range = this.appendRange(parent);
        const operation = this.pushOperation({
          kind: 'slot',
          range,
          name: node.name,
          fallback,
          idBase: node.fallback?.needsId === true ? this.idExpression('s') : null,
        });
        return { kind: 'operation', operation, cardinality: 'many' };
      }
      case 'collection': {
        const source =
          node.source.kind === 'direct-array'
            ? {
                kind: 'direct-array' as const,
                expression: this.source.slice(node.source.expression[0], node.source.expression[1]),
              }
            : node.source.kind === 'direct-reactive'
              ? {
                  kind: 'direct-reactive' as const,
                  expression: this.source.slice(node.source.source[0], node.source.source[1]),
                }
              : (() => {
                  const segment = this.planSegment(node.source.segment, 'lazy');
                  return segment === null
                    ? null
                    : ({
                        kind: 'derived' as const,
                        segment,
                        keepSource: node.usesIndexSignal,
                      } satisfies CsrCollectionSourcePlan);
                })();
        const key = node.key === null ? null : this.planSegment(node.key);
        const row =
          node.source.kind === 'direct-array'
            ? this.planInlineCollectionRow(node.row)
            : (() => {
                const reference = this.planRenderFunction(node.row);
                return reference === null ? null : ({ kind: 'segment', reference } as const);
              })();
        if (source === null || row === null || (node.key !== null && key === null)) {
          return null;
        }
        const range = this.appendRange(parent);
        const operation = this.pushOperation({
          kind: 'collection',
          range,
          source,
          key,
          row,
          usesIndexSignal: node.usesIndexSignal,
          idBase: node.row.needsId ? this.idExpression('f') : null,
          rowShape: renderPlanOutputShape(node.row.render, this.componentCardinality),
          transient: node.source.kind === 'direct-array' && parent !== this.template,
        });
        return { kind: 'operation', operation, cardinality: 'many' };
      }
    }
  }

  private planComponent(
    node: Extract<RenderNodePlan, { kind: 'component' }>
  ): CsrDirectComponentPlan | null {
    const props = this.planProps(node.props);
    if (props === null) {
      return null;
    }
    const slots: Array<{
      name: string;
      render: CsrSegmentReferencePlan;
      idBase: string | null;
    }> = [];
    for (const slot of node.slots) {
      const render = this.planRenderFunction(slot.render);
      if (render === null) {
        return null;
      }
      slots.push({
        name: slot.name,
        render,
        idBase: slot.render.needsId ? this.idExpression('p') : null,
      });
    }
    const component = this.componentCardinality(node.bindingId);
    return {
      kind: 'component',
      tag: this.source.slice(node.tagRange[0], node.tagRange[1]),
      cardinality: component.cardinality,
      outputShape: component.outputShape,
      returnMode: component.returnMode,
      props,
      idBase: node.needsId ? this.idExpression('c') : null,
      slots,
    };
  }

  private idExpression(kind: string): string | null {
    return this.needsId ? `_id + '${kind}${this.nextId++}-'` : null;
  }

  private planProps(props: readonly OrderedPropPlan[]): CsrPropPlan[] | null {
    const planned: CsrPropPlan[] = [];
    for (const prop of props) {
      switch (prop.kind) {
        case 'static':
          planned.push({ kind: 'static', name: prop.name, value: prop.value });
          break;
        case 'dynamic': {
          const value = this.planValue(prop.value);
          if (value === null) {
            return null;
          }
          planned.push({ kind: 'dynamic', name: prop.name, value });
          break;
        }
        case 'spread': {
          const value = this.planValue(prop.value);
          if (value === null) {
            return null;
          }
          planned.push({ kind: 'spread', value });
          break;
        }
        case 'event': {
          const value = this.planValue(prop.value);
          if (value === null) {
            return null;
          }
          planned.push({ kind: 'event', name: prop.name, value });
          break;
        }
        case 'bind': {
          const value = this.planValue(prop.value);
          if (value === null) {
            return null;
          }
          planned.push({
            kind: 'bind',
            name: prop.name,
            signal: this.source.slice(prop.signal[0], prop.signal[1]),
            value,
            controlsValue: prop.effectId !== null,
          });
          break;
        }
        case 'ref': {
          const value = this.planValue(prop.value);
          if (value === null) {
            return null;
          }
          planned.push({ kind: 'ref', value, mode: prop.mode });
          break;
        }
        case 'inner-html': {
          if (isValuePlan(prop.value)) {
            const value = this.planValue(prop.value);
            if (value === null) {
              return null;
            }
            planned.push({ kind: 'inner-html', value });
          } else {
            planned.push({ kind: 'inner-html', value: prop.value });
          }
          break;
        }
      }
    }
    return planned;
  }

  private planValue(value: ValuePlan): CsrValuePlan | null {
    if (value.kind === 'render-value') {
      const render = this.renderValuePlans.get(value.bindingId);
      return {
        kind: 'expression',
        expression: `${this.source.slice(value.expression[0], value.expression[1])}()`,
        returnMode: render?.returnMode ?? 'maybe-promise',
        cardinality: render === undefined ? 'unknown' : planCardinality(render),
        initialOnly: false,
        compilerString: false,
        boundaries: [],
        range: null,
      };
    }
    if (value.kind === 'source') {
      return {
        kind: 'source',
        expression: this.source.slice(value.expression[0], value.expression[1]),
        source: this.source.slice(value.source[0], value.source[1]),
        returnMode: 'sync',
        cardinality: 'unknown',
      };
    }
    if (value.kind === 'expression') {
      const boundaries: CsrSegmentReferencePlan[] = [];
      for (const boundary of value.boundaries) {
        const planned = this.planSegment(boundary);
        if (planned === null) {
          return null;
        }
        boundaries.push(planned);
      }
      return {
        kind: 'expression',
        expression: this.source.slice(value.expression[0], value.expression[1]),
        returnMode: 'sync',
        cardinality: 'unknown',
        initialOnly: value.initialOnly,
        compilerString: value.compilerString,
        boundaries,
        range: value.expression,
      };
    }
    const reference = this.planSegment(value.segment);
    return reference === null
      ? null
      : {
          kind: 'segment',
          expression: this.source.slice(value.expression[0], value.expression[1]),
          reference,
          returnMode: 'maybe-promise',
          cardinality: 'unknown',
        };
  }

  private planRenderFunction(
    render: RenderFunctionPlan,
    delivery: CsrSegmentReferencePlan['delivery'] = 'direct'
  ): CsrSegmentReferencePlan | null {
    if (render.segmentId === null) {
      return null;
    }
    const segment = this.segmentById.get(render.segmentId);
    return segment === undefined
      ? null
      : this.planSegment(
          {
            segmentId: render.segmentId,
            captureBindingIds: segment.captures.flatMap((capture) =>
              capture.access === 'component-prop' ? [] : [capture.bindingId]
            ),
            componentPropBindingIds: segment.captures.flatMap((capture) =>
              capture.access === 'component-prop' ? [capture.bindingId] : []
            ),
          },
          delivery
        );
  }

  private planInlineCollectionRow(render: RenderFunctionPlan): CsrCollectionRowPlan | null {
    if (render.segmentId === null) {
      return null;
    }
    const segment = this.segmentById.get(render.segmentId);
    const planned = planCsrRenderFunction(
      render,
      this.segments,
      this.source,
      this.componentCardinality,
      this.componentPropsName
    );
    if (segment === undefined || planned === null) {
      return null;
    }
    for (const id of planned.directSegmentIds) {
      this.directSegmentIds.add(id);
    }
    for (const id of planned.usedSegmentIds) {
      this.usedSegmentIds.add(id);
    }
    return {
      kind: 'inline',
      symbolName: segment.symbolName,
      render: planned,
      parameterRanges: segment.paramRanges,
      usedParameterCount: render.needsId
        ? segment.paramRanges.length
        : Math.min(segment.usedParameterBindingIds.length, segment.paramRanges.length),
      async: render.async,
    };
  }

  private planSegment(
    reference: SegmentReferencePlan,
    delivery: CsrSegmentReferencePlan['delivery'] = 'direct'
  ): CsrSegmentReferencePlan | null {
    const segment = this.segmentById.get(reference.segmentId);
    if (segment === undefined) {
      return null;
    }
    const captureNames = new Map(
      segment.captures.map((capture) => [capture.bindingId, capture.name] as const)
    );
    const captures = [
      ...(reference.componentPropBindingIds.length > 0 ? [this.componentPropsName] : []),
      ...reference.captureBindingIds.map((bindingId) => captureNames.get(bindingId)),
      ...(segment.render?.runtimeStyleScopeName === null ||
      segment.render?.runtimeStyleScopeName === undefined
        ? []
        : [segment.render.runtimeStyleScopeName]),
    ];
    if (captures.some((capture) => capture === undefined)) {
      return null;
    }
    const stableBoundaries: CsrSegmentReferencePlan[] = [];
    if (segment.propsParts.length > 0) {
      for (const child of this.segments) {
        if (child.parentId !== segment.id || child.kind !== 'event') {
          continue;
        }
        const planned = this.planSegment(
          {
            segmentId: child.id,
            captureBindingIds: child.captures.flatMap((capture) =>
              capture.access === 'component-prop' ? [] : [capture.bindingId]
            ),
            componentPropBindingIds: child.captures.flatMap((capture) =>
              capture.access === 'component-prop' ? [capture.bindingId] : []
            ),
          },
          'direct'
        );
        if (planned === null) {
          return null;
        }
        stableBoundaries.push(planned);
      }
    }
    if (delivery === 'direct') {
      this.directSegmentIds.add(segment.id);
    }
    this.usedSegmentIds.add(segment.id);
    return {
      segmentId: segment.id,
      symbolName: segment.symbolName,
      captures: captures as string[],
      stableBoundaries,
      delivery,
    };
  }

  private appendRange(parent: TemplateNode[]): CsrRangePlan {
    const start = this.allocateRef();
    const end = this.allocateRef();
    parent.push(
      { kind: 'marker', ref: start, refKind: 'range-start' },
      { kind: 'marker', ref: end, refKind: 'range-end' }
    );
    return { start, end };
  }

  private allocateRef(): number {
    return this.nextRef++;
  }

  private pushEventOperation(target: number, name: string, handler: CsrEventHandlerPlan): void {
    const index = this.operations.findIndex(
      (operation) =>
        operation.kind === 'event' && operation.target === target && operation.name === name
    );
    if (index === -1) {
      this.pushOperation({ kind: 'event', target, name, handlers: [handler] });
      return;
    }
    const operation = this.operations[index] as Extract<CsrOperationPlan, { kind: 'event' }>;
    this.operations[index] = { ...operation, handlers: [...operation.handlers, handler] };
  }

  private pushOperation(operation: CsrOperationInput): number {
    const id = this.operations.length;
    this.operations.push({ id, ...operation } as CsrOperationPlan);
    return id;
  }
}

function finalizeTemplate(nodes: readonly TemplateNode[]) {
  const refs: CsrRefPlan[] = [];
  const visit = (children: readonly TemplateNode[], parentPath: readonly CsrRefStep[]): string =>
    children
      .map((node, index) => {
        const path: CsrRefStep[] = [
          ...parentPath,
          'firstChild',
          ...Array<CsrRefStep>(index).fill('nextSibling'),
        ];
        switch (node.kind) {
          case 'text':
            refs.push({ id: node.ref, kind: 'text', path });
            return escapeText(node.value);
          case 'marker':
            refs.push({ id: node.ref, kind: node.refKind, path });
            return '<!---->';
          case 'element': {
            refs.push({ id: node.ref, kind: 'element', path });
            const open = `<${node.tag}${node.attrs}>`;
            if (VOID_ELEMENTS.has(node.tag.toLowerCase())) {
              return open;
            }
            const content = node.rawHtml === null ? visit(node.children, path) : node.rawHtml;
            return `${open}${content}</${node.tag}>`;
          }
        }
      })
      .join('');
  return { html: visit(nodes, []), refs: refs.sort((left, right) => left.id - right.id) };
}

function emitStaticAttributes(props: readonly CsrPropPlan[], styleScopedId: string | null): string {
  const attributes = props
    .flatMap((prop) => {
      if (prop.kind !== 'static') {
        return [];
      }
      const name = normalizeAttributeName(prop.name);
      const value = serializeAttrValue(name, prop.value);
      return value === null ? [] : [value === '' ? ` ${name}` : ` ${name}="${escapeAttr(value)}"`];
    })
    .join('');
  if (styleScopedId === null) {
    return attributes;
  }
  const className = props.find((prop) => prop.kind === 'static' && prop.name === 'class');
  if (className?.kind === 'static') {
    const value = serializeAttrValue('class', className.value);
    const existing = value === null ? '' : value;
    return attributes.replace(
      existing === '' ? ' class' : ` class="${escapeAttr(existing)}"`,
      ` class="${escapeAttr(existing ? `${styleScopedId} ${existing}` : styleScopedId)}"`
    );
  }
  return `${attributes} class="${escapeAttr(styleScopedId)}"`;
}

function staticClassValue(
  props: readonly CsrPropPlan[],
  styleScopedId: string | null
): string | null {
  let value: string | null = null;
  for (const prop of props) {
    if (prop.kind === 'static' && normalizeAttributeName(prop.name) === 'class') {
      value = serializeAttrValue('class', prop.value);
    }
  }
  return styleScopedId === null
    ? value
    : value === null || value === ''
      ? styleScopedId
      : `${styleScopedId} ${value}`;
}

function getStaticInnerHtml(props: readonly CsrPropPlan[]): string | null {
  const innerHtml = props.find((prop) => prop.kind === 'inner-html');
  return innerHtml?.kind === 'inner-html' && !isCsrValuePlan(innerHtml.value)
    ? innerHtml.value == null || innerHtml.value === false
      ? ''
      : String(innerHtml.value)
    : null;
}

function normalizeAttributeName(name: string): string {
  return name === 'className' ? 'class' : name === 'htmlFor' ? 'for' : name;
}

function normalizeEventName(name: string): string {
  return jsxEventToHtmlAttribute(name) ?? name;
}

function isSetupSegment(segment: SegmentPlan): boolean {
  return segment.kind === 'qrl' && segment.qrl !== null;
}

function containsRange(outer: SourceRange, inner: SourceRange): boolean {
  return inner[0] >= outer[0] && inner[1] <= outer[1];
}

type CsrOperationInput = CsrOperationPlan extends infer Operation
  ? Operation extends { readonly id: number }
    ? Omit<Operation, 'id'>
    : never
  : never;

function isValuePlan(value: StaticProp['value'] | ValuePlan): value is ValuePlan {
  return typeof value === 'object' && value !== null && 'kind' in value;
}

function isCsrValuePlan(value: StaticProp['value'] | CsrValuePlan): value is CsrValuePlan {
  return typeof value === 'object' && value !== null && 'kind' in value;
}

function planCardinality(plan: CsrPlan): CsrCardinality {
  if (plan.output !== null) {
    return plan.output.cardinality;
  }
  return plan.roots.length === 1 ? plan.roots[0].cardinality : 'many';
}

function unknownComponentCardinality(): CsrComponentTargetInfo {
  return { cardinality: 'unknown', outputShape: 'unknown', returnMode: 'maybe-promise' };
}

function renderPlanOutputShape(
  render: RenderPlan,
  componentCardinality: CsrComponentCardinalityResolver
): CsrOutputShape {
  if (render.roots.length !== 1) {
    return 'many';
  }
  const root = render.roots[0];
  switch (root.kind) {
    case 'element':
      return 'element';
    case 'static-text':
      return 'node';
    case 'dynamic-value':
      return root.output === 'text' ? 'node' : 'unknown';
    case 'component':
      return componentCardinality(root.bindingId).outputShape;
    case 'branch':
    case 'slot':
    case 'collection':
      return 'many';
  }
}

function renderPlanReturnMode(
  render: RenderPlan,
  componentCardinality: CsrComponentCardinalityResolver
): CsrReturnMode {
  const root = render.roots.length === 1 ? render.roots[0] : null;
  return root?.kind === 'component' ? componentCardinality(root.bindingId).returnMode : 'sync';
}

function outputShapeCardinality(shape: CsrOutputShape): CsrCardinality {
  return shape === 'element' || shape === 'node' ? 'one' : shape;
}

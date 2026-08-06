import type { ValueIR } from './expr-ir';
import type { SourceRange } from './types';
import { DEFAULT_GENERATED_NAMES, type GeneratedNames } from './words';
import { jsxEventToHtmlAttribute } from './ast-utils';
import { hasInitialTask } from './plan-types';
import type {
  BindingId,
  ComponentParameterPlan,
  ComponentPlan,
  ComponentOutput,
  OrderedPropPlan,
  RenderFunctionPlan,
  RenderNodePlan,
  RenderPlan,
  SegmentPlan,
  SegmentReferencePlan,
  SetupPlan,
  UseIdPlan,
  ValuePlan,
} from './plan-types';

export interface SsrPlan {
  readonly setup: readonly SsrSetupOperation[];
  readonly render: SsrRenderBlockPlan;
  readonly providesContext: boolean;
  readonly usedSegmentIds: readonly string[];
  readonly directSegmentIds: readonly string[];
  readonly needsId: boolean;
  readonly idBase: string;
  readonly flushTasks: boolean;
  readonly runtimeStyleScopeName: string | null;
}

export interface SsrRenderBlockPlan {
  readonly operations: readonly SsrOperation[];
  readonly needsRootRange: boolean;
  readonly usedSegmentIds: readonly string[];
  readonly directSegmentIds: readonly string[];
  readonly synchronous: boolean;
  readonly needsContext: boolean;
  readonly staticRoot: boolean;
  readonly runtimeStyleScopeName: string | null;
  readonly embeddedRenders: readonly SsrEmbeddedRenderPlan[];
}

export interface SsrEmbeddedRenderPlan {
  readonly range: SourceRange;
  readonly async: boolean;
  readonly target: SsrRenderFunctionTargetPlan;
}

export interface SsrRenderFunctionTargetPlan {
  readonly setup: readonly SsrSetupOperation[];
  readonly render: SsrRenderBlockPlan;
  readonly usedSegmentIds: readonly string[];
  readonly directSegmentIds: readonly string[];
}

export interface SsrSegmentRenderTargetPlan extends SsrRenderFunctionTargetPlan {
  readonly surroundingRangeId: 'rangeId' | 'rowId' | null;
  readonly rowRoot: boolean;
  readonly rowMarker: boolean;
  readonly slotMarker: boolean;
  readonly usesRowId: boolean;
  readonly runtimeParameters: readonly string[];
  readonly trailingRuntimeParameters: readonly string[];
  readonly parameterBindingIds: readonly BindingId[];
}

export type SsrSetupOperation =
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
      readonly render: SsrRenderBlockPlan;
    }
  | {
      readonly kind: 'local-component';
      readonly name: string;
      readonly bindingId: BindingId;
      readonly parameter: ComponentParameterPlan | null;
      readonly propNames: readonly string[];
      readonly segment: string | null;
      readonly target: SsrRenderFunctionTargetPlan;
    }
  | Extract<SetupPlan, { kind: 'style' }>;

export type SsrOperation =
  | { readonly kind: 'static'; readonly value: string }
  | SsrElementOperation
  | SsrDynamicOperation
  | SsrContentOperation
  | SsrComponentOperation
  | SsrBranchOperation
  | SsrSuspenseOperation
  | SsrSlotOperation
  | SsrCollectionOperation;

export interface SsrElementOperation {
  readonly kind: 'element';
  readonly tag: string;
  readonly targetId: number | null;
  readonly props: readonly SsrPropOperation[];
  readonly propsEffect: SegmentReferencePlan | null;
  readonly propsEffectRef: boolean;
  readonly children: readonly SsrOperation[];
  readonly void: boolean;
  readonly styleScopedId: string | null;
  readonly runtimeStyleScope: boolean;
  readonly elementTargetUses: number;
}

export type SsrPropOperation =
  | Extract<OrderedPropPlan, { kind: 'static' | 'spread' | 'inner-html' | 'ref' }>
  | (Extract<OrderedPropPlan, { kind: 'dynamic' }> & { readonly compilerString: boolean })
  | {
      readonly kind: 'event';
      readonly eventName: string;
      readonly handlers: readonly SsrEventHandlerPlan[];
    };

export type SsrEventHandlerPlan =
  | { readonly kind: 'value'; readonly value: ValuePlan }
  | {
      readonly kind: 'bind';
      readonly name: 'value' | 'checked';
      readonly signal: SourceRange;
    };

export interface SsrDynamicOperation {
  readonly kind: 'dynamic';
  readonly output: 'text' | 'content';
  readonly value: ValuePlan;
  readonly source: SourceRange | null;
  readonly synchronous: boolean;
  readonly target:
    | { readonly kind: 'element'; readonly targetId: number }
    | { readonly kind: 'range'; readonly targetId: number | null; readonly markerIndex: number }
    | null;
}

export interface SsrContentOperation {
  readonly kind: 'content-effect';
  readonly segment: SegmentReferencePlan;
  readonly root: boolean;
  /** Source value; its `ir` is what native engines evaluate server-side. */
  readonly value: ValuePlan | null;
}

export interface SsrComponentOperation {
  readonly kind: 'component';
  readonly tagRange: SourceRange;
  readonly returnMode: 'sync' | 'maybe-promise';
  readonly props: readonly OrderedPropPlan[];
  readonly propsSource: SegmentReferencePlan | null;
  readonly idBase: string | null;
  readonly blockingSuspense: boolean;
  readonly slots: readonly {
    readonly name: string;
    readonly render: RenderFunctionPlan;
    readonly idBase: string | null;
  }[];
}

export interface SsrBranchOperation {
  readonly kind: 'branch';
  readonly condition: SegmentReferencePlan;
  /** Portable condition lowering; the segment stays for client resume. */
  readonly conditionIr?: ValueIR;
  readonly then: RenderFunctionPlan;
  readonly else: RenderFunctionPlan | null;
  readonly root: boolean;
  readonly idBase: string | null;
}

export interface SsrSuspenseOperation {
  readonly kind: 'suspense';
  readonly content: RenderFunctionPlan;
  readonly fallback: ValuePlan | null;
  readonly delay: ValuePlan | null;
  readonly inOrder: readonly SsrOperation[] | null;
}

export interface SsrSlotOperation {
  readonly kind: 'slot';
  readonly name: string;
  readonly fallback: RenderFunctionPlan | null;
  readonly idBase: string | null;
}

export interface SsrCollectionOperation {
  readonly kind: 'collection';
  readonly source:
    | { readonly kind: 'direct-array'; readonly expression: SourceRange; readonly ir?: ValueIR }
    | {
        readonly kind: 'direct-reactive';
        readonly expression: SourceRange;
        readonly ir?: ValueIR;
      }
    | {
        readonly kind: 'derived';
        readonly segment: SegmentReferencePlan;
        readonly keepSource: boolean;
        readonly ir?: ValueIR;
      };
  readonly key: SegmentReferencePlan | null;
  /** Portable key lowering (row-scope bindings); the segment stays for client resume. */
  readonly keyIr?: ValueIR;
  readonly row:
    | { readonly kind: 'segment'; readonly render: RenderFunctionPlan }
    | {
        readonly kind: 'inline';
        readonly symbolName: string;
        readonly target: SsrSegmentRenderTargetPlan;
        readonly parameterRanges: readonly SourceRange[];
        readonly usedParameterCount: number;
        readonly async: boolean;
      };
  readonly usesIndexSignal: boolean;
  readonly idBase: string | null;
  readonly usesRowId: boolean;
  readonly rowShape: 0 | 1 | 2 | 3;
}

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

export type SsrComponentReturnModeResolver = (
  bindingId: BindingId | null
) => 'sync' | 'maybe-promise';

const unknownComponentReturnMode: SsrComponentReturnModeResolver = () => 'maybe-promise';

export function createSsrComponentReturnModeResolver(
  outputs: readonly ComponentOutput[]
): SsrComponentReturnModeResolver {
  const components = new Map(
    outputs.flatMap((output) =>
      output.component.bindingId === null
        ? []
        : [[output.component.bindingId, output.result] as const]
    )
  );
  const modes = new Map<BindingId, 'sync' | 'maybe-promise'>();
  const resolving = new Set<BindingId>();
  const resolve: SsrComponentReturnModeResolver = (bindingId) => {
    const component = bindingId === null ? undefined : components.get(bindingId);
    if (component === undefined || bindingId === null || resolving.has(bindingId)) {
      return 'maybe-promise';
    }
    const cached = modes.get(bindingId);
    if (cached !== undefined) {
      return cached;
    }
    resolving.add(bindingId);
    const planned = planSsr(component, resolve);
    resolving.delete(bindingId);
    const mode =
      !component.shape.async && !hasInitialTask(component) && planned?.render.synchronous === true
        ? 'sync'
        : 'maybe-promise';
    modes.set(bindingId, mode);
    return mode;
  };
  return resolve;
}

export function planSsr(
  component: ComponentPlan,
  componentReturnMode: SsrComponentReturnModeResolver = unknownComponentReturnMode
): SsrPlan | null {
  const planner = new SsrPlanner(
    component.segments,
    undefined,
    component.styleScope,
    component.needsId,
    componentReturnMode,
    component.runtimeStyleScopeName
  );
  const setup = component.setup.map((item) => planner.setup(item, null));
  if (setup.some((item) => item === null)) {
    return null;
  }
  const operations = setup as SsrSetupOperation[];
  const render = planner.render(component.render);
  if (render === null) {
    return null;
  }
  return {
    setup: operations,
    render: operations.length === 0 ? render : { ...render, staticRoot: false },
    providesContext: component.providesContext,
    needsId: component.needsId,
    idBase: component.idBase,
    flushTasks: hasInitialTask(component),
    runtimeStyleScopeName: component.runtimeStyleScopeName,
    usedSegmentIds: [
      ...new Set([...render.usedSegmentIds, ...operations.flatMap(setupSegmentIds)]),
    ],
    directSegmentIds: [
      ...new Set([...render.directSegmentIds, ...operations.flatMap(setupDirectSegmentIds)]),
    ],
  };
}

export function planSsrRender(
  render: RenderPlan,
  segments: readonly SegmentPlan[],
  componentReturnMode: SsrComponentReturnModeResolver = unknownComponentReturnMode
): SsrRenderBlockPlan | null {
  return new SsrPlanner(segments, undefined, null, false, componentReturnMode).render(render);
}

export function planSsrRenderFunction(
  renderFunction: RenderFunctionPlan,
  segments: readonly SegmentPlan[],
  componentReturnMode: SsrComponentReturnModeResolver = unknownComponentReturnMode
): SsrRenderFunctionTargetPlan | null {
  const planner = new SsrPlanner(
    segments,
    undefined,
    renderFunction.styleScope,
    renderFunction.needsId,
    componentReturnMode,
    renderFunction.runtimeStyleScopeName
  );
  const setup = renderFunction.setup.map((item) => planner.setup(item, renderFunction.segmentId));
  if (setup.some((item) => item === null)) {
    return null;
  }
  const render = planner.render(renderFunction.render);
  if (render === null) {
    return null;
  }
  const operations = setup as SsrSetupOperation[];
  const needsSetupContext = operations.some(
    (operation) => operation.kind === 'render-value' && operation.render.needsContext
  );
  return {
    setup: operations,
    render:
      operations.length === 0
        ? render
        : { ...render, needsContext: needsSetupContext || render.needsContext, staticRoot: false },
    usedSegmentIds: [
      ...new Set([...render.usedSegmentIds, ...operations.flatMap(setupSegmentIds)]),
    ],
    directSegmentIds: [
      ...new Set([...render.directSegmentIds, ...operations.flatMap(setupDirectSegmentIds)]),
    ],
  };
}

export function planSsrSegmentRender(
  segment: SegmentPlan,
  segments: readonly SegmentPlan[],
  componentReturnMode: SsrComponentReturnModeResolver = unknownComponentReturnMode,
  generatedNames: GeneratedNames = DEFAULT_GENERATED_NAMES
): SsrSegmentRenderTargetPlan | null {
  if (segment.render === null) {
    return null;
  }
  const planned = planSsrRenderFunction(segment.render, segments, componentReturnMode);
  if (planned === null) {
    return null;
  }
  const row = segment.kind === 'forRender' || segment.kind === 'collectionRender';
  const slot = segment.kind === 'slotRender';
  const branch = segment.kind === 'branchRender';
  const suspense = segment.kind === 'suspenseRender';
  const qrl = segment.kind === 'qrl';
  const sourceCapableRow = row && segment.render.collectionSourceKind !== 'direct-array';
  const rowRoot =
    sourceCapableRow &&
    segment.render.render.roots.length === 1 &&
    segment.render.render.roots[0].kind === 'element';
  const rowMarker = sourceCapableRow && !rowRoot;
  const usesRowId = row && (rowMarker || planned.render.needsRootRange);
  const parameterBindingIds = segment.usedParameterBindingIds;
  const runtimeParameters =
    suspense || qrl
      ? [generatedNames.ctx]
      : row
        ? parameterBindingIds.length > 0
          ? [generatedNames.ctx, '__rangeId', usesRowId ? 'rowId' : '__rowId']
          : usesRowId
            ? [generatedNames.ctx, '__rangeId', 'rowId']
            : planned.render.needsContext
              ? [generatedNames.ctx]
              : []
        : branch
          ? planned.render.needsRootRange
            ? [generatedNames.ctx, 'rangeId']
            : planned.render.needsContext
              ? [generatedNames.ctx]
              : []
          : slot
            ? [generatedNames.ctx, 'rangeId']
            : planned.render.needsContext
              ? [generatedNames.ctx]
              : [];
  return {
    ...planned,
    surroundingRangeId: branch || slot ? 'rangeId' : row ? 'rowId' : null,
    rowRoot,
    rowMarker,
    slotMarker: slot,
    usesRowId,
    runtimeParameters,
    trailingRuntimeParameters: segment.render.needsId ? ['_id'] : [],
    parameterBindingIds,
  };
}

class SsrPlanner {
  private nextTargetId = 0;
  private needsRootRange = false;
  private readonly renderValues = new Map<BindingId, SsrRenderBlockPlan>();
  private readonly embeddedUsedSegmentIds = new Set<string>();
  private readonly embeddedDirectSegmentIds = new Set<string>();
  private readonly embeddedRenders = new Map<string, SsrEmbeddedRenderPlan>();
  private nextId = 0;

  constructor(
    private readonly segments: readonly SegmentPlan[],
    private readonly forcedTargetRange?: SourceRange,
    private readonly styleScopedId: string | null = null,
    private readonly needsId = false,
    private readonly componentReturnMode: SsrComponentReturnModeResolver = unknownComponentReturnMode,
    private readonly runtimeStyleScopeName: string | null = null,
    private readonly generatedNames: GeneratedNames = DEFAULT_GENERATED_NAMES
  ) {}

  setup(setup: SetupPlan, ownerSegmentId: string | null): SsrSetupOperation | null {
    if (setup.kind === 'render-value') {
      const render = new SsrPlanner(
        this.segments,
        undefined,
        setup.render.styleScope,
        setup.render.needsId,
        this.componentReturnMode,
        setup.render.runtimeStyleScopeName
      ).render(setup.render.render);
      if (render === null) {
        return null;
      }
      this.renderValues.set(setup.bindingId, render);
      return {
        kind: 'render-value',
        name: setup.name,
        bindingId: setup.bindingId,
        render,
      };
    }
    if (setup.kind === 'local-component') {
      const target = planSsrRenderFunction(setup.render, this.segments, this.componentReturnMode);
      if (target === null) {
        return null;
      }
      return {
        kind: 'local-component',
        name: setup.name,
        bindingId: setup.bindingId,
        parameter: setup.parameter,
        propNames: setup.propNames,
        segment: setup.segment,
        target,
      };
    }
    if (setup.kind === 'style') {
      return setup;
    }
    return {
      kind: 'statement',
      range: setup.range,
      useIds: setup.useIds,
      segmentIds: this.segments.flatMap((segment) =>
        segment.parentId === ownerSegmentId && contains(setup.range, segment.range)
          ? [segment.id]
          : []
      ),
    };
  }

  render(render: RenderPlan): SsrRenderBlockPlan | null {
    const planned = this.nodes(render.roots, null);
    const operations = planned === null ? null : markSoleStructuralRoot(planned);
    return operations === null
      ? null
      : {
          operations,
          needsRootRange: this.needsRootRange,
          usedSegmentIds: [
            ...new Set([...collectSsrSegmentIds(operations), ...this.embeddedUsedSegmentIds]),
          ],
          directSegmentIds: [
            ...new Set([
              ...collectSsrDirectSegmentIds(operations),
              ...this.embeddedDirectSegmentIds,
            ]),
          ],
          synchronous: operations.every(isSynchronousSsrOperation),
          needsContext: operations.some(needsSsrContext),
          staticRoot: isStaticSsrRoot(render),
          runtimeStyleScopeName: this.runtimeStyleScopeName,
          embeddedRenders: [...this.embeddedRenders.values()],
        };
  }

  private nodes(
    nodes: readonly RenderNodePlan[],
    parentTargetId: number | null
  ): SsrOperation[] | null {
    const output: SsrOperation[] = [];
    let markerIndex = 0;
    for (const node of nodes) {
      const operation = this.node(node, parentTargetId, markerIndex);
      if (operation === null) {
        return null;
      }
      output.push(operation);
      if (node.kind === 'dynamic-value' && node.output === 'text' && parentTargetId !== null) {
        markerIndex++;
      }
    }
    return output;
  }

  private node(
    node: RenderNodePlan,
    parentTargetId: number | null,
    markerIndex: number
  ): SsrOperation | null {
    switch (node.kind) {
      case 'static-text':
        return { kind: 'static', value: node.value };
      case 'dynamic-value': {
        if (!this.trackEmbeddedRenders(node.value)) {
          return null;
        }
        if (node.output === 'content') {
          if (node.value.kind === 'segment') {
            const reference = node.value.segment;
            const segment = this.segments.find((candidate) => candidate.id === reference.segmentId);
            if (segment?.initialOnly !== true) {
              return { kind: 'content-effect', segment: reference, root: false, value: node.value };
            }
          }
          return {
            kind: 'dynamic',
            output: 'content',
            value: node.value,
            source: null,
            synchronous: this.isSynchronousValue(node.value),
            target: null,
          };
        }
        if (isInitialOnlyValue(node.value)) {
          return {
            kind: 'dynamic',
            output: 'text',
            value: node.value,
            source: null,
            synchronous: true,
            target: null,
          };
        }
        if (parentTargetId === null) {
          this.needsRootRange = true;
        }
        return {
          kind: 'dynamic',
          output: 'text',
          value: node.value,
          source: node.value.kind === 'source' ? node.value.source : null,
          synchronous: this.isSynchronousValue(node.value),
          target: {
            kind: 'range',
            targetId: parentTargetId,
            markerIndex,
          },
        };
      }
      case 'element':
        return this.element(node);
      case 'component':
        if (
          node.props.some(
            (prop) =>
              prop.kind !== 'static' &&
              isValuePlan(prop.value) &&
              !this.trackEmbeddedRenders(prop.value)
          )
        ) {
          return null;
        }
        return {
          kind: 'component',
          tagRange: node.tagRange,
          returnMode: this.componentReturnMode(node.bindingId),
          props: node.props,
          propsSource: node.propsSource,
          idBase: node.needsId ? this.idExpression('c') : null,
          blockingSuspense: node.blockingSuspense,
          slots: node.slots.map((slot) => ({
            name: slot.name,
            render: slot.render,
            idBase: slot.render.needsId ? this.idExpression('p') : null,
          })),
        };
      case 'branch':
        return {
          kind: 'branch',
          condition: node.condition,
          conditionIr: node.conditionIr,
          then: node.then,
          else: node.else,
          root: false,
          idBase: node.then.needsId || node.else?.needsId === true ? this.idExpression('b') : null,
        };
      case 'suspense': {
        if (
          (node.fallback !== null && !this.trackEmbeddedRenders(node.fallback)) ||
          (node.delay !== null && !this.trackEmbeddedRenders(node.delay))
        ) {
          return null;
        }
        const inOrder = node.blocking
          ? this.nodes(node.content.render.roots, parentTargetId)
          : null;
        if (node.blocking && inOrder === null) {
          return null;
        }
        return {
          kind: 'suspense',
          content: node.content,
          fallback: node.fallback,
          delay: node.delay,
          inOrder,
        };
      }
      case 'slot':
        return {
          kind: 'slot',
          name: node.name,
          fallback: node.fallback,
          idBase: node.fallback?.needsId === true ? this.idExpression('s') : null,
        };
      case 'collection': {
        const rowTarget =
          node.row.segmentId === null
            ? null
            : (this.segments.find((segment) => segment.id === node.row.segmentId) ?? null);
        const row =
          rowTarget === null
            ? null
            : planSsrSegmentRender(
                rowTarget,
                this.segments,
                this.componentReturnMode,
                this.generatedNames
              );
        if (row === null || rowTarget === null) {
          return null;
        }
        const sourceCapable = node.source.kind !== 'direct-array';
        const rowRoot =
          sourceCapable &&
          node.row.render.roots.length === 1 &&
          node.row.render.roots[0].kind === 'element';
        return {
          kind: 'collection',
          source:
            node.source.kind === 'direct-array'
              ? { kind: 'direct-array', expression: node.source.expression, ir: node.source.ir }
              : node.source.kind === 'direct-reactive'
                ? { kind: 'direct-reactive', expression: node.source.source, ir: node.source.ir }
                : {
                    kind: 'derived',
                    segment: node.source.segment,
                    keepSource: node.usesIndexSignal,
                    ir: node.source.ir,
                  },
          key: node.key,
          keyIr: node.keyIr,
          row:
            node.source.kind === 'direct-array'
              ? {
                  kind: 'inline',
                  symbolName: rowTarget.symbolName,
                  target: row,
                  parameterRanges: rowTarget.paramRanges,
                  usedParameterCount: node.row.needsId
                    ? rowTarget.paramRanges.length
                    : Math.min(
                        rowTarget.usedParameterBindingIds.length,
                        rowTarget.paramRanges.length
                      ),
                  async: node.row.async,
                }
              : { kind: 'segment', render: node.row },
          usesIndexSignal: node.usesIndexSignal,
          idBase: node.row.needsId ? this.idExpression('f') : null,
          usesRowId: row.render.needsRootRange || (sourceCapable && !rowRoot),
          rowShape: renderRowShape(node.row.render),
        };
      }
    }
  }

  private element(node: Extract<RenderNodePlan, { kind: 'element' }>): SsrElementOperation | null {
    for (const prop of node.props) {
      if (
        prop.kind !== 'static' &&
        isValuePlan(prop.value) &&
        !this.trackEmbeddedRenders(prop.value)
      ) {
        return null;
      }
    }
    const dynamicText = node.children.filter(
      (child) =>
        child.kind === 'dynamic-value' &&
        child.output === 'text' &&
        !isInitialOnlyValue(child.value)
    );
    const needsTarget =
      dynamicText.length > 0 ||
      node.propsEffect !== null ||
      node.props.some((prop) =>
        prop.kind === 'ref'
          ? true
          : prop.kind === 'bind'
            ? prop.effectId !== null
            : prop.kind === 'event'
              ? this.isReactiveEventValue(prop.value)
              : prop.kind !== 'static' &&
                !(prop.kind === 'dynamic' && isInitialOnlyValue(prop.value)) &&
                !(prop.kind === 'inner-html' && prop.lifetimeId === null)
      ) ||
      (this.forcedTargetRange !== undefined && sameRange(node.range, this.forcedTargetRange));
    const targetId = needsTarget ? this.nextTargetId++ : null;
    const singleText =
      node.children.length === 1 && node.children[0].kind === 'dynamic-value'
        ? node.children[0]
        : null;
    let children: SsrOperation[] | null;
    if (singleText?.output === 'text' && targetId !== null) {
      children = [
        {
          kind: 'dynamic',
          output: 'text',
          value: singleText.value,
          source: singleText.value.kind === 'source' ? singleText.value.source : null,
          synchronous: this.isSynchronousValue(singleText.value),
          target: { kind: 'element', targetId },
        },
      ];
    } else {
      children = this.nodes(node.children, targetId);
    }
    if (children === null) {
      return null;
    }
    const props: SsrPropOperation[] = [];
    const events = new Map<string, number>();
    const appendEvent = (eventName: string, handler: SsrEventHandlerPlan): void => {
      const index = events.get(eventName);
      if (index === undefined) {
        events.set(eventName, props.length);
        props.push({ kind: 'event', eventName, handlers: [handler] });
      } else {
        const event = props[index] as Extract<SsrPropOperation, { kind: 'event' }>;
        props[index] = { ...event, handlers: [...event.handlers, handler] };
      }
    };
    for (const prop of node.props) {
      if (prop.kind === 'ref') {
        props.push(prop);
        continue;
      }
      if (prop.kind === 'event') {
        const eventName = jsxEventToHtmlAttribute(prop.name, prop.passive);
        if (eventName === null) {
          return null;
        }
        appendEvent(eventName, { kind: 'value', value: prop.value });
        continue;
      }
      if (prop.kind === 'bind') {
        if (prop.effectId !== null) {
          props.push({
            kind: 'dynamic',
            range: prop.range,
            name: prop.name,
            value: prop.value,
            lifetimeId: prop.lifetimeId,
            effectId: prop.effectId,
            compilerString: false,
          });
        }
        appendEvent('q-e:input', { kind: 'bind', name: prop.name, signal: prop.signal });
        continue;
      }
      if (prop.kind === 'dynamic') {
        props.push({
          ...prop,
          name: normalizeAttributeName(prop.name),
          compilerString: prop.value.kind === 'expression' && prop.value.compilerString,
        });
      } else {
        props.push(
          prop.kind === 'static' ? { ...prop, name: normalizeAttributeName(prop.name) } : prop
        );
      }
    }
    return {
      kind: 'element',
      tag: node.tag,
      targetId,
      props,
      propsEffect: node.propsEffect?.segment ?? null,
      propsEffectRef:
        node.propsEffect !== null &&
        node.props.some(
          (prop) => prop.kind === 'spread' || ('name' in prop && prop.name === 'ref')
        ),
      children,
      void: VOID_ELEMENTS.has(node.tag),
      styleScopedId: this.styleScopedId,
      runtimeStyleScope: this.runtimeStyleScopeName !== null,
      elementTargetUses:
        node.propsEffect !== null
          ? 1
          : node.props.filter(
              (prop) =>
                prop.kind === 'spread' ||
                (prop.kind === 'bind' && prop.effectId !== null) ||
                (prop.kind === 'event' && this.isReactiveEventValue(prop.value)) ||
                (prop.kind === 'dynamic' && !isInitialOnlyValue(prop.value)) ||
                (prop.kind === 'inner-html' && prop.lifetimeId !== null)
            ).length,
    };
  }

  private isReactiveEventValue(value: ValuePlan): boolean {
    return (
      value.kind === 'segment' &&
      this.segments.find((segment) => segment.id === value.segment.segmentId)?.kind === 'expression'
    );
  }

  private trackEmbeddedRenders(value: ValuePlan): boolean {
    if (value.kind !== 'expression') {
      return true;
    }
    for (const render of value.embeddedRenders) {
      const planned = planSsrRenderFunction(render, this.segments, this.componentReturnMode);
      if (planned === null) {
        return false;
      }
      planned.usedSegmentIds.forEach((id) => this.embeddedUsedSegmentIds.add(id));
      planned.directSegmentIds.forEach((id) => this.embeddedDirectSegmentIds.add(id));
      this.embeddedRenders.set(rangeKey(render.range), {
        range: render.range,
        async: render.async,
        target: planned,
      });
    }
    return true;
  }

  private isSynchronousValue(value: ValuePlan): boolean {
    return (
      value.kind === 'render-value' && this.renderValues.get(value.bindingId)?.synchronous === true
    );
  }

  private idExpression(kind: string): string | null {
    return this.needsId ? `_id + '${kind}${this.nextId++}-'` : null;
  }
}

function contains(outer: SourceRange, inner: SourceRange): boolean {
  return inner[0] >= outer[0] && inner[1] <= outer[1];
}

function setupSegmentIds(operation: SsrSetupOperation): readonly string[] {
  return operation.kind === 'statement'
    ? operation.segmentIds
    : operation.kind === 'render-value'
      ? operation.render.usedSegmentIds
      : operation.kind === 'local-component'
        ? operation.segment === null
          ? operation.target.usedSegmentIds
          : [...operation.target.usedSegmentIds, operation.segment]
        : [];
}

function setupDirectSegmentIds(operation: SsrSetupOperation): readonly string[] {
  return operation.kind === 'render-value'
    ? operation.render.directSegmentIds
    : operation.kind === 'local-component'
      ? operation.target.directSegmentIds
      : [];
}

function sameRange(left: SourceRange, right: SourceRange): boolean {
  return left[0] === right[0] && left[1] === right[1];
}

function rangeKey(range: SourceRange): string {
  return `${range[0]}:${range[1]}`;
}

function markSoleStructuralRoot(operations: readonly SsrOperation[]): readonly SsrOperation[] {
  if (operations.length !== 1) {
    return operations;
  }
  const operation = operations[0];
  return operation.kind === 'branch' || operation.kind === 'content-effect'
    ? [{ ...operation, root: true }]
    : operations;
}

function normalizeAttributeName(name: string): string {
  return name === 'className' ? 'class' : name === 'htmlFor' ? 'for' : name;
}

function renderRowShape(render: RenderPlan): 0 | 1 | 2 | 3 {
  if (render.roots.length !== 1) {
    return 2;
  }
  const root = render.roots[0];
  if (root.kind === 'element') {
    return 0;
  }
  if (root.kind === 'static-text' || (root.kind === 'dynamic-value' && root.output === 'text')) {
    return 1;
  }
  return root.kind === 'component' || root.kind === 'dynamic-value' ? 3 : 2;
}

function isStaticSsrRoot(render: RenderPlan): boolean {
  return render.roots.every(isStaticSsrNode);
}

function isStaticSsrNode(node: RenderNodePlan): boolean {
  return (
    node.kind === 'static-text' ||
    (node.kind === 'suspense' &&
      node.blocking &&
      node.content.render.roots.every(isStaticSsrNode)) ||
    (node.kind === 'element' &&
      node.propsEffect === null &&
      node.props.every((prop) => prop.kind === 'static') &&
      node.children.every(isStaticSsrNode))
  );
}

function collectSsrSegmentIds(operations: readonly SsrOperation[]): string[] {
  const ids = new Set<string>();
  const value = (plan: ValuePlan | StaticPropValue) => {
    if (!isValuePlan(plan)) {
      return;
    }
    if (plan.kind === 'segment') {
      ids.add(plan.segment.segmentId);
    } else if (plan.kind === 'expression') {
      plan.boundaries.forEach((boundary) => ids.add(boundary.segmentId));
    }
  };
  const render = (plan: RenderFunctionPlan | null) => {
    if (plan?.segmentId !== null && plan?.segmentId !== undefined) {
      ids.add(plan.segmentId);
    }
  };
  const visit = (operation: SsrOperation): void => {
    switch (operation.kind) {
      case 'static':
        return;
      case 'dynamic':
        value(operation.value);
        return;
      case 'content-effect':
        ids.add(operation.segment.segmentId);
        return;
      case 'element':
        if (operation.propsEffect !== null) {
          ids.add(operation.propsEffect.segmentId);
        }
        for (const prop of operation.props) {
          if (prop.kind === 'event') {
            for (const handler of prop.handlers) {
              if (handler.kind === 'value') {
                value(handler.value);
              }
            }
          } else if (prop.kind !== 'static') {
            value(prop.value);
          }
        }
        operation.children.forEach(visit);
        return;
      case 'component':
        if (operation.propsSource !== null) {
          ids.add(operation.propsSource.segmentId);
        }
        for (const prop of operation.props) {
          if (prop.kind !== 'static') {
            value(prop.value);
          }
        }
        operation.slots.forEach((slot) => render(slot.render));
        return;
      case 'branch':
        ids.add(operation.condition.segmentId);
        render(operation.then);
        render(operation.else);
        return;
      case 'suspense':
        if (operation.inOrder !== null) {
          operation.inOrder.forEach(visit);
        } else {
          render(operation.content);
          if (operation.fallback !== null) {
            value(operation.fallback);
          }
          if (operation.delay !== null) {
            value(operation.delay);
          }
        }
        return;
      case 'slot':
        render(operation.fallback);
        return;
      case 'collection':
        if (operation.source.kind === 'derived') {
          ids.add(operation.source.segment.segmentId);
        }
        if (operation.key !== null) {
          ids.add(operation.key.segmentId);
        }
        if (operation.row.kind === 'inline') {
          operation.row.target.usedSegmentIds.forEach((id) => ids.add(id));
        } else {
          render(operation.row.render);
        }
        return;
    }
  };
  operations.forEach(visit);
  return [...ids];
}

function collectSsrDirectSegmentIds(operations: readonly SsrOperation[]): string[] {
  const ids = new Set<string>();
  const visit = (operation: SsrOperation): void => {
    switch (operation.kind) {
      case 'element':
        operation.children.forEach(visit);
        break;
      case 'component':
        if (operation.propsSource !== null) {
          ids.add(operation.propsSource.segmentId);
        }
        break;
      case 'suspense':
        operation.inOrder?.forEach(visit);
        break;
      case 'collection':
        if (operation.row.kind === 'inline') {
          operation.row.target.usedSegmentIds.forEach((id) => ids.add(id));
        }
    }
  };
  operations.forEach(visit);
  return [...ids];
}

function isSynchronousSsrOperation(operation: SsrOperation): boolean {
  switch (operation.kind) {
    case 'static':
      return true;
    case 'dynamic':
      return operation.synchronous;
    case 'content-effect':
      return false;
    case 'element':
      return (
        operation.propsEffect === null &&
        operation.props.every(
          (prop) =>
            prop.kind === 'static' ||
            prop.kind === 'event' ||
            (prop.kind === 'inner-html' && !isValuePlan(prop.value))
        ) &&
        operation.children.every(isSynchronousSsrOperation)
      );
    case 'component':
      return operation.returnMode === 'sync';
    case 'branch':
    case 'slot':
      return false;
    case 'suspense':
      return operation.inOrder?.every(isSynchronousSsrOperation) ?? false;
    case 'collection':
      return (
        operation.source.kind === 'direct-array' &&
        operation.row.kind === 'inline' &&
        !operation.row.async &&
        operation.row.target.render.synchronous
      );
  }
}

function needsSsrContext(operation: SsrOperation): boolean {
  switch (operation.kind) {
    case 'static':
      return false;
    case 'dynamic':
      return (
        operation.target !== null ||
        (operation.value.kind === 'segment' && operation.value.segment.captureBindingIds.length > 0)
      );
    case 'content-effect':
      return true;
    case 'element':
      return (
        operation.targetId !== null ||
        operation.propsEffect !== null ||
        operation.props.some((prop) => prop.kind === 'event') ||
        operation.children.some(needsSsrContext)
      );
    case 'component':
    case 'branch':
    case 'slot':
    case 'collection':
      return true;
    case 'suspense':
      return operation.inOrder?.some(needsSsrContext) ?? true;
  }
}

type StaticPropValue = string | number | boolean | null;

function isValuePlan(value: ValuePlan | StaticPropValue): value is ValuePlan {
  return typeof value === 'object' && value !== null && 'kind' in value;
}

function isInitialOnlyValue(value: ValuePlan): boolean {
  return value.kind === 'expression' && value.initialOnly;
}

import type { JSXAttributeItem, JSXChild, JSXElement, Program } from 'oxc-parser';
import {
  getIdentifierName,
  getJsxAttributeName,
  getJsxName,
  getRange,
  getStaticSourceTextExpressionParts,
  getStaticExpressionValue,
  isFunctionLike,
  isEventProp,
  isNativeTag,
  isObviousPromiseExpression,
  jsxEventToHtmlAttribute,
  normalizeJsxEventName,
  normalizeJsxText,
  unwrapExpression,
} from './ast-utils';
import type { AstFunction, AstNode, SourceRange } from './types';
import {
  getJsxAttributeExpression,
  getJsxCallElement,
  getJsxBranchExpression,
  getExpandableObjectProperties,
  getStaticBranchCondition,
  getStaticJsxAttributeValue,
  isEmptyBranchExpression,
  isComputedComponentProp,
} from './jsx-ast-utils';
import type {
  BindingId,
  BindingInfo,
  BranchPlan,
  CollectionPlan,
  ComponentNodePlan,
  ComponentPlan,
  ComponentProjectionPlan,
  DynamicValuePlan,
  ElementPlan,
  ElementPropsEffectPlan,
  ExtractedQrls,
  LifetimeId,
  LifetimePlan,
  ModuleReferencePlan,
  OrderedPropPlan,
  RenderPlan,
  RenderEffectPlan,
  RenderFunctionPlan,
  FunctionRenderPlan,
  RenderNodePlan,
  ComponentDefinition,
  ComponentParameterPlan,
  ComponentShape,
  ModuleBoundaryPlan,
  Segment,
  SegmentPlan,
  SegmentReferencePlan,
  SetupPlan,
  SlotPlan,
  SuspensePlan,
  StaticProp,
  UseIdPlan,
  ValuePlan,
} from './plan-types';
import type { ValueIR } from './expr-ir';
import { lowerValueIr, reportValueIrSite, type ExprLowerFacts } from './expr-lower';
import type { SetupOp } from './setup-ir';
import { lowerSetupOp, reportSetupOpSite, type SetupLowerFacts } from './setup-lower';
import { QWIK_CORE_IMPORT, QWIK_IMPORT, QwikAttributes, QwikHooks } from './words';
import { createSegmentSymbolName } from './segment-identity';
import { createExtractedSegmentPlan } from './segment-plan';
import { analyzeComponentShape } from './shape';

export type SemanticLowerFailureCode =
  | 'unsupported-syntax'
  | 'ref'
  | 'async-for'
  | 'use-id'
  | 'style-hook'
  | 'custom-hook'
  | 'scoped-style-content';

export interface SemanticLowerFailure {
  readonly kind: 'failure';
  readonly code: SemanticLowerFailureCode;
  readonly range: SourceRange;
  readonly message: string;
}

export type SemanticLowerResult =
  | {
      readonly kind: 'success';
      readonly plan: ComponentPlan;
    }
  | SemanticLowerFailure;

export type SemanticModuleLowerResult =
  | {
      readonly kind: 'success';
      readonly plan: ModuleBoundaryPlan;
    }
  | SemanticLowerFailure;

interface SemanticOwner {
  readonly shape: ComponentDefinition['shape'] | null;
  readonly body: ComponentDefinition['body'];
  readonly functionRange: SourceRange;
  readonly setup: readonly SourceRange[];
  readonly parameter: ComponentDefinition['shape']['parameter'];
  readonly displayName: string;
}

interface RenderContext {
  readonly lifetimeId: LifetimeId;
  readonly effects: RenderEffectPlan[];
}

type RenderEffectInput = RenderEffectPlan extends infer Effect
  ? Effect extends { readonly id: number }
    ? Omit<Effect, 'id'>
    : never
  : never;

interface MapCandidate {
  readonly range: SourceRange;
  readonly source: AstNode;
  readonly callback: AstFunction;
  readonly row: AstNode;
  readonly setup: readonly SourceRange[];
  readonly key: AstNode | null;
  readonly itemBindingId: BindingId | null;
  readonly indexBindingId: BindingId | null;
}

type DynamicOutputKind = DynamicValuePlan['output'];

const LIFECYCLE_HOOKS = new Set<string>([QwikHooks.UseTaskDollar, QwikHooks.UseVisibleTaskDollar]);
const SOURCE_FACTORY_HOOKS = new Set<string>([
  QwikHooks.UseSignal,
  QwikHooks.UseComputedDollar,
  QwikHooks.UseAsyncDollar,
  QwikHooks.UseSerializerDollar,
]);

export function lowerSemanticComponentPlan(
  component: ComponentDefinition,
  extracted: ExtractedQrls
): SemanticLowerResult {
  return new SemanticLowerer(
    {
      shape: component.shape,
      body: component.body,
      functionRange: component.functionRange ?? component.replacementRange,
      setup: component.shape.setup,
      parameter: component.shape.parameter,
      displayName: component.localName ?? String(component.exportName),
    },
    extracted
  ).lowerComponentPlan();
}

export function lowerSemanticModulePlan(
  program: Program,
  plan: ModuleBoundaryPlan,
  extracted: ExtractedQrls
): SemanticModuleLowerResult {
  const segmentsById = new Map(extracted.segments.map((segment) => [segment.id, segment]));
  const loweredSegments = new Map(plan.segments.map((segment) => [segment.id, segment]));
  const functions: FunctionRenderPlan[] = [];

  for (const boundarySegment of plan.segments) {
    const segment = segmentsById.get(boundarySegment.id);
    if (
      segment === undefined ||
      segment.kind !== 'qrl' ||
      segment.payload !== 'function' ||
      (segment.qrl?.kind === 'implicit' && segment.qrl.role !== 'generic')
    ) {
      continue;
    }
    const callback = findNodeByRange(program, segment.functionRange);
    if (callback === null || !isFunctionLike(callback) || !containsJsx(callback.body)) {
      continue;
    }
    const bodyRange = getRange(callback.body);
    if (bodyRange === null) {
      continue;
    }
    const owner: SemanticOwner = {
      shape: null,
      body: callback.body!,
      functionRange: segment.functionRange,
      setup: getLeadingSetupRanges(callback),
      parameter: null,
      displayName: segment.name,
    };
    const lowered = new SemanticLowerer(owner, extracted).lowerModuleQrl(segment, callback);
    if (lowered.kind === 'failure') {
      return lowered;
    }
    const rootPlan = loweredSegments.get(segment.id);
    if (rootPlan !== undefined) {
      loweredSegments.set(segment.id, {
        ...rootPlan,
        embeddedRenders: lowered.embeddedRenders,
        embeddedRenderContext: segment.qrl?.kind === 'implicit' ? 'trailing' : 'ambient',
        initialOnly: true,
      });
    }
    for (const item of lowered.segments) {
      loweredSegments.set(item.id, item);
    }
  }

  const excludedFunctionRanges = [
    ...plan.replacedRanges,
    ...plan.segments.map((segment) => segment.functionRange),
  ];
  for (const functionRange of extracted.analysis.jsxFunctionRanges) {
    if (excludedFunctionRanges.some((range) => rangeContains(range, functionRange))) {
      continue;
    }
    const callback = findNodeByRange(program, functionRange);
    if (callback === null || !isFunctionLike(callback)) {
      continue;
    }
    const bodyRange = getRange(callback.body);
    if (bodyRange === null) {
      continue;
    }
    const owner: SemanticOwner = {
      shape: null,
      body: callback.body!,
      functionRange,
      setup: getLeadingSetupRanges(callback),
      parameter: null,
      displayName: `function_${functionRange[0]}`,
    };
    const lowered = new SemanticLowerer(owner, extracted).lowerFunctionRender(callback);
    if (lowered.kind === 'failure') {
      return lowered;
    }
    functions.push(lowered.plan);
    for (const segment of lowered.segments) {
      loweredSegments.set(segment.id, segment);
    }
  }

  return {
    kind: 'success',
    plan: {
      roots: plan.roots,
      segments: [...loweredSegments.values()],
      functions,
      replacedRanges: plan.replacedRanges,
    },
  };
}

class SemanticLowerer {
  private readonly analysis;
  private readonly lifetimes: LifetimePlan[] = [];
  private readonly usedSegments = new Map<string, LifetimeId>();
  private readonly renderFunctions = new Map<string, RenderFunctionPlan>();
  private readonly embeddedRenders = new Map<string, RenderFunctionPlan[]>();
  private readonly embeddedRenderContexts = new Map<
    string,
    Exclude<SegmentPlan['embeddedRenderContext'], null>
  >();
  private readonly initialOnlyEmbeddedRenders = new Set<string>();
  private readonly syntheticSegments: SegmentPlan[] = [];
  private readonly syntheticSegmentParents = new Map<string, string>();
  private readonly renderSegmentStack: string[] = [];
  private readonly bindingOutputs = new Map<BindingId, DynamicOutputKind>();
  private readonly sourceOutputs = new Map<BindingId, DynamicOutputKind>();
  private readonly signalBindings = new Set<BindingId>();
  private readonly functionBindings = new Set<BindingId>();
  private readonly asyncFunctionBindings = new Set<BindingId>();
  private readonly localRenderValues = new Map<BindingId, RenderFunctionPlan>();
  private readonly reactiveLoopBindings = new Set<BindingId>();
  private readonly initialOnlyBindings = new Set<BindingId>();
  private readonly setupBindings = new Set<BindingId>();
  private readonly compilerStringBindings = new Set<BindingId>();
  private readonly styleScopes: string[] = [];
  private nextUseId = 0;
  private nextStyle = 0;
  private nextLifetimeId = 0;
  private nextEffectId = 0;
  private hasCustomHook = false;
  private runtimeStyleScopeNameCache: string | null = null;
  private failure: Exclude<SemanticLowerResult, { kind: 'success' }> | null = null;

  constructor(
    private readonly owner: SemanticOwner,
    private readonly extracted: ExtractedQrls
  ) {
    this.analysis = extracted.analysis;
    // set here, not in the field literal: parameter properties land after field initializers
    // every facts object, not just the base: the derived ones are spread at field-init time,
    // which runs before this constructor body
    // every facts object: the derived ones are spread at field-init time, before this body runs
    for (const facts of [this.exprLowerFacts, this.renderValueLowerFacts, this.setupLowerFacts]) {
      facts.modulePath = extracted.modulePath;
    }
  }

  lowerComponentPlan(): SemanticLowerResult {
    const rootLifetime = this.allocateLifetime(null, 'component', 'immediate');
    this.retainSetupSegments(rootLifetime);
    const shape = this.owner.shape;
    if (shape === null) {
      return this.fail(
        'unsupported-syntax',
        this.owner.functionRange,
        'A component render owner requires a component shape.'
      );
    }
    this.classifySetupBindings(shape.setup);
    this.classifyFunctionBindings();
    const setup = this.lowerSetup(rootLifetime);
    if (this.failure !== null) {
      return this.failure;
    }
    this.hasCustomHook = this.hasCustomHookInSetup();

    const expression = findNodeByRange(this.owner.body, shape.returnExpression);
    if (expression === null) {
      return this.fail(
        'unsupported-syntax',
        shape.returnExpression,
        'The component return expression could not be located in the normalized AST.'
      );
    }
    const effects: RenderEffectPlan[] = [];
    const roots = this.lowerExpression(expression, { lifetimeId: rootLifetime, effects });
    this.lowerQrlRenderFunctions();
    this.validateCompilerHookScopes();
    if (this.failure !== null) {
      return this.failure;
    }
    const inlined = inlineSingleUseRenderValues({ roots, effects }, setup, this.renderFunctions);
    const render = inlined.render;
    const finalSetup = inlined.setup;
    const segments = this.createSegmentPlans();
    const referenceBindingIds = this.renderReferenceBindingIds(render, finalSetup);
    const captures = this.componentCaptures(shape, referenceBindingIds, segments);
    return {
      kind: 'success',
      plan: {
        shape,
        captures,
        setup: finalSetup,
        providesContext: this.providesContext(),
        needsId: this.nextUseId > 0,
        idBase: `q${sanitizeIdPart(this.owner.displayName)}-`,
        styleScope: this.styleScopes.length === 0 ? null : this.styleScopes.join(' '),
        hasCustomHook: this.hasCustomHook,
        runtimeStyleScopeName: this.hasCustomHook ? this.runtimeStyleScopeName() : null,
        render,
        referenceBindingIds,
        segments,
        lifetimes: this.lifetimes,
        qrlValuedBindings: [...this.extracted.qrlValuedBindings],
      },
    };
  }

  private componentCaptures(
    shape: ComponentShape,
    referenceBindingIds: readonly BindingId[],
    segments: readonly SegmentPlan[]
  ): ComponentPlan['captures'] {
    if (shape.bindingId !== null) {
      return [];
    }
    return unique([
      ...referenceBindingIds,
      ...segments.flatMap((segment) => segment.captures.map((capture) => capture.bindingId)),
    ]).flatMap((bindingId) => {
      const binding = this.binding(bindingId);
      if (
        binding === null ||
        binding.kind === 'module' ||
        binding.kind === 'import' ||
        binding.declarationRange === null ||
        rangeContains(this.owner.functionRange, binding.declarationRange)
      ) {
        return [];
      }
      return [{ bindingId, name: binding.name }];
    });
  }

  lowerModuleQrl(
    segment: Segment,
    callback: AstFunction
  ):
    | {
        readonly kind: 'success';
        readonly embeddedRenders: readonly RenderFunctionPlan[];
        readonly segments: readonly SegmentPlan[];
      }
    | SemanticLowerFailure {
    const rootLifetime = this.allocateLifetime(null, 'render-function', 'atomic-range');
    this.classifySetupBindings(this.owner.setup);
    this.classifyFunctionBindings();
    const embeddedRenders = this.createEmbeddedRenderFunctions(
      callback.body!,
      segment.id,
      rootLifetime,
      segment.id
    );
    this.validateCompilerHookScopes();
    if (this.failure !== null) {
      return this.failure;
    }
    return {
      kind: 'success',
      embeddedRenders,
      segments: this.createSegmentPlans(),
    };
  }

  lowerFunctionRender(callback: AstFunction):
    | {
        readonly kind: 'success';
        readonly plan: FunctionRenderPlan;
        readonly segments: readonly SegmentPlan[];
      }
    | SemanticLowerFailure {
    const functionRange = getRange(callback);
    const bodyRange = getRange(callback.body);
    if (functionRange === null || bodyRange === null) {
      return this.fail(
        'unsupported-syntax',
        this.owner.functionRange,
        'A JSX function has no source range.'
      );
    }
    const rootLifetime = this.allocateLifetime(null, 'render-function', 'atomic-range');
    this.classifySetupBindings(this.owner.setup);
    this.classifyFunctionBindings();
    const roots = this.directFunctionJsxRoots(callback);
    const renders = roots.map((root) =>
      this.createEmbeddedRenderFunction(root, null, rootLifetime)
    );
    this.validateCompilerHookScopes();
    if (this.failure !== null) {
      return this.failure;
    }
    return {
      kind: 'success',
      plan: {
        functionRange,
        bodyRange,
        bodyKind: callback.body?.type === 'BlockStatement' ? 'block' : 'expression',
        renders,
      },
      segments: this.createSegmentPlans(),
    };
  }

  private lowerExpression(
    expression: unknown,
    context: RenderContext,
    blockingSuspense = false
  ): RenderNodePlan[] {
    const node = unwrapExpression(expression);
    if (node === null || node === undefined || isEmptyBranchExpression(node)) {
      return [];
    }
    const range = getRange(node);
    if (range === null) {
      return this.unsupported([0, 0], 'A render expression has no source range.');
    }
    if (this.isPropsChildren(node)) {
      return [this.createSlot(range, '', null, context.lifetimeId)];
    }
    const sourceText = this.lowerSourceText(node, range, context);
    if (sourceText !== null) {
      return sourceText;
    }
    switch (node.type) {
      case 'JSXElement':
        return this.lowerElement(node, context, blockingSuspense);
      case 'JSXFragment':
        return this.lowerChildren(node.children, context, blockingSuspense);
      case 'Literal':
        return this.lowerLiteral(node, range);
      case 'ConditionalExpression':
      case 'LogicalExpression': {
        const branch = getJsxBranchExpression(node);
        if (branch !== null) {
          const condition = getStaticBranchCondition(branch.condition);
          if (condition !== null) {
            return this.lowerExpression(
              condition ? branch.then : branch.else,
              context,
              blockingSuspense
            );
          }
          const plan = this.lowerBranch(node, branch, context.lifetimeId, blockingSuspense);
          return plan === null ? [] : [plan];
        }
        return [this.createDynamicValue(node, range, context)];
      }
      case 'CallExpression': {
        const collection = this.getMapCandidate(node);
        if (collection !== null) {
          const plan = this.lowerCollection(collection, context.lifetimeId, blockingSuspense);
          return plan === null ? [] : [plan];
        }
        const element = this.getJsxCallCandidate(node);
        if (element !== null) {
          return this.lowerElement(element, context, blockingSuspense);
        }
        return [this.createDynamicValue(node, range, context)];
      }
      case 'JSXEmptyExpression':
        return [];
      default:
        return [this.createDynamicValue(node, range, context)];
    }
  }

  private lowerElement(
    node: JSXElement,
    context: RenderContext,
    blockingSuspense: boolean
  ): RenderNodePlan[] {
    const range = getRange(node);
    const tagRange = getRange(node.openingElement.name);
    if (range !== null && this.isSuspense(node.openingElement.name)) {
      const suspense = this.lowerSuspense(node, range, context, blockingSuspense);
      return suspense === null ? [] : [suspense];
    }
    const tag = getJsxName(node.openingElement.name);
    if (range === null || tagRange === null || tag === null) {
      return this.unsupported(
        range ?? tagRange ?? [0, 0],
        'Namespaced and member-expression JSX tags are not supported by the compiler.'
      );
    }
    const bindingId = this.bindingIdAt(tagRange);
    if (this.isSlotBinding(bindingId)) {
      const name = readStaticAttribute(node, 'name') ?? '';
      const children = node.children.filter((child) => !isEmptyChild(child));
      const lifetimeId = this.allocateLifetime(context.lifetimeId, 'slot', 'atomic-range');
      const segment = this.findSegment('slotRender', range);
      const fallback =
        children.length === 0
          ? null
          : this.createChildrenRenderFunction('slot', range, children, segment, lifetimeId);
      return [
        {
          kind: 'slot',
          range,
          lifetimeId,
          name,
          fallback,
        },
      ];
    }
    if (!isNativeTag(tag)) {
      return [
        this.lowerComponent(
          node,
          range,
          tagRange,
          bindingId,
          context,
          blockingSuspense,
          this.isUnresolvedTagBinding(bindingId)
        ),
      ];
    }
    const propsEffect = this.createElementPropsEffect(node, range, context);
    const props = this.lowerProps(node, range, context, 'element', propsEffect);
    const element: ElementPlan = {
      kind: 'element',
      tag,
      range,
      props,
      propsEffect,
      children: this.lowerChildren(
        node.children,
        context,
        blockingSuspense || PARSER_SENSITIVE_ELEMENTS.has(tag)
      ),
    };
    return [element];
  }

  private lowerSuspense(
    node: JSXElement,
    range: SourceRange,
    context: RenderContext,
    blocking: boolean
  ): SuspensePlan | null {
    if (
      node.openingElement.attributes.some((attribute) => attribute.type === 'JSXSpreadAttribute')
    ) {
      this.unsupported(range, 'Suspense does not support spread props.');
      return null;
    }
    const lifetimeId = this.allocateLifetime(context.lifetimeId, 'suspense', 'atomic-range');
    const segment = this.findSegment('suspenseRender', range);
    if (segment === null) {
      this.unsupported(range, 'Suspense content requires an extracted render segment.');
      return null;
    }
    const content = this.createChildrenRenderFunction(
      'suspense',
      range,
      node.children,
      segment,
      lifetimeId,
      blocking
    );
    const fallbackExpression = readAttributeExpression(node, 'fallback$');
    const fallback =
      fallbackExpression === null ? null : this.createQrlValue(fallbackExpression, lifetimeId);
    const delayExpression = readAttributeExpression(node, 'delay');
    return {
      kind: 'suspense',
      range,
      lifetimeId,
      content,
      fallback,
      delay:
        delayExpression === null
          ? null
          : this.createValue(delayExpression, lifetimeId, false, false, false, true),
      blocking,
    };
  }

  private createQrlValue(expression: AstNode, lifetimeId: LifetimeId): ValuePlan {
    if (isFunctionLike(expression)) {
      const range = getRange(expression);
      const segment =
        range === null
          ? null
          : (this.extracted.segments.find(
              (candidate) => candidate.kind === 'qrl' && sameRange(candidate.functionRange, range)
            ) ?? null);
      if (segment !== null) {
        return {
          kind: 'segment',
          expression: range!,
          segment: this.referenceSegment(segment, lifetimeId),
        };
      }
    }
    return this.createValue(expression, lifetimeId, false, false, false, true);
  }

  private lowerComponent(
    node: JSXElement,
    range: SourceRange,
    tagRange: SourceRange,
    bindingId: BindingId | null,
    context: RenderContext,
    blockingSuspense: boolean,
    unresolvedTag = false
  ): ComponentNodePlan {
    const lifetimeId = this.allocateLifetime(context.lifetimeId, 'component-call', 'atomic-range');
    const props = this.lowerProps(
      node,
      range,
      { lifetimeId, effects: context.effects },
      'component'
    );
    const propsSource = this.createComponentPropsSource(node, lifetimeId);
    const slots: ComponentProjectionPlan[] = [];
    for (const child of node.children) {
      if (isEmptyChild(child)) {
        continue;
      }
      const childRange = getRange(child);
      if (childRange === null) {
        this.unsupported(range, 'A component projection has no source range.');
        continue;
      }
      const projectionLifetime = this.allocateLifetime(lifetimeId, 'slot', 'atomic-range');
      const segment = this.findSegment('slotRender', childRange);
      slots.push({
        name: getProjectionName(child) ?? '',
        range: childRange,
        lifetimeId: projectionLifetime,
        render: this.createChildrenRenderFunction(
          'slot',
          childRange,
          [child],
          segment,
          projectionLifetime,
          blockingSuspense
        ),
      });
    }
    return {
      kind: 'component',
      range,
      tagRange,
      bindingId,
      unresolvedTag,
      needsId: false,
      blockingSuspense,
      lifetimeId,
      props,
      propsSource,
      slots,
    };
  }

  private createComponentPropsSource(
    node: JSXElement,
    lifetimeId: LifetimeId
  ): SegmentReferencePlan | null {
    const hasReactiveSpread = node.openingElement.attributes.some((attribute) => {
      if (
        attribute.type !== 'JSXSpreadAttribute' ||
        getExpandableObjectProperties(attribute.argument) !== null
      ) {
        return false;
      }
      const expression = unwrapExpression(attribute.argument);
      const range = getRange(expression);
      if (expression === null || expression === undefined || range === null) {
        return false;
      }
      const references = this.referencesIn(range);
      if (references.length === 0) {
        return true;
      }
      return this.hasLiveBinding(range);
    });
    if (!hasReactiveSpread) {
      return null;
    }
    const openingRange = getRange(node.openingElement);
    if (openingRange === null) {
      return null;
    }
    const segment = this.extracted.segments.find(
      (candidate) =>
        candidate.kind === 'expression' &&
        candidate.ctxName === 'componentProps' &&
        sameRange(candidate.bodyRange, openingRange)
    );
    return segment === undefined ? null : this.referenceSegment(segment, lifetimeId);
  }

  private createSlot(
    range: SourceRange,
    name: string,
    fallback: RenderFunctionPlan | null,
    parentLifetimeId: LifetimeId
  ): SlotPlan {
    return {
      kind: 'slot',
      range,
      lifetimeId: this.allocateLifetime(parentLifetimeId, 'slot', 'atomic-range'),
      name,
      fallback,
    };
  }

  private lowerChildren(
    children: readonly JSXChild[],
    context: RenderContext,
    blockingSuspense = false
  ): RenderNodePlan[] {
    const result: RenderNodePlan[] = [];
    for (const child of children) {
      switch (child.type) {
        case 'JSXText': {
          const value = normalizeJsxText(child.value);
          const range = getRange(child);
          if (value !== '' && range !== null) {
            result.push({ kind: 'static-text', value, range });
          }
          break;
        }
        case 'JSXExpressionContainer':
          result.push(...this.lowerExpression(child.expression, context, blockingSuspense));
          break;
        case 'JSXElement':
        case 'JSXFragment':
          result.push(...this.lowerExpression(child, context, blockingSuspense));
          break;
      }
    }
    return result;
  }

  private lowerLiteral(node: Extract<AstNode, { type: 'Literal' }>, range: SourceRange) {
    const value = getStaticExpressionValue(node);
    if (!value.supported || value.value === null || typeof value.value === 'boolean') {
      return [];
    }
    return [{ kind: 'static-text' as const, value: String(value.value), range }];
  }

  private lowerSourceText(
    expression: AstNode,
    range: SourceRange,
    context: RenderContext
  ): RenderNodePlan[] | null {
    const parts = getStaticSourceTextExpressionParts(expression, (_name, sourceRange) => {
      const bindingId = this.bindingIdAt(sourceRange);
      return bindingId !== null && this.sourceOutputs.has(bindingId);
    });
    if (parts === null || parts.length === 1) {
      return null;
    }
    const nodes: RenderNodePlan[] = [];
    for (const part of parts) {
      if (part.kind === 'text') {
        if (part.value !== '') {
          nodes.push({ kind: 'static-text', value: part.value, range });
        }
        continue;
      }
      const source = findNodeByRange(this.owner.body, part.expressionRange);
      if (source === null) {
        return null;
      }
      nodes.push(this.createDynamicValue(source, part.expressionRange, context, 'text'));
    }
    const replacedSegment = this.findSegment('expression', range);
    if (replacedSegment !== null) {
      this.usedSegments.delete(replacedSegment.id);
    }
    return nodes;
  }

  private lowerProps(
    node: JSXElement,
    target: SourceRange,
    context: RenderContext,
    targetKind: 'element' | 'component',
    groupedEffect: ElementPropsEffectPlan | null = null
  ): OrderedPropPlan[] {
    const props: OrderedPropPlan[] = [];
    const passiveEvents =
      targetKind === 'element' ? collectPassiveEventNames(node.openingElement.attributes) : null;
    for (const attribute of node.openingElement.attributes) {
      const range = getRange(attribute);
      if (range === null) {
        this.unsupported(target, 'A JSX property has no source range.');
        continue;
      }
      if (attribute.type === 'JSXSpreadAttribute') {
        const expandedProperties = getExpandableObjectProperties(attribute.argument);
        if (expandedProperties !== null) {
          for (const property of expandedProperties) {
            if (property.kind === 'ref') {
              if (targetKind === 'element') {
                const ref = this.createRefProp(property.value, range, context);
                if (ref !== null) {
                  props.push(ref);
                }
              } else {
                const lifetimeId = this.allocateLifetime(context.lifetimeId, 'effect', 'immediate');
                const value = this.createValue(
                  property.value,
                  lifetimeId,
                  false,
                  false,
                  false,
                  true
                );
                const effectId = this.pushEffect(context, {
                  kind: 'props',
                  lifetimeId,
                  target,
                  name: property.name,
                  value,
                });
                props.push({
                  kind: 'dynamic',
                  range,
                  name: property.name,
                  value,
                  lifetimeId,
                  effectId,
                });
              }
              continue;
            }
            if (property.kind === 'bind') {
              if (targetKind === 'element') {
                props.push(
                  this.createBindProp(
                    property.value,
                    range,
                    target,
                    context,
                    property.name === 'bind:checked' ? 'checked' : 'value'
                  )
                );
              } else {
                const lifetimeId = this.allocateLifetime(context.lifetimeId, 'effect', 'immediate');
                const value = this.createValue(
                  property.value,
                  lifetimeId,
                  false,
                  false,
                  false,
                  true
                );
                const effectId = this.pushEffect(context, {
                  kind: 'props',
                  lifetimeId,
                  target,
                  name: property.name,
                  value,
                });
                props.push({
                  kind: 'dynamic',
                  range,
                  name: property.name,
                  value,
                  lifetimeId,
                  effectId,
                });
              }
              continue;
            }
            const modifierName =
              targetKind === 'element'
                ? normalizeEventModifier(property.name, passiveEvents!)
                : property.name;
            if (modifierName === null) {
              continue;
            }
            props.push(
              modifierName === 'innerHTML' || modifierName === 'dangerouslySetInnerHTML'
                ? {
                    kind: 'inner-html',
                    range,
                    value: property.value,
                    lifetimeId: null,
                    effectId: null,
                  }
                : { kind: 'static', range, name: modifierName, value: property.value }
            );
          }
          continue;
        }
        const expression = unwrapExpression(attribute.argument);
        if (expression === null || expression === undefined || getRange(expression) === null) {
          this.unsupported(range, 'A JSX spread has no expression range.');
          continue;
        }
        const lifetimeId =
          groupedEffect?.lifetimeId ??
          this.allocateLifetime(context.lifetimeId, 'effect', 'immediate');
        const value = this.createValue(
          expression,
          lifetimeId,
          false,
          false,
          false,
          targetKind === 'component'
        );
        const effectId =
          groupedEffect?.effectId ??
          this.pushEffect(context, {
            kind: 'props',
            lifetimeId,
            target,
            name: null,
            value,
          });
        props.push({ kind: 'spread', range, value, lifetimeId, effectId });
        continue;
      }
      const name = getJsxAttributeName(attribute.name);
      if (name === null || name === 'key' || name === 'q:slot') {
        continue;
      }
      const bindName =
        targetKind === 'element' && groupedEffect === null
          ? name === 'bind:value'
            ? 'value'
            : name === 'bind:checked'
              ? 'checked'
              : null
          : null;
      if (targetKind === 'element' && groupedEffect === null && name === 'ref') {
        const expression = getJsxAttributeExpression(attribute.value);
        if (expression === null) {
          this.fail(
            'ref',
            range,
            'A native JSX ref must be a Signal, function, null, or undefined.'
          );
          continue;
        }
        const ref = this.createRefProp(expression, range, context);
        if (ref !== null) {
          props.push(ref);
        }
        continue;
      }
      if (bindName !== null) {
        const expression = getJsxAttributeExpression(attribute.value);
        if (expression === null || getRange(expression) === null) {
          this.unsupported(range, `JSX property "${name}" requires a signal expression.`);
          continue;
        }
        props.push(this.createBindProp(expression, range, target, context, bindName));
        continue;
      }
      const staticValue = getStaticJsxAttributeValue(attribute.value ?? null);
      const innerHtml = name === 'innerHTML' || name === 'dangerouslySetInnerHTML';
      if (staticValue !== undefined) {
        const modifierName =
          targetKind === 'element' ? normalizeEventModifier(name, passiveEvents!) : name;
        if (modifierName === null) {
          continue;
        }
        props.push(
          innerHtml
            ? {
                kind: 'inner-html',
                range,
                value: staticValue,
                lifetimeId: null,
                effectId: null,
              }
            : { kind: 'static', range, name: modifierName, value: staticValue }
        );
        continue;
      }
      const expression = getJsxAttributeExpression(attribute.value);
      if (expression === null) {
        this.unsupported(range, `JSX property "${name}" has an unsupported value.`);
        continue;
      }
      const lifetimeId =
        groupedEffect?.lifetimeId ??
        this.allocateLifetime(context.lifetimeId, 'effect', 'immediate');
      const event = isEventProp(name);
      const passive = event && passiveEvents !== null && isPassiveEvent(name, passiveEvents);
      if (event && targetKind === 'element') {
        for (const value of this.createEventValues(expression, lifetimeId)) {
          const effectId =
            groupedEffect?.effectId ??
            this.pushEffect(context, {
              kind: 'event',
              lifetimeId,
              target,
              name,
              value,
            });
          props.push({ kind: 'event', range, name, passive, value, lifetimeId, effectId });
        }
        continue;
      }
      // A computed prop over a live binding only survives resume as its own segment; everything
      // else a component receives stays an inline expression.
      const expressionRange = getRange(expression);
      const computedProp =
        targetKind === 'component' &&
        isComputedComponentProp(attribute) &&
        expressionRange !== null &&
        this.hasLiveBinding(expressionRange);
      const value = this.createValue(
        expression,
        lifetimeId,
        event,
        !event && !innerHtml,
        false,
        targetKind === 'component' && !event && !computedProp
      );
      if (innerHtml) {
        const effectId =
          groupedEffect?.effectId ??
          this.pushEffect(context, {
            kind: 'props',
            lifetimeId,
            target,
            name,
            value,
          });
        props.push({ kind: 'inner-html', range, value, lifetimeId, effectId });
      } else if (event) {
        const effectId =
          groupedEffect?.effectId ??
          this.pushEffect(context, {
            kind: 'event',
            lifetimeId,
            target,
            name,
            value,
          });
        props.push({ kind: 'event', range, name, passive, value, lifetimeId, effectId });
      } else {
        const effectId =
          groupedEffect?.effectId ??
          this.pushEffect(
            context,
            targetKind === 'component'
              ? { kind: 'props', lifetimeId, target, name, value }
              : { kind: 'attribute', lifetimeId, target, name, value }
          );
        props.push({ kind: 'dynamic', range, name, value, lifetimeId, effectId });
      }
    }
    if (groupedEffect !== null || props.some((prop) => prop.kind === 'spread')) {
      return props;
    }
    const last = new Map<string, number>();
    for (let index = 0; index < props.length; index++) {
      last.set(propKey(props[index]), index);
    }
    const normalized: OrderedPropPlan[] = [];
    props.forEach((prop, index) => {
      const winningIndex = last.get(propKey(prop));
      const winningProp = winningIndex === undefined ? undefined : props[winningIndex];
      const wins = winningIndex === index;
      const sharesEventSource =
        prop.kind === 'event' &&
        winningProp?.kind === 'event' &&
        sameRange(prop.range, winningProp.range);
      if (prop.kind === 'bind') {
        normalized.push({ ...prop, effectId: wins ? prop.effectId : null });
      } else if (wins || sharesEventSource) {
        normalized.push(prop);
      }
    });
    if (
      normalized.length !== props.length ||
      normalized.some((prop) => prop.kind === 'bind' && prop.effectId === null)
    ) {
      const keptEffects = new Set(
        normalized.flatMap((prop) =>
          'effectId' in prop && prop.effectId !== null ? [prop.effectId] : []
        )
      );
      const discardedEffects = new Set(
        props.flatMap((prop) =>
          'effectId' in prop && prop.effectId !== null && !keptEffects.has(prop.effectId)
            ? [prop.effectId]
            : []
        )
      );
      for (let index = context.effects.length - 1; index >= 0; index--) {
        if (discardedEffects.has(context.effects[index].id)) {
          context.effects.splice(index, 1);
        }
      }
    }
    return normalized.filter((prop) => !(prop.kind === 'static' && prop.name === 'ref'));
  }

  private createBindProp(
    expression: AstNode,
    range: SourceRange,
    target: SourceRange,
    context: RenderContext,
    name: 'value' | 'checked'
  ): Extract<OrderedPropPlan, { kind: 'bind' }> {
    const signal = getRange(expression)!;
    const lifetimeId = this.allocateLifetime(context.lifetimeId, 'effect', 'immediate');
    const value: ValuePlan = {
      kind: 'source',
      expression: signal,
      source: signal,
      referenceBindingIds: this.referencesIn(signal),
      ...this.valueIr(expression),
    };
    const effectId = this.pushEffect(context, {
      kind: 'attribute',
      lifetimeId,
      target,
      name,
      value,
    });
    return { kind: 'bind', range, name, signal, value, lifetimeId, effectId };
  }

  private createRefProp(
    expression: AstNode,
    range: SourceRange,
    context: RenderContext
  ):
    | Extract<OrderedPropPlan, { kind: 'ref' }>
    | Extract<OrderedPropPlan, { kind: 'static' }>
    | null {
    const bindingId =
      expression.type === 'Identifier' ? this.bindingIdAt(getRange(expression)) : null;
    if (expression.type === 'Identifier' && expression.name === 'undefined' && bindingId === null) {
      return { kind: 'static', range, name: 'ref', value: null };
    }
    const staticValue = getStaticExpressionValue(expression);
    if (staticValue.supported) {
      if (staticValue.value === null) {
        return { kind: 'static', range, name: 'ref', value: null };
      }
      this.fail('ref', range, 'A native JSX ref must be a Signal, function, null, or undefined.');
      return null;
    }
    const mode = isFunctionLike(expression)
      ? 'function'
      : bindingId !== null && this.signalBindings.has(bindingId)
        ? 'signal'
        : bindingId !== null && this.functionBindings.has(bindingId)
          ? 'function'
          : 'unknown';
    return {
      kind: 'ref',
      range,
      value: this.createValue(expression, context.lifetimeId, false, false, false, true),
      mode,
    };
  }

  private createElementPropsEffect(
    node: JSXElement,
    target: SourceRange,
    context: RenderContext
  ): ElementPropsEffectPlan | null {
    const openingRange = getRange(node.openingElement);
    if (openingRange === null) {
      return null;
    }
    const segment = this.extracted.segments.find(
      (candidate) =>
        candidate.kind === 'expression' &&
        candidate.ctxName === 'props' &&
        sameRange(candidate.bodyRange, openingRange)
    );
    if (segment === undefined || segment.propsParts?.length === 0) {
      return null;
    }
    const lifetimeId = this.allocateLifetime(context.lifetimeId, 'effect', 'immediate');
    const reference = this.referenceSegment(segment, lifetimeId);
    const effectId = this.pushEffect(context, {
      kind: 'props',
      lifetimeId,
      target,
      name: null,
      value: { kind: 'segment', expression: openingRange, segment: reference },
    });
    return { lifetimeId, effectId, segment: reference };
  }

  private createDynamicValue(
    expression: AstNode,
    range: SourceRange,
    context: RenderContext,
    forcedOutput?: DynamicOutputKind
  ): DynamicValuePlan {
    const lifetimeId = this.allocateLifetime(context.lifetimeId, 'dynamic-value', 'atomic-range');
    const output = forcedOutput ?? this.classifyDynamicOutput(expression);
    const embeddedRoots = this.embeddedJsxRoots(expression);
    const bindingId = expression.type === 'Identifier' ? this.bindingIdAt(range) : null;
    if (
      output === 'content' &&
      this.styleScopes.length > 0 &&
      (bindingId === null || !this.localRenderValues.has(bindingId))
    ) {
      this.fail(
        'scoped-style-content',
        range,
        'Opaque structural content cannot be scoped because its authored JSX is not visible to the compiler.'
      );
    }
    const initialEmbedded =
      embeddedRoots.length > 0 && this.isInitialEmbeddedExpression(range, embeddedRoots);
    const inlineEmbeddedRenders = initialEmbedded
      ? embeddedRoots.map((root) => this.createEmbeddedRenderFunction(root, null, lifetimeId))
      : [];
    const value: ValuePlan = initialEmbedded
      ? {
          kind: 'expression',
          expression: range,
          referenceBindingIds: this.referencesIn(range),
          initialOnly: true,
          compilerString: false,
          boundaries: this.referenceInlineBoundaries(range, lifetimeId),
          embeddedRenders: inlineEmbeddedRenders,
          ...this.valueIr(expression),
        }
      : this.createValue(
          expression,
          lifetimeId,
          false,
          output === 'text',
          true,
          false,
          embeddedRoots.length > 0
        );
    if (embeddedRoots.length > 0 && !initialEmbedded) {
      if (value.kind !== 'segment') {
        this.unsupported(range, 'Embedded JSX requires a source-preserving value segment.');
      } else {
        this.attachEmbeddedRenders(
          value.segment.segmentId,
          embeddedRoots,
          lifetimeId,
          'ambient',
          this.isInitialEmbeddedExpression(range, embeddedRoots)
        );
      }
    }
    const effectId = this.pushEffect(context, {
      kind: output,
      lifetimeId,
      range,
      value,
    });
    return { kind: 'dynamic-value', output, range, lifetimeId, effectId, value };
  }

  private createEventValues(expression: AstNode, lifetimeId: LifetimeId): ValuePlan[] {
    const range = getRange(expression);
    if (range !== null && this.findSegment('expression', range) !== null) {
      return [this.createValue(expression, lifetimeId, true)];
    }
    const value = unwrapExpression(expression);
    if (
      value?.type !== 'ArrayExpression' ||
      value.elements.some((element) => element?.type === 'SpreadElement')
    ) {
      return [this.createValue(expression, lifetimeId, true)];
    }
    return value.elements.flatMap((element) => {
      const child = unwrapExpression(element);
      return child === null || child === undefined ? [] : this.createEventValues(child, lifetimeId);
    });
  }

  private createValue(
    expression: AstNode,
    lifetimeId: LifetimeId,
    event: boolean,
    allowSource = false,
    allowRenderValue = false,
    inlineExpression = false,
    forceSegment = false
  ): ValuePlan {
    const range = getRange(expression)!;
    const bindingId = expression.type === 'Identifier' ? this.bindingIdAt(range) : null;
    if (bindingId !== null && this.localRenderValues.has(bindingId)) {
      if (allowRenderValue) {
        return { kind: 'render-value', expression: range, bindingId };
      }
      this.unsupported(range, 'A local JSX value must be used directly as a render child.');
    }
    if (
      bindingId === null &&
      this.referencesIn(range).some((id) => this.localRenderValues.has(id))
    ) {
      this.unsupported(range, 'A local JSX value must be used directly as a render child.');
    }
    const references = this.referencesIn(range);
    if (
      !event &&
      !forceSegment &&
      references.length > 0 &&
      references.every((id) => this.initialOnlyBindings.has(id)) &&
      !this.hasInlineBoundary(range)
    ) {
      return {
        kind: 'expression',
        expression: range,
        referenceBindingIds: references,
        initialOnly: true,
        compilerString: bindingId !== null && this.compilerStringBindings.has(bindingId),
        boundaries: [],
        embeddedRenders: [],
        ...this.valueIr(expression),
      };
    }
    const source = !forceSegment && allowSource ? this.directQwikSourceRange(expression) : null;
    if (source !== null) {
      return {
        kind: 'source',
        expression: range,
        source,
        referenceBindingIds: this.referencesIn(range),
        ...this.valueIr(expression),
      };
    }
    if (!forceSegment && inlineExpression) {
      return {
        kind: 'expression',
        expression: range,
        referenceBindingIds: this.referencesIn(range),
        initialOnly: false,
        compilerString: false,
        boundaries: this.referenceInlineBoundaries(range, lifetimeId),
        embeddedRenders: [],
        ...this.valueIr(expression),
      };
    }
    const functionRange = event && isFunctionLike(expression) ? getRange(expression) : null;
    const segment =
      functionRange === null
        ? this.findSegment('expression', range)
        : (this.extracted.segments.find(
            // any `*$` prop function is a QRL boundary, event-named or not
            (candidate) =>
              (candidate.kind === 'event' ||
                (candidate.kind === 'qrl' && candidate.payload === 'function')) &&
              sameRange(candidate.functionRange, range)
          ) ?? null);
    if (segment !== null) {
      return {
        kind: 'segment',
        expression: range,
        segment: this.referenceSegment(segment, lifetimeId),
        // event functions have no value IR; non-function handlers (props.onClick$) do
        ...(functionRange !== null ? {} : this.valueIr(expression)),
      };
    }
    if (allowRenderValue) {
      return {
        kind: 'segment',
        expression: range,
        segment: this.createSyntheticValueSegment(expression, lifetimeId),
        ...this.valueIr(expression),
      };
    }
    return {
      kind: 'expression',
      expression: range,
      referenceBindingIds: references,
      initialOnly: false,
      compilerString: false,
      boundaries: event ? this.referenceInlineBoundaries(range, lifetimeId, true) : [],
      embeddedRenders: [],
      ...this.valueIr(expression),
    };
  }

  /** Local bindings proven to hold a component, filled while setup lowers. */
  private readonly localComponentBindings = new Set<BindingId>();

  private readonly exprLowerFacts: ExprLowerFacts = {
    bindingIdAt: (range) => this.bindingIdAt(range),
    isSourceBinding: (binding) => this.sourceOutputs.has(binding),
    isFunctionBinding: (binding) => this.functionBindings.has(binding),
    defIndex: (binding) => {
      const index = this.extracted.moduleDefs?.findIndex((def) => def.binding === binding) ?? -1;
      return index < 0 ? null : index;
    },
    importOf: (binding) => this.binding(binding)?.import ?? null,
    findFnArgSegmentId: (range) =>
      range === null
        ? null
        : (this.extracted.segments.find(
            (segment) =>
              segment.kind === 'pluginCallback' && sameRange(segment.functionRange, range)
          )?.id ?? null),
    findImplicitQrlCall: (range) => {
      if (range === null) {
        return null;
      }
      const segment = this.extracted.segments.find(
        (candidate) =>
          candidate.kind === 'qrl' &&
          candidate.qrl?.kind === 'implicit' &&
          sameRange(candidate.range, range)
      );
      const boundary = segment?.qrl;
      // local dollar exports have no addressable module — fail closed
      if (segment === undefined || boundary?.kind !== 'implicit' || boundary.source === null) {
        return null;
      }
      return { segment: segment.id, source: boundary.source, qrlName: `${boundary.baseName}Qrl` };
    },
  };

  /** Render-position values may carry render-arg placeholders; plan emission resolves them. */
  private readonly renderValueLowerFacts: ExprLowerFacts = {
    ...this.exprLowerFacts,
    allowRenderArgs: true,
  };

  private readonly setupLowerFacts: SetupLowerFacts = {
    ...this.exprLowerFacts,
    isHook: (callee, hook) => this.isSparkHook(callee, hook) || this.isQwikHook(callee, hook),
    findQrlSegmentId: (range) =>
      range === null
        ? null
        : (this.extracted.segments.find((segment) => sameRange(segment.functionRange, range))?.id ??
          null),
  };

  private valueIr(expression: AstNode): { ir?: ValueIR } {
    const ir = lowerValueIr(expression, this.renderValueLowerFacts);
    reportValueIrSite(ir !== null);
    return ir === null ? {} : { ir };
  }

  private namedValueIr<K extends string>(key: K, expression: AstNode): { [P in K]?: ValueIR } {
    const ir = lowerValueIr(expression, this.exprLowerFacts);
    reportValueIrSite(ir !== null);
    return (ir === null ? {} : { [key]: ir }) as { [P in K]?: ValueIR };
  }

  private setupOpAt(range: SourceRange): { op?: SetupOp } {
    const statement = findNodeByRange(this.owner.body, range);
    if (statement === null) {
      return {};
    }
    const op = lowerSetupOp(statement, this.setupLowerFacts);
    reportSetupOpSite(op !== null);
    return op === null ? {} : { op };
  }

  private attachEmbeddedRenders(
    segmentId: string,
    roots: readonly AstNode[],
    parentLifetimeId: LifetimeId,
    context: Exclude<SegmentPlan['embeddedRenderContext'], null>,
    initialOnly: boolean
  ): void {
    const plans = roots.map((root) =>
      this.createEmbeddedRenderFunction(root, segmentId, parentLifetimeId)
    );
    const existing = this.embeddedRenders.get(segmentId) ?? [];
    this.embeddedRenders.set(segmentId, [...existing, ...plans]);
    this.embeddedRenderContexts.set(segmentId, context);
    if (initialOnly) {
      this.initialOnlyEmbeddedRenders.add(segmentId);
    }
  }

  private isInitialEmbeddedExpression(range: SourceRange, roots: readonly AstNode[]): boolean {
    const rootRanges = roots.flatMap((root) => {
      const rootRange = getRange(root);
      return rootRange === null ? [] : [rootRange];
    });
    const controllingBindings = unique(
      this.analysis.references.flatMap((reference) => {
        if (
          reference.bindingId === null ||
          !rangeContains(range, reference.range) ||
          rootRanges.some((rootRange) => rangeContains(rootRange, reference.range))
        ) {
          return [];
        }
        return [reference.bindingId];
      })
    );
    return (
      controllingBindings.length > 0 &&
      controllingBindings.every((bindingId) => this.isStableRenderBinding(bindingId))
    );
  }

  private createEmbeddedRenderFunctions(
    expression: AstNode,
    segmentId: string,
    parentLifetimeId: LifetimeId,
    owningSegmentId: string | null = null
  ): RenderFunctionPlan[] {
    return this.embeddedJsxRoots(expression, owningSegmentId).map((root) =>
      this.createEmbeddedRenderFunction(root, segmentId, parentLifetimeId)
    );
  }

  private createEmbeddedRenderFunction(
    expression: AstNode,
    segmentId: string | null,
    parentLifetimeId: LifetimeId
  ): RenderFunctionPlan {
    const range = getRange(expression)!;
    const lifetimeId = this.allocateLifetime(parentLifetimeId, 'render-function', 'atomic-range');
    const lower = () => {
      const effects: RenderEffectPlan[] = [];
      return {
        roots: this.lowerExpression(expression, { lifetimeId, effects }),
        effects,
      } satisfies RenderPlan;
    };
    const render = segmentId === null ? lower() : this.withRenderSegment(segmentId, lower);
    const lifecycleSegmentIds = this.lifecycleSegmentsIn(range);
    const async = containsAwait(expression);
    return {
      kind: 'embedded-jsx',
      collectionSourceKind: null,
      range,
      segmentId: null,
      lifetimeId,
      async,
      pure: isPureRenderFunction(render, [], async, lifecycleSegmentIds, false),
      setup: [],
      parameterBindingIds: [],
      referenceBindingIds: this.renderReferenceBindingIds(render, []),
      render,
      lifecycleSegmentIds,
      needsId: false,
      styleScope: this.styleScopes.length === 0 ? null : this.styleScopes.join(' '),
      runtimeStyleScope: this.hasCustomHook,
      runtimeStyleScopeName: this.hasCustomHook ? this.runtimeStyleScopeName() : null,
    };
  }

  private embeddedJsxRoots(expression: AstNode, owningSegmentId: string | null = null): AstNode[] {
    const range = getRange(expression);
    if (range === null) {
      return [];
    }
    const skippedRanges = this.extracted.segments.flatMap((segment) =>
      segment.id !== owningSegmentId &&
      segment.qrl !== null &&
      rangeContains(range, segment.functionRange)
        ? [segment.functionRange]
        : []
    );
    return findMaximalJsxRoots(expression, skippedRanges);
  }

  private directFunctionJsxRoots(callback: AstFunction): AstNode[] {
    const functionRange = getRange(callback);
    if (functionRange === null || callback.body === null) {
      return [];
    }
    const skippedRanges = this.extracted.segments.flatMap((segment) =>
      rangeContains(functionRange, segment.functionRange) ? [segment.functionRange] : []
    );
    return findMaximalJsxRoots(callback.body, skippedRanges, true);
  }

  private lowerBranch(
    expression: AstNode,
    branch: NonNullable<ReturnType<typeof getJsxBranchExpression>>,
    parentLifetimeId: LifetimeId,
    blockingSuspense: boolean
  ): BranchPlan | null {
    const range = getRange(expression);
    const conditionRange = getRange(branch.condition);
    const thenRange = getRange(branch.then);
    const elseRange = branch.else === null ? null : getRange(branch.else);
    if (
      range === null ||
      conditionRange === null ||
      thenRange === null ||
      (branch.else !== null && elseRange === null)
    ) {
      this.unsupported(range ?? [0, 0], 'A branch expression has an incomplete source range.');
      return null;
    }
    const condition = this.findSegment('branchCondition', conditionRange);
    const thenSegment = this.findSegment('branchRender', thenRange);
    const elseSegment = elseRange === null ? null : this.findSegment('branchRender', elseRange);
    if (
      condition === null ||
      thenSegment === null ||
      (elseRange !== null && elseSegment === null)
    ) {
      this.unsupported(range, 'A dynamic branch is missing one of its extracted render segments.');
      return null;
    }
    const lifetimeId = this.allocateLifetime(parentLifetimeId, 'branch', 'atomic-range');
    return {
      kind: 'branch',
      range,
      lifetimeId,
      condition: this.referenceSegment(condition, lifetimeId),
      ...this.namedValueIr('conditionIr', branch.condition),
      then: this.createExpressionRenderFunction(
        'branch',
        branch.then,
        thenSegment,
        lifetimeId,
        blockingSuspense
      ),
      else:
        branch.else === null || elseSegment === null
          ? null
          : this.createExpressionRenderFunction(
              'branch',
              branch.else,
              elseSegment,
              lifetimeId,
              blockingSuspense
            ),
    };
  }

  private lowerCollection(
    collection: MapCandidate,
    parentLifetimeId: LifetimeId,
    blockingSuspense: boolean
  ): CollectionPlan | null {
    const sourceRange = getRange(collection.source);
    if (sourceRange === null) {
      this.unsupported(collection.range, 'A collection source has no source range.');
      return null;
    }
    const lifetimeId = this.allocateLifetime(parentLifetimeId, 'collection', 'atomic-reconcile');
    const directSource = this.directQwikSourceRange(collection.source);
    const source =
      directSource !== null
        ? {
            kind: 'direct-reactive' as const,
            expression: sourceRange,
            source: directSource,
            // the signal-container read native engines iterate (tracked at render)
            ...this.namedValueIr(
              'ir',
              ((unwrapExpression(collection.source) as { object?: AstNode }).object ??
                collection.source) as AstNode
            ),
          }
        : this.isStaticCollectionSource(collection.source, sourceRange)
          ? {
              kind: 'direct-array' as const,
              expression: sourceRange,
              ...this.valueIr(collection.source),
            }
          : {
              kind: 'derived' as const,
              expression: sourceRange,
              segment: this.createSyntheticExpressionSegment(
                'collectionSource',
                'collection:source',
                null,
                collection.source,
                lifetimeId
              ),
              ...this.valueIr(collection.source),
            };
    if (
      source.kind !== 'direct-array' &&
      (collection.callback.async || containsAwait(collection.callback.body))
    ) {
      this.fail(
        'async-for',
        getRange(collection.callback) ?? collection.range,
        'Async row callbacks are not supported for reactive or derived JSX collections.'
      );
      return null;
    }
    const keyRange = collection.key === null ? null : getRange(collection.key);
    if (collection.key !== null && keyRange === null) {
      this.unsupported(collection.range, 'A collection key has no source range.');
      return null;
    }
    const keySegment =
      source.kind === 'direct-array' || keyRange === null
        ? null
        : this.findSegment('forKey', keyRange);
    const key =
      source.kind === 'direct-array' || collection.key === null || keyRange === null
        ? null
        : keySegment === null
          ? this.createSyntheticExpressionSegment(
              'forKey',
              'for:key',
              collection.callback,
              collection.key,
              lifetimeId
            )
          : this.referenceSegment(keySegment, lifetimeId);
    const rowSegment = this.findSegment('forRender', getRange(collection.row)!);
    const row = this.createCallbackRenderFunction(
      'collection-row',
      collection,
      rowSegment,
      lifetimeId,
      source.kind,
      blockingSuspense
    );
    const usesIndexSignal =
      source.kind !== 'direct-array' &&
      collection.indexBindingId !== null &&
      row.referenceBindingIds.includes(collection.indexBindingId);
    return {
      kind: 'collection',
      range: collection.range,
      lifetimeId,
      source,
      key,
      ...(key === null || collection.key === null
        ? {}
        : this.namedValueIr('keyIr', collection.key)),
      row,
      usesIndexSignal,
    };
  }

  private createCallbackRenderFunction(
    kind: 'collection-row',
    collection: MapCandidate,
    segment: Segment | null,
    parentLifetimeId: LifetimeId,
    collectionSourceKind: CollectionPlan['source']['kind'],
    blockingSuspense: boolean
  ): RenderFunctionPlan {
    const range = getRange(collection.callback) ?? collection.range;
    const lifetimeId = this.allocateLifetime(parentLifetimeId, 'render-function', 'atomic-range');
    this.classifySetupBindings(collection.setup);
    const parameterBindingIds = [collection.itemBindingId, collection.indexBindingId].filter(
      (id): id is BindingId => id !== null
    );
    const setup = collection.setup.map<SetupPlan>((setupRange) => {
      const useIds = this.collectUseIds(setupRange);
      return {
        kind: 'statement',
        range: setupRange,
        lifetimeId,
        referenceBindingIds: this.setupReferenceBindingIds(setupRange).filter(
          (id) => !this.isSparkHookBinding(id, QwikHooks.UseId)
        ),
        useIds,
        ...this.setupOpAt(setupRange),
      };
    });
    const segmentId = segment?.id ?? `semantic_collectionRender_${range[0]}_${range[1]}`;
    if (segment !== null) {
      this.referenceSegment(segment, lifetimeId);
    }
    const render = this.withInitialOnlyBinding(
      collectionSourceKind === 'direct-array' ? collection.indexBindingId : null,
      () =>
        this.withRenderSegment(segmentId, () => {
          const effects: RenderEffectPlan[] = [];
          return {
            roots: this.lowerExpression(collection.row, { lifetimeId, effects }, blockingSuspense),
            effects,
          } satisfies RenderPlan;
        })
    );
    const referenceBindingIds = this.renderReferenceBindingIds(render, setup);
    if (
      collectionSourceKind !== 'direct-array' &&
      collection.indexBindingId !== null &&
      referenceBindingIds.includes(collection.indexBindingId)
    ) {
      this.reactiveLoopBindings.add(collection.indexBindingId);
    }
    const async = collection.callback.async || containsAwait(collection.callback.body);
    const lifecycleSegmentIds = this.lifecycleSegmentsIn(range);
    const needsId = setup.some((item) => item.kind === 'statement' && item.useIds.length > 0);
    const plan: RenderFunctionPlan = {
      kind,
      collectionSourceKind,
      range,
      segmentId,
      lifetimeId,
      async,
      pure: isPureRenderFunction(render, setup, async, lifecycleSegmentIds, needsId),
      setup,
      parameterBindingIds,
      render,
      referenceBindingIds,
      lifecycleSegmentIds,
      needsId,
      styleScope: this.styleScopes.length === 0 ? null : this.styleScopes.join(' '),
      runtimeStyleScope: this.hasCustomHook,
      runtimeStyleScopeName: this.hasCustomHook ? this.runtimeStyleScopeName() : null,
    };
    this.renderFunctions.set(segmentId, plan);
    if (segment === null) {
      this.createSyntheticRenderSegment(
        'collectionRender',
        collection.callback,
        range,
        lifetimeId,
        parameterBindingIds
      );
      this.attachSyntheticRender(segmentId, plan);
    }
    return plan;
  }

  private createExpressionRenderFunction(
    kind: 'branch' | 'qrl',
    expression: AstNode,
    segment: Segment,
    parentLifetimeId: LifetimeId,
    blockingSuspense = false,
    setupRanges: readonly SourceRange[] = [],
    parameterBindingIds: readonly BindingId[] = []
  ): RenderFunctionPlan {
    const range = getRange(expression)!;
    const lifetimeId = this.allocateLifetime(parentLifetimeId, 'render-function', 'atomic-range');
    this.classifySetupBindings(setupRanges);
    const setup = setupRanges.map<SetupPlan>((setupRange) => ({
      kind: 'statement',
      range: setupRange,
      lifetimeId,
      referenceBindingIds: this.setupReferenceBindingIds(setupRange).filter(
        (id) => !this.isSparkHookBinding(id, QwikHooks.UseId)
      ),
      useIds: this.collectUseIds(setupRange),
      ...this.setupOpAt(setupRange),
    }));
    this.referenceSegment(segment, lifetimeId);
    const render = this.withRenderSegment(segment.id, () => {
      const effects: RenderEffectPlan[] = [];
      return {
        roots: this.lowerExpression(expression, { lifetimeId, effects }, blockingSuspense),
        effects,
      } satisfies RenderPlan;
    });
    const plan: RenderFunctionPlan = {
      kind,
      collectionSourceKind: null,
      range,
      segmentId: segment.id,
      lifetimeId,
      async: segment.async || segment.awaits.length > 0,
      pure: isPureRenderFunction(
        render,
        setup,
        segment.async || segment.awaits.length > 0,
        this.lifecycleSegmentsIn(segment.functionRange),
        setup.some((item) => item.kind === 'statement' && item.useIds.length > 0)
      ),
      setup,
      parameterBindingIds,
      render,
      referenceBindingIds: this.renderReferenceBindingIds(render, setup),
      lifecycleSegmentIds: this.lifecycleSegmentsIn(segment.functionRange),
      needsId: setup.some((item) => item.kind === 'statement' && item.useIds.length > 0),
      styleScope: this.styleScopes.length === 0 ? null : this.styleScopes.join(' '),
      runtimeStyleScope: this.hasCustomHook,
      runtimeStyleScopeName: this.hasCustomHook ? this.runtimeStyleScopeName() : null,
    };
    this.renderFunctions.set(segment.id, plan);
    return plan;
  }

  private lowerQrlRenderFunctions(): void {
    for (const segment of this.extracted.segments) {
      const lifetimeId = this.usedSegments.get(segment.id);
      if (
        lifetimeId === undefined ||
        segment.kind !== 'qrl' ||
        segment.payload !== 'function' ||
        this.renderFunctions.has(segment.id) ||
        (segment.qrl?.kind === 'implicit' && segment.qrl.role !== 'generic')
      ) {
        continue;
      }
      const callback = findNodeByRange(this.owner.body, segment.functionRange);
      if (callback === null || !isFunctionLike(callback)) {
        continue;
      }
      const returned = getCallbackReturn(callback);
      if (returned !== null && containsJsx(returned.row)) {
        this.createExpressionRenderFunction(
          'qrl',
          returned.row,
          segment,
          lifetimeId,
          false,
          returned.setup,
          this.parameterBindings(callback)
        );
      } else if (containsJsx(callback.body)) {
        const roots = this.embeddedJsxRoots(callback.body!, segment.id);
        this.attachEmbeddedRenders(
          segment.id,
          roots,
          lifetimeId,
          segment.qrl?.kind === 'implicit' ? 'trailing' : 'ambient',
          true
        );
      }
    }
  }

  private createChildrenRenderFunction(
    kind: 'slot' | 'suspense',
    range: SourceRange,
    children: readonly JSXChild[],
    segment: Segment | null,
    parentLifetimeId: LifetimeId,
    blockingSuspense = false
  ): RenderFunctionPlan {
    const lifetimeId = this.allocateLifetime(parentLifetimeId, 'render-function', 'atomic-range');
    const segmentId =
      segment?.id ??
      this.createSyntheticRenderSegment('slotRender', null, range, lifetimeId, []).segmentId;
    if (segment !== null) {
      this.referenceSegment(segment, lifetimeId);
    }
    const render = this.withRenderSegment(segmentId, () => {
      const effects: RenderEffectPlan[] = [];
      return {
        roots: this.lowerChildren(children, { lifetimeId, effects }, blockingSuspense),
        effects,
      } satisfies RenderPlan;
    });
    const plan: RenderFunctionPlan = {
      kind,
      collectionSourceKind: null,
      range,
      segmentId,
      lifetimeId,
      async: segment?.awaits.length ? true : false,
      pure: isPureRenderFunction(
        render,
        [],
        !!segment?.awaits.length,
        this.lifecycleSegmentsIn(range),
        false
      ),
      setup: [],
      parameterBindingIds: [],
      render,
      referenceBindingIds: this.renderReferenceBindingIds(render, []),
      lifecycleSegmentIds: this.lifecycleSegmentsIn(range),
      needsId: false,
      styleScope: this.styleScopes.length === 0 ? null : this.styleScopes.join(' '),
      runtimeStyleScope: this.hasCustomHook,
      runtimeStyleScopeName: this.hasCustomHook ? this.runtimeStyleScopeName() : null,
    };
    this.renderFunctions.set(segmentId, plan);
    if (segment === null) {
      this.attachSyntheticRender(segmentId, plan);
    }
    return plan;
  }

  private attachSyntheticRender(segmentId: string, render: RenderFunctionPlan): void {
    const index = this.syntheticSegments.findIndex((segment) => segment.id === segmentId);
    if (index !== -1) {
      const segment = this.syntheticSegments[index];
      this.syntheticSegments[index] = {
        ...segment,
        usedParameterBindingIds: usedParameterPrefix(
          segment.parameterBindingIds,
          render.referenceBindingIds
        ),
        render,
      };
    }
  }

  private withRenderSegment<T>(segmentId: string, lower: () => T): T {
    this.renderSegmentStack.push(segmentId);
    try {
      return lower();
    } finally {
      this.renderSegmentStack.pop();
    }
  }

  private createSyntheticExpressionSegment(
    kind: 'forKey' | 'collectionSource',
    ctxName: 'for:key' | 'collection:source',
    callback: AstFunction | null,
    expression: AstNode,
    lifetimeId: LifetimeId
  ): SegmentReferencePlan {
    const range = getRange(expression)!;
    const id = `semantic_${kind}_${range[0]}_${range[1]}`;
    const parameterBindingIds = callback === null ? [] : this.parameterBindings(callback);
    const plan = {
      ...this.createSyntheticSegment(
        id,
        kind,
        callback === null ? range : (getRange(callback) ?? range),
        range,
        lifetimeId,
        parameterBindingIds,
        null,
        containsAwait(expression)
      ),
      ctxName,
    };
    this.syntheticSegments.push(plan);
    return {
      segmentId: id,
      ...captureBindingIds(plan.captures),
    };
  }

  private createSyntheticValueSegment(
    expression: AstNode,
    lifetimeId: LifetimeId
  ): SegmentReferencePlan {
    const range = getRange(expression)!;
    const id = `semantic_expression_${range[0]}_${range[1]}`;
    for (const boundary of this.referenceInlineBoundaries(range, lifetimeId)) {
      this.syntheticSegmentParents.set(boundary.segmentId, id);
    }
    const plan = this.createSyntheticSegment(
      id,
      'expression',
      range,
      range,
      lifetimeId,
      [],
      null,
      containsAwait(expression)
    );
    this.syntheticSegments.push(plan);
    return {
      segmentId: id,
      ...captureBindingIds(plan.captures),
    };
  }

  private createSyntheticRenderSegment(
    kind: 'forRender' | 'suspenseRender' | 'slotRender' | 'collectionRender',
    callback: AstFunction | null,
    range: SourceRange,
    lifetimeId: LifetimeId,
    parameterBindingIds: readonly BindingId[]
  ): SegmentReferencePlan {
    const id = `semantic_${kind}_${range[0]}_${range[1]}`;
    const plan = this.createSyntheticSegment(
      id,
      kind,
      callback === null ? range : (getRange(callback) ?? range),
      range,
      lifetimeId,
      parameterBindingIds,
      null,
      callback?.async === true || containsAwait(callback?.body)
    );
    this.syntheticSegments.push(plan);
    return {
      segmentId: id,
      ...captureBindingIds(plan.captures),
    };
  }

  private createSyntheticSegment(
    id: string,
    kind: SegmentPlan['kind'],
    functionRange: SourceRange,
    range: SourceRange,
    lifetimeId: LifetimeId,
    parameterBindingIds: readonly BindingId[],
    render: RenderFunctionPlan | null,
    async: boolean,
    /** The segment function's own name binding — declared in-range but owned by the outer scope. */
    excludeBindingId: BindingId | null = null
  ): SegmentPlan {
    const references = this.analysis.references.filter((reference) =>
      rangeContains(functionRange, reference.range)
    );
    const parameterSet = new Set(parameterBindingIds);
    const localOwnerIds = new Set(
      this.analysis.bindings.flatMap((binding) =>
        binding.id !== excludeBindingId &&
        binding.declarationRange !== null &&
        rangeContains(functionRange, binding.declarationRange)
          ? [binding.ownerId]
          : []
      )
    );
    const referencedBindings = unique(
      references.flatMap((reference) =>
        reference.bindingId === null || parameterSet.has(reference.bindingId)
          ? []
          : [reference.bindingId]
      )
    );
    const captureBindings = referencedBindings.flatMap((bindingId) => {
      const binding = this.binding(bindingId);
      return binding === null ||
        binding.kind === 'import' ||
        binding.kind === 'module' ||
        localOwnerIds.has(binding.ownerId)
        ? []
        : [binding];
    });
    const moduleReferences = referencedBindings.flatMap((bindingId) => {
      const binding = this.binding(bindingId);
      return binding === null || (binding.kind !== 'import' && binding.kind !== 'module')
        ? []
        : [toModuleReference(binding)];
    });
    const paramRanges = parameterBindingIds.flatMap((bindingId) => {
      const range = this.binding(bindingId)?.declarationRange;
      return range === null || range === undefined ? [] : [range];
    });
    return {
      id,
      symbolName: createSegmentSymbolName(this.extracted.sourceIdentity, id, 'synthetic'),
      parentId: this.renderSegmentStack[this.renderSegmentStack.length - 1] ?? null,
      kind,
      ctxName: kind === 'collectionRender' ? 'collection:render' : kind,
      qrl: null,
      payload: 'value',
      range,
      functionRange,
      calleeRange: null,
      argumentRanges: [],
      paramRanges,
      parameterBindingIds,
      usedParameterBindingIds: usedParameterPrefix(
        parameterBindingIds,
        references.flatMap((reference) =>
          reference.bindingId === null ? [] : [reference.bindingId]
        )
      ),
      bodyRange: range,
      bodyKind: 'expression',
      propsParts: [],
      async,
      awaits: collectAwaitRanges(findNodeByRange(this.owner.body, range)),
      captures: captureBindings.map((binding) => ({
        bindingId: binding.id,
        name: binding.name,
        source: binding.kind === 'param' || binding.kind === 'loop' ? binding.kind : 'local',
        access: this.captureAccess(kind, binding.id),
      })),
      moduleReferences,
      references,
      visibleTaskStrategy: null,
      lifetimeId,
      render,
      embeddedRenders: [],
      embeddedRenderContext: null,
      initialOnly: false,
      componentParameter: this.owner.parameter,
      moduleStyle: null,
    };
  }

  private createSegmentPlans(): SegmentPlan[] {
    const plans = this.extracted.segments.flatMap((segment) => {
      const lifetimeId = this.usedSegments.get(segment.id);
      if (lifetimeId === undefined) {
        return [];
      }
      const render = this.renderFunctions.get(segment.id) ?? null;
      const plan = createExtractedSegmentPlan(segment, this.analysis, {
        lifetimeId,
        parentId:
          this.syntheticSegmentParents.get(segment.id) ??
          this.usedSegmentParentId(segment.parentId),
        render,
        componentParameter: this.owner.parameter,
        captureAccess: (kind, bindingId) => this.captureAccess(kind, bindingId),
      });
      return [this.withEmbeddedRenders(plan)];
    });
    return [
      ...plans,
      ...this.syntheticSegments.map((segment) => this.withEmbeddedRenders(segment)),
    ];
  }

  private withEmbeddedRenders(segment: SegmentPlan): SegmentPlan {
    const embeddedRenders = this.embeddedRenders.get(segment.id);
    if (embeddedRenders === undefined) {
      return segment;
    }
    return {
      ...segment,
      embeddedRenders,
      embeddedRenderContext: this.embeddedRenderContexts.get(segment.id) ?? 'ambient',
      initialOnly: segment.initialOnly || this.initialOnlyEmbeddedRenders.has(segment.id),
    };
  }

  private getMapCandidate(expression: Extract<AstNode, { type: 'CallExpression' }>) {
    const range = getRange(expression);
    const callee = unwrapExpression(expression.callee);
    if (
      range === null ||
      callee?.type !== 'MemberExpression' ||
      callee.computed ||
      getIdentifierName(callee.property) !== 'map'
    ) {
      return null;
    }
    const callback = unwrapExpression(expression.arguments[0]);
    if (!isFunctionLike(callback) || callback.params.length > 2) {
      return null;
    }
    const returned = getCallbackReturn(callback);
    if (returned === null) {
      return null;
    }
    const itemBindingId = this.patternBindingId(callback.params[0]);
    const indexBindingId = this.patternBindingId(callback.params[1]);
    if (callback.params[0] !== undefined && itemBindingId === null) {
      return null;
    }
    if (callback.params[1] !== undefined && indexBindingId === null) {
      return null;
    }
    return {
      range,
      source: callee.object,
      callback,
      row: returned.row,
      setup: returned.setup,
      key: getRowKey(returned.row),
      itemBindingId,
      indexBindingId,
    } satisfies MapCandidate;
  }

  private isPropsChildren(expression: AstNode): boolean {
    if (
      expression.type === 'MemberExpression' &&
      !expression.computed &&
      getIdentifierName(expression.property) === 'children'
    ) {
      const object = unwrapExpression(expression.object);
      const bindingId = this.bindingIdAt(getRange(object));
      return (
        object?.type === 'Identifier' &&
        bindingId !== null &&
        this.owner.parameter?.bindingIds.includes(bindingId) === true
      );
    }
    if (expression.type !== 'Identifier' || expression.name !== 'children') {
      return false;
    }
    const bindingId = this.bindingIdAt(getRange(expression));
    return bindingId !== null && this.owner.parameter?.bindingIds.includes(bindingId) === true;
  }

  private retainSetupSegments(lifetimeId: LifetimeId): void {
    for (const segment of this.extracted.segments) {
      if (
        segment.parentId === null &&
        !this.isStyleSegment(segment) &&
        this.owner.setup.some((range) => rangeContains(range, segment.range))
      ) {
        this.referenceSegment(segment, lifetimeId);
      }
    }
  }

  private isStyleSegment(segment: Segment): boolean {
    const binding = this.binding(segment.qrl?.markerBindingId ?? null);
    return (
      segment.qrl?.kind === 'implicit' &&
      binding?.import?.source === QWIK_IMPORT &&
      (binding.import.importedName === QwikHooks.UseStylesDollar ||
        binding.import.importedName === QwikHooks.UseStylesScopedDollar)
    );
  }

  private referenceSegment(segment: Segment, lifetimeId: LifetimeId): SegmentReferencePlan {
    const renderParent = this.renderSegmentStack[this.renderSegmentStack.length - 1];
    if (renderParent !== undefined && segment.id !== renderParent) {
      this.syntheticSegmentParents.set(segment.id, renderParent);
    }
    if (!this.usedSegments.has(segment.id)) {
      this.usedSegments.set(segment.id, lifetimeId);
      for (const child of this.extracted.segments) {
        if (child.parentId === segment.id) {
          this.referenceSegment(child, lifetimeId);
        }
      }
    }
    return {
      segmentId: segment.id,
      ...captureBindingIds(
        segment.captures.map((capture) => ({
          ...capture,
          access: this.captureAccess(segment.kind, capture.bindingId),
        }))
      ),
    };
  }

  private captureAccess(
    kind: SegmentPlan['kind'],
    bindingId: BindingId
  ): SegmentPlan['captures'][number]['access'] {
    if (
      kind !== 'event' &&
      kind !== 'qrl' &&
      this.owner.parameter?.kind === 'object' &&
      this.owner.parameter.bindingIds.includes(bindingId)
    ) {
      return 'component-prop';
    }
    return this.reactiveLoopBindings.has(bindingId) ? 'loop-value' : 'direct';
  }

  private usedSegmentParentId(parentId: string | null): string | null {
    let current = parentId;
    while (current !== null && !this.usedSegments.has(current)) {
      current = this.extracted.segments.find((segment) => segment.id === current)?.parentId ?? null;
    }
    return current;
  }

  private findSegment(kind: Segment['kind'], range: SourceRange): Segment | null {
    return (
      this.extracted.segments.find(
        (segment) => segment.kind === kind && sameRange(segment.bodyRange, range)
      ) ?? null
    );
  }

  private lifecycleSegmentsIn(range: SourceRange): string[] {
    return this.extracted.segments.flatMap((segment) =>
      LIFECYCLE_HOOKS.has(segment.ctxName) && rangeContains(range, segment.range)
        ? [segment.id]
        : []
    );
  }

  private parameterBindings(callback: AstFunction): BindingId[] {
    return callback.params.flatMap((parameter) => {
      const id = this.patternBindingId(parameter);
      return id === null ? [] : [id];
    });
  }

  private patternBindingId(pattern: unknown): BindingId | null {
    const node = unwrapExpression(pattern);
    return node?.type === 'Identifier' ? this.bindingIdAt(getRange(node)) : null;
  }

  /** True when the range reads a binding whose value can still change after setup. */
  private hasLiveBinding(range: SourceRange): boolean {
    return this.referencesIn(range).some((bindingId) => {
      const binding = this.binding(bindingId);
      return (
        binding === null ||
        (binding.kind !== 'import' &&
          binding.kind !== 'module' &&
          !this.initialOnlyBindings.has(bindingId))
      );
    });
  }

  private referencesIn(range: SourceRange): BindingId[] {
    return unique(
      this.analysis.references.flatMap((reference) =>
        reference.bindingId !== null && rangeContains(range, reference.range)
          ? [reference.bindingId]
          : []
      )
    );
  }

  private referenceInlineBoundaries(
    range: SourceRange,
    lifetimeId: LifetimeId,
    includeEvents = false
  ): SegmentReferencePlan[] {
    const candidates = this.extracted.segments.filter(
      (segment) =>
        (segment.qrl !== null || (includeEvents && segment.kind === 'event')) &&
        rangeContains(range, segment.range)
    );
    const candidateIds = new Set(candidates.map((segment) => segment.id));
    return candidates
      .filter((segment) => segment.parentId === null || !candidateIds.has(segment.parentId))
      .map((segment) => this.referenceSegment(segment, lifetimeId));
  }

  private hasInlineBoundary(range: SourceRange): boolean {
    return this.extracted.segments.some(
      (segment) => segment.qrl !== null && rangeContains(range, segment.range)
    );
  }

  private renderReferenceBindingIds(render: RenderPlan, setup: readonly SetupPlan[]): BindingId[] {
    const ids = new Set<BindingId>();
    const addValue = (value: ValuePlan): void => {
      if (value.kind === 'segment') {
        referenceBindingIds(value.segment).forEach((id) => ids.add(id));
      } else if (value.kind === 'render-value') {
        ids.add(value.bindingId);
      } else {
        value.referenceBindingIds.forEach((id) => ids.add(id));
        if (value.kind === 'expression') {
          value.boundaries.forEach((boundary) =>
            referenceBindingIds(boundary).forEach((id) => ids.add(id))
          );
          value.embeddedRenders.forEach((render) =>
            render.referenceBindingIds.forEach((id) => ids.add(id))
          );
        }
      }
    };
    const addProps = (props: readonly OrderedPropPlan[]): void => {
      for (const prop of props) {
        if (prop.kind !== 'static' && isValuePlan(prop.value)) {
          addValue(prop.value);
        }
      }
    };
    const addRenderFunction = (value: RenderFunctionPlan | null): void => {
      value?.referenceBindingIds.forEach((id) => ids.add(id));
    };
    const visit = (node: RenderNodePlan): void => {
      switch (node.kind) {
        case 'static-text':
          return;
        case 'dynamic-value':
          addValue(node.value);
          return;
        case 'element':
          addProps(node.props);
          if (node.propsEffect !== null) {
            referenceBindingIds(node.propsEffect.segment).forEach((id) => ids.add(id));
          }
          node.children.forEach(visit);
          return;
        case 'component':
          if (node.bindingId !== null) {
            ids.add(node.bindingId);
          }
          addProps(node.props);
          node.slots.forEach((slot) => addRenderFunction(slot.render));
          return;
        case 'branch':
          referenceBindingIds(node.condition).forEach((id) => ids.add(id));
          addRenderFunction(node.then);
          addRenderFunction(node.else);
          return;
        case 'suspense':
          addRenderFunction(node.content);
          if (node.fallback !== null) {
            addValue(node.fallback);
          }
          if (node.delay !== null) {
            addValue(node.delay);
          }
          return;
        case 'slot':
          addRenderFunction(node.fallback);
          return;
        case 'collection':
          this.referencesIn(node.source.expression).forEach((id) => ids.add(id));
          if (node.source.kind === 'derived') {
            referenceBindingIds(node.source.segment).forEach((id) => ids.add(id));
          }
          if (node.key !== null) {
            referenceBindingIds(node.key).forEach((id) => ids.add(id));
          }
          addRenderFunction(node.row);
          return;
      }
    };
    setup.forEach((item) => {
      if (item.kind === 'statement' || item.kind === 'style') {
        item.referenceBindingIds.forEach((id) => ids.add(id));
      } else {
        ids.add(item.bindingId);
        addRenderFunction(item.render);
      }
    });
    render.roots.forEach(visit);
    render.effects.forEach((effect) => addValue(effect.value));
    return [...ids];
  }

  private bindingIdAt(range: SourceRange | null): BindingId | null {
    if (range === null) {
      return null;
    }
    return (
      this.analysis.references.find((reference) => sameRange(reference.range, range))?.bindingId ??
      this.analysis.bindings.find(
        (binding) => binding.declarationRange !== null && sameRange(binding.declarationRange, range)
      )?.id ??
      null
    );
  }

  private binding(bindingId: BindingId | null): BindingInfo | null {
    return bindingId === null
      ? null
      : (this.analysis.bindings.find((binding) => binding.id === bindingId) ?? null);
  }

  private directQwikSourceRange(expression: AstNode): SourceRange | null {
    const member = unwrapExpression(expression);
    if (
      member?.type !== 'MemberExpression' ||
      member.computed ||
      getIdentifierName(member.property) !== 'value'
    ) {
      return null;
    }
    const source = unwrapExpression(member.object);
    if (source?.type !== 'Identifier') {
      return null;
    }
    const range = getRange(source);
    const bindingId = this.bindingIdAt(range);
    return bindingId !== null && this.sourceOutputs.has(bindingId) ? range : null;
  }

  /**
   * A collection may render once only when nothing it reads can change. Anything the compiler
   * cannot prove constant is treated as reactive, because guessing "static" silently freezes the
   * rendered rows, while guessing "reactive" only costs a rebuild.
   */
  private isStaticCollectionSource(expression: AstNode, range: SourceRange): boolean {
    if (isLiteralOnlyValue(expression)) {
      return true;
    }
    if (this.hasInlineBoundary(range)) {
      return false;
    }
    return this.referencesIn(range).every((id) => this.initialOnlyBindings.has(id));
  }

  private lowerSetup(
    lifetimeId: LifetimeId,
    ranges: readonly SourceRange[] = this.owner.setup
  ): SetupPlan[] {
    const setup: SetupPlan[] = [];
    for (const range of ranges) {
      const statement = findNodeByRange(this.owner.body, range);
      const style = statement === null ? null : this.lowerStyleSetup(statement, range, lifetimeId);
      if (style !== null) {
        setup.push(style);
        continue;
      }
      if (statement !== null && this.containsStyleHook(statement)) {
        this.fail(
          'style-hook',
          range,
          'Style hooks must be standalone calls or single const initializers in linear setup.'
        );
        continue;
      }
      const failureBeforeLocalComponent = this.failure;
      const localComponent =
        statement === null ? null : this.lowerLocalComponentSetup(statement, range, lifetimeId);
      if (localComponent !== null) {
        setup.push(localComponent);
        continue;
      }
      if (this.failure !== failureBeforeLocalComponent) {
        continue;
      }
      const jsxDeclaration =
        statement?.type === 'VariableDeclaration'
          ? statement.declarations.find((declaration) => containsJsx(declaration.init))
          : undefined;
      const initializer = unwrapExpression(jsxDeclaration?.init);
      const hasQrl = this.extracted.segments.some(
        (segment) => segment.kind === 'qrl' && containsRange(range, segment.range)
      );
      if (
        statement?.type !== 'VariableDeclaration' ||
        jsxDeclaration === undefined ||
        (initializer?.type !== 'JSXElement' && initializer?.type !== 'JSXFragment' && hasQrl)
      ) {
        const useIds = this.collectUseIds(range);
        setup.push({
          kind: 'statement',
          range,
          lifetimeId,
          referenceBindingIds: this.setupReferenceBindingIds(range).filter(
            (id) => !this.isSparkHookBinding(id, QwikHooks.UseId)
          ),
          useIds,
          ...this.setupOpAt(range),
        });
        continue;
      }
      const declaration = statement.declarations[0];
      const id = unwrapExpression(declaration?.id);
      const init = unwrapExpression(declaration?.init);
      if (
        statement.kind !== 'const' ||
        statement.declarations.length !== 1 ||
        id?.type !== 'Identifier' ||
        (init?.type !== 'JSXElement' && init?.type !== 'JSXFragment')
      ) {
        this.unsupported(
          range,
          'Local JSX setup values require one const identifier with a direct JSX initializer.'
        );
        continue;
      }
      const bindingId = this.bindingIdAt(getRange(id));
      const initRange = getRange(init);
      if (bindingId === null || initRange === null) {
        this.unsupported(range, 'A local JSX setup value has incomplete binding metadata.');
        continue;
      }
      const renderLifetimeId = this.allocateLifetime(lifetimeId, 'render-function', 'atomic-range');
      const effects: RenderEffectPlan[] = [];
      const renderPlan: RenderPlan = {
        roots: this.lowerExpression(init, { lifetimeId: renderLifetimeId, effects }),
        effects,
      };
      const render: RenderFunctionPlan = {
        kind: 'local-jsx',
        collectionSourceKind: null,
        range: initRange,
        segmentId: null,
        lifetimeId: renderLifetimeId,
        async: containsAwait(init),
        pure: isPureRenderFunction(
          renderPlan,
          [],
          containsAwait(init),
          this.lifecycleSegmentsIn(initRange),
          false
        ),
        setup: [],
        parameterBindingIds: [],
        render: renderPlan,
        referenceBindingIds: this.renderReferenceBindingIds(renderPlan, []),
        lifecycleSegmentIds: this.lifecycleSegmentsIn(initRange),
        needsId: false,
        styleScope: this.styleScopes.length === 0 ? null : this.styleScopes.join(' '),
        runtimeStyleScope: this.hasCustomHook,
        runtimeStyleScopeName: this.hasCustomHook ? this.runtimeStyleScopeName() : null,
      };
      this.localRenderValues.set(bindingId, render);
      setup.push({
        kind: 'render-value',
        range,
        lifetimeId,
        bindingId,
        name: id.name,
        render,
      });
    }
    return setup;
  }

  /**
   * A setup-scope function whose binding is used as a JSX tag compiles like a component — props
   * become parameter bindings, leading statements become nested setup (recursing for deeper local
   * components), and the returned JSX lowers to a render plan. Returns null when the statement is
   * not a local component; once the shape qualifies, lowering failures fail the owner like any
   * component body.
   */
  private lowerLocalComponentSetup(
    statement: AstNode,
    range: SourceRange,
    lifetimeId: LifetimeId
  ): SetupPlan | null {
    let fn: AstFunction | null = null;
    let nameRange: SourceRange | null = null;
    if (statement.type === 'FunctionDeclaration' && statement.id != null) {
      fn = statement as unknown as AstFunction;
      nameRange = getRange(statement.id);
    } else if (
      statement.type === 'VariableDeclaration' &&
      statement.kind === 'const' &&
      statement.declarations.length === 1
    ) {
      const declaration = statement.declarations[0];
      const init = unwrapExpression(declaration.init);
      const id = unwrapExpression(declaration.id);
      if (isFunctionLike(init) && id?.type === 'Identifier') {
        fn = init;
        nameRange = getRange(id);
      }
    }
    if (fn === null || fn.async === true || fn.generator === true) {
      return null;
    }
    const bindingId = this.bindingIdAt(nameRange);
    const binding = this.binding(bindingId);
    if (bindingId !== null) {
      this.localComponentBindings.add(bindingId);
    }
    if (
      bindingId === null ||
      binding === null ||
      !this.analysis.jsxTagBindingIds.includes(bindingId)
    ) {
      return null;
    }
    const shapeResult = analyzeComponentShape(fn, bindingId, this.analysis);
    if (shapeResult.kind === 'failure') {
      return null;
    }
    const shape = shapeResult.shape;
    const propNames = localComponentPropNames(fn, shape.parameter);
    if (propNames === null) {
      return null;
    }
    const functionRange = getRange(fn) ?? range;
    this.classifySetupBindings(shape.setup);
    const childLifetime = this.allocateLifetime(lifetimeId, 'render-function', 'atomic-range');
    // every local component is chunk-backed, like any component: the body also compiles
    // into its own segment, so the value always serializes as a QRL. Segments referenced
    // inside parent to it (the chunk hoists their QRLs).
    const segmentId = `local_component_${functionRange[0]}_${functionRange[1]}`;
    const expression = findNodeByRange(this.owner.body, shape.returnExpression);
    if (expression === null) {
      this.fail(
        'unsupported-syntax',
        shape.returnExpression,
        'The local component return expression could not be located.'
      );
      return null;
    }
    const lowerChild = (): { setup: SetupPlan[]; render: RenderPlan } => {
      const setup = this.lowerSetup(childLifetime, shape.setup);
      const effects: RenderEffectPlan[] = [];
      return {
        setup,
        render: {
          roots: this.lowerExpression(expression, { lifetimeId: childLifetime, effects }),
          effects,
        },
      };
    };
    const { setup, render } = this.withRenderSegment(segmentId, lowerChild);
    const needsId = setup.some((item) => item.kind === 'statement' && item.useIds.length > 0);
    const renderFunction: RenderFunctionPlan = {
      kind: 'local-component',
      collectionSourceKind: null,
      range: functionRange,
      segmentId: null,
      lifetimeId: childLifetime,
      async: false,
      pure: isPureRenderFunction(
        render,
        setup,
        false,
        this.lifecycleSegmentsIn(functionRange),
        needsId
      ),
      setup,
      parameterBindingIds: shape.parameter?.bindingIds ?? [],
      render,
      referenceBindingIds: this.renderReferenceBindingIds(render, setup),
      lifecycleSegmentIds: this.lifecycleSegmentsIn(functionRange),
      needsId,
      styleScope: this.styleScopes.length === 0 ? null : this.styleScopes.join(' '),
      runtimeStyleScope: this.hasCustomHook,
      runtimeStyleScopeName: this.hasCustomHook ? this.runtimeStyleScopeName() : null,
    };
    // the inline function stays for direct synchronous calls; the chunk is the value's identity
    const plan = this.createSyntheticSegment(
      segmentId,
      'localComponent',
      functionRange,
      functionRange,
      childLifetime,
      shape.parameter?.bindingIds ?? [],
      // the segment's copy is owned by the segment; the inline entry keeps segmentId null
      { ...renderFunction, segmentId },
      false,
      bindingId
    );
    this.syntheticSegments.push({ ...plan, componentParameter: shape.parameter });
    return {
      kind: 'local-component',
      range,
      lifetimeId,
      bindingId,
      name: binding.name,
      parameter: shape.parameter,
      propNames,
      segment: segmentId,
      providesContext: this.setupProvidesContext(shape.setup),
      render: renderFunction,
    };
  }

  private collectUseIds(range: SourceRange) {
    const calls: UseIdPlan[] = [];
    const statement = findNodeByRange(this.owner.body, range);
    if (statement === null) {
      return calls;
    }
    forEachNode(statement, (node) => {
      if (node.type !== 'CallExpression' || !this.isSparkHook(node.callee, QwikHooks.UseId)) {
        return;
      }
      const callRange = getRange(node);
      if (callRange === null || node.arguments.length !== 0) {
        this.fail('use-id', callRange ?? range, 'useId() does not accept arguments.');
        return;
      }
      const expressionRange =
        statement.type === 'ExpressionStatement' ? getRange(statement.expression) : null;
      const bindingId =
        statement.type === 'VariableDeclaration' && statement.kind === 'const'
          ? (statement.declarations.find((declaration) =>
              sameRange(getRange(declaration.init), callRange)
            )?.id ?? null)
          : null;
      const resolvedBindingId = bindingId === null ? null : this.bindingIdAt(getRange(bindingId));
      if (resolvedBindingId !== null) {
        this.compilerStringBindings.add(resolvedBindingId);
      }
      calls.push({
        range: callRange,
        ordinal: this.nextUseId++,
        standalone: expressionRange !== null && sameRange(expressionRange, callRange),
      });
    });
    return calls;
  }

  private validateCompilerHookScopes(): void {
    const nestedFunctionRanges: SourceRange[] = [];
    forEachNode(this.owner.body, (node) => {
      if (isFunctionLike(node)) {
        const range = getRange(node);
        if (range !== null) {
          nestedFunctionRanges.push(range);
        }
      }
    });
    forEachNode(this.owner.body, (node) => {
      if (node.type !== 'CallExpression') {
        return;
      }
      const callRange = getRange(node);
      if (callRange === null) {
        return;
      }
      const hook = this.isSparkHook(node.callee, QwikHooks.UseId)
        ? QwikHooks.UseId
        : this.isSparkHook(node.callee, QwikHooks.UseConstant)
          ? QwikHooks.UseConstant
          : this.isSparkHook(node.callee, QwikHooks.UseStore)
            ? QwikHooks.UseStore
            : this.isQwikHook(node.callee, QwikHooks.UseServerData)
              ? QwikHooks.UseServerData
              : this.isSparkHook(node.callee, QwikHooks.UseStylesDollar)
                ? QwikHooks.UseStylesDollar
                : this.isSparkHook(node.callee, QwikHooks.UseStylesScopedDollar)
                  ? QwikHooks.UseStylesScopedDollar
                  : null;
      if (
        hook !== null &&
        !this.owner.setup.some((range) => rangeContains(range, callRange)) &&
        !(
          hook === QwikHooks.UseId &&
          [...this.renderFunctions.values()].some((render) =>
            render.setup.some(
              (setup) => setup.kind === 'statement' && rangeContains(setup.range, callRange)
            )
          )
        )
      ) {
        this.fail(
          hook === QwikHooks.UseId
            ? 'use-id'
            : hook === QwikHooks.UseConstant ||
                hook === QwikHooks.UseStore ||
                hook === QwikHooks.UseServerData
              ? 'custom-hook'
              : 'style-hook',
          callRange,
          `${hook} is only supported in linear ${
            hook === QwikHooks.UseId ? 'component or row' : 'component'
          } setup.`
        );
      }
      if (hook === QwikHooks.UseStore) {
        this.validateUseStoreCall(node, callRange);
      }
      if (!this.isCustomHookCall(node)) {
        return;
      }
      if (unwrapExpression(node.callee)?.type !== 'Identifier') {
        this.fail(
          'custom-hook',
          callRange,
          'Namespace and computed custom use* hook calls are not supported.'
        );
        return;
      }
      const inSetup = this.owner.setup.some((range) => rangeContains(range, callRange));
      const inNestedFunction = nestedFunctionRanges.some((range) =>
        rangeContains(range, callRange)
      );
      if (!inSetup || inNestedFunction) {
        this.fail(
          'custom-hook',
          callRange,
          'Custom use* hooks are only supported as direct calls in linear component setup.'
        );
      }
    });
  }

  private validateUseStoreCall(
    call: Extract<AstNode, { type: 'CallExpression' }>,
    callRange: SourceRange
  ): void {
    const argument = unwrapExpression(getCallArgument(call.arguments[0]));
    if (
      call.arguments.length < 1 ||
      call.arguments.length > 2 ||
      call.arguments.some((argument) => argument.type === 'SpreadElement') ||
      argument === null ||
      argument === undefined ||
      argument.type === 'AwaitExpression' ||
      this.isAsyncStoreInitializer(argument) ||
      isObviousPromiseExpression(argument, (node) => {
        const promise = unwrapExpression(node);
        return (
          promise?.type === 'Identifier' &&
          promise.name === 'Promise' &&
          this.bindingIdAt(getRange(promise)) === null
        );
      })
    ) {
      this.fail(
        'custom-hook',
        callRange,
        'useStore() requires a synchronous initializer and an optional options argument in linear component setup.'
      );
    }
  }

  private isAsyncStoreInitializer(argument: AstNode): boolean {
    if (isFunctionLike(argument)) {
      return argument.async;
    }
    const bindingId = argument.type === 'Identifier' ? this.bindingIdAt(getRange(argument)) : null;
    return bindingId !== null && this.asyncFunctionBindings.has(bindingId);
  }

  private hasCustomHookInSetup(): boolean {
    return this.owner.setup.some((range) => {
      const statement = findNodeByRange(this.owner.body, range);
      if (statement === null) {
        return false;
      }
      let found = false;
      const visitDirect = (node: AstNode, root: boolean): void => {
        if (found || (!root && isFunctionLike(node))) {
          return;
        }
        if (node.type === 'CallExpression' && this.isCustomHookCall(node)) {
          found = true;
          return;
        }
        for (const [key, value] of Object.entries(node)) {
          if (SKIPPED_KEYS.has(key)) {
            continue;
          }
          if (Array.isArray(value)) {
            for (const child of value) {
              if (isNode(child)) {
                visitDirect(child, false);
              }
            }
          } else if (isNode(value)) {
            visitDirect(value, false);
          }
        }
      };
      visitDirect(statement, true);
      return found;
    });
  }

  private isCustomHookCall(call: Extract<AstNode, { type: 'CallExpression' }>): boolean {
    const callee = unwrapExpression(call.callee);
    if (callee?.type === 'Identifier') {
      const binding = this.binding(this.bindingIdAt(getRange(callee)));
      const name = binding?.import?.importedName ?? callee.name;
      if (typeof name !== 'string' || !name.startsWith('use')) {
        return false;
      }
      return !isQwikBinding(binding);
    }
    if (callee?.type !== 'MemberExpression') {
      return false;
    }
    const object = unwrapExpression(callee.object);
    const binding = this.binding(this.bindingIdAt(getRange(object)));
    if (binding?.import?.importedName !== '*') {
      return false;
    }
    const property = unwrapExpression(callee.property);
    const name = callee.computed
      ? property?.type === 'Literal' && typeof property.value === 'string'
        ? property.value
        : null
      : getIdentifierName(property);
    return name?.startsWith('use') === true && !isQwikBinding(binding);
  }

  private runtimeStyleScopeName(): string {
    if (this.runtimeStyleScopeNameCache !== null) {
      return this.runtimeStyleScopeNameCache;
    }
    const used = new Set(this.analysis.bindings.map((binding) => binding.name));
    let index = 0;
    let name: string;
    do {
      name = `styleScope${index++}`;
    } while (used.has(name));
    return (this.runtimeStyleScopeNameCache = name);
  }

  private lowerStyleSetup(
    statement: AstNode,
    range: SourceRange,
    lifetimeId: LifetimeId
  ): Extract<SetupPlan, { kind: 'style' }> | null {
    let call: Extract<AstNode, { type: 'CallExpression' }> | null = null;
    let resultBindingId: BindingId | null = null;
    if (statement.type === 'ExpressionStatement') {
      const expression = unwrapExpression(statement.expression);
      call = expression?.type === 'CallExpression' ? expression : null;
    } else if (statement.type === 'VariableDeclaration' && statement.declarations.length === 1) {
      const declaration = statement.declarations[0];
      const id = unwrapExpression(declaration.id);
      const init = unwrapExpression(declaration.init);
      if (id?.type === 'Identifier' && init?.type === 'CallExpression') {
        call = init;
        resultBindingId = this.bindingIdAt(getRange(id));
      }
    }
    if (call === null) {
      return null;
    }
    const scoped = this.isSparkHook(call.callee, QwikHooks.UseStylesScopedDollar);
    if (!scoped && !this.isSparkHook(call.callee, QwikHooks.UseStylesDollar)) {
      return null;
    }
    const callRange = getRange(call);
    const argument = unwrapExpression(getCallArgument(call.arguments[0]));
    const argumentRange = getRange(argument);
    if (
      callRange === null ||
      argumentRange === null ||
      argument == null ||
      call.arguments.length !== 1 ||
      argument?.type === 'AwaitExpression' ||
      isObviousPromiseExpression(argument, (node) => {
        const promise = unwrapExpression(node);
        return (
          promise?.type === 'Identifier' &&
          promise.name === 'Promise' &&
          this.bindingIdAt(getRange(promise)) === null
        );
      })
    ) {
      this.fail(
        'style-hook',
        callRange ?? range,
        'Style hooks require exactly one synchronous style argument in linear component setup.'
      );
      return null;
    }
    const index = this.nextStyle++;
    const styleId = `${hashCode(`${this.owner.displayName}_style${index}`)}-${index}`;
    if (scoped) {
      this.styleScopes.push(`⚡️${styleId}`);
    }
    const resultUsed =
      resultBindingId !== null &&
      this.analysis.references.some(
        (reference) =>
          reference.bindingId === resultBindingId && !rangeContains(range, reference.range)
      );
    return {
      kind: 'style',
      range,
      lifetimeId,
      callRange,
      argumentRange,
      scoped,
      styleId,
      resultUsed,
      referenceBindingIds: this.referencesIn(argumentRange),
    };
  }

  private isSparkHook(value: unknown, name: string): boolean {
    const callee = unwrapExpression(value);
    if (callee?.type !== 'Identifier') {
      return false;
    }
    return this.isSparkHookBinding(this.bindingIdAt(getRange(callee)), name);
  }

  private isQwikHook(value: unknown, name: string): boolean {
    const callee = unwrapExpression(value);
    if (callee?.type !== 'Identifier') {
      return false;
    }
    const binding = this.binding(this.bindingIdAt(getRange(callee)));
    return isQwikBinding(binding) && binding!.import!.importedName === name;
  }

  private containsStyleHook(node: AstNode): boolean {
    let found = false;
    forEachNode(node, (child) => {
      found ||=
        child.type === 'CallExpression' &&
        (this.isSparkHook(child.callee, QwikHooks.UseStylesDollar) ||
          this.isSparkHook(child.callee, QwikHooks.UseStylesScopedDollar));
    });
    return found;
  }

  private isSparkHookBinding(bindingId: BindingId | null, name: string): boolean {
    const binding = this.binding(bindingId);
    return binding?.import?.source === QWIK_IMPORT && binding.import.importedName === name;
  }

  private setupReferenceBindingIds(range: SourceRange): BindingId[] {
    return unique(
      this.analysis.references.flatMap((reference) => {
        if (reference.bindingId === null || !rangeContains(range, reference.range)) {
          return [];
        }
        const ownedBySegment = this.extracted.segments.some(
          (segment) =>
            rangeContains(segment.functionRange, reference.range) ||
            (segment.calleeRange !== null && sameRange(segment.calleeRange, reference.range))
        );
        return ownedBySegment ? [] : [reference.bindingId];
      })
    );
  }

  private classifySetupBindings(ranges: readonly SourceRange[]): void {
    for (const range of ranges) {
      const statement = findNodeByRange(this.owner.body, range);
      if (statement?.type !== 'VariableDeclaration') {
        continue;
      }
      for (const declaration of statement.declarations) {
        const id = unwrapExpression(declaration.id);
        const init = unwrapExpression(declaration.init);
        if (id?.type !== 'Identifier' || init === null || init === undefined) {
          continue;
        }
        const bindingId = this.bindingIdAt(getRange(id));
        if (bindingId === null) {
          continue;
        }
        if (statement.kind === 'const') {
          this.setupBindings.add(bindingId);
        }
        const compilerText =
          init.type === 'CallExpression' &&
          (this.isSparkHook(init.callee, QwikHooks.UseId) ||
            this.isQwikHook(init.callee, QwikHooks.UseServerData));
        if (
          statement.kind === 'const' &&
          (((init.type === 'ArrayExpression' || init.type === 'ObjectExpression') &&
            isLiteralOnlyValue(init)) ||
            compilerText)
        ) {
          this.initialOnlyBindings.add(bindingId);
        }
        this.bindingOutputs.set(
          bindingId,
          compilerText ? 'text' : this.classifyDynamicOutput(init)
        );
        const sourceOutput = this.classifySourceFactoryOutput(init);
        if (sourceOutput !== null) {
          this.sourceOutputs.set(bindingId, sourceOutput);
        }
        if (
          init.type === 'CallExpression' &&
          this.sourceFactoryName(init.callee) === QwikHooks.UseSignal
        ) {
          this.signalBindings.add(bindingId);
        }
      }
    }
  }

  private isStableRenderBinding(bindingId: BindingId): boolean {
    if (
      this.initialOnlyBindings.has(bindingId) ||
      this.setupBindings.has(bindingId) ||
      this.functionBindings.has(bindingId)
    ) {
      return true;
    }
    if (this.owner.parameter?.bindingIds.includes(bindingId) === true) {
      return false;
    }
    const binding = this.binding(bindingId);
    if (binding === null || binding === undefined) {
      return false;
    }
    if (binding.kind === 'module' || binding.import !== null) {
      return true;
    }
    return (
      binding.declarationRange !== null &&
      !rangeContains(this.owner.functionRange, binding.declarationRange)
    );
  }

  private classifyFunctionBindings(): void {
    forEachNode(this.owner.body, (node) => {
      if (node.type === 'FunctionDeclaration' && node.id !== null) {
        const bindingId = this.bindingIdAt(getRange(node.id));
        if (bindingId !== null) {
          this.functionBindings.add(bindingId);
          if (node.async) {
            this.asyncFunctionBindings.add(bindingId);
          }
        }
        return;
      }
      if (node.type !== 'VariableDeclarator') {
        return;
      }
      const initializer = unwrapExpression(node.init);
      if (!isFunctionLike(initializer)) {
        return;
      }
      const id = unwrapExpression(node.id);
      if (id?.type !== 'Identifier') {
        return;
      }
      const bindingId = this.bindingIdAt(getRange(id));
      if (bindingId !== null) {
        this.functionBindings.add(bindingId);
        if (initializer.async) {
          this.asyncFunctionBindings.add(bindingId);
        }
      }
    });
  }

  private classifyDynamicOutput(expression: AstNode): DynamicOutputKind {
    const node = unwrapExpression(expression);
    if (node === null || node === undefined) {
      return 'content';
    }
    switch (node.type) {
      case 'Literal':
      case 'TemplateLiteral':
      case 'BinaryExpression':
      case 'UnaryExpression':
      case 'UpdateExpression':
        return 'text';
      case 'Identifier': {
        const bindingId = this.bindingIdAt(getRange(node));
        return bindingId === null ? 'text' : (this.bindingOutputs.get(bindingId) ?? 'text');
      }
      case 'MemberExpression': {
        if (node.computed || getIdentifierName(node.property) !== 'value') {
          return 'text';
        }
        const object = unwrapExpression(node.object);
        const bindingId = this.bindingIdAt(getRange(object));
        return bindingId === null ? 'text' : (this.sourceOutputs.get(bindingId) ?? 'text');
      }
      case 'ConditionalExpression':
        return this.classifyDynamicOutput(node.consequent) === 'text' &&
          this.classifyDynamicOutput(node.alternate) === 'text'
          ? 'text'
          : 'content';
      case 'LogicalExpression':
        return this.classifyDynamicOutput(node.left) === 'text' &&
          this.classifyDynamicOutput(node.right) === 'text'
          ? 'text'
          : 'content';
      case 'SequenceExpression': {
        const last = node.expressions[node.expressions.length - 1];
        return last === undefined ? 'content' : this.classifyDynamicOutput(last);
      }
      case 'AwaitExpression':
        return this.classifyDynamicOutput(node.argument);
      case 'CallExpression': {
        if (this.isSparkHook(node.callee, QwikHooks.UseContext)) {
          return 'text';
        }
        const callee = unwrapExpression(node.callee);
        const receiver =
          callee?.type === 'MemberExpression' ? unwrapExpression(callee.object) : null;
        return receiver?.type === 'MemberExpression' &&
          !receiver.computed &&
          getIdentifierName(receiver.property) === 'value'
          ? 'text'
          : 'content';
      }
      default:
        return 'content';
    }
  }

  private classifySourceFactoryOutput(expression: AstNode): DynamicOutputKind | null {
    const call = unwrapExpression(expression);
    if (call?.type !== 'CallExpression') {
      return null;
    }
    const factory = this.sourceFactoryName(call.callee);
    if (factory === null) {
      return null;
    }
    const first = unwrapExpression(getCallArgument(call.arguments[0]));
    if (first === null || first === undefined) {
      return 'content';
    }
    if (factory === QwikHooks.UseSignal) {
      return this.classifyDynamicOutput(first);
    }
    if (
      (factory === QwikHooks.UseComputedDollar || factory === QwikHooks.UseAsyncDollar) &&
      isFunctionLike(first)
    ) {
      const returned = getCallbackReturn(first);
      return returned === null ? 'content' : this.classifyDynamicOutput(returned.row);
    }
    return 'content';
  }

  private sourceFactoryName(value: unknown): string | null {
    const callee = unwrapExpression(value);
    if (callee?.type === 'Identifier') {
      const binding = this.binding(this.bindingIdAt(getRange(callee)));
      const importedName = isQwikBinding(binding) ? binding!.import!.importedName : null;
      return typeof importedName === 'string' && SOURCE_FACTORY_HOOKS.has(importedName)
        ? importedName
        : null;
    }
    if (callee?.type !== 'MemberExpression' || callee.computed) {
      return null;
    }
    const name = getIdentifierName(callee.property);
    const object = unwrapExpression(callee.object);
    const binding = this.binding(this.bindingIdAt(getRange(object)));
    return name !== null &&
      SOURCE_FACTORY_HOOKS.has(name) &&
      isQwikBinding(binding) &&
      binding!.import!.importedName === '*'
      ? name
      : null;
  }

  /**
   * A capitalized tag whose binding is a plain local value — `const Tag = props.tag ?? 'h1'`.
   * Imports, module scope and function-initialized locals (local components) all prove a component;
   * anything else is only known once the value exists.
   */
  private isUnresolvedTagBinding(bindingId: BindingId | null): boolean {
    const binding = this.binding(bindingId);
    if (binding === null || binding.kind !== 'local') {
      return false;
    }
    return !this.localComponentBindings.has(binding.id);
  }

  /** `jsx(type, props)` is JSX in call form; the runtime export only throws, so lower it as JSX. */
  private getJsxCallCandidate(node: AstNode): JSXElement | null {
    const callee = unwrapExpression((node as { callee?: unknown }).callee);
    const binding = this.binding(this.bindingIdAt(getRange(callee)));
    if (
      !isQwikBinding(binding) ||
      (binding!.import!.importedName !== QwikHooks.Jsx &&
        binding!.import!.importedName !== QwikHooks.Jsxs)
    ) {
      return null;
    }
    return getJsxCallElement(node);
  }

  private isSlotBinding(bindingId: BindingId | null): boolean {
    const binding = this.binding(bindingId);
    return isQwikBinding(binding) && binding!.import!.importedName === QwikHooks.Slot;
  }

  private isSuspense(node: AstNode): boolean {
    if (node.type === 'JSXIdentifier') {
      const binding = this.binding(this.bindingIdAt(getRange(node)));
      return (
        isQwikBinding(binding) &&
        !binding!.import!.typeOnly &&
        binding!.import!.importedName === QwikHooks.Suspense
      );
    }
    if (
      node.type !== 'JSXMemberExpression' ||
      node.object.type !== 'JSXIdentifier' ||
      node.property.name !== QwikHooks.Suspense
    ) {
      return false;
    }
    const binding = this.binding(this.bindingIdAt(getRange(node.object)));
    return (
      isQwikBinding(binding) && !binding!.import!.typeOnly && binding!.import!.importedName === '*'
    );
  }

  private providesContext(): boolean {
    return this.setupProvidesContext(this.owner.setup);
  }

  /** Providers inside local component declarations belong to the local component, not the owner. */
  private setupProvidesContext(ranges: readonly SourceRange[]): boolean {
    return ranges.some((range) => {
      const setup = findNodeByRange(this.owner.body, range);
      return setup !== null && !isFunctionLike(setup) && this.containsContextProviderCall(setup);
    });
  }

  private containsContextProviderCall(node: AstNode): boolean {
    if (node.type === 'CallExpression' && this.isContextProviderCallee(node.callee)) {
      return true;
    }
    for (const [key, value] of Object.entries(node)) {
      if (SKIPPED_KEYS.has(key)) {
        continue;
      }
      if (Array.isArray(value)) {
        for (const child of value) {
          if (isNode(child) && !isFunctionLike(child) && this.containsContextProviderCall(child)) {
            return true;
          }
        }
      } else if (
        isNode(value) &&
        !isFunctionLike(value) &&
        this.containsContextProviderCall(value)
      ) {
        return true;
      }
    }
    return false;
  }

  private isContextProviderCallee(value: unknown): boolean {
    const callee = unwrapExpression(value);
    if (callee?.type === 'Identifier') {
      const binding = this.binding(this.bindingIdAt(getRange(callee)));
      return (
        isQwikBinding(binding) && binding!.import!.importedName === QwikHooks.UseContextProvider
      );
    }
    if (
      callee?.type !== 'MemberExpression' ||
      callee.computed ||
      getIdentifierName(callee.property) !== QwikHooks.UseContextProvider
    ) {
      return false;
    }
    const object = unwrapExpression(callee.object);
    const binding = this.binding(this.bindingIdAt(getRange(object)));
    return isQwikBinding(binding) && binding!.import!.importedName === '*';
  }

  private allocateLifetime(
    parentId: LifetimeId | null,
    owner: LifetimePlan['owner'],
    commit: LifetimePlan['commit']
  ): LifetimeId {
    const id = this.nextLifetimeId++;
    this.lifetimes.push({
      id,
      parentId,
      ownerId: id,
      owner,
      commit,
    });
    return id;
  }

  private pushEffect(context: RenderContext, effect: RenderEffectInput): number {
    const id = this.nextEffectId++;
    context.effects.push({ ...effect, id } as RenderEffectPlan);
    return id;
  }

  private unsupported(range: SourceRange, message: string): [] {
    this.fail('unsupported-syntax', range, message);
    return [];
  }

  private fail(
    code: SemanticLowerFailureCode,
    range: SourceRange,
    message: string
  ): Exclude<SemanticLowerResult, { kind: 'success' }> {
    this.failure ??= { kind: 'failure', code, range, message };
    return this.failure;
  }

  private withInitialOnlyBinding<T>(bindingId: BindingId | null, run: () => T): T {
    if (bindingId === null) {
      return run();
    }
    this.initialOnlyBindings.add(bindingId);
    try {
      return run();
    } finally {
      this.initialOnlyBindings.delete(bindingId);
    }
  }
}

/**
 * Prop keys for a local component's parameter, parallel to `parameter.bindingIds`. Only shorthand
 * object patterns (defaults allowed) qualify — renamed, nested, or rest patterns would break the
 * plan's name-based prop mapping, so they return null and the function stays a raw statement.
 */
function localComponentPropNames(
  fn: AstFunction,
  parameter: ComponentParameterPlan | null
): string[] | null {
  if (parameter === null || parameter.kind === 'identifier') {
    return [];
  }
  let pattern = unwrapExpression(fn.params[0]);
  if (pattern?.type === 'AssignmentPattern') {
    pattern = unwrapExpression(pattern.left);
  }
  if (pattern?.type !== 'ObjectPattern') {
    return null;
  }
  const names: string[] = [];
  for (const property of pattern.properties as AstNode[]) {
    if (property.type !== 'Property') {
      return null;
    }
    const key = unwrapExpression(property.key);
    const value = unwrapExpression(property.value);
    const target = value?.type === 'AssignmentPattern' ? unwrapExpression(value.left) : value;
    if (key?.type !== 'Identifier' || target?.type !== 'Identifier' || key.name !== target.name) {
      return null;
    }
    names.push(key.name);
  }
  return names.length === parameter.bindingIds.length ? names : null;
}

function getCallbackReturn(
  callback: AstFunction
): { row: AstNode; setup: readonly SourceRange[] } | null {
  const body = unwrapExpression(callback.body);
  if (body === null || body === undefined) {
    return null;
  }
  if (body.type !== 'BlockStatement') {
    return { row: body, setup: [] };
  }
  const returns = body.body.flatMap((statement, index) =>
    statement.type === 'ReturnStatement' ? [{ statement, index }] : []
  );
  if (
    returns.length !== 1 ||
    returns[0].index !== body.body.length - 1 ||
    body.body.slice(0, -1).some((statement) => containsNestedReturn(statement))
  ) {
    return null;
  }
  const row = unwrapExpression(returns[0].statement.argument);
  if (row === null || row === undefined) {
    return null;
  }
  return {
    row,
    setup: body.body
      .slice(0, returns[0].index)
      .map(getRange)
      .filter((range): range is SourceRange => range !== null),
  };
}

function getLeadingSetupRanges(callback: AstFunction): SourceRange[] {
  const body = unwrapExpression(callback.body);
  if (body?.type !== 'BlockStatement') {
    return [];
  }
  const ranges: SourceRange[] = [];
  for (const statement of body.body) {
    if (
      statement.type === 'ReturnStatement' ||
      statement.type === 'IfStatement' ||
      statement.type === 'SwitchStatement' ||
      statement.type === 'TryStatement' ||
      statement.type === 'ForStatement' ||
      statement.type === 'ForInStatement' ||
      statement.type === 'ForOfStatement' ||
      statement.type === 'WhileStatement' ||
      statement.type === 'DoWhileStatement'
    ) {
      break;
    }
    const range = getRange(statement);
    if (range !== null) {
      ranges.push(range);
    }
  }
  return ranges;
}

function findMaximalJsxRoots(
  node: unknown,
  skippedRanges: readonly SourceRange[],
  skipNestedFunctions = false
): AstNode[] {
  const roots: AstNode[] = [];
  visit(node);
  return roots;

  function visit(value: unknown): void {
    if (!isNode(value)) {
      return;
    }
    const range = getRange(value);
    if (range !== null && skippedRanges.some((skipped) => sameRange(skipped, range))) {
      return;
    }
    if (skipNestedFunctions && isFunctionLike(value)) {
      return;
    }
    if (value.type === 'JSXElement' || value.type === 'JSXFragment') {
      roots.push(value);
      return;
    }
    for (const [key, child] of Object.entries(value)) {
      if (SKIPPED_KEYS.has(key)) {
        continue;
      }
      if (Array.isArray(child)) {
        for (const item of child) {
          visit(item);
        }
      } else {
        visit(child);
      }
    }
  }
}

function containsNestedReturn(node: unknown): boolean {
  if (!isNode(node)) {
    return false;
  }
  if (isFunctionLike(node)) {
    return false;
  }
  if (node.type === 'ReturnStatement') {
    return true;
  }
  for (const [key, value] of Object.entries(node)) {
    if (SKIPPED_KEYS.has(key)) {
      continue;
    }
    if (Array.isArray(value)) {
      if (value.some((child) => containsNestedReturn(child))) {
        return true;
      }
    } else if (containsNestedReturn(value)) {
      return true;
    }
  }
  return false;
}

function getRowKey(row: AstNode): AstNode | null {
  const roots = row.type === 'JSXElement' ? [row] : row.type === 'JSXFragment' ? row.children : [];
  for (const root of roots) {
    if (root.type !== 'JSXElement') {
      continue;
    }
    const key = root.openingElement.attributes.find(
      (attribute) =>
        attribute.type === 'JSXAttribute' && getJsxAttributeName(attribute.name) === 'key'
    );
    if (key?.type === 'JSXAttribute') {
      if (key.value?.type === 'JSXExpressionContainer') {
        return unwrapExpression(key.value.expression) ?? null;
      }
      if (key.value?.type === 'Literal') {
        return key.value;
      }
    }
  }
  return null;
}

function getCallArgument(argument: unknown): unknown {
  return isNode(argument) && argument.type === 'SpreadElement' ? argument.argument : argument;
}

function readStaticAttribute(node: JSXElement, expectedName: string): string | null {
  for (const attribute of node.openingElement.attributes) {
    if (attribute.type === 'JSXAttribute' && getJsxAttributeName(attribute.name) === expectedName) {
      const value = getStaticJsxAttributeValue(attribute.value ?? null);
      return typeof value === 'string' ? value : null;
    }
  }
  return null;
}

function readAttributeExpression(node: JSXElement, expectedName: string): AstNode | null {
  for (let index = node.openingElement.attributes.length - 1; index >= 0; index--) {
    const attribute = node.openingElement.attributes[index];
    if (attribute.type === 'JSXAttribute' && getJsxAttributeName(attribute.name) === expectedName) {
      return getJsxAttributeExpression(attribute.value) ?? null;
    }
  }
  return null;
}

function getProjectionName(child: JSXChild): string | null {
  return child.type === 'JSXElement' ? readStaticAttribute(child, 'q:slot') : '';
}

function isEmptyChild(child: JSXChild): boolean {
  return (
    (child.type === 'JSXText' && normalizeJsxText(child.value) === '') ||
    (child.type === 'JSXExpressionContainer' &&
      (child.expression.type === 'JSXEmptyExpression' || isEmptyBranchExpression(child.expression)))
  );
}

const PARSER_SENSITIVE_ELEMENTS = new Set([
  'table',
  'thead',
  'tbody',
  'tfoot',
  'tr',
  'colgroup',
  'select',
  'optgroup',
  'template',
  'svg',
  'math',
]);

function containsRange(outer: SourceRange, inner: SourceRange): boolean {
  return inner[0] >= outer[0] && inner[1] <= outer[1];
}

function isQwikBinding(binding: BindingInfo | null): boolean {
  return (
    binding !== null &&
    binding.import !== null &&
    (binding.import.source === QWIK_IMPORT || binding.import.source === QWIK_CORE_IMPORT)
  );
}

function hashCode(text: string): string {
  let hash = 0;
  for (let i = 0; i < text.length; i++) {
    hash = (hash << 5) - hash + text.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash).toString(36);
}

function sanitizeIdPart(value: string): string {
  return value.replace(/[^A-Za-z0-9_$]/g, '_') || 'default';
}

function toModuleReference(binding: BindingInfo): ModuleReferencePlan {
  return {
    bindingId: binding.id,
    name: binding.name,
    declarationRange: binding.declarationRange,
    import: binding.import,
  };
}

function propKey(prop: OrderedPropPlan): string {
  return prop.kind === 'inner-html'
    ? 'dangerouslySetInnerHTML'
    : prop.kind === 'spread'
      ? `...${prop.range[0]}`
      : prop.kind === 'ref'
        ? 'ref'
        : prop.name;
}

function collectPassiveEventNames(attributes: readonly JSXAttributeItem[]): Set<string> {
  const events = new Set<string>();
  const collect = (name: string, value: StaticProp['value']): void => {
    if (value && name.startsWith(QwikAttributes.PassivePrefix)) {
      events.add(normalizeJsxEventName(name.slice(QwikAttributes.PassivePrefix.length)));
    }
  };
  for (const attribute of attributes) {
    if (attribute.type === 'JSXSpreadAttribute') {
      for (const property of getExpandableObjectProperties(attribute.argument) ?? []) {
        if (property.kind === 'static') {
          collect(property.name, property.value);
        }
      }
      continue;
    }
    const name = getJsxAttributeName(attribute.name);
    const value = getStaticJsxAttributeValue(attribute.value ?? null);
    if (name !== null && value !== undefined) {
      collect(name, value);
    }
  }
  return events;
}

function normalizeEventModifier(name: string, passiveEvents: ReadonlySet<string>): string | null {
  if (name.startsWith(QwikAttributes.PassivePrefix)) {
    return null;
  }
  if (name.startsWith(QwikAttributes.PreventDefaultPrefix)) {
    const eventName = normalizeJsxEventName(name.slice(QwikAttributes.PreventDefaultPrefix.length));
    return passiveEvents.has(eventName)
      ? null
      : `${QwikAttributes.PreventDefaultPrefix}${eventName}`;
  }
  if (name.startsWith(QwikAttributes.StopPropagationPrefix)) {
    const eventName = normalizeJsxEventName(
      name.slice(QwikAttributes.StopPropagationPrefix.length)
    );
    return `${QwikAttributes.StopPropagationPrefix}${eventName}`;
  }
  return name;
}

function isPassiveEvent(name: string, passiveEvents: ReadonlySet<string>): boolean {
  const attribute = jsxEventToHtmlAttribute(name);
  if (attribute === null) {
    return false;
  }
  return passiveEvents.has(attribute.slice(attribute.indexOf(':') + 1));
}

function collectAwaitRanges(node: AstNode | null): SegmentPlan['awaits'] {
  if (node === null) {
    return [];
  }
  const awaits: Array<{ range: SourceRange; argumentRange: SourceRange }> = [];
  forEachNode(node, (child) => {
    if (child.type !== 'AwaitExpression') {
      return;
    }
    const range = getRange(child);
    const argumentRange = getRange(child.argument);
    if (range !== null && argumentRange !== null) {
      awaits.push({ range, argumentRange });
    }
  });
  return awaits;
}

function containsAwait(node: unknown): boolean {
  let found = false;
  forEachNode(node, (child) => {
    found ||= child.type === 'AwaitExpression';
  });
  return found;
}

function isLiteralOnlyValue(value: unknown): boolean {
  const node = unwrapExpression(value);
  if (node?.type === 'Literal') {
    return (
      node.value === null ||
      typeof node.value === 'string' ||
      typeof node.value === 'number' ||
      typeof node.value === 'boolean'
    );
  }
  if (node?.type === 'ArrayExpression') {
    return node.elements.every(
      (element) =>
        element !== null && element.type !== 'SpreadElement' && isLiteralOnlyValue(element)
    );
  }
  if (node?.type !== 'ObjectExpression') {
    return false;
  }
  return node.properties.every((property) => {
    if (
      property.type !== 'Property' ||
      property.kind !== 'init' ||
      property.computed ||
      property.method ||
      property.shorthand
    ) {
      return false;
    }
    const name =
      property.key.type === 'Identifier'
        ? property.key.name
        : property.key.type === 'Literal'
          ? String(property.key.value)
          : null;
    return name !== null && name !== '__proto__' && isLiteralOnlyValue(property.value);
  });
}

function containsJsx(node: unknown): boolean {
  let found = false;
  forEachNode(node, (child) => {
    found ||= child.type === 'JSXElement' || child.type === 'JSXFragment';
  });
  return found;
}

function findNodeByRange(node: unknown, range: SourceRange): AstNode | null {
  let exact: AstNode | null = null;
  forEachNode(node, (candidate) => {
    if (exact === null && sameRange(getRange(candidate), range)) {
      exact = candidate;
    }
  });
  return exact;
}

function forEachNode(node: unknown, visitor: (node: AstNode) => void): void {
  if (!isNode(node)) {
    return;
  }
  visitor(node);
  for (const [key, value] of Object.entries(node)) {
    if (SKIPPED_KEYS.has(key)) {
      continue;
    }
    if (Array.isArray(value)) {
      for (const child of value) {
        forEachNode(child, visitor);
      }
    } else {
      forEachNode(value, visitor);
    }
  }
}

function isNode(node: unknown): node is AstNode {
  return !!node && typeof node === 'object' && 'type' in node && typeof node.type === 'string';
}

function isValuePlan(value: ValuePlan | StaticProp['value']): value is ValuePlan {
  return typeof value === 'object' && value !== null && 'kind' in value;
}

function rangeContains(outer: SourceRange, inner: SourceRange): boolean {
  return outer[0] <= inner[0] && outer[1] >= inner[1];
}

function sameRange(left: SourceRange | null, right: SourceRange): boolean {
  return left !== null && left[0] === right[0] && left[1] === right[1];
}

function unique(values: readonly number[]): number[] {
  return [...new Set(values)];
}

function captureBindingIds(captures: SegmentPlan['captures']) {
  return {
    captureBindingIds: captures.flatMap((capture) =>
      capture.access === 'component-prop' ? [] : [capture.bindingId]
    ),
    componentPropBindingIds: captures.flatMap((capture) =>
      capture.access === 'component-prop' ? [capture.bindingId] : []
    ),
  };
}

function referenceBindingIds(reference: SegmentReferencePlan): readonly BindingId[] {
  return [...reference.captureBindingIds, ...reference.componentPropBindingIds];
}

function inlineSingleUseRenderValues(
  render: RenderPlan,
  setup: readonly SetupPlan[],
  renderFunctions: ReadonlyMap<string, RenderFunctionPlan>
): { readonly render: RenderPlan; readonly setup: readonly SetupPlan[] } {
  const localValues = new Map(
    setup.flatMap((item) => (item.kind === 'render-value' ? [[item.bindingId, item] as const] : []))
  );
  if (localValues.size === 0) {
    return { render, setup };
  }
  const uses = new Map<BindingId, number>();
  const directUses = new Map<BindingId, number>();
  const countValue = (value: ValuePlan, direct: boolean): void => {
    if (value.kind === 'render-value' && localValues.has(value.bindingId)) {
      uses.set(value.bindingId, (uses.get(value.bindingId) ?? 0) + 1);
      if (direct) {
        directUses.set(value.bindingId, (directUses.get(value.bindingId) ?? 0) + 1);
      }
    }
  };
  const countNodes = (nodes: readonly RenderNodePlan[], direct: boolean): void => {
    for (const node of nodes) {
      if (node.kind === 'dynamic-value') {
        countValue(node.value, direct);
      } else if (node.kind === 'element') {
        countNodes(node.children, direct);
      }
    }
  };
  countNodes(render.roots, true);
  const localRenders = new Set([...localValues.values()].map((item) => item.render));
  for (const fn of renderFunctions.values()) {
    if (!localRenders.has(fn)) {
      countNodes(fn.render.roots, false);
    }
  }
  const eligible = new Set(
    [...localValues].flatMap(([bindingId, item]) =>
      uses.get(bindingId) === 1 && directUses.get(bindingId) === 1 && item.render.pure
        ? [bindingId]
        : []
    )
  );
  if (eligible.size === 0) {
    return { render, setup };
  }
  const effects = [...render.effects];
  const inlineNodes = (nodes: readonly RenderNodePlan[]): RenderNodePlan[] =>
    nodes.flatMap((node): RenderNodePlan[] => {
      if (
        node.kind === 'dynamic-value' &&
        node.value.kind === 'render-value' &&
        eligible.has(node.value.bindingId)
      ) {
        const local = localValues.get(node.value.bindingId)!;
        effects.push(...local.render.render.effects);
        return inlineNodes(local.render.render.roots);
      }
      if (node.kind === 'element') {
        return [{ ...node, children: inlineNodes(node.children) }];
      }
      return [node];
    });
  return {
    render: { roots: inlineNodes(render.roots), effects },
    setup: setup.filter((item) => item.kind !== 'render-value' || !eligible.has(item.bindingId)),
  };
}

function isPureRenderFunction(
  render: RenderPlan,
  setup: readonly SetupPlan[],
  async: boolean,
  lifecycleSegmentIds: readonly string[],
  needsId: boolean
): boolean {
  return (
    !async &&
    !needsId &&
    setup.length === 0 &&
    lifecycleSegmentIds.length === 0 &&
    render.effects.length === 0 &&
    render.roots.every(isPureRenderNode)
  );
}

function isPureRenderNode(node: RenderNodePlan): boolean {
  return (
    node.kind === 'static-text' ||
    (node.kind === 'element' &&
      node.propsEffect === null &&
      node.props.every((prop) => prop.kind === 'static') &&
      node.children.every(isPureRenderNode))
  );
}

function usedParameterPrefix(
  parameters: readonly BindingId[],
  references: readonly BindingId[]
): BindingId[] {
  const used = new Set(references);
  for (let index = parameters.length - 1; index >= 0; index--) {
    if (used.has(parameters[index])) {
      return parameters.slice(0, index + 1);
    }
  }
  return [];
}

const SKIPPED_KEYS = new Set([
  'type',
  'start',
  'end',
  'range',
  'loc',
  'decorators',
  'typeAnnotation',
  'typeParameters',
  'returnType',
]);

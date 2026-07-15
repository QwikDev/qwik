import type { JSXChild, JSXElement } from 'oxc-parser';
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
  normalizeJsxText,
  unwrapExpression,
} from './ast-utils';
import type { AstFunction, AstNode, SourceRange } from './types';
import {
  getJsxAttributeExpression,
  getJsxBranchExpression,
  getExpandableObjectProperties,
  getStaticBranchCondition,
  getStaticJsxAttributeValue,
  isEmptyBranchExpression,
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
  RenderNodePlan,
  ComponentDefinition,
  Segment,
  SegmentPlan,
  SegmentReferencePlan,
  SetupPlan,
  SlotPlan,
  StaticProp,
  UseIdPlan,
  ValuePlan,
} from './plan-types';
import { QWIK_CORE_IMPORT, QWIK_IMPORT, QwikHooks } from './words';
import { createExtractedSegmentPlan } from './segment-plan';

export type SemanticLowerFailureCode =
  | 'unsupported-syntax'
  | 'ref'
  | 'for-key'
  | 'async-for'
  | 'use-id'
  | 'style-hook'
  | 'custom-hook'
  | 'scoped-style-content';

export type SemanticLowerResult =
  | { readonly kind: 'success'; readonly plan: ComponentPlan }
  | {
      readonly kind: 'failure';
      readonly code: SemanticLowerFailureCode;
      readonly range: SourceRange;
      readonly message: string;
    };

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
  return new SemanticLowerer(component, extracted).lower();
}

class SemanticLowerer {
  private readonly analysis;
  private readonly lifetimes: LifetimePlan[] = [];
  private readonly usedSegments = new Map<string, LifetimeId>();
  private readonly renderFunctions = new Map<string, RenderFunctionPlan>();
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
    private readonly component: ComponentDefinition,
    private readonly extracted: ExtractedQrls
  ) {
    this.analysis = extracted.analysis;
  }

  lower(): SemanticLowerResult {
    const rootLifetime = this.allocateLifetime(null, 'component', 'immediate');
    this.retainSetupSegments(rootLifetime);
    this.classifySetupBindings(this.component.shape.setup);
    this.classifyFunctionBindings();
    const setup = this.lowerSetup(rootLifetime);
    if (this.failure !== null) {
      return this.failure;
    }
    this.hasCustomHook = this.hasCustomHookInSetup();

    const expression = findNodeByRange(this.component.body, this.component.shape.returnExpression);
    if (expression === null) {
      return this.fail(
        'unsupported-syntax',
        this.component.shape.returnExpression,
        'The component return expression could not be located in the normalized AST.'
      );
    }
    const effects: RenderEffectPlan[] = [];
    const roots = this.lowerExpression(expression, { lifetimeId: rootLifetime, effects });
    this.validateCompilerHookScopes();
    if (this.failure !== null) {
      return this.failure;
    }
    const inlined = inlineSingleUseRenderValues({ roots, effects }, setup, this.renderFunctions);
    const render = inlined.render;
    const finalSetup = inlined.setup;
    const segments = this.createSegmentPlans();
    const referenceBindingIds = this.renderReferenceBindingIds(render, finalSetup);
    return {
      kind: 'success',
      plan: {
        shape: this.component.shape,
        setup: finalSetup,
        providesContext: this.providesContext(),
        needsId: this.nextUseId > 0,
        idBase: `q${sanitizeIdPart(
          this.component.localName ?? String(this.component.exportName)
        )}-`,
        styleScope: this.styleScopes.length === 0 ? null : this.styleScopes.join(' '),
        hasCustomHook: this.hasCustomHook,
        runtimeStyleScopeName: this.hasCustomHook ? this.runtimeStyleScopeName() : null,
        render,
        referenceBindingIds,
        segments,
        lifetimes: this.lifetimes,
      },
    };
  }

  private lowerExpression(expression: unknown, context: RenderContext): RenderNodePlan[] {
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
        return this.lowerElement(node, context);
      case 'JSXFragment':
        return this.lowerChildren(node.children, context);
      case 'Literal':
        return this.lowerLiteral(node, range);
      case 'ConditionalExpression':
      case 'LogicalExpression': {
        const branch = getJsxBranchExpression(node);
        if (branch !== null) {
          const condition = getStaticBranchCondition(branch.condition);
          if (condition !== null) {
            return this.lowerExpression(condition ? branch.then : branch.else, context);
          }
          const plan = this.lowerBranch(node, branch, context.lifetimeId);
          return plan === null ? [] : [plan];
        }
        if (containsJsx(node)) {
          return this.unsupported(
            range,
            'JSX inside this expression cannot be represented by a semantic render node.'
          );
        }
        return [this.createDynamicValue(node, range, context)];
      }
      case 'CallExpression': {
        const collection = this.getMapCandidate(node);
        if (collection !== null) {
          const plan = this.lowerCollection(collection, context.lifetimeId);
          return plan === null ? [] : [plan];
        }
        if (containsJsx(node)) {
          return this.unsupported(
            range,
            'A call containing JSX must use a supported map render callback.'
          );
        }
        return [this.createDynamicValue(node, range, context)];
      }
      case 'JSXEmptyExpression':
        return [];
      default:
        if (containsJsx(node)) {
          return this.unsupported(
            range,
            'JSX inside this expression cannot be represented by a semantic render node.'
          );
        }
        return [this.createDynamicValue(node, range, context)];
    }
  }

  private lowerElement(node: JSXElement, context: RenderContext): RenderNodePlan[] {
    const range = getRange(node);
    const tagRange = getRange(node.openingElement.name);
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
      return [this.lowerComponent(node, range, tagRange, bindingId, context)];
    }
    const propsEffect = this.createElementPropsEffect(node, range, context);
    const props = this.lowerProps(node, range, context, 'element', propsEffect);
    const element: ElementPlan = {
      kind: 'element',
      tag,
      range,
      props,
      propsEffect,
      children: this.lowerChildren(node.children, context),
    };
    return [element];
  }

  private lowerComponent(
    node: JSXElement,
    range: SourceRange,
    tagRange: SourceRange,
    bindingId: BindingId | null,
    context: RenderContext
  ): ComponentNodePlan {
    const lifetimeId = this.allocateLifetime(context.lifetimeId, 'component-call', 'atomic-range');
    const props = this.lowerProps(
      node,
      range,
      { lifetimeId, effects: context.effects },
      'component'
    );
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
          projectionLifetime
        ),
      });
    }
    return {
      kind: 'component',
      range,
      tagRange,
      bindingId,
      needsId: false,
      lifetimeId,
      props,
      slots,
    };
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

  private lowerChildren(children: readonly JSXChild[], context: RenderContext): RenderNodePlan[] {
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
          result.push(...this.lowerExpression(child.expression, context));
          break;
        case 'JSXElement':
        case 'JSXFragment':
          result.push(...this.lowerExpression(child, context));
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
      const source = findNodeByRange(this.component.body, part.expressionRange);
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
            props.push(
              property.name === 'innerHTML' || property.name === 'dangerouslySetInnerHTML'
                ? {
                    kind: 'inner-html',
                    range,
                    value: property.value,
                    lifetimeId: null,
                    effectId: null,
                  }
                : { kind: 'static', range, name: property.name, value: property.value }
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
        props.push(
          innerHtml
            ? {
                kind: 'inner-html',
                range,
                value: staticValue,
                lifetimeId: null,
                effectId: null,
              }
            : { kind: 'static', range, name, value: staticValue }
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
      const value = this.createValue(
        expression,
        lifetimeId,
        event,
        targetKind === 'element' && !event && !innerHtml,
        false,
        targetKind === 'component' && !event
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
        props.push({ kind: 'event', range, name, value, lifetimeId, effectId });
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
      const wins = last.get(propKey(prop)) === index;
      if (prop.kind === 'bind') {
        normalized.push({ ...prop, effectId: wins ? prop.effectId : null });
      } else if (wins) {
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
    const value = this.createValue(expression, lifetimeId, false, output === 'text', true);
    const effectId = this.pushEffect(context, {
      kind: output,
      lifetimeId,
      range,
      value,
    });
    return { kind: 'dynamic-value', output, range, lifetimeId, effectId, value };
  }

  private createValue(
    expression: AstNode,
    lifetimeId: LifetimeId,
    event: boolean,
    allowSource = false,
    allowRenderValue = false,
    inlineExpression = false
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
      };
    }
    const source = allowSource ? this.directQwikSourceRange(expression) : null;
    if (source !== null) {
      return {
        kind: 'source',
        expression: range,
        source,
        referenceBindingIds: this.referencesIn(range),
      };
    }
    if (inlineExpression) {
      return {
        kind: 'expression',
        expression: range,
        referenceBindingIds: this.referencesIn(range),
        initialOnly: false,
        compilerString: false,
        boundaries: this.referenceInlineBoundaries(range, lifetimeId),
      };
    }
    const functionRange = event && isFunctionLike(expression) ? getRange(expression) : null;
    const segment =
      functionRange === null
        ? this.findSegment('expression', range)
        : (this.extracted.segments.find(
            (candidate) => candidate.kind === 'event' && sameRange(candidate.functionRange, range)
          ) ?? null);
    if (segment !== null) {
      return {
        kind: 'segment',
        expression: range,
        segment: this.referenceSegment(segment, lifetimeId),
      };
    }
    if (allowRenderValue) {
      return {
        kind: 'segment',
        expression: range,
        segment: this.createSyntheticValueSegment(expression, lifetimeId),
      };
    }
    return {
      kind: 'expression',
      expression: range,
      referenceBindingIds: references,
      initialOnly: false,
      compilerString: false,
      boundaries: [],
    };
  }

  private lowerBranch(
    expression: AstNode,
    branch: NonNullable<ReturnType<typeof getJsxBranchExpression>>,
    parentLifetimeId: LifetimeId
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
      then: this.createExpressionRenderFunction('branch', branch.then, thenSegment, lifetimeId),
      else:
        branch.else === null || elseSegment === null
          ? null
          : this.createExpressionRenderFunction('branch', branch.else, elseSegment, lifetimeId),
    };
  }

  private lowerCollection(
    collection: MapCandidate,
    parentLifetimeId: LifetimeId
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
          }
        : this.isDirectArraySource(collection.source)
          ? {
              kind: 'direct-array' as const,
              expression: sourceRange,
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
            };
    if (source.kind !== 'direct-array' && collection.key === null) {
      this.fail(
        'for-key',
        collection.range,
        'Reactive and derived JSX collections require a synchronous key.'
      );
      return null;
    }
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
      source.kind
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
      row,
      usesIndexSignal,
    };
  }

  private createCallbackRenderFunction(
    kind: 'collection-row',
    collection: MapCandidate,
    segment: Segment | null,
    parentLifetimeId: LifetimeId,
    collectionSourceKind: CollectionPlan['source']['kind']
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
            roots: this.lowerExpression(collection.row, { lifetimeId, effects }),
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
    kind: 'branch',
    expression: AstNode,
    segment: Segment,
    parentLifetimeId: LifetimeId
  ): RenderFunctionPlan {
    const range = getRange(expression)!;
    const lifetimeId = this.allocateLifetime(parentLifetimeId, 'render-function', 'atomic-range');
    this.referenceSegment(segment, lifetimeId);
    const render = this.withRenderSegment(segment.id, () => {
      const effects: RenderEffectPlan[] = [];
      return {
        roots: this.lowerExpression(expression, { lifetimeId, effects }),
        effects,
      } satisfies RenderPlan;
    });
    const plan: RenderFunctionPlan = {
      kind,
      collectionSourceKind: null,
      range,
      segmentId: segment.id,
      lifetimeId,
      async: segment.awaits.length > 0,
      pure: isPureRenderFunction(
        render,
        [],
        segment.awaits.length > 0,
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
    this.renderFunctions.set(segment.id, plan);
    return plan;
  }

  private createChildrenRenderFunction(
    kind: 'slot',
    range: SourceRange,
    children: readonly JSXChild[],
    segment: Segment | null,
    parentLifetimeId: LifetimeId
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
        roots: this.lowerChildren(children, { lifetimeId, effects }),
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
    kind: 'forRender' | 'slotRender' | 'collectionRender',
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
    async: boolean
  ): SegmentPlan {
    const references = this.analysis.references.filter((reference) =>
      rangeContains(functionRange, reference.range)
    );
    const parameterSet = new Set(parameterBindingIds);
    const localOwnerIds = new Set(
      this.analysis.bindings.flatMap((binding) =>
        binding.declarationRange !== null && rangeContains(functionRange, binding.declarationRange)
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
      symbolName: id,
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
      awaits: collectAwaitRanges(findNodeByRange(this.component.body, range)),
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
      componentParameter: this.component.shape.parameter,
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
        componentParameter: this.component.shape.parameter,
        captureAccess: (kind, bindingId) => this.captureAccess(kind, bindingId),
      });
      return [plan];
    });
    return [...plans, ...this.syntheticSegments];
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
        this.component.shape.parameter?.bindingIds.includes(bindingId) === true
      );
    }
    if (expression.type !== 'Identifier' || expression.name !== 'children') {
      return false;
    }
    const bindingId = this.bindingIdAt(getRange(expression));
    return (
      bindingId !== null && this.component.shape.parameter?.bindingIds.includes(bindingId) === true
    );
  }

  private retainSetupSegments(lifetimeId: LifetimeId): void {
    for (const segment of this.extracted.segments) {
      if (
        segment.parentId === null &&
        !this.isStyleSegment(segment) &&
        this.component.shape.setup.some((range) => rangeContains(range, segment.range))
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
    if (renderParent !== undefined && segment.parentId === null) {
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
      this.component.shape.parameter?.kind === 'object' &&
      this.component.shape.parameter.bindingIds.includes(bindingId)
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
    lifetimeId: LifetimeId
  ): SegmentReferencePlan[] {
    const candidates = this.extracted.segments.filter(
      (segment) => segment.qrl !== null && rangeContains(range, segment.range)
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

  private isDirectArraySource(expression: AstNode): boolean {
    let valueAccess = false;
    forEachNode(expression, (node) => {
      valueAccess ||=
        node.type === 'MemberExpression' &&
        !node.computed &&
        getIdentifierName(node.property) === 'value';
    });
    return !valueAccess;
  }

  private lowerSetup(lifetimeId: LifetimeId): SetupPlan[] {
    const setup: SetupPlan[] = [];
    for (const range of this.component.shape.setup) {
      const statement = findNodeByRange(this.component.body, range);
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
      if (
        statement?.type !== 'VariableDeclaration' ||
        !statement.declarations.some((declaration) => containsJsx(declaration.init))
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

  private collectUseIds(range: SourceRange) {
    const calls: UseIdPlan[] = [];
    const statement = findNodeByRange(this.component.body, range);
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
    forEachNode(this.component.body, (node) => {
      if (isFunctionLike(node)) {
        const range = getRange(node);
        if (range !== null) {
          nestedFunctionRanges.push(range);
        }
      }
    });
    forEachNode(this.component.body, (node) => {
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
        !this.component.shape.setup.some((range) => rangeContains(range, callRange)) &&
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
      const inSetup = this.component.shape.setup.some((range) => rangeContains(range, callRange));
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
    return this.component.shape.setup.some((range) => {
      const statement = findNodeByRange(this.component.body, range);
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
    const styleId = `${hashCode(
      `${this.component.localName ?? this.component.exportName}_style${index}`
    )}-${index}`;
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
      const statement = findNodeByRange(this.component.body, range);
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

  private classifyFunctionBindings(): void {
    forEachNode(this.component.body, (node) => {
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

  private isSlotBinding(bindingId: BindingId | null): boolean {
    const binding = this.binding(bindingId);
    return isQwikBinding(binding) && binding!.import!.importedName === QwikHooks.Slot;
  }

  private providesContext(): boolean {
    return this.component.shape.setup.some((range) => {
      const setup = findNodeByRange(this.component.body, range);
      return setup !== null && this.containsContextProviderCall(setup);
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
  if (returns.length !== 1 || returns[0].index !== body.body.length - 1) {
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

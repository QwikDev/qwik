import type {
  BindingId,
  ComponentPlan,
  LifetimeId,
  LifetimePlan,
  ModuleAnalysis,
  OrderedPropPlan,
  RenderEffectPlan,
  RenderFunctionPlan,
  RenderNodePlan,
  RenderPlan,
  SegmentReferencePlan,
  ValuePlan,
} from './plan-types';
import type { SourceRange } from './types';
import { QwikHooks } from './words';

export interface ComponentPlanValidationIssue {
  readonly path: string;
  readonly message: string;
}

export function validateComponentPlan(
  plan: ComponentPlan,
  analysis: ModuleAnalysis
): ComponentPlanValidationIssue[] {
  const validator = new ComponentPlanValidator(plan, analysis);
  return validator.validate();
}

class ComponentPlanValidator {
  private readonly issues: ComponentPlanValidationIssue[] = [];
  private readonly bindings: Set<BindingId>;
  private readonly lifetimes = new Map<LifetimeId, LifetimePlan>();
  private readonly segments = new Set<string>();
  private readonly segmentSymbols = new Set<string>();
  private readonly segmentKinds = new Map<string, string>();
  private effects = new Map<number, RenderEffectPlan>();

  constructor(
    private readonly plan: ComponentPlan,
    analysis: ModuleAnalysis
  ) {
    this.bindings = new Set(analysis.bindings.map((binding) => binding.id));
  }

  validate(): ComponentPlanValidationIssue[] {
    this.requireBinding(this.plan.shape.bindingId, 'shape.bindingId');
    this.plan.shape.parameter?.bindingIds.forEach((bindingId, index) =>
      this.requireBinding(bindingId, `shape.parameter.bindingIds[${index}]`)
    );
    this.plan.referenceBindingIds.forEach((bindingId, index) =>
      this.requireBinding(bindingId, `referenceBindingIds[${index}]`)
    );
    this.validateLifetimes();
    this.validateSegments();
    const componentLifetime = this.plan.lifetimes.find(
      (lifetime) => lifetime.owner === 'component'
    );
    if (componentLifetime === undefined) {
      this.issue('lifetimes', 'does not contain a component owner');
      return this.issues;
    }
    for (let index = 0; index < this.plan.setup.length; index++) {
      const setup = this.plan.setup[index];
      this.requireLifetime(setup.lifetimeId, `setup[${index}].lifetimeId`);
      if (setup.lifetimeId !== componentLifetime.id) {
        this.issue(`setup[${index}].lifetimeId`, 'must belong to the component lifetime');
      }
      if (setup.kind === 'render-value') {
        this.requireBinding(setup.bindingId, `setup[${index}].bindingId`);
        this.validateRenderFunction(setup.render, `setup[${index}].render`, componentLifetime.id);
      } else {
        setup.referenceBindingIds.forEach((bindingId, bindingIndex) =>
          this.requireBinding(bindingId, `setup[${index}].referenceBindingIds[${bindingIndex}]`)
        );
      }
    }
    this.validateRender(this.plan.render, 'render', componentLifetime.id);
    return this.issues;
  }

  private validateLifetimes(): void {
    for (let index = 0; index < this.plan.lifetimes.length; index++) {
      const lifetime = this.plan.lifetimes[index];
      const path = `lifetimes[${index}]`;
      if (this.lifetimes.has(lifetime.id)) {
        this.issue(`${path}.id`, `duplicates lifetime ${lifetime.id}`);
      } else {
        this.lifetimes.set(lifetime.id, lifetime);
      }
      if (lifetime.parentId === lifetime.id) {
        this.issue(`${path}.parentId`, 'cannot reference itself');
      }
    }
    for (let index = 0; index < this.plan.lifetimes.length; index++) {
      const lifetime = this.plan.lifetimes[index];
      if (lifetime.parentId !== null) {
        this.requireLifetime(lifetime.parentId, `lifetimes[${index}].parentId`);
      }
      const seen = new Set<LifetimeId>();
      let current: LifetimePlan | undefined = lifetime;
      while (current !== undefined && current.parentId !== null) {
        if (seen.has(current.id)) {
          this.issue(`lifetimes[${index}].parentId`, 'forms a lifetime cycle');
          break;
        }
        seen.add(current.id);
        current = this.lifetimes.get(current.parentId);
      }
    }
    const roots = this.plan.lifetimes.filter((lifetime) => lifetime.parentId === null);
    if (roots.length !== 1 || roots[0].owner !== 'component') {
      this.issue('lifetimes', 'must contain exactly one component root');
    }
  }

  private validateSegments(): void {
    for (let index = 0; index < this.plan.segments.length; index++) {
      const segment = this.plan.segments[index];
      const path = `segments[${index}]`;
      if (this.segments.has(segment.id)) {
        this.issue(`${path}.id`, `duplicates segment "${segment.id}"`);
      }
      this.segments.add(segment.id);
      if (segment.symbolName.length === 0) {
        this.issue(`${path}.symbolName`, 'cannot be empty');
      } else if (this.segmentSymbols.has(segment.symbolName)) {
        this.issue(`${path}.symbolName`, `duplicates symbol "${segment.symbolName}"`);
      }
      this.segmentSymbols.add(segment.symbolName);
      this.segmentKinds.set(segment.id, segment.kind);
      this.requireRange(segment.range, `${path}.range`);
      this.requireRange(segment.functionRange, `${path}.functionRange`);
      this.requireRange(segment.bodyRange, `${path}.bodyRange`);
      if (!containsRange(segment.functionRange, segment.bodyRange)) {
        this.issue(`${path}.bodyRange`, 'must be contained by functionRange');
      }
      if (segment.calleeRange !== null) {
        this.requireRange(segment.calleeRange, `${path}.calleeRange`);
      }
      segment.argumentRanges.forEach((range, argument) => {
        if (range !== null) {
          this.requireRange(range, `${path}.argumentRanges[${argument}]`);
        }
      });
      segment.paramRanges.forEach((range, parameter) =>
        this.requireRange(range, `${path}.paramRanges[${parameter}]`)
      );
      segment.propsParts.forEach((part, partIndex) => {
        if (part.kind !== 'static') {
          this.requireRange(part.range, `${path}.propsParts[${partIndex}].range`);
        }
      });
      if (!segment.async && segment.awaits.length > 0) {
        this.issue(`${path}.async`, 'must be true when await ranges are present');
      }
      if (segment.lifetimeId === null) {
        this.issue(`${path}.lifetimeId`, 'must belong to a component lifetime');
      } else {
        this.requireLifetime(segment.lifetimeId, `${path}.lifetimeId`);
      }
      for (let binding = 0; binding < segment.parameterBindingIds.length; binding++) {
        this.requireBinding(
          segment.parameterBindingIds[binding],
          `${path}.parameterBindingIds[${binding}]`
        );
      }
      for (let binding = 0; binding < segment.usedParameterBindingIds.length; binding++) {
        const bindingId = segment.usedParameterBindingIds[binding];
        this.requireBinding(bindingId, `${path}.usedParameterBindingIds[${binding}]`);
        if (segment.parameterBindingIds[binding] !== bindingId) {
          this.issue(`${path}.usedParameterBindingIds`, 'must be a positional parameter prefix');
          break;
        }
      }
      for (let capture = 0; capture < segment.captures.length; capture++) {
        this.requireBinding(segment.captures[capture].bindingId, `${path}.captures[${capture}]`);
      }
      for (let module = 0; module < segment.moduleReferences.length; module++) {
        this.requireBinding(
          segment.moduleReferences[module].bindingId,
          `${path}.moduleReferences[${module}]`
        );
      }
      for (let reference = 0; reference < segment.references.length; reference++) {
        const bindingId = segment.references[reference].bindingId;
        if (bindingId !== null) {
          this.requireBinding(bindingId, `${path}.references[${reference}].bindingId`);
        }
      }
      if (
        segment.visibleTaskStrategy !== null &&
        segment.ctxName !== QwikHooks.UseVisibleTaskDollar
      ) {
        this.issue(`${path}.visibleTaskStrategy`, 'belongs to a non-visible task segment');
      }
    }
    for (let index = 0; index < this.plan.segments.length; index++) {
      const segment = this.plan.segments[index];
      if (segment.parentId !== null && !this.segments.has(segment.parentId)) {
        this.issue(
          `${`segments[${index}]`}.parentId`,
          `references unknown segment "${segment.parentId}"`
        );
      }
      if (segment.render !== null) {
        if (segment.render.segmentId !== segment.id) {
          this.issue(`segments[${index}].render.segmentId`, 'does not match its owning segment');
        }
        this.validateRenderFunction(segment.render, `segments[${index}].render`);
      }
    }
  }

  private validateRender(render: RenderPlan, path: string, parentLifetimeId: LifetimeId): void {
    const parentEffects = this.effects;
    this.effects = new Map();
    for (let index = 0; index < render.effects.length; index++) {
      const effect = render.effects[index];
      if (this.effects.has(effect.id)) {
        this.issue(`${path}.effects[${index}].id`, `duplicates effect ${effect.id}`);
      }
      this.effects.set(effect.id, effect);
      this.requireLifetime(effect.lifetimeId, `${path}.effects[${index}].lifetimeId`);
      this.validateValue(effect.value, `${path}.effects[${index}].value`);
    }
    for (let index = 0; index < render.roots.length; index++) {
      this.validateNode(render.roots[index], `${path}.roots[${index}]`, parentLifetimeId);
    }
    this.effects = parentEffects;
  }

  private validateNode(node: RenderNodePlan, path: string, parentLifetimeId: LifetimeId): void {
    switch (node.kind) {
      case 'static-text':
        return;
      case 'element':
        this.validateProps(node.props, `${path}.props`, parentLifetimeId);
        if (node.propsEffect !== null) {
          this.validateOwnedLifetime(
            node.propsEffect.lifetimeId,
            parentLifetimeId,
            'effect',
            `${path}.propsEffect`
          );
          this.requireEffect(
            node.propsEffect.effectId,
            node.propsEffect.lifetimeId,
            `${path}.propsEffect.effectId`,
            'props'
          );
          this.validateSegmentReference(node.propsEffect.segment, `${path}.propsEffect.segment`);
          const effect = this.effects.get(node.propsEffect.effectId);
          if (
            effect?.value.kind !== 'segment' ||
            effect.value.segment.segmentId !== node.propsEffect.segment.segmentId
          ) {
            this.issue(`${path}.propsEffect`, 'must match its props effect segment');
          }
        }
        node.children.forEach((child, index) =>
          this.validateNode(child, `${path}.children[${index}]`, parentLifetimeId)
        );
        return;
      case 'dynamic-value':
        this.validateOwnedLifetime(node.lifetimeId, parentLifetimeId, 'dynamic-value', path);
        this.requireEffect(node.effectId, node.lifetimeId, `${path}.effectId`, node.output);
        this.validateValue(node.value, `${path}.value`);
        return;
      case 'component':
        this.validateOwnedLifetime(node.lifetimeId, parentLifetimeId, 'component-call', path);
        if (node.bindingId !== null) {
          this.requireBinding(node.bindingId, `${path}.bindingId`);
        }
        this.validateProps(node.props, `${path}.props`, node.lifetimeId);
        node.slots.forEach((slot, index) => {
          this.validateOwnedLifetime(
            slot.lifetimeId,
            node.lifetimeId,
            'slot',
            `${path}.slots[${index}]`
          );
          this.validateRenderFunction(
            slot.render,
            `${path}.slots[${index}].render`,
            slot.lifetimeId
          );
        });
        return;
      case 'branch':
        this.validateOwnedLifetime(node.lifetimeId, parentLifetimeId, 'branch', path);
        this.validateSegmentReference(node.condition, `${path}.condition`);
        this.validateRenderFunction(node.then, `${path}.then`, node.lifetimeId);
        if (node.else !== null) {
          this.validateRenderFunction(node.else, `${path}.else`, node.lifetimeId);
        }
        return;
      case 'slot':
        this.validateOwnedLifetime(node.lifetimeId, parentLifetimeId, 'slot', path);
        if (node.fallback !== null) {
          this.validateRenderFunction(node.fallback, `${path}.fallback`, node.lifetimeId);
        }
        return;
      case 'collection':
        this.validateOwnedLifetime(node.lifetimeId, parentLifetimeId, 'collection', path);
        this.requireCommit(node.lifetimeId, 'atomic-reconcile', `${path}.lifetimeId`);
        if (node.source.kind === 'derived') {
          this.validateSegmentReference(node.source.segment, `${path}.source.segment`);
          if (this.segmentKinds.get(node.source.segment.segmentId) !== 'collectionSource') {
            this.issue(`${path}.source.segment`, 'must reference a collection source segment');
          }
        }
        if (node.key !== null) {
          this.validateSegmentReference(node.key, `${path}.key`);
        }
        this.validateRenderFunction(node.row, `${path}.row`, node.lifetimeId);
        return;
      default:
        node satisfies never;
        return;
    }
  }

  private validateProps(
    props: readonly OrderedPropPlan[],
    path: string,
    parentLifetimeId: LifetimeId
  ): void {
    let previousStart = -1;
    for (let index = 0; index < props.length; index++) {
      const prop = props[index];
      const propPath = `${path}[${index}]`;
      if (prop.range[0] < previousStart) {
        this.issue(propPath, 'is not in JSX source order');
      }
      previousStart = prop.range[0];
      switch (prop.kind) {
        case 'static':
          break;
        case 'dynamic':
        case 'event':
          this.validateOwnedLifetime(prop.lifetimeId, parentLifetimeId, 'effect', propPath);
          this.requireEffect(prop.effectId, prop.lifetimeId, `${propPath}.effectId`);
          this.validateValue(prop.value, `${propPath}.value`);
          break;
        case 'bind':
          this.validateOwnedLifetime(prop.lifetimeId, parentLifetimeId, 'effect', propPath);
          if (prop.effectId !== null) {
            this.requireEffect(prop.effectId, prop.lifetimeId, `${propPath}.effectId`);
          }
          this.validateValue(prop.value, `${propPath}.value`);
          break;
        case 'ref':
          this.validateValue(prop.value, `${propPath}.value`);
          break;
        case 'spread':
          this.validateOwnedLifetime(prop.lifetimeId, parentLifetimeId, 'effect', propPath);
          this.requireEffect(prop.effectId, prop.lifetimeId, `${propPath}.effectId`);
          this.validateValue(prop.value, `${propPath}.value`);
          break;
        case 'inner-html':
          if (prop.lifetimeId !== null && prop.effectId !== null) {
            this.validateOwnedLifetime(prop.lifetimeId, parentLifetimeId, 'effect', propPath);
            this.requireEffect(prop.effectId, prop.lifetimeId, `${propPath}.effectId`);
            if (isValuePlan(prop.value)) {
              this.validateValue(prop.value, `${propPath}.value`);
            }
          }
          break;
        default:
          prop satisfies never;
          break;
      }
    }
  }

  private validateRenderFunction(
    render: RenderFunctionPlan,
    path: string,
    expectedParentId?: LifetimeId
  ): void {
    const lifetime = this.lifetimes.get(render.lifetimeId);
    if (lifetime === undefined) {
      this.issue(`${path}.lifetimeId`, `references unknown lifetime ${render.lifetimeId}`);
    } else if (lifetime.owner !== 'render-function') {
      this.issue(`${path}.lifetimeId`, 'must reference a render-function owner');
    } else if (expectedParentId !== undefined && lifetime.parentId !== expectedParentId) {
      this.issue(`${path}.lifetimeId`, `must be owned by lifetime ${expectedParentId}`);
    }
    if (render.kind === 'local-jsx') {
      if (render.segmentId !== null) {
        this.issue(`${path}.segmentId`, 'local JSX render functions cannot have a segment');
      }
    } else if (render.segmentId === null || !this.segments.has(render.segmentId)) {
      this.issue(`${path}.segmentId`, `references unknown segment "${render.segmentId}"`);
    }
    for (let index = 0; index < render.parameterBindingIds.length; index++) {
      this.requireBinding(
        render.parameterBindingIds[index],
        `${path}.parameterBindingIds[${index}]`
      );
    }
    for (let index = 0; index < render.referenceBindingIds.length; index++) {
      this.requireBinding(
        render.referenceBindingIds[index],
        `${path}.referenceBindingIds[${index}]`
      );
    }
    for (let index = 0; index < render.setup.length; index++) {
      const setup = render.setup[index];
      if (setup.lifetimeId !== render.lifetimeId) {
        this.issue(`${path}.setup[${index}].lifetimeId`, 'must belong to its render function');
      }
      if (setup.kind === 'statement') {
        setup.referenceBindingIds.forEach((bindingId, bindingIndex) =>
          this.requireBinding(
            bindingId,
            `${path}.setup[${index}].referenceBindingIds[${bindingIndex}]`
          )
        );
      }
    }
    if (render.lifecycleSegmentIds.length > 0) {
      this.issue(`${path}.lifecycleSegmentIds`, 'render functions cannot register lifecycle hooks');
    }
    this.validateRender(render.render, `${path}.render`, render.lifetimeId);
  }

  private validateValue(value: ValuePlan, path: string): void {
    switch (value.kind) {
      case 'segment':
        this.validateSegmentReference(value.segment, `${path}.segment`);
        return;
      case 'expression':
        value.referenceBindingIds.forEach((bindingId, index) =>
          this.requireBinding(bindingId, `${path}.referenceBindingIds[${index}]`)
        );
        value.boundaries.forEach((boundary, index) =>
          this.validateSegmentReference(boundary, `${path}.boundaries[${index}]`)
        );
        return;
      case 'source':
        value.referenceBindingIds.forEach((bindingId, index) =>
          this.requireBinding(bindingId, `${path}.referenceBindingIds[${index}]`)
        );
        return;
      case 'render-value':
        this.requireBinding(value.bindingId, `${path}.bindingId`);
        return;
      default:
        value satisfies never;
        return;
    }
  }

  private validateSegmentReference(reference: SegmentReferencePlan, path: string): void {
    if (!this.segments.has(reference.segmentId)) {
      this.issue(`${path}.segmentId`, `references unknown segment "${reference.segmentId}"`);
    }
    reference.captureBindingIds.forEach((bindingId, index) =>
      this.requireBinding(bindingId, `${path}.captureBindingIds[${index}]`)
    );
    reference.componentPropBindingIds.forEach((bindingId, index) =>
      this.requireBinding(bindingId, `${path}.componentPropBindingIds[${index}]`)
    );
  }

  private validateOwnedLifetime(
    id: LifetimeId,
    parentId: LifetimeId,
    owner: LifetimePlan['owner'],
    path: string
  ): void {
    const lifetime = this.lifetimes.get(id);
    if (lifetime === undefined) {
      this.issue(`${path}.lifetimeId`, `references unknown lifetime ${id}`);
      return;
    }
    if (lifetime.parentId !== parentId) {
      this.issue(`${path}.lifetimeId`, `must be owned by lifetime ${parentId}`);
    }
    if (lifetime.owner !== owner) {
      this.issue(`${path}.lifetimeId`, `must reference a ${owner} owner`);
    }
  }

  private requireEffect(
    id: number,
    lifetimeId: LifetimeId,
    path: string,
    kind?: RenderEffectPlan['kind']
  ): void {
    const effect = this.effects.get(id);
    if (effect === undefined) {
      this.issue(path, `references unknown effect ${id}`);
    } else if (effect.lifetimeId !== lifetimeId) {
      this.issue(path, `effect ${id} belongs to lifetime ${effect.lifetimeId}`);
    } else if (kind !== undefined && effect.kind !== kind) {
      this.issue(path, `effect ${id} must be ${kind}`);
    }
  }

  private requireCommit(id: LifetimeId, commit: LifetimePlan['commit'], path: string): void {
    const lifetime = this.lifetimes.get(id);
    if (lifetime !== undefined && lifetime.commit !== commit) {
      this.issue(path, `must use ${commit} commit`);
    }
  }

  private requireLifetime(id: LifetimeId, path: string): void {
    if (!this.lifetimes.has(id)) {
      this.issue(path, `references unknown lifetime ${id}`);
    }
  }

  private requireBinding(id: BindingId, path: string): void {
    if (!this.bindings.has(id)) {
      this.issue(path, `references unknown binding ${id}`);
    }
  }

  private requireRange(range: SourceRange, path: string): void {
    if (range[0] < 0 || range[1] < range[0]) {
      this.issue(path, 'is not a valid source range');
    }
  }

  private issue(path: string, message: string): void {
    this.issues.push({ path, message });
  }
}

function containsRange(parent: SourceRange, child: SourceRange): boolean {
  return child[0] >= parent[0] && child[1] <= parent[1];
}

function isValuePlan(value: unknown): value is ValuePlan {
  return value !== null && typeof value === 'object' && !Array.isArray(value) && 'kind' in value;
}

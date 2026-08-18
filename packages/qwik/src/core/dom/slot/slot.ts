import type { QRL } from '../../shared/qrl/qrl.public';
import type { FunctionComponent } from '../../shared/jsx/types/jsx-node';
import type { JSXChildren } from '../../shared/jsx/types/jsx-qwik-attributes';
import { isPromise, maybeThen, safeCall } from '../../shared/utils/promises';
import type { ValueOrPromise } from '../../shared/utils/types';
import type { ContainerContext } from '../../runtime/container-context';
import { OwnerFlags } from '../../reactive/flags';
import { runWithCollector } from '../../reactive/tracking';
import {
  getActiveInvokeContext,
  getActiveInvokeContextOrNull,
  invoke,
  newChildInvokeContext,
  type RuntimeInvokeContext,
} from '../../runtime/invoke-context';
import { disposeOwner, getOrCreateContextOwner, type Owner } from '../../runtime/owner';
import { DangerousInnerHTMLAttr, EMPTY_ARRAY, EMPTY_NODES, EMPTY_STRING } from '../../utils/consts';
import { toNodes, type MaybeNodeOutput } from '../../utils/nodes';
import { getFunctionOrResolve } from '../../utils/qrl';
import {
  createSsrElementRecord,
  createSsrNodeId,
  type SsrEventAttrChunk,
  type SsrOutput,
  type SsrRecordPart,
} from '../../ssr/output';
import { applyDomProps, renderDomPropsToString } from '../effect/dom-props';

type SlotRenderFn = (
  ctx: ContainerContext,
  id?: string
) => MaybeNodeOutput | Promise<MaybeNodeOutput>;
type SsrSlotRenderFn = (
  ctx: SsrSlotContext,
  rangeId: number,
  id?: string
) => ValueOrPromise<SsrOutput>;
export type SlotName = string;

export interface Projection {
  renderQrl: unknown;
  owner: Owner | null;
  nodes: readonly Node[] | null;
  slotScope: SlotScope | null;
  idBase: string;
}

export interface SlotScope {
  slots: Map<SlotName, Projection[]>;
}

export interface SsrSlotContext {
  nextId(): number;
}

/**
 * Allows to project the children of the current component. `<Slot/>` can only be used within the
 * context of a component defined with `component$`.
 *
 * @public
 */
export const Slot: FunctionComponent<{
  name?: string;
  children?: JSXChildren;
}> = () => null;

class SlotScopeState implements SlotScope {
  slots = new Map<string, Projection[]>();
}

class ProjectionState implements Projection {
  renderQrl: unknown;
  owner: Owner | null;
  nodes: readonly Node[] | null;
  slotScope: SlotScope | null;
  idBase: string;

  constructor(renderQrl: unknown, slotScope: SlotScope | null, idBase: string) {
    this.renderQrl = renderQrl;
    this.owner = null;
    this.nodes = null;
    this.slotScope = slotScope;
    this.idBase = idBase;
  }
}

export function createSlotScope(): SlotScope {
  return new SlotScopeState();
}

export function isSlotScope(value: unknown): value is SlotScope {
  return value instanceof SlotScopeState;
}

export function createProjection(): Projection {
  return new ProjectionState(null, null, EMPTY_STRING);
}

export function isProjection(value: unknown): value is Projection {
  return value instanceof ProjectionState;
}

export function registerProjection(
  scope: SlotScope,
  name: string,
  renderQrl: unknown,
  slotScope?: SlotScope | null,
  idBase = EMPTY_STRING
): Projection {
  const normalized = name || EMPTY_STRING;
  const registered = new ProjectionState(
    renderQrl,
    slotScope ?? getActiveInvokeContextOrNull()?.slotScope ?? null,
    idBase
  );
  const slots = scope.slots;
  const projections = slots.get(normalized);
  if (projections === undefined) {
    slots.set(normalized, [registered]);
  } else {
    projections.push(registered);
  }
  return registered;
}

export function resolveSlot(
  scope: SlotScope | null,
  name: string = EMPTY_STRING
): readonly Projection[] {
  return scope?.slots.get(name || EMPTY_STRING) ?? EMPTY_ARRAY;
}

export function createSlot(
  name: string = EMPTY_STRING,
  fallback?: SlotRenderFn,
  idBase = EMPTY_STRING
): ValueOrPromise<readonly Node[]> {
  const context = getActiveInvokeContext();
  const projections = resolveSlot(context.slotScope, name);
  if (projections.length === 0) {
    return fallback === undefined
      ? EMPTY_NODES
      : maybeThen(fallback(context.container!, idBase), (output) => toNodes(output));
  }

  const nodes: Node[] = [];
  for (let i = 0; i < projections.length; i++) {
    const output = project(projections[i], context.container!, context);
    if (isPromise(output)) {
      return maybeThen(output, (resolved) => {
        nodes.push(...resolved);
        return projectRemaining(nodes, projections, i + 1, context.container!, context);
      });
    }
    nodes.push(...output);
  }
  return nodes;
}

/**
 * Tags the HTML parser closes itself. Only a runtime tag needs this at render time; the compiler
 * decides it statically for every other element through its own `isVoidTag`, and the two packages
 * share no dependency edge.
 */
const VOID_TAGS = new Set([
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

export interface SsrDynamicTagContext extends SsrSlotContext {
  setRef(value: unknown, nodeId: number): void;
  eventAttr(name: string, value: unknown): SsrEventAttrChunk;
}

type SsrTagRender = (
  props: unknown,
  ctx: SsrDynamicTagContext,
  idBase?: string
) => ValueOrPromise<SsrOutput>;

/**
 * A capitalized tag whose binding is a plain value — `const Tag = props.tag ?? 'h1'`. Only the
 * value says which it is: a string renders an element, anything else renders as a component.
 *
 * The element arm writes its attributes once. A reactive prop re-renders the enclosing component
 * instead of patching the attribute, because a runtime tag has no compiled per-attribute effect.
 */
export function renderSsrDynamicTag(
  tag: unknown,
  props: Record<string, unknown>,
  ctx: SsrDynamicTagContext,
  idBase?: string
): ValueOrPromise<SsrOutput> {
  if (typeof tag !== 'string') {
    return (tag as SsrTagRender)(props, ctx, idBase);
  }
  const { attrs, innerHTML, ref } = renderDomPropsToString(props, ctx.eventAttr);
  const open: SsrRecordPart[] = [`<${tag}`];
  if (ref !== undefined) {
    const nodeId = ctx.nextId();
    open.push(' q:id="', createSsrNodeId(nodeId), '"');
    ctx.setRef(ref, nodeId);
  }
  open.push(...attrs, '>');
  const element = createSsrElementRecord(tag, ...open);
  if (VOID_TAGS.has(tag)) {
    return element;
  }
  // children arrive as the default projection, the same carrier the component arm registers
  const children = innerHTML ?? renderSsrSlot(ctx, '');
  return maybeThen(children, (children) => [element, children, `</${tag}>`]);
}

type CsrTagRender = (
  props: unknown,
  ctx: ContainerContext,
  idBase?: string
) => ValueOrPromise<MaybeNodeOutput>;

/** The client peer of {@link renderSsrDynamicTag}: the same branch, building nodes instead of bytes. */
export function createDynamicTag(
  tag: unknown,
  props: Record<string, unknown>,
  ctx: ContainerContext,
  idBase?: string
): ValueOrPromise<MaybeNodeOutput> {
  if (typeof tag !== 'string') {
    return (tag as CsrTagRender)(props, ctx, idBase);
  }
  const element = ctx.document.createElement(tag);
  applyDomProps(element, props);
  // applyDomProps already wrote dangerouslySetInnerHTML, so projecting on top would duplicate it
  if (VOID_TAGS.has(tag) || props[DangerousInnerHTMLAttr] !== undefined) {
    return element;
  }
  return maybeThen(createSlot(), (children) => {
    for (let i = 0; i < children.length; i++) {
      element.appendChild(children[i]);
    }
    return element;
  });
}

export function renderSsrSlot(
  ctx: SsrSlotContext,
  name: string = EMPTY_STRING,
  fallback?: QRL<SsrSlotRenderFn>,
  invokeContext: RuntimeInvokeContext | null = getActiveInvokeContext(),
  idBase = EMPTY_STRING
): ValueOrPromise<SsrOutput> {
  const context = invokeContext ?? getActiveInvokeContext();
  const projections = resolveSlot(context.slotScope, name);
  if (projections.length === 0) {
    return fallback === undefined
      ? EMPTY_STRING
      : renderSsrProjection(ctx, fallback, null, context, idBase);
  }

  const output: SsrOutput[] = [];
  for (let i = 0; i < projections.length; i++) {
    const projected = renderSsrProjection(
      ctx,
      projections[i].renderQrl,
      projections[i].slotScope,
      context,
      projections[i].idBase
    );
    if (isPromise(projected)) {
      return projected.then((resolved) => {
        output.push(resolved);
        return renderRemainingSsrProjections(ctx, output, projections, i + 1, context);
      });
    }
    output.push(projected);
  }
  return output;
}

function project(
  projection: Projection,
  container: ContainerContext,
  parentInvokeContext: RuntimeInvokeContext | null
): ValueOrPromise<readonly Node[]> {
  if (projection.owner !== null && projection.owner.flags & OwnerFlags.Disposed) {
    projection.owner = null;
    projection.nodes = null;
  }
  if (projection.nodes !== null) {
    return projection.nodes;
  }
  const render = getFunctionOrResolve(
    projection.renderQrl as SlotRenderFn | QRL<SlotRenderFn>,
    container
  );
  return maybeThen(render, (render) => {
    // The QRL may resolve asynchronously, so the caller's context is passed in rather than read
    // from the ambient one, which is already gone by the time this runs.
    const invokeContext = newChildInvokeContext(parentInvokeContext, {
      ownerHost: projection.owner ?? getOrCreateContextOwner(parentInvokeContext),
      container,
      slotScope: projection.slotScope,
    });
    return safeCall(
      // projected content owns its own subscriptions: the consumer's collector must not take them
      () =>
        runWithCollector(null, () => invoke(invokeContext, render, container, projection.idBase)),
      (output) => {
        const nodes = toNodes(output);
        // The cache is dropped only when this owner is disposed, so it must never stay unmaterialized.
        projection.owner = getOrCreateContextOwner(invokeContext);
        projection.nodes = nodes;
        return nodes;
      },
      (error) => {
        if (invokeContext.owner !== null) {
          disposeOwner(invokeContext.owner);
          invokeContext.owner = null;
        }
        throw error;
      }
    );
  });
}

function renderSsrProjection(
  ctx: SsrSlotContext,
  renderQrl: unknown,
  slotScope: SlotScope | null,
  base: RuntimeInvokeContext,
  idBase: string
): ValueOrPromise<SsrOutput> {
  const rangeId = ctx.nextId();
  const render = getFunctionOrResolve(
    renderQrl as SsrSlotRenderFn | QRL<SsrSlotRenderFn>,
    ctx as any
  );
  return maybeThen(render, (render) => {
    const invokeContext = newChildInvokeContext(base, {
      ownerHost: getOrCreateContextOwner(base),
      slotScope,
    });
    return safeCall(
      () => invoke(invokeContext, render, ctx, rangeId, idBase),
      (output) => output,
      (error) => {
        if (invokeContext.owner !== null) {
          disposeOwner(invokeContext.owner);
          invokeContext.owner = null;
        }
        throw error;
      }
    );
  });
}

function projectRemaining(
  nodes: Node[],
  projections: readonly Projection[],
  start: number,
  container: ContainerContext,
  parentInvokeContext: RuntimeInvokeContext | null
): ValueOrPromise<readonly Node[]> {
  for (let i = start; i < projections.length; i++) {
    const projected = project(projections[i], container, parentInvokeContext);
    if (isPromise(projected)) {
      return projected.then((resolved) => {
        nodes.push(...resolved);
        return projectRemaining(nodes, projections, i + 1, container, parentInvokeContext);
      });
    }
    nodes.push(...projected);
  }
  return nodes;
}

function renderRemainingSsrProjections(
  ctx: SsrSlotContext,
  output: SsrOutput[],
  projections: readonly Projection[],
  start: number,
  invokeContext: RuntimeInvokeContext
): ValueOrPromise<SsrOutput> {
  for (let i = start; i < projections.length; i++) {
    const projected = renderSsrProjection(
      ctx,
      projections[i].renderQrl,
      projections[i].slotScope,
      invokeContext,
      projections[i].idBase
    );
    if (isPromise(projected)) {
      return projected.then((resolved) => {
        output.push(resolved);
        return renderRemainingSsrProjections(ctx, output, projections, i + 1, invokeContext);
      });
    }
    output.push(projected);
  }
  return output;
}

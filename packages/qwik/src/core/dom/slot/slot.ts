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
import { MATH_NS, SVG_NS } from '../../shared/utils/markers';
import { toNodes, type MaybeNodeOutput } from '../../utils/nodes';
import { getFunctionOrResolve, readExpression } from '../../utils/qrl';
import { isQrl } from '../../shared/qrl/qrl-utils';
import {
  createContentBlock,
  renderSsrContent,
  type ContentFn,
  type SsrContentFn,
} from '../content/content';
import {
  createSsrOpenTag,
  createSsrNodeId,
  type SsrEventAttrChunk,
  type SsrOutput,
  type SsrRecordPart,
} from '../../ssr/output';
import { applyDomProps, renderDomPropsToString } from '../effect/dom-props';

type SlotRenderFn = (ctx: ContainerContext) => MaybeNodeOutput | Promise<MaybeNodeOutput>;
type SsrSlotRenderFn = (ctx: SsrSlotContext, rangeId: number) => ValueOrPromise<SsrOutput>;
export type SlotName = string;
/** A `q:slot` name: a string, or for `q:slot={expr}` a function the live slot reads tracked. */
type SlotNameSource = string | (() => string) | QRL<() => string>;

export interface Projection {
  renderQrl: unknown;
  owner: Owner | null;
  nodes: readonly Node[] | null;
  slotScope: SlotScope | null;
  name: SlotNameSource;
}

export interface SlotScope {
  projections: Projection[];
  /** Set by a parent with a dynamic name: every slot of the scope becomes a content range. */
  slotContentQrl: QRL<SlotContentFn> | null;
  /** What the parent projected into the default slot, for a consumer that reads `props.children`. */
  children: readonly ChildInfo[] | null;
}

/** @public */
export interface ChildInfo {
  /** A tag name, a component, `"text"` or `"dynamic"`. */
  type: unknown;
}

/** The live-slot segment: the client tail on the client, the server tail on the server. */
type SlotContentFn = ContentFn<[SlotScope, string, SlotRenderFn | null]>;

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
  projections: Projection[] = [];
  constructor(
    public slotContentQrl: QRL<SlotContentFn> | null,
    public children: readonly ChildInfo[] | null
  ) {}
}

class ProjectionState implements Projection {
  owner: Owner | null = null;
  nodes: readonly Node[] | null = null;

  constructor(
    public renderQrl: unknown,
    public slotScope: SlotScope | null,
    public name: SlotNameSource
  ) {}
}

export function createSlotScope(
  slotContentQrl: QRL<SlotContentFn> | null = null,
  children: readonly ChildInfo[] | null = null
): SlotScope {
  return new SlotScopeState(slotContentQrl, children);
}

export function isSlotScope(value: unknown): value is SlotScope {
  return value instanceof SlotScopeState;
}

export function createProjection(): Projection {
  return new ProjectionState(null, null, EMPTY_STRING);
}

export function isProjection(value: unknown): value is ProjectionState {
  return value instanceof ProjectionState;
}

export function registerProjection(
  scope: SlotScope,
  name: SlotNameSource,
  renderQrl: unknown,
  slotScope?: SlotScope | null
): Projection {
  const registered = new ProjectionState(
    renderQrl,
    slotScope ?? getActiveInvokeContextOrNull()?.slotScope ?? null,
    name
  );
  scope.projections.push(registered);
  return registered;
}

export function forwardSlot(
  scope: SlotScope,
  targetName: string = EMPTY_STRING,
  sourceName: string = EMPTY_STRING,
  fallbackQrl?: unknown
): void {
  const source = resolveSlot(getActiveInvokeContext().slotScope, sourceName);
  if (source.length === 0) {
    if (fallbackQrl !== undefined) {
      registerProjection(scope, targetName, fallbackQrl);
    }
    return;
  }
  for (let i = 0; i < source.length; i++) {
    scope.projections.push(
      new ProjectionState(source[i].renderQrl, source[i].slotScope, targetName)
    );
  }
}

/** A dynamic name is read here, under whatever collector the live slot runs with. */
export function resolveSlot(
  scope: SlotScope | null,
  name: string = EMPTY_STRING,
  container?: ContainerContext
): readonly Projection[] {
  const slotName = name || EMPTY_STRING;
  return (
    scope?.projections.filter(({ name }) => {
      const read =
        typeof name === 'string'
          ? name
          : isQrl(name)
            ? readExpression(name as QRL<(...captures: unknown[]) => string>, container)
            : name();
      return (read || EMPTY_STRING) === slotName;
    }) ?? EMPTY_ARRAY
  );
}

/** The client tail of a live slot: projected content hangs off the host, so a swap keeps it. */
export function renderSlotContent(
  container: ContainerContext,
  scope: SlotScope,
  name: string,
  fallback: SlotRenderFn | null
): ValueOrPromise<readonly Node[]> {
  const context = getActiveInvokeContext();
  const host = { ...context, owner: context.ownerHost };
  return renderProjections(resolveSlot(scope, name, container), fallback ?? undefined, host);
}

/** The server tail of a live slot. */
export function renderSsrSlotContent(
  ctx: ContainerContext & SsrSlotContext,
  scope: SlotScope,
  name: string,
  fallback: QRL<SsrSlotRenderFn> | null
): ValueOrPromise<SsrOutput> {
  return renderSsrProjections(
    ctx,
    resolveSlot(scope, name, ctx),
    fallback ?? undefined,
    getActiveInvokeContext()
  );
}

export function createSlot(
  name: string = EMPTY_STRING,
  fallback?: SlotRenderFn
): ValueOrPromise<readonly Node[]> {
  const context = getActiveInvokeContext();
  const scope = context.slotScope;
  if (scope?.slotContentQrl) {
    const container = context.container!;
    const start = container.document.createComment(EMPTY_STRING);
    const end = container.document.createComment(EMPTY_STRING);
    container.scheduler.notify(
      createContentBlock<[SlotScope, string, SlotRenderFn | null]>(
        container,
        start,
        end,
        [scope, name, fallback ?? null],
        scope.slotContentQrl,
        false,
        true
      )
    );
    return [start, end];
  }
  return renderProjections(resolveSlot(scope, name), fallback, context);
}

function renderProjections(
  projections: readonly Projection[],
  fallback: SlotRenderFn | undefined,
  context: RuntimeInvokeContext
): ValueOrPromise<readonly Node[]> {
  if (projections.length === 0) {
    return fallback === undefined
      ? EMPTY_NODES
      : maybeThen(runWithCollector(null, fallback, context.container!), toNodes);
  }
  if (projections.length === 1) {
    return project(projections[0], context.container!, context);
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

type SsrTagRender = (props: unknown, ctx: SsrDynamicTagContext) => ValueOrPromise<SsrOutput>;

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
  ctx: SsrDynamicTagContext
): ValueOrPromise<SsrOutput> {
  if (typeof tag !== 'string') {
    return (tag as SsrTagRender)(props, ctx);
  }
  const { attrs, innerHTML, ref } = renderDomPropsToString(props, ctx.eventAttr);
  const open: SsrRecordPart[] = [`<${tag}`];
  if (ref !== undefined) {
    const nodeId = ctx.nextId();
    open.push(' q:id="', createSsrNodeId(nodeId), '"');
    ctx.setRef(ref, nodeId);
  }
  open.push(...attrs, '>');
  const element = createSsrOpenTag(...open);
  if (VOID_TAGS.has(tag)) {
    return element;
  }
  // children arrive as the default projection, the same carrier the component arm registers
  const children = innerHTML ?? renderSsrSlot(ctx, '');
  return maybeThen(children, (children) => [element, children, `</${tag}>`]);
}

type CsrTagRender = (props: unknown, ctx: ContainerContext) => ValueOrPromise<MaybeNodeOutput>;

/** The client peer of {@link renderSsrDynamicTag}: the same branch, building nodes instead of bytes. */
export function createDynamicTag(
  tag: unknown,
  props: Record<string, unknown>,
  ctx: ContainerContext,
  namespace?: 'svg' | 'math'
): ValueOrPromise<MaybeNodeOutput> {
  if (typeof tag !== 'string') {
    return (tag as CsrTagRender)(props, ctx);
  }
  const element =
    namespace === undefined
      ? ctx.document.createElement(tag)
      : ctx.document.createElementNS(namespace === 'svg' ? SVG_NS : MATH_NS, tag);
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
  invokeContext: RuntimeInvokeContext | null = getActiveInvokeContext()
): ValueOrPromise<SsrOutput> {
  const context = invokeContext ?? getActiveInvokeContext();
  const scope = context.slotScope;
  if (scope?.slotContentQrl) {
    const container = ctx as ContainerContext & SsrSlotContext;
    const id = ctx.nextId();
    const content = renderSsrContent(
      container,
      id,
      [scope, name, fallback ?? null],
      scope.slotContentQrl as QRL<SsrContentFn<unknown[]>>,
      false,
      true
    );
    return maybeThen(content, (output) => ['<!d=', createSsrNodeId(id), '>', output, '<!/d>']);
  }
  return renderSsrProjections(ctx, resolveSlot(scope, name), fallback, context);
}

function renderSsrProjections(
  ctx: SsrSlotContext,
  projections: readonly Projection[],
  fallback: QRL<SsrSlotRenderFn> | undefined,
  context: RuntimeInvokeContext
): ValueOrPromise<SsrOutput> {
  if (projections.length === 0) {
    return fallback === undefined
      ? EMPTY_STRING
      : renderSsrProjection(ctx, fallback, null, context);
  }
  if (projections.length === 1) {
    const projection = projections[0];
    return renderSsrProjection(ctx, projection.renderQrl, projection.slotScope, context);
  }

  const output: SsrOutput[] = [];
  for (let i = 0; i < projections.length; i++) {
    const projected = renderSsrProjection(
      ctx,
      projections[i].renderQrl,
      projections[i].slotScope,
      context
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
      () => runWithCollector(null, () => invoke(invokeContext, render, container)),
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
  base: RuntimeInvokeContext
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
      () => runWithCollector(null, invoke, invokeContext, render, ctx, rangeId),
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
      invokeContext
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

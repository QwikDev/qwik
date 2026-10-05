import { Brand, brandClass } from '../../shared/utils/brand';
import { isDev, isServer } from '@qwik.dev/core/build';
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
import {
  disposeOwner,
  getOrCreateContextOwner,
  registerSubscriberToOwner,
  type Owner,
  runWithOwner,
} from '../../runtime/owner';
import { disposeSubscriber } from '../../reactive/cleanup';
import { isSubscriberDisposed } from '../../runtime/subscriber';
import { DangerousInnerHTMLAttr, EMPTY_ARRAY, EMPTY_NODES, EMPTY_STRING } from '../../utils/consts';
import { MATH_NS, SVG_NS } from '../../shared/utils/markers';
import { toNodes, type MaybeNodeOutput } from '../../utils/nodes';
import { removeInOrder } from '../../utils/array';
import { getFunctionOrResolve, readExpression } from '../../utils/qrl';
import { isQrl } from '../../shared/qrl/qrl-utils';
import {
  ContentBlock,
  ContentSubscription,
  createContentBlock,
  renderSsrContent,
  type ContentFn,
  type SsrContentFn,
  SSRContent,
  SSRContentSubscription,
} from '../content/content';
import {
  createSsrOpenTag,
  createSsrSection,
  createSsrNodeId,
  type SsrEventAttrChunk,
  type SsrOutput,
} from '../../ssr/output';
import { createPropsEffect } from '../effect/effect';
import { renderSsrProps, type DomPropsQrl } from '../effect/ssr-effect';
import { inlinedQrl } from '../../shared/qrl/qrl';
import { registerSingleton } from '../../shared/singletons';
import { whenRootInflated } from '../../runtime/container-context';

type SlotRenderFn = (ctx: ContainerContext) => MaybeNodeOutput | Promise<MaybeNodeOutput>;
type SsrSlotRenderFn = (
  ctx: SsrSlotContext,
  rangeId: number,
  projectionRootId?: number
) => ValueOrPromise<SsrOutput>;
export type SlotName = string;
/** A `q:slot` name: a string, or for `q:slot={expr}` a function the live slot reads tracked. */
type SlotNameSource = string | (() => string) | QRL<() => string>;

export interface Projection {
  renderQrl: unknown;
  /** The owner of the component that declared the content: its lifetime, whoever shows it. */
  host: Owner | null;
  /** The live block of the content, once a consumer has shown it. */
  subscription: ProjectionSubscription | SSRProjectionSubscription | null;
  slotScope: SlotScope | null;
  name: SlotNameSource;
}

export interface SlotScope {
  projections: Projection[];
  /** Set by a parent with a dynamic name: every slot of the scope becomes a content range. */
  slotContentQrl: QRL<SlotContentFn> | null;
  /** What the parent projected into the default slot, read through `useChildrenInfo()`. */
  children: readonly ChildInfo[] | null;
}

/** @public */
export interface ChildInfo {
  /** The `q:type` the parent wrote on that child, when it wrote one. */
  type?: string;
}

/**
 * Describes the children the parent projected into this component's default slot: one entry per
 * child, carrying the `q:type` the parent wrote on it. Render them with `<Slot />`.
 *
 * @public
 */
export const useChildrenInfo = (): readonly ChildInfo[] => {
  const context = getActiveInvokeContextOrNull();
  if (context === null) {
    throw new Error('useChildrenInfo() must be called while a component renders.');
  }
  return context.slotScope?.children ?? EMPTY_ARRAY;
};

/** The live-slot segment: the client tail on the client, the server tail on the server. */
type SlotContentFn = ContentFn<[SlotScope, string, SlotRenderFn | null]>;

export interface SsrSlotContext {
  nextId(): number;
  addRoot(value: unknown): number;
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
}> = /*#__PURE__*/ registerSingleton('Slot', () => () => null);

class SlotScopeState implements SlotScope {
  projections: Projection[] = [];
  constructor(
    public slotContentQrl: QRL<SlotContentFn> | null,
    public children: readonly ChildInfo[] | null
  ) {}
}

class ProjectionState implements Projection {
  subscription: Projection['subscription'] = null;

  constructor(
    public renderQrl: unknown,
    public slotScope: SlotScope | null,
    public name: SlotNameSource,
    public host: Owner | null
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
  return new ProjectionState(null, null, EMPTY_STRING, null);
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
  const context = getActiveInvokeContextOrNull();
  const registered = new ProjectionState(
    renderQrl,
    slotScope ?? context?.slotScope ?? null,
    name,
    getOrCreateContextOwner(context)
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
      new ProjectionState(source[i].renderQrl, source[i].slotScope, targetName, source[i].host)
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

/** A dynamic tag's whole props record rides one props effect. @internal */
export function _tagProps(props: Record<string, unknown>): Record<string, unknown> {
  return props;
}

/**
 * A capitalized tag whose binding is a plain value — `const Tag = props.tag ?? 'h1'`. Only the
 * value says which it is: a string renders an element, anything else renders as a component.
 */
export function renderSsrDynamicTag(
  tag: unknown,
  props: Record<string, unknown>,
  ctx: SsrDynamicTagContext
): ValueOrPromise<SsrOutput> {
  if (typeof tag !== 'string') {
    return (tag as SsrTagRender)(props, ctx);
  }
  const invokeContext = getActiveInvokeContextOrNull();
  const nodeId = ctx.nextId();
  const domProps = renderSsrProps(
    nodeId,
    [props],
    inlinedQrl(_tagProps, '_tagProps') as DomPropsQrl<[Record<string, unknown>]>,
    ctx.eventAttr
  );
  return maybeThen(domProps, ({ attrs, innerHTML, ref }) => {
    if (ref !== undefined) {
      ctx.setRef(ref, nodeId);
    }
    const openParts = [`<${tag} q:id="`, createSsrNodeId(nodeId), '"', ...attrs, '>'] as const;
    // like compiled output, the runtime inserts its scripts and styles around these tags
    const section = tag === 'head' || tag === 'body' ? tag : null;
    const element =
      section === null ? createSsrOpenTag(...openParts) : createSsrSection(section, ...openParts);
    if (VOID_TAGS.has(tag)) {
      return element;
    }
    // children arrive as the default projection, the same carrier the component arm registers
    const children = innerHTML ?? renderSsrSlot(ctx, EMPTY_STRING, undefined, invokeContext);
    const close = section === null ? `</${tag}>` : createSsrSection(`/${section}`, `</${tag}>`);
    return maybeThen(children, (children) => [element, children, close]);
  });
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
  ctx.scheduler.waitFor(createPropsEffect(element, [props], _tagProps, ctx.scheduler).run());
  // the props effect already wrote dangerouslySetInnerHTML, so projecting on top would duplicate it
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
    return renderRegisteredSsrProjection(ctx, projection, context);
  }

  const output: SsrOutput[] = [];
  for (let i = 0; i < projections.length; i++) {
    const projected = renderRegisteredSsrProjection(ctx, projections[i], context);
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

/**
 * Projected content as a block its declaring component owns. The range is not tied to one place:
 * whoever shows the content takes the whole range, and the block keeps rendering into it
 * meanwhile.
 */
export class ProjectionBlock extends ContentBlock<[]> {
  host: Owner | null = null;
  renderOwner: Owner | null = null;

  run(subscription: ContentSubscription<[]>): ValueOrPromise<readonly Node[]> {
    return maybeThen(super.run(subscription), (nodes) => {
      if (this.currentOwner !== null) {
        this.currentOwner.renderParent = this.renderOwner;
        this.currentOwner.projection = this;
      }
      return nodes;
    });
  }

  setRenderOwner(owner: Owner | null): void {
    if (this.currentOwner !== null) {
      this.currentOwner.renderParent = owner;
      this.currentOwner.projection = this;
    }
    const previous = this.renderOwner;
    if (previous === owner) {
      return;
    }
    if (previous !== null) {
      const shown = previous.shownProjections;
      if (shown === this) {
        delete previous.shownProjections;
      } else if (Array.isArray(shown)) {
        removeInOrder(shown, this);
        if (shown.length === 1) {
          previous.shownProjections = shown[0];
        } else if (shown.length === 0) {
          delete previous.shownProjections;
        }
      }
    }
    this.renderOwner = owner;
    if (owner !== null) {
      const shown = owner.shownProjections;
      if (shown === undefined) {
        owner.shownProjections = this;
      } else if (Array.isArray(shown)) {
        shown.push(this);
      } else {
        owner.shownProjections = [shown, this];
      }
    }
  }

  park(): void {
    const container = this.container!;
    const holder = (container.state.detachedProjectionNodes ??=
      this.document.createDocumentFragment());
    if (this.start.parentNode === holder) {
      this.setRenderOwner(null);
      return;
    }
    this.take(holder);
    this.setRenderOwner(null);
  }

  /** The range with everything in it right now, or null when it no longer holds together. */
  take(holder?: DocumentFragment): readonly Node[] | null {
    let last: Node | null = this.start;
    while (last !== null && last !== this.end) {
      last = last.nextSibling;
    }
    if (last === null) {
      return null;
    }
    const previousParent = this.start.parentNode;
    holder ??= this.document.createDocumentFragment();
    let node: Node | null = this.start;
    while (node !== null) {
      const next: Node | null = node === this.end ? null : node.nextSibling;
      holder.appendChild(node);
      node = next;
    }
    if (
      previousParent === this.container?.state.detachedProjectionNodes &&
      previousParent?.firstChild === null
    ) {
      delete this.container.state.detachedProjectionNodes;
    }
    return [holder];
  }
}

/** Consumer ancestors must detach surviving projections before removing their DOM. */
function markShowsProjection(consumer: Owner | null, host: Owner | null): void {
  for (let owner = consumer; owner !== null && owner !== host; owner = owner.parent) {
    owner.flags |= OwnerFlags.ShowsProjection;
  }
}

function project(
  projection: Projection,
  container: ContainerContext,
  parentInvokeContext: RuntimeInvokeContext | null
): ValueOrPromise<readonly Node[]> {
  return maybeThen(
    projection.subscription === null ? null : whenRootInflated(container, projection.subscription),
    () => projectRestored(projection, container, parentInvokeContext)
  );
}

function projectRestored(
  projection: Projection,
  container: ContainerContext,
  parentInvokeContext: RuntimeInvokeContext | null
): ValueOrPromise<readonly Node[]> {
  if (projection.subscription !== null && isSubscriberDisposed(projection.subscription)) {
    return EMPTY_NODES;
  }
  const consumer = getOrCreateContextOwner(parentInvokeContext);
  markShowsProjection(consumer, projection.host);
  const subscription = projection.subscription;
  if (subscription instanceof ProjectionSubscription) {
    subscription.block.setRenderOwner(consumer);
    const shown = subscription.block.take();
    if (shown !== null) {
      return shown;
    }
    disposeSubscriber(subscription);
  }
  const document = container.document;
  const holder = document.createDocumentFragment();
  const start = holder.appendChild(document.createComment(EMPTY_STRING));
  const end = holder.appendChild(document.createComment(EMPTY_STRING));
  const block = new ProjectionBlock(
    document,
    start,
    end,
    [],
    projection.renderQrl as QRL<ContentFn<[]>>,
    newChildInvokeContext(parentInvokeContext, { container, slotScope: projection.slotScope }),
    container,
    false,
    true
  );
  // The declaring component owns the content, so the consumer can stop showing it and keep it.
  projection.subscription = registerSubscriberToOwner(
    new ProjectionSubscription(block, container.scheduler),
    projection.host ?? getOrCreateContextOwner(parentInvokeContext)
  );
  block.host = projection.host;
  block.setRenderOwner(consumer);
  container.scheduler.notify(projection.subscription);
  return [holder];
}

export class ProjectionSubscription extends ContentSubscription<[]> {
  declare readonly block: ProjectionBlock;

  dispose(): void {
    if (this.block !== null) {
      this.block.setRenderOwner(null);
      if (this.block.currentOwner !== null) {
        delete this.block.currentOwner.projection;
      }
    }
    super.dispose();
    const parent = this.block.start.parentNode;
    this.block.start.remove();
    this.block.end.remove();
    if (
      parent === this.block.container?.state.detachedProjectionNodes &&
      parent?.firstChild === null
    ) {
      delete this.block.container.state.detachedProjectionNodes;
    }
  }
}

export class SSRProjectionSubscription extends SSRContentSubscription<[number, number]> {
  constructor(
    content: SSRContent<[number, number]>,
    readonly renderOwner: Owner | null
  ) {
    super(content);
  }
}

function renderRegisteredSsrProjection(
  ctx: SsrSlotContext,
  projection: Projection,
  base: RuntimeInvokeContext
): ValueOrPromise<SsrOutput> {
  const container = ctx as ContainerContext & SsrSlotContext;
  const rangeId = ctx.nextId();
  const consumer = getOrCreateContextOwner(base);
  markShowsProjection(consumer, projection.host);
  const context = newChildInvokeContext(base, { slotScope: projection.slotScope });
  const args: [number, number] = [rangeId, -1];
  const content = new SSRContent<[number, number]>(
    rangeId,
    args,
    projection.renderQrl as QRL<SsrContentFn<[number, number]>>,
    context,
    container,
    false,
    true
  );
  const subscription = new SSRProjectionSubscription(content, consumer);
  projection.subscription = subscription;
  if (isDev && ctx.addRoot === undefined) {
    throw new Error('Missing SSR projection root registration');
  }
  args[1] = ctx.addRoot(subscription);
  return maybeThen(
    runWithOwner(projection.host ?? consumer, () => content.run(undefined, subscription)),
    (output) => {
      if (content.currentOwner !== null) {
        content.currentOwner.renderParent = consumer;
      }
      return output;
    }
  );
}

function renderSsrProjection(
  ctx: SsrSlotContext,
  renderQrl: unknown,
  slotScope: SlotScope | null,
  base: RuntimeInvokeContext
): ValueOrPromise<SsrOutput> {
  const rangeId = ctx.nextId();
  const renderParent = getOrCreateContextOwner(base);
  const render = getFunctionOrResolve(
    renderQrl as SsrSlotRenderFn | QRL<SsrSlotRenderFn>,
    ctx as any
  );
  return maybeThen(render, (render) => {
    const invokeContext = newChildInvokeContext(base, {
      ownerHost: renderParent,
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
    const projected = renderRegisteredSsrProjection(ctx, projections[i], invokeContext);
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

isServer && brandClass(SlotScopeState, Brand.SlotScope);
isServer && brandClass(ProjectionState, Brand.Projection);
isServer && brandClass(SSRProjectionSubscription, Brand.SsrProjectionSubscription);

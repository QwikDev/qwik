import type { QRL } from '../../../shared/qrl/qrl.public';
import type { FunctionComponent } from '../../../shared/jsx/types/jsx-node';
import type { JSXChildren } from '../../../shared/jsx/types/jsx-qwik-attributes';
import { isPromise, maybeThen } from '../../../shared/utils/promises';
import type { ValueOrPromise } from '../../../shared/utils/types';
import type { ContainerContext } from '../../runtime/container-context';
import { OwnerFlags } from '../../reactive/flags';
import {
  getActiveInvokeContext,
  getActiveInvokeContextOrNull,
  invoke,
  newChildInvokeContext,
} from '../../runtime/invoke-context';
import { disposeOwner, type Owner } from '../../runtime/owner';
import { EMPTY_ARRAY, EMPTY_NODES, EMPTY_STRING } from '../../utils/consts';
import { toNodes, type MaybeNodeOutput } from '../../utils/nodes';
import { getFunctionOrResolve } from '../qrl';

type SlotRenderFn = (ctx: ContainerContext) => MaybeNodeOutput | Promise<MaybeNodeOutput>;
type SsrSlotRenderFn = (ctx: SsrSlotContext, rangeId: number) => ValueOrPromise<string>;
export type SlotName = string;

export interface Projection {
  renderQrl: unknown;
  owner: Owner | null;
  nodes: readonly Node[] | null;
  slotScope: SlotScope | null;
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

  constructor(renderQrl: unknown, slotScope: SlotScope | null) {
    this.renderQrl = renderQrl;
    this.owner = null;
    this.nodes = null;
    this.slotScope = slotScope;
  }
}

export function createSlotScope(): SlotScope {
  return new SlotScopeState();
}

export function isSlotScope(value: unknown): value is SlotScope {
  return value instanceof SlotScopeState;
}

export function createProjection(): Projection {
  return new ProjectionState(null, null);
}

export function isProjection(value: unknown): value is Projection {
  return value instanceof ProjectionState;
}

export function registerProjection(
  scope: SlotScope,
  name: string,
  renderQrl: unknown,
  slotScope?: SlotScope | null
): Projection {
  const normalized = name || EMPTY_STRING;
  const registered = new ProjectionState(
    renderQrl,
    slotScope ?? getActiveInvokeContextOrNull()?.slotScope ?? null
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
  fallback?: SlotRenderFn
): ValueOrPromise<readonly Node[]> {
  const context = getActiveInvokeContext();
  const projections = resolveSlot(context.slotScope, name);
  if (projections.length === 0) {
    return fallback === undefined
      ? EMPTY_NODES
      : maybeThen(fallback(context.container!), (output) => toNodes(output));
  }

  const nodes: Node[] = [];
  for (let i = 0; i < projections.length; i++) {
    const output = project(projections[i], context.container!);
    if (isPromise(output)) {
      return maybeThen(output, (resolved) => {
        nodes.push(...resolved);
        return projectRemaining(nodes, projections, i + 1, context.container!);
      });
    }
    nodes.push(...output);
  }
  return nodes;
}

export function renderSsrSlot(
  ctx: SsrSlotContext,
  name: string = EMPTY_STRING,
  fallback?: QRL<SsrSlotRenderFn>
): ValueOrPromise<string> {
  const context = getActiveInvokeContext();
  const projections = resolveSlot(context.slotScope, name);
  if (projections.length === 0) {
    return fallback === undefined ? EMPTY_STRING : renderSsrProjection(ctx, fallback, null);
  }

  let html = EMPTY_STRING;
  for (let i = 0; i < projections.length; i++) {
    const output = renderSsrProjection(ctx, projections[i].renderQrl, projections[i].slotScope);
    if (isPromise(output)) {
      return output.then((resolved) => {
        html += resolved;
        return renderRemainingSsrProjections(ctx, html, projections, i + 1);
      });
    }
    html += output;
  }
  return html;
}

function project(
  projection: Projection,
  container: ContainerContext
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
    const base = getActiveInvokeContextOrNull();
    const invokeContext = newChildInvokeContext(base, {
      ownerHost: projection.owner ?? base,
      container,
      slotScope: projection.slotScope,
    });
    try {
      const output = invoke(invokeContext, render, container);
      return maybeThen(output, (output) => {
        const nodes = toNodes(output);
        projection.owner = invokeContext.owner;
        projection.nodes = nodes;
        return nodes;
      });
    } catch (error) {
      if (invokeContext.owner !== null) {
        disposeOwner(invokeContext.owner);
        invokeContext.owner = null;
      }
      throw error;
    }
  });
}

function renderSsrProjection(
  ctx: SsrSlotContext,
  renderQrl: unknown,
  slotScope: SlotScope | null
): ValueOrPromise<string> {
  const rangeId = ctx.nextId();
  const render = getFunctionOrResolve(
    renderQrl as SsrSlotRenderFn | QRL<SsrSlotRenderFn>,
    ctx as any
  );
  return maybeThen(render, (render) => {
    const base = getActiveInvokeContextOrNull();
    const invokeContext = newChildInvokeContext(base, {
      ownerHost: base,
      slotScope,
    });
    const html = invoke(invokeContext, render, ctx, rangeId);
    return maybeThen(html, (html) => `<!s=${rangeId}>${html}<!/s>`);
  });
}

function projectRemaining(
  nodes: Node[],
  projections: readonly Projection[],
  start: number,
  container: ContainerContext
): ValueOrPromise<readonly Node[]> {
  for (let i = start; i < projections.length; i++) {
    const projected = project(projections[i], container);
    if (isPromise(projected)) {
      return projected.then((resolved) => {
        nodes.push(...resolved);
        return projectRemaining(nodes, projections, i + 1, container);
      });
    }
    nodes.push(...projected);
  }
  return nodes;
}

function renderRemainingSsrProjections(
  ctx: SsrSlotContext,
  html: string,
  projections: readonly Projection[],
  start: number
): ValueOrPromise<string> {
  let output = html;
  for (let i = start; i < projections.length; i++) {
    const projected = renderSsrProjection(ctx, projections[i].renderQrl, projections[i].slotScope);
    if (isPromise(projected)) {
      return projected.then((resolved) =>
        renderRemainingSsrProjections(ctx, output + resolved, projections, i + 1)
      );
    }
    output += projected;
  }
  return output;
}

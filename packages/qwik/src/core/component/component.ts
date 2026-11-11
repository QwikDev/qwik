import { isServer } from '@qwik.dev/core/build';
import { isPromise, maybeThen, thenInLifetime, retryAfterPromise } from '../shared/utils/promises';
import type { ValueOrPromise } from '../shared/utils/types';
import {
  getActiveInvokeContextOrNull,
  invoke,
  newChildInvokeContext,
  type RuntimeInvokeContext,
  type RuntimeContainerContext,
} from '../runtime/invoke-context';
import type { ContainerContext } from '../runtime/container-context';
import type { SlotScope } from '../dom/slot/slot';
import { disposeOwner, getOrCreateContextOwner, type Owner } from '../runtime/owner';
import { untrack } from '../reactive/tracking';
import { isNotReadyError } from '../reactive/not-ready';
import type { NodeOutput } from '../utils/nodes';
import { EMPTY_NODES } from '../utils/consts';
import { applyUseOnToCsrOutput } from '../runtime/use-on';
import { qTest } from '../shared/utils/qdev';
import { isServerPlatform } from '../shared/platform/platform';
import { applyUseOnToSsrOutput } from '../ssr/use-on';
import { ownSsrOutput, type SsrContentContext, type SsrOutput } from '../ssr/output';
import { EMPTY_OBJ } from '../shared/utils/flyweight';
import { handleError } from '../dom/content/catch-boundary';
import { OwnerFlags } from '../reactive/flags';

export type ComponentOutput = NodeOutput | string;
export type ComponentRenderFn<TProps = unknown> = (
  props: TProps
) => ValueOrPromise<ComponentOutput | void>;

export interface ComponentOptions {
  container?: RuntimeContainerContext;
  invokeContext?: RuntimeInvokeContext | null;
  slotScope?: SlotScope | null;
}

export function createComponent<TProps, TRenderContext>(
  render: (props: TProps, context: TRenderContext) => ValueOrPromise<string>,
  props: TProps | null,
  renderContext?: TRenderContext,
  options?: ComponentOptions
): ValueOrPromise<string>;
export function createComponent<TProps, TRenderContext>(
  render: (props: TProps, context: TRenderContext) => readonly Node[] | void,
  props: TProps | null,
  renderContext?: TRenderContext,
  options?: ComponentOptions
): readonly Node[];
export function createComponent<TProps, TRenderContext>(
  render: (props: TProps, context: TRenderContext) => Node | void,
  props: TProps | null,
  renderContext?: TRenderContext,
  options?: ComponentOptions
): Node | readonly Node[];
export function createComponent<TProps, TRenderContext>(
  render: (props: TProps, context: TRenderContext) => NodeOutput | void,
  props: TProps | null,
  renderContext?: TRenderContext,
  options?: ComponentOptions
): NodeOutput;
export function createComponent<TProps, TRenderContext>(
  render: (props: TProps, context: TRenderContext) => ValueOrPromise<ComponentOutput | void>,
  props: TProps | null,
  renderContext?: TRenderContext,
  options?: ComponentOptions
): ValueOrPromise<ComponentOutput | void>;
export function createComponent(
  render: (props: unknown, context: unknown) => ValueOrPromise<ComponentOutput | void>,
  props: unknown,
  renderContext?: unknown,
  options?: ComponentOptions
): ValueOrPromise<ComponentOutput | void> {
  const parentInvokeContext = options?.invokeContext ?? getActiveInvokeContextOrNull();
  // Retries keep the first host when the ambient context changes.
  const ownerHost = getOrCreateContextOwner(parentInvokeContext);
  if (ownerHost?.isCancelled) {
    return EMPTY_NODES;
  }
  const invokeContext = createComponentInvokeContext(parentInvokeContext, ownerHost, options);
  let nodes: ValueOrPromise<ComponentOutput | void>;
  try {
    nodes = runSetup(invokeContext, render, props, renderContext);
  } catch (error) {
    if (!isPromise(error)) {
      return handleComponentError(invokeContext, error);
    }
    return settleComponent(
      error,
      true,
      invokeContext,
      parentInvokeContext,
      render,
      props,
      renderContext,
      options
    );
  }
  if (ownerHost?.isCancelled) {
    if (isPromise(nodes)) {
      nodes.catch(() => {});
    }
    if (invokeContext.owner !== null) {
      disposeOwner(invokeContext.owner);
    }
    return EMPTY_NODES;
  }
  return isPromise(nodes)
    ? settleComponent(
        nodes,
        false,
        invokeContext,
        parentInvokeContext,
        render,
        props,
        renderContext,
        options
      )
    : finalizeOutput(nodes, invokeContext);
}

function settleComponent(
  source: Promise<unknown>,
  isPendingRead: boolean,
  invokeContext: RuntimeInvokeContext,
  parentInvokeContext: RuntimeInvokeContext | null,
  render: (props: unknown, context: unknown) => ValueOrPromise<ComponentOutput | void>,
  props: unknown,
  renderContext: unknown,
  options: ComponentOptions | undefined
): ValueOrPromise<ComponentOutput | void> {
  const ownerHost = invokeContext.ownerHost;
  if (ownerHost?.isCancelled) {
    source.catch(() => {});
    if (invokeContext.owner !== null) {
      disposeOwner(invokeContext.owner);
    }
    return EMPTY_NODES;
  }
  // useOn events reach the scheduler through the component's context, gone after the await.
  const finish = (nodes: ComponentOutput | void) =>
    invoke(invokeContext, finalizeOutput, nodes, invokeContext);
  const retry = (error: unknown): ValueOrPromise<ComponentOutput | void> => {
    const retryRequest = toRetryRequest(error);
    if (!isPromise(retryRequest)) {
      return handleComponentError(invokeContext, error);
    }
    const result = retryAfterPromise(
      ownerHost,
      retryRequest,
      () => {
        invokeContext = createComponentInvokeContext(parentInvokeContext, ownerHost, options);
        return thenInLifetime(
          ownerHost,
          runSetup(invokeContext, render, props, renderContext),
          finish,
          EMPTY_NODES
        );
      },
      EMPTY_NODES
    );
    return isPromise(result) ? result.catch(retry) : result;
  };
  const pending = isPendingRead
    ? retry(source)
    : thenInLifetime(
        ownerHost,
        source as Promise<ComponentOutput | void>,
        finish,
        EMPTY_NODES,
        retry
      );
  if (
    (qTest ? !isServerPlatform() : !isServer) &&
    isPromise(pending) &&
    ownerHost !== null &&
    ownerHost.flags & OwnerFlags.HasCatch
  ) {
    (invokeContext.container as ContainerContext | undefined)?.scheduler.waitFor(
      pending,
      ownerHost
    );
  }
  return pending;
}

/** A setup read of a computed without a value waits for its next one, as a pending read does. */
const toRetryRequest = (error: unknown): unknown =>
  isNotReadyError(error) ? error.source.whenSettled() : error;

function runSetup(
  invokeContext: RuntimeInvokeContext,
  render: (props: unknown, context: unknown) => ValueOrPromise<ComponentOutput | void>,
  props: unknown,
  renderContext: unknown
): ValueOrPromise<ComponentOutput | void> {
  try {
    return untrack(invoke, invokeContext, render, props ?? EMPTY_OBJ, renderContext);
  } catch (error) {
    throw toRetryRequest(error);
  }
}

function createComponentInvokeContext(
  parentInvokeContext: RuntimeInvokeContext | null,
  ownerHost: Owner | null,
  options: ComponentOptions | undefined
): RuntimeInvokeContext {
  const invokeContext = newChildInvokeContext(parentInvokeContext, {
    ownerHost,
    container: options?.container,
    // a component is a slot boundary: without children it has no scope
    slotScope: options?.slotScope ?? null,
  });
  if (
    parentInvokeContext !== null &&
    (parentInvokeContext.useOnEvents !== undefined ||
      parentInvokeContext.inheritedUseOnEvents !== undefined)
  ) {
    const inherited = parentInvokeContext.inheritedUseOnEvents;
    invokeContext.inheritedUseOnEvents =
      parentInvokeContext.useOnEvents === undefined
        ? inherited
        : inherited === undefined
          ? [parentInvokeContext.useOnEvents]
          : [parentInvokeContext.useOnEvents, ...inherited];
  }
  return invokeContext;
}

function handleComponentError(
  invokeContext: RuntimeInvokeContext,
  error: unknown
): ValueOrPromise<ComponentOutput> {
  let handled: ValueOrPromise<void>;
  try {
    handled = handleError(invokeContext.ownerHost, error);
  } finally {
    if (invokeContext.owner !== null) {
      disposeOwner(invokeContext.owner);
      invokeContext.owner = null;
    }
  }
  if ((qTest ? !isServerPlatform() : !isServer) && isPromise(handled)) {
    (invokeContext.container as ContainerContext | undefined)?.scheduler.waitFor(
      handled,
      invokeContext.ownerHost
    );
  }
  return maybeThen(handled, () => EMPTY_NODES);
}

function finalizeOutput(
  output: ComponentOutput | void,
  invokeContext: RuntimeInvokeContext
): ComponentOutput {
  const normalized = (qTest ? isServerPlatform() : isServer)
    ? (ownSsrOutput((output ?? EMPTY_NODES) as SsrOutput, invokeContext) as ComponentOutput)
    : (output ?? EMPTY_NODES);
  const useOnEvents = invokeContext.useOnEvents;
  const container = invokeContext.container;
  if (useOnEvents === undefined || container === undefined) {
    return normalized;
  }
  if (qTest ? isServerPlatform() : isServer) {
    const eventAttr = (container as SsrContentContext).eventAttr!;
    return applyUseOnToSsrOutput(
      normalized as SsrOutput,
      useOnEvents,
      eventAttr
    ) as ComponentOutput;
  }
  if (invokeContext.hasUseOnRoot) {
    return normalized;
  }
  return applyUseOnToCsrOutput(
    normalized as NodeOutput,
    useOnEvents,
    container.document!
  ) as ComponentOutput;
}

import { isServer } from '@qwik.dev/core/build';
import { isPromise } from '../shared/utils/promises';
import type { ValueOrPromise } from '../shared/utils/types';
import {
  getActiveInvokeContextOrNull,
  invoke,
  newChildInvokeContext,
  type RuntimeInvokeContext,
} from '../runtime/invoke-context';
import type { ContainerContext } from '../runtime/container-context';
import type { SlotScope } from '../dom/slot/slot';
import { disposeOwner, getOrCreateContextOwner } from '../runtime/owner';
import { untrack } from '../reactive/tracking';
import type { NodeOutput } from '../utils/nodes';
import { EMPTY_NODES } from '../utils/consts';
import { applyUseOnToCsrOutput } from '../runtime/use-on';
import { qTest } from '../shared/utils/qdev';
import { isServerPlatform } from '../shared/platform/platform';
import { applyUseOnToSsrOutput } from '../ssr/use-on';
import type { SsrEventAttrChunk, SsrOutput } from '../ssr/output';

export type ComponentOutput = NodeOutput | string;
export type ComponentRenderFn<TProps = unknown> = (
  props: TProps
) => ValueOrPromise<ComponentOutput | void>;

export interface ComponentOptions {
  container?: ContainerContext;
  invokeContext?: RuntimeInvokeContext | null;
  slotScope?: SlotScope | null;
}

export function createComponent<TProps>(
  props: TProps,
  render: (props: TProps) => ValueOrPromise<string>,
  options?: ComponentOptions
): ValueOrPromise<string>;
export function createComponent<TProps>(
  props: TProps,
  render: (props: TProps) => readonly Node[] | void,
  options?: ComponentOptions
): readonly Node[];
export function createComponent<TProps>(
  props: TProps,
  render: (props: TProps) => Node | void,
  options?: ComponentOptions
): Node | readonly Node[];
export function createComponent<TProps>(
  props: TProps,
  render: (props: TProps) => NodeOutput | void,
  options?: ComponentOptions
): NodeOutput;
export function createComponent<TProps>(
  props: TProps,
  render: ComponentRenderFn<TProps>,
  options?: ComponentOptions
): ValueOrPromise<ComponentOutput | void>;
export function createComponent<TProps>(
  props: TProps,
  render: ComponentRenderFn<TProps>,
  options?: ComponentOptions
): ValueOrPromise<ComponentOutput | void> {
  const parentInvokeContext =
    options !== undefined && options.invokeContext
      ? options.invokeContext
      : getActiveInvokeContextOrNull();
  const invokeContext = newChildInvokeContext(parentInvokeContext, {
    ownerHost: getOrCreateContextOwner(parentInvokeContext),
    container: options?.container,
    slotScope: options?.slotScope,
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

  let nodes: ValueOrPromise<ComponentOutput | void>;
  try {
    nodes = untrack(invoke, invokeContext, render, props);
  } catch (error) {
    if (invokeContext.owner !== null) {
      disposeOwner(invokeContext.owner);
      invokeContext.owner = null;
    }
    throw error;
  }
  if (isPromise(nodes)) {
    return nodes.then(
      (nodes) => finalizeOutput(nodes, invokeContext),
      (error) => {
        if (invokeContext.owner !== null) {
          disposeOwner(invokeContext.owner);
          invokeContext.owner = null;
        }
        throw error;
      }
    );
  }

  return finalizeOutput(nodes, invokeContext);
}

function finalizeOutput(
  output: ComponentOutput | void,
  invokeContext: RuntimeInvokeContext
): ComponentOutput {
  const normalized = output ?? EMPTY_NODES;
  const useOnEvents = invokeContext.useOnEvents;
  const container = invokeContext.container;
  if (useOnEvents === undefined || container === undefined) {
    return normalized;
  }
  if (qTest ? isServerPlatform() : isServer) {
    const eventAttr = (
      container as unknown as {
        eventAttr(name: string, value: unknown): SsrEventAttrChunk;
      }
    ).eventAttr;
    return applyUseOnToSsrOutput(
      normalized as SsrOutput,
      useOnEvents,
      eventAttr
    ) as ComponentOutput;
  }
  return applyUseOnToCsrOutput(
    normalized as NodeOutput,
    useOnEvents,
    container.document
  ) as ComponentOutput;
}

import { isPromise } from '../../shared/utils/promises';
import {
  getActiveInvokeContextOrNull,
  invoke,
  newChildInvokeContext,
  type ChildInvokeContextOptions,
  type RuntimeInvokeContext,
  type SlotScope,
} from '../runtime/invoke-context';
import type { ContainerContext } from '../runtime/container-context';
import { disposeOwner } from '../runtime/owner';
import { runWithCollector } from '../reactive/tracking';

export type ComponentOutput = readonly Node[] | string;
export type ComponentRenderOutput = ComponentOutput | void;
export type ComponentRenderFn<TProps = unknown> = (props: TProps) => ComponentRenderOutput;

export interface ComponentOptions {
  container?: ContainerContext;
  idPrefix?: string;
  invokeContext?: RuntimeInvokeContext | null;
  slotScope?: SlotScope | null;
}

const EMPTY_NODES: readonly Node[] = [];

export function createComponent<TProps>(
  props: TProps,
  render: (props: TProps) => string,
  options?: ComponentOptions
): string;
export function createComponent<TProps>(
  props: TProps,
  render: (props: TProps) => readonly Node[] | void,
  options?: ComponentOptions
): readonly Node[];
export function createComponent<TProps>(
  props: TProps,
  render: ComponentRenderFn<TProps>,
  options?: ComponentOptions
): ComponentOutput;
export function createComponent<TProps>(
  props: TProps,
  render: ComponentRenderFn<TProps>,
  options?: ComponentOptions
): ComponentOutput {
  return runComponent(props, render, options);
}

function runComponent<TProps>(
  props: TProps,
  render: ComponentRenderFn<TProps>,
  options: ComponentOptions | undefined
): ComponentOutput {
  const parentInvokeContext =
    options !== undefined && 'invokeContext' in options
      ? (options.invokeContext ?? null)
      : getActiveInvokeContextOrNull();
  const invokeContext = newChildInvokeContext(
    parentInvokeContext,
    createComponentInvokeOptions(options)
  );

  let nodes: ComponentRenderOutput;
  try {
    nodes = runWithCollector(null, invoke, invokeContext, render, props);
  } catch (error) {
    if (invokeContext.owner !== null) {
      disposeOwner(invokeContext.owner);
    }
    throw error;
  }
  if (isPromise(nodes)) {
    if (invokeContext.owner !== null) {
      disposeOwner(invokeContext.owner);
    }
    throw new Error('Component renderer must be synchronous');
  }

  return nodes ?? EMPTY_NODES;
}

function createComponentInvokeOptions(
  options: ComponentOptions | undefined
): ChildInvokeContextOptions {
  const invokeOptions: ChildInvokeContextOptions = {};

  if (options !== undefined) {
    invokeOptions.container = options.container;
  }
  if (options !== undefined) {
    invokeOptions.idPrefix = options.idPrefix;
  }
  if (options !== undefined) {
    invokeOptions.slotScope = options.slotScope;
  }

  return invokeOptions;
}

import { isPromise } from '../../shared/utils/promises';
import type { ValueOrPromise } from '../../shared/utils/types';
import {
  getActiveInvokeContextOrNull,
  invoke,
  newChildInvokeContext,
  type RuntimeInvokeContext,
  type SlotScope,
} from '../runtime/invoke-context';
import type { ContainerContext } from '../runtime/container-context';
import { disposeOwner } from '../runtime/owner';
import { runWithCollector } from '../reactive/tracking';
import type { NodeOutput } from '../utils/nodes';
import { EMPTY_NODES } from '../utils/consts';

export type ComponentOutput = NodeOutput | string;
export type ComponentRenderOutput = ValueOrPromise<ComponentOutput | void>;
export type ComponentRenderFn<TProps = unknown> = (props: TProps) => ComponentRenderOutput;

export interface ComponentOptions {
  container?: ContainerContext;
  idPrefix?: string;
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
): ComponentRenderOutput;
export function createComponent<TProps>(
  props: TProps,
  render: ComponentRenderFn<TProps>,
  options?: ComponentOptions
): ComponentRenderOutput {
  return runComponent(props, render, options);
}

function runComponent<TProps>(
  props: TProps,
  render: ComponentRenderFn<TProps>,
  options: ComponentOptions | undefined
): ComponentRenderOutput {
  const parentInvokeContext =
    options !== undefined && 'invokeContext' in options
      ? (options.invokeContext ?? null)
      : getActiveInvokeContextOrNull();
  const invokeContext = newChildInvokeContext(parentInvokeContext, options);

  let nodes: ComponentRenderOutput;
  try {
    nodes = runWithCollector(null, invoke, invokeContext, render, props);
  } catch (error) {
    if (invokeContext.owner !== null) {
      disposeOwner(invokeContext.owner);
      invokeContext.owner = null;
    }
    throw error;
  }
  if (isPromise(nodes)) {
    return nodes.then(
      (nodes) => nodes ?? EMPTY_NODES,
      (error) => {
        if (invokeContext.owner !== null) {
          disposeOwner(invokeContext.owner);
          invokeContext.owner = null;
        }
        throw error;
      }
    );
  }

  return nodes ?? EMPTY_NODES;
}

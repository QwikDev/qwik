import { isPromise } from '../../shared/utils/promises';
import {
  createChildRenderContext,
  getActiveRenderContextOrNull,
  runWithRenderContext,
  type RenderContext,
  type SlotScope,
} from './render-context';
import { runWithCollector } from './tracking';

export type ComponentOutput = readonly Node[] | string;
export type ComponentRenderOutput = ComponentOutput | void;
export type ComponentRenderFn<TProps = unknown> = (props: TProps) => ComponentRenderOutput;

export interface ComponentOptions {
  idPrefix?: string;
  renderContext?: RenderContext | null;
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
  const parentRenderContext =
    options?.renderContext === undefined ? getActiveRenderContextOrNull() : options.renderContext;
  const renderContext = createChildRenderContext(parentRenderContext, {
    idPrefix: options?.idPrefix,
    slotScope: options?.slotScope,
  });

  const nodes = runWithCollector(null, runComponentRenderer, renderContext, render, props);
  if (isPromise(nodes)) {
    throw new Error('Component renderer must be synchronous');
  }

  return nodes ?? EMPTY_NODES;
}

function runComponentRenderer<TProps>(
  renderContext: RenderContext,
  render: ComponentRenderFn<TProps>,
  props: TProps
): ComponentRenderOutput {
  return runWithRenderContext(renderContext, render, props);
}

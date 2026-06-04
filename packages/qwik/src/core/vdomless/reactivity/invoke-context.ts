import type { Container } from '../../shared/types';
import { createOwner, type Owner } from './owner';

export type ContextKey = string;
export type SlotName = string;

export interface ContextScope {
  id: string | null;
  parent: ContextScope | null;
  values: Map<ContextKey, unknown>;
}

export interface SlotScope {
  id: string | null;
  slots: Map<SlotName, unknown>;
}

export interface RuntimeInvokeContext {
  owner: Owner | null;
  container: Container | undefined;
  idPrefix: string;
  contextScope: ContextScope | null;
  localContextScope: ContextScope | null;
  slotScope: SlotScope | null;
}

export interface NewInvokeContextOptions {
  owner?: Owner | null;
  container?: Container;
  idPrefix?: string;
  contextScope?: ContextScope | null;
  localContextScope?: ContextScope | null;
  slotScope?: SlotScope | null;
}

export interface ChildInvokeContextOptions {
  container?: Container;
  idPrefix?: string;
  contextScope?: ContextScope | null;
  slotScope?: SlotScope | null;
}

let activeInvokeContext: RuntimeInvokeContext | null = null;

export function getActiveInvokeContext(): RuntimeInvokeContext {
  const context = activeInvokeContext;
  if (context === null) {
    throw new Error('Missing active invoke context');
  }

  return context;
}

export function getActiveInvokeContextOrNull(): RuntimeInvokeContext | null {
  return activeInvokeContext;
}

export function newInvokeContext(options?: NewInvokeContextOptions): RuntimeInvokeContext {
  return {
    owner: options?.owner ?? null,
    container: options?.container,
    idPrefix: options?.idPrefix ?? '',
    contextScope: options?.contextScope ?? null,
    localContextScope: options?.localContextScope ?? null,
    slotScope: options?.slotScope ?? null,
  };
}

export function newChildInvokeContext(
  base: RuntimeInvokeContext | null = activeInvokeContext,
  options?: ChildInvokeContextOptions
): RuntimeInvokeContext {
  const owner = createOwner(base?.owner ?? null);
  return newInvokeContext({
    owner,
    container: options?.container ?? base?.container,
    idPrefix: options?.idPrefix ?? base?.idPrefix,
    contextScope: options?.contextScope ?? base?.contextScope ?? null,
    localContextScope: null,
    slotScope: options?.slotScope ?? base?.slotScope ?? null,
  });
}

export function invoke<T, TArgs extends unknown[]>(
  context: RuntimeInvokeContext | null,
  run: (...args: TArgs) => T,
  ...args: TArgs
): T {
  return invokeApply(context, run, args);
}

export function invokeApply<T, TArgs extends unknown[]>(
  context: RuntimeInvokeContext | null,
  run: (...args: TArgs) => T,
  args?: TArgs
): T {
  const previous = activeInvokeContext;
  activeInvokeContext = context;

  try {
    return run.apply(undefined, args ?? ([] as unknown as TArgs));
  } finally {
    activeInvokeContext = previous;
  }
}

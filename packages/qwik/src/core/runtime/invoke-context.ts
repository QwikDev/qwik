import type { ContainerContext } from './container-context';
import type { ContextScope } from './context-scope';
import type { Owner } from './owner';
import type { SlotScope } from '../dom/slot/slot';
import type { UseOnMap } from './use-on';

export interface RuntimeInvokeContext {
  owner: Owner | null;
  // Parent owner for a lazy owner before it exists. Once materialized,
  // Owner.parent is the source of truth.
  ownerHost: Owner | null;
  container: ContainerContext | undefined;
  contextScope: ContextScope | null;
  localContextScope: ContextScope | null;
  slotScope: SlotScope | null;
  useOnEvents?: UseOnMap;
  inheritedUseOnEvents?: readonly UseOnMap[];
  styleScopes?: string[];
}

export interface NewInvokeContextOptions {
  owner?: Owner | null;
  ownerHost?: Owner | null;
  container?: ContainerContext;
  contextScope?: ContextScope | null;
  localContextScope?: ContextScope | null;
  slotScope?: SlotScope | null;
}

export interface ChildInvokeContextOptions {
  ownerHost?: Owner | null;
  container?: ContainerContext;
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

export function getActiveOwnerScope(): Owner | null {
  return activeInvokeContext?.owner ?? null;
}

export function setActiveInvokeContext(context: RuntimeInvokeContext | null): void {
  activeInvokeContext = context;
}

export function newInvokeContext(options?: NewInvokeContextOptions): RuntimeInvokeContext {
  return {
    owner: options?.owner ?? null,
    ownerHost: options?.ownerHost ?? null,
    container: options?.container,
    contextScope: options?.contextScope ?? null,
    localContextScope: options?.localContextScope ?? null,
    slotScope: options?.slotScope ?? null,
  };
}

export function newChildInvokeContext(
  base: RuntimeInvokeContext | null = activeInvokeContext,
  options?: ChildInvokeContextOptions
): RuntimeInvokeContext {
  return newInvokeContext({
    owner: null,
    ownerHost: options?.ownerHost ?? base?.owner ?? null,
    container: options?.container ?? base?.container,
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

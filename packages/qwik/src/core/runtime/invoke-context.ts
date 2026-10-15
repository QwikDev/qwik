import type { ContainerContext } from './container-context';
import type { SsrContentContext } from '../ssr/output';

import type { ContextScope } from './context-scope';
import type { Owner } from './owner';
import type { VisibleTaskSubscription } from './task';
import type { SlotScope } from '../dom/slot/slot';
import type { UseOnMap } from './use-on';
import { registerSingleton } from '../shared/singletons';

export type RuntimeContainerContext = ContainerContext | SsrContentContext;

export interface RuntimeInvokeContext<C extends RuntimeContainerContext = RuntimeContainerContext> {
  owner: Owner | null;
  // Parent owner for a lazy owner before it exists. Once materialized,
  // Owner.parent is the source of truth.
  ownerHost: Owner | null;
  container: C | undefined;
  contextScope: ContextScope | null;
  localContextScope: ContextScope | null;
  slotScope: SlotScope | null;
  useOnEvents?: UseOnMap;
  inheritedUseOnEvents?: readonly UseOnMap[];
  /** Visible tasks per trigger event; one handler starts a whole group together. */
  visibleTaskGroups?: Record<string, VisibleTaskSubscription[]>;
  styleScopes?: string[];
  /** Work that hooks chain here, which a compiled render waits on before it commits. */
  pendingSetup?: Promise<void>;
  hasCatchErrorHandler?: boolean;
  /** The server render's `useId` counter; a client render counts on its container instead. */
  ids?: { next: number };
}

export interface NewInvokeContextOptions<
  C extends RuntimeContainerContext = RuntimeContainerContext,
> {
  owner?: Owner | null;
  ownerHost?: Owner | null;
  container?: C;
  ids?: { next: number };
  contextScope?: ContextScope | null;
  localContextScope?: ContextScope | null;
  slotScope?: SlotScope | null;
}

export interface ChildInvokeContextOptions {
  ownerHost?: Owner | null;
  container?: RuntimeContainerContext;
  contextScope?: ContextScope | null;
  slotScope?: SlotScope | null;
}

const invokeState = /*#__PURE__*/ registerSingleton('v3.invokeContext', () => ({
  current: null as RuntimeInvokeContext | null,
}));

export function getActiveInvokeContext<
  C extends RuntimeContainerContext = RuntimeContainerContext,
>(): RuntimeInvokeContext<C> {
  const context = invokeState.current;
  if (context === null) {
    throw new Error('Missing active invoke context');
  }

  return context as RuntimeInvokeContext<C>;
}

export function getActiveInvokeContextOrNull<
  C extends RuntimeContainerContext = RuntimeContainerContext,
>(): RuntimeInvokeContext<C> | null {
  return invokeState.current as RuntimeInvokeContext<C> | null;
}

export function getActiveOwnerScope(): Owner | null {
  return invokeState.current?.owner ?? null;
}

export function setActiveInvokeContext(context: RuntimeInvokeContext | null): void {
  invokeState.current = context;
}

export function newInvokeContext<C extends RuntimeContainerContext = RuntimeContainerContext>(
  options?: NewInvokeContextOptions<C>
): RuntimeInvokeContext<C> {
  return {
    owner: options?.owner ?? null,
    ownerHost: options?.ownerHost ?? null,
    container: options?.container,
    contextScope: options?.contextScope ?? null,
    localContextScope: options?.localContextScope ?? null,
    slotScope: options?.slotScope ?? null,
    ids: options?.ids,
  };
}

export function newChildInvokeContext(
  base: RuntimeInvokeContext | null = invokeState.current,
  options?: ChildInvokeContextOptions
): RuntimeInvokeContext {
  return newInvokeContext({
    owner: null,
    ownerHost: options?.ownerHost ?? base?.owner ?? null,
    container: options?.container ?? base?.container,
    ids: base?.ids,
    contextScope: options?.contextScope ?? base?.contextScope ?? null,
    localContextScope: null,
    // a projection renders under the scope it was registered in, so an explicit null means none:
    // inheriting the consumer's scope would let a projected <Slot/> resolve to itself
    slotScope: options?.slotScope === undefined ? (base?.slotScope ?? null) : options.slotScope,
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
  const previous = invokeState.current;
  invokeState.current = context;

  try {
    return run.apply(undefined, args ?? ([] as unknown as TArgs));
  } finally {
    invokeState.current = previous;
  }
}

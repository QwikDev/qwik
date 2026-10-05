import { Brand, brandClass } from '../shared/utils/brand';
import { isServer } from '@qwik.dev/core/build';
import { removeInOrder } from '../utils/array';
import { disposeSubscriber, runSubscriberCleanups } from '../reactive/cleanup';
import { OwnerFlags } from '../reactive/flags';
import {
  getActiveOwnerScope,
  getActiveInvokeContextOrNull,
  invoke,
  newInvokeContext,
  type RuntimeInvokeContext,
} from './invoke-context';
import type { Subscriber } from './subscriber';
import { isPromise } from '../shared/utils/promises';
import type { ValueOrPromise } from '../shared/utils/types';
import { runWithCollector } from '../reactive/tracking';

import type { ProjectionBlock } from '../dom/slot/slot';

export type OwnerItem = Owner | Subscriber;
export type OwnerItems = OwnerItem | OwnerItem[] | null;
export type PendingWork = { promise: Promise<unknown>; cancel: () => void };

const resumedPositions = new WeakMap<OwnerItem, number>();

export function isResumeOwnerClosed(owner: Owner): boolean {
  return (owner.flags & (OwnerFlags.Disposed | OwnerFlags.ResumeClosed)) !== 0;
}

export function restoreOwnerItemOrder(item: OwnerItem, owner: Owner, position: number): void {
  resumedPositions.set(item, position);
  const items = owner.items;
  if (!Array.isArray(items)) {
    return;
  }
  const index = items.indexOf(item);
  if (index === -1) {
    return;
  }
  items.splice(index, 1);
  let next = 0;
  while (next < items.length && (resumedPositions.get(items[next]) ?? Infinity) < position) {
    next++;
  }
  items.splice(next, 0, item);
}

// Owners are lifetime scopes for reactive work. Anything that can become a
// subscriber should be owned so it can be disposed and removed from sources.
export class Owner {
  parent: Owner | null = null;
  renderParent?: Owner | null;
  declare projection?: ProjectionBlock;
  declare shownProjections?: ProjectionBlock | ProjectionBlock[];
  declare pendingPhases?: PendingWork;
  declare pendingWork?: Map<Promise<unknown>, PendingWork>;
  items: OwnerItems = null;
  flags = OwnerFlags.None;
}

export function createOwner(parent?: Owner | null): Owner {
  const owner = new Owner();
  const resolvedParent = arguments.length === 0 ? getOrCreateActiveOwnerOrNull() : (parent ?? null);

  registerOwnerToOwner(owner, resolvedParent);
  return owner;
}

export function getActiveOwner(): Owner | null {
  return getActiveOwnerScope();
}

/** Whether removing this scope must preserve projections owned outside it. */
export function showsProjection(owner: Owner | null): boolean {
  return owner !== null && (owner.flags & OwnerFlags.ShowsProjection) !== 0;
}

export function getOrCreateContextOwner(context: RuntimeInvokeContext | null): Owner | null {
  return context === null ? null : materializeContextOwner(context);
}

// Runs creation code under a lifetime owner. This intentionally clears the
// active collector: owner scope decides what gets disposed together, while the
// collector decides which source reads become dependencies.
export function runWithOwner<T, TArgs extends unknown[]>(
  owner: Owner | null,
  run: (...args: TArgs) => T,
  ...args: TArgs
): T {
  const activeContext = getActiveInvokeContextOrNull();
  const context = newInvokeContext({
    owner,
    container: activeContext?.container,
    contextScope: activeContext?.contextScope,
    localContextScope: activeContext?.localContextScope,
    slotScope: activeContext?.slotScope,
  });
  return runWithCollector(null, invoke, context, run, ...args);
}

export function registerSubscriberToOwner<T extends Subscriber>(
  subscriber: T,
  owner?: Owner | null
): T {
  const resolvedOwner = arguments.length === 1 ? getOrCreateActiveOwnerOrThrow() : (owner ?? null);

  if (resolvedOwner === null) {
    throw new Error('Missing owner for subscriber');
  }

  if (resolvedOwner.flags & OwnerFlags.Disposed) {
    disposeSubscriber(subscriber);
    return subscriber;
  }

  const currentOwner = subscriber.owner;
  if (currentOwner === resolvedOwner) {
    return subscriber;
  }
  if (currentOwner !== null) {
    detachSubscriberFromOwner(subscriber, currentOwner);
  }

  // Already detached above, so membership never needs a scan for duplicates.
  subscriber.owner = resolvedOwner;
  appendOwnerItem(resolvedOwner, subscriber);

  return subscriber;
}

export function ownerItemsLength(items: OwnerItems): number {
  return items === null ? 0 : Array.isArray(items) ? items.length : 1;
}

export function ownerItemAt(
  items: Exclude<OwnerItems, null>,
  index: number
): OwnerItem | undefined {
  return Array.isArray(items) ? items[index] : index === 0 ? items : undefined;
}

function appendOwnerItem(owner: Owner, item: OwnerItem): void {
  const items = owner.items;
  if (items === null) {
    owner.items = item;
  } else if (Array.isArray(items)) {
    items.push(item);
  } else {
    owner.items = [items, item];
  }
}

function removeOwnerItem(owner: Owner, item: OwnerItem): void {
  const items = owner.items;
  if (items === null) {
    return;
  }
  if (!Array.isArray(items)) {
    if (items === item) {
      owner.items = null;
    }
    return;
  }
  if (!removeInOrder(items, item)) {
    return;
  }
  if (items.length === 0) {
    owner.items = null;
  } else if (items.length === 1) {
    owner.items = items[0];
  }
}

export function detachSubscriberFromOwner(subscriber: Subscriber, owner: Owner): void {
  subscriber.owner = null;
  removeOwnerItem(owner, subscriber);
}

function disposeOwnerItem(item: OwnerItem): void {
  if (item instanceof Owner) {
    disposeOwner(item);
  } else {
    disposeSubscriber(item);
  }
}

export function disposeOwner(owner: Owner): void {
  if (owner.flags & OwnerFlags.Disposed) {
    return;
  }

  owner.flags = (owner.flags | OwnerFlags.Disposed) & ~OwnerFlags.Queued & ~OwnerFlags.DirtyMask;
  detachOwnerFromParent(owner);
  disposeOwnerItems(owner);
  if (owner.pendingWork !== undefined) {
    for (const work of owner.pendingWork.values()) {
      work.cancel();
    }
  }
  owner.pendingPhases?.cancel();
}

export function disposeOwnerItems(owner: Owner): void {
  owner.flags |= OwnerFlags.ResumeClosed;
  const items = owner.items;
  owner.items = null;
  if (items === null) {
    return;
  }
  if (!Array.isArray(items)) {
    disposeOwnerItem(items);
    return;
  }

  // LIFO: later items may read earlier ones (task cleanup reading a computed).
  for (let i = items.length - 1; i >= 0; i--) {
    disposeOwnerItem(items[i]);
  }
}

/** Runs the user cleanups under `root` ahead of disposal, leaving the `skip` subtrees alone. */
export function runOwnerCleanups(
  root: Owner,
  skip: ReadonlySet<Owner> = new Set()
): ValueOrPromise<void> {
  let pending: Promise<void>[] | null = null;
  const owners = [root];
  for (let i = 0; i < owners.length; i++) {
    const items = owners[i].items;
    if (items === null) {
      continue;
    }
    for (let j = 0; j < ownerItemsLength(items); j++) {
      const item = ownerItemAt(items, j)!;
      if (item instanceof Owner) {
        if (!skip.has(item)) {
          owners.push(item);
        }
        continue;
      }
      const result = runSubscriberCleanups(item);
      if (isPromise(result)) {
        (pending ??= []).push(result);
      }
    }
  }
  return pending === null ? undefined : Promise.all(pending).then(() => {});
}

function getOrCreateActiveOwnerOrNull(): Owner | null {
  return getOrCreateContextOwner(getActiveInvokeContextOrNull());
}

function getOrCreateActiveOwnerOrThrow(): Owner {
  const owner = getOrCreateActiveOwnerOrNull();
  if (owner === null) {
    throw new Error('Missing active owner context for subscriber');
  }
  return owner;
}

function materializeContextOwner(context: RuntimeInvokeContext): Owner {
  const owner = context.owner;
  if (owner !== null) {
    return owner;
  }

  const parentOwner = context.ownerHost;
  const nextOwner = new Owner();
  registerOwnerToOwner(nextOwner, parentOwner);
  context.owner = nextOwner;
  return nextOwner;
}

export function registerOwnerToOwner(owner: Owner, parent: Owner | null): void {
  if (parent === null || owner.parent === parent) {
    return;
  }

  if (parent.flags & OwnerFlags.Disposed) {
    disposeOwner(owner);
    return;
  }

  owner.parent = parent;
  appendOwnerItem(parent, owner);
}

function detachOwnerFromParent(owner: Owner): void {
  const parent = owner.parent;
  owner.parent = null;
  if (parent === null) {
    return;
  }

  removeOwnerItem(parent, owner);
}

isServer && brandClass(Owner, Brand.Owner);

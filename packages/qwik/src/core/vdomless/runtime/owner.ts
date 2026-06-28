import { swapRemove } from '../utils/array';
import { disposeSubscriber } from '../reactive/cleanup';
import { OwnerFlags } from '../reactive/flags';
import {
  getActiveOwnerScope,
  getActiveInvokeContextOrNull,
  invoke,
  newInvokeContext,
  type RuntimeInvokeContext,
} from './invoke-context';
import type { Subscriber } from './subscriber';
import { runWithCollector } from '../reactive/tracking';

export type OwnerItem = Owner | Subscriber;

// Owners are lifetime scopes for reactive work. Anything that can become a
// subscriber should be owned so it can be disposed and removed from sources.
export class Owner {
  parent: Owner | null = null;
  items: OwnerItem[] | null = null;
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

  subscriber.owner = resolvedOwner;
  const items = resolvedOwner.items;
  if (items === null) {
    resolvedOwner.items = [subscriber];
  } else if (!items.includes(subscriber)) {
    items.push(subscriber);
  }

  return subscriber;
}

export function disposeOwner(owner: Owner): void {
  if (owner.flags & OwnerFlags.Disposed) {
    return;
  }

  owner.flags = (owner.flags | OwnerFlags.Disposed) & ~OwnerFlags.Queued & ~OwnerFlags.DirtyMask;
  detachOwnerFromParent(owner);

  const items = owner.items;
  owner.items = null;
  if (items !== null) {
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (item instanceof Owner) {
        disposeOwner(item);
      } else {
        disposeSubscriber(item);
      }
    }
  }
}

function getOrCreateActiveOwnerOrNull(): Owner | null {
  const context = getActiveInvokeContextOrNull();
  return context === null ? null : materializeContextOwner();
}

function getOrCreateActiveOwnerOrThrow(): Owner {
  const owner = getOrCreateActiveOwnerOrNull();
  if (owner === null) {
    throw new Error('Missing active owner context for subscriber');
  }
  return owner;
}

function materializeContextOwner(context = getActiveInvokeContextOrNull()!): Owner {
  const owner = context.owner;
  if (owner !== null) {
    return owner;
  }

  const parentOwner = materializeOwnerHost(context.ownerHost);
  const nextOwner = new Owner();
  registerOwnerToOwner(nextOwner, parentOwner);
  context.owner = nextOwner;
  return nextOwner;
}

function materializeOwnerHost(host: Owner | RuntimeInvokeContext | null): Owner | null {
  if (host === null) {
    return null;
  }
  return host instanceof Owner ? host : materializeContextOwner(host);
}

function registerOwnerToOwner(owner: Owner, parent: Owner | null): void {
  if (parent === null) {
    return;
  }

  if (parent.flags & OwnerFlags.Disposed) {
    disposeOwner(owner);
    return;
  }

  owner.parent = parent;
  const items = parent.items;
  if (items === null) {
    parent.items = [owner];
  } else {
    items.push(owner);
  }
}

function detachOwnerFromParent(owner: Owner): void {
  const parent = owner.parent;
  owner.parent = null;
  if (parent === null) {
    return;
  }

  const items = parent.items;
  if (items === null) {
    return;
  }

  if (swapRemove(items, owner) && items.length === 0) {
    parent.items = null;
  }
}

function detachSubscriberFromOwner(subscriber: Subscriber, owner: Owner): void {
  subscriber.owner = null;

  const items = owner.items;
  if (items === null) {
    return;
  }

  if (swapRemove(items, subscriber) && items.length === 0) {
    owner.items = null;
  }
}

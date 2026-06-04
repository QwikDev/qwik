import { swapRemove } from '../utils/array';
import { disposeSubscriber } from './cleanup';
import { getActiveInvokeContextOrNull, invoke, newInvokeContext } from './invoke-context';
import type { Subscriber } from './subscriber';
import { runWithCollector } from './tracking';

// Owners are lifetime scopes for reactive work. Anything that can become a
// subscriber should be owned so it can be disposed and removed from sources.
// Sources such as signals are data; subscribers such as computed values, tasks,
// and DOM effects are work.
export interface Owner {
  parent: Owner | null;
  subscribers: Subscriber[] | null;
  childOwners: Owner[] | null;
  disposed: boolean;
}

export function createOwner(parent: Owner | null = getActiveOwner()): Owner {
  const owner: Owner = {
    parent: null,
    subscribers: null,
    childOwners: null,
    disposed: false,
  };

  registerOwnerToOwner(owner, parent);
  return owner;
}

export function getActiveOwner(): Owner | null {
  return getActiveInvokeContextOrNull()?.owner ?? null;
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
    idPrefix: activeContext?.idPrefix,
    contextScope: activeContext?.contextScope,
    localContextScope: activeContext?.localContextScope,
    slotScope: activeContext?.slotScope,
  });
  return runWithCollector(null, invoke, context, run, ...args);
}

export function registerSubscriberToOwner<T extends Subscriber>(
  subscriber: T,
  owner: Owner | null = getActiveOwner()
): T {
  if (owner === null) {
    return subscriber;
  }

  if (owner.disposed) {
    disposeSubscriber(subscriber);
    return subscriber;
  }

  const subscribers = owner.subscribers;
  if (subscribers === null) {
    owner.subscribers = [subscriber];
  } else if (!subscribers.includes(subscriber)) {
    subscribers.push(subscriber);
  }

  return subscriber;
}

export function disposeOwner(owner: Owner): void {
  if (owner.disposed) {
    return;
  }

  owner.disposed = true;
  detachOwnerFromParent(owner);

  const childOwners = owner.childOwners;
  owner.childOwners = null;
  if (childOwners !== null) {
    for (let i = 0; i < childOwners.length; i++) {
      disposeOwner(childOwners[i]);
    }
  }

  const subscribers = owner.subscribers;
  owner.subscribers = null;
  if (subscribers !== null) {
    for (let i = 0; i < subscribers.length; i++) {
      disposeSubscriber(subscribers[i]);
    }
  }
}

function registerOwnerToOwner(owner: Owner, parent: Owner | null): void {
  if (parent === null) {
    return;
  }

  if (parent.disposed) {
    disposeOwner(owner);
    return;
  }

  owner.parent = parent;
  const childOwners = parent.childOwners;
  if (childOwners === null) {
    parent.childOwners = [owner];
  } else {
    childOwners.push(owner);
  }
}

function detachOwnerFromParent(owner: Owner): void {
  const parent = owner.parent;
  owner.parent = null;
  if (parent === null) {
    return;
  }

  const childOwners = parent.childOwners;
  if (childOwners === null) {
    return;
  }

  if (swapRemove(childOwners, owner) && childOwners.length === 0) {
    parent.childOwners = null;
  }
}

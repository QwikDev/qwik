import { disposeSubscriber } from './cleanup';
import type { Subscriber } from './subscriber';
import { runWithCollector } from './tracking';

// Owners are lifetime scopes for reactive work. Anything that can become a
// subscriber should be owned so it can be disposed and removed from sources.
// Sources such as signals are data; subscribers such as computed values, tasks,
// and DOM effects are work.
export interface Owner {
  subscribers: Subscriber[] | null;
  childOwners: Owner[] | null;
  disposed: boolean;
}

let activeOwner: Owner | null = null;

export function createOwner(): Owner {
  const owner: Owner = {
    subscribers: null,
    childOwners: null,
    disposed: false,
  };

  registerOwnerToOwner(owner, activeOwner);
  return owner;
}

export function getActiveOwner(): Owner | null {
  return activeOwner;
}

// Runs creation code under a lifetime owner. This intentionally clears the
// active collector: owner scope decides what gets disposed together, while the
// collector decides which source reads become dependencies.
export function runWithOwner<T>(owner: Owner | null, run: () => T): T;
export function runWithOwner<T, A>(owner: Owner | null, run: (arg: A) => T, arg: A): T;
export function runWithOwner<T, A>(
  owner: Owner | null,
  run: (() => T) | ((arg: A) => T),
  arg?: A
): T {
  const previous = activeOwner;
  activeOwner = owner;

  try {
    if (arguments.length === 3) {
      return runWithCollector(null, run as (arg: A) => T, arg as A);
    }

    return runWithCollector(null, run as () => T);
  } finally {
    activeOwner = previous;
  }
}

export function registerSubscriberToOwner<T extends Subscriber>(
  subscriber: T,
  owner: Owner | null = activeOwner
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

  const childOwners = parent.childOwners;
  if (childOwners === null) {
    parent.childOwners = [owner];
  } else {
    childOwners.push(owner);
  }
}

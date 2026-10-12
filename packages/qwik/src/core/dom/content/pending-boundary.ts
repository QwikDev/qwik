import { OwnerFlags } from '../../reactive/flags';
import type { Owner } from '../../runtime/owner';
import type { PendingContentSubscription, SSRPendingContentSubscription } from './content';

export type PendingBoundary = PendingContentSubscription | SSRPendingContentSubscription;

const pendingBoundaries = new WeakMap<Owner, PendingBoundary>();

export function registerPendingBoundary(owner: Owner, boundary: PendingBoundary): void {
  owner.flags |= OwnerFlags.PendingRoot;
  pendingBoundaries.set(owner, boundary);
}

/** The nearest boundary above `owner`, following projections back to where they render. */
export function findPendingBoundary(owner: Owner | null): PendingBoundary | undefined {
  while (owner !== null) {
    const boundary = pendingBoundaries.get(owner);
    if (boundary !== undefined) {
      return boundary;
    }
    owner = owner.renderParent === undefined ? owner.parent : owner.renderParent;
  }
  return undefined;
}

export function getOwnPendingBoundary(owner: Owner): PendingBoundary | undefined {
  return pendingBoundaries.get(owner);
}

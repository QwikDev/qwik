import type { Owner } from '../../runtime/owner';
import type { SuspenseContentSubscription, SSRSuspenseContentSubscription } from './content';

export type SuspenseBoundary = SuspenseContentSubscription | SSRSuspenseContentSubscription;

const suspenseBoundaries = new WeakMap<Owner, SuspenseBoundary>();

export function registerSuspenseBoundary(owner: Owner, boundary: SuspenseBoundary): void {
  suspenseBoundaries.set(owner, boundary);
}

/** The nearest boundary above `owner`, following projections back to where they render. */
export function findSuspenseBoundary(owner: Owner | null): SuspenseBoundary | undefined {
  while (owner !== null) {
    const boundary = suspenseBoundaries.get(owner);
    if (boundary !== undefined) {
      return boundary;
    }
    owner = owner.renderParent === undefined ? owner.parent : owner.renderParent;
  }
  return undefined;
}

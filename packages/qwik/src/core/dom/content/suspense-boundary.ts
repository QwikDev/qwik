import type { Owner } from '../../runtime/owner';
import type { ContentSubscription } from './content';

const suspenseBoundaries = new WeakMap<Owner, ContentSubscription>();

export function registerSuspenseBoundary(owner: Owner, boundary: ContentSubscription): void {
  suspenseBoundaries.set(owner, boundary);
}

export function findSuspenseBoundary(owner: Owner | null): ContentSubscription | undefined {
  while (owner !== null) {
    const boundary = suspenseBoundaries.get(owner);
    if (boundary !== undefined) {
      return boundary;
    }
    owner = owner.renderParent === undefined ? owner.parent : owner.renderParent;
  }
  return undefined;
}

import { maybeThen } from '../../shared/utils/promises';
import type { ValueOrPromise } from '../../shared/utils/types';
import { OwnerFlags } from '../../reactive/flags';
import type { Owner } from '../../runtime/owner';
import type { CatchContentSubscription, SSRCatchContentSubscription } from './catch';
import { getOwnSuspenseBoundary, type SuspenseBoundary } from './suspense-boundary';

export type CatchBoundary = CatchContentSubscription | SSRCatchContentSubscription;
const catchBoundaries = new WeakMap<Owner, CatchBoundary>();

export function registerCatchBoundary(owner: Owner, boundary: CatchBoundary): void {
  catchBoundaries.set(owner, boundary);
}

export function findCatchBoundary(owner: Owner | null): CatchBoundary | undefined {
  while (owner !== null) {
    const boundary = catchBoundaries.get(owner);
    if (boundary !== undefined) {
      return boundary;
    }
    owner = owner.renderParent === undefined ? owner.parent : owner.renderParent;
  }
  return undefined;
}

export function findContentBoundary(
  owner: Owner | null
): SuspenseBoundary | CatchBoundary | undefined {
  while (owner !== null) {
    const boundary = catchBoundaries.get(owner) ?? getOwnSuspenseBoundary(owner);
    if (boundary !== undefined) {
      return boundary;
    }
    owner = owner.renderParent === undefined ? owner.parent : owner.renderParent;
  }
  return undefined;
}

export function handleRenderError(owner: Owner | null, error: unknown): ValueOrPromise<void> {
  if (owner !== null && owner.flags & OwnerFlags.Disposed) {
    return;
  }
  if (error instanceof Error && 'plugin' in error) {
    throw error;
  }
  const boundary = findCatchBoundary(owner);
  if (boundary === undefined) {
    throw error;
  }
  return maybeThen(boundary.catchError(error), () => {});
}

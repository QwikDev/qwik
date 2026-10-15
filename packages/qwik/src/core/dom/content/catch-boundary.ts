import { safeCall } from '../../shared/utils/promises';
import type { ValueOrPromise } from '../../shared/utils/types';
import { OwnerFlags } from '../../reactive/flags';
import type { Owner } from '../../runtime/owner';
import type { CatchContentSubscription, SSRCatchContentSubscription } from './catch';
import { getOwnPendingBoundary, type PendingBoundary } from './pending-boundary';
import { isQrlImportError } from '../../shared/qrl/qrl-utils';
import { Brand, hasBrand } from '../../shared/utils/brand';

export type CatchBoundary = CatchContentSubscription | SSRCatchContentSubscription;

export function isCatchBoundary(value: unknown): value is CatchBoundary {
  return hasBrand(value, Brand.CatchContentSubscription | Brand.SsrCatchContentSubscription);
}

export function registerCatchBoundary(owner: Owner, boundary: CatchBoundary): void {
  owner.catchBoundary = boundary;
  owner.flags |= OwnerFlags.HasCatch;
}

export function findCatchBoundary(owner: Owner | null): CatchBoundary | undefined {
  while (owner !== null) {
    const boundary = owner.catchBoundary;
    if (boundary !== undefined && boundary.error === undefined) {
      return boundary;
    }
    owner = owner.renderParent === undefined ? owner.parent : owner.renderParent;
  }
  return undefined;
}

export function findContentBoundary(
  owner: Owner | null
): PendingBoundary | CatchBoundary | undefined {
  while (owner !== null) {
    const boundary = owner.catchBoundary ?? getOwnPendingBoundary(owner);
    if (boundary !== undefined) {
      return boundary;
    }
    owner = owner.renderParent === undefined ? owner.parent : owner.renderParent;
  }
  return undefined;
}

export function handleError(owner: Owner | null, error: unknown): ValueOrPromise<void> {
  if (owner !== null && owner.flags & OwnerFlags.Disposed) {
    return;
  }
  if (isQrlImportError(error)) {
    throw error;
  }
  const boundary = findCatchBoundary(owner);
  if (boundary === undefined) {
    throw error;
  }
  const parent = boundary.owner;
  return safeCall(
    () => boundary.catchError(error),
    () => {},
    (error) => handleError(parent, error)
  );
}

import { getOrCreateContainerContext, whenRootInflated } from '../../runtime/container-context';
import { isQrlImportError } from '../../shared/qrl/qrl-utils';
import type { QElement } from '../../shared/types';
import { maybeThen } from '../../shared/utils/promises';
import type { ValueOrPromise } from '../../shared/utils/types';
import { CatchPhase, handleError } from './catch-boundary';
import type { CatchContentSubscription } from './catch';
import { Brand, hasBrand } from '../../shared/utils/brand';

export function _catchError(
  event: CustomEvent<{ error: unknown; element?: Element; importError?: string }> & {
    _qHandled?: boolean;
  }
): ValueOrPromise<void> {
  const { element, error, importError } = event.detail ?? {};
  if (
    importError ||
    isQrlImportError(error) ||
    !element?.isConnected ||
    element.ownerDocument !== event.target
  ) {
    return;
  }
  const id = element.getAttribute('q:catch');
  const owner = (element as QElement)._qErrorOwner;
  if ((id === null && owner === undefined) || event._qHandled !== undefined) {
    return;
  }
  event._qHandled = false;
  return maybeThen(handleEventError(element, error), () => {
    event._qHandled = true;
  });
}

function handleEventError(element: Element, error: unknown): ValueOrPromise<void> {
  const owner = (element as QElement)._qErrorOwner;
  if (owner !== undefined) {
    return handleError(owner, error, CatchPhase.Event);
  }
  const id = element.getAttribute('q:catch');
  if (!/^\d+$/.test(id!)) {
    throw new Error('Invalid Catch root reference');
  }
  const context = getOrCreateContainerContext(element);
  return maybeThen(context.getRoot(id!), (root) =>
    maybeThen(whenRootInflated(context, root), (boundary) => {
      if (!element.isConnected) {
        return;
      }
      if (!hasBrand(boundary, Brand.CatchContentSubscription)) {
        throw new Error('Catch event requires a boundary subscription');
      }
      const catchBoundary = boundary as CatchContentSubscription;
      return handleError(
        catchBoundary.block.currentOwner ?? catchBoundary.owner,
        error,
        CatchPhase.Event
      );
    })
  );
}

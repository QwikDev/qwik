import { QError, qError } from '../shared/error/error';
import type { QRLInternal } from '../shared/qrl/qrl-class';
import { getChorePromise } from '../shared/scheduler';
import { ChoreType } from '../shared/util-chore-type';
import type { ValueOrPromise } from '../shared/utils/types';
import { getInvokeContext } from '../use/use-core';
import { useLexicalScope } from '../use/use-lexical-scope.public';
import { getDomContainer } from './dom-container';

/**
 * This is called by qwik-loader to run a QRL. It has to be synchronous.
 *
 * @internal
 */
export const _run = (...args: unknown[]): ValueOrPromise<unknown> => {
  // This will already check container
  const [runQrl] = useLexicalScope<[QRLInternal<(...args: unknown[]) => unknown>]>();
  const context = getInvokeContext();
  const hostElement = context.$hostElement$;

  if (!hostElement) {
    // silently ignore if there is no host element, the element might have been removed
    return;
  }

  const container = getDomContainer(context.$element$!);

  const scheduler = container.$scheduler$;
  if (!scheduler) {
    throw qError(QError.schedulerNotFound);
  }

  // We don't return anything, the scheduler is in charge now
  const chore = scheduler(ChoreType.RUN_QRL, hostElement, runQrl, args);
  return getChorePromise(chore);
};

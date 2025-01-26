import { QError, qError } from '../shared/error/error';
import type { QRLInternal } from '../shared/qrl/qrl-class';
import { ChoreType } from '../shared/scheduler';
import { getInvokeContext } from '../use/use-core';
import { useLexicalScope } from '../use/use-lexical-scope.public';
import { _getQContainerElement, getDomContainer } from './dom-container';

/**
 * This is called by qwik-loader to schedule a QRL. It has to be synchronous.
 *
 * @internal
 */
export const queueQRL = (...args: unknown[]) => {
  // This will already check container
  const [runQrl] = useLexicalScope<[QRLInternal<(...args: unknown[]) => unknown>]>();
  const context = getInvokeContext();
  const el = context.$element$!;
  const containerElement = _getQContainerElement(el) as HTMLElement;
  const container = getDomContainer(containerElement);

  const scheduler = container.$scheduler$;
  if (!scheduler) {
    throw qError(QError.schedulerNotFound);
  }

  return scheduler(ChoreType.RUN_QRL, el, runQrl, args);
};

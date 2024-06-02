import { assertDefined } from '../error/assert';
import { inflateQrl, parseQRL } from '../qrl/qrl';
import { getWrappingContainer, getInvokeContext } from './use-core';
import { assertQrl, type QRLInternal } from '../qrl/qrl-class';
import { getContext } from '../state/context';
import { resumeIfNeeded } from '../container/resume';
import { _getContainerState } from '../container/container';
import { getDomContainer } from '../v2/client/dom-container';

// <docs markdown="../readme.md#useLexicalScope">
// !!DO NOT EDIT THIS COMMENT DIRECTLY!!!
// (edit ../readme.md#useLexicalScope instead)
/**
 * Used by the Qwik Optimizer to restore the lexically scoped variables.
 *
 * This method should not be present in the application source code.
 *
 * NOTE: `useLexicalScope` method can only be used in the synchronous portion of the callback
 * (before any `await` statements.)
 *
 * @internal
 */
// </docs>
export const useLexicalScope = <VARS extends any[]>(): VARS => {
  const context = getInvokeContext();
  let qrl = context.$qrl$ as QRLInternal<unknown> | undefined;
  if (!qrl) {
    const el = context.$element$;
    computeTask.$qrl$assertDefined(
      el,
      'invoke: element must be defined inside useLexicalScope()',
      context
    );
    const containerElement = getWrappingContainer(el) as HTMLElement;
    assertDefined(containerElement, `invoke: cant find parent q:container of`, el);
    if (containerElement.getAttribute('q:runtime') == '2') {
      const container = getDomContainer(containerElement);
      qrl = container.parseQRL(decodeURIComponent(String(context.$url$))) as QRLInternal<unknown>;
    } else {
      qrl = parseQRL(decodeURIComponent(String(context.$url$)), containerElement);
      assertQrl(qrl);
      resumeIfNeeded(containerElement);
      const elCtx = getContext(el, _getContainerState(containerElement));
      inflateQrl(qrl, elCtx);
    }
  } else {
    assertQrl(qrl);
    assertDefined(
      qrl.$captureRef$,
      'invoke: qrl $captureRef$ must be defined inside useLexicalScope()',
      qrl
    );
  }
  return qrl!.$captureRef$ as VARS;
};

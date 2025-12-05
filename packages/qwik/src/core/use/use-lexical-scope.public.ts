import { assertDefined } from '../shared/error/assert';
import { getInvokeContext } from './use-core';
import type { QRLInternal } from '../shared/qrl/qrl-class';
import { _getQContainerElement, getDomContainer } from '../client/dom-container';
import { assertQrl } from '../shared/qrl/qrl-utils';
import { ElementVNode } from '../shared/vnode/element-vnode';

// <docs markdown="../readme.md#useLexicalScope">
// !!DO NOT EDIT THIS COMMENT DIRECTLY!!!
// (edit ../readme.md#useLexicalScope instead and run `pnpm docs.sync`)
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
    const el =
      context.$hostElement$ instanceof ElementVNode ? context.$hostElement$.node : undefined;
    assertDefined(el, 'invoke: element must be defined inside useLexicalScope()', context);
    const containerElement = _getQContainerElement(el) as HTMLElement;
    assertDefined(containerElement, `invoke: cant find parent q:container of`, el);
    const container = getDomContainer(containerElement);
    qrl = container.parseQRL(decodeURIComponent(String(context.$url$))) as QRLInternal<unknown>;
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

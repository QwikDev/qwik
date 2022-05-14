import { wrapSubscriber } from './use-subscriber';
import { assertDefined } from '../assert/assert';
import { parseQRL } from '../import/qrl';
import { qInflate } from '../json/q-json';
import { getContext, resumeIfNeeded } from '../props/props';
import { getContainer, getInvokeContext } from './use-core';
import { useURL } from './use-url.public';
import type { QRLInternal } from '../import/qrl-class';

// <docs markdown="../readme.md#useLexicalScope">
// !!DO NOT EDIT THIS COMMENT DIRECTLY!!!
// (edit ../readme.md#useLexicalScope instead)
/**
 * Used by the Qwik Optimizer to restore the lexical scoped variables.
 *
 * This method should not be present in the application source code.
 *
 * NOTE: `useLexicalScope` method can only be used in the synchronous portion of the callback
 * (before any `await` statements.)
 *
 * @public
 */
// </docs>
export function useLexicalScope<VARS extends any[]>(): VARS {
  const context = getInvokeContext();
  const hostElement = context.hostElement;
  const qrl = (context.qrl ??
    parseQRL(decodeURIComponent(String(useURL())), hostElement)) as QRLInternal;
  if (qrl.captureRef == null) {
    const el = context.element!;
    assertDefined(el);
    resumeIfNeeded(getContainer(el)!);
    const ctx = getContext(el);
    qrl.captureRef = qrl.capture!.map((idx) => qInflate(idx, ctx));
  }
  const subscriber = context.subscriber;
  if (subscriber) {
    return qrl.captureRef.map((obj) => wrapSubscriber(obj, subscriber)) as VARS;
  }
  return qrl.captureRef as VARS;
}

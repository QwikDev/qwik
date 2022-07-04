import { assertDefined, assertEqual } from '../assert/assert';
import { parseQRL } from '../import/qrl';
import { getContext, QContext, resumeIfNeeded } from '../props/props';
import { getContainer, getInvokeContext } from './use-core';
import type { QRLInternal } from '../import/qrl-class';

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
 * @public
 */
// </docs>
export const useLexicalScope = <VARS extends any[]>(): VARS => {
  const context = getInvokeContext();
  const hostElement = context.$hostElement$;
  const qrl = (context.$qrl$ ??
    parseQRL(decodeURIComponent(String(context.$url$)), hostElement)) as QRLInternal;
  if (qrl.$captureRef$ == null) {
    const el = context.$element$!;
    assertDefined(el);
    assertDefined(qrl.$capture$);
    resumeIfNeeded(getContainer(el)!);
    const ctx = getContext(el);

    qrl.$captureRef$ = qrl.$capture$!.map((idx) => qInflate(idx, ctx));
  }
  const subscriber = context.$subscriber$;
  if (subscriber) {
    return qrl.$captureRef$ as VARS;
  }
  return qrl.$captureRef$ as VARS;
};

const qInflate = (ref: string, hostCtx: QContext) => {
  const int = parseInt(ref, 10);
  const obj = hostCtx.$refMap$.$get$(int);
  assertEqual(hostCtx.$refMap$.$array$.length > int, true);
  return obj;
};

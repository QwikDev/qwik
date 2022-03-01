import { assertDefined } from '../assert/assert';
import { parseQRL } from '../import/qrl';
import type { QRLInternal } from '../import/qrl-class';
import { qInflate } from '../json/q-json';
import { Q_MAP } from '../props/props';
import type { QObjectMap } from '../props/props-obj-map';
import { getProps } from '../props/props.public';
import { useHostElement } from './use-host-element.public';
import { useQRL } from './use-qrl';
import { useURL } from './use-url.public';

// <docs markdown="https://hackmd.io/lQ8v7fyhR-WD3b-2aRUpyw#useLexicalScope">
// !!DO NOT EDIT THIS COMMENT DIRECTLY!!!
// (edit https://hackmd.io/@qwik-docs/BkxpSz80Y/%2FlQ8v7fyhR-WD3b-2aRUpyw%3Fboth#useLexicalScope instead)
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
  const qrl = (useQRL() as QRLInternal) || parseQRL(decodeURIComponent(String(useURL())));
  if (qrl.captureRef == null) {
    const props = getProps(useHostElement());
    const qMap: QObjectMap = props[Q_MAP];
    assertDefined(qrl.capture);
    qrl.captureRef = qrl.capture!.map((obj) => qInflate(obj, qMap));
  }
  return qrl.captureRef as VARS;
}

import { assertDefined } from '../assert/assert';
import { parseQRL } from '../import/qrl';
import { qInflate } from '../json/q-json';
import { Q_MAP } from '../props/q-props';
import type { QObjectMap } from '../props/q-props-obj-map';
import { qProps } from '../props/q-props.public';
import { useHostElement } from './use-host-element.public';
import { useQRL } from './use-qrl';
import { useURL } from './use-url.public';

/**
 * @public
 */
export function useLexicalScope<VARS extends any[]>(): VARS {
  const qrl = useQRL() || parseQRL(decodeURIComponent(String(useURL())));
  if (qrl.captureRef == null) {
    const props = qProps(useHostElement());
    const qMap: QObjectMap = props[Q_MAP];
    assertDefined(qrl.capture);
    qrl.captureRef = qrl.capture!.map((obj) => qInflate(obj, qMap));
  }
  return qrl.captureRef as VARS;
}

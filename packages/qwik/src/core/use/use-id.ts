import type { QRL } from '..';
import { hashCode } from '../shared/utils/hash_code';
import { OnRenderProp } from '../shared/utils/markers';
import { useSequentialScope } from './use-sequential-scope';
import { getNextUniqueIndex } from '../shared/utils/unique-index-generator';

/** @public */
export const useId = (): string => {
  const { val, set, iCtx } = useSequentialScope<string>();
  if (val != null) {
    return val;
  }
  const containerBase = iCtx.$container$.$buildBase$ || '';
  const base = containerBase ? hashCode(containerBase).substring(0, 3) : '';
  const componentQrl = iCtx.$container$.getHostProp<QRL>(iCtx.$hostElement$, OnRenderProp);
  const hash = componentQrl?.getHash().substring(0, 3) || '';
  const counter = getNextUniqueIndex(iCtx.$container$) || '';
  let id = `${base}${hash}${counter}`;

  let firstChar = id.charCodeAt(0);
  // convert first char to letter if starts with a number, because CSS does not allow class names to start with a number
  if (firstChar >= 48 /* 0 */ && firstChar <= 57 /* 9 */) {
    // 48 is char code for '0', 65 is char code for 'A'
    // 65 - 48 = 17, so we add 17 to the char code of the first char to convert it to a letter
    firstChar += 17;
    id = String.fromCharCode(firstChar) + id.substring(1);
  }
  return set(id);
};

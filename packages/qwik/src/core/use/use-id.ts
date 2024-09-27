import type { QRL } from '..';
import { hashCode } from '../shared/utils/hash_code';
import { OnRenderProp } from '../shared/utils/markers';
import { isDomContainer } from '../client/dom-container';
import type { SSRContainer } from '../ssr/ssr-types';
import { useSequentialScope } from './use-sequential-scope';
import { getNextUniqueIndex } from '../shared/utils/unique-index-generator';

/** @public */
export const useId = (): string => {
  const { val, set, iCtx } = useSequentialScope<string>();
  if (val != null) {
    return val;
  }
  const containerBase = isDomContainer(iCtx.$container$)
    ? ''
    : (iCtx.$container$ as SSRContainer).buildBase || '';
  const base = containerBase ? hashCode(containerBase) : '';
  const componentQrl = iCtx.$container$.getHostProp<QRL>(iCtx.$hostElement$, OnRenderProp);
  const hash = componentQrl?.getHash() || '';
  const counter = getNextUniqueIndex(iCtx.$container$) || '';
  const id = `${base}-${hash}-${counter}`; // If no base and no hash, then "--#"
  return set(id);
};

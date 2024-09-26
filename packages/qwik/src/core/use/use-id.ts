import type { QRL } from '..';
import { hashCode } from '../shared/utils/hash_code';
import { OnRenderProp } from '../shared/utils/markers';
import { isDomContainer } from '../client/dom-container';
import type { fixMeAny } from '../shared/types';
import type { SSRContainer } from '../ssr/ssr-types';
import { useSequentialScope } from './use-sequential-scope';
import { getNextUniqueIndex } from '../shared/utils/unique-index-generator';

/** @public */
export const useId = (): string => {
  const { val, set, iCtx } = useSequentialScope<string>();
  if (val != null) {
    return val;
  }
  const containerBase = isDomContainer(iCtx.$container2$)
    ? ''
    : (iCtx.$container2$ as SSRContainer).buildBase || '';
  const base = containerBase ? hashCode(containerBase) : '';
  const componentQrl = iCtx.$container2$.getHostProp(
    iCtx.$hostElement$ as fixMeAny,
    OnRenderProp
  ) as QRL | null;
  const hash = componentQrl?.getHash() || '';
  const counter = getNextUniqueIndex(iCtx.$container2$) || '';
  const id = `${base}-${hash}-${counter}`; // If no base and no hash, then "--#"
  return set(id);
};

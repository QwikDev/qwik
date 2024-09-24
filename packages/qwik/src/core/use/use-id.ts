import type { QRL } from '..';
import { getNextUniqueIndex } from '../render/execute-component';
import { hashCode } from '../util/hash_code';
import { OnRenderProp } from '../util/markers';
import { isDomContainer } from '../v2/client/dom-container';
import type { fixMeAny } from '../v2/shared/types';
import type { SSRContainer } from '../v2/ssr/ssr-types';
import { useSequentialScope } from './use-sequential-scope';

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

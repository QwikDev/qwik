import { getNextIndex } from '../render/execute-component';
import { hashCode } from '../util/hash_code';
import { useSequentialScope } from './use-sequential-scope';

/**
 * @public
 */
export const useId = (): string => {
  const { get, set, elCtx, iCtx } = useSequentialScope<string>();
  if (get != null) {
    return get;
  }

  const containerBase = iCtx.$renderCtx$?.$static$?.$containerState$?.$base$ || '';
  const base = containerBase ? hashCode(containerBase) : '';
  const hash = elCtx.$componentQrl$?.getHash() || '';
  const counter = getNextIndex(iCtx.$renderCtx$) || '';
  const id = `${base}-${hash}-${counter}`; // If no base and no hash, then "--#"
  return set(id);
};

import { getNextIndex } from '../render/execute-component';
import { hashCode } from '../util/hash_code';
import { useSequentialScope } from './use-sequential-scope';

/** @public */
export const useId = (): string => {
  const { val, set, elCtx, iCtx } = useSequentialScope<string>();
  if (val != null) {
    return val;
  }

  const containerBase = iCtx.$renderCtx$?.$static$?.$containerState$?.$base$ || '';
  const base = containerBase ? hashCode(containerBase) : '';
  const hash = elCtx.$componentQrl$?.getHash() || '';
  const counter = getNextIndex(iCtx.$renderCtx$) || '';
  const id = `${base}-${hash}-${counter}`; // If no base and no hash, then "--#"
  return set(id);
};

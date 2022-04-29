import { getInvokeContext } from './use-core';

export function useURL(): URL {
  const url = getInvokeContext().url;
  if (!url) {
    // TODO(misko): centralize
    throw new Error('Q-ERROR: no URL is associated with the execution context');
  }
  return url!;
}

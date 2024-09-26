import { tryGetInvokeContext } from './use-core';

/** @public */
export function useServerData<T>(key: string): T | undefined;

/** @public */
export function useServerData<T, B = T>(key: string, defaultValue: B): T | B;

/** @public */
export function useServerData(key: string, defaultValue?: any) {
  const ctx = tryGetInvokeContext();
  if (ctx?.$container2$) {
    return ctx?.$container2$.$serverData$[key] ?? defaultValue;
  } else {
    return ctx?.$renderCtx$?.$static$.$containerState$.$serverData$[key] ?? defaultValue;
  }
}

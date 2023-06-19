import { tryGetInvokeContext } from './use-core';

/**
 * @public
 */
export function useServerData<T>(key: string): T | undefined;

/**
 * @public
 */
export function useServerData<T, B = T>(key: string, defaultValue: B): T | B;

/**
 * @public
 */
export function useServerData(key: string, defaultValue?: any) {
  const ctx = tryGetInvokeContext();
  if(typeof document !== 'undefined'){
    return ctx?.$renderCtx$?.$static$.$containerState$.$serverData$[key] ?? (document as any).serverData?.[key] ?? defaultValue;
  }
  return ctx?.$renderCtx$?.$static$.$containerState$.$serverData$[key] ?? defaultValue;
}

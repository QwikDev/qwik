import { useInvokeContext } from './use-core';

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
  const ctx = useInvokeContext();
  return ctx.$renderCtx$.$static$.$containerState$.$serverData$[key] ?? defaultValue;
}

/**
 * @public
 * @deprecated Please use `useServerData` instead.
 */
export const useUserContext = useServerData;

/**
 * @public
 * @deprecated Please use `useServerData` instead.
 */
export const useEnvData = useServerData;

import { useInvokeContext } from './use-core';

/**
 * @alpha
 */
export function useServerData<T>(key: string): T | undefined;

/**
 * @alpha
 */
export function useServerData<T, B = T>(key: string, defaultValue: B): T | B;

/**
 * @alpha
 */
export function useServerData(key: string, defaultValue?: any) {
  const ctx = useInvokeContext();
  return ctx.$renderCtx$.$static$.$containerState$.$serverData$[key] ?? defaultValue;
}

/**
 * @alpha
 * @deprecated Please use `useServerData` instead.
 */
export const useUserContext = useServerData;

/**
 * @alpha
 * @deprecated Please use `useServerData` instead.
 */
export const useEnvData = useServerData;

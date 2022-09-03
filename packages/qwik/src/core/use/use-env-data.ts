import { useInvokeContext } from './use-core';

/**
 * @alpha
 */
export function useEnvData<T>(key: string): T | undefined;

/**
 * @alpha
 */
export function useEnvData<T, B = T>(key: string, defaultValue: B): T | B;

/**
 * @alpha
 */
export function useEnvData(key: string, defaultValue?: any) {
  const ctx = useInvokeContext();
  return ctx.$renderCtx$.$static$.$containerState$.$envData$[key] ?? defaultValue;
}

/**
 * @alpha
 * @deprecated Please use `useEnvData` instead.
 */
export const useUserContext = useEnvData;

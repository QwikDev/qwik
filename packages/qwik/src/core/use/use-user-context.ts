import { useInvokeContext } from './use-core';

/**
 * @alpha
 */
export function useUserContext<T>(key: string): T | undefined;

/**
 * @alpha
 */
export function useUserContext<T, B = T>(key: string, defaultValue: B): T | B;

/**
 * @alpha
 */
export function useUserContext(key: string, defaultValue?: any) {
  const ctx = useInvokeContext();
  return ctx.$renderCtx$.$containerState$.$userContext$[key] ?? defaultValue;
}

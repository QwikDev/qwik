import { useInvokeContext } from './use-core';

/**
 * @alpha
 */
export function useServerProps<T>(key: string): T | undefined;

/**
 * @alpha
 */
export function useServerProps<T, B = T>(key: string, defaultValue: B): T | B;

/**
 * @alpha
 */
export function useServerProps(key: string, defaultValue?: any) {
  const ctx = useInvokeContext();
  return ctx.$renderCtx$.$static$.$containerState$.$serverProps$[key] ?? defaultValue;
}

/**
 * @alpha
 * @deprecated Please use `useServerProps` instead.
 */
export const useEnvData = useServerProps;

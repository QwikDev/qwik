import { getActiveInvokeContextOrNull } from './invoke-context';

export interface ServerDataContext {
  serverData?: Record<string, unknown>;
}

/** @public */
export function useServerData<T>(key: string): T | undefined;
/** @public */
export function useServerData<T, B = T>(key: string, defaultValue: B): T | B;
export function useServerData(key: string, defaultValue?: unknown): unknown {
  return getActiveInvokeContextOrNull()?.container?.serverData?.[key] ?? defaultValue;
}

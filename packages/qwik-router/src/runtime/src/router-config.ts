import { isDev } from '@qwik.dev/core';
import type { QwikRouterConfig } from './types';

let cachedConfig: QwikRouterConfig | undefined;

/**
 * Loads the generated `@qwik-router-config` module on first use. The dynamic import keeps the
 * runtime free of static config edges, so config evaluation (which runs user route/plugin modules)
 * can never interleave with runtime module evaluation.
 */
export const loadRouterConfig = async (): Promise<QwikRouterConfig> => {
  if (isDev) {
    // dev invalidates the virtual module; re-import to pick up fresh route info
    return (await import('@qwik-router-config')) as unknown as QwikRouterConfig;
  }
  return (cachedConfig ??= (await import('@qwik-router-config')) as unknown as QwikRouterConfig);
};

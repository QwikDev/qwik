// import { basename } from 'node:path';
import { ConfigEnv, mergeConfig, UserConfigExport } from 'vite';

/**
 * @alpha
 */
export function extendConfig(
  baseConfigExport: UserConfigExport,
  serverConfigExport: UserConfigExport
) {
  return async (env: ConfigEnv) => {
    let resolvedBase = await baseConfigExport;
    if (typeof resolvedBase === 'function') {
      resolvedBase = await resolvedBase(env);
    }

    let resolvedServer = await serverConfigExport;
    if (typeof resolvedServer === 'function') {
      resolvedServer = await resolvedServer(env);
    }

    return mergeConfig(resolvedBase, resolvedServer);
  };
}

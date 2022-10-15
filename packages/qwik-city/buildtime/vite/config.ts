// import { basename } from 'path';
import { ConfigEnv, mergeConfig, UserConfigExport } from 'vite';

/**
 * @alpha
 */
export function serverConfig(
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

    const build = (resolvedServer.build = resolvedServer.build || {});
    const rollupOptions = (build.rollupOptions = build.rollupOptions || {});

    if (typeof rollupOptions.input === 'string') {
      rollupOptions.input = [rollupOptions.input, '@qwik-city-plan'];
    } else if (Array.isArray(rollupOptions.input)) {
      if (!rollupOptions.input.includes('@qwik-city-plan')) {
        rollupOptions.input.push('@qwik-city-plan');
      }
    } else if (typeof rollupOptions.input === 'object' && rollupOptions.input) {
      if (!rollupOptions.input['@qwik-city-plan']) {
        rollupOptions.input['@qwik-city-plan'] = '@qwik-city-plan';
      }
    }

    const resolvedConfig = mergeConfig(resolvedBase, resolvedServer);
    return resolvedConfig;
  };
}

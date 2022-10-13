import { ConfigEnv, mergeConfig, UserConfigExport } from 'vite';

/**
 * @alpha
 */
export async function extendConfig(
  baseConfigExport: UserConfigExport,
  configExport: UserConfigExport
) {
  baseConfigExport = await baseConfigExport;
  configExport = await configExport;

  if (typeof baseConfigExport === 'function') {
    const baseConfigFn = baseConfigExport;

    if (typeof configExport === 'function') {
      const configExportFn = configExport;
      return (env: ConfigEnv) => {
        return mergeConfig(baseConfigFn(env), configExportFn(env));
      };
    }
  }

  if (typeof configExport === 'function') {
    const configExportFn = configExport;
    return (env: ConfigEnv) => {
      return mergeConfig(baseConfigExport, configExportFn(env));
    };
  }

  return mergeConfig(baseConfigExport, configExport);
}

import type { QwikCityPlugin } from '../../../qwik-city/buildtime/vite/types';
import { ConfigEnv, mergeConfig, Plugin, UserConfigExport } from 'vite';
import baseConfig from '../../vite.config';
import { join } from 'path';
import type { QwikVitePlugin } from '@builder.io/qwik/optimizer';
import { writeFile } from 'fs/promises';

/**
 * @alpha
 */
export function cloudflarePages(opts: CloudflarePagesIntegrationOptions = {}): Plugin {
  let qwikVitePlugin: QwikVitePlugin | null = null;
  let qwikCityPlugin: QwikCityPlugin | null = null;

  async function createRoutesJson() {
    const routes = qwikCityPlugin!.api.getRoutes();

    // default is to exclude everything from cloudflare functions
    // unless there's a specific "include" rule, then assume the
    // route is a static file to server rather than a cloudflare function
    const cloudflareRoutes: CloudflareRoutes = {
      version: 1,
      include: [],
      exclude: [],
    };

    for (const route of routes) {
      cloudflareRoutes.include.push(route.pathname);
    }

    const clientOutDir = qwikVitePlugin!.api.getClientOutDir()!;
    const cloudflareRoutePath = join(clientOutDir, '_routes.json');
    await writeFile(cloudflareRoutePath, JSON.stringify(cloudflareRoutes, null, 2));
  }

  return {
    name: 'vite-plugin-cloudflare-pages',
    enforce: 'post',
    apply: 'build',

    configResolved({ plugins }) {
      console.log(plugins);
      qwikVitePlugin = plugins.find((p) => p.name === 'vite-plugin-qwik') as QwikVitePlugin;
      if (!qwikVitePlugin) {
        throw new Error('Missing vite-plugin-qwik');
      }
      qwikCityPlugin = plugins.find((p) => p.name === 'vite-plugin-qwik-city') as QwikCityPlugin;
      if (!qwikCityPlugin) {
        throw new Error('Missing vite-plugin-qwik-city');
      }
    },

    async closeBundle() {
      if (opts.routesJson !== false) {
        await createRoutesJson();
      }
    },
  };
}

/**
 * @alpha
 */
export interface CloudflarePagesIntegrationOptions {
  /**
   * Determines if the _routes.json file should be created.
   * Defaults to `true`.
   */
  routesJson?: boolean;
}

export default extendConfig(baseConfig, () => {
  return {
    ssr: {
      target: 'webworker',
      noExternal: true,
    },
    build: {
      ssr: 'src/entry.cloudflare-pages.tsx',
      outDir: 'server',
    },
    plugins: [cloudflarePages()],
  };
});

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

interface CloudflareRoutes {
  version: number;
  include: string[];
  exclude: string[];
}

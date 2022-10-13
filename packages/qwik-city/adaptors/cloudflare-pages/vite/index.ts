import type { Plugin } from 'vite';
import type { QwikCityPlugin } from '@builder.io/qwik-city/vite';
import type { QwikVitePlugin } from '@builder.io/qwik/optimizer';
import { join } from 'path';
import fs from 'fs';
import { generateOutput } from '../generate';
import { generateStaticEntryModule } from '../static';

/**
 * @alpha
 */
export function cloudflarePages(opts: CloudflarePagesAdaptorOptions = {}): Plugin {
  let qwikVitePlugin: QwikVitePlugin | null = null;
  let qwikCityPlugin: QwikCityPlugin | null = null;
  let serverOutDir: string | null = null;

  async function generate() {
    const qwikCityPluginApi = qwikCityPlugin!.api;
    const qwikVitePluginApi = qwikVitePlugin!.api;

    const rootDir = qwikVitePluginApi.getRootDir()!;
    const clientOutDir = qwikVitePluginApi.getClientOutDir()!;
    const routes = qwikCityPluginApi.getRoutes();

    const generated = generateOutput(routes);

    const cfFunctionsDir = join(rootDir, 'functions');
    const cfHeadersPath = join(clientOutDir, '_headers');
    const cfRedirectsPath = join(clientOutDir, '_redirects');
    const cfRoutesPath = join(clientOutDir, '_routes.json');
    const staticEntryPath = join(serverOutDir!, 'entry.static.js');

    await Promise.all([
      fs.promises.writeFile(cfHeadersPath, generated.headers),
      fs.promises.writeFile(cfRedirectsPath, generated.redirects),
      fs.promises.writeFile(cfRoutesPath, generated.routes),
      ...generated.functions.map((fn) => {
        const fnPath = join(cfFunctionsDir, fn.path);
        return fs.promises.writeFile(fnPath, fn.content);
      }),
    ]);

    if (opts.staticOptimizations) {
      const staticEntryCode = generateStaticEntryModule();
      await fs.promises.writeFile(staticEntryPath, staticEntryCode);
    }
  }

  return {
    name: 'vite-plugin-cloudflare-pages',
    enforce: 'post',
    apply: 'build',

    configResolved({ build, plugins }) {
      qwikVitePlugin = plugins.find((p) => p.name === 'vite-plugin-qwik') as QwikVitePlugin;
      if (!qwikVitePlugin) {
        throw new Error('Missing vite-plugin-qwik');
      }
      qwikCityPlugin = plugins.find((p) => p.name === 'vite-plugin-qwik-city') as QwikCityPlugin;
      if (!qwikCityPlugin) {
        throw new Error('Missing vite-plugin-qwik-city');
      }
      serverOutDir = build.outDir;
    },

    async closeBundle() {
      await generate();
    },
  };
}

export interface CloudflarePagesAdaptorOptions {
  staticOptimizations?: boolean;
}

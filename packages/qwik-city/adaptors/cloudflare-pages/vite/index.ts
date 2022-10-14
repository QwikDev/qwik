import type { Plugin } from 'vite';
import type { QwikCityPlugin } from '@builder.io/qwik-city/vite';
import type { QwikVitePlugin } from '@builder.io/qwik/optimizer';
import { join } from 'path';
import fs from 'fs';
import { generateOutput, generateServerPackageJson, generateSsgModule } from '../generate';

/**
 * @alpha
 */
export function cloudflarePages(opts: CloudflarePagesAdaptorOptions = {}): Plugin {
  let qwikVitePlugin: QwikVitePlugin | null = null;
  let qwikCityPlugin: QwikCityPlugin | null = null;
  let serverOutDir: string | null = null;

  async function generate() {
    const qwikVitePluginApi = qwikVitePlugin!.api;
    const qwikCityPluginApi = qwikCityPlugin!.api;

    const rootDir = qwikVitePluginApi.getRootDir()!;
    const clientOutDir = qwikVitePluginApi.getClientOutDir()!;
    const routes = qwikCityPluginApi.getRoutes();

    const ssgModuleFileName = `ssg.js`;
    const generated = generateOutput(routes);

    const cfFunctionsDir = join(rootDir, 'functions');
    const ssgEntryPath = join(serverOutDir!, ssgModuleFileName);

    const serverPackageJsonPath = join(serverOutDir!, 'package.json');
    const serverPackageJsonCode = generateServerPackageJson();

    await Promise.all([
      fs.promises.writeFile(serverPackageJsonPath, serverPackageJsonCode),
      ...generated.functions.map((fn) => {
        const fnPath = join(cfFunctionsDir, fn.path);
        return fs.promises.writeFile(fnPath, fn.content);
      }),
    ]);

    const ssgModuleOutput = generateSsgModule({
      renderModulePath: `./entry.ssr.js`,
      qwikCityPlanModulePath: `./entry.cloudflare-pages.js`,
      outDir: clientOutDir,
    });

    await fs.promises.writeFile(ssgEntryPath, ssgModuleOutput);
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

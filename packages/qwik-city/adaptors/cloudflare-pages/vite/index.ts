import type { Plugin } from 'vite';
import type { QwikCityPlugin } from '@builder.io/qwik-city/vite';
import type { QwikVitePlugin } from '@builder.io/qwik/optimizer';
import { join } from 'path';
import fs from 'fs';
import { generateServerPackageJson, generateSsgModule } from '../generate';

/**
 * @alpha
 */
export function cloudflarePages(opts: CloudflarePagesAdaptorOptions = {}): Plugin {
  let qwikVitePlugin: QwikVitePlugin | null = null;
  let qwikCityPlugin: QwikCityPlugin | null = null;
  let serverOutDir: string | null = null;

  async function generate() {
    const qwikVitePluginApi = qwikVitePlugin!.api;
    const clientOutDir = qwikVitePluginApi.getClientOutDir()!;

    const ssgModuleFileName = `ssg.js`;
    const ssgEntryPath = join(serverOutDir!, ssgModuleFileName);

    const serverPackageJsonPath = join(serverOutDir!, 'package.json');
    const serverPackageJsonCode = generateServerPackageJson();

    const ssgModuleOutput = generateSsgModule({
      renderModulePath: `./entry.ssr.js`,
      qwikCityPlanModulePath: `./@qwik-city-plan.js`,
      outDir: clientOutDir,
    });

    await Promise.all([
      fs.promises.writeFile(serverPackageJsonPath, serverPackageJsonCode),
      fs.promises.writeFile(ssgEntryPath, ssgModuleOutput),
    ]);
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

export interface CloudflarePagesAdaptorOptions {}

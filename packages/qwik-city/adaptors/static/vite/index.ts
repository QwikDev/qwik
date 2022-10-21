import type { Plugin } from 'vite';
import type { QwikVitePlugin } from '@builder.io/qwik/optimizer';
import type { StaticGenerateRenderOptions } from '../../../static';
import { join } from 'node:path';
import fs from 'node:fs';

/**
 * @alpha
 */
export function staticAdaptor(opts: StaticGenerateAdaptorOptions): any {
  let qwikVitePlugin: QwikVitePlugin | null = null;
  let serverOutDir: string | null = null;
  let ssrOutputPath: string | null = null;
  let qwikCityPlanOutputPath: string | null = null;

  async function generateBundles() {
    const qwikVitePluginApi = qwikVitePlugin!.api;
    const clientOutDir = qwikVitePluginApi.getClientOutDir()!;

    const serverPackageJsonPath = join(serverOutDir!, 'package.json');
    const serverPackageJsonCode = `{"type":"module"}`;
    await fs.promises.mkdir(serverOutDir!, { recursive: true });
    await fs.promises.writeFile(serverPackageJsonPath, serverPackageJsonCode);

    const staticGenerate = await import('../../../static');

    await staticGenerate.generate({
      renderModulePath: ssrOutputPath!,
      qwikCityPlanModulePath: qwikCityPlanOutputPath!,
      outDir: clientOutDir,
      ...opts,
    });
  }

  const plugin: Plugin = {
    name: 'vite-plugin-qwik-city-static-generate',
    enforce: 'post',
    apply: 'build',

    configResolved({ build, plugins }) {
      qwikVitePlugin = plugins.find((p) => p.name === 'vite-plugin-qwik') as QwikVitePlugin;
      if (!qwikVitePlugin) {
        throw new Error('Missing vite-plugin-qwik');
      }
      serverOutDir = build.outDir;

      if (build?.ssr !== true) {
        throw new Error(
          '"build.ssr" must be set to `true` in order to use the Static Generate adaptor.'
        );
      }

      if (!build?.rollupOptions?.input) {
        throw new Error(
          '"build.rollupOptions.input" must be set in order to use the Static Generate adaptor.'
        );
      }
    },

    generateBundle(_, bundles) {
      for (const fileName in bundles) {
        const chunk = bundles[fileName];
        if (chunk.type === 'chunk' && chunk.isEntry) {
          if (chunk.name === 'entry.ssr') {
            ssrOutputPath = join(serverOutDir!, fileName);
          } else if (chunk.name === '@qwik-city-plan') {
            qwikCityPlanOutputPath = join(serverOutDir!, fileName);
          }
        }
      }

      if (!ssrOutputPath) {
        throw new Error(
          'Unable to fine "entry.ssr" entry point. Did you forget to add it to "build.rollupOptions.input"?'
        );
      }
      if (!qwikCityPlanOutputPath) {
        throw new Error(
          'Unable to fine "@qwik-city-plan" entry point. Did you forget to add it to "build.rollupOptions.input"?'
        );
      }
    },

    async closeBundle() {
      await generateBundles();
    },
  };
  return plugin;
}

/**
 * @alpha
 */
export interface StaticGenerateAdaptorOptions extends Omit<StaticGenerateRenderOptions, 'outDir'> {}

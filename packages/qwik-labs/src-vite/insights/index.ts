import { type QwikVitePluginOptions } from '@builder.io/qwik/optimizer';
import { existsSync, mkdirSync } from 'fs';
import { readFile, writeFile } from 'fs/promises';
import { join } from 'node:path';
import { PluginOption } from 'vite';

const logWarn = (message?: any) => {
  console.warn('\x1b[33m%s\x1b[0m', `\n\nQWIK WARN: ${message}\n`);
};

export async function qwikInsights(qwikInsightsOpts: {
  publicApiKey: string;
  baseUrl?: string;
}): Promise<PluginOption> {
  const { publicApiKey, baseUrl = 'https://qwik-insights.builder.io' } = qwikInsightsOpts;
  let isProd = false;
  const outDir = 'dist';
  const vitePlugin: PluginOption = {
    name: 'vite-plugin-qwik-insights',
    enforce: 'pre',
    async config(viteConfig) {
      isProd = viteConfig.mode !== 'ssr';
      if (isProd) {
        const qManifest: QwikVitePluginOptions['entryStrategy'] = { type: 'smart' };
        try {
          const response = await fetch(`${baseUrl}/api/v1/${publicApiKey}/bundles/strategy/`);
          const strategy = await response.json();
          Object.assign(qManifest, strategy);
        } catch (e) {
          logWarn('fail to fetch manifest from Insights DB');
        }
        if (!existsSync(join(process.cwd(), outDir))) {
          mkdirSync(join(process.cwd(), outDir));
        }
        await writeFile(join(process.cwd(), outDir, 'q-insights.json'), JSON.stringify(qManifest));
      }
    },
    closeBundle: async () => {
      const path = join(process.cwd(), outDir, 'q-manifest.json');
      if (isProd && existsSync(path)) {
        const qManifest = await readFile(path, 'utf-8');

        try {
          await fetch(`${baseUrl}/api/v1/${publicApiKey}/post/manifest`, {
            method: 'post',
            body: qManifest,
          });
        } catch (e) {
          logWarn('fail to post manifest to Insights DB');
        }
      }
    },
  };
  return vitePlugin;
}

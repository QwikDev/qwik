import { type QwikVitePluginOptions } from '@builder.io/qwik/optimizer';
import { existsSync } from 'fs';
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
  const vitePlugin: PluginOption = {
    name: 'vite-plugin-qwik-insights',
    enforce: 'pre',
    async config(viteConfig) {
      isProd = viteConfig.mode !== 'ssr';
      if (isProd) {
        const qManifest: QwikVitePluginOptions['entryStrategy'] = { type: 'smart' };
        try {
          const response = await fetch(`${baseUrl}/api/v1/${publicApiKey}/bundles/`);
          const bundles = await response.json();
          qManifest.manual = bundles;
        } catch (e) {
          logWarn('fail to fetch manifest from Insights DB');
        }
        const INSIGHTS_Q_MANIFEST_FILENAME = 'q-insights.json';
        await writeFile(join(process.cwd(), 'dist', INSIGHTS_Q_MANIFEST_FILENAME), JSON.stringify(qManifest));
      }
    },
    closeBundle: async () => {
      const Q_MANIFEST_FILENAME = 'q-manifest.json';
      if (isProd && existsSync(join(process.cwd(), 'dist', Q_MANIFEST_FILENAME))) {
        const qManifest = await readFile(join(process.cwd(), 'dist', Q_MANIFEST_FILENAME), 'utf-8');

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

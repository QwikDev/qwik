import { type QwikVitePluginOptions } from '@qwik.dev/core/optimizer';
import { existsSync, mkdirSync } from 'fs';
import { readFile, writeFile } from 'fs/promises';
import { join } from 'node:path';
import { type PluginOption } from 'vite';

const logWarn = (message?: any, ...rest: any[]) => {
  // eslint-disable-next-line no-console
  console.warn('\x1b[33m%s\x1b[0m', `qwikInsight()[WARN]: ${message}`, ...rest);
};

const log = (message?: any) => {
  // eslint-disable-next-line no-console
  console.log('\x1b[35m%s\x1b[0m', `qwikInsight(): ${message}`);
};

/** @experimental */
export async function qwikInsights(qwikInsightsOpts: {
  publicApiKey: string;
  baseUrl?: string;
  outDir?: string;
}): Promise<PluginOption> {
  const { publicApiKey, baseUrl = 'https://insights.qwik.dev', outDir = '' } = qwikInsightsOpts;
  let isProd = false;
  const vitePlugin: PluginOption = {
    name: 'vite-plugin-qwik-insights',
    enforce: 'pre',
    apply: 'build',
    async config(viteConfig) {
      isProd = viteConfig.mode !== 'ssr';
      if (isProd) {
        const qManifest: QwikVitePluginOptions['entryStrategy'] = { type: 'smart' };
        try {
          const response = await fetch(`${baseUrl}/api/v1/${publicApiKey}/bundles/strategy/`);
          const strategy = await response.json();
          Object.assign(qManifest, strategy);
        } catch (e) {
          logWarn('Failed to fetch manifest from Insights DB', e);
        }
        const cwdRelativePath = join(viteConfig.root || '.', outDir);
        const cwdRelativePathJson = join(cwdRelativePath, 'q-insights.json');
        if (!existsSync(join(process.cwd(), cwdRelativePath))) {
          try {
            mkdirSync(join(process.cwd(), cwdRelativePath), { recursive: true });
          } catch (e) {
            logWarn('Failed to create path to store the q-insights.json file', e);
          }
        }
        log('Fetched latest Qwik Insight data into: ' + cwdRelativePathJson);
        try {
          await writeFile(join(process.cwd(), cwdRelativePathJson), JSON.stringify(qManifest));
        } catch (e) {
          logWarn('Failed to create manifest file', e);
        }
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
          logWarn('Failed to post manifest to Insights DB', e);
        }
      }
    },
  };
  return vitePlugin;
}

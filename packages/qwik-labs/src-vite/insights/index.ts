import { type QwikVitePluginOptions } from '@builder.io/qwik/optimizer';
import { existsSync, mkdirSync } from 'fs';
import { readFile, writeFile } from 'fs/promises';
import { join } from 'node:path';
import { PluginOption } from 'vite';

const logWarn = (message?: any) => {
  // eslint-disable-next-line no-console
  console.warn('\x1b[33m%s\x1b[0m', `qwikInsight()[WARN]: ${message}`);
};

const log = (message?: any) => {
  // eslint-disable-next-line no-console
  console.log('\x1b[35m%s\x1b[0m', `qwikInsight(): ${message}`);
};

export async function qwikInsights(qwikInsightsOpts: {
  publicApiKey: string;
  baseUrl?: string;
  outDir?: string;
}): Promise<PluginOption> {
  const {
    publicApiKey,
    baseUrl = 'https://qwik-insights.builder.io',
    outDir = 'dist',
  } = qwikInsightsOpts;
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
          logWarn('fail to fetch manifest from Insights DB');
        }
        const cwdRelativePath = join(viteConfig.root || '.', outDir);
        const cwdRelativePathJson = join(cwdRelativePath, 'q-insights.json');
        if (!existsSync(join(process.cwd(), cwdRelativePath))) {
          mkdirSync(join(process.cwd(), cwdRelativePath), { recursive: true });
        }
        log('Fetched latest Qwik Insight data into: ' + cwdRelativePathJson);
        await writeFile(join(process.cwd(), cwdRelativePathJson), JSON.stringify(qManifest));
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

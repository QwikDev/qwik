import type { QwikVitePlugin, SmartEntryStrategy } from '@qwik.dev/core/optimizer';
import { existsSync, mkdirSync } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { PluginOption } from 'vite';

const logWarn = (message?: any, ...rest: any[]) => {
  console.warn('\x1b[33m%s\x1b[0m', `qwikInsight()[WARN]: ${message}`, ...rest);
};

const log = (message?: any) => {
  // eslint-disable-next-line no-console
  console.log('\x1b[35m%s\x1b[0m', `qwikInsight(): ${message}`);
};

/** @public */
export interface InsightManifest {
  manual: Record<string, string>;
  prefetch: { route: string; symbols: string[] }[];
}

/**
 * @beta
 * @experimental
 */
export async function qwikInsights(qwikInsightsOpts: {
  publicApiKey: string;
  baseUrl?: string;
  outDir?: string;
  /** Fraction of sessions (0-1) that load the tracker and report. Defaults to 0.05. */
  sampleRate?: number;
}): Promise<PluginOption> {
  const {
    publicApiKey,
    baseUrl = 'https://insights.qwik.dev',
    outDir = '',
    sampleRate = 0.05,
  } = qwikInsightsOpts;

  if (!publicApiKey) {
    console.warn('qwikInsights: publicApiKey is required, skipping...');
    return;
  }
  let isProd = false;
  let jsonDir: string;
  let jsonFile: string;
  let data: InsightManifest | null = null;
  let qwikVitePlugin: QwikVitePlugin | null = null;

  const pingerFile = () => fileURLToPath(new URL('../../insights-pinger.js', import.meta.url));

  const apiUrl = `${baseUrl}/api/v1/${publicApiKey}`;
  const postUrl = `${apiUrl}/post/`;

  async function loadQwikInsights(): Promise<InsightManifest | null> {
    if (data) {
      return data;
    }
    if (existsSync(jsonFile)) {
      log('Reading Qwik Insight data from: ' + jsonFile);
      return (data = JSON.parse(await readFile(jsonFile, 'utf-8')) as InsightManifest);
    }
    return null;
  }

  const vitePlugin: PluginOption = {
    name: 'vite-plugin-qwik-insights',
    enforce: 'pre',
    // Only activate in production builds
    apply: 'build',
    async config(viteConfig) {
      jsonDir = resolve(viteConfig.root || '.', outDir);
      jsonFile = join(jsonDir, 'q-insights.json');
      isProd = viteConfig.mode !== 'ssr';

      return {
        define: {
          'globalThis.__QI_KEY__': JSON.stringify(publicApiKey),
          'globalThis.__QI_URL__': JSON.stringify(postUrl),
          'globalThis.__QI_SAMPLE__': JSON.stringify(sampleRate),
        },
      };
    },
    configResolved: {
      // we want to register the bundle graph adder last so we overwrite existing routes
      order: 'post',
      async handler(config) {
        qwikVitePlugin = config.plugins.find(
          (p) => p.name === 'vite-plugin-qwik'
        ) as QwikVitePlugin;
        if (!qwikVitePlugin) {
          throw new Error('Missing vite-plugin-qwik');
        }
        const opts = qwikVitePlugin.api.getOptions();
        if (isProd) {
          try {
            const qManifest: InsightManifest = { manual: {}, prefetch: [] };
            const response = await fetch(`${apiUrl}/bundles/strategy/`);
            const strategy = await response.json();
            Object.assign(qManifest, strategy);
            data = qManifest;
            mkdirSync(jsonDir, { recursive: true });
            log('Fetched latest Qwik Insight data into: ' + jsonFile);
            await writeFile(jsonFile, JSON.stringify(qManifest));
          } catch (e) {
            logWarn(`Failed to fetch manifest from Insights DB at ${apiUrl}/bundles/strategy/`, e);
            await loadQwikInsights();
          }
        } else {
          await loadQwikInsights();
        }

        if (data) {
          (opts.entryStrategy as SmartEntryStrategy).manual = {
            ...data.manual,
            ...(opts.entryStrategy as SmartEntryStrategy).manual,
          };

          qwikVitePlugin.api.registerBundleGraphAdder((manifest) => {
            const result: Record<
              string,
              { imports?: string[] | undefined; dynamicImports?: string[] | undefined }
            > = {};
            if (data) {
              for (let i = 0; i < data.prefetch.length; i++) {
                const item = data.prefetch[i];
                if (item.symbols) {
                  let route = item.route;
                  if (route.startsWith('/')) {
                    route = route.slice(1);
                  }
                  if (!route.endsWith('/')) {
                    route += '/';
                  }
                  result[route] = { ...manifest.bundles[route], imports: item.symbols };
                }
              }
            }
            return result;
          });
        }
      },
    },

    // Copy the lazy pinger into the client build so the inline gate can import it from q:base.
    async generateBundle(this: { emitFile: (f: any) => void }) {
      if (qwikVitePlugin?.api.getOptions().target !== 'client') {
        return;
      }
      try {
        this.emitFile({
          type: 'asset',
          fileName: 'build/qwik-insights-pinger.js',
          source: await readFile(pingerFile(), 'utf-8'),
        });
      } catch (e) {
        logWarn('Failed to emit insights pinger chunk', e);
      }
    },

    closeBundle: async () => {
      const path = resolve(outDir, 'q-manifest.json');
      if (isProd && existsSync(path)) {
        const qManifest = await readFile(path, 'utf-8');

        try {
          await fetch(`${postUrl}manifest`, {
            method: 'post',
            body: qManifest,
          });
        } catch (e) {
          logWarn(`Failed to post manifest to Insights DB at ${postUrl}manifest`, e);
        }
      }
    },
  };
  return vitePlugin;
}

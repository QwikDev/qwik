import type { QwikVitePlugin, SmartEntryStrategy } from '@qwik.dev/core/optimizer';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { existsSync, mkdirSync } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { isAbsolute, join, resolve } from 'node:path';
import { Readable } from 'node:stream';
import type { PluginOption } from 'vite';
import { redactInsightsDbUrl } from '../db';

const logWarn = (message?: any, ...rest: any[]) => {
  console.warn('\x1b[33m%s\x1b[0m', `qwikInsight()[WARN]: ${message}`, ...rest);
};

const log = (message?: any) => {
  // eslint-disable-next-line no-console
  console.log('\x1b[35m%s\x1b[0m', `qwikInsight(): ${message}`);
};

/** Where the dev server records beacons when `db` is set without a `postUrl`. */
const DEV_COLLECTOR_PATH = '__qwik-insights/';

/** Make a relative local DB path absolute so every reader and writer opens the same file. */
function resolveDbUrl(dbUrl: string, root: string): string {
  if (/^(libsql|wss?|https?):\/\//i.test(dbUrl)) {
    return dbUrl;
  }
  const path = dbUrl.replace(/^file:(\/\/(?=\/))?/, '');
  return `file:${isAbsolute(path) ? path : resolve(root, path)}`;
}

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
  /**
   * Fraction of sessions (0-1) that load the tracker and report. Defaults to 1 in dev, 0.05 in a
   * build.
   */
  sampleRate?: number;
  /**
   * Where the client beacons. Set to a local collector route to report to your own server. With
   * `db`, dev defaults to a collector on the dev server; a build without it skips the tracker.
   */
  postUrl?: string;
  /**
   * LibSQL/SQLite URL to compute the build strategy from locally instead of the central service.
   * Relative file paths resolve against the Vite root. Defaults to `QWIK_INSIGHTS_DB_URL`.
   */
  db?: string;
}): Promise<PluginOption> {
  const {
    publicApiKey,
    baseUrl = 'https://insights.qwik.dev',
    outDir = '',
    sampleRate: sampleRateOpt,
    postUrl: postUrlOverride,
    db,
  } = qwikInsightsOpts;
  let dbUrl = db || process.env.QWIK_INSIGHTS_DB_URL;

  if (!publicApiKey) {
    console.warn('qwikInsights: publicApiKey is required, skipping...');
    return;
  }
  let isProd = false;
  let command: 'build' | 'serve' = 'build';
  let jsonDir: string;
  let jsonFile: string;
  let data: InsightManifest | null = null;
  let qwikVitePlugin: QwikVitePlugin | null = null;

  const pingerFile = () =>
    createRequire(import.meta.url).resolve('@qwik.dev/core/insights-pinger.js');
  let pingerSource = '';
  // Content-hashed, because `build/` is served immutable: a stale pinger must never be reused.
  let pingerFileName = '';

  const apiUrl = `${baseUrl}/api/v1/${publicApiKey}`;
  let postUrl = postUrlOverride || `${apiUrl}/post/`;
  let devCollectorPath: string | null = null;

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
    async config(viteConfig, env) {
      command = env.command;
      jsonDir = resolve(viteConfig.root || '.', outDir);
      jsonFile = join(jsonDir, 'q-insights.json');
      isProd = viteConfig.mode !== 'ssr';

      // In dev, only inject the tracker when collecting into a local DB — don't beacon to the
      // central service during `pnpm dev`. Production builds always inject.
      if (command === 'serve' && !dbUrl) {
        return;
      }
      if (dbUrl) {
        dbUrl = resolveDbUrl(dbUrl, viteConfig.root || process.cwd());
        // The collector and devtools read this, so they open the same DB as the plugin.
        process.env.QWIK_INSIGHTS_DB_URL = dbUrl;
        if (!postUrlOverride) {
          if (command === 'build') {
            logWarn(
              '`db` is set without `postUrl`: not adding the tracker, so beacons stay out of the central service. Set `postUrl` to your collector route.'
            );
            return;
          }
          devCollectorPath = (viteConfig.base || '/') + DEV_COLLECTOR_PATH;
          postUrl = devCollectorPath;
        }
      }

      try {
        pingerSource = await readFile(pingerFile(), 'utf-8');
      } catch (e) {
        logWarn('Failed to read the insights pinger, not adding the tracker', e);
        return;
      }
      const pingerHash = createHash('sha256').update(pingerSource).digest('hex').slice(0, 8);
      pingerFileName = `qwik-insights-pinger-${pingerHash}.js`;

      // Track every session in dev (so you see data immediately), sample in a build.
      const sampleRate = sampleRateOpt ?? (command === 'serve' ? 1 : 0.05);

      return {
        define: {
          'globalThis.__QI_KEY__': JSON.stringify(publicApiKey),
          'globalThis.__QI_URL__': JSON.stringify(postUrl),
          'globalThis.__QI_SAMPLE__': JSON.stringify(sampleRate),
          'globalThis.__QI_PINGER__': JSON.stringify(pingerFileName),
        },
      };
    },
    // Dev serve has no generateBundle, so serve the lazy pinger from the built package instead.
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (devCollectorPath && req.method === 'POST' && req.url?.startsWith(devCollectorPath)) {
          recordDevBeacon(req, res, dbUrl!, publicApiKey).catch(next);
          return;
        }
        if (pingerFileName && req.url?.split('?')[0].endsWith('/' + pingerFileName)) {
          res.setHeader('Content-Type', 'application/javascript');
          res.end(pingerSource);
          return;
        }
        next();
      });
    },
    configResolved: {
      // we want to register the bundle graph adder last so we overwrite existing routes
      order: 'post',
      async handler(config) {
        // The bundling strategy only matters for a real build; dev serve just needs the tracker.
        if (command !== 'build') {
          return;
        }
        qwikVitePlugin = config.plugins.find(
          (p) => p.name === 'vite-plugin-qwik'
        ) as QwikVitePlugin;
        if (!qwikVitePlugin) {
          throw new Error('Missing vite-plugin-qwik');
        }
        const opts = qwikVitePlugin.api.getOptions();
        if (isProd && dbUrl) {
          // Decentralized: compute the strategy from a local libSQL DB instead of central HTTP.
          try {
            const { computeInsightsStrategy } = await import('../vite/strategy');
            const strategy = await computeInsightsStrategy(
              dbUrl,
              publicApiKey,
              process.env.QWIK_INSIGHTS_DB_AUTH_TOKEN
            );
            if (strategy) {
              data = { manual: strategy.manual, prefetch: strategy.prefetch };
              mkdirSync(jsonDir, { recursive: true });
              log('Computed Qwik Insight strategy from: ' + redactInsightsDbUrl(dbUrl));
              await writeFile(jsonFile, JSON.stringify(data));
            } else {
              log('No insights collected yet in: ' + redactInsightsDbUrl(dbUrl));
              await loadQwikInsights();
            }
          } catch (e) {
            logWarn(
              `Failed to compute strategy from insights DB at ${redactInsightsDbUrl(dbUrl)}`,
              e
            );
            await loadQwikInsights();
          }
        } else if (isProd) {
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
      if (!pingerFileName || qwikVitePlugin?.api.getOptions().target !== 'client') {
        return;
      }
      this.emitFile({ type: 'asset', fileName: `build/${pingerFileName}`, source: pingerSource });
    },

    closeBundle: async () => {
      // Decentralized (local DB) setups don't report to the central service.
      if (dbUrl) {
        return;
      }
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

/** Dev-server collector: forwards a beacon (or `error/` beacon) to the local collector. */
async function recordDevBeacon(
  req: IncomingMessage,
  res: ServerResponse,
  dbUrl: string,
  publicApiKey: string
): Promise<void> {
  const { handleInsightsBeacon } = await import('../collector');
  // Streamed, so the collector's size limit stops oversized bodies before they're buffered.
  const request = new Request(new URL(req.url!, 'http://localhost'), {
    method: 'POST',
    body: Readable.toWeb(req) as ReadableStream,
    duplex: 'half',
  } as RequestInit);
  const recorded = await handleInsightsBeacon(request, { dbUrl, publicApiKey });
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify({ ok: recorded }));
}

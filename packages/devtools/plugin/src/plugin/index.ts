import type { Plugin, UserConfig } from 'vite';
import Inspect from 'vite-plugin-inspect';
import { createBuildAnalysisPlugins } from '../build-analysis';
import { devtoolsPlugin } from './devtools';
import { statisticsPlugin } from './statistics';
import type { QwikDevtoolsOptions } from '../virtualmodules/virtualModules';

// Re-export individual plugins
export { devtoolsPlugin } from './devtools';
export type { QwikDevtoolsOptions } from '../virtualmodules/virtualModules';

/** Main entry: combines all devtools plugins */
export function qwikDevtools(opts: QwikDevtoolsOptions = {}): Plugin[] {
  return [
    devtoolsPlugin(opts),
    inspectPlugin(),
    statisticsPlugin(),
    ...createBuildAnalysisPlugins(),
    // Add more plugins here as needed
  ];
}

function canServeInspect({ legacy, server }: Pick<UserConfig, 'legacy' | 'server'>) {
  const host = server?.host;
  const isLoopback = !host || host === 'localhost' || host === '127.0.0.1' || host === '::1';
  const ws = server?.ws;
  const hmr = server?.hmr;

  // Inspect exposes module source over Vite's development WebSocket.
  return (
    isLoopback &&
    !server?.middlewareMode &&
    ws !== false &&
    !ws?.port &&
    !ws?.server &&
    hmr !== false &&
    !(typeof hmr === 'object' && (hmr.port || hmr.server)) &&
    !legacy?.skipWebSocketTokenCheck
  );
}

function inspectPlugin(): Plugin {
  const inspect = Inspect();
  const hook = inspect.configureServer;
  const configureInspect = typeof hook === 'function' ? hook : hook?.handler;

  return Object.assign(inspect, {
    apply(config, { command }) {
      const { devtools } = config;
      return (
        command === 'serve' &&
        devtools !== false &&
        !(typeof devtools === 'object' && devtools.enabled === false) &&
        canServeInspect(config)
      );
    },
    configureServer(server) {
      if (!canServeInspect(server.config)) {
        return;
      }
      const { base } = server.config;
      server.middlewares.use(`${base}.vite-inspect`, (req, res) => {
        const path = req.url?.replace(/^\/?/, '') ?? '';
        res.writeHead(302, { Location: `${base}__inspect/${path}` });
        res.end();
      });
      return configureInspect?.call(this, server);
    },
  } satisfies Pick<Plugin, 'apply' | 'configureServer'>);
}

/* eslint-disable no-console */
import type { RenderToStringOptions, RenderToStringResult } from '@builder.io/qwik/server';
import type { ReplInputOptions, ReplResult } from '../types';
import type { QwikReplContext } from './context';
import type { QwikWorkerGlobal } from './repl-service-worker';

export const ssrHtml = async (
  options: ReplInputOptions,
  ctx: QwikReplContext,
  result: ReplResult
) => {
  const ssrModule = result.ssrModules.find((m) => m.path.endsWith('.js'));
  if (!ssrModule || typeof ssrModule.code !== 'string') {
    return;
  }
  const start = performance.now();

  const mod: any = { exports: {} };
  const run = new Function('module', 'exports', 'require', ssrModule.code);
  run(mod, mod.exports, noopRequire);

  const server: ServerModule = mod.exports;
  if (typeof server.render !== 'function') {
    throw new Error(`Server module "${ssrModule.path}" does not export render()`);
  }

  console.time(`SSR Html`);

  const log = console.log;
  const warn = console.warn;
  const error = console.error;
  const debug = console.debug;

  console.log = (...args) => {
    result.events.push({
      kind: 'console-log',
      scope: 'ssr',
      message: args.map((a) => String(a)),
      start: performance.now(),
    });
    log(...args);
  };

  console.warn = (...args) => {
    result.events.push({
      kind: 'console-warn',
      scope: 'ssr',
      message: args.map((a) => String(a)),
      start: performance.now(),
    });
    warn(...args);
  };

  console.error = (...args) => {
    result.events.push({
      kind: 'console-error',
      scope: 'ssr',
      message: args.map((a) => String(a)),
      start: performance.now(),
    });
  };

  console.debug = (...args) => {
    result.events.push({
      kind: 'console-debug',
      scope: 'ssr',
      message: args.map((a) => String(a)),
      start: performance.now(),
    });
    debug(...args);
  };

  const ssrResult = await server.render({
    base: `/repl/${result.clientId}/build/`,
    manifest: result.manifest,
  });

  console.log = log;
  console.warn = warn;
  console.error = error;
  console.debug = debug;

  result.html = ssrResult.html;

  result.events.push({
    kind: 'pause',
    scope: 'ssr',
    start,
    end: performance.now(),
    message: [],
  });

  if (options.buildMode !== 'production') {
    try {
      const html = self.prettier?.format(result.html, {
        parser: 'html',
        plugins: self.prettierPlugins,
      });
      if (html) {
        result.html = html;
      }
    } catch (e) {
      console.error(e);
    }
  }

  ctx.html = result.html;

  console.timeEnd(`SSR Html`);
};

const noopRequire = (path: string) => {
  console.debug(`require() not available from REPL SSR, path: ${path}`);
};

interface ServerModule {
  render: (opts: RenderToStringOptions) => Promise<RenderToStringResult>;
}

declare const self: QwikWorkerGlobal;

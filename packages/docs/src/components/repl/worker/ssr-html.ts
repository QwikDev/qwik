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

  const mod: any = { exports: {} };
  const run = new Function('module', 'exports', 'require', ssrModule.code);
  run(mod, mod.exports, noopRequire);

  const server: ServerModule = mod.exports;
  if (typeof server.render !== 'function') {
    throw new Error(`Server module "${ssrModule.path}" does not export render()`);
  }

  console.time(`SSR Html`);
  const ssrResult = await server.render({
    base: `/repl/${options.clientId}/build/`,
    manifest: result.manifest,
  });

  result.html = ssrResult.html;

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
  console.error(`require() not available from REPL SSR, path: ${path}`);
};

interface ServerModule {
  render: (opts: RenderToStringOptions) => Promise<RenderToStringResult>;
}

declare const self: QwikWorkerGlobal;

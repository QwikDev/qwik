/* eslint-disable no-console */
import type { RenderToStringOptions, RenderToStringResult } from '@builder.io/qwik/server';
import type { ReplInputOptions, ReplResult, ReplResultAttributes } from '../types';
import type { QwikWorkerGlobal } from './repl-service-worker';

export const ssrHtml = async (options: ReplInputOptions, result: ReplResult) => {
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

  const doc = self.qwikServer?._createDocument({ html: ssrResult.html });
  if (doc) {
    const qwikLoader = doc.getElementById('qwikloader');
    if (qwikLoader) {
      qwikLoader.remove();
      result.qwikloader = qwikLoader.innerHTML;
    }

    getAttributes(doc.documentElement, result.docElementAttributes);
    getAttributes(doc.head, result.headAttributes);
    getAttributes(doc.body, result.bodyAttributes);
    result.bodyInnerHtml = doc.body.innerHTML;

    if (options.buildMode !== 'production') {
      const outputHtml = self.prettier?.format(ssrResult.html, {
        parser: 'html',
        plugins: self.prettierPlugins,
      });
      if (outputHtml) {
        result.outputHtml = outputHtml;
      }
    } else {
      result.outputHtml = ssrResult.html;
    }
  }
  console.timeEnd(`SSR Html`);
};

const noopRequire = (path: string) => {
  console.error(`require() not available from REPL SSR, path: ${path}`);
};

const getAttributes = (elm: HTMLElement, attrs: ReplResultAttributes) => {
  for (let i = 0; i < elm.attributes.length; i++) {
    attrs[elm.attributes[i].nodeName] = elm.attributes[i].nodeValue!;
  }
};

interface ServerModule {
  render: (opts: RenderToStringOptions) => Promise<RenderToStringResult>;
}

declare const self: QwikWorkerGlobal;

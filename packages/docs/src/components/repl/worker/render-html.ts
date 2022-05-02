/* eslint-disable no-console */

import type { RenderToStringOptions, RenderToStringResult } from '@builder.io/qwik/server';
import type { ReplResult, ReplResultAttributes } from '../types';
import type { QwikWorkerGlobal } from './repl-service-worker';

export const renderHtml = async (result: ReplResult) => {
  console.time(`SSR Html`);

  const ssrModule = result.ssrModules.find((m) => m.path.endsWith('.js'));
  if (!ssrModule) {
    return;
  }

  const module: any = { exports: {} };
  const runModule = new Function('module', 'exports', ssrModule.code);
  runModule(module, module.exports);

  const server: ServerModule = module.exports;

  const ssrResult = await server.render({
    base: '/repl/',
    symbols: result.symbolsEntryMap,
  });

  const doc = self.qwikServer.createDocument({ html: ssrResult.html });
  const qwikLoader = doc.getElementById('qwikloader');
  if (qwikLoader) {
    qwikLoader.remove();
    result.qwikloader = qwikLoader.innerHTML;
  }

  getAttributes(doc.documentElement, result.docElementAttributes);
  getAttributes(doc.head, result.headAttributes);
  getAttributes(doc.body, result.bodyAttributes);
  result.bodyInnerHtml = doc.body.innerHTML;

  result.outputHtml = self.prettier.format(ssrResult.html, {
    parser: 'html',
    plugins: self.prettierPlugins,
  });

  console.timeEnd(`SSR Html`);
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

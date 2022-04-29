/* eslint-disable no-console */

import type { ReplInputOptions } from '../types';
import { ctx, PRETTIER_VERSION, ROLLUP_VERSION, TERSER_VERSION } from './constants';
import type { QwikWorkerGlobal } from './repl-service-worker';
import { getNpmCdnUrl } from './utils';

export const loadDependencies = async (version: string, options: ReplInputOptions) => {
  if (
    !self.qwikCore ||
    !self.qwikOptimizer ||
    !self.qwikServer ||
    !self.rollup ||
    self.qwikCore.version !== version ||
    self.qwikOptimizer.versions.qwik !== version ||
    self.qwikServer.versions.qwik !== version ||
    self.rollup.VERSION !== ROLLUP_VERSION
  ) {
    console.time('Load dependencies');
    self.qwikCore = self.qwikOptimizer = self.qwikServer = self.rollup = null as any;

    const coreCjsUrl = getNpmCdnUrl('@builder.io/qwik', version, '/core.cjs');
    const coreEsmUrl = getNpmCdnUrl('@builder.io/qwik', version, '/core.mjs');
    const optimizerCjsUrl = getNpmCdnUrl('@builder.io/qwik', version, '/optimizer.mjs');
    const serverCjsUrl = getNpmCdnUrl('@builder.io/qwik', version, '/server.mjs');
    const rollupUrl = getNpmCdnUrl('rollup', ROLLUP_VERSION, '/dist/rollup.browser.js');
    const prettierUrl = getNpmCdnUrl('prettier', PRETTIER_VERSION, '/standalone.js');
    const prettierHtmlUrl = getNpmCdnUrl('prettier', PRETTIER_VERSION, '/parser-html.js');

    const depUrls = [
      coreCjsUrl,
      coreEsmUrl,
      optimizerCjsUrl,
      serverCjsUrl,
      rollupUrl,
      prettierUrl,
      prettierHtmlUrl,
    ];

    const rsps = await Promise.all(depUrls.map((u) => fetch(u)));

    rsps.forEach((rsp) => {
      if (!rsp.ok) {
        throw new Error(`Unable to load dependency: ${rsp.url}`);
      }
    });

    const [
      coreCjsCode,
      coreEsmCode,
      optimizerCjsCode,
      serverCjsCode,
      rollupCode,
      prettierCode,
      prettierHtmlCode,
    ] = await Promise.all(rsps.map((rsp) => rsp.text()));

    ctx.coreEsmCode = coreEsmCode;

    const coreApply = new Function(coreCjsCode);
    const optimizerApply = new Function(optimizerCjsCode);
    const serverApply = new Function(serverCjsCode);
    const rollupApply = new Function(rollupCode);
    const prettierApply = new Function(prettierCode);
    const prettierHtmlApply = new Function(prettierHtmlCode);

    coreApply();
    console.debug(`Loaded @builder.io/qwik: ${self.qwikCore.version}`);

    optimizerApply();
    console.debug(`Loaded @builder.io/qwik/optimizer: ${self.qwikOptimizer.versions.qwik}`);

    serverApply();
    console.debug(`Loaded @builder.io/qwik/server: ${self.qwikServer.versions.qwik}`);

    rollupApply();
    console.debug(`Loaded rollup: ${self.rollup.VERSION}`);

    prettierApply();
    prettierHtmlApply();
    console.debug(`Loaded prettier: ${self.prettier.version}`);

    console.timeEnd('Load dependencies');
  }

  if (options.minify === 'minify' && !self.Terser) {
    console.time(`Load terser ${TERSER_VERSION}`);
    const terserUrl = getNpmCdnUrl('terser', TERSER_VERSION, '/dist/bundle.min.js');
    const terserRsp = await fetch(terserUrl);
    const terserCode = await terserRsp.text();
    const terserApply = new Function(terserCode);
    terserApply();
    console.timeEnd(`Load terser ${TERSER_VERSION}`);
  }
};

declare const self: QwikWorkerGlobal;

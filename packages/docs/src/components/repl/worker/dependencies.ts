/* eslint-disable no-console */
import type { ReplInputOptions } from '../types';
import { ctx } from './constants';
import type { QwikWorkerGlobal } from './repl-service-worker';

export const loadDependencies = async (options: ReplInputOptions) => {
  const version = options.version;
  if (!hasDependencies(version)) {
    console.time('Load dependencies');
    self.qwikCore = self.qwikOptimizer = self.qwikServer = self.rollup = null as any;

    const coreCjsUrl = getNpmCdnUrl(QWIK_PKG_NAME, version, '/core.cjs');
    const coreEsmDevUrl = getNpmCdnUrl(QWIK_PKG_NAME, version, '/core.mjs');
    const coreEsmMinUrl = getNpmCdnUrl(QWIK_PKG_NAME, version, '/core.min.mjs');
    const optimizerCjsUrl = getNpmCdnUrl(QWIK_PKG_NAME, version, '/optimizer.cjs');
    const serverCjsUrl = getNpmCdnUrl(QWIK_PKG_NAME, version, '/server.cjs');
    const rollupUrl = getNpmCdnUrl('rollup', ROLLUP_VERSION, '/dist/rollup.browser.js');
    const prettierUrl = getNpmCdnUrl('prettier', PRETTIER_VERSION, '/standalone.js');
    const prettierHtmlUrl = getNpmCdnUrl('prettier', PRETTIER_VERSION, '/parser-html.js');

    const depUrls = [
      coreCjsUrl,
      coreEsmDevUrl,
      coreEsmMinUrl,
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
      coreCjs,
      coreEsmDev,
      coreEsmMin,
      optimizerCjs,
      serverCjs,
      rollup,
      prettier,
      prettierHtml,
    ] = rsps;

    await exec(coreCjs);
    console.debug(`Loaded @builder.io/qwik: ${self.qwikCore.version}`);

    await exec(optimizerCjs);
    console.debug(`Loaded @builder.io/qwik/optimizer: ${self.qwikOptimizer.versions.qwik}`);

    await exec(serverCjs);
    console.debug(`Loaded @builder.io/qwik/server: ${self.qwikServer.versions.qwik}`);

    await exec(rollup);
    console.debug(`Loaded rollup: ${self.rollup.VERSION}`);

    await exec(prettier);
    await exec(prettierHtml);
    console.debug(`Loaded prettier: ${self.prettier.version}`);

    ctx.coreEsmDevCode = await coreEsmDev.text();
    ctx.coreEsmMinCode = await coreEsmMin.text();

    console.timeEnd('Load dependencies');
  }

  if (options.buildMode === 'production' && !self.Terser) {
    console.time(`Load terser ${TERSER_VERSION}`);
    const terserUrl = getNpmCdnUrl('terser', TERSER_VERSION, '/dist/bundle.min.js');
    const terserRsp = await fetch(terserUrl);
    await exec(terserRsp);
    console.timeEnd(`Load terser ${TERSER_VERSION}`);
  }
};

const exec = async (rsp: Response) => {
  console.debug(`Run ${rsp.url}`);
  const run = new Function(await rsp.text());
  run();
};

const getNpmCdnUrl = (pkgName: string, pkgVersion: string, pkgPath: string) => {
  if (pkgName === QWIK_PKG_NAME && location.hostname === 'localhost') {
    // use the local versions during development
    // vite dev server in vite.config.ts is wired-up looking for this path
    return `/${pkgName}${pkgPath}`;
  }
  return `https://cdn.jsdelivr.net/npm/${pkgName}${pkgVersion ? '@' + pkgVersion : ''}${pkgPath}`;
};

const hasDependencies = (version: string) => {
  return (
    self.qwikCore &&
    isSameQwikVersion(self.qwikCore.version, version) &&
    self.qwikOptimizer &&
    isSameQwikVersion(self.qwikOptimizer.versions.qwik, version) &&
    self.qwikServer &&
    isSameQwikVersion(self.qwikServer.versions.qwik, version) &&
    self.rollup &&
    self.rollup.VERSION === ROLLUP_VERSION
  );
};

const isSameQwikVersion = (a: string, b: string) => {
  if (a !== b && !a.includes('-dev') && !b.includes('-dev')) {
    return false;
  }
  return true;
};

const QWIK_PKG_NAME = '@builder.io/qwik';
const ROLLUP_VERSION = '2.70.2';
const PRETTIER_VERSION = '2.6.2';
const TERSER_VERSION = '5.12.1';

declare const self: QwikWorkerGlobal;

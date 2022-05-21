/* eslint-disable no-console */
import type { ReplInputOptions } from '../types';
import type { QwikWorkerGlobal } from './repl-service-worker';

export const deps: {
  pkgName: string;
  pkgPath: string;
  pkgVersion?: string;
  pkgUrl?: string;
  code?: string;
}[] = [];

const ensureDep = async (pkgName: string, pkgVersion: string, pkgPath: string) => {
  let dep = deps.find((d) => d.pkgName === pkgName && d.pkgPath === pkgPath);

  if (!dep) {
    dep = {
      pkgName,
      pkgPath,
    };
    deps.push(dep);
  }

  if (dep.pkgVersion !== pkgVersion) {
    dep.pkgUrl = getNpmCdnUrl(pkgName, pkgVersion, pkgPath);
    dep.pkgVersion = pkgVersion;

    const rsp = await fetch(dep.pkgUrl);
    dep.code = await rsp.text();

    console.debug(`Loaded: ${dep.pkgUrl}`);
  }
};

const exec = (pkgName: string, pkgPath: string) => {
  const dep = deps.find((d) => d.pkgName === pkgName && d.pkgPath === pkgPath);
  console.debug(`Run: ${dep?.pkgUrl}`);
  const run = new Function(dep!.code!);
  run();
};

export const loadDependencies = async (options: ReplInputOptions) => {
  const version = options.version;

  const promises = [
    ensureDep(QWIK_PKG_NAME, version, '/core.cjs'),
    ensureDep(QWIK_PKG_NAME, version, '/core.mjs'),
    ensureDep(QWIK_PKG_NAME, version, '/core.min.mjs'),
    ensureDep(QWIK_PKG_NAME, version, '/optimizer.cjs'),
    ensureDep(QWIK_PKG_NAME, version, '/server.cjs'),
    ensureDep('rollup', ROLLUP_VERSION, '/dist/rollup.browser.js'),
    ensureDep('prettier', PRETTIER_VERSION, '/standalone.js'),
    ensureDep('prettier', PRETTIER_VERSION, '/parser-html.js'),
  ];

  await Promise.all(promises);

  if (!isSameQwikVersion(self.qwikCore?.version, version)) {
    exec(QWIK_PKG_NAME, '/core.cjs');
    console.debug(`Loaded @builder.io/qwik: ${self.qwikCore!.version}`);
  }

  if (!isSameQwikVersion(self.qwikOptimizer?.versions.qwik, version)) {
    exec(QWIK_PKG_NAME, '/optimizer.cjs');
    console.debug(`Loaded @builder.io/qwik/optimizer: ${self.qwikOptimizer!.versions.qwik}`);
  }

  if (!isSameQwikVersion(self.qwikServer?.versions.qwik, version)) {
    exec(QWIK_PKG_NAME, '/server.cjs');
    console.debug(`Loaded @builder.io/qwik/server: ${self.qwikServer!.versions!.qwik}`);
  }

  if (self.rollup?.VERSION !== ROLLUP_VERSION) {
    exec('rollup', '/dist/rollup.browser.js');
    console.debug(`Loaded rollup: ${self.rollup!.VERSION}`);
  }

  if (self.prettier?.version !== PRETTIER_VERSION) {
    exec('prettier', '/standalone.js');
    exec('prettier', '/parser-html.js');
    console.debug(`Loaded prettier: ${self.prettier!.version}`);
  }

  if (options.buildMode === 'production' && !self.Terser) {
    await ensureDep('terser', TERSER_VERSION, '/dist/bundle.min.js');
    exec('terser', '/dist/bundle.min.js');
  }
};

const getNpmCdnUrl = (pkgName: string, pkgVersion: string, pkgPath: string) => {
  if (pkgName === QWIK_PKG_NAME && location.hostname === 'localhost') {
    // use the local versions during development
    // vite dev server in vite.config.ts is wired-up looking for this path
    return `/${pkgName}${pkgPath}`;
  }
  return `https://cdn.jsdelivr.net/npm/${pkgName}${pkgVersion ? '@' + pkgVersion : ''}${pkgPath}`;
};

const isSameQwikVersion = (a: string | undefined, b: string) => {
  if (!a || (a !== b && !a.includes('-dev') && !b.includes('-dev'))) {
    return false;
  }
  return true;
};

const QWIK_PKG_NAME = '@builder.io/qwik';
const ROLLUP_VERSION = '2.70.2';
const PRETTIER_VERSION = '2.6.2';
const TERSER_VERSION = '5.12.1';

declare const self: QwikWorkerGlobal;

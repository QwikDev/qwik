import { BuildConfig, panic } from './util';
import { Extractor, ExtractorConfig } from '@microsoft/api-extractor';
import { join } from 'node:path';
import { readFileSync, writeFileSync } from 'node:fs';

/**
 * Create each submodule's bundled dts file, and ensure
 * the public API has not changed for a production build.
 */
export function apiExtractor(config: BuildConfig) {
  // core
  // Run the api extractor for each of the submodules
  createTypesApi(
    config,
    join(config.srcDir, 'core'),
    join(config.distPkgDir, 'core.d.ts'),
    './core'
  );
  createTypesApi(
    config,
    join(config.srcDir, 'jsx-runtime'),
    join(config.distPkgDir, 'jsx-runtime.d.ts'),
    './core'
  );
  createTypesApi(
    config,
    join(config.srcDir, 'optimizer'),
    join(config.distPkgDir, 'optimizer.d.ts'),
    './core'
  );
  createTypesApi(
    config,
    join(config.srcDir, 'server'),
    join(config.distPkgDir, 'server.d.ts'),
    './core'
  );
  createTypesApi(
    config,
    join(config.srcDir, 'testing'),
    join(config.distPkgDir, 'testing', 'index.d.ts'),
    '../core'
  );
  createTypesApi(
    config,
    join(config.srcDir, 'build'),
    join(config.distPkgDir, 'build', 'index.d.ts'),
    '../core'
  );
  generateServerReferenceModules(config);

  // qwik-city
  createTypesApi(
    config,
    join(config.packagesDir, 'qwik-city', 'runtime', 'src'),
    join(config.packagesDir, 'qwik-city', 'lib', 'index.d.ts')
  );
  createTypesApi(
    config,
    join(config.packagesDir, 'qwik-city', 'runtime', 'src', 'library', 'service-worker'),
    join(config.packagesDir, 'qwik-city', 'lib', 'service-worker.d.ts')
  );
  createTypesApi(
    config,
    join(config.packagesDir, 'qwik-city', 'buildtime', 'vite'),
    join(config.packagesDir, 'qwik-city', 'lib', 'vite', 'index.d.ts')
  );
  createTypesApi(
    config,
    join(config.packagesDir, 'qwik-city', 'adaptors', 'cloudflare-pages', 'vite'),
    join(
      config.packagesDir,
      'qwik-city',
      'lib',
      'adaptors',
      'cloudflare-pages',
      'vite',
      'index.d.ts'
    )
  );
  createTypesApi(
    config,
    join(config.packagesDir, 'qwik-city', 'adaptors', 'express', 'vite'),
    join(config.packagesDir, 'qwik-city', 'lib', 'adaptors', 'express', 'vite', 'index.d.ts')
  );
  createTypesApi(
    config,
    join(config.packagesDir, 'qwik-city', 'adaptors', 'netlify-edge', 'vite'),
    join(config.packagesDir, 'qwik-city', 'lib', 'adaptors', 'netlify-edge', 'vite', 'index.d.ts')
  );
  createTypesApi(
    config,
    join(config.packagesDir, 'qwik-city', 'adaptors', 'static', 'vite'),
    join(config.packagesDir, 'qwik-city', 'lib', 'adaptors', 'static', 'vite', 'index.d.ts')
  );
  createTypesApi(
    config,
    join(config.packagesDir, 'qwik-city', 'adaptors', 'vercel-edge', 'vite'),
    join(config.packagesDir, 'qwik-city', 'lib', 'adaptors', 'vercel-edge', 'vite', 'index.d.ts')
  );
  createTypesApi(
    config,
    join(config.packagesDir, 'qwik-city', 'middleware', 'cloudflare-pages'),
    join(config.packagesDir, 'qwik-city', 'lib', 'middleware', 'cloudflare-pages', 'index.d.ts')
  );
  createTypesApi(
    config,
    join(config.packagesDir, 'qwik-city', 'middleware', 'netlify-edge'),
    join(config.packagesDir, 'qwik-city', 'lib', 'middleware', 'netlify-edge', 'index.d.ts')
  );
  createTypesApi(
    config,
    join(config.packagesDir, 'qwik-city', 'middleware', 'node'),
    join(config.packagesDir, 'qwik-city', 'lib', 'middleware', 'node', 'index.d.ts')
  );
  createTypesApi(
    config,
    join(config.packagesDir, 'qwik-city', 'static'),
    join(config.packagesDir, 'qwik-city', 'lib', 'static', 'index.d.ts')
  );
  createTypesApi(
    config,
    join(config.packagesDir, 'qwik-city', 'middleware', 'vercel-edge'),
    join(config.packagesDir, 'qwik-city', 'lib', 'middleware', 'vercel-edge', 'index.d.ts')
  );
  generateQwikCityReferenceModules(config);

  console.log('🥶', 'submodule d.ts API files generated');
}

function createTypesApi(config: BuildConfig, inPath: string, outPath: string, corePath?: string) {
  const extractorConfigPath = join(inPath, 'api-extractor.json');
  const extractorConfig = ExtractorConfig.loadFileAndPrepare(extractorConfigPath);
  const result = Extractor.invoke(extractorConfig, {
    localBuild: !!config.dev,
    showVerboseMessages: true,
    showDiagnostics: true,
    messageCallback(msg) {
      msg.handled = true;
      if (msg.logLevel === 'verbose' || msg.logLevel === 'warning') {
        return;
      }
      if (msg.text.includes('Analysis will use')) {
        return;
      }
      if (msg.messageId === 'console-compiler-version-notice') {
        return;
      }
      console.error(`❌ API Extractor, submodule: "${inPath}"\n${extractorConfigPath}\n`, msg);
    },
  });
  if (!result.succeeded) {
    panic(
      `Use "pnpm api.update" to automatically update the .md files if the api changes were expected`
    );
  }
  const srcPath = result.extractorConfig.untrimmedFilePath;
  const content = fixDtsContent(config, srcPath, corePath);
  writeFileSync(outPath, content);
}

function generateQwikCityReferenceModules(config: BuildConfig) {
  // @builder.io/qwik-city/server-modules.d.ts
  const referenceDts = `
declare module '@qwik-city-plan' {
  export const routes: any[];
  export const menus: any[];
  export const trailingSlash: boolean;
  export const basePathname: string;
  export const cacheModules: boolean;
  const defaultExport: {
    routes: any[];
    menus: any[];
    trailingSlash: boolean;
    basePathname: string;
    cacheModules: boolean;
  };
  export default defaultExport;
}
`;
  const srcModulesPath = join(config.packagesDir, 'qwik-city', 'lib');

  const destModulesPath = join(srcModulesPath, 'modules.d.ts');
  writeFileSync(destModulesPath, referenceDts);

  // manually prepend the ts reference since api extractor removes it
  const prependReferenceDts = `/// <reference path="./modules.d.ts" />\n\n`;
  const distIndexPath = join(srcModulesPath, 'index.d.ts');
  let serverDts = readFileSync(distIndexPath, 'utf-8');
  serverDts = prependReferenceDts + serverDts;
  writeFileSync(distIndexPath, serverDts);
}

function generateServerReferenceModules(config: BuildConfig) {
  // server-modules.d.ts
  const referenceDts = `/// <reference types="./server" />
declare module '@qwik-client-manifest' {
  const manifest: QwikManifest;
  export { manifest };
}
// CSS
declare module '*.css' {
  /**
   * @deprecated Use \`import style from './style.css?inline'\` instead.
   */
  const css: unknown
  export default css
}
declare module '*.scss' {
  /**
   * @deprecated Use \`import style from './style.scss?inline'\` instead.
   */
  const css: unknown
  export default css
}
declare module '*.sass' {
  /**
   * @deprecated Use \`import style from './style.sass?inline'\` instead.
   */
  const css: unknown
  export default css
}
declare module '*.less' {
  /**
   * @deprecated Use \`import style from './style.less?inline'\` instead.
   */
  const css: unknown
  export default css
}
declare module '*.styl' {
  /**
   * @deprecated Use \`import style from './style.styl?inline'\` instead.
   */
  const css: unknown
  export default css
}
declare module '*.stylus' {
  /**
   * @deprecated Use \`import style from './style.stylus?inline'\` instead.
   */
  const css: unknown
  export default css
}
declare module '*.pcss' {
  /**
   * @deprecated Use \`import style from './style.pcss?inline'\` instead.
   */
  const css: unknown
  export default css
}
declare module '*.sss' {
  /**
   * @deprecated Use \`import style from './style.sss?inline'\` instead.
   */
  const css: unknown
  export default css
}
`;

  const destServerModulesPath = join(config.distPkgDir, 'server-modules.d.ts');
  writeFileSync(destServerModulesPath, referenceDts);

  // manually prepend the ts reference since api extractor removes it
  const prependReferenceDts = `/// <reference path="./server-modules.d.ts" />\n\n`;
  const distServerPath = join(config.distPkgDir, 'server.d.ts');
  let serverDts = readFileSync(distServerPath, 'utf-8');
  serverDts = prependReferenceDts + serverDts;
  writeFileSync(distServerPath, serverDts);
}

/**
 * Fix up the generated dts content, and ensure it's using a relative
 * path to find the core.d.ts file, rather than node resolving it.
 */
function fixDtsContent(config: BuildConfig, srcPath: string, corePath: string | undefined) {
  let dts = readFileSync(srcPath, 'utf-8');

  // ensure we're just using a relative path
  if (corePath) {
    dts = dts.replace(/@builder\.io\/qwik/g, corePath);
  }

  // for some reason api-extractor is adding this in  ¯\_(ツ)_/¯
  dts = dts.replace('{};', '');

  // replace QWIK_VERSION with the actual version number, useful for debugging
  return dts.replace(/QWIK_VERSION/g, config.distVersion);
}

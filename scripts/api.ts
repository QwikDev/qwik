import { BuildConfig, panic } from './util';
import { Extractor, ExtractorConfig } from '@microsoft/api-extractor';
import { join } from 'path';
import { readFileSync, writeFileSync } from 'fs';

/**
 * Create each submodule's bundled dts file, and ensure
 * the public API has not changed for a production build.
 */
export function apiExtractor(config: BuildConfig) {
  // Run the api extractor for each of the submodules
  createTypesApi(config, 'core', 'core.d.ts', './core');
  createTypesApi(config, 'jsx-runtime', 'jsx-runtime.d.ts', './core');
  createTypesApi(config, 'optimizer', 'optimizer.d.ts', './core');
  createTypesApi(config, 'server', 'server.d.ts', './core');
  createTypesApi(config, 'testing', 'testing/index.d.ts', '../core');
  createTypesApi(config, 'build', 'build/index.d.ts', '../core');

  generateServerReferenceModules(config);

  console.log('🥶', 'submodule d.ts API files generated');
}

function createTypesApi(
  config: BuildConfig,
  submodule: string,
  outFileName: string,
  corePath: string
) {
  const extractorConfigPath = join(config.srcDir, submodule, 'api-extractor.json');
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
      console.error(`❌ API Extractor, submodule: "${submodule}"\n${extractorConfigPath}\n`, msg);
    },
  });
  if (!result.succeeded) {
    panic(
      `Use "yarn api.update" to automatically update the .md files if the api changes were expected`
    );
  }
  const srcPath = result.extractorConfig.untrimmedFilePath;
  const destPath = join(config.distPkgDir, outFileName);
  fixDtsContent(config, srcPath, destPath, corePath);
}

function generateServerReferenceModules(config: BuildConfig) {
  // server-modules.d.ts
  const referenceDts = `/// <reference types="./server" />
declare module '@qwik-client-manifest' {
  const manifest: QwikManifest;
  export { manifest };
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
function fixDtsContent(config: BuildConfig, srcPath: string, destPath: string, corePath: string) {
  let dts = readFileSync(srcPath, 'utf-8');

  // ensure we're just using a relative path
  dts = dts.replace(/@builder\.io\/qwik/g, corePath);

  // for some reason api-extractor is adding this in  ¯\_(ツ)_/¯
  dts = dts.replace('{};', '');

  // replace QWIK_VERSION with the actual version number, useful for debugging
  dts = dts.replace(/QWIK_VERSION/g, config.distVersion);

  writeFileSync(destPath, dts);
}

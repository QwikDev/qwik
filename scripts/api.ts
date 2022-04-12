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
  createTypesApi(config, 'optimizer', 'optimizer.d.ts', './core');
  createTypesApi(config, 'server', 'server.d.ts', './core');
  createTypesApi(config, 'testing', 'testing/index.d.ts', '../core');
  createTypesApi(config, 'build', 'build/index.d.ts', '../core');

  // the jsx-runtime.d.ts file was already generated with tsc, use this one
  const jsxRuntimeSrcPath = join(config.tscDir, 'src', 'jsx-runtime.d.ts');
  const jsxRuntimeDestPath = join(config.distPkgDir, 'jsx-runtime.d.ts');
  fixDtsContent(jsxRuntimeSrcPath, jsxRuntimeDestPath, './core');

  console.log('🥶', 'submodule APIs generated');
}

function createTypesApi(
  config: BuildConfig,
  submodule: string,
  outFileName: string,
  corePath: string
) {
  const extractorConfig = ExtractorConfig.loadFileAndPrepare(
    join(config.srcDir, submodule, 'api-extractor.json')
  );
  const result = Extractor.invoke(extractorConfig, {
    localBuild: !!config.dev,
    showVerboseMessages: false,
    messageCallback(msg) {
      msg.handled = true;
      if (msg.logLevel === 'verbose') {
        return;
      }
      if (msg.text.includes('Analysis will use')) {
        return;
      }
      console.log('🥶', msg.text);
    },
  });
  if (!result.succeeded) {
    panic(
      `Use "npm run api.update" to automatically update the .md files if the api changes were expected`
    );
  }
  const srcPath = result.extractorConfig.untrimmedFilePath;
  const destPath = join(config.distPkgDir, outFileName);
  fixDtsContent(srcPath, destPath, corePath);
}

/**
 * Fix up the generated dts content, and ensure it's using a relative
 * path to find the core.d.ts file, rather than node resolving it.
 */
function fixDtsContent(srcPath: string, destPath: string, corePath: string) {
  let dts = readFileSync(srcPath, 'utf-8');

  // ensure we're just using a relative path
  dts = dts.replace(/@builder\.io\/qwik/g, corePath);

  // for some reason api-extractor is adding this in  ¯\_(ツ)_/¯
  dts = dts.replace('{};', '');

  writeFileSync(destPath, dts);
}

import { Extractor, ExtractorConfig } from '@microsoft/api-extractor';
import { readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { loadConfig } from './util';

/**
 * Create each submodule's bundled dts file, and ensure
 * the public API has not changed for a production build.
 */
function apiExtractor() {
  const config = loadConfig(process.argv.slice(2));

  function createTypesApi(submodule: string, corePath?: string) {
    const extractorConfig = ExtractorConfig.loadFileAndPrepare(
      join(config.srcDir, submodule, 'api-extractor.json')
    );
    const result = Extractor.invoke(extractorConfig, {
      localBuild: !!config.dev,
      showVerboseMessages: true,
    });
    if (!result.succeeded) {
      process.exitCode = 1;
    }
    const dtsPath = result.extractorConfig.untrimmedFilePath;
    fixDtsContent(dtsPath, dtsPath, corePath);
  }

  // Run the api extractor for each of the submodules
  createTypesApi('core');
  createTypesApi('optimizer');
  createTypesApi('server', '../core');
  createTypesApi('testing', '../core');

  // the jsx-runtime.d.ts file was already generated with tsc, use this one
  const jsxRuntimeSrcPath = join(config.tscDir, 'src', 'jsx_runtime.d.ts');
  const jsxRuntimeDestPath = join(config.pkgDir, 'jsx-runtime.d.ts');
  fixDtsContent(jsxRuntimeSrcPath, jsxRuntimeDestPath, './core');

  console.log('🦖', 'submodule APIs generated');
}

/**
 * Fix up the generated dts content, and ensure it's using a relative
 * path to find the core.d.ts file, rather than node resolving it.
 */
function fixDtsContent(srcPath: string, destPath: string, corePath?: string) {
  let dts = readFileSync(srcPath, 'utf-8');
  if (corePath) {
    dts = dts.replace(/@builder\.io\/qwik/g, corePath);
  }
  // for some reason api-extractor is adding this in  ¯\_(ツ)_/¯
  dts = dts.replace('{};', '');

  writeFileSync(destPath, dts);
}

apiExtractor();

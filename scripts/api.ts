import { Extractor, ExtractorConfig } from '@microsoft/api-extractor';
import { readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { loadConfig } from './util';

export function apiExtractor() {
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

  createTypesApi('core');
  createTypesApi('optimizer');
  createTypesApi('server', '../core');
  createTypesApi('testing', '../core');

  const jsxRuntimeSrcPath = join(config.tscDir, 'src', 'jsx_runtime.d.ts');
  const jsxRuntimeDestPath = join(config.pkgDir, 'jsx-runtime.d.ts');
  fixDtsContent(jsxRuntimeSrcPath, jsxRuntimeDestPath, './core');

  console.log('🦖', 'api generator');
}

function fixDtsContent(srcPath: string, destPath: string, corePath?: string) {
  let dts = readFileSync(srcPath, 'utf-8');
  if (corePath) {
    dts = dts.replace(/@builder\.io\/qwik/g, corePath);
  }
  dts = dts.replace('{};', '');
  writeFileSync(destPath, dts);
}

apiExtractor();

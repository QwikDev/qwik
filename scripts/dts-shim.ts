import { ExtractorConfig } from '@microsoft/api-extractor';
import { existsSync, mkdirSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import {
  generateQwikRouterReferenceModules,
  generateServerReferenceModules,
  writeJsxRuntimeDts,
} from './api.ts';
import { type BuildConfig } from './util.ts';

// Dev: re-export shims instead of the slow non-incremental api-extractor rollup.

function specifierTo(fromFile: string, targetDts: string) {
  const rel = relative(dirname(fromFile), targetDts)
    .replace(/\\/g, '/')
    .replace(/\.d\.ts$/, '');
  return rel.startsWith('.') ? rel : `./${rel}`;
}

function writeShimFor(extractorConfigPath: string): boolean {
  let cfg: ExtractorConfig;
  try {
    cfg = ExtractorConfig.loadFileAndPrepare(extractorConfigPath);
  } catch {
    return false;
  }
  const entry = cfg.mainEntryPointFilePath;
  if (!entry || !existsSync(entry)) {
    return false;
  }
  const outputs = [
    cfg.untrimmedFilePath,
    cfg.betaTrimmedFilePath,
    cfg.publicTrimmedFilePath,
  ].filter((p): p is string => !!p);
  if (!outputs.length) {
    return false;
  }
  for (const out of outputs) {
    mkdirSync(dirname(out), { recursive: true });
    writeFileSync(
      out,
      `// dev shim → dts-out (not the api-extractor rollup)\n` +
        `export * from '${specifierTo(out, entry)}';\n`
    );
  }
  return true;
}

function findApiExtractorConfigs(dir: string): string[] {
  const found: string[] = [];
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name === 'dist' || name === 'lib') {
      continue;
    }
    const full = join(dir, name);
    if (statSync(full).isDirectory()) {
      found.push(...findApiExtractorConfigs(full));
    } else if (name === 'api-extractor.json') {
      found.push(full);
    }
  }
  return found;
}

export function writeQwikDtsShims(config: BuildConfig) {
  const configs = [
    ...findApiExtractorConfigs(config.srcQwikDir),
    ...findApiExtractorConfigs(config.qwikVitePkgDir),
  ];
  const written = configs.filter(writeShimFor).length;
  writeJsxRuntimeDts(config);
  generateServerReferenceModules(config);
  console.log(`🩹 qwik d.ts shims (dev): ${written} entry points`);
}

export function writeQwikRouterDtsShims(config: BuildConfig) {
  const written = findApiExtractorConfigs(config.srcQwikRouterDir).filter(writeShimFor).length;
  generateQwikRouterReferenceModules(config);
  console.log(`🩹 qwik-router d.ts shims (dev): ${written} entry points`);
}

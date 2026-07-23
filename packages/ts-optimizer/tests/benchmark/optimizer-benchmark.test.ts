import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { relative } from 'node:path';
import { transformModule } from '../../src/optimizer/transform/index.js';
import type { TransformModuleInput } from '../../src/optimizer/types/types.js';
import { mkFilePath, mkSourceText } from '../../src/optimizer/types/brands.js';
import * as process from 'node:process';

const QWIK_HOME = process.env.QWIK_HOME;

const MONOREPO_RATIO_LIMIT = 1.15;
const SINGLE_FILE_RATIO_LIMIT = 1.5;

const WARMUP_RUNS = 1;
const MEASURED_RUNS = 2;

if (!QWIK_HOME) {
  describe.skip('BENCH-00: QWIK_HOME was not set, skipping benchmark tests.', () => {});
} else {
  const QWIK_BINDING_MAP: Record<string, Record<string, { platformArchABI: string }[]>> = {
    darwin: {
      arm64: [{ platformArchABI: 'qwik.darwin-arm64.node' }],
      x64: [{ platformArchABI: 'qwik.darwin-x64.node' }],
    },
    win32: {
      x64: [{ platformArchABI: 'qwik.win32-x64-msvc.node' }],
    },
    linux: {
      x64: [{ platformArchABI: 'qwik.linux-x64-gnu.node' }],
    },
  };

  function resolveQwikSwcBindingBasename(): string {
    const override = process.env.QWIK_SWC_BINDING_OVERRIDE;
    if (override !== undefined && override !== '') {
      return override;
    }
    const { platform, arch } = process;
    const byPlatform = QWIK_BINDING_MAP[platform];
    if (!byPlatform) {
      throw new Error(
        `Unsupported platform "${platform}" for Qwik SWC binding autodetect. Set QWIK_SWC_BINDING_OVERRIDE.`
      );
    }
    const triples = byPlatform[arch];
    if (!triples?.length) {
      throw new Error(
        `Unsupported architecture "${arch}" on "${platform}" for Qwik SWC binding autodetect. Set QWIK_SWC_BINDING_OVERRIDE.`
      );
    }
    return triples[0].platformArchABI;
  }

  const QWIK_PACKAGES_DIR = `${QWIK_HOME}/packages`;
  const WORST_CASE_FILE = `${QWIK_PACKAGES_DIR}/qwik/src/core/tests/component.spec.tsx`;
  const qwikSwcBindingBasename = resolveQwikSwcBindingBasename();
  const qwikSwcBindingPath = `${QWIK_PACKAGES_DIR}/optimizer/bindings/${qwikSwcBindingBasename}`;

  const swcBinding = require(qwikSwcBindingPath);

  let discoveredFiles: string[] | null = null;

  function discoverFiles(): string[] {
    if (discoveredFiles) return discoveredFiles;

    const output = execSync(
      `find ${QWIK_PACKAGES_DIR} -type f \\( -name "*.ts" -o -name "*.tsx" -o -name "*.js" -o -name "*.jsx" \\) ! -path "*/node_modules/*" ! -path "*/dist/*" ! -path "*/.turbo/*"`,
      { encoding: 'utf-8', maxBuffer: 50 * 1024 * 1024 }
    );

    discoveredFiles = output
      .split('\n')
      .map((f) => f.trim())
      .filter((f) => f.length > 0);

    return discoveredFiles;
  }

  function buildTsInput(files: string[]): TransformModuleInput[] {
    return files.map((file) => ({
      path: mkFilePath(relative(QWIK_PACKAGES_DIR, file)),
      code: mkSourceText(readFileSync(file, 'utf-8')),
    }));
  }

  function buildSwcOptions(input: Array<{ path: string; code: string }>) {
    return {
      input,
      rootDir: QWIK_PACKAGES_DIR,
      srcDir: QWIK_PACKAGES_DIR,
      sourceMaps: false,
      minify: 'none',
      transpileTs: true,
      transpileJsx: true,
      preserveFilenames: false,
      explicitExtensions: false,
      stripEventHandlers: false,
      isServer: false,
      mode: 'lib',
      entryStrategy: 'segment',
    };
  }

  async function measureMinAsync(fn: () => Promise<unknown>, runs: number): Promise<number> {
    let min = Infinity;
    for (let i = 0; i < runs; i++) {
      const start = performance.now();
      await fn();
      const elapsed = performance.now() - start;
      if (elapsed < min) min = elapsed;
    }
    return min;
  }

  function measureMinSync(fn: () => unknown, runs: number): number {
    let min = Infinity;
    for (let i = 0; i < runs; i++) {
      const start = performance.now();
      fn();
      const elapsed = performance.now() - start;
      if (elapsed < min) min = elapsed;
    }
    return min;
  }

  const runBenchmarks = process.env['BENCH'] === '1';
  const describeFn = runBenchmarks ? describe : describe.skip;

  describeFn('BENCH-01: full monorepo benchmark', () => {
    it('TS optimizer is within 1.15x of SWC wall time for full monorepo', async () => {
      const files = discoverFiles();
      const tsInput = buildTsInput(files);
      const swcInput = tsInput.map((f) => ({ path: f.path, code: f.code }));
      const swcOptions = buildSwcOptions(swcInput);

      for (let i = 0; i < WARMUP_RUNS; i++) {
        await swcBinding.transform_modules(swcOptions);
        transformModule({
          input: tsInput,
          srcDir: mkFilePath(QWIK_PACKAGES_DIR),
          rootDir: QWIK_PACKAGES_DIR,
          entryStrategy: { type: 'segment' },
          minify: 'simplify',
          transpileTs: true,
          transpileJsx: true,
          preserveFilenames: false,
          explicitExtensions: false,
          sourceMaps: false,
        });
      }

      const swcTime = await measureMinAsync(
        () => swcBinding.transform_modules(swcOptions),
        MEASURED_RUNS
      );

      const tsTime = measureMinSync(
        () =>
          transformModule({
            input: tsInput,
            srcDir: mkFilePath(QWIK_PACKAGES_DIR),
            rootDir: QWIK_PACKAGES_DIR,
            entryStrategy: { type: 'segment' },
            minify: 'simplify',
            transpileTs: true,
            transpileJsx: true,
            preserveFilenames: false,
            explicitExtensions: false,
            sourceMaps: false,
          }),
        MEASURED_RUNS
      );

      const ratio = tsTime / swcTime;

      console.log('');
      console.log('=== Full Monorepo Benchmark ===');
      console.log(`Files:     ${files.length}`);
      console.log(`SWC time:  ${swcTime.toFixed(0)}ms`);
      console.log(`TS time:   ${tsTime.toFixed(0)}ms`);
      console.log(`Ratio:     ${ratio.toFixed(2)}x (limit: ${MONOREPO_RATIO_LIMIT}x)`);
      console.log(`Status:    ${ratio <= MONOREPO_RATIO_LIMIT ? 'PASS' : 'FAIL'}`);
      console.log('');

      expect(ratio).toBeLessThanOrEqual(MONOREPO_RATIO_LIMIT);
    }, 120_000);
  });

  describeFn('BENCH-02: worst-case single file benchmark', () => {
    it('TS optimizer is within 1.5x of SWC for worst-case single file', async () => {
      const code = readFileSync(WORST_CASE_FILE, 'utf-8');
      const filePath = relative(QWIK_PACKAGES_DIR, WORST_CASE_FILE);
      const lineCount = code.split('\n').length;

      const tsInput: TransformModuleInput[] = [
        { path: mkFilePath(filePath), code: mkSourceText(code) },
      ];
      const swcInput = [{ path: filePath, code }];
      const swcOptions = buildSwcOptions(swcInput);

      for (let i = 0; i < WARMUP_RUNS; i++) {
        await swcBinding.transform_modules(swcOptions);
        transformModule({
          input: tsInput,
          srcDir: mkFilePath(QWIK_PACKAGES_DIR),
          rootDir: QWIK_PACKAGES_DIR,
          entryStrategy: { type: 'segment' },
          minify: 'simplify',
          transpileTs: true,
          transpileJsx: true,
          preserveFilenames: false,
          explicitExtensions: false,
          sourceMaps: false,
        });
      }

      const swcTime = await measureMinAsync(
        () => swcBinding.transform_modules(swcOptions),
        MEASURED_RUNS
      );

      const tsTime = measureMinSync(
        () =>
          transformModule({
            input: tsInput,
            srcDir: mkFilePath(QWIK_PACKAGES_DIR),
            rootDir: QWIK_PACKAGES_DIR,
            entryStrategy: { type: 'segment' },
            minify: 'simplify',
            transpileTs: true,
            transpileJsx: true,
            preserveFilenames: false,
            explicitExtensions: false,
            sourceMaps: false,
          }),
        MEASURED_RUNS
      );

      const ratio = tsTime / swcTime;

      console.log('');
      console.log(`=== Single File Benchmark (${WORST_CASE_FILE.split('/').pop()}) ===`);
      console.log(`Lines:     ${lineCount}`);
      console.log(`SWC time:  ${swcTime.toFixed(0)}ms`);
      console.log(`TS time:   ${tsTime.toFixed(0)}ms`);
      console.log(`Ratio:     ${ratio.toFixed(2)}x (limit: ${SINGLE_FILE_RATIO_LIMIT}x)`);
      console.log(`Status:    ${ratio <= SINGLE_FILE_RATIO_LIMIT ? 'PASS' : 'FAIL'}`);
      console.log('');

      expect(ratio).toBeLessThanOrEqual(SINGLE_FILE_RATIO_LIMIT);
    }, 30_000);
  });
}

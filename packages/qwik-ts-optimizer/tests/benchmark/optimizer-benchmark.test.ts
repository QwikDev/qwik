/**
 * BENCH-01: Full monorepo benchmark — SWC vs TS optimizer
 * BENCH-02: Worst-case single file benchmark — SWC vs TS optimizer
 *
 * These benchmarks compare the TS optimizer against the native SWC optimizer
 * on real Qwik source files. They serve as CI-enforceable regression gates:
 *
 *   - Monorepo: TS must be within 1.15x of SWC wall time
 *   - Single file: TS must be within 1.5x of SWC wall time
 *
 * Usage:
 *   npx vitest run tests/benchmark/optimizer-benchmark.test.ts
 *
 * These tests are wrapped in describe.skip so they do NOT run during
 * the normal `npx vitest run` invocation. To run them explicitly:
 *   npx vitest run tests/benchmark/optimizer-benchmark.test.ts --no-file-parallelism
 * and remove the .skip or use: BENCH=1 npx vitest run tests/benchmark/
 */

import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { relative } from 'node:path';
import { transformModule } from '../../src/optimizer/transform.js';
import type { TransformModuleInput } from '../../src/optimizer/types.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const QWIK_PACKAGES_DIR = '/Users/jackshelton/dev/open-source/qwik/packages';
const WORST_CASE_FILE =
  '/Users/jackshelton/dev/open-source/qwik/packages/qwik/src/core/tests/component.spec.tsx';

const MONOREPO_RATIO_LIMIT = 1.15;
const SINGLE_FILE_RATIO_LIMIT = 1.5;

const WARMUP_RUNS = 1;
const MEASURED_RUNS = 2;

// ---------------------------------------------------------------------------
// SWC binding (native NAPI module)
// ---------------------------------------------------------------------------

const require = createRequire(import.meta.url);
const swcBinding = require(
  '/Users/jackshelton/dev/open-source/qwik/packages/optimizer/bindings/qwik.darwin-arm64.node',
);

// ---------------------------------------------------------------------------
// File discovery (cached)
// ---------------------------------------------------------------------------

let discoveredFiles: string[] | null = null;

function discoverFiles(): string[] {
  if (discoveredFiles) return discoveredFiles;

  const output = execSync(
    `find ${QWIK_PACKAGES_DIR} -type f \\( -name "*.ts" -o -name "*.tsx" -o -name "*.js" -o -name "*.jsx" \\) ! -path "*/node_modules/*" ! -path "*/dist/*" ! -path "*/.turbo/*"`,
    { encoding: 'utf-8', maxBuffer: 50 * 1024 * 1024 },
  );

  discoveredFiles = output
    .split('\n')
    .map((f) => f.trim())
    .filter((f) => f.length > 0);

  return discoveredFiles;
}

// ---------------------------------------------------------------------------
// Input builders
// ---------------------------------------------------------------------------

function buildTsInput(files: string[]): TransformModuleInput[] {
  return files.map((file) => ({
    path: relative(QWIK_PACKAGES_DIR, file),
    code: readFileSync(file, 'utf-8'),
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

// ---------------------------------------------------------------------------
// Timing helper — run N times, return minimum elapsed time in ms
// ---------------------------------------------------------------------------

async function measureMinAsync(
  fn: () => Promise<unknown>,
  runs: number,
): Promise<number> {
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

// ---------------------------------------------------------------------------
// BENCH-01: Full monorepo benchmark
// ---------------------------------------------------------------------------

const runBenchmarks = process.env['BENCH'] === '1';
const describeFn = runBenchmarks ? describe : describe.skip;

describeFn('BENCH-01: full monorepo benchmark', () => {
  it(
    'TS optimizer is within 1.15x of SWC wall time for full monorepo',
    async () => {
      const files = discoverFiles();
      const tsInput = buildTsInput(files);
      const swcInput = tsInput.map((f) => ({ path: f.path, code: f.code }));
      const swcOptions = buildSwcOptions(swcInput);

      // Warmup both optimizers
      for (let i = 0; i < WARMUP_RUNS; i++) {
        await swcBinding.transform_modules(swcOptions);
        transformModule({
          input: tsInput,
          srcDir: QWIK_PACKAGES_DIR,
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

      // Measured runs — take minimum
      const swcTime = await measureMinAsync(
        () => swcBinding.transform_modules(swcOptions),
        MEASURED_RUNS,
      );

      const tsTime = measureMinSync(
        () =>
          transformModule({
            input: tsInput,
            srcDir: QWIK_PACKAGES_DIR,
            rootDir: QWIK_PACKAGES_DIR,
            entryStrategy: { type: 'segment' },
            minify: 'simplify',
            transpileTs: true,
            transpileJsx: true,
            preserveFilenames: false,
            explicitExtensions: false,
            sourceMaps: false,
          }),
        MEASURED_RUNS,
      );

      const ratio = tsTime / swcTime;

      console.log('');
      console.log('=== Full Monorepo Benchmark ===');
      console.log(`Files:     ${files.length}`);
      console.log(`SWC time:  ${swcTime.toFixed(0)}ms`);
      console.log(`TS time:   ${tsTime.toFixed(0)}ms`);
      console.log(
        `Ratio:     ${ratio.toFixed(2)}x (limit: ${MONOREPO_RATIO_LIMIT}x)`,
      );
      console.log(
        `Status:    ${ratio <= MONOREPO_RATIO_LIMIT ? 'PASS' : 'FAIL'}`,
      );
      console.log('');

      expect(ratio).toBeLessThanOrEqual(MONOREPO_RATIO_LIMIT);
    },
    120_000,
  );
});

// ---------------------------------------------------------------------------
// BENCH-02: Worst-case single file benchmark
// ---------------------------------------------------------------------------

describeFn('BENCH-02: worst-case single file benchmark', () => {
  it(
    'TS optimizer is within 1.5x of SWC for worst-case single file',
    async () => {
      const code = readFileSync(WORST_CASE_FILE, 'utf-8');
      const filePath = relative(QWIK_PACKAGES_DIR, WORST_CASE_FILE);
      const lineCount = code.split('\n').length;

      const tsInput: TransformModuleInput[] = [{ path: filePath, code }];
      const swcInput = [{ path: filePath, code }];
      const swcOptions = buildSwcOptions(swcInput);

      // Warmup both optimizers
      for (let i = 0; i < WARMUP_RUNS; i++) {
        await swcBinding.transform_modules(swcOptions);
        transformModule({
          input: tsInput,
          srcDir: QWIK_PACKAGES_DIR,
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

      // Measured runs — take minimum
      const swcTime = await measureMinAsync(
        () => swcBinding.transform_modules(swcOptions),
        MEASURED_RUNS,
      );

      const tsTime = measureMinSync(
        () =>
          transformModule({
            input: tsInput,
            srcDir: QWIK_PACKAGES_DIR,
            rootDir: QWIK_PACKAGES_DIR,
            entryStrategy: { type: 'segment' },
            minify: 'simplify',
            transpileTs: true,
            transpileJsx: true,
            preserveFilenames: false,
            explicitExtensions: false,
            sourceMaps: false,
          }),
        MEASURED_RUNS,
      );

      const ratio = tsTime / swcTime;

      console.log('');
      console.log(
        `=== Single File Benchmark (${WORST_CASE_FILE.split('/').pop()}) ===`,
      );
      console.log(`Lines:     ${lineCount}`);
      console.log(`SWC time:  ${swcTime.toFixed(0)}ms`);
      console.log(`TS time:   ${tsTime.toFixed(0)}ms`);
      console.log(
        `Ratio:     ${ratio.toFixed(2)}x (limit: ${SINGLE_FILE_RATIO_LIMIT}x)`,
      );
      console.log(
        `Status:    ${ratio <= SINGLE_FILE_RATIO_LIMIT ? 'PASS' : 'FAIL'}`,
      );
      console.log('');

      expect(ratio).toBeLessThanOrEqual(SINGLE_FILE_RATIO_LIMIT);
    },
    30_000,
  );
});

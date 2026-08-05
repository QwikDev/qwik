import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, test } from 'vitest';
import { startValueIrCoverage, stopValueIrCoverage } from './expr-lower';
import { transformModules } from './index';

/**
 * The Phase-1 progress number (specs/08-conformance.md): which share of real-world template
 * expression sites lower to `ValueIR`. The floor only guards against regressions — raise it as
 * lowering coverage grows; never lower it.
 */
const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '../../..');

const CORPUS = [
  'packages/compiler/conformance/layerA/fixtures/static-page/input.tsx',
  'packages/compiler/conformance/layerA/fixtures/signal-counter/input.tsx',
  'starters/apps/playground/src/routes/demo/todolist/index.tsx',
  'starters/apps/playground/src/routes/demo/flower/index.tsx',
  'starters/apps/playground/src/components/starter/counter/counter.tsx',
  'e2e/qwik-e2e/apps/vdomless-counter/src/root.tsx',
];

const COVERAGE_FLOOR = 0.8;

describe('ValueIR coverage over the fixture corpus', () => {
  test('lowered share stays above the floor', async () => {
    const coverage = startValueIrCoverage();
    const perFile: string[] = [];
    try {
      for (const path of CORPUS) {
        const code = readFileSync(join(repoRoot, path), 'utf-8');
        const before = { ...coverage };
        const result = await transformModules({
          input: [{ path: 'src/input.tsx', code }],
          srcDir: 'src',
          sourceMaps: false,
          transpileTs: true,
          transpileJsx: true,
          isServer: true,
        });
        perFile.push(
          `${path}: ${coverage.lowered - before.lowered}/${coverage.total - before.total} sites, ` +
            `${result.modules.length} modules, ${result.diagnostics?.length ?? 0} diagnostics`
        );
      }
    } finally {
      stopValueIrCoverage();
    }
    process.stdout.write(perFile.join('\n') + '\n');

    expect(coverage.total).toBeGreaterThan(0);
    const ratio = coverage.lowered / coverage.total;
    process.stdout.write(
      `ValueIR coverage: ${coverage.lowered}/${coverage.total} sites (${(ratio * 100).toFixed(1)}%)\n`
    );
    expect(ratio).toBeGreaterThanOrEqual(COVERAGE_FLOOR);
  });
});

import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as process from 'node:process';
import { transformModule } from '../../src/optimizer/transform/index.js';
import type { TransformModuleInput, TransformOutput } from '../../src/optimizer/types/types.js';
import { mkFilePath, mkSourceText } from '../../src/optimizer/types/brands.js';
import { parseSnapshot } from '../../src/testing/snapshot-parser.js';

const SNAP_DIR = join(dirname(fileURLToPath(import.meta.url)), '../../match-these-snaps');
const QWIK_HOME = process.env.QWIK_HOME;
const ITERATIONS = Number(process.env.PROFILE_ITERATIONS ?? '3');

interface Workload {
  readonly label: string;
  readonly input: TransformModuleInput;
  readonly srcDir: string;
}

function worstCaseWorkload(qwikHome: string): Workload {
  const packagesDir = `${qwikHome}/packages`;
  const file = `${packagesDir}/qwik/src/core/tests/component.spec.tsx`;
  return {
    label: `QWIK_HOME worst-case (${relative(packagesDir, file)})`,
    input: {
      path: mkFilePath(relative(packagesDir, file)),
      code: mkSourceText(readFileSync(file, 'utf-8')),
    },
    srcDir: packagesDir,
  };
}

function largestFixtureWorkload(): Workload {
  let best: { name: string; input: string } | undefined;
  for (const snapFile of readdirSync(SNAP_DIR)) {
    if (!snapFile.endsWith('.snap')) continue;
    const parsed = parseSnapshot(readFileSync(join(SNAP_DIR, snapFile), 'utf-8'));
    if (!parsed.input) continue;
    if (best === undefined || parsed.input.length > best.input.length) {
      best = { name: snapFile, input: parsed.input };
    }
  }
  if (!best) throw new Error('no snapshot fixture with an input section found');
  return {
    label: `largest fixture input (${best.name}, ${best.input.length} bytes)`,
    input: { path: mkFilePath('test.tsx'), code: mkSourceText(best.input) },
    srcDir: '/',
  };
}

describe('profiling harness', () => {
  it('drives repeated transformModule iterations over the profiling workload', () => {
    const workload = QWIK_HOME ? worstCaseWorkload(QWIK_HOME) : largestFixtureWorkload();

    const run = (): TransformOutput =>
      transformModule({
        input: [workload.input],
        srcDir: mkFilePath(workload.srcDir),
        rootDir: workload.srcDir,
        entryStrategy: { type: 'segment' },
        minify: 'simplify',
        transpileTs: true,
        transpileJsx: true,
        preserveFilenames: false,
        explicitExtensions: false,
        sourceMaps: false,
      });

    const warmup = run();
    expect(warmup.modules.length).toBeGreaterThan(1);

    const perIteration: number[] = [];
    for (let i = 0; i < ITERATIONS; i++) {
      const start = performance.now();
      run();
      perIteration.push(performance.now() - start);
    }

    const total = perIteration.reduce((a, b) => a + b, 0);
    const min = Math.min(...perIteration);
    console.log(
      `PROFILE ${workload.label}: iterations=${ITERATIONS} ` +
        `total=${total.toFixed(0)}ms min=${min.toFixed(1)}ms ` +
        `avg=${(total / ITERATIONS).toFixed(1)}ms`,
    );
    expect(perIteration.length).toBe(ITERATIONS);
  }, 300_000);
});

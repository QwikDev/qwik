import { execFile } from 'node:child_process';
import { readFile, unlink, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { pathToFileURL } from 'node:url';
import { promisify } from 'node:util';
import { build } from 'esbuild';

const RESULTS_PATH = 'packages/qwik/src/core/bench/bench-memory-results.json';
const SCENARIOS_ENTRY = 'packages/qwik/src/core/bench/memory-scenarios.ts';
const SAMPLE_COUNT = 3;
const COUNT_PER_SCENARIO = 10_000;
const RELATIVE_TOLERANCE = 0.01;
const GC_ROUNDS = 4;
const execFileAsync = promisify(execFile);
const CHILD_MEASURE_SOURCE = [
  // Override qDev set by runBefore.ts — benchmark should measure production memory
  'globalThis.qDev = false;',
  "import { pathToFileURL } from 'node:url';",
  `const GC_ROUNDS = ${GC_ROUNDS};`,
  'const [bundlePath, scenarioId, expectedCount] = process.argv.slice(1);',
  "if (typeof global.gc !== 'function') throw new Error('Missing global.gc');",
  'const mod = await import(pathToFileURL(bundlePath).href);',
  'const scenario = mod.memoryScenarios.find((entry) => entry.id === scenarioId);',
  'if (!scenario) throw new Error(`Unknown memory benchmark scenario: ${scenarioId}`);',
  'const count = Number(expectedCount);',
  'if (scenario.count !== count) throw new Error(`Scenario ${scenario.id} expected count ${count}, got ${scenario.count}`);',
  'for (let i = 0; i < GC_ROUNDS; i++) global.gc();',
  'const baseline = process.memoryUsage().heapUsed;',
  'const retained = scenario.allocate();',
  'if (retained.length !== scenario.count) throw new Error(`Scenario ${scenario.id} allocated ${retained.length} entries, expected ${scenario.count}`);',
  'globalThis.__qwikMemoryRetention = retained;',
  'for (let i = 0; i < GC_ROUNDS; i++) global.gc();',
  'const totalBytes = Math.max(0, process.memoryUsage().heapUsed - baseline);',
  'process.stdout.write(`${JSON.stringify({ id: scenario.id, totalBytes, count: scenario.count })}\\n`);',
  'process.exit(0);',
].join('\n');

type StoredResults = Record<string, number>;

type MeasurementResult = {
  id: string;
  totalBytes: number;
  count: number;
};

type MemoryScenario = {
  id: string;
  title: string;
  count: number;
  allocate: () => unknown[];
};

const args = new Set(process.argv.slice(2));
const shouldUpdate = args.has('--update');
const scenarioToMeasure = getArgValue('--measure');
const bundlePathArg = getArgValue('--bundle');

async function main() {
  // Benchmark should measure production memory, override runBefore.ts
  (globalThis as any).qDev = false;
  requireGc();
  const ownBundlePath = bundlePathArg ? null : await bundleMemoryScenarios();
  const bundlePath = bundlePathArg || ownBundlePath!;
  const scenarios = await loadMemoryScenarios(bundlePath);

  try {
    if (args.has('--measure')) {
      if (!scenarioToMeasure) {
        throw new Error('Missing scenario id after --measure.');
      }
      await runMeasurementWorker(scenarios, scenarioToMeasure);
      return;
    }

    const measuredResults = await measureAllScenarios(scenarios, bundlePath);
    const measuredIds = Object.keys(measuredResults);
    const expectedIds = scenarios.map((scenario) => scenario.id);
    assertExactKeySet('measured memory scenarios', measuredIds, expectedIds);

    const storedPath = resolve(process.cwd(), RESULTS_PATH);
    if (shouldUpdate) {
      const next = buildStoredResults(scenarios, measuredResults);
      await writeFile(storedPath, JSON.stringify(next, null, 2) + '\n', 'utf-8');
      console.log(`Updated memory benchmark baselines in ${RESULTS_PATH}`);
      return;
    }

    const stored = await readStoredResults(storedPath);
    validateResults(scenarios, stored, measuredResults);
    console.log('Memory benchmark validation passed.');
  } finally {
    if (ownBundlePath) {
      await unlink(ownBundlePath).catch(() => undefined);
    }
  }
}

async function runMeasurementWorker(scenarios: MemoryScenario[], scenarioId: string) {
  const scenario = scenarios.find((entry) => entry.id === scenarioId);
  if (!scenario) {
    throw new Error(`Unknown memory benchmark scenario: ${scenarioId}`);
  }
  if (scenario.count !== COUNT_PER_SCENARIO) {
    throw new Error(
      `Scenario ${scenario.id} expected count ${COUNT_PER_SCENARIO}, got ${scenario.count}`
    );
  }

  forceGc();
  const baseline = process.memoryUsage().heapUsed;
  const retained = scenario.allocate();
  if (retained.length !== scenario.count) {
    throw new Error(
      `Scenario ${scenario.id} allocated ${retained.length} entries, expected ${scenario.count}`
    );
  }

  (globalThis as any).__qwikMemoryRetention = retained;
  forceGc();
  const totalBytes = Math.max(0, process.memoryUsage().heapUsed - baseline);

  const result: MeasurementResult = {
    id: scenario.id,
    totalBytes,
    count: scenario.count,
  };
  process.stdout.write(`${JSON.stringify(result)}\n`);
}

async function measureAllScenarios(scenarios: MemoryScenario[], bundlePath: string) {
  const results: Record<string, MeasurementResult> = {};

  for (const scenario of scenarios) {
    const samples: number[] = [];
    console.log(`Measuring ${scenario.id}`);
    for (let sample = 0; sample < SAMPLE_COUNT; sample++) {
      const measurement = await measureScenarioSample(scenario.id, bundlePath);
      if (measurement.count !== scenario.count) {
        throw new Error(
          `Scenario ${scenario.id} measured ${measurement.count} instances, expected ${scenario.count}`
        );
      }
      samples.push(measurement.totalBytes);
      console.log(
        `  sample ${sample + 1}/${SAMPLE_COUNT}: ${formatBytes(measurement.totalBytes / measurement.count)}`
      );
    }

    results[scenario.id] = {
      id: scenario.id,
      totalBytes: median(samples),
      count: scenario.count,
    };
  }

  return results;
}

async function measureScenarioSample(
  scenarioId: string,
  bundlePath: string
): Promise<MeasurementResult> {
  const { stdout, stderr } = await execFileAsync(
    process.execPath,
    [
      '--expose-gc',
      '--require',
      './scripts/runBefore.ts',
      '--input-type=module',
      '--eval',
      CHILD_MEASURE_SOURCE,
      bundlePath,
      scenarioId,
      String(COUNT_PER_SCENARIO),
    ],
    {
      cwd: process.cwd(),
      maxBuffer: 1024 * 1024 * 4,
    }
  );

  if (stderr.trim()) {
    process.stderr.write(stderr);
  }

  const trimmed = stdout.trim();
  if (!trimmed) {
    throw new Error(`No measurement output received for ${scenarioId}`);
  }

  return JSON.parse(trimmed) as MeasurementResult;
}

function buildStoredResults(
  scenarios: MemoryScenario[],
  measuredResults: Record<string, MeasurementResult>
): StoredResults {
  return Object.fromEntries(
    scenarios.map((scenario) => {
      const measured = measuredResults[scenario.id];
      return [scenario.id, Math.round(measured.totalBytes / measured.count)];
    })
  );
}

async function readStoredResults(storedPath: string): Promise<StoredResults> {
  try {
    const contents = await readFile(storedPath, 'utf-8');
    return JSON.parse(contents) as StoredResults;
  } catch (error) {
    throw new Error(
      `Unable to read ${RESULTS_PATH}. Run \`pnpm test.bench.update\` to create it.\n${String(error)}`
    );
  }
}

function validateResults(
  scenarios: MemoryScenario[],
  stored: StoredResults,
  measuredResults: Record<string, MeasurementResult>
) {
  assertExactKeySet('stored memory scenarios', Object.keys(stored), Object.keys(measuredResults));

  const failures: string[] = [];
  for (const scenario of scenarios) {
    const storedBytesPerInstance = stored[scenario.id];
    const measuredScenario = measuredResults[scenario.id];
    const measuredPerInstance = Math.round(measuredScenario.totalBytes / measuredScenario.count);
    const allowedMaxPerInstance = Math.round(storedBytesPerInstance * (1 + RELATIVE_TOLERANCE));
    const ok = measuredPerInstance <= allowedMaxPerInstance;
    const great = measuredPerInstance < storedBytesPerInstance * (1 - RELATIVE_TOLERANCE);

    console.log(
      [
        `${scenario.id}:`,
        formatBytes(measuredPerInstance),
        `delta ${formatBytes(measuredPerInstance - storedBytesPerInstance)}`,
        ok ? 'OK' : 'FAIL',
        great ? '--- GREAT!!!' : '',
      ].join(' ')
    );

    if (!ok) {
      failures.push(
        `${scenario.id} retained ${formatBytes(measuredPerInstance)} per instance, above allowed max ${formatBytes(allowedMaxPerInstance)}`
      );
    }
  }

  if (failures.length > 0) {
    throw new Error(
      `Memory benchmark validation failed:\n${failures.map((failure) => `- ${failure}`).join('\n')}`
    );
  }
}

async function bundleMemoryScenarios(): Promise<string> {
  const outfile = resolve(
    tmpdir(),
    `qwik-memory-scenarios-${process.pid}-${Date.now().toString(36)}.mjs`
  );

  await build({
    entryPoints: [resolve(process.cwd(), SCENARIOS_ENTRY)],
    outfile,
    bundle: true,
    format: 'esm',
    platform: 'node',
    target: ['node22'],
    sourcemap: false,
    conditions: ['development'],
    logLevel: 'silent',
    plugins: [
      {
        name: 'qwik-memory-stubs',
        setup(buildApi) {
          buildApi.onResolve({ filter: /^@qwik\.dev\/core$/ }, () => ({
            path: resolve(process.cwd(), 'packages/qwik/src/core/index.ts'),
          }));
          buildApi.onResolve({ filter: /^@qwik\.dev\/core\/internal$/ }, () => ({
            path: resolve(process.cwd(), 'packages/qwik/src/core/internal.ts'),
          }));
          buildApi.onResolve({ filter: /^@qwik\.dev\/core\/build$/ }, () => ({
            path: resolve(process.cwd(), 'packages/qwik/src/build/index.dev.ts'),
          }));
          buildApi.onResolve({ filter: /^@qwik\.dev\/core\/preloader$/ }, () => ({
            path: 'preloader-stub',
            namespace: 'qwik-memory-stub',
          }));
          buildApi.onResolve({ filter: /^@qwik-client-manifest$/ }, () => ({
            path: 'qwik-client-manifest-stub',
            namespace: 'qwik-memory-stub',
          }));
          buildApi.onResolve({ filter: /^\.\.\/\.\.\/client\/vnode-utils$/ }, (args) => {
            if (args.importer.endsWith('/shared/vnode/vnode.ts')) {
              return { path: 'vnode-utils-stub', namespace: 'qwik-memory-stub' };
            }
            return null;
          });

          buildApi.onLoad({ filter: /.*/, namespace: 'qwik-memory-stub' }, (args) => {
            if (args.path === 'preloader-stub') {
              return {
                contents: 'export const p = undefined;',
                loader: 'js',
              };
            }
            if (args.path === 'vnode-utils-stub') {
              return {
                contents: 'export const vnode_toString = () => "[VNode]";',
                loader: 'js',
              };
            }
            if (args.path === 'qwik-client-manifest-stub') {
              return {
                contents: 'export const manifest = {};',
                loader: 'js',
              };
            }
            return null;
          });
        },
      },
    ],
  });

  return outfile;
}

async function loadMemoryScenarios(bundlePath: string): Promise<MemoryScenario[]> {
  const mod = (await import(pathToFileURL(bundlePath).href)) as {
    memoryScenarios: MemoryScenario[];
  };
  return mod.memoryScenarios;
}

function requireGc() {
  if (typeof global.gc !== 'function') {
    throw new Error(
      'Memory benchmarks require `global.gc`. Run this script with `node --expose-gc --require ./scripts/runBefore.ts ...`.'
    );
  }
}

function forceGc() {
  for (let i = 0; i < GC_ROUNDS; i++) {
    global.gc!();
  }
}

function median(values: number[]) {
  if (values.length === 0) {
    throw new Error('Cannot compute median of an empty sample set.');
  }
  const sorted = [...values].sort((a, b) => a - b);
  const midpoint = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? Math.round((sorted[midpoint - 1] + sorted[midpoint]) / 2)
    : sorted[midpoint];
}

function assertExactKeySet(label: string, actual: string[], expected: string[]) {
  const actualSorted = [...actual].sort();
  const expectedSorted = [...expected].sort();
  const missing = expectedSorted.filter((key) => !actualSorted.includes(key));
  const extra = actualSorted.filter((key) => !expectedSorted.includes(key));

  if (missing.length === 0 && extra.length === 0) {
    return;
  }

  const parts: string[] = [`Unexpected ${label}.`];
  if (missing.length > 0) {
    parts.push(`Missing: ${missing.join(', ')}`);
  }
  if (extra.length > 0) {
    parts.push(`Extra: ${extra.join(', ')}`);
  }
  throw new Error(parts.join(' '));
}

function getArgValue(flag: string) {
  const index = process.argv.indexOf(flag);
  if (index === -1 || index + 1 >= process.argv.length) {
    return undefined;
  }
  return process.argv[index + 1];
}

function formatBytes(value: number) {
  const rounded = Math.round(value);
  return `${rounded.toLocaleString('en-US')}B`;
}

main()
  .then(() => {
    process.exit(0);
  })
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });

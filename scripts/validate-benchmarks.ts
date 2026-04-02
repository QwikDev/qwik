import { execFile } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { pathToFileURL } from 'node:url';
import { promisify } from 'node:util';

const BENCH_ENTRY = 'packages/qwik/src/core/bench/core.bench.ts';
const RESULTS_PATH = 'packages/qwik/src/core/bench/bench-results.json';
const BASELINE_BENCHMARK_ID = 'baseline.shared-workload';
const BENCHMARK_PREFIX = 'current.';
const SIZE_LOG_PREFIX = 'QWIK_BENCH_SIZE';
const MIN_TOLERANCE_PCT = 3;
const LOW_SAMPLE_MIN_TOLERANCE_PCT = 10;
const VERY_LOW_SAMPLE_MIN_TOLERANCE_PCT = 15;
const execFileAsync = promisify(execFile);

export type BenchmarkMetrics = {
  mean: number;
  median: number;
  p75: number;
  p99: number;
  p995: number;
  p999: number;
  rme: number;
  sampleCount: number;
  factor?: number;
};

export type StoredResults = {
  version: number;
  generatedAt: string;
  benchmarks: Record<string, BenchmarkMetrics>;
  sizes: Record<string, number>;
};

const args = new Set(process.argv.slice(2));
const shouldUpdate = args.has('--update');

async function main() {
  const { measuredBenchmarks, measuredSizes } = await runBenchmarks();
  const scenarioIds = scenarioIdsFromBenchmarkNames(Object.keys(measuredBenchmarks));

  const benchmarkNames = [
    BASELINE_BENCHMARK_ID,
    ...scenarioIds.map((scenarioId) => `${BENCHMARK_PREFIX}${scenarioId}`),
  ];

  assertExactKeySet('measured benchmarks', Object.keys(measuredBenchmarks), benchmarkNames);
  assertExactKeySet('measured sizes', Object.keys(measuredSizes), scenarioIds);

  const storedPath = resolve(process.cwd(), RESULTS_PATH);

  if (shouldUpdate) {
    const nextResults = buildStoredResults(scenarioIds, measuredBenchmarks, measuredSizes);
    await writeFile(storedPath, JSON.stringify(nextResults, null, 2) + '\n', 'utf-8');
    console.log(`Updated benchmark baselines in ${RESULTS_PATH}`);
    return;
  }

  const stored = await readStoredResults(storedPath);
  validateResults(scenarioIds, stored, measuredBenchmarks, measuredSizes);
  console.log('Benchmark validation passed.');
}

async function runBenchmarks(): Promise<{
  measuredBenchmarks: Record<string, BenchmarkMetrics>;
  measuredSizes: Record<string, number>;
}> {
  const outputJsonPath = resolve(
    tmpdir(),
    `qwik-bench-${process.pid}-${Date.now().toString(36)}.json`
  );

  const { stdout, stderr } = await execFileAsync(
    'pnpm',
    [
      'vitest',
      'bench',
      BENCH_ENTRY,
      '--outputJson',
      outputJsonPath,
      '--maxWorkers=1',
      '--no-file-parallelism',
      '--run',
      '--silent',
    ],
    {
      cwd: process.cwd(),
      env: {
        ...process.env,
        CI_BENCH: '1',
      },
      maxBuffer: 1024 * 1024 * 16,
    }
  );

  if (stdout.trim()) {
    process.stdout.write(stdout);
  }

  const measuredSizes = parseScenarioSizes(stderr);
  const passthroughStderr = stripScenarioSizeLines(stderr);
  if (passthroughStderr.trim()) {
    process.stderr.write(passthroughStderr);
  }

  const report = JSON.parse(await readFile(outputJsonPath, 'utf-8')) as {
    files: Array<{
      groups: Array<{
        benchmarks: Array<
          BenchmarkMetrics & {
            name: string;
          }
        >;
      }>;
    }>;
  };

  const benchmarks: Record<string, BenchmarkMetrics> = {};
  for (const file of report.files) {
    for (const group of file.groups) {
      for (const benchmark of group.benchmarks) {
        benchmarks[benchmark.name] = {
          mean: benchmark.mean ?? 0,
          median: benchmark.median ?? 0,
          p75: benchmark.p75 ?? benchmark.median ?? 0,
          p99: benchmark.p99 ?? 0,
          p995: benchmark.p995 ?? benchmark.p99 ?? 0,
          p999: benchmark.p999 ?? benchmark.p995 ?? benchmark.p99 ?? 0,
          rme: benchmark.rme ?? 0,
          sampleCount: benchmark.sampleCount ?? 0,
        };
      }
    }
  }

  return { measuredBenchmarks: benchmarks, measuredSizes };
}

export function buildStoredResults(
  scenarioIds: string[],
  measuredBenchmarks: Record<string, BenchmarkMetrics>,
  measuredSizes: Record<string, number>
): StoredResults {
  const baseline = measuredBenchmarks[BASELINE_BENCHMARK_ID];
  if (!baseline) {
    throw new Error(`Missing benchmark result for ${BASELINE_BENCHMARK_ID}`);
  }

  const benchmarks: Record<string, BenchmarkMetrics> = {};
  for (const name of sortBenchmarkNames(Object.keys(measuredBenchmarks))) {
    const benchmark = measuredBenchmarks[name];
    benchmarks[name] =
      name === BASELINE_BENCHMARK_ID
        ? benchmark
        : {
            ...benchmark,
            factor: benchmark.mean / baseline.mean,
          };
  }

  const sizes = Object.fromEntries(
    scenarioIds.map((scenarioId) => [scenarioId, measuredSizes[scenarioId] ?? 0])
  );

  return {
    version: 1,
    generatedAt: new Date().toISOString(),
    benchmarks,
    sizes,
  };
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

export function validateResults(
  scenarioIds: string[],
  stored: StoredResults,
  measuredBenchmarks: Record<string, BenchmarkMetrics>,
  measuredSizes: Record<string, number>
) {
  assertExactKeySet(
    'stored benchmarks',
    Object.keys(stored.benchmarks),
    Object.keys(measuredBenchmarks)
  );
  assertExactKeySet('stored sizes', Object.keys(stored.sizes), Object.keys(measuredSizes));

  const storedBaseline = stored.benchmarks[BASELINE_BENCHMARK_ID];
  const measuredBaseline = measuredBenchmarks[BASELINE_BENCHMARK_ID];

  if (!storedBaseline || !measuredBaseline) {
    throw new Error(`Baseline benchmark ${BASELINE_BENCHMARK_ID} is required.`);
  }

  const failures: string[] = [];
  const lines: string[] = [];
  const warnings: string[] = [];

  addSampleCountWarning(warnings, BASELINE_BENCHMARK_ID, measuredBaseline.sampleCount);
  lines.push(
    `${BASELINE_BENCHMARK_ID}: mean=${formatNumber(measuredBaseline.mean)}ms median=${formatNumber(
      measuredBaseline.median
    )}ms samples=${measuredBaseline.sampleCount} BASELINE`
  );

  for (const scenarioId of scenarioIds) {
    const benchmarkId = `${BENCHMARK_PREFIX}${scenarioId}`;
    const storedBenchmark = stored.benchmarks[benchmarkId];
    const measuredBenchmark = measuredBenchmarks[benchmarkId];

    if (!storedBenchmark || !measuredBenchmark) {
      failures.push(`Missing benchmark entry for ${benchmarkId}`);
      continue;
    }

    addSampleCountWarning(warnings, benchmarkId, measuredBenchmark.sampleCount);

    const medianTolerancePct = tolerancePct(storedBenchmark);
    const factorTolerancePct = tolerancePct(storedBenchmark) + tolerancePct(storedBaseline);
    const storedFactor = storedBenchmark.factor;
    const measuredFactor = measuredBenchmark.mean / measuredBaseline.mean;
    const medianMax = maxAllowedValue(storedBenchmark.median, medianTolerancePct);
    const factorMax =
      storedFactor == null ? null : maxAllowedValue(storedFactor, factorTolerancePct);
    const expectedSize = stored.sizes[scenarioId];
    const measuredSize = measuredSizes[scenarioId];

    const medianOk = measuredBenchmark.median <= medianMax;
    const factorOk = factorMax != null ? measuredFactor <= factorMax : true;
    const sizeOk = measuredSize === expectedSize;
    const status = factorOk && sizeOk ? (medianOk ? 'OK' : 'WARN') : 'FAIL';

    lines.push(
      [
        `${benchmarkId}:`,
        `mean=${formatNumber(measuredBenchmark.mean)}ms`,
        `median=${formatNumber(measuredBenchmark.median)}ms`,
        `storedMedian=${formatNumber(storedBenchmark.median)}ms`,
        `medianMax=${formatNumber(medianMax)}ms`,
        `factor=${formatNumber(measuredFactor)}x`,
        storedFactor == null ? '' : `storedFactor=${formatNumber(storedFactor)}x`,
        factorMax == null ? '' : `factorMax=${formatNumber(factorMax)}x`,
        `size=${measuredSize}/${expectedSize}`,
        `tail=${formatPercent(medianTolerancePct)}`,
        `samples=${measuredBenchmark.sampleCount}`,
        status,
      ]
        .filter(Boolean)
        .join(' ')
    );

    if (!medianOk) {
      warnings.push(
        `${benchmarkId} median ${formatNumber(measuredBenchmark.median)}ms exceeds ${formatNumber(
          medianMax
        )}ms, but factor still passed; machine may be slower than the stored baseline`
      );
    }
    if (!factorOk && factorMax != null) {
      failures.push(
        `${benchmarkId} factor ${formatNumber(measuredFactor)}x exceeds ${formatNumber(factorMax)}x`
      );
    }
    if (!sizeOk) {
      failures.push(
        `${benchmarkId} size ${measuredSize} does not match stored size ${expectedSize}`
      );
    }
  }

  for (const warning of warnings) {
    console.warn(`Warning: ${warning}`);
  }

  for (const line of lines) {
    console.log(line);
  }

  if (failures.length > 0) {
    throw new Error(
      `Benchmark validation failed:\n${failures.map((failure) => `- ${failure}`).join('\n')}`
    );
  }
}

function scenarioIdsFromBenchmarkNames(names: string[]) {
  const scenarioIds = names
    .filter((name) => name.startsWith(BENCHMARK_PREFIX))
    .map((name) => name.slice(BENCHMARK_PREFIX.length));

  return [...scenarioIds].sort((a, b) => a.localeCompare(b));
}

function parseScenarioSizes(stderr: string): Record<string, number> {
  const sizes: Record<string, number> = {};

  for (const line of stderr.split(/\r?\n/)) {
    if (!line.startsWith(`${SIZE_LOG_PREFIX}\t`)) {
      continue;
    }

    const [, scenarioId, rawSize, ...rest] = line.split('\t');
    if (!scenarioId || !rawSize || rest.length > 0) {
      throw new Error(`Malformed benchmark size line: ${line}`);
    }

    const size = Number(rawSize);
    if (!Number.isInteger(size) || size < 0) {
      throw new Error(`Invalid benchmark size for ${scenarioId}: ${rawSize}`);
    }

    const previousSize = sizes[scenarioId];
    if (previousSize != null && previousSize !== size) {
      throw new Error(`Conflicting benchmark sizes for ${scenarioId}: ${previousSize} and ${size}`);
    }

    sizes[scenarioId] = size;
  }

  return sizes;
}

function stripScenarioSizeLines(stderr: string) {
  return stderr
    .split(/\r?\n/)
    .filter((line) => line && !line.startsWith(`${SIZE_LOG_PREFIX}\t`))
    .join('\n');
}

function tolerancePct(
  metrics: Pick<BenchmarkMetrics, 'median' | 'p75' | 'p99' | 'p995' | 'p999' | 'sampleCount'>
) {
  const minTolerance =
    metrics.sampleCount <= 10
      ? VERY_LOW_SAMPLE_MIN_TOLERANCE_PCT
      : metrics.sampleCount < 25
        ? LOW_SAMPLE_MIN_TOLERANCE_PCT
        : MIN_TOLERANCE_PCT;

  const p75Skew = percentAbove(metrics.p75, metrics.median);
  const p99Skew = percentAbove(metrics.p99, metrics.median);
  const p995Skew = percentAbove(metrics.p995, metrics.median);
  const p999Skew = percentAbove(metrics.p999, metrics.median);

  const skewTolerance = p75Skew * 2 + p99Skew * 0.2 + p995Skew * 0.1 + p999Skew * 0.05;

  return Math.max(skewTolerance, minTolerance);
}

function percentAbove(value: number, baseline: number) {
  if (baseline <= 0 || value <= baseline) {
    return 0;
  }
  return ((value - baseline) / baseline) * 100;
}

function maxAllowedValue(value: number, tolerancePct: number) {
  return value * (1 + tolerancePct / 100);
}

function addSampleCountWarning(warnings: string[], benchmarkId: string, sampleCount: number) {
  if (sampleCount <= 10) {
    warnings.push(
      `${benchmarkId} only collected ${sampleCount} samples; consider increasing runtime`
    );
  }
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

function sortBenchmarkNames(names: string[]) {
  return [...names].sort((a, b) => {
    if (a === BASELINE_BENCHMARK_ID) {
      return -1;
    }
    if (b === BASELINE_BENCHMARK_ID) {
      return 1;
    }
    return a.localeCompare(b);
  });
}

function formatNumber(value: number) {
  return value.toFixed(value >= 10 ? 2 : 4);
}

function formatPercent(value: number) {
  return `${value.toFixed(2)}%`;
}

const isDirectExecution =
  process.argv[1] != null && import.meta.url === pathToFileURL(resolve(process.argv[1])).href;

if (isDirectExecution) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}

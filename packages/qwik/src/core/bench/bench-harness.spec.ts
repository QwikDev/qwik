/**
 * Benchmark harness
 *
 * To run this, set the environment variable `RUN_BENCHMARK=true` and run the tests with `vitest`.
 *
 * This will run the benchmarks and check that the current implementation is within the expected
 * relative performance compared to the baseline.
 */
import { describe, expect, it } from 'vitest';
import { BASELINE_UNITS, formatRatio, median, sharedBaselineWorkload } from './baseline';
import { scenarios } from './scenarios';

const WARMUP_RUNS = 2;
const BASELINE_SAMPLE_RUNS = 9;
const SAMPLE_RUNS = 5;

const measureMs = async (fn: () => void | Promise<void>): Promise<number> => {
  const start = performance.now();
  await fn();
  return performance.now() - start;
};

type ScenarioSummary = {
  id: string;
  factor: number;
  size: number;
};

const runScenarioSummary = async (
  scenario: (typeof scenarios)[number]
): Promise<ScenarioSummary> => {
  for (let i = 0; i < WARMUP_RUNS; i++) {
    sharedBaselineWorkload(BASELINE_UNITS);
    await scenario.run();
  }

  const baselineSamples: number[] = [];
  const currentSamples: number[] = [];

  for (let i = 0; i < BASELINE_SAMPLE_RUNS; i++) {
    baselineSamples.push(
      await measureMs(() => {
        sharedBaselineWorkload(BASELINE_UNITS);
      })
    );
  }

  let size = 0;
  for (let i = 0; i < SAMPLE_RUNS; i++) {
    currentSamples.push(
      await measureMs(async () => {
        const newSize = await scenario.run();
        if (size !== 0 && newSize !== size) {
          throw new Error(
            `Scenario ${scenario.id} returned inconsistent sizes: ${size} vs ${newSize}`
          );
        }
        size = newSize;
      })
    );
  }

  const baselineMedian = Math.max(median(baselineSamples), 0.0001);
  const currentMedian = median(currentSamples);
  const factor = currentMedian / baselineMedian;

  return {
    id: scenario.id,
    factor: factor,
    size,
  };
};

// `RUN_BENCHMARK=true vitest bench-harness`
const shouldRun = process.env.RUN_BENCHMARK === 'true';

describe.runIf(shouldRun)('bench harness', () => {
  it('keeps relative benchmark snapshots stable', async () => {
    const summaries: ScenarioSummary[] = [];

    for (const scenario of scenarios) {
      const summary = await runScenarioSummary(scenario);
      summaries.push(summary);
      // eslint-disable-next-line no-console
      console.log(`Scenario ${scenario.id} ${summary.factor}x`);
    }

    const text = summaries
      .map((summary) => {
        const ratio = formatRatio(summary.factor);
        const sizePart = summary.size > 0 ? `, size=${summary.size}` : '';
        return `${summary.id}: current/baseline=${ratio}${sizePart}`;
      })
      .join('\n');

    expect(text).toMatchInlineSnapshot(`
      "ssr-table-10: current/baseline=0-5x, size=2049
      ssr-table-1k: current/baseline=75-100x, size=172325
      ssr-table-10k: current/baseline=750-1000x, size=1798685
      serialize-state-1k: current/baseline=0-5x, size=96844"
    `);
  }, 120_000);
});

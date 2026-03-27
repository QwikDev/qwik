import { bench, describe } from 'vitest';
import { sharedBaselineWorkload } from './baseline';
import { scenarios } from './scenarios';

const SIZE_LOG_PREFIX = 'QWIK_BENCH_SIZE';
const CI_BENCH = !!process.env.CI_BENCH;

console.warn(
  `Running benchmarks in ${CI_BENCH ? 'CI' : 'local'} mode (CI_BENCH=${CI_BENCH || '0'}).\nDOM tests have overhead due to the test DOM environment, so they are not directly comparable to SSR tests.\n`
);

describe('qwik core relative benchmarks', () => {
  if (CI_BENCH) {
    bench(
      'baseline.shared-workload',
      async () => {
        sharedBaselineWorkload();
      },
      { warmupTime: 500, time: 4000 }
    );
  }

  for (let i = 0; i < scenarios.length; i++) {
    const scenario = scenarios[i];
    let lastSize: number | null = null;
    bench(
      `current.${scenario.id}`,
      async () => {
        const size = await scenario.run();
        if (lastSize === null) {
          lastSize = size;
          process.stderr.write(`${SIZE_LOG_PREFIX}\t${scenario.id}\t${size}\n`);
        } else if (lastSize !== size) {
          throw new Error(
            `Scenario ${scenario.id} returned inconsistent sizes: ${lastSize} vs ${size}`
          );
        }
      },
      CI_BENCH ? { warmupTime: 500, time: 6000 } : undefined
    );
  }
});

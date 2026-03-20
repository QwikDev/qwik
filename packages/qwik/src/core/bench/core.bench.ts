import { bench, describe } from 'vitest';
import { sharedBaselineWorkload } from './baseline';
import { scenarios } from './scenarios';

const SIZE_LOG_PREFIX = 'QWIK_BENCH_SIZE';
const CI_BENCH = !!process.env.CI_BENCH;

describe('qwik core relative benchmarks', () => {
  bench(
    'baseline.shared-workload',
    async () => {
      sharedBaselineWorkload();
    },
    CI_BENCH ? { warmupTime: 500, time: 4000 } : undefined
  );

  for (const scenario of scenarios) {
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

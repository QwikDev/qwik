import { bench, describe } from 'vitest';
import { sharedBaselineWorkload } from './baseline';
import { scenarios } from './scenarios';

const BASELINE_OPTIONS = {
  warmupTime: 50,
  warmupIterations: 5,
  time: 250,
};

const SSR_OPTIONS = {
  warmupTime: 20,
  warmupIterations: 1,
  time: 200,
};

describe('qwik core relative benchmarks', () => {
  bench(
    'baseline.shared-workload',
    async () => {
      sharedBaselineWorkload();
    },
    BASELINE_OPTIONS
  );

  for (const scenario of scenarios) {
    bench(
      `current.${scenario.id}`,
      async () => {
        await scenario.run();
      },
      SSR_OPTIONS
    );
  }
});

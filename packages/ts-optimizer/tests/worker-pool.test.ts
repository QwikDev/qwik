import { describe, expect, test } from 'vitest';

import { createOptimizer } from '../src/create-optimizer.js';
import type { NapiTransformModulesOptions } from '../src/create-optimizer.js';

const CODE = `
import { component$, useSignal } from '@qwik.dev/core';

export const Counter = component$(() => {
  const count = useSignal(0);
  return <button onClick$={() => count.value++}>{count.value}</button>;
});
`;

function transformOpts(): NapiTransformModulesOptions {
  return {
    input: [{ path: '/app/src/counter.tsx', code: CODE }],
    srcDir: '/app/src',
    rootDir: '/app',
    mode: 'dev',
    minify: 'simplify',
    transpileTs: true,
    transpileJsx: true,
    explicitExtensions: true,
    preserveFilenames: true,
    entryStrategy: { type: 'segment' },
    isServer: false,
  };
}

describe('worker pool', () => {
  test('pool-backed transform matches the in-process transform', async () => {
    const direct = await createOptimizer({ workers: 0 });
    const pooled = await createOptimizer({ workers: 2 });
    try {
      const [directOut, pooledOut] = await Promise.all([
        direct.transformModules(transformOpts()),
        pooled.transformModules(transformOpts()),
      ]);
      expect(pooledOut).toEqual(directOut);
      expect(pooledOut.modules.length).toBeGreaterThan(1);
    } finally {
      await pooled.dispose?.();
    }
  });

  test('pool handles many concurrent calls', async () => {
    const pooled = await createOptimizer({ workers: 2 });
    try {
      const outputs = await Promise.all(
        Array.from({ length: 8 }, () => pooled.transformModules(transformOpts()))
      );
      for (const output of outputs) {
        expect(output.diagnostics).toEqual([]);
        expect(output.modules.some((m) => m.segment)).toBe(true);
      }
    } finally {
      await pooled.dispose?.();
    }
  });

  test('transform errors reject without breaking the pool', async () => {
    const pooled = await createOptimizer({ workers: 1 });
    try {
      const bad = transformOpts();
      bad.input = undefined as unknown as NapiTransformModulesOptions['input'];
      await expect(pooled.transformModules(bad)).rejects.toThrow();
      // The pool still serves subsequent good requests.
      const good = await pooled.transformModules(transformOpts());
      expect(good.diagnostics).toEqual([]);
    } finally {
      await pooled.dispose?.();
    }
  });
});

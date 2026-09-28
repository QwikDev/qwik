import { readFileSync } from 'node:fs';
import { expect, test } from 'vitest';
import { testInputs } from './snapshot-runner';

test.each(['csr', 'ssr'] as const)('%s batches the unannotated benchmark row', async (mode) => {
  const root = new URL('../../../../e2e/qwik-e2e/apps/perf/src/', import.meta.url);
  const output = await testInputs(
    mode,
    'counter-effects',
    ['root.tsx', 'build-data/build-data.ts'].map((path) => ({
      path: `src/${path}`,
      code: readFileSync(new URL(path, root), 'utf8'),
    }))
  );
  expect(output.diagnostics).toEqual([]);
  const code = output.modules.map((module) => module.code).join('\n');
  expect(code).not.toMatch(/createContentBlock|renderSsrContent/);
  expect(code).toContain(mode === 'csr' ? 'createDomBatchEffect(' : 'createSsrDomBatchEffect(');
  const row = output.modules.find((module) => module.path.includes('for_render_segment'))!.code;
  const batch = mode === 'csr' ? /createDomBatchEffect\(/g : /createSsrDomBatchEffect\(/g;
  expect(row.match(batch)).toHaveLength(1);
  expect(row).not.toMatch(/createTextExpressionEffect|createAttrExpressionEffect/);
});

import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import { transformModule } from '../../../src/optimizer/transform/index.js';
import { mkFilePath, mkSourceText } from '../../../src/optimizer/types/brands.js';

it.each(['none', 'simplify'] as const)('preserves migrated QRL purity (%s)', (minify) => {
  const code = readFileSync(
    new URL('../../../../optimizer/core/src/fixtures/migrated-qrl-pure.js', import.meta.url),
    'utf8'
  );
  const result = transformModule({
    input: [{ path: mkFilePath('node_modules/library/index.qwik.mjs'), code: mkSourceText(code) }],
    srcDir: mkFilePath('.'),
    entryStrategy: { type: 'smart' },
    mode: 'prod',
    minify,
    isServer: false,
  });
  expect(result.diagnostics.filter((diagnostic) => diagnostic.category === 'error')).toEqual([]);
  const parent = result.modules.find((module) => module.kind !== 'segment')!;
  const calls = parent.code.split('\n').filter((line) => /\bqrl\(/.test(line));
  expect(calls.length).toBeGreaterThan(0);
  for (const line of calls) {
    expect(line).toContain('/*#__PURE__*/');
  }
  expect(parent.code).toContain('KEEP_SIDE_EFFECT');
  const render = result.modules.find(
    (module) => module.kind === 'segment' && module.segment.displayName.endsWith('_App_component')
  )!;
  expect(render.code).toContain('useRead');
  expect(render.code).toContain('q_s_CCC333ccc33');
});

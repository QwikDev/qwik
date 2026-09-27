/**
 * `native$(impl, targets)` is a build-time marker: the JS implementation stays the module's export
 * and the per-target sources ride the plan, so a native engine can call the function without a JS
 * runtime. Nothing about the marker may reach the emitted module.
 */
import { describe, expect, test } from 'vitest';
import { analyseModule } from '../analyse/analyse-module';
import { NativeTargetKind } from '../schema';
import { testInput } from './snapshot-runner';

const MODULE = `import { native$, nativeCode, nativeFrom, useSignal } from '@qwik.dev/core';
let nextId = 1;
export const buildRows = native$(
  (count: number) => {
    const rows = new Array(count);
    for (let i = 0; i < count; i++) {
      rows[i] = { id: nextId++, label: useSignal('row') };
    }
    return rows;
  },
  { rust: nativeFrom('./native'), go: nativeCode\`func BuildRows() {}\` }
);
`;

describe('native markers', () => {
  test('the plan records the implementation and its per-target sources', async () => {
    const plan = await analyseModule(
      { path: 'src/build-rows.ts', code: MODULE },
      { transpileTs: true }
    );

    expect(plan.diagnostics).toEqual([]);
    expect(plan.natives).toHaveLength(1);
    const native = plan.natives[0];
    expect(native.name).toBe('buildRows');
    expect(native.targets).toEqual({
      rust: { kind: NativeTargetKind.Path, path: './native' },
      go: { kind: NativeTargetKind.Source, raw: 'func BuildRows() {}' },
    });
    // The marker is not a QRL boundary: its body runs in place, hooks and all.
    expect(plan.qrls).toEqual([]);
  });

  test.each(['ssr', 'csr'] as const)('%s golden: the marker is stripped', async (mode) => {
    const output = await testInput(mode, 'native-marker', {
      path: 'src/build-rows.ts',
      code: MODULE,
    });

    expect(output.diagnostics).toEqual([]);
    const code = output.modules.map((module) => module.code).join('\n');
    expect(code).not.toContain('native$');
    expect(code).not.toContain('nativeFrom');
    expect(code).not.toContain('nativeCode');
    // The implementation stays the export, unchanged.
    expect(code).toMatch(/export const buildRows = \(count\) => \{/);
    expect(code).toMatch(/useSignal\(['"]row['"]\)/);
  });
});

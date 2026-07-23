import { describe, it, expect } from 'vitest';
import { transformModule } from '../../../src/optimizer/transform/index.js';
import { mkFilePath, mkSourceText } from '../../../src/optimizer/types/brands.js';

function run(input: string): string {
  const result = transformModule({
    input: [{ path: mkFilePath('test.tsx'), code: mkSourceText(input) }],
    srcDir: mkFilePath('.'),
    transpileTs: true,
    transpileJsx: true,
    mode: 'dev',
    entryStrategy: { type: 'segment' },
    minify: 'none',
    explicitExtensions: false,
    sourceMaps: false,
    preserveFilenames: false,
  });
  return result.modules.map((m) => m.code ?? '').join('\n');
}

describe('_fnSignal hoisting carries a computed key that is a loop-local binding', () => {
  it('parameterizes a .map callback var used as a signal computed key', () => {
    const input = `
import { component$, useSignal } from '@qwik.dev/core';
export const C = component$(() => {
  const counts = useSignal({});
  const names = useSignal([]);
  return <div>{names.value.map((name) => <p key={name}>{counts.value[name] || 0}</p>)}</div>;
});`;
    const out = run(input);
    expect(out).toMatch(/const _hf\d+ = \(p0, ?p1\) => p0\.value\[p1\]/);
    expect(out).toMatch(/_fnSignal\(_hf\d+, \[counts, name\]/);
    expect(out).not.toMatch(/=> p0\.value\[name\]/);
  });

  it('leaves a literal computed key inline (no spurious extra dep)', () => {
    const input = `
import { component$, useSignal } from '@qwik.dev/core';
export const C = component$(() => {
  const items = useSignal([]);
  return <div>{items.value[0] || 0}</div>;
});`;
    const out = run(input);
    expect(out).toMatch(/const _hf\d+ = \(p0\) => p0\.value\[0\]/);
    expect(out).toMatch(/_fnSignal\(_hf\d+, \[items\]/);
  });
});

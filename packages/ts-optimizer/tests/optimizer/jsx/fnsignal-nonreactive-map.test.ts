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

describe('_fnSignal hoisting stays out of non-reactive maps and nested callback params', () => {
  it('leaves a plain module-const .map inline instead of hoisting it', () => {
    const input = `
import { component$ } from '@qwik.dev/core';
const items = [1, 2, 3];
const render = (x) => x;
export const C = component$(() => <div>{items.map((x) => render(x))}</div>);`;
    const out = run(input);
    expect(out).not.toMatch(/_fnSignal/);
    expect(out).toMatch(/items\.map\(/);
  });

  it('leaves a signal-less .map inline when its callback invokes a local helper', () => {
    const input = `
import { component$ } from '@qwik.dev/core';
const data = [{ id: 'a' }, { id: 'b' }];
const renderNode = (node) => node.id;
export const C = component$(() => <div>{data.map((node) => renderNode(node))}</div>);`;
    const out = run(input);
    expect(out).not.toMatch(/_fnSignal/);
    expect(out).not.toMatch(/=>\s*p0\.map\(/);
    expect(out).toMatch(/data\.map\(/);
  });

  it('never lifts a nested callback parameter into a hoisted dependency array', () => {
    const input = `
import { component$, useSignal } from '@qwik.dev/core';
export const C = component$(() => {
  const flag = useSignal(true);
  return <Cmp handler={{ fn: flag.value ? ((node) => node) : null }} />;
});`;
    const out = run(input);
    expect(out).not.toMatch(/_fnSignal\([^)]*\bnode\b/);
  });

  it('still hoists an optional-chain getter call', () => {
    const input = `
import { component$, useSignal } from '@qwik.dev/core';
export const App = component$(() => {
  const signal = useSignal(0);
  return <Cmp value={signal.formData?.get('username')} />;
});`;
    const out = run(input);
    expect(out).toMatch(/=>\s*p0\.formData\?\.get/);
    expect(out).toMatch(/_fnSignal\(_hf\d+, \[signal\]/);
  });
});

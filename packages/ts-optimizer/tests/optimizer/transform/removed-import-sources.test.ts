import { describe, it, expect } from 'vitest';
import { transformModule } from '../../../src/optimizer/transform/index.js';
import { mkFilePath, mkSourceText } from '../../../src/optimizer/types/brands.js';

function parentModule(code: string) {
  const result = transformModule({
    input: [{ path: mkFilePath('test.tsx'), code: mkSourceText(code) }],
    srcDir: mkFilePath('.'),
    entryStrategy: { type: 'segment' },
    minify: 'simplify',
    transpileTs: true,
    transpileJsx: true,
  });
  return result.modules.find((m) => m.kind === 'parent')!;
}

describe('removed import sources (SSR-restore graph)', () => {
  it('reports an import that only the extracted body used', () => {
    const parent = parentModule(`
import { component$ } from '@qwik.dev/core';
import { helper } from 'lib-x';
export const C = component$(() => {
  return <div>{helper()}</div>;
});
`);
    expect(parent.imports).toContain('lib-x');
  });

  it('does not report a dynamic-import-shaped string as a removed source', () => {
    const parent = parentModule(`
import { component$ } from '@qwik.dev/core';
export const C = component$(() => {
  const hint = 'import("./phantom")';
  return <div title={hint}>x</div>;
});
`);
    expect(parent.imports ?? []).not.toContain('./phantom');
  });

  it('still reports a removed import when a kept string mentions its source', () => {
    const parent = parentModule(`
import { component$ } from '@qwik.dev/core';
import { helper } from 'lib-x';
export const note = 'from "lib-x"';
export const C = component$(() => {
  return <div>{helper()}</div>;
});
`);
    expect(parent.imports).toContain('lib-x');
  });
});

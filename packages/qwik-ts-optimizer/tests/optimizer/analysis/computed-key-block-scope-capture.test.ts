import { describe, it, expect } from 'vitest';
import { transformModule } from '../../../src/index.js';
import { mkFilePath, mkSourceText } from '../../../src/optimizer/types/brands.js';

function captures(body: string): string {
  const code = `import { useComputed$ } from '@qwik.dev/core';
export function h(props) {
${body}
  return null;
}`;
  const result = transformModule({
    input: [{ path: mkFilePath('h.tsx'), code: mkSourceText(code) }],
    srcDir: mkFilePath('.'),
    entryStrategy: { type: 'hoist' },
    minify: 'simplify',
    transpileTs: true,
    isServer: true,
    mode: 'dev',
  });
  const parent = (result.modules.find((m) => m.kind === 'parent') ?? result.modules[0]!).code;
  const w = parent.match(/\.w\(\[([^\]]*)\]\)/);
  return w ? w[1].replace(/\s+/g, ' ').trim() : '';
}

describe('computed member/key identifiers are captured', () => {
  it('captures a variable used as a computed member key', () => {
    expect(captures(`  const k = props.k;\n  const c = useComputed$(() => props.rec[k]);`)).toContain('k');
  });

  it('does not capture a non-computed member property name', () => {
    expect(captures(`  const c = useComputed$(() => props.rec.value);`)).toBe('props');
  });
});

describe('block- and loop-scoped variables are captured', () => {
  it('captures a for-of loop binding', () => {
    expect(captures(`  for (const k of props.ks) {\n    const c = useComputed$(() => k + 1);\n  }`)).toContain('k');
  });

  it('captures a const declared in a loop body', () => {
    expect(captures(`  for (const key of props.ks) {\n    const name = key;\n    const c = useComputed$(() => name);\n  }`)).toContain('name');
  });

  it('captures a const declared in a plain block', () => {
    expect(captures(`  {\n    const z = props.a;\n    const c = useComputed$(() => z);\n  }`)).toContain('z');
  });

  it('captures both a loop-body const AND a function-scope const used as a computed key (qds useBindings shape)', () => {
    const w = captures(
      `  const propsRecord = props;\n  for (const key of props.ks) {\n    const keyName = key;\n    const c = useComputed$(() => propsRecord[keyName]);\n  }`,
    );
    expect(w).toContain('keyName');
    expect(w).toContain('propsRecord');
  });
});

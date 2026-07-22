import { describe, it, expect } from 'vitest';
import { transformModule } from '../../../src/optimizer/transform/index.js';
import type { TransformModule } from '../../../src/optimizer/types/types.js';
import { mkFilePath, mkSourceText } from '../../../src/optimizer/types/brands.js';

function findParent(result: { modules: readonly TransformModule[] }): TransformModule {
  const parent = result.modules.find((m) => m.kind === 'parent');
  if (!parent) throw new Error('parent module not found');
  return parent;
}

describe('lib-mode emission shape', () => {
  it('emits markerQrl(inlinedQrl(body, name)) for top-level component$ under mode=lib', () => {
    const input = `
import { component$ } from '@qwik.dev/core';
export const Greet = component$((props) => <div>{props.name}</div>);
`;
    const result = transformModule({
      input: [{ path: mkFilePath('test.tsx'), code: mkSourceText(input) }],
      srcDir: mkFilePath('.'),
      mode: 'lib',
      transpileTs: true,
      transpileJsx: true,
    });

    const code = findParent(result).code;
    expect(code).toMatch(
      /export const Greet = \/\*\s*[#@]__PURE__\s*\*\/ componentQrl\(\/\*\s*[#@]__PURE__\s*\*\/ inlinedQrl\(/,
    );
    expect(code).toMatch(/, "Greet_component_[A-Za-z0-9_]+"\)\)/);
    expect(code).not.toMatch(/_noopQrl/);
    expect(code).not.toMatch(/q_[A-Za-z0-9_]+\.s\(/);
  });

  it('threads captures via inlinedQrl 3rd argument under mode=lib', () => {
    const input = `
import { component$, useTask$, useSignal } from '@qwik.dev/core';
export const C = component$(() => {
  const sig = useSignal(0);
  useTask$(() => { console.log(sig.value); });
  return <div/>;
});
`;
    const result = transformModule({
      input: [{ path: mkFilePath('test.tsx'), code: mkSourceText(input) }],
      srcDir: mkFilePath('.'),
      mode: 'lib',
      transpileTs: true,
      transpileJsx: true,
    });

    const code = findParent(result).code;
    expect(code).toMatch(/inlinedQrl\(\(\)\s*=>\s*\{[\s\S]*?\}, "C_component_useTask_[A-Za-z0-9_]+", \[sig\]\)/);
    expect(code).not.toMatch(/\.w\(\[/);
  });

  it('preserves user-level module const decls as identifier refs (not value-inlined)', () => {
    const input = `
import { component$, useStyle$ } from '@qwik.dev/core';
export const Works = component$(() => {
  useStyle$(STYLES);
  return <div/>;
});
const STYLES = '.class {}';
`;
    const result = transformModule({
      input: [{ path: mkFilePath('test.tsx'), code: mkSourceText(input) }],
      srcDir: mkFilePath('.'),
      mode: 'lib',
      transpileTs: true,
      transpileJsx: true,
    });

    const code = findParent(result).code;
    expect(code).toMatch(/useStyleQrl\(\/\*[^*]*\*\/ inlinedQrl\(STYLES, "Works_component_useStyle_[A-Za-z0-9_]+"\)\)/);
    expect(code).toMatch(/const STYLES = ['"]\.class \{\}['"]/);
  });

  it('suppresses segment-file modules under mode=lib', () => {
    const input = `
import { component$ } from '@qwik.dev/core';
export const C = component$(() => <div/>);
`;
    const result = transformModule({
      input: [{ path: mkFilePath('test.tsx'), code: mkSourceText(input) }],
      srcDir: mkFilePath('.'),
      mode: 'lib',
      transpileTs: true,
      transpileJsx: true,
    });

    const segments = result.modules.filter((m) => m.kind === 'segment');
    expect(segments.length).toBe(0);
  });

  it('suppresses _auto_X re-exports under mode=lib', () => {
    const input = `
import { component$, useStyle$ } from '@qwik.dev/core';
export const C = component$(() => {
  useStyle$(STYLES);
  return <div/>;
});
const STYLES = '.class {}';
`;
    const result = transformModule({
      input: [{ path: mkFilePath('test.tsx'), code: mkSourceText(input) }],
      srcDir: mkFilePath('.'),
      mode: 'lib',
      transpileTs: true,
      transpileJsx: true,
    });

    const code = findParent(result).code;
    expect(code).not.toMatch(/_auto_/);
  });

  it('imports `inlinedQrl` (and not `_noopQrl`) under mode=lib', () => {
    const input = `
import { component$ } from '@qwik.dev/core';
export const C = component$(() => <div/>);
`;
    const result = transformModule({
      input: [{ path: mkFilePath('test.tsx'), code: mkSourceText(input) }],
      srcDir: mkFilePath('.'),
      mode: 'lib',
      transpileTs: true,
      transpileJsx: true,
    });

    const code = findParent(result).code;
    expect(code).toMatch(/import \{ inlinedQrl \} from ["']@qwik\.dev\/core["']/);
    expect(code).not.toMatch(/import \{ _noopQrl \}/);
  });

  it('non-lib modes still use the segment-file emission shape (negative scope)', () => {
    const input = `
import { component$ } from '@qwik.dev/core';
export const C = component$(() => <div/>);
`;
    const result = transformModule({
      input: [{ path: mkFilePath('test.tsx'), code: mkSourceText(input) }],
      srcDir: mkFilePath('.'),
      mode: 'prod',
      transpileTs: true,
      transpileJsx: true,
    });

    const code = findParent(result).code;
    expect(code).toMatch(/qrl\(\(\)\s*=>\s*import\(/);
    expect(code).not.toMatch(/inlinedQrl\(/);
    const segments = result.modules.filter((m) => m.kind === 'segment');
    expect(segments.length).toBeGreaterThan(0);
  });
});

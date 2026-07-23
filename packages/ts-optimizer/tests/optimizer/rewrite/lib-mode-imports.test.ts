import { describe, it, expect } from 'vitest';
import { transformModule } from '../../../src/optimizer/transform/index.js';
import type { TransformModule } from '../../../src/optimizer/types/types.js';
import { mkFilePath, mkSourceText } from '../../../src/optimizer/types/brands.js';

function findParent(result: { modules: readonly TransformModule[] }): TransformModule {
  const parent = result.modules.find((m) => m.kind === 'parent');
  if (!parent) throw new Error('parent module not found');
  return parent;
}

describe('lib-mode import preservation', () => {
  it('preserves `$`-suffix marker imports alongside their `*Qrl` rewrites', () => {
    const input = `
import { component$, useStyle$, useTask$ } from '@qwik.dev/core';
export const C = component$(() => {
  useStyle$(STYLES);
  useTask$(() => { console.log('task'); });
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
    expect(code).toMatch(/import \{[^}]*\bcomponent\$[^}]*\} from ["']@qwik\.dev\/core["']/);
    expect(code).toMatch(/import \{[^}]*\buseStyle\$[^}]*\} from ["']@qwik\.dev\/core["']/);
    expect(code).toMatch(/import \{[^}]*\buseTask\$[^}]*\} from ["']@qwik\.dev\/core["']/);
    expect(code).toMatch(/import \{ componentQrl \} from ["']@qwik\.dev\/core["']/);
    expect(code).toMatch(/import \{ useStyleQrl \} from ["']@qwik\.dev\/core["']/);
    expect(code).toMatch(/import \{ useTaskQrl \} from ["']@qwik\.dev\/core["']/);
  });

  it('strips bare `$` (no marker-function semantics) under lib mode', () => {
    const input = `
import { $, component$ } from '@qwik.dev/core';
export const C = component$(() => <div onClick={$(() => console.log('!'))}/>);
`;
    const result = transformModule({
      input: [{ path: mkFilePath('test.tsx'), code: mkSourceText(input) }],
      srcDir: mkFilePath('.'),
      mode: 'lib',
      transpileTs: true,
      transpileJsx: true,
    });
    const code = findParent(result).code;
    expect(code).toMatch(/component\$/);
    const importMatch = code.match(/import \{([^}]+)\} from ["']@qwik\.dev\/core["']/);
    expect(importMatch).not.toBeNull();
    const specs = importMatch![1].split(',').map((s) => s.trim());
    expect(specs).not.toContain('$');
  });

  it('adds `jsx as _jsx` import from `@qwik.dev/core/jsx-runtime` under lib mode', () => {
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
    expect(code).toMatch(/import \{ jsx as _jsx \} from ["']@qwik\.dev\/core\/jsx-runtime["']/);
  });

  it('non-lib modes still strip `$`-suffix markers from imports (negative scope)', () => {
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
    expect(code).not.toMatch(/\bcomponent\$/);
    expect(code).not.toMatch(/import \{ jsx as _jsx \}/);
  });

  it('non-lib modes still strip `jsx as _jsx` (negative scope)', () => {
    const input = `
import { component$ } from '@qwik.dev/core';
export const C = component$(() => <div/>);
`;
    const result = transformModule({
      input: [{ path: mkFilePath('test.tsx'), code: mkSourceText(input) }],
      srcDir: mkFilePath('.'),
      mode: 'dev',
      transpileTs: true,
      transpileJsx: true,
    });
    const code = findParent(result).code;
    expect(code).not.toMatch(/jsx as _jsx/);
  });

  it('end-to-end: example_lib_mode flips with Sub-A + Sub-C', () => {
    const input = `
import { $, component$, server$, useStyle$, useTask$, useSignal } from '@qwik.dev/core';

export const Works = component$((props) => {
\tuseStyle$(STYLES);
\tconst text = 'hola';
\tconst sig = useSignal('hola');
\tuseTask$(() => {
\t\tconsole.log(sig.value, text);
\t});
\treturn (
\t\t<div onClick$={server$(() => console.log('in server', sig.value, text))}></div>
\t);
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

    expect(code).toMatch(/componentQrl\(\/\*[^*]*\*\/ inlinedQrl/);
    expect(code).toMatch(/useStyleQrl\(\/\*[^*]*\*\/ inlinedQrl/);
    expect(code).toMatch(/useTaskQrl\(\/\*[^*]*\*\/ inlinedQrl/);
    expect(code).toMatch(/serverQrl\(\/\*[^*]*\*\/ inlinedQrl/);

    expect(code).toMatch(/console\.log\(sig\.value, ["']hola["']\)/);

    expect(code).toMatch(/\bcomponent\$/);
    expect(code).toMatch(/\bserver\$/);
    expect(code).toMatch(/\buseStyle\$/);
    expect(code).toMatch(/\buseTask\$/);
    expect(code).toMatch(/\buseSignal\b/);

    expect(code).toMatch(/import \{ jsx as _jsx \} from ["']@qwik\.dev\/core\/jsx-runtime["']/);

    const segments = result.modules.filter((m) => m.kind === 'segment');
    expect(segments.length).toBe(0);
  });
});

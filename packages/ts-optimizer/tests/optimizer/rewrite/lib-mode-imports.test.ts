import { parseSync } from 'oxc-parser';
import { describe, it, expect } from 'vitest';
import { transformModule } from '../../../src/optimizer/transform/index.js';
import type { TransformModule } from '../../../src/optimizer/types/types.js';
import { mkFilePath, mkSourceText } from '../../../src/optimizer/types/brands.js';

function findParent(result: { modules: readonly TransformModule[] }): TransformModule {
  const parent = result.modules.find((m) => m.kind === 'parent');
  if (!parent) {
    throw new Error('parent module not found');
  }
  return parent;
}

function transformLib(input: string): string {
  const result = transformModule({
    input: [{ path: mkFilePath('test.tsx'), code: mkSourceText(input) }],
    srcDir: mkFilePath('.'),
    mode: 'lib',
    transpileTs: true,
    transpileJsx: true,
  });
  return findParent(result).code;
}

/** Sources of every import that binds `localName`. */
function importSourcesOf(code: string, localName: string): string[] {
  const sources: string[] = [];
  for (const stmt of parseSync('out.js', code).program.body) {
    if (stmt.type !== 'ImportDeclaration') {
      continue;
    }
    for (const spec of stmt.specifiers) {
      if (spec.local.name === localName) {
        sources.push(stmt.source.value);
      }
    }
  }
  return sources;
}

/** Source of the import that binds `localName`, asserting there is exactly one. */
function localImportSource(code: string, localName: string): string {
  const sources = importSourcesOf(code, localName);
  expect(sources).toHaveLength(1);
  return sources[0];
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

  it('imports `inlinedQrl` once when `bind:value` also uses it under lib mode', () => {
    const input = `
import { component$, useSignal } from '@qwik.dev/core';
export const C = component$(() => {
  const v = useSignal('');
  return <input bind:value={v} />;
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
    expect(
      code.match(/import \{[^}]*\binlinedQrl\b[^}]*\} from ["']@qwik\.dev\/core["']/g)
    ).toHaveLength(1);
    expect(code).toMatch(/inlinedQrl\(_val, "_val", \[v\]\)/);
  });

  it('does not treat a non-Qwik `inlinedQrl` import as the lib-mode helper', () => {
    const input = `
import { component$ } from '@qwik.dev/core';
import { inlinedQrl } from './my-qrl';
export const C = component$(() => <div>{inlinedQrl()}</div>);
`;
    const code = transformLib(input);
    expect(parseSync('out.js', code).errors).toEqual([]);
    expect(localImportSource(code, 'inlinedQrl')).toBe('./my-qrl');
    expect(localImportSource(code, 'inlinedQrl1')).toBe('@qwik.dev/core');
    expect(code).toMatch(/import \{ inlinedQrl as inlinedQrl1 \} from "@qwik\.dev\/core"/);
    expect(code).toMatch(/componentQrl\(\/\*#__PURE__\*\/ inlinedQrl1\(/);
    expect(code).toMatch(/_jsxSorted\("div", null, null, inlinedQrl\(\)/);
  });

  it('does not treat a local `inlinedQrl` function as the lib-mode helper', () => {
    const input = `
import { component$ } from '@qwik.dev/core';
function inlinedQrl() { return 'mine'; }
const inlinedQrl1 = 'taken';
export const C = component$(() => <div title={inlinedQrl1}>{inlinedQrl()}</div>);
`;
    const code = transformLib(input);
    expect(parseSync('out.js', code).errors).toEqual([]);
    expect(code).toMatch(/function inlinedQrl\(\)/);
    expect(localImportSource(code, 'inlinedQrl2')).toBe('@qwik.dev/core');
    expect(code).toMatch(/componentQrl\(\/\*#__PURE__\*\/ inlinedQrl2\(/);
    expect(code).toMatch(/, inlinedQrl\(\)/);
  });

  it('reuses an existing `inlinedQrl` import from `@qwik.dev/core` under lib mode', () => {
    const input = `
import { component$, inlinedQrl } from '@qwik.dev/core';
export const q = inlinedQrl(() => 1, 'q_pre');
export const C = component$(() => <div/>);
`;
    const code = transformLib(input);
    expect(parseSync('out.js', code).errors).toEqual([]);
    expect(localImportSource(code, 'inlinedQrl')).toBe('@qwik.dev/core');
    expect(code).toMatch(/componentQrl\(\/\*#__PURE__\*\/ inlinedQrl\(/);
  });

  it('reuses an aliased `inlinedQrl` import from `@qwik.dev/core` under lib mode', () => {
    const input = `
import { component$, inlinedQrl as iq } from '@qwik.dev/core';
export const q = iq;
export const C = component$(() => <div/>);
`;
    const code = transformLib(input);
    expect(parseSync('out.js', code).errors).toEqual([]);
    expect(localImportSource(code, 'iq')).toBe('@qwik.dev/core');
    expect(importSourcesOf(code, 'inlinedQrl')).toEqual([]);
    expect(code).toMatch(/componentQrl\(\/\*#__PURE__\*\/ iq\(/);
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
    expect(code.indexOf('const STYLES')).toBeLessThan(code.indexOf('export const Works'));

    const segments = result.modules.filter((m) => m.kind === 'segment');
    expect(segments.length).toBe(0);
  });
});

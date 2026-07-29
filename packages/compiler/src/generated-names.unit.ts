import type { TransformModuleInput, TransformModulesOptions } from '@qwik.dev/optimizer';
import { parseSync } from 'oxc-parser';
import { describe, expect, test } from 'vitest';
import { transformModules } from './index';

const options = (input: TransformModuleInput, isServer: boolean): TransformModulesOptions => ({
  input: [input],
  srcDir: 'src',
  sourceMaps: false,
  transpileTs: true,
  transpileJsx: true,
  isServer,
});

/**
 * `showSemanticErrors` is required here: a parameter redeclared by a body binding is an early
 * error, which the parser alone does not report.
 */
const moduleErrors = (modules: readonly { path: string; code: string }[]): string[] =>
  modules.flatMap((module) =>
    parseSync(module.path, module.code, {
      lang: 'js',
      sourceType: 'module',
      showSemanticErrors: true,
    }).errors.map((error) => `${module.path}: ${error.message}`)
  );

/**
 * The compiler emits every component as `(props, ctx) => {...}`, so both parameter names must be
 * allocated around whatever the module already binds.
 */
const cases: Record<string, string> = {
  'component-local ctx': `import { useSignal } from '@qwik.dev/core';
export function App() {
  const ctx = useSignal('a');
  return <div>{ctx.value}</div>;
}
`,
  'component-local ctx beside a props parameter': `import { useSignal } from '@qwik.dev/core';
export function App({ label }) {
  const ctx = useSignal('a');
  return <div>{label}{ctx.value}</div>;
}
`,
  'component-local props without a props parameter': `import { useSignal } from '@qwik.dev/core';
export function App() {
  const props = useSignal('a');
  return <div>{props.value}</div>;
}
`,
  'both ctx and props taken': `import { useSignal } from '@qwik.dev/core';
export function App() {
  const ctx = useSignal('a');
  const props = useSignal('b');
  return <div>{ctx.value}{props.value}</div>;
}
`,
  'ctx and the fallback name ctx0 taken': `import { useSignal } from '@qwik.dev/core';
export function App() {
  const ctx = useSignal('a');
  const ctx0 = useSignal('b');
  return <div>{ctx.value}{ctx0.value}</div>;
}
`,
};

describe('generated parameter names', () => {
  for (const [label, code] of Object.entries(cases)) {
    for (const isServer of [false, true]) {
      test(`${label} (${isServer ? 'ssr' : 'csr'})`, async () => {
        const path = `src/generated-names-${isServer ? 'ssr' : 'csr'}.tsx`;
        const result = await transformModules(options({ path, code }, isServer));

        expect(result.diagnostics).toEqual([]);
        expect(moduleErrors(result.modules)).toEqual([]);
      });
    }
  }

  test('keeps the natural names when nothing collides', async () => {
    const input = {
      path: 'src/generated-names-natural.tsx',
      code: `export function App({ label }) {
  return <div>{label}</div>;
}
`,
    };

    const result = await transformModules(options(input, false));

    expect(result.diagnostics).toEqual([]);
    expect(result.modules[0]?.code).toContain('(props, ctx)');
  });

  test('renames the parameter instead of shadowing a module binding', async () => {
    const input = {
      path: 'src/generated-names-shadow.tsx',
      code: `const ctx = 'a';
export function App() {
  return <div>{ctx}</div>;
}
`,
    };

    const result = await transformModules(options(input, false));

    expect(result.diagnostics).toEqual([]);
    expect(result.modules[0]?.code).not.toContain('(props, ctx)');
  });
});

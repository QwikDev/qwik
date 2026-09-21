/**
 * End-to-end flow smoke: analyse → link → generate is wired through the compat wrapper, even while
 * the stage bodies are mocks. Foreign (non-Qwik) modules already flow to real output.
 */
import { describe, expect, test } from 'vitest';
import { format } from 'prettier';
import { analyseModule, generateJsSsr, linkPlans, transformModules } from '../index';
import {
  BoundaryKind,
  BuildMode,
  DiagnosticCategory,
  Environment,
  EntryKind,
  LinkResultKind,
  ModuleKind,
  PlanFormat,
} from '../schema';
import { loadDefaultFunction, serverSpecialization } from './fixtures';

describe('pipeline flow', () => {
  test('a binding named undefined is not empty render output', async () => {
    const plan = await analyseModule(
      {
        path: 'src/app.tsx',
        code: "import { component$ } from '@qwik.dev/core';\nexport default component$((undefined) => <p>{undefined}</p>);",
      },
      {}
    );
    expect(plan.kind).toBe(ModuleKind.Qwik);
    expect(plan.qrls.some((qrl) => qrl.ctxName === 'text')).toBe(true);
  });

  test.each(['component$()', 'component$(...callbacks)', 'component$(() => <p />, options)'])(
    'rejects unsupported marker calls without discarding authored execution: %s',
    async (expression) => {
      await expect(
        analyseModule(
          {
            path: 'src/app.tsx',
            code: `import { component$ } from '@qwik.dev/core';\nexport const App = ${expression};`,
          },
          {}
        )
      ).rejects.toThrow('component$');
    }
  );

  test.each([
    `import { component$ } from './other';`,
    `const component$ = (fn) => fn;`,
    `import type { component$ } from '@qwik.dev/core';`,
  ])('does not recognize unrelated component$ bindings: %s', async (prefix) => {
    const plan = await analyseModule(
      { path: 'src/app.tsx', code: `${prefix}\nexport const App = component$(() => <p />);` },
      {}
    );
    expect(plan.kind).toBe(ModuleKind.Qwik);
    expect(plan.qrls.some((qrl) => qrl.boundary.kind === BoundaryKind.Component)).toBe(false);
  });

  test.each(['() => null', 'function () { return null; }'])(
    'component$ explicitly marks a headless component: %s',
    async (fn) => {
      const output = await transformModules({
        input: [
          {
            path: 'src/app.tsx',
            code: `import { component$ } from '@qwik.dev/core';\nexport default component$(${fn});`,
          },
        ],
        isServer: true,
      });
      expect(output.diagnostics).toEqual([]);
      expect(output.modules[0].code).not.toContain('component$(');
      expect(loadDefaultFunction(output.modules[0], {})()).toBe('');
    }
  );

  test.each([
    ['SSR', true],
    ['CSR', false],
  ] as const)('generated %s locals avoid authored bindings', async (_target, isServer) => {
    const output = await transformModules({
      input: [
        {
          path: 'src/component.tsx',
          code: `import { component$, useSignal } from '@qwik.dev/core';
export default component$(() => {
  const text0 = useSignal(0);
  return <p>{text0.value}</p>;
});
`,
        },
      ],
      srcDir: 'src',
      sourceMaps: false,
      transpileTs: true,
      transpileJsx: true,
      isServer,
    });
    expect(output.modules[0].code.match(/\bconst text0\b/g)).toHaveLength(1);
    expect(output.modules[0].code).toContain('const text1 =');
  });

  test('compat wrapper runs a passthrough module end to end', async () => {
    const output = await transformModules({
      input: [{ path: 'src/plain.ts', code: 'const value: number = 1;\nexport default value;\n' }],
      srcDir: 'src',
      sourceMaps: false,
      transpileTs: true,
      transpileJsx: true,
      isServer: true,
    });
    expect(output.modules).toHaveLength(1);
    expect(output.modules[0]).toMatchObject({
      path: 'src/plain.ts',
      code: 'const value = 1;\nexport default value;\n',
      isEntry: false,
      map: null,
      segment: null,
      origPath: null,
    });
    expect(output.diagnostics).toEqual([]);
    expect(output.isTypeScript).toBe(true);
    expect(output.isJsx).toBe(false);
  });

  test('stages compose directly: analyse → link → generateJsSsr', async () => {
    const plan = await analyseModule(
      { path: 'src/util.js', code: 'export const n = 1;\n' },
      { transpileTs: true }
    );
    expect(plan.format).toBe(PlanFormat.ModulePlan);
    const linked = linkPlans(
      [plan],
      [{ kind: EntryKind.Module, module: 'src/util.js' }],
      serverSpecialization(),
      { edges: {} },
      true
    );
    expect(linked.kind).toBe(LinkResultKind.Linked);
    if (linked.kind !== LinkResultKind.Linked) {
      return;
    }
    expect(linked.plan.entries).toEqual([{ kind: EntryKind.Module, module: 0 }]);
    const generated = await generateJsSsr(linked.plan, {});
    expect(generated.modules[0].code).toBe('export const n = 1;\n');
  });

  test('a complete link fails loudly on an unknown entry', () => {
    const linked = linkPlans(
      [],
      [{ kind: EntryKind.Module, module: 'src/missing.ts' }],
      serverSpecialization(),
      { edges: {} },
      true
    );
    expect(linked.kind).toBe(LinkResultKind.Failed);
  });

  test('generateJsSsr refuses a browser LinkedPlan', async () => {
    const linked = linkPlans(
      [],
      [],
      {
        environment: Environment.Browser,
        mode: BuildMode.Prod,
        strip: { exports: [], ctxName: [], regCtxName: [] },
      },
      { edges: {} },
      false
    );
    if (linked.kind !== LinkResultKind.Linked) {
      throw new Error('expected linked');
    }
    await expect(generateJsSsr(linked.plan, {})).rejects.toThrow('server LinkedPlan');
  });

  test('JSX outside any candidate fails closed — never react/jsx-runtime output', async () => {
    const plan = await analyseModule(
      {
        path: 'src/entry.tsx',
        code: 'render(<p>x</p>);',
      },
      { transpileTs: true }
    );
    expect(plan.kind).toBe(ModuleKind.Failed);
    expect(plan.diagnostics[0].code).toBe('unsupported-runtime-jsx');
  });

  test('a lowercase-named function returning JSX is not a component candidate', async () => {
    const plan = await analyseModule(
      {
        path: 'src/helper.tsx',
        code: 'export function makeNode() {\n  return <p>x</p>;\n}\n',
      },
      { transpileTs: true }
    );
    expect(plan.kind).toBe(ModuleKind.Qwik);
    expect(plan.diagnostics).toEqual([]);
    expect(plan.qrls.every((qrl) => qrl.boundary.kind !== BoundaryKind.Component)).toBe(true);
  });

  test('rejects a generator component function', async () => {
    await expect(
      analyseModule(
        {
          path: 'src/app.tsx',
          code: "import { component$ } from '@qwik.dev/core';\nexport const App = component$(function* App() { return <p />; });",
        },
        {}
      )
    ).rejects.toThrow('a generator component function');
  });

  test.each(['', 'export { Child as Renamed };', 'export default 42;'])(
    'discovers a local component without an exported component: %s',
    async (exports) => {
      const output = await transformModules({
        input: [
          {
            path: 'src/local.tsx',
            code: `import { component$ } from '@qwik.dev/core';
const Child = component$(() => <span>child</span>);
${exports}`,
          },
        ],
        isServer: true,
      });
      expect(output.diagnostics).toEqual([]);
      expect(output.modules[0].code).toContain('const Child = _markComponent((props, ctx) =>');
      expect(output.modules[0].code).not.toContain('export const Child');
      if (exports !== '') {
        expect(output.modules[0].code).toContain(exports);
      }
    }
  );

  test.each([
    "import { component$ } from '@qwik.dev/core';\nlet Child = component$(() => <span />);",
  ])(
    'rejects unsupported local declarations without discarding authored code: %s',
    async (code) => {
      await expect(analyseModule({ path: 'src/local.tsx', code }, {})).rejects.toThrow(
        'declared with "let"'
      );
    }
  );

  test('JSX outside functions in a component module fails loud', async () => {
    await expect(
      analyseModule(
        {
          path: 'src/mixed.tsx',
          code: "import { component$ } from '@qwik.dev/core';\nconst content = <p>x</p>;\nexport default component$(() => <p>Hello</p>);",
        },
        { transpileTs: true }
      )
    ).rejects.toThrow('JSX outside the discovered components');
  });

  test('event handlers preserve module binding references', async () => {
    await expect(
      analyseModule(
        {
          path: 'src/counter.tsx',
          code: "import { component$ } from '@qwik.dev/core';\nconst count = { value: 0 };\nexport default component$(() => {\n  return <button onClick$={() => count.value++}>go</button>;\n});\n",
        },
        { transpileTs: true }
      )
    ).resolves.toMatchObject({
      qrls: expect.arrayContaining([
        expect.objectContaining({ ctxName: 'onClick$', captures: [] }),
      ]),
    });
  });

  test('expressions preserve module binding references', async () => {
    await expect(
      analyseModule(
        {
          path: 'src/outer.tsx',
          code: 'import { component$ } from \'@qwik.dev/core\';\nconst title = "x";\nexport default component$(() => {\n  return <p>{title}</p>;\n});\n',
        },
        { transpileTs: true }
      )
    ).resolves.toMatchObject({
      qrls: expect.arrayContaining([
        expect.objectContaining({ payloadKind: 'value', captures: [] }),
      ]),
    });
  });

  test.each(['() => <b />', '() => { return <b />; }'])(
    'JSX in event handlers becomes a render value: %s',
    async (handler) => {
      await expect(
        analyseModule(
          {
            path: 'src/block.tsx',
            code: `import { component$ } from '@qwik.dev/core';
export default component$(() => <button onClick$={${handler}}>go</button>);`,
          },
          { transpileTs: true }
        )
      ).resolves.toMatchObject({
        qrls: expect.arrayContaining([
          expect.objectContaining({ boundary: { kind: 'implicit', role: 'jsx-value' } }),
        ]),
      });
    }
  );

  test('ordinary component setup calls retain authored JavaScript', async () => {
    const output = await transformModules({
      input: [
        {
          path: 'src/setup.tsx',
          code: "import { component$ } from '@qwik.dev/core';\nexport default component$((props) => { const x = props.compute(); return <p>{x.value}</p>; });",
        },
      ],
      isServer: true,
      transpileTs: true,
    });
    expect(output.diagnostics).toEqual([]);
    expect(output.modules[0].code).toContain('const x = props.compute();');
  });

  test('JSX inside a const initializer lowers to a render QRL', async () => {
    await expect(
      analyseModule(
        {
          path: 'src/setup.tsx',
          code: "import { component$ } from '@qwik.dev/core';\nexport default component$(() => { const x = <b>nested</b>; return <p>{x}</p>; });",
        },
        { transpileTs: true }
      )
    ).resolves.toMatchObject({ kind: ModuleKind.Qwik, diagnostics: [] });
  });

  test('a mixed return (ternary arm with JSX) is a component candidate', async () => {
    const plan = await analyseModule(
      {
        path: 'src/mixed.tsx',
        code: 'import { component$ } from \'@qwik.dev/core\';\nexport default component$((cond) => {\n  return cond ? <p>x</p> : "text";\n});\n',
      },
      { transpileTs: true }
    );
    expect(plan.kind).toBe(ModuleKind.Qwik);
  });

  test('invalid authored JSX (void-tag children) fails with a spanned diagnostic', async () => {
    const plan = await analyseModule(
      {
        path: 'src/bad.tsx',
        code: "import { component$ } from '@qwik.dev/core';\nexport default component$(() => {\n  return <p><br>x</br></p>;\n});\n",
      },
      { transpileTs: true }
    );
    expect(plan.kind).toBe(ModuleKind.Failed);
    expect(plan.diagnostics[0]).toMatchObject({
      code: 'invalid-void-children',
      message: 'The void element <br> cannot have children.',
    });
    expect(plan.diagnostics[0].span).not.toBeNull();
  });

  test('a parse failure analyses to a failed plan with diagnostics', async () => {
    const plan = await analyseModule(
      { path: 'src/broken.ts', code: 'const = ;' },
      { transpileTs: true }
    );
    expect(plan.kind).toBe(ModuleKind.Failed);
    expect(plan.diagnostics.length).toBeGreaterThan(0);
    expect(plan.diagnostics[0].category).toBe(DiagnosticCategory.Error);
  });
});

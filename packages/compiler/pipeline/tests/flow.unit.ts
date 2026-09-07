/**
 * End-to-end flow smoke: analyse → link → generate is wired through the compat wrapper, even while
 * the stage bodies are mocks. Foreign (non-Qwik) modules already flow to real output.
 */
import { describe, expect, test } from 'vitest';
import { analyseModule, generateJsSsr, linkPlans, transformModules } from '../index';
import {
  BuildMode,
  DiagnosticCategory,
  Environment,
  EntryKind,
  LinkResultKind,
  ModuleKind,
  PlanFormat,
} from '../schema';
import { serverSpecialization } from './fixtures';

describe('pipeline flow', () => {
  test.each([
    ['SSR', true],
    ['CSR', false],
  ] as const)('generated %s locals avoid authored bindings', async (_target, isServer) => {
    const output = await transformModules({
      input: [
        {
          path: 'src/component.tsx',
          code: `import { useSignal } from '@qwik.dev/core';
export default () => {
  const text0 = useSignal(0);
  return <p>{text0.value}</p>;
};
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
      { claims: [], policies: [], emissions: [] },
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
      { claims: [], policies: [], emissions: [] },
      true
    );
    expect(linked.kind).toBe(LinkResultKind.Failed);
  });

  test('generateJsSsr refuses a browser LinkedPlan', async () => {
    const linked = linkPlans(
      [],
      [],
      { environment: Environment.Browser, mode: BuildMode.Prod, stripExports: [] },
      { edges: {} },
      { claims: [], policies: [], emissions: [] },
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
        code: 'export default function main() {\n  return render(<p>x</p>);\n}\n',
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
    expect(plan.kind).toBe(ModuleKind.Failed);
    expect(plan.diagnostics[0].code).toBe('unsupported-runtime-jsx');
  });

  test('an Uppercased function returning JSX is a component candidate', async () => {
    await expect(
      analyseModule(
        {
          path: 'src/app.tsx',
          code: 'export function App() {\n  return <p>x</p>;\n}\n',
        },
        { transpileTs: true }
      )
    ).rejects.toThrow('a component declaration that is not an arrow function');
  });

  test.each(['', 'export { Child as Renamed };', 'export default 42;'])(
    'discovers a local component without an exported component: %s',
    async (exports) => {
      const output = await transformModules({
        input: [
          { path: 'src/local.tsx', code: `const Child = () => <span>child</span>;\n${exports}` },
        ],
        isServer: true,
      });
      expect(output.diagnostics).toEqual([]);
      expect(output.modules[0].code).toContain('const Child = (props, ctx) =>');
      expect(output.modules[0].code).not.toContain('export const Child');
      if (exports !== '') {
        expect(output.modules[0].code).toContain(exports);
      }
    }
  );

  test.each(['const value = 1, Child = () => <span />;', 'let Child = () => <span />;'])(
    'rejects unsupported local declarations without discarding authored code: %s',
    async (code) => {
      await expect(analyseModule({ path: 'src/local.tsx', code }, {})).rejects.toThrow(
        code.startsWith('const') ? 'sharing its declaration' : 'declared with "let"'
      );
    }
  );

  test('JSX in a non-component sibling of a component fails loud', async () => {
    await expect(
      analyseModule(
        {
          path: 'src/mixed.tsx',
          code: 'export function makeNode() {\n  return <p>x</p>;\n}\nexport default () => {\n  return <p>Hello</p>;\n};\n',
        },
        { transpileTs: true }
      )
    ).rejects.toThrow('JSX outside the discovered components');
  });

  test('event handlers capturing outer bindings fail loud', async () => {
    await expect(
      analyseModule(
        {
          path: 'src/counter.tsx',
          code: 'const count = { value: 0 };\nexport default () => {\n  return <button onClick$={() => count.value++}>go</button>;\n};\n',
        },
        { transpileTs: true }
      )
    ).rejects.toThrow('an event handler capturing "count"');
  });

  test('expressions capturing module bindings fail loud', async () => {
    await expect(
      analyseModule(
        {
          path: 'src/outer.tsx',
          code: 'const title = "x";\nexport default () => {\n  return <p>{title}</p>;\n};\n',
        },
        { transpileTs: true }
      )
    ).rejects.toThrow('an expression capturing "title"');
  });

  test.each(['() => <b />', '() => { return <b />; }'])(
    'JSX in event handlers remains unsupported: %s',
    async (handler) => {
      await expect(
        analyseModule(
          {
            path: 'src/block.tsx',
            code: `export default () => <button onClick$={${handler}}>go</button>;`,
          },
          { transpileTs: true }
        )
      ).rejects.toThrow('JSX inside an event handler');
    }
  );

  test('ordinary component setup calls retain authored JavaScript', async () => {
    const output = await transformModules({
      input: [
        {
          path: 'src/setup.tsx',
          code: 'export default (props) => { const x = props.compute(); return <p>{x.value}</p>; };',
        },
      ],
      isServer: true,
      transpileTs: true,
    });
    expect(output.diagnostics).toEqual([]);
    expect(output.modules[0].code).toContain('const x = props.compute();');
  });

  test('JSX inside a const initializer remains unsupported', async () => {
    await expect(
      analyseModule(
        {
          path: 'src/setup.tsx',
          code: 'export default () => { const x = <b>nested</b>; return <p>{x}</p>; };',
        },
        { transpileTs: true }
      )
    ).rejects.toThrow('JSX inside an expression value');
  });

  test('a mixed return (ternary arm with JSX) is a component candidate', async () => {
    await expect(
      analyseModule(
        {
          path: 'src/mixed.tsx',
          code: 'export default (cond) => {\n  return cond ? <p>x</p> : "text";\n};\n',
        },
        { transpileTs: true }
      )
    ).rejects.toThrow('a return value that is not a JSX element');
  });

  test('invalid authored JSX (void-tag children) fails with a spanned diagnostic', async () => {
    const plan = await analyseModule(
      {
        path: 'src/bad.tsx',
        code: 'export default () => {\n  return <p><br>x</br></p>;\n};\n',
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

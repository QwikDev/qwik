import type { TransformModuleInput, TransformModulesOptions } from '@qwik.dev/optimizer';
import { parseSync } from 'oxc-parser';
import { describe, expect, test } from 'vitest';
import { transformModules } from './index';
import { emitSsrSegmentRender } from './emit-ssr';
import type { RenderPlan, SegmentPlan } from './plan-types';

const options = (input: TransformModuleInput): TransformModulesOptions => ({
  input: [input],
  srcDir: 'src',
  sourceMaps: false,
  transpileTs: true,
  transpileJsx: true,
  isServer: true,
});

describe('SSR output', () => {
  test('emits the direct SSR Suspense ABI without compiler-owned range markup', async () => {
    const result = await transformModules(
      options({
        path: 'src/suspense.tsx',
        code: `import { Suspense } from '@qwik.dev/core';
import { AsyncContent } from './async-content';
export function App({ delay }) {
  return <main><Suspense fallback$={() => <i>wait</i>} delay={delay}><AsyncContent /></Suspense></main>;
}`,
      })
    );
    const main = result.modules[0]?.code ?? '';

    expect(result.diagnostics).toEqual([]);
    expect(parseSync('suspense.js', main, { lang: 'js', sourceType: 'module' }).errors).toEqual([]);
    expect(main).toMatch(/createSsrSuspense\(ctx, suspenseId\d+, q_[\w$]+, q_[\w$]+, delay\)/);
    expect(main).not.toContain("createSsrRecord('<!s='");
    expect(main).not.toContain('<q-s');
    expect(main).not.toContain('Reveal');
    expect(result.modules.map((module) => module.code).join('\n')).not.toContain('<Suspense');
  });

  test('emits a local JSX fallback QRL', async () => {
    const result = await transformModules(
      options({
        path: 'src/local-fallback.tsx',
        code: `import { $, Suspense } from '@qwik.dev/core';
export function App() {
  const fallback = $(() => <i>wait</i>);
  return <Suspense fallback$={fallback}><span>content</span></Suspense>;
}`,
      })
    );
    const output = result.modules.map((module) => module.code).join('\n');

    expect(result.diagnostics).toEqual([]);
    expect(output).toContain('createSsrSuspense');
    expect(output).toContain('return "<i>wait</i>"');
    expect(output).not.toContain('<Suspense');
  });

  test('preserves conditional local fallback QRL selection', async () => {
    const result = await transformModules(
      options({
        path: 'src/conditional-fallback.tsx',
        code: `import { $, Suspense } from '@qwik.dev/core';
export function App({ first }) {
  const fallback = first ? $(() => <i>first</i>) : $(() => <b>second</b>);
  return <Suspense fallback$={fallback}><span>content</span></Suspense>;
}`,
      })
    );
    const output = result.modules.map((module) => module.code).join('\n');

    expect(result.diagnostics).toEqual([]);
    for (const module of result.modules) {
      expect(
        parseSync(module.path, module.code, { lang: 'js', sourceType: 'module' }).errors
      ).toEqual([]);
    }
    expect(result.modules[0]?.code).toMatch(/createSsrSuspense\([^;]+, fallback, 0\)/);
    expect(output).toContain('return "<i>first</i>"');
    expect(output).toContain('return "<b>second</b>"');
  });

  test('lowers a local JSX value containing Suspense', async () => {
    const result = await transformModules(
      options({
        path: 'src/local-suspense.tsx',
        code: `import { Suspense } from '@qwik.dev/core';
export function App() {
  const view = <Suspense fallback$={() => <i>wait</i>}><b>ready</b></Suspense>;
  return <main>{view}</main>;
}`,
      })
    );
    const output = result.modules.map((module) => module.code).join('\n');

    expect(result.diagnostics).toEqual([]);
    for (const module of result.modules) {
      expect(
        parseSync(module.path, module.code, { lang: 'js', sourceType: 'module' }).errors
      ).toEqual([]);
    }
    expect(output).toContain('createSsrSuspense');
    expect(output).not.toContain('<Suspense');
  });

  test('renders parser-sensitive Suspense content in order', async () => {
    const result = await transformModules(
      options({
        path: 'src/table-suspense.tsx',
        code: `import { Suspense } from '@qwik.dev/core';
export function App() {
  return <table><Suspense fallback$={() => <tbody />}><tbody><tr><td>ready</td></tr></tbody></Suspense></table>;
}`,
      })
    );
    const main = result.modules[0]?.code ?? '';

    expect(result.diagnostics).toEqual([]);
    expect(main).toContain('<table><tbody><tr><td>ready</td></tr></tbody></table>');
    expect(main).not.toContain('createSsrSuspense');
  });

  test('renders Suspense inside template content in order', async () => {
    const result = await transformModules(
      options({
        path: 'src/template-suspense.tsx',
        code: `import { Suspense } from '@qwik.dev/core';
export function App() {
  return <template><Suspense fallback$={() => <i>wait</i>}><b>ready</b></Suspense></template>;
}`,
      })
    );
    const main = result.modules[0]?.code ?? '';

    expect(result.diagnostics).toEqual([]);
    expect(main).toContain('<template><b>ready</b></template>');
    expect(main).not.toContain('createSsrSuspense');
  });

  test('passes an in-order context through parser-sensitive components', async () => {
    const result = await transformModules(
      options({
        path: 'src/svg-suspense.tsx',
        code: `import { Suspense } from '@qwik.dev/core';
function Icon() {
  return <Suspense fallback$={() => <circle />}><circle /></Suspense>;
}
export function App() {
  return <svg><Icon /></svg>;
}`,
      })
    );
    const output = result.modules.map((module) => module.code).join('\n');

    expect(result.diagnostics).toEqual([]);
    expect(output).toContain('Icon(props, ctx.inOrder())');
    expect(output).toContain('createSsrSuspense');
  });

  test('does not import createSsrSuspense without a Suspense boundary', async () => {
    const result = await transformModules(
      options({ path: 'src/plain.tsx', code: `export function App() { return <p>ready</p>; }` })
    );

    expect(result.modules[0]?.code).not.toContain('createSsrSuspense');
  });

  test('emits a typed context-scope marker', async () => {
    const result = await transformModules(
      options({
        path: 'src/context.tsx',
        code: `import { useContextProvider } from '@qwik.dev/core';
const Context = { id: 'context' };
export function App() {
  useContextProvider(Context, 'value');
  return <p>Provided</p>;
}
`,
      })
    );
    const main = result.modules[0]?.code ?? '';

    expect(parseSync('context.js', main, { lang: 'js', sourceType: 'module' }).errors).toEqual([]);
    expect(main).toContain('createSsrRecord');
    // The scope is read into a local while the provider's invoke context is still active, because
    // the marker itself is emitted after the children resolve.
    expect(main).toContain('const contextScope0 = ctx.contextScopeRef();');
    expect(main).toContain("createSsrRecord('<!c=', contextScope0, '>')");
    expect(main).not.toContain('maybeThen');
    expect(main).toContain('createSsrElementRecord("p", "<p", ">")');
    expect(main).toContain('"Provided</p><!/c>"');
    expect(main).not.toContain('contextScopeId');
  });

  test('composes typed event records with nested For output', async () => {
    const result = await transformModules(
      options({
        path: 'src/structured.tsx',
        code: `import { useSignal } from '@qwik.dev/core';
export function App() {
  const count = useSignal(0);
  const rows = useSignal([{ id: 'a', label: 'Alpha' }]);
  return (
    <button onClick$={() => count.value++}>
      {rows.value.map((row) => <span key={row.id}>{row.label}</span>)}
    </button>
  );
}
`,
      })
    );
    const main = result.modules[0]?.code ?? '';
    const row = result.modules.find((module) => module.path.includes('_for_render_'))?.code ?? '';

    expect(parseSync('structured.js', main, { lang: 'js', sourceType: 'module' }).errors).toEqual(
      []
    );
    expect(main).toContain('renderSsrCollection');
    expect(main).toMatch(/renderSsrCollection\(ctx, [^,]+, rows,/);
    expect(main).not.toContain('renderSsrForBlock');
    expect(main).not.toContain('semantic_collectionSource_');
    expect(main).not.toContain('_wrapArray(');
    expect(main).toMatch(/createSsrElementRecord\("button", "<button", ctx\.eventAttr\(/);
    expect(main).toMatch(/createSsrRecord\('<!f=', createSsrNodeId\(/);
    expect(main).not.toContain('[object Object]');
    expect(main).not.toMatch(/ctx\.eventAttr\([^;]+\s\+\s/);
    expect(main).not.toContain('ctx.addRoot(count)');
    expect(row).toContain(' q:row');
    expect(row).not.toContain("'<!r='");
  });

  test('starts potentially async sibling renders sequentially without forcing a Promise', async () => {
    const result = await transformModules(
      options({
        path: 'src/sequential.tsx',
        code: `import { First, Second } from './children';
export function App() {
  return <main><First /><Second /></main>;
}
`,
      })
    );
    const main = result.modules[0]?.code ?? '';

    expect(parseSync('sequential.js', main, { lang: 'js', sourceType: 'module' }).errors).toEqual(
      []
    );
    expect(main).toMatch(/const component0 = createComponent\(/);
    expect(main).toMatch(/const invokeCtx\d+ = getActiveInvokeContextOrNull\(\)/);
    expect(main).toMatch(
      /const component1 = \(\) => invoke\(invokeCtx\d+, \(\) => \{\s+return createComponent\(/
    );
    expect(main).toMatch(
      /maybeThen\(component0, \(component0\) => maybeThen\(component1\(\), \(component1\) =>/
    );
    expect(main).not.toContain('promiseAll');
    expect(main).not.toContain('Promise.all');
    expect(main).not.toMatch(/async \([^)]*\) =>/);
  });

  test('imports record helpers for event-only output', async () => {
    const result = await transformModules(
      options({
        path: 'src/event-only.tsx',
        code: `export function App() {
  return <button onClick$={() => undefined}>Save</button>;
}
`,
      })
    );
    const main = result.modules[0]?.code ?? '';

    expect(parseSync('event-only.js', main, { lang: 'js', sourceType: 'module' }).errors).toEqual(
      []
    );
    expect(main).toMatch(/import \{[^}]*createSsrElementRecord[^}]*\} from/);
    expect(main).toContain('createSsrElementRecord("button", "<button"');
    expect(main).not.toContain('q:id');
    expect(main).not.toContain('maybeThen');
  });

  test('normalizes static DOM attributes and emits direct innerHTML values', async () => {
    const result = await transformModules(
      options({
        path: 'src/inner-html.tsx',
        code: `export function App() {
  return <label className="field" htmlFor="input" dangerouslySetInnerHTML="Name" />;
}
`,
      })
    );
    const main = result.modules[0]?.code ?? '';

    expect(parseSync('inner-html.js', main, { lang: 'js', sourceType: 'module' }).errors).toEqual(
      []
    );
    expect(main).toContain(
      'createSsrElementRecord("label", "<label class=\\"field\\" for=\\"input\\"", ">")'
    );
    expect(main).toContain('"Name</label>"');
    expect(main).not.toContain('.innerHTML');
  });

  test('emits a fully static component without a useOn carrier', async () => {
    const result = await transformModules(
      options({
        path: 'src/nested.tsx',
        code: `export function App() {
  return <main><h1>Hello</h1><p>Qwik</p></main>;
}
`,
      })
    );
    const main = result.modules[0]?.code ?? '';

    expect(main).not.toContain('createSsrElementRecord(');
    expect(main).toContain('return "<main><h1>Hello</h1><p>Qwik</p></main>";');
  });

  test('coerces initial-only text without an emitted closure', async () => {
    const result = await transformModules(
      options({
        path: 'src/local.tsx',
        code: `export function App() {
  const local = { value: 'ready' };
  return <p>{local.value}</p>;
}
`,
      })
    );
    const main = result.modules[0]?.code ?? '';

    expect(main).toContain("escapeHTML(String((local.value) ?? ''))");
    expect(main).not.toContain('((value) =>');
  });

  test('imports the escaping helper used by dynamic attributes', async () => {
    const result = await transformModules(
      options({
        path: 'src/dynamic-attribute.tsx',
        code: `export function App({ id }) {
  return <button id={id}>Save</button>;
}
`,
      })
    );
    const main = result.modules[0]?.code ?? '';

    expect(
      parseSync('dynamic-attribute.js', main, { lang: 'js', sourceType: 'module' }).errors
    ).toEqual([]);
    expect(main).toMatch(/import \{[^}]*escapeHTML[^}]*\} from/);
    expect(main).toContain('escapeHTML(attr');
  });

  test('emits a typed row marker around a non-element row root', () => {
    const imports = new Set<string>();
    const emitted = emitSsrSegmentRender(
      createForRenderSegment(createTextPlan('row')),
      '',
      imports
    );

    expect(emitted?.value).toBe(
      `[createSsrRecord('<!r=', createSsrNodeId(rowId), '>'), "row<!/r>"]`
    );
    expect(emitted?.runtimeParameters).toEqual(['ctx', '__rangeId', 'rowId']);
    expect(imports).toEqual(new Set(['createSsrRecord', 'createSsrNodeId']));
  });

  test('emits a typed slot marker inside the existing async chain', () => {
    const imports = new Set<string>();
    const emitted = emitSsrSegmentRender(
      createRenderSegment('slotRender', 'slot', {
        roots: [
          {
            kind: 'component',
            range: [0, 5],
            tagRange: [0, 5],
            bindingId: null,
            blockingSuspense: false,
            lifetimeId: 0,
            props: [],
            propsSource: null,
            slots: [],
          },
        ],
        effects: [],
      }),
      'Child',
      imports
    );

    expect(emitted?.value).toBe(
      `maybeThen(component0, (component0) => [createSsrRecord('<!s=', createSsrNodeId(rangeId), '>'), component0, "<!/s>"])`
    );
    expect(emitted?.value.match(/maybeThen/g)).toHaveLength(1);
    expect(imports).toEqual(
      new Set(['createComponent', 'createSsrRecord', 'createSsrNodeId', 'maybeThen'])
    );
  });
});

function createTextPlan(value: string): RenderPlan {
  return {
    roots: [{ kind: 'static-text', value, range: [0, 0] }],
    effects: [],
  };
}

function createForRenderSegment(render: RenderPlan): SegmentPlan {
  return createRenderSegment('forRender', 'collection-row', render);
}

function createRenderSegment(
  kind: 'forRender' | 'slotRender',
  renderKind: 'collection-row' | 'slot',
  render: RenderPlan
): SegmentPlan {
  return {
    id: 'for_render',
    symbolName: 'for_render',
    parentId: null,
    kind,
    ctxName: 'ctx',
    qrl: null,
    payload: 'value',
    range: [0, 0],
    functionRange: [0, 0],
    calleeRange: null,
    argumentRanges: [],
    paramRanges: [],
    parameterBindingIds: [],
    usedParameterBindingIds: [],
    bodyRange: [0, 0],
    bodyKind: 'expression',
    propsParts: [],
    async: false,
    awaits: [],
    captures: [],
    moduleReferences: [],
    references: [],
    visibleTaskStrategy: null,
    lifetimeId: 0,
    render: {
      kind: renderKind,
      collectionSourceKind: renderKind === 'collection-row' ? 'direct-reactive' : null,
      range: [0, 0],
      segmentId: 'for_render',
      lifetimeId: 0,
      async: false,
      setup: [],
      parameterBindingIds: [],
      referenceBindingIds: [],
      render,
      lifecycleSegmentIds: [],
    },
  };
}

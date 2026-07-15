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
    expect(main).toContain("createSsrRecord('<!c=', ctx.contextScopeRef(), '>')");
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
            lifetimeId: 0,
            props: [],
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

import { describe, expect, test } from 'vitest';
import { transformModules } from './index';
import { createSegmentSourceIdentity } from './segment-identity';
import { format as formatCode } from 'prettier';
import { posix } from 'node:path';
import type {
  TransformModuleInput,
  TransformModulesOptions,
  TransformOutput,
} from '@qwik.dev/optimizer';

interface TestInput {
  code: string;
  path?: string;
}

const baseOptions = (input: TransformModuleInput, isServer: boolean): TransformModulesOptions => ({
  input: [input],
  srcDir: 'src',
  sourceMaps: false,
  transpileTs: true,
  transpileJsx: true,
  isServer,
});

async function testInput(snapshotName: string, input: TestInput) {
  const moduleInput = {
    path: input.path ?? 'src/component.tsx',
    code: input.code,
  };
  const ssr = await transformModules(baseOptions(moduleInput, true));
  const csr = await transformModules(baseOptions(moduleInput, false));
  assertGeneratedModuleGraph(ssr);
  assertGeneratedModuleGraph(csr);
  await expect(await snapshotResult(input.code, { ssr, csr })).toMatchFileSnapshot(
    `./snapshots/${snapshotName}.snap`
  );
  return { ssr, csr };
}

function assertGeneratedModuleGraph(result: TransformOutput): void {
  if (result.modules.length < 2) {
    return;
  }
  const paths = new Set(result.modules.map((module) => posix.normalize(module.path)));
  const edges = new Map<string, Set<string>>();
  for (const module of result.modules) {
    const from = posix.normalize(module.path);
    const imports = edges.get(from) ?? new Set<string>();
    const pattern = /(?:from\s+|import\s*\()(['"])(\.\/[^'"]+)\1/g;
    for (const match of module.code.matchAll(pattern)) {
      const resolved = posix.normalize(posix.join(posix.dirname(from), match[2]));
      const target = paths.has(resolved)
        ? resolved
        : paths.has(`${resolved}.js`)
          ? `${resolved}.js`
          : null;
      if (target !== null) {
        imports.add(target);
      } else if (/\.[cm]?[jt]sx?_/.test(match[2])) {
        throw new Error(`Generated import ${match[2]} from ${module.path} has no module.`);
      }
    }
    edges.set(from, imports);
  }
  const reachable = new Set<string>();
  const queue = [posix.normalize(result.modules[0].path)];
  while (queue.length > 0) {
    const path = queue.pop()!;
    if (reachable.has(path)) {
      continue;
    }
    reachable.add(path);
    queue.push(...(edges.get(path) ?? []));
  }
  const emittedCode = result.modules.map((module) => module.code).join('\n');
  for (const module of result.modules.slice(1)) {
    // v2-parity ssr: chunkless segments are declared by symbol (`_noopQrl("sym")`), so their
    // chunk files carry metadata only and are intentionally unreferenced
    const declaredBySymbol =
      module.segment?.name !== undefined &&
      emittedCode.includes(`_noopQrl(${JSON.stringify(module.segment.name)})`);
    if (declaredBySymbol) {
      continue;
    }
    expect(reachable.has(posix.normalize(module.path)), `${module.path} is orphaned`).toBe(true);
  }
}

async function snapshotResult(
  code: string,
  result: { ssr: TransformOutput; csr: TransformOutput }
) {
  let output = `==INPUT==\n\n${code}`;

  output += await snapshotTransformOutput('SSR', result.ssr);
  output += await snapshotTransformOutput('CSR', result.csr);
  return output;
}

async function snapshotTransformOutput(label: string, result: TransformOutput) {
  let output = `\n== ${label} OUTPUT ==\n`;

  for (const module of result.modules) {
    const isEntry = module.isEntry ? '(ENTRY POINT)' : '';
    const code = await formatSnapshotCode(module.code);
    output += `\n============================= ${module.path} ${isEntry}==\n\n${code}`;
    if (module.map) {
      output += `\n\n${module.map}`;
    }
    if (module.segment) {
      output += `\n/*\n${JSON.stringify(module.segment, null, 2)}\n*/`;
    }
  }

  output += `\n== ${label} DIAGNOSTICS ==\n\n${JSON.stringify(result.diagnostics, null, 2)}`;
  return output;
}

async function formatSnapshotCode(code: string) {
  if (!code.trim()) {
    return code;
  }
  try {
    return (
      await formatCode(code, {
        parser: 'babel',
        printWidth: 100,
        singleQuote: true,
        trailingComma: 'es5',
      })
    ).trimEnd();
  } catch {
    return code;
  }
}

describe('transformModules', () => {
  test('sourcemap sources resolve from the emitted module location', async () => {
    // Nested and srcDir-external paths: resolving `sources[0]` against the map's own
    // directory must land back on the input file (debugger breakpoint matching).
    for (const path of [
      'src/routes/index.tsx',
      '../../compiler/pipeline/generate/x.tsx',
      'src/lib/util.ts',
    ]) {
      const result = await transformModules({
        ...baseOptions(
          {
            path,
            code: path.endsWith('.ts')
              ? 'export const n: number = 1;\n'
              : 'export default () => {\n  return <p>x</p>;\n};\n',
          },
          true
        ),
        sourceMaps: true,
      });
      for (const module of result.modules) {
        if (module.map === null) {
          continue;
        }
        const sources = JSON.parse(module.map).sources as string[];
        expect(sources).toHaveLength(1);
        expect(posix.normalize(posix.join(posix.dirname(module.path), sources[0]))).toBe(
          posix.normalize(path)
        );
      }
    }
  });

  test('creates globally unique segment identities', async () => {
    const code = `import { useTask$ } from '@qwik.dev/core';

export function Child() {
  return <button onClick$={() => 'clicked'}>Child</button>;
}

export function App() {
  useTask$(() => 'first');
  useTask$(() => 'second');
  return <Child />;
}
`;
    const inputs = ['src/a/index.tsx', 'src/b/index.tsx'].map((path) => ({ path, code }));
    const transform = (input: TransformModuleInput, isServer: boolean) =>
      transformModules(baseOptions(input, isServer));
    const [aSsr, bSsr, aCsr, bCsr] = await Promise.all([
      transform(inputs[0], true),
      transform(inputs[1], true),
      transform(inputs[0], false),
      transform(inputs[1], false),
    ]);
    const getSegments = (results: TransformOutput[]) =>
      results.flatMap((result) => result.modules.flatMap((module) => module.segment ?? []));
    const ssrSegments = getSegments([aSsr, bSsr]);
    const csrSegments = getSegments([aCsr, bCsr]);

    expect(createSegmentSourceIdentity('src/a/../a/index.tsx')).toBe(
      createSegmentSourceIdentity('src\\a\\index.tsx')
    );
    expect(ssrSegments).toHaveLength(8);
    expect(new Set(ssrSegments.map((segment) => segment.name)).size).toBe(ssrSegments.length);
    expect(new Set(ssrSegments.map((segment) => segment.hash)).size).toBe(ssrSegments.length);
    expect(new Set(ssrSegments.map((segment) => segment.canonicalFilename)).size).toBe(
      ssrSegments.length
    );
    expect(ssrSegments.map((segment) => segment.name).sort()).toEqual(
      csrSegments.map((segment) => segment.name).sort()
    );
    for (const segment of [...ssrSegments, ...csrSegments]) {
      expect(segment.name).toBe(`${segment.displayName}_${segment.hash}`);
    }
    const scoped = await transformModules({
      ...baseOptions(inputs[0], false),
      scope: 'other-package',
    });
    expect(getSegments([scoped]).map((segment) => segment.name)).not.toEqual(
      getSegments([aCsr]).map((segment) => segment.name)
    );

    const separateDomains = await transformModules(
      baseOptions(
        {
          path: 'src/x.tsx',
          code: `import { Foo$ } from './foo';
export function Fooqrl_segment_0() {
  return <p>Child</p>;
}
export function App() {
  Foo$(() => 'value');
  return <Fooqrl_segment_0 />;
}`,
        },
        false
      )
    );
    expect(separateDomains.diagnostics).toEqual([]);
    const domainSegments = getSegments([separateDomains]);
    expect(domainSegments).toHaveLength(2);
    expect(new Set(domainSegments.map((segment) => segment.name)).size).toBe(domainSegments.length);

    const duplicate = await transformModules({
      ...baseOptions(inputs[0], false),
      input: [inputs[0], inputs[0]],
    });
    expect(duplicate.diagnostics).toContainEqual(
      expect.objectContaining({ code: 'duplicate-segment', category: 'error' })
    );
  });

  test('passes through modules without components', async () => {
    await testInput('module_without_component', {
      path: 'src/plain.ts',
      code: `const value: number = 1;
export default value;
`,
    });
  });

  test('simple function component', async () => {
    await testInput('simple_function_component', {
      code: `export function App() {
  return <main>Qwik</main>;
}
`,
    });
  });

  test('simple const component', async () => {
    await testInput('simple_const_component', {
      code: `export const App = () => {
  return <main>Qwik</main>;
}
`,
    });
  });

  test('local components compile at every nesting level', async () => {
    const { ssr, csr } = await testInput('local_component', {
      code: `import { useStore } from '@qwik.dev/core';

export function App() {
  const todos = useStore({ filter: 'all' });
  function Filter({ name }: { name: string }) {
    const lower = name.toLowerCase();
    function Star({ on }: { on: boolean }) {
      return <b class={{ on: on && todos.filter == lower }}>*</b>;
    }
    return (
      <li>
        <a onClick$={() => { todos.filter = lower; }}>
          <Star on={true} />
          {name.toUpperCase()}
        </a>
      </li>
    );
  }
  return <ul><Filter name="All" /></ul>;
}
`,
    });
    for (const result of [ssr, csr]) {
      const entry = result.modules.find((module) => module.path === 'src/component.tsx');
      expect(entry).toBeDefined();
      // both levels compile in place — no raw JSX or $-props survive into the emitted module
      expect(entry!.code).not.toContain('<Star');
      expect(entry!.code).not.toContain('onClick$');
    }
    const ssrEntry = ssr.modules.find((module) => module.path === 'src/component.tsx')!;
    // synthesized props params are unique per nesting level: captures resolve lexically
    expect(ssrEntry.code).toContain('function Filter(props0, ctx)');
    expect(ssrEntry.code).toContain('function Star(props1, ctx)');
    const csrEntry = csr.modules.find((module) => module.path === 'src/component.tsx')!;
    expect(csrEntry.code).toContain('function Filter(props, ctx)');
    expect(csrEntry.code).toContain('function Star(props, ctx)');
  });

  test('simple default function component', async () => {
    await testInput('simple_default_function_component', {
      code: `export default function App() {
  return <main>Qwik</main>;
}
`,
    });
  });

  test('anonymous default arrow component', async () => {
    await testInput('default_arrow', {
      code: `export default () => <section>Default arrow</section>;
`,
    });
  });

  test('expression-body fragment component', async () => {
    await testInput('static_arrow_fragment', {
      code: `export const App = () => (
  <>
    <h1>Hello</h1>
    <p className="copy">Qwik</p>
  </>
);
`,
    });
  });

  test('component with signal', async () => {
    await testInput('component_with_signal', {
      code: `import { useSignal } from '@qwik.dev/core';
  export function App() {
      const count = useSignal(0);
  return <button>{count.value}</button>;
}
`,
    });
  });

  test('component with renamed signal', async () => {
    await testInput('component_with_renamed_signal', {
      code: `import { useSignal as signal } from '@qwik.dev/core';
  export function App() {
      const count = signal(0);
  return <button>{count.value}</button>;
}
`,
    });
  });

  test('preserves an identifier props parameter', async () => {
    await testInput('component_props_identifier', {
      code: `export function App(input: { value: string }) {
  return <button onClick$={() => input.value}>Save</button>;
}
`,
    });
  });

  test('destructures an object props parameter', async () => {
    await testInput('component_props_destructured', {
      code: `export function App({ label: text, count = 0, ...rest } = { label: 'Save' }) {
  return <button onClick$={() => [text, count, rest]}>Save</button>;
}
`,
    });
  });

  test('renders an identifier props value as text', async () => {
    await testInput('component_props_text', {
      code: `export function App(props: { label: string }) {
  return <p>{props.label}</p>;
}
`,
    });
  });

  test('renders conditional and logical props values as text', async () => {
    await testInput('component_props_branch_text', {
      code: `export function Conditional(props: { enabled: boolean }) {
  return <p>{props.enabled ? 'On' : 'Off'}</p>;
}

export function Logical(props: { label?: string }) {
  return <p>{props.label ?? 'Fallback'}</p>;
}
`,
    });
  });

  test('renders an identifier props value as an attribute', async () => {
    await testInput('component_props_attribute', {
      code: `export function App(props: { title: string }) {
  return <button title={props.title}>Save</button>;
}
`,
    });
  });

  test('renders conditional and logical props values as attributes', async () => {
    await testInput('component_props_branch_attribute', {
      code: `export function Conditional(props: { enabled: boolean }) {
  return <button title={props.enabled ? 'On' : 'Off'}>Save</button>;
}

export function Logical(props: { label?: string }) {
  return <button aria-label={props.label ?? 'Fallback'}>Save</button>;
}
`,
    });
  });

  test('renders a props call expression as an attribute', async () => {
    await testInput('component_props_call_attribute', {
      code: `export function App(props: { label: string }) {
  return <button title={props.label.toUpperCase()}>Save</button>;
}
`,
    });
  });

  test('renders a direct function call as a JSX child', async () => {
    await testInput('component_call_child', {
      code: `import { renderItem } from './render-item';

export function App(props: { value: string }) {
  return <section><b>Before</b>{renderItem(props.value)}<i>After</i></section>;
}
`,
    });
  });

  test('renders conditional function calls as a JSX branch', async () => {
    await testInput('component_branch_call', {
      code: `import { renderActive, renderInactive } from './renderers';

export function App(props: { enabled: boolean; value: string }) {
  return <section><b>Before</b>{props.enabled ? renderActive(props.value) : renderInactive(props.value)}<i>After</i></section>;
}
`,
    });
  });

  test('renders JSX and nested logical branches', async () => {
    await testInput('component_branch_jsx', {
      code: `export function App(props: { enabled: boolean; alternate: boolean }) {
  return (
    <main>
      {props.enabled ? <strong>On</strong> : <em>Off</em>}
      {props.enabled && <>{props.alternate ? <span>A</span> : <span>B</span>}<i>Tail</i></>}
      {props.enabled ? null : <small>Disabled</small>}
    </main>
  );
}
`,
    });
  });

  test('passes an event prop to a native element', async () => {
    await testInput('component_props_event', {
      code: `import type { QRL } from '@qwik.dev/core';

export function App(props: { onClick$: QRL<() => void> }) {
  return <button onClick$={props.onClick$}>Save</button>;
}
`,
    });
  });

  test('spreads props onto a native element', async () => {
    await testInput('component_props_spread', {
      code: `export function App(props: { title: string; hidden: boolean }) {
  return <button {...props}>Save</button>;
}
`,
    });
  });

  test('spreads props returned by a call expression', async () => {
    await testInput('component_props_call_spread', {
      code: `export function App(props: { getAttrs: () => { title: string } }) {
  return <button {...props.getAttrs()}>Save</button>;
}
`,
    });
  });

  test('spreads props selected by conditional and logical expressions', async () => {
    await testInput('component_props_branch_spread', {
      code: `export function Conditional(props: { enabled: boolean; active: object; inactive: object }) {
  return <button {...(props.enabled ? props.active : props.inactive)}>Conditional</button>;
}

export function Logical(props: { attrs: object | null }) {
  return <button {...(props.attrs ?? {})}>Logical</button>;
}
`,
    });
  });

  test('preserves static attribute overrides around a spread', async () => {
    await testInput('component_props_spread_override', {
      code: `export function App(props: { title: string; hidden: boolean }) {
  return <button title="before" data-before="base" {...props} title="after" hidden={false} data-after="final">Save</button>;
}
`,
    });
  });

  test('preserves source order across multiple dynamic spreads', async () => {
    await testInput('component_props_multiple_spreads', {
      code: `export function App(props: { base: object; overrides: object }) {
  return <button title="before" {...props.base} hidden {...props.overrides} title="after">Save</button>;
}
`,
    });
  });

  test('spreads an object literal onto a native element', async () => {
    await testInput('component_object_spread', {
      code: `export function App() {
  return <button title="before" {...{ title: 'spread', hidden: true }} {...{ 'aria-disabled': false }} title="after" hidden={false}>Save</button>;
}
`,
    });
  });

  test('keeps a dynamic object literal spread reactive', async () => {
    await testInput('component_dynamic_object_spread', {
      code: `export function App(props: { title: string }) {
  return <button {...{ title: props.title }}>Save</button>;
}
`,
    });
  });

  test('classifies component props between inline and the componentProps segment', async () => {
    await testInput('component_computed_props', {
      code: `import { $, useSignal } from '@qwik.dev/core';
import { Child, IMPORTED } from './child';

export function App() {
  const selected = useSignal(1);
  const CONST = 10;
  return <main>
    <Child a="static" b={selected} c={selected.value} />
    <Child active={selected.value === 1} label={'#' + selected.value} />
    <Child initial={CONST * 2} imported={IMPORTED + 1} />
    <Child qrl={$(() => selected.value)} onPick$={() => selected.value++} />
    {[1, 2].map((value) => (
      <Child key={value} value={value} active={selected.value === value} />
    ))}
  </main>;
}
`,
    });
  });

  test('creates reactive props proxies only for dynamic component spreads', async () => {
    await testInput('component_reactive_spread_props', {
      code: `import { useSignal } from '@qwik.dev/core';
import { Child, createAttrs, importedAttrs } from './child';

export function App() {
  const count = useSignal(1);
  const attributes = useSignal({ title: 'spread' });
  return <main>
    <Child {...importedAttrs} />
    <Child count={count.value} />
    <Child {...attributes.value} />
    <Child title="before" {...attributes.value} count={count.value} title="after" onClick$={() => count.value++} />
    <Child {...createAttrs(count.value)} />
  </main>;
}
`,
    });
  });

  test('renders a local member expression as text', async () => {
    await testInput('component_local_text', {
      code: `export function App() {
  const local = { value: 'Hello' };
  return <p>{local.value}</p>;
}
`,
    });
  });

  test('renders grouped text expressions', async () => {
    await testInput('component_text_expressions', {
      code: `export function App(props: { count: number; label: string; hidden: boolean }) {
  return <p>{props.count + 1} {\`Hello \${props.label}\`} {!props.hidden}</p>;
}
`,
    });
  });

  test('simple component with attributes', async () => {
    await testInput('simple_component_with_attributes', {
      code: `export function App() {
  return <main className="shell" hidden={true}></main>;
}
`,
    });
  });

  test('normalizes static and dynamic className attributes', async () => {
    await testInput('component_class_name', {
      code: `import { useSignal } from '@qwik.dev/core';
export function App() {
  const classes = useSignal('active');
  return <main className="shell"><button className={classes.value}>Toggle</button></main>;
}
`,
    });
  });

  test('ignores static and dynamic key attributes', async () => {
    await testInput('component_key_attribute', {
      code: `import { useSignal } from '@qwik.dev/core';
export function App() {
  const itemKey = useSignal('dynamic');
  return <main key="static"><button key={itemKey.value}>Button</button></main>;
}
`,
    });
  });

  test('serializes null and boolean attributes', async () => {
    await testInput('component_null_attribute', {
      code: `export function App() {
  return <main title={null} hidden={false} aria-hidden={false} aria-busy={true} draggable={false}>Qwik</main>;
}
`,
    });
  });

  test('simple component with nested elements', async () => {
    await testInput('simple_component_nested_elements', {
      code: `export function App() {
  return <main className="shell" hidden={true}><h1 aria-label="Hello">Hello</h1><p>Qwik</p></main>;
}
`,
    });
  });

  test('supports void elements', async () => {
    await testInput('component_void_elements', {
      code: `export function App() {
  return <main><input disabled /><br /><img src="/logo.png" alt="Qwik" /></main>;
}
`,
    });
  });

  test('simple component with fragment', async () => {
    await testInput('static_component_fragment', {
      code: `export const App = () => {
  return (
    <>
      <h1>Hello</h1>
      <>
        <p className="copy">Qwik</p>
      </>
    </>
  )
};
`,
    });
  });

  test('simple component with fragment and single child', async () => {
    await testInput('static_single_child_fragment', {
      code: `export const App = () => (
  <>
    <span>One</span>
  </>
);
`,
    });
  });

  test('component with signal as attribute', async () => {
    await testInput('component_with_signal_attribute', {
      code: `import { useSignal } from '@qwik.dev/core';
  export function App() {
      const count = useSignal(0);
  return <button test={count.value}>Click</button>;
}
`,
    });
  });

  test('component with context and signal', async () => {
    await testInput('component_with_context_and_signal', {
      code: `import { createContextId } from '@qwik.dev/core';
import { useContextProvider, useSignal, type Signal } from '@qwik.dev/core';

export const App = () => {
  const contextId = createContextId<Signal<string>>('context');
  const source: Signal<string> = useSignal('hello');
  useContextProvider(contextId, source);
  return <p>{source.value}</p>;
};
`,
    });
  });

  test('component with multiple context providers', async () => {
    await testInput('component_with_multiple_context_providers', {
      code: `import { createContextId } from '@qwik.dev/core';
import { useContextProvider } from '@qwik.dev/core';

export function App() {
  const firstContext = createContextId<string>('first');
  const secondContext = createContextId<number>('second');
  useContextProvider(firstContext, 'one');
  useContextProvider(secondContext, 2);
  return <p>Provided</p>;
}
`,
    });
  });

  test('unwraps component$ components', async () => {
    await testInput('component_dollar', {
      code: `import { component$ } from '@qwik.dev/core';
export const App = component$(() => <div>Hello</div>);
export default component$(function Home() {
  return <section>Default wrapped</section>;
});
`,
    });
  });

  test('component with event handler', async () => {
    await testInput('component_event_handler', {
      code: `import { useSignal } from '@qwik.dev/core';
export const App = () => {
  const count = useSignal(0);
  return <button onClick$={() => count.value++}>{count.value}</button>;
};
`,
    });
  });

  test('component with visible task carrier', async () => {
    await testInput('component_visible_task_carrier', {
      code: `import { useSignal, useVisibleTask$ } from '@qwik.dev/core';
export function App() {
  const count = useSignal(0);
  useVisibleTask$(() => count.value++, { strategy: 'document-ready' });
  return <button>Ready</button>;
}
`,
    });
  });

  test('component with nested QRL', async () => {
    await testInput('component_nested_qrl', {
      code: `import { useSignal, $ } from '@qwik.dev/core';
export function App() {
  const count = useSignal(0);
  return <button onClick$={() => $(() => count.value++)}>Run</button>;
}
`,
    });
  });

  test('component event module dependency closure', async () => {
    await testInput('component_event_module_dependencies', {
      code: `const base = 10;
const source = { helper: () => base };
const { helper } = source;

export function App() {
  return <button onClick$={() => helper()}>Run</button>;
}
`,
    });
  });

  test('lowers named third-party dollar imports without Qwik hook semantics', async () => {
    await testInput('component_third_party_dollar_hook', {
      code: `import { useTask$ } from 'third-party-library';
export function App() {
  useTask$(() => console.log('external'));
  return <main>Ready</main>;
}
`,
    });
  });

  test('inlines useId calls', async () => {
    await testInput('use_id', {
      path: 'src/use-id.tsx',
      code: `import { useId } from '@qwik.dev/core';

export function App() {
  const id = useId();
  return <label for={id}>Name</label>;
}
`,
    });
  });

  test('passes useId seed to child components', async () => {
    await testInput('use_id_child_component', {
      path: 'src/use-id-child.tsx',
      code: `import { useId } from '@qwik.dev/core';

export function Child() {
  useId();
  return <span />;
}

export function App() {
  return <Child />;
}
`,
    });
  });

  test('lowers global useStyles$', async () => {
    await testInput('use_styles_global', {
      path: 'src/use-styles.tsx',
      code: `import { useStyles$ } from '@qwik.dev/core';
import styles from './app.css?inline';

export function App() {
  useStyles$(styles);
  return <div class="container">Hello</div>;
}
`,
    });
  });

  test('lowers scoped static classes', async () => {
    await testInput('use_styles_scoped_static', {
      path: 'src/use-styles-scoped.tsx',
      code: `import { useStylesScoped$ } from '@qwik.dev/core';
import styles from './app.css?inline';

export function App() {
  useStylesScoped$(styles);
  return <div class="container">Hello</div>;
}
`,
    });
  });

  test('lowers scoped dynamic object class updates', async () => {
    await testInput('use_styles_scoped_dynamic', {
      path: 'src/use-styles-scoped-dynamic.tsx',
      code: `import { useStylesScoped$ } from '@qwik.dev/core';
import { useSignal } from '@qwik.dev/core';
import styles from './app.css?inline';

export function App() {
  useStylesScoped$(styles);
  const active = useSignal(false);
  return <button class={{ container: true, active: active.value }} onClick$={() => active.value = true}>Toggle</button>;
}
`,
    });
  });

  test('lowers multiple scoped styles', async () => {
    await testInput('use_styles_scoped_multiple', {
      path: 'src/use-styles-scoped-multiple.tsx',
      code: `import { useStylesScoped$ } from '@qwik.dev/core';
import red from './red.css?inline';
import blue from './blue.css?inline';

export function App() {
  useStylesScoped$(red);
  useStylesScoped$(blue);
  return <div class="container">Hello</div>;
}
`,
    });
  });

  test('style ids stay unique across files with identical component shapes', async () => {
    const code = `import { component$, useStylesScoped$ } from '@qwik.dev/core';

export default component$(() => {
  useStylesScoped$(\`.container { height: 3200px; }\`);
  return <div class="container">Hello</div>;
});
`;
    const styleIdOf = async (path: string) => {
      const result = await transformModules(baseOptions({ path, code }, true));
      const emitted = result.modules.map((module) => module.code).join('\n');
      const match = /useStylesScoped\([\s\S]*?,\s*"([^"]+)"\)/.exec(emitted);
      expect(match, `no scoped style call emitted for ${path}`).not.toBeNull();
      return match![1];
    };
    const first = await styleIdOf('src/routes/page-long/index.tsx');
    const second = await styleIdOf('src/routes/page-short/index.tsx');
    expect(first).not.toBe(second);
  });

  test('keeps scoped classes on projected JSX owner', async () => {
    await testInput('use_styles_scoped_projection', {
      path: 'src/use-styles-scoped-projection.tsx',
      code: `import { Slot } from '@qwik.dev/core';
import { useStylesScoped$ } from '@qwik.dev/core';
import parentStyles from './parent.css?inline';
import childStyles from './child.css?inline';

export function Child() {
  useStylesScoped$(childStyles);
  return <section class="child"><Slot /></section>;
}

export function App() {
  useStylesScoped$(parentStyles);
  return <Child><span class="projected">Projected</span></Child>;
}
`,
    });
  });

  test('extracts event handlers into QRL-style modules', async () => {
    await testInput('event_handler_qrl', {
      code: `export function App() {
  return <button onClick$={(ev) => console.log(ev.type)}>Click</button>;
}
`,
    });
  });

  test('lowers inline event handler arrays for CSR and SSR', async () => {
    await testInput('event_handler_arrays', {
      code: `import { useSignal } from '@qwik.dev/core';

export function App() {
  const count = useSignal(0);
  return <button onClick$={[() => console.log('click'), [undefined, () => count.value++]]}>Save</button>;
}
`,
    });
  });

  test('lowers native bind props and preserves input handler order', async () => {
    await testInput('bind_native', {
      code: `import { useSignal } from '@qwik.dev/core';

export function App() {
  const value = useSignal('');
  const checked = useSignal(false);
  return <>
    <input bind:value={value} onInput$={() => console.log('after')} />
    <input onInput$={() => console.log('before')} bind:checked={checked} />
  </>;
}
`,
    });
  });

  test('keeps bind props opaque through component rest props', async () => {
    await testInput('bind_rest_props', {
      code: `import { useSignal } from '@qwik.dev/core';

export function Field({ label, ...rest }) {
  return <label>{label}<input onInput$={() => console.log('input')} {...rest} /></label>;
}

export function App() {
  const value = useSignal('');
  return <Field label="Name" bind:value={value} />;
}
`,
    });
  });

  test('lowers statically known bind spreads and keeps opaque spread order', async () => {
    await testInput('bind_spreads', {
      code: `import { useSignal } from '@qwik.dev/core';

export function App(props) {
  const first = useSignal('first');
  const second = useSignal('second');
  return <>
    <input {...{ 'bind:value': first, title: 'known' }} />
    <input bind:value={first} {...props.rest} />
    <input {...props.rest} bind:value={second} />
  </>;
}
`,
    });
  });

  test('keeps custom component bind props unchanged', async () => {
    await testInput('bind_component_prop', {
      code: `import { useSignal } from '@qwik.dev/core';

export function Pager(props) {
  return <button>{props['bind:page'].value}</button>;
}

export function App() {
  const page = useSignal(1);
  return <Pager bind:page={page} bind:value={page} bind:checked={page} />;
}
`,
    });
  });

  test('lowers native refs without resumable boundaries', async () => {
    await testInput('ref_native', {
      code: `import { useSignal } from '@qwik.dev/core';

function Child(props) {
  return <span>{props.ref ? 'ref' : 'none'}</span>;
}

export function App({ forwarded, rest }) {
  const signalRef = useSignal();
  const elements = [];
  const namedRef = (element) => elements.push(element);
  return <section>
    <div ref={signalRef}>Signal</div>
    <div ref={(element) => elements.push(element)}>Inline</div>
    <div ref={namedRef}>Named</div>
    <div ref={forwarded}>Forwarded</div>
    <div {...{ ref: signalRef }}>Spread</div>
    <div {...rest}>Opaque</div>
    <Child ref={signalRef} />
  </section>;
}
`,
    });
  });

  test('uses _captures for extracted event lexical scope', async () => {
    await testInput('event_handler_captures', {
      code: `import { useSignal } from "@qwik.dev/core";
export function App() {
  const count = useSignal(1);
  return <button onClick$={() => count.value++}>Count</button>;
}
`,
    });
  });

  test('imports module-level helpers into extracted events', async () => {
    await testInput('event_handler_module_helpers', {
      code: `function buildData(count: number) {
  return Array.from({ length: count }, (_, i) => i);
}

export function App() {
  const rows = { value: [] as number[] };
  return <button onClick$={() => (rows.value = buildData(3))}>Create</button>;
}
`,
    });
  });

  test('extracts multiple event names and scopes', async () => {
    await testInput('event_handler_scopes', {
      code: `export function App() {
  return <div onClick$={() => 1} onDblClick$={() => 2} window:onScroll$={() => 3} document:onKeyDown$={() => 4} />;
}
`,
    });
  });

  test('lowers passive events and stop-propagation modifiers', async () => {
    const input = {
      path: 'src/component.tsx',
      code: `export function App() {
  return <>
    <button passive:click preventdefault:click stoppropagation:click onClick$={() => 1} />
    <div passive:scroll window:onScroll$={() => 2} />
    <div passive:touchstart document:onTouchStart$={() => 3} />
  </>;
}
`,
    };
    const ssr = await transformModules(baseOptions(input, true));
    const csr = await transformModules(baseOptions(input, false));
    const ssrCode = ssr.modules[0].code;
    const csrCode = csr.modules[0].code;

    expect(ssrCode).toContain('ctx.eventAttr("q-ep:click"');
    expect(ssrCode).toContain('ctx.eventAttr("q-wp:scroll"');
    expect(ssrCode).toContain('ctx.eventAttr("q-dp:touchstart"');
    expect(ssrCode).toContain(' stoppropagation:click');
    expect(ssrCode).not.toContain(' passive:');
    expect(ssrCode).not.toContain(' preventdefault:click');
    expect(csrCode).toContain('setEvent(el0, "q-ep:click"');
    expect(csrCode).toContain('setEvent(el1, "q-wp:scroll"');
    expect(csrCode).toContain('setEvent(el2, "q-dp:touchstart"');
    expect(csrCode).toContain(' stoppropagation:click');
    expect(csrCode).not.toContain(' passive:');
    expect(csrCode).not.toContain(' preventdefault:click');
  });

  test('emits useOn with explicit qrl handler', async () => {
    await testInput('use_on_explicit_qrl', {
      code: `import { $ } from '@qwik.dev/core';
import { useOn, useOnDocument, useSignal } from '@qwik.dev/core';

export function App() {
  const count = useSignal(0);
  useOn('click', $(() => count.value++));
  useOnDocument('qinit', $(() => count.value += 2), { capture: true, preventdefault: true });
  return <button>{count.value}</button>;
}
`,
    });
  });

  test('supports SSR and CSR dynamic text', async () => {
    await testInput('dynamic_signal_text', {
      code: `import { useSignal } from '@qwik.dev/core';
export function App() {
  const count = useSignal(0);
  return <p>{count.value}</p>;
}
`,
    });
  });

  test('emits SSR range text for mixed dynamic text', async () => {
    await testInput('ssr_dynamic_range_text', {
      code: `import { useSignal } from '@qwik.dev/core';
export function App() {
  const count = useSignal(0);
  return <p>Hello {count.value}</p>;
}
`,
    });
  });

  test('preserves multiline text spacing before dynamic text', async () => {
    await testInput('ssr_dynamic_range_text_multiline_spacing', {
      code: `import { useSignal } from '@qwik.dev/core';
export function App() {
  const count = useSignal(0);
  return (
    <p>
      Count: {count.value}
    </p>
  );
}
`,
    });
  });

  test('emits SSR range text boundaries before static text', async () => {
    await testInput('ssr_dynamic_range_text_boundary', {
      code: `import { useSignal } from '@qwik.dev/core';
export function App() {
  const count = useSignal(0);
  return <p>Hello {count.value} world</p>;
}
`,
    });
  });

  test('emits local marker indexes for multiple SSR range texts', async () => {
    await testInput('ssr_dynamic_range_text_multiple', {
      code: `import { useSignal } from '@qwik.dev/core';
export function App() {
  const first = useSignal(1);
  const second = useSignal(2);
  return <p>{first.value}{second.value}</p>;
}
`,
    });
  });

  test('emits SSR text expression QRLs', async () => {
    await testInput('ssr_dynamic_text_expression', {
      code: `import { useSignal } from '@qwik.dev/core';
export function App() {
  const count = useSignal(1);
  return <p>{count.value + 1}</p>;
}
`,
    });
  });

  test('emits SSR dynamic attrs', async () => {
    await testInput('ssr_dynamic_attrs', {
      code: `import { useSignal } from '@qwik.dev/core';
export function App() {
  const title = useSignal('hello');
  const classes = useSignal('active');
  const style = useSignal('color:red');
  return <div title={title.value} className={classes.value} style={style.value}>Attrs</div>;
}
`,
    });
  });

  test('emits dynamic DOM attrs through attr expression QRLs', async () => {
    await testInput('dynamic_dom_attrs_props_qrl', {
      code: `import { useSignal } from '@qwik.dev/core';
export function App() {
  const count = useSignal(0);
  return (
    <div
      title={\`count \${count.value}\`}
      className={{ active: count.value > 0 }}
      style={{ color: count.value % 2 === 0 ? 'green' : 'blue' }}
      data-kind="counter"
    >
      Attrs
    </div>
  );
}
`,
    });
  });

  test('keeps literal-only setup objects on the initial render path', async () => {
    await testInput('plain_value_object_fallback', {
      code: `export function App() {
  const foo = { value: 'hello' };
  return <p title={foo.value}>{foo.value}<span>{'Hi ' + foo.value}</span></p>;
}
`,
    });
  });

  test('falls back to expression effects for unknown source factories', async () => {
    await testInput('unknown_source_factory_fallback', {
      code: `function maybeSignal() {
  return { value: 'maybe' };
}

export function App() {
  const foo = maybeSignal();
  return <div title={foo.value}>{foo.value}</div>;
}
`,
    });
  });

  test('hoists SSR dynamic attrs before async child output', async () => {
    await testInput('dynamic_dom_attrs_after_component', {
      code: `import { useSignal } from '@qwik.dev/core';
function Child() {
  return <span>Child</span>;
}
export function App() {
  const count = useSignal(0);
  return (
    <main>
      <Child />
      <p style={{ color: count.value > 5 ? 'red' : 'blue' }}>After</p>
    </main>
  );
}
`,
    });
  });

  test('emits DOM spread props with override order', async () => {
    await testInput('dom_spread_props', {
      code: `import { useSignal } from '@qwik.dev/core';
export function App() {
  const attrs = useSignal({
    title: 'from-spread',
    children: 'ignored',
    className: { active: true },
  });
  const title = useSignal('final');
  return <div {...attrs.value} title={title.value} onClick$={() => (title.value = 'clicked')} data-id="static">Child</div>;
}
`,
    });
  });

  test('emits component spread rest props and event pass-through', async () => {
    await testInput('component_spread_rest_props', {
      code: `export function Button({ kind, ...rest }: { kind: string; title: string; onClick$?: unknown }) {
  return <button {...rest} data-kind={kind}>Click</button>;
}

export function Parent() {
  const attrs = { title: 'Save' };
  const label = 'clicked';
  return <Button {...attrs} kind="primary" onClick$={() => label} />;
}
`,
    });
  });

  test('passes component event props through native events', async () => {
    await testInput('component_event_prop_passthrough', {
      code: `import type { QRL } from '@qwik.dev/core';

export function Button({ onClick$ }: { onClick$: QRL<() => any> }) {
  return <button onClick$={onClick$}>Click</button>;
}

export function Parent() {
  const value = 1;
  return <Button onClick$={() => value} />;
}
`,
    });
  });

  test('emits SSR and CSR ternary branch renderers', async () => {
    await testInput('branch_ternary', {
      code: `import { useSignal } from '@qwik.dev/core';
export function App() {
  const count = useSignal(0);
  return (
    <section>
      {count.value % 2 === 0 ? (
        <p className="even">Even {count.value}</p>
      ) : (
        <button onClick$={() => count.value++}>Odd {count.value}</button>
      )}
    </section>
  );
}
`,
    });
  });

  test('emits SSR and CSR ternary fragment branch renderers', async () => {
    await testInput('branch_ternary_fragment', {
      code: `import { useSignal } from '@qwik.dev/core';
export function Child() {
  const hide = useSignal(false);
  return (
    <div>
      {hide.value ? (
        <>
          <label />
          <input />
          <svg />
        </>
      ) : (
        <>
          <label for="value" />
          <input required />
          <svg width="1" />
        </>
      )}
    </div>
  );
}

export function App() {
  return <Child />;
}
`,
    });
  });

  test('emits SSR and CSR logical branch renderers', async () => {
    await testInput('branch_logical_and', {
      code: `import { useSignal } from '@qwik.dev/core';
export function App() {
  const visible = useSignal(true);
  const label = useSignal('ready');
  const attrs = useSignal({ role: 'status' });
  return <div>{visible.value && <span {...attrs.value} title={\`label \${label.value}\`}>{label.value + '!'}</span>}</div>;
}
`,
    });
  });

  test('emits logical branch renderers in fragments', async () => {
    await testInput('branch_fragment_logical_and', {
      code: `import { useSignal } from '@qwik.dev/core';

function InnerCmp() {
  return <div>Hello world</div>;
}

export function App() {
  const groupSig = useSignal('1');
  return (
    <>
      Some text:{'  '}
      <button onClick$={() => (groupSig.value = '2')}>click</button>
      {groupSig.value === '2' && <InnerCmp />}
    </>
  );
}
`,
    });
  });

  test('emits dynamic text inside logical branch renderers', async () => {
    await testInput('branch_logical_and_dynamic_text', {
      code: `import { useSignal } from '@qwik.dev/core';
export function App() {
  const count = useSignal(0);
  return <p>{count.value > 2 && 'Count is greater than 2 and equal to ' + count.value}</p>;
}
`,
    });
  });

  test('renders a promise of JSX as a child', async () => {
    await testInput('promise_jsx_child', {
      code: `export function App(props: { resolveName: string }) {
  const content = new Promise((resolve) => {
    (globalThis as any)[props.resolveName] = () => resolve(<p id="async-value">Async content</p>);
  });
  return <div>{content}</div>;
}
`,
    });
  });

  test('projects a conditional child into the slot its element names', async () => {
    await testInput('projection_conditional_slot', {
      code: `import { component$, Slot, useSignal } from '@qwik.dev/core';
export const Panel = component$(() => (
  <div>
    <Slot name="start" />
    <span><Slot /></span>
  </div>
));
export function App() {
  const show = useSignal(true);
  return (
    <Panel>
      {show.value && <span q:slot="start">start content</span>}
    </Panel>
  );
}
`,
    });
  });

  test('splits a conditional child across the slots its arms name', async () => {
    await testInput('projection_conditional_slot_split', {
      code: `import { component$, Slot, useSignal } from '@qwik.dev/core';
export const Panel = component$(() => (
  <div>
    <Slot name="x" />
    <Slot name="y" />
  </div>
));
export function App() {
  const flip = useSignal(false);
  return (
    <Panel>
      {flip.value ? <a q:slot="x">alpha</a> : <b q:slot="y">bravo</b>}
    </Panel>
  );
}
`,
    });
  });

  test('renders a dynamic dangerouslySetInnerHTML on both flavors', async () => {
    await testInput('inner_html_dynamic', {
      code: `import { useSignal } from '@qwik.dev/core';
export function App() {
  const html = useSignal('<b>hi</b>');
  return (
    <div>
      <span dangerouslySetInnerHTML={html.value} />
      <button onClick$={() => (html.value = '<i>x</i>')}>go</button>
    </div>
  );
}
`,
    });
  });

  test('lowers a guard return to a reactive branch', async () => {
    await testInput('guard_return_null', {
      code: `export function App(props: { releaseId: string | null }) {
  if (!props.releaseId) {
    return null;
  }
  const releaseUrl = '/release/' + props.releaseId;
  return <a href={releaseUrl}>release</a>;
}
`,
    });
  });

  test('lowers guard returns around opaque promise arms', async () => {
    await testInput('guard_promise_arms', {
      code: `import { isServer } from '@qwik.dev/core';
export function App(props: { releaseId: string | null }) {
  if (isServer) {
    if (props.releaseId) {
      return globalThis.waitForRelease(props.releaseId, <p>released</p>);
    }
    return new Promise((resolve) => setTimeout(() => resolve(<p>slow</p>), 1000));
  }
  return <p>client</p>;
}
`,
    });
  });

  test('lowers a fully returning else-if chain', async () => {
    await testInput('guard_else_if_chain', {
      code: `export function App(props: { kind: string }) {
  if (props.kind === 'a') {
    return <em>a</em>;
  } else if (props.kind === 'b') {
    return <strong>b</strong>;
  } else {
    return <span>rest</span>;
  }
}
`,
    });
  });

  test('emits raw guard-arm setup inside a chunked component', async () => {
    await testInput('guard_arm_raw_setup', {
      code: `import { component$, isServer, useServerData } from '@qwik.dev/core';
export const Inner = component$(() => <p>inner</p>);
const waitFor = (a: string, b: string, v: unknown) => Promise.resolve(v);
export const App = component$(() => {
  const url = useServerData<string>('url');
  const requestId = useServerData<string>('id');
  if (isServer) {
    const releaseId = url ? new URL(url).searchParams.get('release') : null;
    if (releaseId && requestId) {
      return waitFor(requestId, releaseId, <Inner />);
    }
    const delay = Number(url?.charAt(0) || 1000);
    return new Promise((resolve) => { setTimeout(() => resolve(<Inner />), delay); });
  }
  return <Inner />;
});
`,
    });
  });

  test('rejects a guard else followed by more statements', async () => {
    await testInput('guard_else_trailing_diagnostic', {
      code: `export function App(props: { flag: boolean }) {
  if (props.flag) {
    return <em>yes</em>;
  } else {
    console.log('no');
  }
  return <span>after</span>;
}
`,
    });
  });

  test('rejects hooks inside a guard arm', async () => {
    await testInput('guard_hook_arm_diagnostic', {
      code: `import { useSignal } from '@qwik.dev/core';
export function App(props: { flag: boolean }) {
  if (props.flag) {
    const count = useSignal(0);
    return <em>{count.value}</em>;
  }
  return <span>off</span>;
}
`,
    });
  });

  test('folds isServer and isBrowser per emit target', async () => {
    await testInput('build_constant_fold', {
      code: `import { isServer, isBrowser, useSignal } from '@qwik.dev/core';
export function App() {
  const count = useSignal(0);
  if (isServer) {
    console.log('server setup');
  }
  return (
    <div>
      <p>{isServer ? 'server' : 'client'}</p>
      <button onClick$={() => count.value += isBrowser ? 1 : 0}>{count.value}</button>
    </div>
  );
}
`,
    });
  });

  test('emits promise-callback JSX as a thunk child', async () => {
    await testInput('promise_callback_jsx_child', {
      code: `export function App(props: { load: () => Promise<(props: any) => any> }) {
  const component = props.load();
  return <div>{component.then((Cmp) => <Cmp name="late" />)}</div>;
}
`,
    });
  });

  test('rejects the plain fallback prop on Suspense', async () => {
    await testInput('suspense_plain_fallback_diagnostic', {
      code: `import { Suspense } from '@qwik.dev/core';
export function App() {
  return (
    <Suspense fallback={<em>waiting</em>}>
      <p>ok</p>
    </Suspense>
  );
}
`,
    });
  });

  test('wires reveal groups into lexical suspense boundaries', async () => {
    await testInput('reveal_sequential_suspense', {
      code: `import { Reveal, Suspense } from '@qwik.dev/core';
export async function First() {
  await Promise.resolve();
  return <p>first</p>;
}
export async function Second() {
  await Promise.resolve();
  return <p>second</p>;
}
export function App() {
  return (
    <section>
      <Reveal order="sequential" collapsed>
        <Suspense fallback$={() => <em>waiting first</em>}>
          <First />
        </Suspense>
        <Suspense fallback$={() => <em>waiting second</em>}>
          <Second />
        </Suspense>
      </Reveal>
    </section>
  );
}
`,
    });
  });

  test('fails closed when a component could hide a reveal boundary', async () => {
    await testInput('reveal_component_child_diagnostic', {
      code: `import { Reveal, Suspense } from '@qwik.dev/core';
export function Hidden() {
  return <p>maybe a boundary in here</p>;
}
export function App() {
  return (
    <Reveal order="sequential">
      <Suspense fallback$={() => <em>waiting</em>}>
        <p>ok</p>
      </Suspense>
      <Hidden />
    </Reveal>
  );
}
`,
    });
  });

  test('keeps outer props reachable from a destructured local component', async () => {
    await testInput('local_component_outer_props', {
      code: `export function Footer(props: { todos: { filter: string } }) {
  function Filter({ filter }: { filter: string }) {
    const lMode = filter.toLowerCase();
    return (
      <li>
        <a class={{ selected: props.todos.filter == lMode }}>{filter}</a>
      </li>
    );
  }
  return (
    <ul>
      <Filter filter="all" />
      <Filter filter="active" />
    </ul>
  );
}
`,
    });
  });

  test('imports local child components inside branch renderers', async () => {
    await testInput('branch_local_components', {
      code: `import { useSignal } from '@qwik.dev/core';

function Counter({ count }: { count: number }) {
  return <p>Count: {count}</p>;
}

function Hello({ name }: { name: string }) {
  return <p>Hello, {name}!</p>;
}

export function App() {
  const count = useSignal(0);
  return <section>{count.value < 2 ? <Hello name="Qwik" /> : <Counter count={count.value} />}</section>;
}
`,
    });
  });

  test('folds literal branches', async () => {
    await testInput('branch_literal_fold', {
      code: `export function App() {
  return (
    <section>
      {false && <p>Hidden</p>}
      {true ? <span>Shown</span> : <em>Hidden</em>}
      {null ? <b>Never</b> : null}
    </section>
  );
}
`,
    });
  });

  test('supports static keyed JSX loops', async () => {
    await testInput('jsx_loop_static_row', {
      code: `import { useSignal } from '@qwik.dev/core';
export function App() {
  const items = useSignal([{ id: 'a' }]);
  return <ul>{items.value.map((item) => <li key={item.id}>Item</li>)}</ul>;
}
`,
    });
  });

  test('renders a direct array map without reactive collection machinery', async () => {
    const result = await testInput('jsx_plain_array_map', {
      code: `export function App() {
  const items = [{ id: 'a', label: 'Alpha' }, { id: 'b', label: 'Beta' }];
  return <ul>{items.map((item, index) => <li key={item.id} onClick$={() => console.log(index)}>{item.label}:{index}</li>)}</ul>;
}
`,
    });
    const csr = result.csr.modules.map((module) => module.code).join('\n');
    const ssr = result.ssr.modules.map((module) => module.code).join('\n');

    expect(csr).not.toContain('_wrapArray');
    expect(csr).not.toContain('index.value');
    expect(csr).toContain('[index]');
    expect(ssr).not.toContain(' q:row');
    expect(ssr).not.toContain('<!r=');
  });

  test('keeps a synchronous direct array row synchronous', async () => {
    const result = await testInput('jsx_plain_array_static_map', {
      code: `export function App() {
  const items = ['first', 'second'];
  return <ul>{items.map(() => <li>Item</li>)}</ul>;
}
`,
    });
    const csr = result.csr.modules[0]?.code ?? '';
    const ssr = result.ssr.modules[0]?.code ?? '';

    expect(csr).not.toContain('scheduler.waitFor');
    expect(ssr).not.toContain('maybeThen');
    expect(
      result.csr.modules.some((module) => module.segment?.ctxName === 'collection:render')
    ).toBe(false);
    expect(
      result.ssr.modules.some((module) => module.segment?.ctxName === 'collection:render')
    ).toBe(false);
  });

  test('supports keyed JSX loops with block callbacks', async () => {
    await testInput('jsx_loop_block_row', {
      code: `import { useSignal } from '@qwik.dev/core';
export function App() {
  const items = useSignal([{ id: 'a', label: 'Alpha' }]);
  return (
    <ul>
      {items.value.map((item) => {
        return <li key={item.id}>{item.label}</li>;
      })}
    </ul>
  );
}
`,
    });
  });

  test('supports keyed JSX loops', async () => {
    await testInput('jsx_loops_keyed', {
      code: `import { useSignal } from '@qwik.dev/core';
export function App() {
  const items = useSignal([{ id: 'a', label: 'Alpha', selected: true, attrs: { title: 'Alpha' } }]);
  return (
    <ul>
      {items.value.map((row, index) => (
        <li key={row.id} {...row.attrs}>
          <span data-index={index} className={{ active: row.selected }}>
            {row.label}:{index}
          </span>
          <button onClick$={() => (row.selected = !row.selected)}>Toggle</button>
        </li>
      ))}
    </ul>
  );
}
`,
    });
  });

  test('supports keyed JSX fragment rows', async () => {
    await testInput('jsx_loop_fragment_row', {
      code: `import { useSignal } from '@qwik.dev/core';
export function App() {
  const items = useSignal([{ id: 'a', label: 'Alpha' }]);
  return (
    <p>
      {items.value.map((item) => (
        <>
          <span key={item.id}>{item.label}</span>
          <em>!</em>
        </>
      ))}
    </p>
  );
}
`,
    });
  });

  test('emits CSR templates for keyed table row loops', async () => {
    await testInput('jsx_loop_row_template', {
      code: `import { useSignal } from '@qwik.dev/core';
export function App() {
  const rows = useSignal([{ id: 1, label: 'Alpha', selected: false }]);
  return (
    <table>
      <tbody>
        {rows.value.map((row) => (
          <tr key={row.id} className={{ danger: row.selected }}>
            <td className="col-md-1">{row.id}</td>
            <td className="col-md-4">
              <a onClick$={() => (row.selected = true)}>{row.label}</a>
            </td>
            <td className="col-md-1">
              <a>
                <span className="glyphicon glyphicon-remove" aria-hidden="true"></span>
              </a>
            </td>
            <td className="col-md-6"></td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
`,
    });
  });

  test('does not treat unknown value maps as keyed collections', async () => {
    const result = await testInput('jsx_unknown_value_map_fallback', {
      code: `function getItems() {
  return { value: [{ id: 'a', label: 'Alpha' }] };
}

export function App() {
  const items = getItems();
  return (
    <ul>
      {items.value.map((row) => (
        <li key={row.id}>{row.label}</li>
      ))}
    </ul>
  );
}
`,
    });
    expect(result.csr.modules.map((module) => module.code).join('\n')).not.toContain(
      'createForBlock'
    );
  });

  test('transforms implicit dollar calls in component setup', async () => {
    await testInput('implicit_dollar_setup', {
      code: `import { useSignal, useComputed$ } from '@qwik.dev/core';
export function App() {
  const count = useSignal(1);
  const double = useComputed$(() => count.value * 2);
  return <p>{double.value}</p>;
}
`,
    });
  });

  test('extracts serializer object literals that capture component scope', async () => {
    await testInput('serializer_object_setup', {
      code: `import { useSerializer$, useSignal } from '@qwik.dev/core';
export function App() {
  const count = useSignal(1);
  const custom = useSerializer$({
    initial: 2,
    deserialize: (value = 0) => ({ count: value + count.value }),
    serialize: (value) => value.count,
  });
  return <p>{custom.value.count}</p>;
}
`,
    });
  });

  test('emits nested child component renderers', async () => {
    await testInput('component_child_nested', {
      code: `export function Child() {
  return <span>Child</span>;
}

export function Parent() {
  return <section><Child /></section>;
}
`,
    });
  });

  test('passes literal and expression props to child components', async () => {
    await testInput('component_child_props', {
      code: `import { useSignal } from '@qwik.dev/core';

export function Child(props: { label: string; count: number }) {
  return <p>{props.label}: {props.count}</p>;
}

export function Parent() {
  const count = useSignal(1);
  return <Child label="Hi" count={count.value} />;
}
`,
    });
  });

  test('passes child component children through props.children', async () => {
    await testInput('component_child_props_children', {
      code: `export function Wrapper(props: { children?: unknown }) {
  return <section>{props.children}</section>;
}

export function Parent() {
  return <Wrapper><p>Projected</p></Wrapper>;
}
`,
    });
  });

  test('projects default Slot children', async () => {
    await testInput('component_child_slot_default', {
      code: `import { Slot } from '@qwik.dev/core';

export function Wrapper() {
  return <section><Slot /></section>;
}

export function Parent() {
  return <Wrapper><p>Projected</p></Wrapper>;
}
`,
    });
  });

  test('projects named Slot children', async () => {
    await testInput('component_child_slot_named', {
      code: `import { Slot } from '@qwik.dev/core';

export function Wrapper() {
  return <section><header><Slot name="header" /></header><main><Slot /></main></section>;
}

export function Parent() {
  return <Wrapper><h1 q:slot="header">Title</h1><p>Body</p></Wrapper>;
}
`,
    });
  });

  test('resolves a Slot whose name is an expression', async () => {
    await testInput('component_child_slot_dynamic_name', {
      code: `import { Slot } from '@qwik.dev/core';

export function Switch(props) {
  return <Slot name={props.name} />;
}

export function Parent(props) {
  return <Switch name={props.pick}><i q:slot="a">Alpha</i><b q:slot="b">Bravo</b></Switch>;
}
`,
    });
  });

  test('reads a store through a destructured alias and a shallow store', async () => {
    await testInput('component_store_alias_props', {
      code: `import { useStore } from '@qwik.dev/core';
import { Child } from './child';

export function Alias() {
  const store = useStore({ nested: { flip: false } });
  const { nested } = store;
  return <Child label={nested.flip ? 'b' : 'a'} deep={nested.flip} />;
}

export function Shallow() {
  const store = useStore({ nested: { flip: false } }, { deep: false });
  return <Child label={store.nested.flip ? 'b' : 'a'} own={store.nested} />;
}
`,
    });
  });

  test('renders a static list inside a branch arm', async () => {
    await testInput('branch_arm_static_list', {
      code: `import { component$, useSignal } from '@qwik.dev/core';

export const App = component$(() => {
  const show = useSignal(true);
  return <div>{show.value && <ul>{['a', 'b'].map((label) => <li key={label}>{label}</li>)}</ul>}</div>;
});
`,
    });
  });

  test('inherits context across child component renderers', async () => {
    await testInput('component_child_context', {
      code: `import { useContext, useContextProvider, useSignal } from '@qwik.dev/core';
import { Context } from './context';

export function Child() {
  const value = useContext(Context);
  return <p>{value.value}</p>;
}

export function Parent() {
  const value = useSignal('provided');
  useContextProvider(Context, value);
  return <section><Child /></section>;
}
`,
    });
  });

  test('emits task setup with async await tracking', async () => {
    await testInput('task_async_await', {
      code: `import { useSignal, useTask$, useVisibleTask$ } from '@qwik.dev/core';

export function App() {
  const count = useSignal(0);
  useTask$(async ({ cleanup }) => {
    const before = count.value;
    await Promise.resolve();
    cleanup(async () => {
      await Promise.resolve(before);
    });
    count.value;
  });
  useVisibleTask$(async () => {
    await Promise.resolve();
    count.value;
  }, { strategy: 'document-ready' });
  return <button>{count.value}</button>;
}
`,
    });
  });

  test('emits async signal setup with async await tracking', async () => {
    await testInput('async_signal_await', {
      code: `import { useAsync$, useSignal } from '@qwik.dev/core';

export function App() {
  const count = useSignal(0);
  const data = useAsync$(async () => {
    const before = count.value;
    await Promise.resolve();
    return before + count.value;
  }, { initial: 0 });
  return <button>{data.value}</button>;
}
`,
    });
  });

  test('transforms JSX values declared in component setup', async () => {
    const result = await testInput('jsx_value_setup', {
      code: `export function App() {
  const someJsx = <div>Some JSX</div>;
  return <button>{someJsx}</button>;
}
`,
    });
    expect(result.csr.modules.map((module) => module.code).join('\n')).not.toContain('_toNodes');
  });

  test('creates fresh CSR DOM for repeated JSX value use', async () => {
    const result = await testInput('jsx_value_repeated', {
      code: `export function App() {
  const item = <span>Item</span>;
  return <div>{item}{item}</div>;
}
`,
    });
    expect(result.csr.modules.map((module) => module.code).join('\n')).not.toContain('_toNodes');
  });

  test('mounts a local JSX fragment as its planned node array', async () => {
    const result = await testInput('jsx_value_fragment', {
      code: `export function App() {
  const item = <><span>A</span><span>B</span></>;
  return <div>{item}</div>;
}
`,
    });
    expect(result.csr.modules.map((module) => module.code).join('\n')).not.toContain('_toNodes');
  });

  test('collects dynamic JSX value segments', async () => {
    await testInput('jsx_value_dynamic', {
      code: `import { useSignal } from '@qwik.dev/core';
export function App() {
  const count = useSignal(0);
  const button = <button onClick$={() => count.value++}>{count.value}</button>;
  return <section>{button}</section>;
}
`,
    });
  });

  test('handles function call in JSX', async () => {
    await testInput('handle_function_call', {
      code: `import { useSignal } from '@qwik.dev/core';
      import { fun } from './utils';

function renderItem(value: number) {
  return fun(value);
}

function renderFallback(value: number) {
  return fun(value);
}

export function App() {
  const count = useSignal(1);
  const renderers = { item: fun };
  return (
    <section>
      {fun(count.value)}
      {renderers.item(count.value + 1)}
      {count.value > 1 ? renderItem(count.value) : renderFallback(0)}
      {count.value && renderItem(count.value)}
    </section>
  );
}
`,
    });
  });
  test('imports the module bindings a component chunk names inline', async () => {
    const { ssr } = await testInput('component_chunk_module_binding', {
      code: `import { component$ } from '@qwik.dev/core';

const buttonStyle = 'btn';

export const Child = component$((props: { class: unknown }) => <p class={props.class}>go</p>);

export const Button = component$((props: { isWhite: boolean }) => (
  <Child class={[buttonStyle, { white: props.isWhite }]} />
));

export const App = component$(() => (
  <div>
    <Button isWhite={true} />
  </div>
));
`,
    });

    // the props getter is inlined into the chunk, so the chunk owes itself the import
    const chunk = ssr.modules.find((module) => module.path.endsWith('_component_Button.js'));
    expect(chunk?.code).toContain('import { buttonStyle }');
  });

  test('imports a module binding a branch chunk names through an inlined prop', async () => {
    const { ssr } = await testInput('branch_chunk_prop_module_binding', {
      code: `import { component$, Slot, useSignal } from '@qwik.dev/core';

export const Parent = component$(() => {
  const show = useSignal(true);
  return <main>{show.value ? <><Child model={Model} /></> : null}</main>;
});

export const Child = component$((props: { model: any }) => {
  const Cmp = props.model;
  return <Cmp>projected</Cmp>;
});

export const Model = component$(() => <div id="m">Own content<Slot /></div>);
`,
    });

    // the prop expression's segment records the reference; the branch chunk inlines it
    const chunk = ssr.modules.find((module) => module.path.includes('_branch_then_'));
    expect(chunk?.code).toContain('return Model');
    expect(chunk?.code).toMatch(/import \{ (?:\w+ as )?Model(?:,| \})/);
  });
});

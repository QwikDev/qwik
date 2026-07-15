import { describe, expect, test } from 'vitest';
import { transformModules } from './index';
import { TransformDiagnosticCode } from './transform-diagnostics';

const options = {
  srcDir: 'src',
  sourceMaps: false,
  transpileTs: true,
  transpileJsx: true,
  isServer: false,
} as const;

describe('module assembly', () => {
  test('parses JSX preserved in library .qwik.mjs modules', async () => {
    const result = await transformModules({
      ...options,
      input: [
        {
          path: 'lib/insights.qwik.mjs',
          code: `import { component$ } from '@qwik.dev/core';
export const Insights = component$(() => <script hidden />);`,
        },
      ],
    });

    expect(result.diagnostics).toEqual([]);
    expect(result.modules[0]?.code).toContain('createTemplate("<script hidden></script>")');
    expect(result.modules[0]?.code).not.toContain('component$');
  });

  test('extracts a root branch with a logical condition', async () => {
    const result = await transformModules({
      ...options,
      input: [
        {
          path: 'src/insights.tsx',
          code: `import { component$ } from '@qwik.dev/core';
const fallback = () => null;
export const Insights = component$(() => {
  const key = globalThis.key;
  const url = globalThis.url;
  return key && url ? <script hidden /> : fallback();
});`,
        },
      ],
    });

    expect(result.diagnostics).toEqual([]);
    expect(result.modules[0]?.code).toContain('createBranch');
  });

  test('does not duplicate the source of a synchronous QRL', async () => {
    const result = await transformModules({
      ...options,
      isServer: true,
      input: [
        {
          path: 'src/hook.ts',
          code: `import { sync$ } from '@qwik.dev/core';
export const handler = sync$(() => 42);`,
        },
      ],
    });

    expect(result.diagnostics).toEqual([]);
    expect(result.modules[0]?.code).toContain('_qrlSync(() => 42)');
    expect(result.modules[0]?.code).not.toContain('"() => 42"');
  });

  test.each(['false', '1', "'element'"])('rejects an invalid native ref %s', async (value) => {
    const result = await transformModules({
      ...options,
      input: [
        {
          path: 'src/component.tsx',
          code: `export function App() { return <div ref={${value}} />; }`,
        },
      ],
    });

    expect(result.diagnostics.map((diagnostic) => diagnostic.code)).toEqual([
      TransformDiagnosticCode.Ref,
    ]);
    expect(result.modules[0]?.code).toBe('');
  });

  test('keeps statically known refs on the direct sync path', async () => {
    const code = `import { useSignal } from '@qwik.dev/core';
export function App() { const element = useSignal(); return <div ref={element}>target</div>; }`;
    const csr = await transformModules({
      ...options,
      input: [{ path: 'src/component.tsx', code }],
    });
    const ssr = await transformModules({
      ...options,
      isServer: true,
      input: [{ path: 'src/component.tsx', code }],
    });

    expect(csr.diagnostics).toEqual([]);
    expect(ssr.diagnostics).toEqual([]);
    expect(csr.modules[0]?.code).toContain('(element).value = el0;');
    expect(csr.modules[0]?.code).not.toContain('setRef');
    expect(ssr.modules[0]?.code).toContain('ctx.setRef(element, id0)');
    expect(ssr.modules[0]?.code).not.toContain('maybeThen');
  });

  test('reports a stable diagnostic for a reactive collection without a key', async () => {
    const code = `import { useSignal } from '@qwik.dev/core';
export function App() {
  const items = useSignal([{ id: 'a' }]);
  return <ul>{items.value.map((item) => <li>{item.id}</li>)}</ul>;
}`;
    const result = await transformModules({
      ...options,
      input: [{ path: 'src/component.tsx', code }],
    });

    expect(result.diagnostics[0]?.code).toBe(TransformDiagnosticCode.ForKey);
  });

  test.each([
    ['reactive', `items.value.map(async (item) => <li key={item.id}>{await item.label()}</li>)`],
    [
      'derived',
      `items.value.filter((item) => item.visible).map(async (item) => <li key={item.id}>{await item.label()}</li>)`,
    ],
  ])('reports a stable diagnostic for an async %s collection', async (_name, collection) => {
    const code = `import { useSignal } from '@qwik.dev/core';
export function App() {
  const items = useSignal([{ id: 'a', visible: true, label: async () => 'A' }]);
  return <ul>{${collection}}</ul>;
}`;
    for (const isServer of [false, true]) {
      const result = await transformModules({
        ...options,
        isServer,
        input: [{ path: 'src/component.tsx', code }],
      });
      expect(result.diagnostics.map((diagnostic) => diagnostic.code)).toEqual([
        TransformDiagnosticCode.AsyncFor,
      ]);
    }
  });

  test.each([
    [
      'useId arguments',
      `import { useId } from '@qwik.dev/core';
export function App() { useId('seed'); return <div />; }`,
      TransformDiagnosticCode.UseId,
    ],
    [
      'useId outside linear setup',
      `import { useId } from '@qwik.dev/core';
export function App() { return <div>{useId()}</div>; }`,
      TransformDiagnosticCode.UseId,
    ],
    [
      'useConstant outside linear setup',
      `import { useConstant } from '@qwik.dev/core';
export function App() { return <div>{useConstant(() => 1)}</div>; }`,
      TransformDiagnosticCode.CustomHook,
    ],
    [
      'useStore outside linear setup',
      `import { useStore } from '@qwik.dev/core';
export function App() { return <div>{useStore({ value: 1 }).value}</div>; }`,
      TransformDiagnosticCode.CustomHook,
    ],
    [
      'useServerData outside linear setup',
      `import { useServerData } from '@qwik.dev/core';
export function App() { return <div>{useServerData('value')}</div>; }`,
      TransformDiagnosticCode.CustomHook,
    ],
    [
      'useStore without an initializer',
      `import { useStore } from '@qwik.dev/core';
export function App() { useStore(); return <div />; }`,
      TransformDiagnosticCode.CustomHook,
    ],
    [
      'useStore with an async initializer',
      `import { useStore } from '@qwik.dev/core';
export function App() { useStore(async () => ({ value: 1 })); return <div />; }`,
      TransformDiagnosticCode.CustomHook,
    ],
    [
      'useStore with a named async initializer',
      `import { useStore } from '@qwik.dev/core';
export function App() {
  async function createState() { return { value: 1 }; }
  useStore(createState);
  return <div />;
}`,
      TransformDiagnosticCode.CustomHook,
    ],
    [
      'useStore with a Promise initializer',
      `import { useStore } from '@qwik.dev/core';
export function App() { useStore(Promise.resolve({ value: 1 })); return <div />; }`,
      TransformDiagnosticCode.CustomHook,
    ],
    [
      'a Promise style',
      `import { useStyles$ } from '@qwik.dev/core';
export function App() { useStyles$(Promise.resolve('')); return <div />; }`,
      TransformDiagnosticCode.StyleHook,
    ],
    [
      'a style hook outside linear setup',
      `import { useStyles$ } from '@qwik.dev/core';
export function App() { return <div>{useStyles$('div {}')}</div>; }`,
      TransformDiagnosticCode.StyleHook,
    ],
    [
      'opaque content under scoped styles',
      `import { useStylesScoped$ } from '@qwik.dev/core';
import { renderItem } from './render-item';
export function App() { useStylesScoped$('div {}'); return <div>{renderItem()}</div>; }`,
      TransformDiagnosticCode.ScopedStyleContent,
    ],
  ])('reports a stable diagnostic for %s', async (_name, code, diagnostic) => {
    for (const isServer of [false, true]) {
      const result = await transformModules({
        ...options,
        isServer,
        input: [{ path: 'src/component.tsx', code }],
      });

      expect(result.diagnostics.map((item) => item.code)).toEqual([diagnostic]);
      expect(result.modules[0]?.code).toBe('');
    }
  });

  test('treats useConstant as a setup-only built-in hook', async () => {
    const code = `import { useConstant } from '@qwik.dev/core';
export function App() { const value = useConstant((seed) => seed + 1, 1); return <div>{value}</div>; }`;

    for (const isServer of [false, true]) {
      const result = await transformModules({
        ...options,
        isServer,
        input: [{ path: 'src/component.tsx', code }],
      });
      const output = result.modules.map((module) => module.code).join('\n');

      expect(result.diagnostics).toEqual([]);
      expect(output).toContain('useConstant');
      expect(output).not.toContain('styleScopes');
      expect(output).not.toContain('ctx.scheduler.flush()');
    }
  });

  test('treats aliased useStore with options as a setup-only built-in hook', async () => {
    const code = `import { useStore as store } from '@qwik.dev/core';
export function App() {
  const state = store(() => ({ value: 1 }), { deep: false });
  return <div>{state.value}</div>;
}`;

    for (const isServer of [false, true]) {
      const result = await transformModules({
        ...options,
        isServer,
        input: [{ path: 'src/component.tsx', code }],
      });
      const output = result.modules.map((module) => module.code).join('\n');

      expect(result.diagnostics).toEqual([]);
      expect(output).toContain('store(() => ({ value: 1 }), { deep: false })');
      expect(output).not.toContain('styleScopes');
      expect(output).not.toContain('ctx.scheduler.flush()');
    }
  });

  test.each(['@qwik.dev/core'])(
    'treats aliased useServerData from %s as a setup-only built-in hook',
    async (source) => {
      const code = `import { useServerData as readServerData } from '${source}';
export function App() {
  const value = readServerData('value', 'fallback');
  return <div>{value}</div>;
}`;

      for (const isServer of [false, true]) {
        const result = await transformModules({
          ...options,
          isServer,
          input: [{ path: 'src/component.tsx', code }],
        });
        const output = result.modules.map((module) => module.code).join('\n');

        expect(result.diagnostics).toEqual([]);
        expect(output).toContain('readServerData("value", "fallback")');
        expect(output).not.toContain('createContentBlock');
        expect(output).not.toContain('styleScopes');
        expect(output).not.toContain('ctx.scheduler.flush()');
      }
    }
  );

  test.each(['@qwik.dev/core'])(
    'treats every use* import from %s as a framework hook',
    async (source) => {
      const code = `import { useFutureHook as future } from '${source}';
export function App() { future(); return <div />; }`;

      for (const isServer of [false, true]) {
        const result = await transformModules({
          ...options,
          isServer,
          input: [{ path: 'src/component.tsx', code }],
        });
        const output = result.modules.map((module) => module.code).join('\n');

        expect(result.diagnostics).toEqual([]);
        expect(output).not.toContain('styleScopes');
        expect(output).not.toContain('ctx.scheduler.flush()');
      }
    }
  );

  test('rejects useStore inside a module boundary', async () => {
    const code = `import { useComputed$, useStore } from '@qwik.dev/core';
export const state = useComputed$(() => useStore({ value: 1 }));`;

    for (const isServer of [false, true]) {
      const result = await transformModules({
        ...options,
        isServer,
        input: [{ path: 'src/hook.ts', code }],
      });

      expect(result.diagnostics.map((item) => item.code)).toEqual([
        TransformDiagnosticCode.CustomHook,
      ]);
      expect(result.modules[0]?.code).toBe('');
    }
  });

  test('rejects useServerData inside a module boundary', async () => {
    const code = `import { useComputed$, useServerData } from '@qwik.dev/core';
export const value = useComputed$(() => useServerData('value'));`;

    for (const isServer of [false, true]) {
      const result = await transformModules({
        ...options,
        isServer,
        input: [{ path: 'src/hook.ts', code }],
      });

      expect(result.diagnostics.map((item) => item.code)).toEqual([
        TransformDiagnosticCode.CustomHook,
      ]);
      expect(result.modules[0]?.code).toBe('');
    }
  });

  test('propagates an id base into direct-array row setup', async () => {
    const code = `import { useId } from '@qwik.dev/core';
export function App() {
  const items = ['first', 'second'];
  return <div>{items.map((item) => { const id = useId(); return <span id={id}>{item}</span>; })}</div>;
}`;
    for (const isServer of [false, true]) {
      const result = await transformModules({
        ...options,
        isServer,
        input: [{ path: 'src/component.tsx', code }],
      });
      const row = result.modules.find((module) => module.segment?.ctxName === 'collection:render');
      const text = result.modules.find((module) => module.segment?.ctxName === 'text');
      const main = result.modules[0]?.code ?? '';

      expect(result.diagnostics).toEqual([]);
      expect(row).toBeUndefined();
      expect(text).toBeDefined();
      expect(main).toContain("_id + 'f0-'");
      expect(main).toContain("_id + 'u0'");
      expect(main).toContain(text!.segment!.name);
    }
  });

  test('uses the generic attribute serializer for a value derived from useId', async () => {
    const code = `import { useId } from '@qwik.dev/core';
export function App() {
  const id = useId();
  return <label hidden={id.length === 0}>Name</label>;
}`;
    const csr = await transformModules({
      ...options,
      input: [{ path: 'src/component.tsx', code }],
    });
    const ssr = await transformModules({
      ...options,
      isServer: true,
      input: [{ path: 'src/component.tsx', code }],
    });

    expect(csr.diagnostics).toEqual([]);
    expect(ssr.diagnostics).toEqual([]);
    expect(csr.modules[0]?.code).toMatch(/patchAttrValue\(el0, ["']hidden["'], id\.length === 0\)/);
    expect(ssr.modules[0]?.code).toMatch(
      /\.\.\.renderDomPropsToString\(\{ ["']hidden["']: id\.length === 0 \}\)\.attrs/
    );
  });

  test('keeps an SSR component with a blocking task promise-capable', async () => {
    const code = `import { useTask$ } from '@qwik.dev/core';
function Child() {
  useTask$(() => undefined);
  return <span>Child</span>;
}
export function App() {
  return <section><Child /></section>;
}`;
    const result = await transformModules({
      ...options,
      isServer: true,
      input: [{ path: 'src/component.tsx', code }],
    });

    expect(result.diagnostics).toEqual([]);
    expect(result.modules[0]?.code).toContain('maybeThen(');
  });

  test('does not pass an id base to an unrelated direct-array row', async () => {
    const code = `import { useId } from '@qwik.dev/core';
function Child() { const id = useId(); return <span id={id} />; }
export function App() {
  const ownId = useId();
  const items = ['first'];
  return <div id={ownId}><Child />{items.map((item) => <i>{item}</i>)}</div>;
}`;
    for (const isServer of [false, true]) {
      const result = await transformModules({
        ...options,
        isServer,
        input: [{ path: 'src/component.tsx', code }],
      });

      expect(result.diagnostics).toEqual([]);
      expect(result.modules[0]?.code).toContain("_id + 'c0-'");
      expect(result.modules[0]?.code).not.toContain("_id + 'f");
    }
  });

  test('keeps async direct-array rows on the sequential collection path', async () => {
    const code = `export function App({ items }) {
  return <ul>{items.map(async (item) => <li>{await item.label()}</li>)}</ul>;
}`;
    for (const isServer of [false, true]) {
      const result = await transformModules({
        ...options,
        isServer,
        input: [{ path: 'src/component.tsx', code }],
      });
      expect(result.diagnostics).toEqual([]);
      expect(result.modules[0]?.code).toContain(
        isServer ? 'renderSsrCollection' : 'createCollection'
      );
      expect(result.modules[0]?.code).not.toContain('_wrapArray');
      expect(result.modules.map((module) => module.code).join('\n')).toContain('_await(');
    }
  });

  test('does not emit a collection source segment for a proven Qwik Source', async () => {
    const code = `import { useSignal } from '@qwik.dev/core';
export function App() {
  const items = useSignal([{ id: 'a' }]);
  return <ul>{items.value.map((item) => <li key={item.id}>{item.id}</li>)}</ul>;
}
`;
    const result = await transformModules({
      ...options,
      input: [{ path: 'src/component.tsx', code }],
    });

    expect(result.diagnostics).toEqual([]);
    expect(result.modules.some((module) => module.path.includes('_collectionSource_'))).toBe(false);
    expect(result.modules[0]?.code).toContain('createCollection');
    expect(result.modules[0]?.code).not.toContain('createForBlock');
    expect(result.modules[0]?.code).not.toContain('_wrapArray');
  });

  test('does not emit a source QRL for a direct array', async () => {
    const code = `export function App({ items }) {
  return <ul>{items.map((item) => <li>{item}</li>)}</ul>;
}
`;
    const result = await transformModules({
      ...options,
      input: [{ path: 'src/component.tsx', code }],
    });

    expect(result.diagnostics).toEqual([]);
    expect(result.modules.some((module) => module.path.includes('_collectionSource_'))).toBe(false);
    expect(result.modules[0]?.code).toContain('createCollection');
    expect(result.modules[0]?.code).not.toContain('_wrapArray');
    expect(result.modules[0]?.code).not.toContain('_id +');
  });

  test('keeps a derived source on SSR when its row uses the index', async () => {
    const code = `import { useSignal } from '@qwik.dev/core';
export function App() {
  const items = useSignal([{ id: 'a', visible: true }]);
  return <ul>{items.value.filter((item) => item.visible).map((item, index) => <li key={item.id}>{index}</li>)}</ul>;
}`;
    const result = await transformModules({
      ...options,
      isServer: true,
      input: [{ path: 'src/component.tsx', code }],
    });

    expect(result.diagnostics).toEqual([]);
    expect(result.modules.map((module) => module.code).join('\n')).toMatch(
      /_wrapArray\([^;]+, true\)/
    );
  });

  test('keeps ordinary component props inline', async () => {
    const code = `import { useSignal } from '@qwik.dev/core';
function Child() { return <p>Child</p>; }
export function App() {
  const count = useSignal(1);
  const attrs = { title: 'value' };
  return <Child {...attrs} count={count.value} innerHTML={count.value} />;
}`;
    const result = await transformModules({
      ...options,
      input: [{ path: 'src/component.tsx', code }],
    });
    const output = result.modules.map((module) => module.code).join('\n');

    expect(result.diagnostics).toEqual([]);
    expect(result.modules[0]?.code).toContain('mergeProps((attrs)');
    expect(result.modules[0]?.code).toContain('return (count.value);');
    expect(result.modules[0]?.code).toContain('dangerouslySetInnerHTML');
    expect(output).not.toContain('return attrs;');
  });

  test('keeps only true nested boundaries in component props', async () => {
    const code = `import { $, useSignal } from '@qwik.dev/core';
import { transform$ } from './api';
function Child() { return <p>Child</p>; }
export function App() {
  const count = useSignal(1);
  return <Child explicit={$(() => count.value)} implicit={transform$(() => count.value)} />;
}`;
    const csr = await transformModules({
      ...options,
      input: [{ path: 'src/component.tsx', code }],
    });
    const ssr = await transformModules({
      ...options,
      isServer: true,
      input: [{ path: 'src/component.tsx', code }],
    });
    const csrSegments = csr.modules.filter((module) => module.segment?.name.includes('segment_'));
    const ssrSegments = ssr.modules.filter((module) => module.segment?.name.includes('segment_'));

    expect(csr.diagnostics).toEqual([]);
    expect(ssr.diagnostics).toEqual([]);
    expect(csrSegments).toHaveLength(2);
    expect(ssrSegments).toHaveLength(2);
    expect(csr.modules[0]?.code).toContain('transform(_withCaptures(');
    expect(ssr.modules[0]?.code).toContain('transformQrl(q_');
  });

  test('keeps nested boundaries reachable from a structural content segment', async () => {
    const code = `import { $, useSignal } from '@qwik.dev/core';
import { render, transform$ } from './render';
export function App() {
  const count = useSignal(1);
  return <main>{render({ explicit: $(() => count.value), implicit: transform$(() => count.value) })}</main>;
}`;
    for (const isServer of [false, true]) {
      const result = await transformModules({
        ...options,
        isServer,
        input: [{ path: 'src/component.tsx', code }],
      });
      const output = result.modules.map((module) => module.code).join('\n');
      expect(result.diagnostics).toEqual([]);
      expect(result.modules.some((module) => module.segment?.ctxName === 'expression')).toBe(true);
      expect(result.modules.some((module) => module.segment?.ctxName === '$')).toBe(true);
      expect(result.modules.some((module) => module.segment?.ctxName === 'transform$')).toBe(true);
      expect(output).not.toContain('render($(');
    }
  });

  test('preserves an imported custom hook call in component setup', async () => {
    const code = `import { component$ } from '@qwik.dev/core';
import { useEvents } from './events';
export const App = component$(() => {
  useEvents();
  return <button>Save</button>;
});`;
    for (const isServer of [false, true]) {
      const result = await transformModules({
        ...options,
        isServer,
        input: [{ path: 'src/component.tsx', code }],
      });
      const output = result.modules.map((module) => module.code).join('\n');

      expect(result.diagnostics).toEqual([]);
      expect(output).toMatch(/import \{ useEvents \} from ["']\.\/events["'];/);
      expect(output).toContain('useEvents();');
    }
  });

  test('reads destructured props from the current props object in render segments', async () => {
    const code = `export function App({ label: text = 'fallback', ...rest }) {
  return <section title={text}>{text}{rest.visible ? <b>visible</b> : null}</section>;
}`;
    for (const isServer of [false, true]) {
      const result = await transformModules({
        ...options,
        isServer,
        input: [{ path: 'src/component.tsx', code }],
      });
      const segmentOutput = result.modules
        .filter(
          (module) => module.segment?.ctxName === 'text' || module.segment?.ctxName === 'attr'
        )
        .map((module) => module.code)
        .join('\n');

      expect(result.diagnostics).toEqual([]);
      expect(segmentOutput).toMatch(
        /const \{ label: text = ["']fallback["'], \.\.\.rest \} = props;/
      );
    }
  });

  test('keeps setup and event captures of destructured props initial', async () => {
    const code = `import { useSignal } from '@qwik.dev/core';
export function App({ label }) {
  const initial = useSignal(label);
  return <button onClick$={() => label}>{initial.value}</button>;
}`;
    const result = await transformModules({
      ...options,
      input: [{ path: 'src/component.tsx', code }],
    });
    const event = result.modules.find((module) => module.segment?.ctxKind === 'eventHandler');

    expect(result.diagnostics).toEqual([]);
    expect(event?.code).toContain('const label = _captures[0];');
    expect(event?.code).not.toContain('const { label } = props;');
  });

  test.each([
    [
      'imported function',
      `import { renderItem } from './render';
export function App({ value }) {
  const renderers = { item: renderItem };
  return <main>{renderers.item(value)}</main>;
}`,
    ],
    [
      'inline alias chain',
      `export function App({ value }) {
  const render = (item) => item;
  const alias = render;
  const renderers = { item: alias };
  return <main>{renderers.item(value)}</main>;
}`,
    ],
  ])('rejects a resumable aggregate capture containing an %s', async (_name, code) => {
    const result = await transformModules({
      ...options,
      input: [{ path: 'src/component.tsx', code }],
    });

    expect(result.modules).toHaveLength(1);
    expect(result.modules[0]?.code).toBe('');
    expect(result.diagnostics.map((diagnostic) => diagnostic.code)).toEqual([
      TransformDiagnosticCode.NonSerializableCapture,
    ]);
  });

  test('allows a direct imported function call in a content segment', async () => {
    const code = `import { renderItem } from './render';
export function App({ value }) {
  return <main>{renderItem(value)}</main>;
}`;
    const result = await transformModules({
      ...options,
      input: [{ path: 'src/component.tsx', code }],
    });

    expect(result.diagnostics).toEqual([]);
    expect(result.modules.some((module) => /from ["']\.\/render["']/.test(module.code))).toBe(true);
  });

  test('allows a QRL stored in a local object', async () => {
    const code = `import { $ } from '@qwik.dev/core';
export function App() {
  const handlers = { click: $(() => 1) };
  return <button onClick$={handlers.click}>Save</button>;
}`;
    const result = await transformModules({
      ...options,
      input: [{ path: 'src/component.tsx', code }],
    });

    expect(result.diagnostics).toEqual([]);
    expect(result.modules.map((module) => module.code).join('\n')).toContain('handlers.click');
  });

  test('preserves an inlined QRL and its explicit captures', async () => {
    const code = `import { inlinedQrl } from '@qwik.dev/core';
import { useSignal } from '@qwik.dev/core';
export function App() {
  const count = useSignal(0);
  const handler = inlinedQrl(() => count.value++, 'App_handler', [count]);
  return <button onClick$={handler}>increment</button>;
}`;
    for (const isServer of [false, true]) {
      const result = await transformModules({
        ...options,
        isServer,
        input: [{ path: 'src/component.tsx', code }],
      });
      const output = result.modules.map((module) => module.code).join('\n');

      expect(result.diagnostics).toEqual([]);
      expect(result.modules.filter((module) => module.segment != null)).toEqual([]);
      expect(output).toMatch(/import \{[^}]*\binlinedQrl\b[^}]*\} from ["']@qwik\.dev\/core["']/);
      expect(output).toMatch(
        /inlinedQrl\(\(\) => count\.value\+\+, ["']App_handler["'], \[count\]\)/
      );
    }
  });

  test.each([
    [
      'one',
      `function Child() { return <span>Child</span>; }
export function App() { return <section><Child /></section>; }`,
      false,
    ],
    [
      'many',
      `function Child() { return <><span>A</span><span>B</span></>; }
export function App() { return <section><Child /></section>; }`,
      false,
    ],
    [
      'unknown',
      `import { Child } from './child';
export function App() { return <section><Child /></section>; }`,
      true,
    ],
  ])('uses %s local component cardinality in CSR', async (_name, code, usesNormalization) => {
    const result = await transformModules({
      ...options,
      input: [{ path: 'src/component.tsx', code }],
    });
    const output = result.modules.map((module) => module.code).join('\n');

    expect(result.diagnostics).toEqual([]);
    expect(output.includes('_toNodes')).toBe(usesNormalization);
    if (_name === 'many') {
      expect(output).toMatch(/for \(const node of component\d+\)/);
    }
  });

  test('keeps a local async component on the maybe-promise CSR path', async () => {
    const result = await transformModules({
      ...options,
      input: [
        {
          path: 'src/component.tsx',
          code: `async function Child() { return <span>Child</span>; }
export function App() { return <section><Child /></section>; }`,
        },
      ],
    });
    const main = result.modules[0]?.code ?? '';

    expect(result.diagnostics).toEqual([]);
    expect(main).toContain('scheduler.waitFor(');
    expect(main).toContain('maybeThen(createComponent');
  });

  test('preserves the main module and emits binding-aware imports for extracted entries', async () => {
    const code = `'use strict';
// retained comment
import payload from './payload.json' with { type: 'json' };
import * as tools from './tools';
import { named as alias } from './named';
import './side-effect'; // retained import comment

const localValue = 1;
export const version = 'v2';

function Child() {
  return <button onClick$={() => consume(payload, tools, alias, localValue)}>run</button>;
}

export function App() {
  return <Child />;
}
`;
    const result = await transformModules({
      ...options,
      input: [{ path: 'src/component.tsx', code }],
    });

    expect(result.diagnostics).toEqual([]);
    const main = result.modules.find((module) => module.path === 'src/component.tsx')!;
    const component = result.modules.find((module) => module.path.includes('_component_Child'))!;
    const event = result.modules.find((module) => module.path.includes('_q_e_click_'))!;

    expect(main.code.trimStart()).toMatch(/^["']use strict["'];/);
    expect(main.code).toContain('// retained comment');
    expect(main.code).toContain(`import "./side-effect";`);
    expect(main.code.indexOf('// retained import comment')).toBeLessThan(
      main.code.indexOf('import { Child }')
    );
    expect(main.code).not.toContain('./payload.json');
    expect(main.code).toContain(`export const version = "v2";`);
    expect(main.code).toContain('export { localValue };');

    expect(component.code).not.toContain('./side-effect');
    expect(component.code).not.toContain('./payload.json');
    expect(event.code).toContain(`import payload from "./payload.json" with { "type": "json" };`);
    expect(event.code).toContain(`import * as tools from "./tools";`);
    expect(event.code).toContain(`import { named as alias } from "./named";`);
    expect(event.code).toContain(`import { localValue } from "./component";`);
  });

  test('rejects a write to a top-level binding from an extracted component', async () => {
    const code = `let counter = 0;
function Child() {
  counter++;
  return <span>{counter}</span>;
}
export function App() {
  return <Child />;
}
`;
    const result = await transformModules({
      ...options,
      input: [{ path: 'src/component.tsx', code }],
    });

    expect(result.modules).toHaveLength(1);
    expect(result.modules[0].code).toBe('');
    expect(result.diagnostics).toHaveLength(1);
    expect(result.diagnostics[0].code).toBe(TransformDiagnosticCode.ModuleWrite);
    expect(result.diagnostics[0].message).toBe(
      'Extracted module cannot assign to top-level binding "counter".'
    );
  });

  test('rejects a write to a top-level binding from an extracted QRL segment', async () => {
    const code = `let counter = 0;
export function App() {
  return <button onClick$={() => counter++}>increment</button>;
}
`;
    const result = await transformModules({
      ...options,
      input: [{ path: 'src/component.tsx', code }],
    });

    expect(result.modules).toHaveLength(1);
    expect(result.modules[0].code).toBe('');
    expect(result.diagnostics.map((diagnostic) => diagnostic.code)).toEqual([
      TransformDiagnosticCode.ModuleWrite,
    ]);
  });
});

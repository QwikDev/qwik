import type {
  TransformModuleInput,
  TransformModulesOptions,
  TransformOutput,
} from '@qwik.dev/optimizer';
import { parseSync } from 'oxc-parser';
import { describe, expect, test } from 'vitest';
import { TargetImportResolver } from './emit-qrl';
import { transformModules } from './index';

const options = (input: TransformModuleInput, isServer: boolean): TransformModulesOptions => ({
  input: [input],
  srcDir: 'src',
  sourceMaps: false,
  transpileTs: true,
  transpileJsx: true,
  isServer,
});

describe('setup QRL emission', () => {
  test('reuses a provided natural import from the same module', () => {
    const imports = new TargetImportResolver();

    expect(imports.resolve('@qwik.dev/core', 'useComputed', [])).toBe('useComputed');
    expect(
      imports.declarations({
        source: '@qwik.dev/core',
        names: new Set(['useComputed']),
      })
    ).toEqual([]);
  });

  test('keeps ctx in the render QRL ABI', async () => {
    const input = {
      path: 'src/suspense-render-abi.tsx',
      code: `import { Suspense } from '@qwik.dev/core';
import { Child } from './child';
export function App({ visible }) {
  const content = ['static suspense'];
  return <main>
    <Suspense>{content}</Suspense>
    <Suspense><Child /><Suspense><b>nested suspense</b></Suspense></Suspense>
    {visible && <i>static branch</i>}
  </main>;
}`,
    };

    for (const isServer of [false, true]) {
      const result = await transformModules(options(input, isServer));
      const suspense = result.modules.filter((module) => module.path.includes('suspense_content'));
      const staticSuspense = suspense.find((module) => module.code.includes('content = _captures'));
      const contextSuspense = suspense.find((module) => module.code.includes('createComponent'));
      const branch = result.modules.find((module) => module.path.includes('branch_then'));

      expect(result.diagnostics).toEqual([]);
      expect(suspense).toHaveLength(3);
      expect(staticSuspense?.code).toMatch(/= \(ctx\) =>/);
      expect(contextSuspense?.code).toMatch(/= \(ctx\) =>/);
      expect(contextSuspense?.code).toContain(isServer ? 'createSsrSuspense' : 'createSuspense');
      expect(branch?.code).toMatch(isServer ? /= \(\) =>/ : /= \(ctx\) =>/);
    }
  });

  test('lowers component-local JSX QRLs without a consumer-specific role', async () => {
    const input = {
      path: 'src/local-view.tsx',
      code: `import { $ } from '@qwik.dev/core';
export function App() {
  const view = $((label) => <i>{label}</i>);
  return <button onClick$={(event) => event.preventDefault()}>{String(view)}</button>;
}`,
    };

    for (const isServer of [false, true]) {
      const result = await transformModules(options(input, isServer));
      const view = result.modules.find((module) => module.path.includes('$_segment'));
      const event = result.modules.find((module) => module.segment?.ctxName === 'onClick$');

      expect(result.diagnostics).toEqual([]);
      expectValidModules(result.modules);
      expect(view?.code).toMatch(/= \(ctx, label\) =>/);
      expect(view?.code).not.toMatch(/=>\s*<i>|return\s*<i>/);
      expect(view?.code).toContain(
        isServer ? 'createSsrElementRecord("i"' : 'createTemplate("<i> </i>")'
      );
      expect(event?.code).toMatch(/= \(event\) =>/);
    }
  });

  test('lowers JSX in generic implicit QRL boundaries', async () => {
    const input = {
      path: 'src/custom-view.tsx',
      code: `import { renderView$ } from './view';
export function App() {
  renderView$((label) => <i>{label}</i>);
  return <main />;
}`,
    };

    for (const isServer of [false, true]) {
      const result = await transformModules(options(input, isServer));
      const view = result.modules.find((module) => module.segment?.ctxName === 'renderView$');

      expect(result.diagnostics).toEqual([]);
      expectValidModules(result.modules);
      expect(view?.code).toMatch(/= \(ctx, label\) =>/);
      expect(view?.code).not.toMatch(/=>\s*<i>|return\s*<i>/);
      expect(view?.code).toContain(
        isServer ? 'createSsrElementRecord("i"' : 'createTemplate("<i> </i>")'
      );
    }
  });

  test('emits JSX-bearing Suspense fallback QRLs through target-native renderers', async () => {
    const input = {
      path: 'src/suspense-qrl.tsx',
      code: `import { Suspense } from '@qwik.dev/core';
export function App() {
  return <Suspense fallback$={() => <i>wait</i>}><span>ready</span></Suspense>;
}`,
    };

    for (const isServer of [false, true]) {
      const result = await transformModules(options(input, isServer));
      const fallback = result.modules.find((module) => module.path.includes('fallback$_segment'));

      expect(result.diagnostics).toEqual([]);
      expectValidModules(result.modules);
      expect(fallback?.code).not.toMatch(/=>\s*<i>|return\s*<i>/);
      expect(fallback?.code).not.toContain('Reveal');
      expect(fallback?.code).not.toContain('q-s');
      expect(fallback?.code).toContain(
        isServer ? 'return "<i>wait</i>";' : 'createTemplate("<i>wait</i>")'
      );
    }
  });

  test('transforms boundaries in a module without components', async () => {
    const input = {
      path: 'src/use-counter.ts',
      code: `import { useComputed$, useSignal } from '@qwik.dev/core';
export function useCounter(initial) {
  const count = useSignal(initial);
  const double = useComputed$(async () => count.value * 2, { initial: 0 });
  return { count, double };
}
`,
    };

    const ssr = await transformModules(options(input, true));
    const csr = await transformModules(options(input, false));
    const ssrMain = ssr.modules[0]?.code ?? '';
    const csrMain = csr.modules[0]?.code ?? '';
    const symbol = segmentNames(csr, 'useComputed$')[0];

    expectValidModules(ssr.modules);
    expectValidModules(csr.modules);
    expect(ssr.diagnostics).toEqual([]);
    expect(csr.diagnostics).toEqual([]);
    expect(ssr.modules).toHaveLength(2);
    expect(csr.modules).toHaveLength(2);
    expect(ssrMain).toContain(`useComputedQrl(q_${symbol}.w([count]), { initial: 0 })`);
    expect(csrMain).toContain(`useComputed(_withCaptures(${symbol}, [count]), { initial: 0 })`);
  });

  test('transforms useTask$ inside a component-free custom hook module', async () => {
    const input = {
      path: 'src/use-task-hook.ts',
      code: `import { useSignal, useTask$ } from '@qwik.dev/core';
export function useCounterTask() {
  const count = useSignal(0);
  useTask$(() => count.value++);
  return count;
}
`,
    };

    const ssr = await transformModules(options(input, true));
    const csr = await transformModules(options(input, false));
    const symbol = segmentNames(csr, 'useTask$')[0];

    expectValidModules(ssr.modules);
    expectValidModules(csr.modules);
    expect(csr.modules[0]?.code).toContain(`useTask(_withCaptures(${symbol}, [count]))`);
    expect(ssr.modules[0]?.code).toContain(`useTaskQrl(q_${symbol}.w([count]))`);
  });

  test('turns a module visible task into an SSR event carrier', async () => {
    const input = {
      path: 'src/use-visible.ts',
      code: `import { useVisibleTask$ } from '@qwik.dev/core';
export function useVisible() {
  useVisibleTask$(() => console.log('visible'), { strategy: 'document-ready' });
}
`,
    };

    const ssr = await transformModules(options(input, true));
    const csr = await transformModules(options(input, false));
    const main = ssr.modules[0]?.code ?? '';
    const csrMain = csr.modules[0]?.code ?? '';
    const symbol = segmentNames(csr, 'useVisibleTask$')[0];

    expect(ssr.diagnostics).toEqual([]);
    expect(csr.diagnostics).toEqual([]);
    expect(main).toContain(`useOnDocument("qinit", createVisibleTaskHandlerQrl(q_${symbol}))`);
    expect(main).not.toContain('useVisibleTaskQrl');
    expect(csrMain).toContain(`useVisibleTask(${symbol}, {`);
    expect(csrMain).not.toContain('useVisibleTaskQrl');
  });

  test('waits for task work hidden behind an imported custom hook', async () => {
    const input = {
      path: 'src/custom-task.tsx',
      code: `import { useCounterTask as task } from './use-counter';
export function App() {
  const count = task();
  return <p>{count.value}</p>;
}
`,
    };

    const ssr = await transformModules(options(input, true));
    const csr = await transformModules(options(input, false));
    const main = ssr.modules[0]?.code ?? '';
    const csrMain = csr.modules[0]?.code ?? '';

    expect(ssr.diagnostics).toEqual([]);
    expect(csr.diagnostics).toEqual([]);
    expect(main).toContain('const invokeCtx = getActiveInvokeContextOrNull();');
    expect(main).toContain('task();');
    expect(main).toContain('maybeThen(ctx.scheduler.flush(), () => invoke(invokeCtx, () => {');
    expect(csrMain).toContain('const invokeCtx = getActiveInvokeContext();');
    expect(csrMain).toContain('task();');
    expect(csrMain).toContain(
      'maybeThen(invokeCtx.initialTaskPromise, () => invoke(invokeCtx, () => {'
    );
  });

  test('lowers module style boundaries without a style segment module', async () => {
    const input = {
      path: 'src/use-red.ts',
      code: `import { useStyles$, useStylesScoped$ } from '@qwik.dev/core';
export function useRed() {
  useStyles$('body { color: black }');
  return useStylesScoped$('.red { color: red }');
}
`,
    };

    const ssr = await transformModules(options(input, true));
    const csr = await transformModules(options(input, false));

    expect(ssr.diagnostics).toEqual([]);
    expect(csr.diagnostics).toEqual([]);
    expect(ssr.modules).toHaveLength(1);
    expect(csr.modules).toHaveLength(1);
    expect(ssr.modules[0]?.code).toMatch(/useStyles\("body \{ color: black \}", "[^"]+"\)/);
    expect(csr.modules[0]?.code).toMatch(/useStyles\("body \{ color: black \}", "[^"]+"\)/);
    expect(ssr.modules[0]?.code).toMatch(
      /return \(\{ scopeId: useStylesScoped\("\.red \{ color: red \}", "[^"]+", true\) \}\);/
    );
    expect(csr.modules[0]?.code).toMatch(
      /return \(\{ scopeId: useStylesScoped\("\.red \{ color: red \}", "[^"]+", true\) \}\);/
    );
    expect(ssr.modules[0]?.code).not.toContain('_qrlWithChunk');
  });

  test('rejects a scoped style boundary hidden in a non-hook helper', async () => {
    const input = {
      path: 'src/helper.ts',
      code: `import { useStylesScoped$ } from '@qwik.dev/core';
export function helper() {
  useStylesScoped$('.red {}');
}
`,
    };

    const result = await transformModules(options(input, true));

    expect(result.modules[0]?.code).toBe('');
    expect(result.diagnostics[0]?.code).toBe('style-hook');
  });

  test('applies a custom-hook scope to author JSX but not child component JSX', async () => {
    const input = {
      path: 'src/custom-style.tsx',
      code: `import { useSignal } from '@qwik.dev/core';
import { useRed } from './use-red';
export function Child() { return <i>child</i>; }
export function App() {
  useRed();
  const active = useSignal(true);
  return <section><div class="static"/><span class={active.value}/>{active.value && <b>branch</b>}<Child/></section>;
}
`,
    };

    const ssr = await transformModules(options(input, true));
    const csr = await transformModules(options(input, false));
    const ssrMain = ssr.modules[0]?.code ?? '';
    const csrMain = csr.modules[0]?.code ?? '';
    const csrChild = csr.modules.find((module) => module.path.includes('_component_Child'))?.code;
    const csrBranch = csr.modules.find((module) => module.path.includes('branch_then'))?.code ?? '';

    expect(ssr.diagnostics).toEqual([]);
    expect(csr.diagnostics).toEqual([]);
    expect(ssrMain).toContain("getActiveInvokeContext().styleScopes?.join(' ')");
    expect(csrMain).toContain("getActiveInvokeContext().styleScopes?.join(' ')");
    expect(csrMain).toContain('styleScope0 + " static"');
    expect(csrMain).toContain('createAttrEffect(el2, "class", active, ctx.scheduler, styleScope0)');
    expect(csrMain).toContain('styleScope0])');
    expect(csrBranch).toContain('styleScope0 = _captures[');
    expect(csrBranch).toContain('className = styleScope0');
    expect(csrChild).not.toContain('styleScopes');
  });

  test('numbers a custom-hook scope after colliding component bindings', async () => {
    const input = {
      path: 'src/custom-style-collision.tsx',
      code: `import { useRed } from './use-red';
export function App() {
  const styleScope0 = 'first';
  const styleScope1 = 'second';
  useRed();
  return <div>{styleScope0}{styleScope1}</div>;
}
`,
    };

    const csr = await transformModules(options(input, false));
    const main = csr.modules[0]?.code ?? '';

    expect(csr.diagnostics).toEqual([]);
    expect(main).toContain("const styleScope2 = getActiveInvokeContext().styleScopes?.join(' ');");
  });

  test('rejects namespace custom hook calls', async () => {
    const input = {
      path: 'src/namespace-hook.tsx',
      code: `import * as hooks from './hooks';
export function App() {
  hooks.useFeature();
  return <p>ready</p>;
}
`,
    };

    const result = await transformModules(options(input, true));

    expect(result.modules[0]?.code).toBe('');
    expect(result.diagnostics[0]?.code).toBe('custom-hook');
  });

  test('rejects a custom hook inside a collection row render function', async () => {
    const input = {
      path: 'src/row-hook.tsx',
      code: `import { useFeature } from './feature';
export function App({ items }) {
  return <ul>{items.map((item) => {
    useFeature();
    return <li>{item}</li>;
  })}</ul>;
}
`,
    };

    const result = await transformModules(options(input, false));

    expect(result.modules[0]?.code).toBe('');
    expect(result.diagnostics[0]?.code).toBe('custom-hook');
  });

  test('maps boundary-only main and segment modules', async () => {
    const input = {
      path: 'src/mapped-hook.ts',
      code: `import { useFoo$ } from 'library';
export function useMapped(value: number) {
  return useFoo$(() => value);
}
`,
    };
    const result = await transformModules({
      ...options(input, false),
      sourceMaps: true,
    });

    expect(result.diagnostics).toEqual([]);
    expect(result.modules).toHaveLength(2);
    expect(result.modules.every((module) => module.map != null)).toBe(true);
  });

  test('moves module references used only by a boundary into its segment', async () => {
    const input = {
      path: 'src/use-helper.ts',
      code: `import { useFoo$ } from 'library';
import { helper } from './helper';
export function useHelper(value) {
  return useFoo$(() => helper(value));
}
`,
    };

    const csr = await transformModules(options(input, false));
    const main = csr.modules[0]?.code ?? '';
    const segment = csr.modules.find((module) => module.segment != null)?.code ?? '';

    expectValidModules(csr.modules);
    expect(main).not.toContain(`from "./helper"`);
    expect(segment).toContain(`from "./helper"`);
    expect(segment).toContain('helper(value)');
  });

  test('preserves async and value payloads in boundary-only modules', async () => {
    const input = {
      path: 'src/use-values.ts',
      code: `import { useSerializer$ } from '@qwik.dev/core';
import { useFoo$ } from 'library';
export function useValues(value) {
  const task = useFoo$(async () => {
    await Promise.resolve();
    return value;
  });
  const serializer = useSerializer$({
    initial: 0,
    serialize: (input) => input,
    deserialize: (input) => input,
  });
  return { task, serializer };
}
`,
    };

    const csr = await transformModules(options(input, false));
    const output = csr.modules.map((module) => module.code).join('\n');
    const taskSymbol = segmentNames(csr, 'useFoo$')[0];
    const serializerSymbol = segmentNames(csr, 'useSerializer$')[0];

    expectValidModules(csr.modules);
    expect(csr.diagnostics).toEqual([]);
    expect(csr.modules.filter((module) => module.segment != null)).toHaveLength(2);
    expect(output).toContain(`export const ${taskSymbol} = async () =>`);
    expect(output).toContain('(await _await(Promise.resolve()))();');
    expect(output).toContain(`useSerializer(${serializerSymbol})`);
  });

  test('transforms independent component and module boundaries together', async () => {
    const input = {
      path: 'src/mixed.tsx',
      code: `import { useComputed$, useSignal } from '@qwik.dev/core';
export function useDouble(value) {
  return useComputed$(() => value.value * 2);
}
export function App() {
  const count = useSignal(1);
  return <p>{count.value}</p>;
}
`,
    };

    for (const isServer of [false, true]) {
      const result = await transformModules(options(input, isServer));
      const output = result.modules.map((module) => module.code).join('\n');
      expectValidModules(result.modules);
      expect(result.diagnostics).toEqual([]);
      expect(output).toContain('mixed_useComputed$_segment_0');
      expect(result.modules.filter((module) => module.segment != null)).toHaveLength(1);
    }
  });

  test('reuses target aliases and preserves marker value uses without a component', async () => {
    const input = {
      path: 'src/custom-hook.ts',
      code: `import { useFoo$ as marker, useFoo as direct, useFooQrl as lazy } from 'library';
export const retained = [marker, direct, lazy];
export function useCustom(value) {
  return marker(() => value, { mode: 'test' });
}
`,
    };

    const ssr = await transformModules(options(input, true));
    const csr = await transformModules(options(input, false));
    const ssrMain = ssr.modules[0]?.code ?? '';
    const csrMain = csr.modules[0]?.code ?? '';
    const symbol = segmentNames(csr, 'useFoo$')[0];

    expectValidModules(ssr.modules);
    expectValidModules(csr.modules);
    expect(csrMain).toContain('useFoo$ as marker');
    expect(ssrMain).toContain('useFoo$ as marker');
    expect(csrMain).toContain(`direct(_withCaptures(${symbol}, [value]), { mode: "test" })`);
    expect(ssrMain).toContain(`lazy(q_${symbol}.w([value]), { mode: "test" })`);
  });

  test('uses target names directly when marker value uses prevent retargeting', async () => {
    const input = {
      path: 'src/custom-hook.tsx',
      code: `import { marker$ } from 'library';
export const retained = marker$;
export function App() {
  marker$(() => 1);
  return <p>App</p>;
}
`,
    };

    const csr = await transformModules(options(input, false));
    const main = csr.modules[0]?.code ?? '';
    const symbol = segmentNames(csr, 'marker$')[0];

    expectValidModules(csr.modules);
    expect(csr.diagnostics).toEqual([]);
    expect(main).toContain('import { marker } from "library";');
    expect(main).toContain(`marker(${symbol});`);
    expect(main).not.toContain('__qwik_marker');
  });

  test('transforms nested module boundaries transitively', async () => {
    const input = {
      path: 'src/nested-hook.tsx',
      code: `import { outer$, inner$ } from 'library';
export function useNested(value) {
  return outer$(() => inner$(() => <span>{value}</span>));
}
`,
    };

    const ssr = await transformModules(options(input, true));
    const csr = await transformModules(options(input, false));

    expect(ssr.diagnostics).toEqual([]);
    expect(csr.diagnostics).toEqual([]);
    expectValidModules(ssr.modules);
    expectValidModules(csr.modules);
    expect(ssr.modules.filter((module) => module.segment != null).length).toBeGreaterThanOrEqual(2);
    expect(csr.modules.filter((module) => module.segment != null).length).toBeGreaterThanOrEqual(2);
    expect(ssr.modules.map((module) => module.code).join('\n')).toContain('innerQrl');
    expect(csr.modules.map((module) => module.code).join('\n')).toContain('inner(');
    expect(ssr.modules.map((module) => module.code).join('\n')).not.toMatch(/=>\s*<span/);
    expect(csr.modules.map((module) => module.code).join('\n')).not.toMatch(/=>\s*<span/);
  });

  test('uses exported local companions in a module without components', async () => {
    const input = {
      path: 'src/local-hook.ts',
      code: `export const useLocal$ = (value) => value;
export const useLocal = (value) => value;
export const useLocalQrl = (value) => value;
export function useHook(value) {
  return useLocal$(() => value);
}
`,
    };

    const ssr = await transformModules(options(input, true));
    const csr = await transformModules(options(input, false));
    const symbol = segmentNames(csr, 'useLocal$')[0];

    expectValidModules(ssr.modules);
    expectValidModules(csr.modules);
    expect(csr.modules[0]?.code).toContain(`useLocal(_withCaptures(${symbol}, [value]))`);
    expect(ssr.modules[0]?.code).toContain(`useLocalQrl(q_${symbol}.w([value]))`);
  });

  test('diagnoses a missing local target companion without partial output', async () => {
    const input = {
      path: 'src/missing-hook.ts',
      code: `export const useLocal$ = (value) => value;
export function useHook() {
  return useLocal$(() => 1);
}
`,
    };

    const result = await transformModules(options(input, false));
    expect(result.modules[0]?.code).toBe('');
    expect(result.diagnostics).toHaveLength(1);
    expect(result.diagnostics[0]?.code).toBe('missing-direct-implementation');
  });

  test('diagnoses a module boundary without an extractable first argument', async () => {
    const input = {
      path: 'src/invalid-hook.ts',
      code: `import { useFoo$ } from 'library';
export function useInvalid() {
  useFoo$();
}
`,
    };

    const result = await transformModules(options(input, false));
    expect(result.modules[0]?.code).toBe('');
    expect(result.diagnostics).toHaveLength(1);
    expect(result.diagnostics[0]?.code).toBe('implicit-dollar-argument');
  });

  test('lowers JSX in module boundaries and inline factory components', async () => {
    const input = {
      path: 'src/factory.tsx',
      code: `import { component$, implicit$FirstArg } from '@qwik.dev/core';

export function factory(Component) {
  return component$((props) => <div><Component {...props} /></div>);
}

export function factoryQrl(componentQRL) {
  return component$((props) => {
    const component = componentQRL.resolve();
    return <div>{component.then((Cmp) => <Cmp {...props} />)}</div>;
  });
}
export const factory$ = implicit$FirstArg(factoryQrl);

export const A = factory$((props) => <span>{props.label}</span>);
export function Light(props) {
  return <i>{props.label}</i>;
}
export const B = factory$(Light);
`,
    };

    for (const isServer of [false, true]) {
      const result = await transformModules(options(input, isServer));
      const main = result.modules[0]?.code ?? '';
      const view = result.modules.find((module) => module.segment?.ctxName === 'factory$');
      const output = result.modules.map((module) => module.code).join('\n');

      expect(result.diagnostics).toEqual([]);
      expectValidModules(result.modules);
      expect(main).toContain(isServer ? 'factoryQrl(' : 'factory(');
      expect(output).toContain(isServer ? 'createSsrElementRecord("div"' : 'createTemplate("<div>');
      expect(output).not.toMatch(/(?:=>|return)\s*\(?\s*</);
      expect(main).not.toContain('component$(');
      expect(output).not.toContain('_markRenderQrl');
      expect(output).not.toContain('_invokeComponent');
      expect(view?.code).toMatch(/= \(props, ctx\) =>/);
      expect(view?.code).not.toMatch(/=>\s*<span>|return\s*<span>/);
      const factoryComponent = result.modules.find(
        (module) => module.code.includes('component.then') && module.code.includes('_captures')
      );
      expect(factoryComponent).toBeDefined();
      expect(factoryComponent!.code).toContain('componentQRL = _captures[0]');
      expect(factoryComponent!.code).toMatch(/\(props, ctx\) =>|function \w+\(props, ctx\)/);
      expect(factoryComponent!.code).not.toMatch(/\(componentQRL, props(?:, ctx)?\)/);
      if (isServer) {
        const propsQrl = factoryComponent!.code.match(/useComputedQrl\((q_[\w$]+)/)?.[1];
        expect(propsQrl).toBeDefined();
        expect(factoryComponent!.code).toContain(`const ${propsQrl} =`);
      } else {
        const propsSegment = factoryComponent!.code.match(
          /withCaptures\(([\w$]*componentProps[\w$]*)/
        )?.[1];
        expect(propsSegment).toBeDefined();
        expect(factoryComponent!.code).toContain(`import { ${propsSegment} }`);
      }
      expect(main).toContain(isServer ? 'componentQrl(' : '_withCaptures(');
    }
  });

  test('lowers JSX in ordinary component factories without component$', async () => {
    const input = {
      path: 'src/plain-factory.tsx',
      code: `export function factory(Component) {
  return (props) => <div><Component {...props} /></div>;
}

export const A = factory((props) => <span>{props.label}</span>);
export function App() {
  return <A label="A" />;
}
`,
    };

    for (const isServer of [false, true]) {
      const result = await transformModules(options(input, isServer));
      const output = result.modules.map((module) => module.code).join('\n');

      expect(result.diagnostics).toEqual([]);
      expectValidModules(result.modules);
      expect(output).toContain('function factory(Component)');
      expect(output).toContain('createComponent(');
      expect(output).toContain(isServer ? '<span' : 'createTemplate("<span>');
      expect(output).not.toMatch(/(?:=>|return)\s*\(?\s*</);
    }
  });

  test('lowers module JSX QRLs with multiple return paths', async () => {
    const input = {
      path: 'src/invalid-factory.tsx',
      code: `import { factory$ } from './factory';
export const View = factory$((visible) => {
  if (visible) return <span>yes</span>;
  return <span>no</span>;
});
`,
    };

    for (const isServer of [false, true]) {
      const result = await transformModules(options(input, isServer));
      const output = result.modules.map((module) => module.code).join('\n');
      const view = result.modules.find((module) => module.segment?.ctxName === 'factory$');

      expect(result.diagnostics).toEqual([]);
      expectValidModules(result.modules);
      expect(view?.code).toMatch(/= \(visible, ctx\) =>/);
      expect(view?.code).toContain('if (visible)');
      expect(output).not.toMatch(/return\s*<span>|=>\s*<span>/);
      expect(output).toContain(
        isServer ? '<span>yes</span>' : 'createTemplate("<span>yes</span>")'
      );
      expect(output).toContain(isServer ? '<span>no</span>' : 'createTemplate("<span>no</span>")');
    }
  });

  test('preserves authored parameters for explicit JSX QRLs', async () => {
    const input = {
      path: 'src/explicit-view.tsx',
      code: `import { $ } from '@qwik.dev/core';
export const view = $((label) => <span>{label}</span>);
`,
    };

    for (const isServer of [false, true]) {
      const result = await transformModules(options(input, isServer));
      const view = result.modules.find((module) => module.segment?.ctxName === '$');

      expect(result.diagnostics).toEqual([]);
      expectValidModules(result.modules);
      expect(view?.code).toMatch(/= \(label\) =>/);
      expect(view?.code).not.toMatch(/= \(ctx, label\) =>/);
      expect(view?.code).toContain('const ctx = invokeCtx.container;');
    }
  });

  test('lowers JSX inside callbacks without recognizing the called API', async () => {
    const input = {
      path: 'src/callback-view.tsx',
      code: `import { Child } from './child';
import { runLater, choose } from './scheduler';
export function App(props) {
  return <main>
    {runLater(() => <Child label={props.label} />)}
    {choose(props.enabled, () => {
      if (props.enabled) return <b>yes</b>;
      return <i>no</i>;
    })}
  </main>;
}
`,
    };

    for (const isServer of [false, true]) {
      const result = await transformModules(options(input, isServer));
      const output = result.modules.map((module) => module.code).join('\n');
      const content = result.modules.filter((module) => module.segment?.ctxName === 'expression');

      expect(result.diagnostics).toEqual([]);
      expectValidModules(result.modules);
      expect(output).toContain('runLater(() =>');
      expect(output).toContain('choose(props.enabled, () =>');
      expect(output).toContain('if (props.enabled)');
      expect(output).toContain('const invokeCtx = getActiveInvokeContext();');
      expect(output).toContain('invoke(invokeCtx, () =>');
      expect(output).not.toMatch(/(?:=>|return)\s*\(?\s*</);
      expect(content.length).toBeGreaterThanOrEqual(1);
      const scheduled = result.modules.find((module) => module.code.includes('runLater('));
      expect(scheduled).toBeDefined();
      expect(scheduled!.code.indexOf('getActiveInvokeContext()')).toBeLessThan(
        scheduled!.code.indexOf('runLater(')
      );
      for (const module of content) {
        const callback = Math.max(module.code.indexOf('runLater('), module.code.indexOf('choose('));
        expect(module.code.indexOf('getActiveInvokeContext()')).toBeLessThan(callback);
      }
    }
  });

  test('lowers callback JSX in a direct component return value', async () => {
    const input = {
      path: 'src/direct-callback.tsx',
      code: `import { component$ } from '@qwik.dev/core';
import { runLater } from './scheduler';
export const App = component$(() => runLater(() => <div>later</div>));
`,
    };

    for (const isServer of [false, true]) {
      const result = await transformModules(options(input, isServer));
      const output = result.modules.map((module) => module.code).join('\n');

      expect(result.diagnostics).toEqual([]);
      expectValidModules(result.modules);
      expect(output).toContain('runLater(() =>');
      expect(output).toContain(
        isServer ? 'createSsrElementRecord("div"' : 'createTemplate("<div>later</div>")'
      );
      expect(output).not.toMatch(/=>\s*<div/);
    }
  });

  test('preserves semantic diagnostic codes for module JSX QRLs', async () => {
    const input = {
      path: 'src/async-factory.tsx',
      code: `import { factory$ } from './factory';
import { useSignal } from '@qwik.dev/core';
export const View = factory$(() => {
  const items = useSignal([{ label: async () => 'A' }]);
  return <ul>{items.value.map(async (item) => <li>{await item.label()}</li>)}</ul>;
});
`,
    };

    const result = await transformModules(options(input, false));

    expect(result.modules[0]?.code).toBe('');
    expect(result.diagnostics).toHaveLength(1);
    expect(result.diagnostics[0]?.code).toBe('async-for');
  });

  test('lowers JSX in module callbacks without classifying the called API', async () => {
    const input = {
      path: 'src/detached.tsx',
      code: `import { register } from './library';
export const value = register(() => <div>detached</div>);
`,
    };

    const result = await transformModules(options(input, false));

    expect(result.diagnostics).toEqual([]);
    expectValidModules(result.modules);
    expect(result.modules[0]?.code).toContain('register(() =>');
    expect(result.modules[0]?.code).toContain('createTemplate("<div>detached</div>")');
    expect(result.modules[0]?.code).not.toMatch(/=>\s*<div>/);
  });

  test('preserves multiple returns in an ordinary JSX function', async () => {
    const input = {
      path: 'src/ordinary-returns.tsx',
      code: `import { register } from './library';
function renderChoice(visible) {
  if (visible) return <b>yes</b>;
  return <i>no</i>;
}
export const value = register(renderChoice);
`,
    };

    for (const isServer of [false, true]) {
      const result = await transformModules(options(input, isServer));
      const output = result.modules.map((module) => module.code).join('\n');

      expect(result.diagnostics).toEqual([]);
      expectValidModules(result.modules);
      expect(output).toContain('if (visible)');
      expect(output).not.toMatch(/return\s*<[^>]+>/);
    }
  });

  test('rejects JSX evaluated during module initialization', async () => {
    const input = {
      path: 'src/module-jsx.tsx',
      code: `export const value = <div>detached</div>;`,
    };

    const result = await transformModules(options(input, false));

    expect(result.modules[0]?.code).toBe('');
    expect(result.diagnostics).toHaveLength(1);
    expect(result.diagnostics[0]?.code).toBe('unsupported-runtime-jsx');
  });

  test('keeps the linear return contract for ordinary components', async () => {
    const input = {
      path: 'src/non-linear-component.tsx',
      code: `export function App(props) {
  if (props.visible) return <main>yes</main>;
  return <aside>no</aside>;
}
`,
    };

    const result = await transformModules(options(input, false));

    expect(result.modules[0]?.code).toBe('');
    expect(result.diagnostics).toHaveLength(1);
    expect(result.diagnostics[0]?.code).toBe('unsupported-component-shape');
  });

  test('emits useTaskQrl for SSR and useTask with a function for CSR', async () => {
    const input = {
      path: 'src/task.tsx',
      code: `import { useSignal, useTask$ } from '@qwik.dev/core';
export function App() {
  const count = useSignal(0);
  useTask$(async () => {
    await Promise.resolve();
    return count.value;
  }, { deferUpdates: false });
  return <button>{count.value}</button>;
}
`,
    };

    const ssr = await transformModules(options(input, true));
    const csr = await transformModules(options(input, false));
    const ssrMain = ssr.modules[0]?.code ?? '';
    const csrMain = csr.modules[0]?.code ?? '';
    const symbol = segmentNames(csr, 'useTask$')[0];

    expectValidModules(ssr.modules);
    expectValidModules(csr.modules);

    expect(ssr.modules).toHaveLength(2);
    expect(ssrMain).toContain(`useTaskQrl(q_${symbol}.w([count]), {`);
    expect(ssrMain).not.toContain('runTaskSubscriber');
    expect(ssrMain).not.toContain('ctx.addRoot(task');
    expect(ssrMain).toContain(
      'return maybeThen(ctx.scheduler.flush(), () => invoke(invokeCtx, () => {'
    );
    expect(ssrMain).toContain('export function App(props, ctx)');

    expect(csr.modules).toHaveLength(2);
    expect(csrMain).toContain(
      `useTask(_withCaptures(${symbol}, [count]), { deferUpdates: false });`
    );
    expect(csrMain).not.toContain('useTaskQrl');
    expect(csrMain).not.toContain('_qrlWithChunk');
    expect(csrMain).toContain('const invokeCtx = getActiveInvokeContext();');
    expect(csrMain).toContain(
      'return maybeThen(invokeCtx.initialTaskPromise, () => invoke(invokeCtx, () => {'
    );
    expect(csr.modules[1]?.code).toContain(`export const ${symbol} = async () => {`);
    expect(csr.modules[1]?.code).toContain('import { _captures, _await }');
    expect(csr.modules[1]?.code).toContain('(await _await(Promise.resolve()))();');
    expect(csr.modules[1]?.code).not.toContain('yield');
  });

  test('emits QRL hooks on SSR and function hooks on CSR', async () => {
    const input = {
      path: 'src/computed.tsx',
      code: `import { useComputed$, useSignal } from '@qwik.dev/core';
export function App() {
  const count = useSignal(1);
  const double = useComputed$(() => count.value * 2);
  return <p>{double.value}</p>;
}
`,
    };

    const ssr = await transformModules(options(input, true));
    const csr = await transformModules(options(input, false));
    const ssrMain = ssr.modules[0]?.code ?? '';
    const csrMain = csr.modules[0]?.code ?? '';
    const symbol = segmentNames(csr, 'useComputed$')[0];

    expect(ssrMain).toContain(`useComputedQrl(q_${symbol}.w([count]))`);
    expect(ssrMain).toContain(`q_${symbol}.s(${symbol});`);
    expect(ssrMain).not.toContain('scheduler.flush');
    expect(csrMain).toContain(`useComputed(_withCaptures(${symbol}, [count]))`);
    expect(csrMain).not.toContain('useComputedQrl');
    expect(csrMain).not.toContain('_qrlWithChunk');
  });

  test('passes a capture-free task function directly on CSR', async () => {
    const input = {
      path: 'src/plain-task.tsx',
      code: `import { useTask$ } from '@qwik.dev/core';
export function App() {
  useTask$(() => console.log('run'));
  return <p>Task</p>;
}
`,
    };

    const csr = await transformModules(options(input, false));
    const csrMain = csr.modules[0]?.code ?? '';
    const symbol = segmentNames(csr, 'useTask$')[0];

    expect(csrMain).toContain(`useTask(${symbol});`);
    expect(csrMain).not.toContain('_withCaptures');
  });

  test('emits every direct task in source order', async () => {
    const input = {
      path: 'src/tasks.tsx',
      code: `import { useSignal, useTask$ } from '@qwik.dev/core';
export function App() {
  const count = useSignal(0);
  useTask$(() => count.value++);
  useTask$(() => count.value--);
  return <p>{count.value}</p>;
}
`,
    };

    const ssr = await transformModules(options(input, true));
    const csr = await transformModules(options(input, false));
    const ssrMain = ssr.modules[0]?.code ?? '';
    const csrMain = csr.modules[0]?.code ?? '';
    const symbols = segmentNames(csr, 'useTask$');

    expectValidModules(ssr.modules);
    expectValidModules(csr.modules);
    expect(ssr.modules).toHaveLength(3);
    expect(ssrMain).toContain(`useTaskQrl(q_${symbols[0]}.w([count]))`);
    expect(ssrMain).toContain(`useTaskQrl(q_${symbols[1]}.w([count]))`);
    expect(ssrMain.indexOf(`useTaskQrl(q_${symbols[0]}`)).toBeLessThan(
      ssrMain.indexOf(`useTaskQrl(q_${symbols[1]}`)
    );
    expect(ssrMain.match(/ctx\.scheduler\.flush\(\)/g)).toHaveLength(1);
    expect(csr.modules).toHaveLength(3);
    expect(csrMain).toContain(`useTask(_withCaptures(${symbols[0]}, [count]));`);
    expect(csrMain).toContain(`useTask(_withCaptures(${symbols[1]}, [count]));`);
    expect(csrMain.match(/initialTaskPromise/g)).toHaveLength(1);
    expect(csrMain.indexOf(`useTask(_withCaptures(${symbols[1]}`)).toBeLessThan(
      csrMain.indexOf('initialTaskPromise')
    );
  });

  test('binds explicit dollar on SSR and keeps it a qrl on CSR', async () => {
    const input = {
      path: 'src/explicit.tsx',
      code: `import { $ } from '@qwik.dev/core';
import { useSignal } from '@qwik.dev/core';
export function App() {
  const count = useSignal(0);
  const handler = $(() => count.value++);
  return <button>Ready</button>;
}
`,
    };

    const ssr = await transformModules(options(input, true));
    const csr = await transformModules(options(input, false));
    const ssrMain = ssr.modules[0]?.code ?? '';
    const csrMain = csr.modules[0]?.code ?? '';
    const symbol = segmentNames(csr, '$')[0];

    expect(ssrMain).toContain(`const handler = q_${symbol}.w([count]);`);
    // v2-parity: every server segment binds its in-module implementation via `.s()`
    expect(ssrMain).toContain(`q_${symbol}.s(`);
    // v2-parity: an explicit $() value is a qrl on every target — lazy chunk on the client
    expect(csrMain).toContain(`const handler = q_${symbol}.w([count]);`);
    expect(csrMain).toContain(`_qrlWithChunk(`);
  });

  test('uses existing same-source target aliases and removes a marker with no value uses', async () => {
    const input = {
      path: 'src/external.tsx',
      code: `import { marker$ as marker, marker as direct, markerQrl as lazy } from 'library';
import { useSignal } from '@qwik.dev/core';
export const targets = [direct, lazy];
export function App() {
  const count = useSignal(0);
  marker(() => count.value, { mode: 'test' });
  return <p>External</p>;
}
`,
    };

    const ssr = await transformModules(options(input, true));
    const csr = await transformModules(options(input, false));
    const ssrMain = ssr.modules[0]?.code ?? '';
    const csrMain = csr.modules[0]?.code ?? '';
    const symbol = segmentNames(csr, 'marker$')[0];

    expectValidModules(ssr.modules);
    expectValidModules(csr.modules);
    expect(csrMain).toContain(`direct(_withCaptures(${symbol}, [count]), { mode: "test" });`);
    expect(csrMain).not.toContain('markerQrl(');
    expect(csrMain).not.toContain('_qrlWithChunk');
    expect(ssrMain).toContain(`lazy(q_${symbol}.w([count]), { mode: "test" });`);
    expect(csrMain).not.toContain('marker$ as marker');
    expect(ssrMain).not.toContain('marker$ as marker');
    expect(csr.modules.some((module) => module.path.includes('marker$_segment_0'))).toBe(true);
    expect(ssr.modules.some((module) => module.path.includes('marker$_segment_0'))).toBe(true);
  });

  test('passes a capture-free value segment to the direct CSR API', async () => {
    const input = {
      path: 'src/serializer.tsx',
      code: `import { useSerializer$ } from '@qwik.dev/core';
export function App() {
  const value = useSerializer$({
    initial: 'ready',
    serialize(input) { return input; },
    deserialize(input) { return input; }
  });
  return <p>Serializer</p>;
}
`,
    };

    const ssr = await transformModules(options(input, true));
    const csr = await transformModules(options(input, false));
    const csrMain = csr.modules[0]?.code ?? '';
    const valueModule = csr.modules.find((module) =>
      module.path.includes('useSerializer$_segment')
    );
    const symbol = segmentNames(csr, 'useSerializer$')[0];

    expectValidModules(ssr.modules);
    expectValidModules(csr.modules);
    expect(csrMain).toContain(`useSerializer(${symbol})`);
    expect(csrMain).not.toContain(`_withCaptures(${symbol}`);
    expect(csrMain).not.toContain('useSerializerQrl');
    expect(valueModule?.code).toContain(`export const ${symbol} = {`);
    expect(ssr.modules[0]?.code).toContain(`useSerializerQrl(q_${symbol})`);
  });

  test('emits captured serializer values as factories', async () => {
    const input = {
      path: 'src/serializer-capture.tsx',
      code: `import { useSerializer$, useSignal } from '@qwik.dev/core';
export function App() {
  const count = useSignal(1);
  useSerializer$({
    initial: 0,
    serialize: (value) => value,
    deserialize: (value) => value + count.value,
  });
  return <p>Serializer</p>;
}
`,
    };

    const ssr = await transformModules(options(input, true));
    const csr = await transformModules(options(input, false));
    const csrMain = csr.modules[0]?.code ?? '';
    const valueModule = csr.modules.find((module) =>
      module.path.includes('useSerializer$_segment')
    );
    const symbol = segmentNames(csr, 'useSerializer$')[0];

    expect(ssr.diagnostics).toEqual([]);
    expect(csr.diagnostics).toEqual([]);
    expect(csrMain).toContain(`useSerializer(_withCaptures(${symbol}, [count]))`);
    expect(valueModule?.code).toContain(`export const ${symbol} = () => {`);
    expect(valueModule?.code).toContain('const count = _captures[0];');
    expect(ssr.modules[0]?.code).toContain(`useSerializerQrl(q_${symbol}.w([count]))`);
  });

  test('uses the same target-aware rules inside extracted segments', async () => {
    const input = {
      path: 'src/nested.tsx',
      code: `import { outer$, inner$ } from 'library';
import { useSignal } from '@qwik.dev/core';
export function App() {
  const count = useSignal(0);
  outer$(() => inner$(async () => {
    await Promise.resolve();
    return count.value;
  }));
  return <p>Nested</p>;
}
`,
    };

    const ssr = await transformModules(options(input, true));
    const csr = await transformModules(options(input, false));
    const csrOuter = csr.modules.find((module) => module.path.includes('outer$_segment_0'))!;
    const csrInner = csr.modules.find((module) => module.path.includes('inner$_segment_1'))!;
    const ssrOuter = ssr.modules.find((module) => module.path.includes('outer$_segment_0'))!;
    const innerSymbol = segmentNames(csr, 'inner$')[0];

    expectValidModules(ssr.modules);
    expectValidModules(csr.modules);
    expect(csrOuter.code).toContain(`_withCaptures(${innerSymbol}, [count])`);
    expect(csrOuter.code).not.toContain('_qrlWithChunk');
    expect(csrInner.code).toContain('(await _await(Promise.resolve()))();');
    expect(ssrOuter.code).toContain('innerQrl');
    expect(ssrOuter.code).toContain(`q_${innerSymbol}.w([count])`);
  });

  test('uses exported local companions for each target', async () => {
    const input = {
      path: 'src/local.tsx',
      code: `export const local$ = (value) => value;
export const local = (value) => value;
export const localQrl = (value) => value;
export function App() {
  local$(() => 1);
  return <p>Local</p>;
}
`,
    };

    const ssr = await transformModules(options(input, true));
    const csr = await transformModules(options(input, false));
    const symbol = segmentNames(csr, 'local$')[0];

    expectValidModules(ssr.modules);
    expectValidModules(csr.modules);
    expect(csr.modules[0]?.code).toContain(`local(${symbol});`);
    expect(ssr.modules[0]?.code).toContain(`localQrl(q_${symbol});`);
  });

  test('retargets an unused marker specifier while preserving comments and attributes', async () => {
    const input = {
      path: 'src/imports.tsx',
      code: `// keep target comment
import { marker$ as marker, keep } from 'library' with { type: 'custom' };
const unrelated = 1;
export const retained = [keep, unrelated];
export function App() {
  marker(() => 1);
  return <p>Imports</p>;
}
`,
    };

    const csr = await transformModules(options(input, false));
    const main = csr.modules[0]?.code ?? '';
    const symbol = segmentNames(csr, 'marker$')[0];

    expectValidModules(csr.modules);
    expect(main).toContain('// keep target comment');
    expect(main).toContain('with { type: "custom" }');
    expect(main).toContain('import { marker, keep } from "library"');
    expect(main).toContain(`marker(${symbol});`);
    expect(main).not.toContain('marker$ as marker');
  });

  test('keeps a marker value import and avoids target alias collisions', async () => {
    const input = {
      path: 'src/collision.tsx',
      code: `import { marker$ as marker } from 'library';
const marker0 = 1;
export const retained = [marker, marker0];
export function App() {
  marker(() => 1);
  return <p>Collision</p>;
}
`,
    };

    const csr = await transformModules(options(input, false));
    const main = csr.modules[0]?.code ?? '';
    const symbol = segmentNames(csr, 'marker$')[0];

    expectValidModules(csr.modules);
    expect(main).toContain('marker$ as marker');
    expect(main).toContain('marker as marker1');
    expect(main).toContain(`marker1(${symbol});`);
    expect(main).not.toContain('__qwik_');
  });

  test('does not retarget a marker onto an existing local binding', async () => {
    const input = {
      path: 'src/local-collision.tsx',
      code: `import { marker$ } from 'library';
const marker = 'local';
export const retained = marker;
export function App() {
  marker$(() => 1);
  return <p>Collision</p>;
}
`,
    };

    const csr = await transformModules(options(input, false));
    const main = csr.modules[0]?.code ?? '';
    const symbol = segmentNames(csr, 'marker$')[0];

    expectValidModules(csr.modules);
    expect(main).not.toContain('marker$ } from');
    expect(main).toContain('marker as marker0');
    expect(main).toContain(`marker0(${symbol});`);
    expect(main).not.toContain('__qwik_');
  });
});

describe('explicit boundaries nested in prop expressions', () => {
  test('a $ call inside a complex prop expression lowers in every emitter of its range', async () => {
    const input = {
      path: 'src/nested-dollar.tsx',
      code: `import { $ } from '@qwik.dev/core';
export const Shell = ({ action, reload, onSubmit$, ...rest }: any) =>
  action ? (
    <form
      {...rest}
      onSubmit$={
        (Array.isArray(onSubmit$)
          ? [...onSubmit$, !reload ? $((evt: Event) => action.submit(evt)) : undefined]
          : [onSubmit$]) as any
      }
    />
  ) : null;
`,
    };
    for (const isServer of [true, false]) {
      const result = await transformModules(options(input, isServer));
      const dollarSegment = result.modules.find((module) => module.segment?.ctxName === '$');
      expect(dollarSegment, 'the $ boundary extracts').toBeDefined();
      for (const module of result.modules) {
        expect(
          module.code,
          `unlowered $ call in ${module.path} (isServer ${isServer})`
        ).not.toMatch(/[^\w$]\$\(/);
      }
    }
  });
});

describe('native$ implementations', () => {
  test('keep the imports their kept implementation references', async () => {
    const input = {
      path: 'src/native-build.ts',
      code: `import { native$, nativeFrom, useSignal } from '@qwik.dev/core';
const labels = ['a', 'b'];
export const build = native$((count: number) => {
  const rows = new Array(count);
  for (let i = 0; i < count; i++) {
    rows[i] = useSignal(labels[i % labels.length]);
  }
  return rows;
}, { rust: nativeFrom('./native') });
`,
    };
    for (const isServer of [true, false]) {
      const result = await transformModules(options(input, isServer));
      const main = result.modules.find((module) => module.path.endsWith('native-build.ts'))!.code;
      // the marker call is replaced by its implementation, which still calls useSignal
      expect(main, `isServer ${isServer}`).toContain('useSignal(');
      expect(main, `isServer ${isServer}`).toMatch(/import \{[^}]*useSignal[^}]*\}/);
    }
  });
});

describe('component module in-module implementations', () => {
  test('a raw-slice qrl inlined in a component module imports its references', async () => {
    const input = {
      path: 'src/raw-slice.tsx',
      code: `import { $, component$, useSignal, useTask$ } from '@qwik.dev/core';
export function foo(this: any) {
  return this.value;
}
export const Child = component$(() => {
  const message = useSignal('');
  useTask$(async () => {
    message.value = await $(foo).apply({ value: 'passed' });
  });
  return <div>{message.value}</div>;
});
export const App = component$(() => {
  return <Child />;
});
`,
    };
    const result = await transformModules(options(input, true));
    expect(result.diagnostics).toEqual([]);
    for (const module of result.modules) {
      if (/=\s*foo;/.test(module.code) && !/function foo/.test(module.code)) {
        expect(module.code, `${module.path} inlines \`foo\` without importing it`).toMatch(
          /import \{[^}]*\bfoo\b[^}]*\}/
        );
      }
    }
  });
});

describe('explicit boundaries on csr', () => {
  test('$() values and component-prop handlers stay qrls', async () => {
    const input = {
      path: 'src/qrl-values.tsx',
      code: `import { $, component$, useSignal, useTask$ } from '@qwik.dev/core';
export const moduleQrl = $((x: number) => x + 1);
export const Toggle = component$((props: any) => (
  <input type="checkbox" onClick$={props.onClick$} />
));
export const App = component$(() => {
  const sig = useSignal('true');
  const onClick$ = $(() => {
    sig.value = 'x';
  });
  useTask$(async () => {
    await $(() => sig.value)();
  });
  return (
    <div>
      {sig.value === 'true' ? <button onClick$={onClick$}>a</button> : <span>b</span>}
      <Toggle onClick$={() => sig.value++} />
    </div>
  );
});
`,
    };
    const result = await transformModules(options(input, false));
    expect(result.diagnostics).toEqual([]);
    const main = result.modules.find((module) => module.path.endsWith('qrl-values.tsx'))!.code;
    // explicit $() values keep their v2 qrl identity: lazy chunk, .w captures
    expect(main).not.toMatch(/_withCaptures\(\w+_\$_segment/);
    expect(main).toMatch(/const onClick\$ = q_\w+_\$_segment_\d+_\w+\.w\(\[sig\]\)/);
    expect(main).toMatch(/const moduleQrl = q_\w+_\$_segment/);
    // a handler passed as a component prop escapes into the child: qrl too
    expect(main).toMatch(/"onClick\$": q_\w+_q_e_click_segment_\d+_\w+\.w\(\[sig\]\)/);
    // structural sinks keep the direct fast path
    expect(main).toMatch(/useTask\(_withCaptures\(/);
    expect(main).toMatch(/_withCaptures\(\w+_branch_condition/);
    const taskChunk = result.modules.find((module) =>
      module.path.includes('useTask$_segment')
    )!.code;
    // $() nested in another segment body keeps qrl identity there too
    expect(taskChunk).not.toMatch(/_withCaptures\(\w+_\$_segment/);
    expect(taskChunk).toMatch(/q_\w+_\$_segment_\d+_\w+\.w\(\[sig\]\)/);
  });
});

describe('store property component props', () => {
  test('a store.prop value rides the _props sources map as its store source', async () => {
    const input = {
      path: 'src/store-prop.tsx',
      code: `import { component$, useStore } from '@qwik.dev/core';
export const Child = component$((props: { count: number }) => <div>{props.count}</div>);
export const App = component$(() => {
  const store = useStore({ foo: 10, nested: { bar: 1 } });
  return (
    <div>
      <button onClick$={() => store.foo++}>inc</button>
      <Child count={store.foo} />
      <Child count={store.nested.bar} />
    </div>
  );
});
`,
    };
    const result = await transformModules(options(input, true));
    expect(result.diagnostics).toEqual([]);
    const all = result.modules.map((module) => module.code).join('\n');
    // serialization must store the canonical store-prop source, not a snapshot
    expect(all).toContain('"count": getStoreSource(store, "foo")');
    // nested hops are runtime facts: the slot may hold a signal, a store, or data
    expect(all).toContain('"count": getMemberSource(store.nested, "bar")');
    expect(all).toMatch(/import \{[^}]*getStoreSource[^}]*\}/);
  });
});

describe('destructured reactive members', () => {
  test('lazy boundaries re-read destructured members through their container', async () => {
    const input = {
      path: 'src/destructured-member.tsx',
      code: `import { component$, useStore } from '@qwik.dev/core';
export const App = component$(() => {
  const store = useStore({ counter: { n: 1 }, meta: { tag: 'x' } });
  const { counter, meta: renamed } = store;
  return (
    <div>
      <p>{counter.n}</p>
      <button onClick$={() => console.log(counter.n, renamed.tag)}>log</button>
    </div>
  );
});
`,
    };
    for (const isServer of [true, false]) {
      const result = await transformModules(options(input, isServer));
      expect(result.diagnostics).toEqual([]);
      expectValidModules(result.modules);
      const all = result.modules.map((module) => module.code).join('\n');
      // members read live through the captured container, tracking their slot
      expect(all).toContain('store.counter.n');
      expect(all).toContain('store.meta.tag');
      expect(all).not.toMatch(/\(counter\) =>/);
    }
    const ssr = await transformModules(options(input, true));
    const text = ssr.modules.find((module) => module.path.includes('text_segment'));
    expect(text?.code).toMatchInlineSnapshot(`
      "export const destructured_member_text_segment_0_1bvmmxfutb002 = (store) => {
        return store.counter.n;
      };
      "
    `);
    const click = ssr.modules.find((module) => module.path.includes('q_e_click'));
    expect(click?.code).toMatchInlineSnapshot(`
      "import { _captures } from "@qwik.dev/core";

      export const destructured_member_q_e_click_segment_1_paa9t0qxfpim = () => {
        const store = _captures[0];
        return console.log(store.counter.n, store.meta.tag);
      };
      "
    `);
  });

  test('chained destructures resolve to the root container', async () => {
    const input = {
      path: 'src/destructured-chain.tsx',
      code: `import { component$, useStore } from '@qwik.dev/core';
export const App = component$(() => {
  const store = useStore({ counter: { inner: { n: 1 } } });
  const { counter } = store;
  const { inner } = counter;
  return <p>{inner.n}</p>;
});
`,
    };
    const result = await transformModules(options(input, true));
    expect(result.diagnostics).toEqual([]);
    const all = result.modules.map((module) => module.code).join('\n');
    expect(all).toContain('store.counter.inner.n');
  });

  test('a member called as a bare function keeps its snapshot', async () => {
    const input = {
      path: 'src/destructured-callee.tsx',
      code: `import { component$, useStore } from '@qwik.dev/core';
export const App = component$(() => {
  const store = useStore({ getLabel: () => 'x', counter: { n: 1 } });
  const { getLabel, counter } = store;
  return <button onClick$={() => console.log(getLabel(), counter.n)}>log</button>;
});
`,
    };
    const result = await transformModules(options(input, true));
    expect(result.diagnostics).toEqual([]);
    const all = result.modules.map((module) => module.code).join('\n');
    // rewriting the call would rebind `this`; the sibling member still resolves live
    expect(all).not.toContain('store.getLabel()');
    expect(all).toContain('getLabel()');
    expect(all).toContain('store.counter.n');
  });

  test('a member with a default keeps its snapshot', async () => {
    const input = {
      path: 'src/destructured-default.tsx',
      code: `import { component$, useStore } from '@qwik.dev/core';
export const App = component$(() => {
  const store = useStore({ counter: { n: 1 } });
  const { counter = { n: 0 } } = store;
  return <p>{counter.n}</p>;
});
`,
    };
    const result = await transformModules(options(input, true));
    expect(result.diagnostics).toEqual([]);
    const all = result.modules.map((module) => module.code).join('\n');
    expect(all).not.toContain('store.counter.n');
  });

  test('a call-init destructure pins its container in a compiler temp', async () => {
    const input = {
      path: 'src/destructured-call-init.tsx',
      code: `import { component$, useStore } from '@qwik.dev/core';
export const App = component$(() => {
  const { counter } = useStore({ counter: { n: 1 } });
  return <p>{counter.n}</p>;
});
`,
    };
    for (const isServer of [true, false]) {
      const result = await transformModules(options(input, isServer));
      expect(result.diagnostics).toEqual([]);
      expectValidModules(result.modules);
      const all = result.modules.map((module) => module.code).join('\n');
      expect(all).toContain('const _store = useStore(');
      expect(all).toContain('} = _store;');
      expect(all).toContain('_store.counter.n');
    }
    const ssr = await transformModules(options(input, true));
    const setup = ssr.modules[0].code
      .split('\n')
      .filter((line) => line.includes('_store') || line.includes('} ='));
    expect(setup.join('\n')).toMatchInlineSnapshot(`
      "const destructured_call_init_text_segment_0_3u9qqib92m0nu = (_store) => {
        return _store.counter.n;
        const _store = useStore({ counter: { n: 1 } });
        const { counter } = _store;
        ctx.addRoot(_store);
        const text_0 = renderSsrTextExpression(createSsrElementTextTarget(id_0), [_store], q_destructured_call_init_text_segment_0_3u9qqib92m0nu);"
    `);
  });

  test('a segment-local shadow of the container is renamed', async () => {
    const input = {
      path: 'src/destructured-shadow.tsx',
      code: `import { component$, useStore } from '@qwik.dev/core';
export const App = component$(() => {
  const store = useStore({ counter: { n: 1 } });
  const { counter } = store;
  return (
    <button
      onClick$={() => {
        const store = { local: true };
        console.log(counter.n, store.local);
      }}
    >
      log
    </button>
  );
});
`,
    };
    const result = await transformModules(options(input, true));
    expect(result.diagnostics).toEqual([]);
    expectValidModules(result.modules);
    const all = result.modules.map((module) => module.code).join('\n');
    expect(all).toContain('store.counter.n');
    expect(all).toMatch(/const store_\d+ = \{ local: true \}/);
    expect(all).toMatch(/store_\d+\.local/);
    const handler = result.modules.find((module) => module.path.includes('q_e_click'));
    expect(handler?.code).toMatchInlineSnapshot(`
      "import { _captures } from "@qwik.dev/core";

      export const destructured_shadow_q_e_click_segment_0_32gtyf5zf3a8h = () => {
        const store = _captures[0];
        const store_0 = { local: true };
        		console.log(store.counter.n, store_0.local);
      };
      "
    `);
  });
});

describe('context-provided sources', () => {
  test('context signal reads and destructured forwards keep their sources', async () => {
    const contextsModule = {
      path: 'src/ctx.ts',
      code: `import { createContextId, type Signal } from '@qwik.dev/core';
export const ItemsContext = createContextId<Signal<string[] | undefined>>('test-items');
`,
    };
    const providerModule = {
      path: 'src/provider.tsx',
      code: `import { component$, useContextProvider, useSignal, Slot } from '@qwik.dev/core';
import { ItemsContext } from './ctx';
export const Provider = component$(() => {
  const items = useSignal<string[] | undefined>(undefined);
  useContextProvider(ItemsContext, items);
  return <Slot />;
});
`,
    };
    const outletModule = {
      path: 'src/outlet.tsx',
      code: `import { component$, useContext } from '@qwik.dev/core';
import { ItemsContext } from './ctx';

function Row({ contents, index }: { contents: string[]; index: number }) {
  const next = index + 1;
  return (
    <div>
      {contents[index]}
      {next < contents.length ? <Row contents={contents} index={next} /> : null}
    </div>
  );
}

export const Outlet = component$(() => {
  const items = useContext(ItemsContext);
  return items.value?.length ? <Row contents={items.value} index={0} /> : null;
});
`,
    };
    const result = await transformModules({
      input: [contextsModule, providerModule, outletModule],
      srcDir: 'src',
      sourceMaps: false,
      transpileTs: true,
      transpileJsx: true,
      isServer: true,
    });
    expect(result.diagnostics).toEqual([]);
    const all = result.modules.map((module) => module.code).join('\n');
    // the context-provided signal is a live source for the top instantiation
    expect(all).toContain('"contents": items');
    // the recursion forwards a destructured prop: its source resolves from the outer props
    expect(all).toContain('"contents": getPropSource(props, "contents")');
  });

  test('a per-file build probes opaque .value reads at runtime', async () => {
    // the provider module is not part of this compile: the source kind is unknowable
    const input = {
      path: 'src/lone-outlet.tsx',
      code: `import { component$, createContextId, useContext, type Signal } from '@qwik.dev/core';
const ItemsContext = createContextId<Signal<string[]>>('lone-items');
export const Kid = component$((props: { contents: string[] }) => <div>{props.contents.length}</div>);
export const Outlet = component$(() => {
  const items = useContext(ItemsContext);
  return <Kid contents={items.value} />;
});
`,
    };
    const result = await transformModules(options(input, true));
    expect(result.diagnostics).toEqual([]);
    const all = result.modules.map((module) => module.code).join('\n');
    expect(all).toContain('"contents": getMemberSource(items, "value")');
  });
});

describe('forwarded component props', () => {
  test('a forwarded prop rides the _props sources map via getPropSource', async () => {
    const input = {
      path: 'src/forward-prop.tsx',
      code: `import { component$, useSignal } from '@qwik.dev/core';
export const Kid = component$((props: { id: number }) => <div id="kid">{props.id}</div>);
export const Child = component$((props: { id: number }) => (
  <section>
    <Kid id={props.id} />
  </section>
));
export const App = component$(() => {
  const id = useSignal(0);
  return <Child id={id.value} />;
});
`,
    };
    const result = await transformModules(options(input, true));
    expect(result.diagnostics).toEqual([]);
    const all = result.modules.map((module) => module.code).join('\n');
    // the forwarded key resolves its source from the outer props at construction time
    expect(all).toContain('"id": getPropSource(props, "id")');
    expect(all).toMatch(/import \{[^}]*getPropSource[^}]*\}/);
  });
});

describe('event$ boundaries', () => {
  test('event$ lowers like $: a plain qrl value on both targets', async () => {
    const input = {
      path: 'src/event-qrl.tsx',
      code: `import { component$, event$, useSignal } from '@qwik.dev/core';
export const App = component$(() => {
  const count = useSignal(0);
  const attributes = {
    onClick$: event$(() => count.value++),
  };
  return <button {...attributes}>Increment</button>;
});
`,
    };
    for (const isServer of [true, false]) {
      const result = await transformModules(options(input, isServer));
      expect(result.diagnostics).toEqual([]);
      const all = result.modules.map((module) => module.code).join('\n');
      // eventQrl is identity, so the boundary is just a qrl — no `event` runtime callee
      expect(all, `isServer ${isServer}`).not.toMatch(/\bevent\(/);
      expect(all, `isServer ${isServer}`).toMatch(/q_\w+_event\$_segment_\d+_\w+\.w\(\[count\]\)/);
    }
  });
});

describe('regCtxName symbol registration', () => {
  test('server boundaries register their implementation by hash on ssr', async () => {
    const input = {
      path: 'src/server-func.ts',
      code: `import { server$ } from '@qwik.dev/router';
export const getData = server$(function () {
  return 42;
});
`,
    };
    const result = await transformModules({
      ...options(input, true),
      regCtxName: ['server'],
    });
    expect(result.diagnostics).toEqual([]);
    const main = result.modules.find((module) => module.path.endsWith('server-func.ts'))!.code;
    const segment = result.modules.find((module) => module.segment?.ctxName === 'server$');
    expect(segment).toBeDefined();
    const hash = segment!.segment!.name.slice(segment!.segment!.name.lastIndexOf('_') + 1);
    expect(main).toContain(`_regSymbol(`);
    expect(main).toContain(JSON.stringify(hash));
    expect(main).toMatch(/import \{[^}]*_regSymbol[^}]*\}/);
  });
});

describe('segment capture order', () => {
  test('chunk capture prelude order matches every consumer .w order', async () => {
    const input = {
      path: 'src/capture-order.tsx',
      code: `export function Shell({ contents, index, component: Component }) {
  const nextIndex = index + 1;
  const Tag = Component;
  return Component ? (
    <Tag>
      {nextIndex < contents.length && (
        <Shell contents={contents} index={nextIndex} component={contents[nextIndex].default} />
      )}
    </Tag>
  ) : nextIndex < contents.length ? (
    <Shell contents={contents} index={nextIndex} component={contents[nextIndex].default} />
  ) : null;
}`,
    };
    const result = await transformModules({ ...options(input, true), mode: 'lib' });
    const allCode = result.modules.map((module) => module.code).join('\n');
    let compared = 0;
    for (const mod of result.modules) {
      const symbol = mod.segment?.name;
      if (symbol === undefined) {
        continue;
      }
      const prelude = mod.code.match(/const [\w$]+ = _captures\[0\][^;]*/);
      if (prelude === null) {
        continue;
      }
      const headOrder = [...prelude[0].matchAll(/([\w$]+) = _captures\[\d+\]/g)].map((m) => m[1]);
      const consumer = allCode.match(new RegExp(`q_${symbol}\\.w\\(\\[([^\\]]*)\\]`));
      if (consumer === null) {
        continue;
      }
      compared++;
      const consumerOrder = consumer[1].split(',').map((name) => name.trim());
      expect(consumerOrder, `capture order for ${symbol}`).toEqual(headOrder);
    }
    expect(compared).toBeGreaterThan(0);
  });
});

function segmentNames(result: TransformOutput, ctxName: string): string[] {
  return result.modules.flatMap((module) =>
    module.segment?.ctxName === ctxName ? [module.segment.name] : []
  );
}

function expectValidModules(modules: readonly { path: string; code: string }[]) {
  for (const module of modules) {
    expect(
      parseSync(module.path, module.code, {
        lang: 'js',
        sourceType: 'module',
        showSemanticErrors: true,
      }).errors
    ).toEqual([]);
  }
}

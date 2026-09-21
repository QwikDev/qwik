/** Golden snapshots: component setup, hooks and `$` boundaries. */
import { describe, expect, test } from 'vitest';
import { testInput, testInputs } from './snapshot-runner';

describe.each(['ssr', 'csr'] as const)('%s', (mode) => {
  test('should share module bindings with QRL chunks', async () => {
    const output = await testInput(mode, 'qrl-module-bindings', {
      code: `import { component$, useSignal, useComputed$, useTask$ } from '@qwik.dev/core';
const prefix = 'Saved';
const settings = { suffix: '!' };
function format(value) { return prefix + ': ' + value; }
export default component$(() => {
  const count = useSignal(2);
  const title = useComputed$(() => format(count.value));
  useTask$(() => console.log(settings.suffix, title.value));
  return <button onClick$={() => console.log(format(count.value), settings)}>{title.value}</button>;
});`,
    });
    expect(output.diagnostics).toEqual([]);
  });

  test('should write a module binding from the chunk that mutates it', async () => {
    const output = await testInput(mode, 'qrl-module-binding-write', {
      code: `import { component$, useSignal } from '@qwik.dev/core';
let runCount = 0;
const settings = { suffix: '!' };
export default component$(() => {
  const count = useSignal(0);
  return (
    <button onClick$={() => { count.value = ++runCount; settings.suffix = '?'; }}>
      {count.value}
    </button>
  );
});`,
    });
    expect(output.diagnostics).toEqual([]);
  });

  test('should keep a generator head on a QRL callback', async () => {
    const output = await testInput(mode, 'qrl-generator', {
      code: `import { component$, $, useSignal } from '@qwik.dev/core';
const delay = (ms) => new Promise((r) => setTimeout(r, ms));
export const stream = $(async function* () {
  for (let i = 0; i < 3; i++) { await delay(10); yield i; }
});
export default component$(() => {
  const step = useSignal(1);
  const counted = $(function* count() { yield step.value; });
  return <button onClick$={() => counted}>{step.value}</button>;
});`,
    });
    expect(output.diagnostics).toEqual([]);
    const code = output.modules.map((module) => module.code).join('\n');
    // the copied body still says `yield`, so the rebuilt head must still say `function*`
    expect(code).toMatch(/= async function\*\s*\(\)/);
    // with captures the wrapper stays plain and only applies the authored generator
    expect(code).toMatch(/= function\s*\(\)[^]*?\(function\* count\(\)/);
  });

  test('should import module references in event computed and task chunks', async () => {
    const output = await testInput(mode, 'qrl-imports', {
      code: `import { component$, useSignal, useComputed$, useTask$ } from '@qwik.dev/core';
import { calculate, save } from './pricing';
export default component$(() => {
  const count = useSignal(2);
  const total: { value: number } = useComputed$(() => calculate(count.value));
  useTask$(() => save(total.value));
  return <button onClick$={() => save(count.value)}>{total.value}</button>;
});`,
    });
    expect(output.diagnostics).toEqual([]);
  });

  test('should extract a core hook callback returned from a custom hook', async () => {
    await testInput(mode, 'hook-return-marker', {
      path: 'src/use-counter.ts',
      code: `import { useComputed$, useSignal } from '@qwik.dev/core';
export function useCounter() {
  const count = useSignal(0);
  return useComputed$(() => count.value * 2);
}`,
    });
  });

  test('should capture enclosing callback locals in nested QRLs', async () => {
    const output = await testInput(mode, 'nested-qrl-captures', {
      code: `import { component$, $, useSignal, useTask$ } from '@qwik.dev/core';
import { log } from './log';
export const useCounter = (step) => {
  const c = useSignal(0);
  useTask$(({ track }) => {
    const v = track(() => c.value);
    const report = $(() => log(v + step));
    return report();
  });
  return c;
};
export default component$(() => {
  const c = useCounter(2);
  return (
    <button onClick$={() => { const n = c.value; const later = $(() => log(n)); later(); }}>
      {c.value}
    </button>
  );
});
`,
    });
    expect(output.diagnostics).toEqual([]);
    const code = output.modules.map((module) => module.code).join('\n');
    // The hook body and every nested marker are extracted; nothing stays authored.
    expect(code).not.toContain('useTask$(');
    expect(code).not.toContain('$(()');
    // A nested QRL captures the enclosing callback's locals and parameters.
    expect(code).toContain('.w([v, step])');
    expect(code).toContain('.w([n])');
    // A replaced marker callee is no longer a read, so no chunk imports `$`.
    expect(code).not.toMatch(/import \{[^}]*\s\$[,\s][^}]*\} from "@qwik.dev\/core"/);
  });

  test('should keep setup aliases of props, stores and signals live', async () => {
    const output = await testInput(mode, 'setup-live-aliases', {
      code: `import { component$, useSignal, useStore } from '@qwik.dev/core';
import { Child } from './child';
export default component$((props: { label: string; title: string; as: string }) => {
  const label = props.label;
  const { title } = props;
  const count = useSignal(0);
  const n = count.value;
  const store = useStore({ item: { label: 'first' }, nested: { flip: false } });
  const { item } = store;
  const { flip = false } = store.nested;
  const Tag = props.as;
  return (
    <Tag onClick$={() => (store.item = { label: n + label })}>
      {label}{title}{n}{item.label}{flip ? 'y' : 'n'}
      <Child state={store} />
    </Tag>
  );
});
`,
    });
    expect(output.diagnostics).toEqual([]);
    const code = output.modules.map((module) => module.code).join('\n');
    // No snapshot constants: every alias reads its source, in render and inside the handler.
    for (const snapshot of [
      'const label',
      'const { title }',
      'const n =',
      'const { item }',
      'const { flip',
      'const Tag',
    ]) {
      expect(code).not.toContain(snapshot);
    }
    for (const read of [
      'propSource(props, "label")',
      'propSource(props, "title")',
      'count.value',
      'store.item.label',
      'store.nested.flip',
    ]) {
      expect(code).toContain(read);
    }
    expect(code).toContain('count.value + props.label');
    // A store passed as-is is not wrapped in a prop QRL.
    expect(code).toContain('"state": store }');
  });

  test('should pass context through nested component scopes', async () => {
    const output = await testInput(mode, 'setup-context', {
      code: `import { component$, createContextId, useSignal, useContextProvider as provide, useContext as read } from '@qwik.dev/core';
const Counter = createContextId('counter');
export const Child = component$(() => {
  const count: { value: number } = read(Counter);
  return <button onClick$={() => count.value++}>{count.value}</button>;
});
export const Nested = component$(() => {
  const count = useSignal(10);
  provide(Counter, count);
  return <Child />;
});
export default component$(() => {
  const count = useSignal(1);
  provide(Counter, count);
  return <main><Child /><Nested /><Child /></main>;
});
`,
    });
    expect(output.diagnostics).toEqual([]);
    // Resumed children find their provider through the serialized scope marker.
    const code = output.modules.map((module) => module.code).join('\n');
    const providers = code.match(/contextScopeRef\(\)/g)?.length ?? 0;
    expect(providers).toBe(mode === 'ssr' ? 2 : 0);
    expect(code.includes('"<!c="')).toBe(mode === 'ssr');
  });

  test('should compile store setup through a plain hook call', async () => {
    const output = await testInput(mode, 'setup-store', {
      code: `import { component$, useStore as store } from '@qwik.dev/core';
export default component$((props: { initial: number }) => {
  const state = store(() => ({ count: props.initial }), { deep: false });
  return <button onClick$={() => state.count++}>{state.count}</button>;
});
`,
    });
    expect(output.diagnostics).toEqual([]);
  });

  test('should restore await context across hook, explicit and event QRLs', async () => {
    await testInput(mode, 'qrl-await', {
      code: `import { component$, $, useSignal, useTask$ } from '@qwik.dev/core';
export default component$((props) => {
  const count = useSignal(1);
  const run = $(async function run(value = props.initial) {
    await Promise.resolve(value);
    return count.value;
  });
  useTask$(async () => {
    await (await Promise.resolve(props.initial));
    const nested = async () => { await Promise.resolve(); };
    await nested();
    console.log(count.value);
  });
  return <button onClick$={async () => {
    try { await Promise.reject(props.initial); }
    catch { console.log(count.value); }
    await run();
  }}>run</button>;
});
`,
    });
  });

  test('should reuse one setup QRL across hooks and events', async () => {
    const output = await testInput(mode, 'setup-hook-qrl', {
      code: `import { component$, $, useSignal, useTask$, useComputed$ } from '@qwik.dev/core';
import { useCustom$ as custom } from './hooks';
export default component$((props) => {
  const count = useSignal(1);
  const read = $(() => count.value);
  useTask$((read));
  custom(read, props.options);
  const total: { value: number } = useComputed$(read);
  return <button onClick$={read}>{total.value}</button>;
});
`,
    });
    expect(
      output.modules.filter((module) => module.segment && module.segment.ctxName !== 'content')
    ).toHaveLength(1);
    expect(output.modules.filter((module) => module.segment?.ctxName === 'content')).toHaveLength(
      0
    );
  });

  test('should compile generic setup hooks by their imported binding', async () => {
    await testInput(mode, 'setup-custom-hook', {
      code: `import { component$, useSignal } from '@qwik.dev/core';
import { useCustom$ as custom } from './hooks';
export default component$((props: { title: string; options: object; args: unknown[] }) => {
  const count = useSignal(1);
  const { label }: { label: string } = custom(() => count.value, props.options);
  custom(() => props.title, ...props.args);
  return <span>{label}</span>;
});
`,
    });
  });

  test('should hand visible tasks to the runtime trigger', async () => {
    const output = await testInput(mode, 'setup-visible-task', {
      code: `import { component$, useVisibleTask$, useSignal } from '@qwik.dev/core';
export default component$(() => {
  const status = useSignal('waiting');
  useVisibleTask$(() => { status.value = 'visible'; });
  useVisibleTask$(({ cleanup }) => { cleanup(() => console.log(status.value)); }, { strategy: 'document-ready' });
  useVisibleTask$(() => console.log(status.value), { strategy: 'document-idle' });
  return <output>{status.value}</output>;
});
`,
    });
    const code = output.modules.map((module) => module.code).join('\n');
    // The runtime registers the trigger on both targets; the server ships the task as a QRL.
    expect(code).not.toContain('useVisibleTask$(');
    expect(code.match(mode === 'ssr' ? /useVisibleTaskQrl\(/g : /useVisibleTask\(/g)).toHaveLength(
      3
    );
  });

  test('should rewrite $ hooks to their Qrl and function twins', async () => {
    const output = await testInput(mode, 'setup-marker-hooks', {
      code: `import { component$, $, implicit$FirstArg, useComputed$, useSignal, useTask$ } from '@qwik.dev/core';
import { useCustom$ } from './hooks';
export const useLocalQrl = (qrl) => qrl;
export const useLocal = (fn) => fn;
export const useLocal$ = implicit$FirstArg(useLocalQrl);
export default component$(() => {
  const count = useSignal(1);
  const read = $(() => count.value);
  useTask$(read);
  const total = useComputed$(() => count.value * 2, { initial: 0 });
  useCustom$(() => count.value);
  useLocal$(() => count.value);
  return <span>{total.value}</span>;
});
`,
    });
    const code = output.modules.map((module) => module.code).join('\n');
    expect(code).toContain('useTaskQrl(read)');
    if (mode === 'ssr') {
      expect(code).toContain('import { useCustomQrl } from "./hooks";');
      expect(code).toContain('useComputedQrl(');
      expect(code).toContain('useCustomQrl(');
      expect(code).toContain('useLocalQrl(');
    } else {
      expect(code).toContain('import { useCustom } from "./hooks";');
      expect(code).toContain('useComputed(_withCaptures(');
      expect(code).toContain('useCustom(_withCaptures(');
      expect(code).toContain('useLocal(_withCaptures(');
    }
    expect(code).not.toContain('useCustom$(');
    expect(code).not.toContain('useLocal$(');
  });

  test('should compile global and scoped styles without QRLs', async () => {
    const output = await testInput(mode, 'setup-styles', {
      code: `import { component$, useSignal, useStyles$, useStylesScoped$ } from '@qwik.dev/core';
const STYLE = \`.container { color: red; }\`;
export const Child = component$(() => {
  useStylesScoped$(STYLE);
  return <div class="container">child</div>;
});
export default component$(() => {
  useStyles$('.global { color: blue; }');
  const scope = useStylesScoped$(\`.local { color: green; }\`);
  const active = useSignal(false);
  return (
    <section class={scope}>
      <span>plain</span>
      <button class={{ active: active.value }} onClick$={() => (active.value = true)}>go</button>
      {active.value ? <b class="on">on</b> : null}
      <Child />
    </section>
  );
});
`,
    });
    const code = output.modules.map((module) => module.code).join('\n');
    // Every element of a scoped component carries the scope; dynamic classes get it from the effect.
    expect(code).toMatch(/<span class=\\?"\u26a1\ufe0f[a-z0-9]+-\d\\?">plain<\/span>/);
    expect(code).toMatch(/<b class=\\?"\u26a1\ufe0f[a-z0-9]+-\d on\\?">on<\/b>/);
    expect(code).toMatch(/<div class=\\?"\u26a1\ufe0f[a-z0-9]+-\d container\\?">child<\/div>/);
    expect(code).toMatch(
      mode === 'ssr'
        ? /\], q_component_class_segment_\d+_[a-z0-9]+, undefined, "\u26a1\ufe0f[a-z0-9]+-\d"\)/
        : /ctx\.scheduler, "\u26a1\ufe0f[a-z0-9]+-\d"\);/
    );
    expect(code).toMatch(/useStyles\(".global \{ color: blue; \}", "[a-z0-9]+-\d"\);/);
    expect(code).toMatch(/useStylesScoped\(STYLE, "[a-z0-9]+-\d", true\);/);
    expect(code).toMatch(
      /const scope = useStylesScoped\(".local \{ color: green; \}", "[a-z0-9]+-\d", true\);/
    );
    expect(code).not.toContain('useStyles$(');
  });

  test('should compile serializer arguments as factories', async () => {
    const output = await testInput(mode, 'setup-serializer', {
      code: `import { component$, useSerializer$, useSignal } from '@qwik.dev/core';
export default component$(() => {
  const start = useSignal(5);
  const count = useSerializer$({
    deserialize: (value: number) => ({ n: value }),
    serialize: (value: { n: number }) => value.n,
    initial: start.value,
  });
  const date = useSerializer$(() => ({ deserialize: (value: string) => new Date(value), serialize: (date: Date) => date.toISOString() }));
  return <span>{count.value.n}{date.value.getFullYear()}</span>;
});
`,
    });
    const code = output.modules.map((module) => module.code).join('\n');
    if (mode === 'ssr') {
      expect(code.match(/useSerializerQrl\(/g)).toHaveLength(2);
    } else {
      expect(code).toContain('useSerializer(_withCaptures(');
      expect(code.match(/useSerializer\(/g)).toHaveLength(2);
    }
    expect(code).not.toContain('useSerializer$(');
  });

  test('should wait for initial tasks before rendering', async () => {
    const output = await testInput(mode, 'setup-task-wait', {
      code: `import { component$, useTask$, useSignal } from '@qwik.dev/core';
export const Child = component$(() => <b>child</b>);
export default component$(() => {
  const ready = useSignal('pending');
  useTask$(async () => {
    await Promise.resolve();
    ready.value = 'done';
  });
  return <section><span>{ready.value}</span><Child /></section>;
});
`,
    });
    const code = output.modules.map((module) => module.code).join('\n');
    expect(code).toContain(
      mode === 'ssr'
        ? 'maybeThen(ctx.scheduler.flush(), () => invoke(invokeCtx0, () => {'
        : 'maybeThen(invokeCtx0.pendingSetup, () => invoke(invokeCtx0, () => {'
    );
    if (mode === 'csr') {
      expect(code).toContain('useTask(_withCaptures(component_useTaskqrl_segment_0_');
    }
  });

  test('should compile local implicit hooks and task setup', async () => {
    await testInput(mode, 'setup-task-hook', {
      code: `import { component$, implicit$FirstArg, useTaskQrl, useTask$ as task, useSignal } from '@qwik.dev/core';
const useCustom$ = implicit$FirstArg(useTaskQrl);
export default component$(() => {
  const count = useSignal(1);
  useCustom$(({ cleanup }) => {
    const value = count.value;
    console.log(value);
    cleanup(() => console.log('cleanup', value));
  });
  task(() => console.log(count.value), { deferUpdates: true });
  return <span>{count.value}</span>;
});
`,
    });
  });

  test('should compile an async computed setup signal', async () => {
    const output = await testInput(mode, 'setup-computed-async', {
      code: `import { component$, useSignal, useComputed$ } from '@qwik.dev/core';
export default component$(() => {
  const count = useSignal(1);
  const doubled = useComputed$(async () => {
    await Promise.resolve();
    return count.value * 2;
  });
  return <span>{doubled.value}</span>;
});
`,
    });
    expect(output.diagnostics).toEqual([]);
  });

  test('should forward computed options for inline and existing QRLs', async () => {
    const output = await testInput(mode, 'setup-computed-options', {
      code: `import { component$, $, useComputed$ as computed } from '@qwik.dev/core';
export default component$((props: { initial: number }) => {
  const initial = props.initial;
  const options = { initial, timeout: 1000 };
  const read = $(async () => 42);
  const first = computed(async () => 42, { ...options, initial: () => initial });
  const second: { value: number } = computed(read, ...[options]);
  return <span>{first.value}:{second.value}</span>;
});
`,
    });
    expect(output.diagnostics).toEqual([]);
    expect(
      output.modules.filter((module) => module.segment && module.segment.ctxName !== 'content')
    ).toHaveLength(2);
    expect(output.modules.filter((module) => module.segment?.ctxName === 'content')).toHaveLength(
      0
    );
  });

  test('should compile a synchronous computed setup signal', async () => {
    await testInput(mode, 'setup-computed', {
      code: `import { component$, useSignal, useComputed$ } from '@qwik.dev/core';
export default component$(() => {
  const count = useSignal(1);
  const doubled = useComputed$(() => count.value * 2);
  return <span>{doubled.value}</span>;
});
`,
    });
  });

  test('should chain computed setup signals with captured props', async () => {
    await testInput(mode, 'setup-computed-chain', {
      code: `import { component$, useSignal, useComputed$ as computed } from '@qwik.dev/core';
export default component$((props) => {
  const count = useSignal(1);
  const doubled = computed(() => count.value * 2);
  const label = computed(function () {
    const value = doubled.value;
    return props.prefix + value;
  });
  return <button title={label.value} onClick$={() => count.value++}>{label.value}</button>;
});
`,
    });
  });

  test('should reuse an explicit setup QRL across events', async () => {
    await testInput(mode, 'setup-qrl', {
      code: `import { component$, $, useSignal } from '@qwik.dev/core';
export default component$((props) => {
  const count = useSignal(0);
  const onSave = $((event) => {
    count.value++;
    props.onSave$(props.id, event.type);
  });
  return <main><button onClick$={onSave}>save</button><button onClick$={onSave}>again</button></main>;
});
`,
    });
  });

  test('should keep a const sibling statement', async () => {
    await testInput(mode, 'const-sibling-statement', {
      code: `import { component$ } from '@qwik.dev/core';
const title = 'Hello';
export default component$(() => {
  return <p>Hello Qwik</p>;
});
`,
    });
  });

  test('should lower component const setup with hook and event captures', async () => {
    const output = await testInput(mode, 'component-const-setup', {
      code: `import { component$, useSignal } from '@qwik.dev/core';
export const Card = component$((props: { title?: string; suffix: string; start: number }) => {
  const { title = 'Untitled', ...rest } = props;
  const label = title.toUpperCase(), suffix = rest.suffix;
  const count = useSignal(props.start), initial = count.value;
  return <button onClick$={() => console.log(count.value++, label)}>
    {label + suffix + initial}:{count.value}
  </button>;
});`,
    });
    expect(output.diagnostics).toEqual([]);
    const event = output.modules.find((module) => module.segment?.ctxName === 'onClick$');
    expect(event?.segment?.captureNames).toEqual(['count', 'label']);
  });

  test('should subscribe a signal-read text hole', async () => {
    await testInput(mode, 'use-signal-hole', {
      code: `import { component$, useSignal } from '@qwik.dev/core';
export default component$(() => {
  const count = useSignal(0);
  return <p>{count.value}</p>;
});
`,
    });
  });

  test('should extract explicit $ calls wherever they appear', async () => {
    const output = await testInput(mode, 'explicit-qrl-anywhere', {
      code: `import { component$, useOn, useSignal, $ } from '@qwik.dev/core';
export function later(run: () => void) {
  return $(() => run());
}
export default component$(() => {
  const count = useSignal(0);
  useOn('click', $(() => { count.value++; }));
  const wrapped = [1].map((step) => $(() => (count.value += step)));
  return (
    <button onClick$={() => { const bump = $(() => count.value++); bump(); }} data-n={wrapped.length}>
      {count.value}
    </button>
  );
});
`,
    });
    expect(output.diagnostics).toEqual([]);
    const code = output.modules.map((module) => module.code).join('\n');
    // Every `$(fn)` became a QRL reference; none survives as a runtime call.
    expect(code).not.toMatch(/\$\(/);
    expect(code).toContain('useOn("click", q_');
    expect(code).toMatch(/const bump = q_\w+\.w\(\[count\]\)/);
    expect(code).toMatch(/const wrapped = \[1\]\.map\(\(step\) => q_\w+\.w\(\[count, step\]\)\)/);
  });

  test('should ship function references and plain values as QRL factories', async () => {
    const output = await testInput(mode, 'qrl-value-arguments', {
      code: `import { component$, $, useTask$, useSignal } from '@qwik.dev/core';
import { config } from './config';
function tick() { console.log('tick'); }
export const greeting = $('hello');
export const settings = $(config);
export default component$(() => {
  const count = useSignal(1);
  useTask$(tick);
  const later = $(tick);
  const snapshot = $(count);
  return <button onClick$={later}>{count.value}</button>;
});
`,
    });
    expect(output.diagnostics).toEqual([]);
    const code = output.modules.map((module) => module.code).join('\n');
    // Every marker is extracted; a value the segment must compute ships as a factory returning it.
    expect(code).not.toContain('$(');
    expect(code).not.toContain('useTask$');
    expect(code).toMatch(/return ["']hello["']/);
    expect(code).toContain('return count');
    // A module binding needs no factory: the segment is that binding.
    for (const alias of ['config', 'tick']) {
      expect(code).toMatch(new RegExp(`_segment_\\w+ = ${alias};`));
    }
    // The setup local is captured, the module function is imported.
    expect(code).toContain('const [count] = _captures;');
    expect(code).toMatch(/import \{ (?:__qwik_)?tick(?: as tick)? \} from "\.\/component\.tsx"/);
    // Replaced marker callees retain no authored core import.
    expect(code).not.toMatch(/import \{[^}]*\s\$[,\s][^}]*\} from "@qwik.dev\/core"/);
  });

  test('should lower custom hook bodies and link their event facts', async () => {
    const output = await testInputs(mode, 'custom-hook-bodies', [
      {
        path: 'src/hooks.ts',
        code: `import { useOn, useSignal, useTask$ } from '@qwik.dev/core';
export const useClick = (handler) => {
  useOn('click', handler);
};
export function useCounter(start) {
  const count = useSignal(start);
  useTask$(() => {
    count.value;
  });
  return { count, bump: () => count.value++ };
}
export function useMaybeClick(flag, handler) {
  if (!flag) {
    return null;
  }
  useOn('click', handler);
  return flag;
}
`,
      },
      {
        code: `import { $, component$ } from '@qwik.dev/core';
import { useClick, useCounter, useMaybeClick } from './hooks';
export const Clicker = component$(() => {
  useClick($(() => console.log('click')));
  return <button>click</button>;
});
export const Counter = component$(() => {
  const { count, bump } = useCounter(1);
  return <button onClick$={bump}>{count.value}</button>;
});
export const Maybe = component$((props: { flag: boolean }) => {
  useMaybeClick(props.flag, $(() => 1));
  return <div>maybe</div>;
});
`,
      },
    ]);
    expect(output.diagnostics).toEqual([]);
    const hooks = output.modules.find((module) => module.path === 'src/hooks.ts')!.code;
    const main = output.modules.find((module) => module.path === 'src/component.tsx')!.code;
    // Hook bodies compile like component setup: their $ calls become QRLs or static callbacks.
    expect(hooks).toContain(mode === 'ssr' ? 'useTaskQrl(q_' : 'useTask(_withCaptures(');
    expect(hooks).not.toContain('useTask$(');
    // An early return stays ordinary JavaScript inside the compiled body.
    expect(hooks).toMatch(/if \(!flag\) \{\s*return null;\s*\}/);
    if (mode === 'ssr') {
      // Only the roots whose linked hooks register events ship as open-tag records.
      expect(main.match(/createSsrOpenTag\(/g)).toHaveLength(2);
      expect(main).toMatch(/createSsrOpenTag\("<button", ">"\)/);
    }
  });

  test('should merge setup useOn events into the root element on the server', async () => {
    const output = await testInputs(mode, 'setup-use-on', [
      {
        code: `import { component$, useOn, useSignal, $ } from '@qwik.dev/core';
import { useClick } from './hooks';
export default component$(() => {
  const count = useSignal(0);
  useOn('click', $(() => count.value++), { capture: true });
  return <button onClick$={() => count.value--}>{count.value}</button>;
});
`,
      },
      {
        path: 'src/headless.tsx',
        code: `import { useOnDocument, $ } from '@qwik.dev/core';
export default () => {
  useOnDocument('scroll', $(() => 1));
  return <>headless</>;
};
`,
      },
    ]);
    expect(output.diagnostics).toEqual([]);
    const main = output.modules.find((module) => module.path === 'src/component.tsx')!.code;
    const headless = output.modules.find((module) => module.path === 'src/headless.tsx')!.code;
    if (mode === 'ssr') {
      // The open tag is a record so the runtime joins the hook's registrations with the JSX handler.
      expect(main).toMatch(
        /createSsrOpenTag\(.*ctx\.eventAttr\("q-e:click", q_\w+\.w\(\[count\]\)\)/s
      );
      expect(main).not.toContain('eventAttrParts(');
    } else {
      expect(main).not.toContain('createSsrOpenTag');
    }
    // An element-less root keeps the runtime's script carrier.
    expect(headless).not.toContain('createSsrOpenTag');
  });

  test('should answer an import.meta.env build flag the same way', async () => {
    const output = await testInput(mode, 'build-constants-env', {
      code: `import { component$, useSignal, useTask$ } from '@qwik.dev/core';
export default component$(() => {
  const count = useSignal(0);
  useTask$(() => {
    if (import.meta.env.SSR) {
      count.value = 1;
    }
    if (import.meta.env.PROD) {
      count.value = 2;
    }
    observe(import.meta.env.BASE_URL);
  });
  return <button>{count.value}</button>;
});`,
    });
    expect(output.diagnostics).toEqual([]);
    const code = output.modules.map((module) => module.code).join('\n');
    expect(code).not.toContain('import.meta.env.SSR');
    expect(code).not.toContain('import.meta.env.PROD');
    // a key the build does not define is left to the bundler
    expect(code).toContain('import.meta.env.BASE_URL');
  });

  test('should answer a build constant everywhere a payload carries one', async () => {
    const output = await testInput(mode, 'build-constants', {
      code: `import { component$, isBrowser, isDev, isServer, useSignal, useTask$ } from '@qwik.dev/core';
export default component$(() => {
  const count = useSignal(0);
  useTask$(() => {
    if (isServer) {
      count.value = 1;
    }
    if (isBrowser && !isDev) {
      count.value = 2;
    }
  });
  return (
    <button onClick$={() => (count.value = isServer ? 3 : 4)}>
      {isBrowser ? 'client' : 'server'}
    </button>
  );
});`,
    });
    expect(output.diagnostics).toEqual([]);
    const code = output.modules.map((module) => module.code).join('\n');
    expect(code).not.toContain('isServer');
    expect(code).not.toContain('isBrowser');
    expect(code).not.toContain('isDev');
  });

  test('should call custom $ hooks through their twins wherever they appear', async () => {
    const output = await testInput(mode, 'marker-qrl-anywhere', {
      code: `import { component$, useSignal } from '@qwik.dev/core';
import { useCustom$ } from './hooks';
export function make(count) {
  return useCustom$(() => count.value);
}
export default component$(() => {
  const count = useSignal(0);
  const handles = [useCustom$(() => count.value + 1)];
  return (
    <button onClick$={() => { useCustom$(() => count.value); }} data-n={handles.length}>
      {count.value}
    </button>
  );
});
`,
    });
    expect(output.diagnostics).toEqual([]);
    const code = output.modules.map((module) => module.code).join('\n');
    expect(code).not.toContain('useCustom$(');
    const main = output.modules.find((module) => module.path === 'src/component.tsx')!.code;
    // Setup and module helpers take the client fast path; a chunk body keeps the qrl twin.
    const twin = mode === 'ssr' ? 'useCustomQrl(q_' : 'useCustom(_withCaptures(';
    expect(main.match(new RegExp(twin.replace(/[$()]/g, '\\$&'), 'g'))).toHaveLength(2);
    expect(code).toMatch(/useCustomQrl\(q_\w+\.w\(\[count\]\)\);/);
  });

  test('should keep useId as a runtime call in setup and rows', async () => {
    const output = await testInput(mode, 'use-id', {
      code: `import { component$, useId } from '@qwik.dev/core';
export default component$((props: { items: string[] }) => {
  const id = useId();
  return (
    <ul id={id}>
      {props.items.map((item) => {
        const rowId = useId();
        return <li id={rowId}>{item}</li>;
      })}
    </ul>
  );
});
`,
    });
    expect(output.diagnostics).toEqual([]);
    const code = output.modules.map((module) => module.code).join('\n');
    // The runtime counts ids per render; the compiler only keeps the calls and their import.
    expect(code).toContain('const id = useId();');
    expect(code).toContain('const rowId = useId();');
    expect(code).not.toContain('pendingSetup');
  });

  test('should lift a local function into a segment its callers import', async () => {
    const output = await testInput(mode, 'local-functions', {
      code: `import { component$, useSignal } from '@qwik.dev/core';
import { Reveal } from './reveal';
export default component$(() => {
  const count = useSignal(1);
  const show = useSignal(true);
  function suffix(key: string) { return key + '!'; }
  const label = (key: string) => suffix(key) + count.value;
  async function load(key: string) { return key; }
  const direct = label('d');
  return (
    <Reveal>
      <b onClick$={() => console.log(label('h'))}>{label('x')}</b>
      {show.value && <i>{suffix('y')}</i>}
      {load('z')}
      {direct}
    </Reveal>
  );
});
`,
    });
    expect(output.diagnostics).toEqual([]);
    const main = output.modules.find((module) => module.path === 'src/component.tsx')!.code;
    const code = output.modules.map((module) => module.code).join('\n');
    // The body binds each function to its statically imported segment with its captures.
    expect(main).toMatch(
      /function suffix\(\) \{\n\s*return component_suffix_segment_\w+\.apply\(this, arguments\);/
    );
    expect(main).toMatch(
      /const label = \(\.\.\.args\) => _withCaptures\(component_label_segment_\w+, \[count\]\)\(\.\.\.args\);/
    );
    expect(main).toMatch(/function load\(\) \{\n\s*return component_load_segment_\w+\.apply/);
    expect(main).toMatch(/const direct = label\(["']d["']\);/);
    // A caller captures the function's captures, never the function, and rebinds it in its prelude.
    expect(code).not.toMatch(/\.w\(\[[^\]]*\b(label|suffix|load)\b[^\]]*\]\)/);
    expect(code).toMatch(
      /const \[count\] = _captures;\n\s*const label = _withCaptures\(component_label_segment_\w+, \[count\]\);/
    );
    expect(code).toMatch(/const suffix = component_suffix_segment_\w+;/);
    // The lifted async function keeps its authored shape.
    expect(code).toMatch(/export const component_load_segment_\w+ = async \(key\)/);
  });
});

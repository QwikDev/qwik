import { expect, test } from 'vitest';
import { analyseModule, linkPlans } from '../index';
import {
  ArgKind,
  BoundaryKind,
  CallTargetKind,
  EntryKind,
  LinkResultKind,
  QrlBodyKind,
  SetupKind,
  type Arg,
} from '../schema';
import { ResolutionKind } from '../link/link-plans';
import { transformModules } from '../transform-modules';
import {
  deepFreeze,
  loadDefaultFunction,
  serverSpecialization,
  setupOnlyContext,
} from './fixtures';
import * as core from '../../../qwik/src/core/index';
import { defaultScheduler } from '../../../qwik/src/core/runtime/scheduler';
import { renderToStringCompiled } from '../../../qwik/src/server/ssr-render';
import { isQrl } from '../../../qwik/src/core/shared/qrl/qrl-utils';
import type { QRL } from '../../../qwik/src/core/shared/qrl/qrl.public';
import { UnsupportedError } from '../errors';

test.each([
  ["import { useCustom as hook } from './hooks';", 'hook'],
  ["import useCustom from './hooks';", 'useCustom'],
  ['function useCustom(...args) { return globalHook(...args); }', 'useCustom'],
])('plain hooks keep ordinary arguments and result bindings: %s', async (declaration, callee) => {
  const output = await transformModules({
    srcDir: 'src',
    isServer: true,
    input: [
      {
        path: 'src/component.tsx',
        code: `${declaration}
export default (props) => {
  const { label } = ${callee}(() => props.label, first(), ...rest());
  ${callee}(label);
  ${callee}();
  return <span />;
};`,
      },
    ],
  });
  expect(output.diagnostics).toEqual([]);
  expect(output.modules.filter((module) => module.segment)).toHaveLength(0);
  const calls: unknown[][] = [];
  const order: string[] = [];
  const hook = (...args: unknown[]) => {
    calls.push(args);
    order.push('hook');
    return { label: 'result' };
  };
  const render = loadDefaultFunction(output.modules[0], {
    ...core,
    [callee]: hook,
    globalHook: hook,
    first: () => {
      order.push('first');
      return 1;
    },
    rest: () => {
      order.push('rest');
      return [2, 3];
    },
  });
  render({ label: 'authored' }, setupOnlyContext);
  expect(order).toEqual(['first', 'rest', 'hook', 'hook', 'hook']);
  expect(calls[0].slice(1)).toEqual([1, 2, 3]);
  expect(isQrl(calls[0][0])).toBe(false);
  expect((calls[0][0] as () => string)()).toBe('authored');
  expect(calls.slice(1)).toEqual([['result'], []]);
});

test('a single-statement loop body captures each iteration for a QRL', async () => {
  const output = await transformModules({
    srcDir: 'src',
    isServer: true,
    input: [
      {
        path: 'src/component.tsx',
        code: `import { useCustom$ } from './hooks';
export default () => {
  for (const value of [10, 20]) useCustom$(() => value);
  return <span />;
};`,
      },
    ],
  });
  expect(output.diagnostics).toEqual([]);
  const callbacks: QRL<() => number>[] = [];
  const render = loadDefaultFunction(output.modules.find((module) => !module.segment)!, {
    ...core,
    useCustomQrl: (callback: QRL<() => number>) => callbacks.push(callback),
    get _capturesObj() {
      return core._capturesObj;
    },
  });
  render({}, setupOnlyContext);
  expect(await Promise.all(callbacks.map((callback) => callback()))).toEqual([10, 20]);
});

test('a provider in a loop emits a scope only when the loop runs', async () => {
  const output = await transformModules({
    srcDir: 'src',
    isServer: true,
    input: [
      {
        path: 'src/component.tsx',
        code: `import { createContextId, useContextProvider } from '@qwik.dev/core';
const Context = createContextId('loop');
export default (props) => {
  for (const value of props.values) useContextProvider(Context, value);
  return <span />;
};`,
      },
    ],
  });
  expect(output.diagnostics).toEqual([]);
  const render = loadDefaultFunction(output.modules.find((module) => !module.segment)!, core);
  for (const values of [[], ['value']]) {
    const result = await renderToStringCompiled(render, { props: { values } });
    expect(result.html.includes('<!c=')).toBe(values.length > 0);
    expect(result.html.includes('<!/c>')).toBe(values.length > 0);
  }
});

test('an async hook keeps for await and its per-iteration capture', async () => {
  const output = await transformModules({
    srcDir: 'src',
    isServer: true,
    input: [
      {
        path: 'src/hooks.ts',
        code: `import { useTask$ } from '@qwik.dev/core';
export async function useItems(values) {
  for await (const value of values) useTask$(() => value);
}`,
      },
    ],
  });
  expect(output.diagnostics).toEqual([]);
  expect(output.modules.map((module) => module.code).join('\n')).toContain('for await (');
});

test.each(['useSignal(0)', 'wrap(useSignal(0))'])(
  'a hook in a loop header retains the authored fallback: %s',
  async (initial) => {
    const plan = await analyseModule(
      {
        path: 'hooks.ts',
        code: `import { useSignal } from '@qwik.dev/core';
const wrap = (value) => value;
export function useItems() {
  for (let index = ${initial}; index.value < 2; index.value++) {}
}`,
      },
      {}
    );
    expect(plan.hooks).toHaveLength(0);
  }
);

test('multiple setup declarations in a single-statement loop body stay inside the loop', async () => {
  const output = await transformModules({
    srcDir: 'src',
    isServer: true,
    input: [
      {
        path: 'src/component.tsx',
        code: `import { useSignal } from '@qwik.dev/core';
export default () => {
  for (let index = 0; index < 2; index++) var first = useSignal(index), second = useSignal(first.value);
  return <span />;
};`,
      },
    ],
  });
  expect(output.diagnostics).toEqual([]);
  const render = loadDefaultFunction(output.modules.find((module) => !module.segment)!, {
    ...core,
    useSignal: (value: number) => ({ value }),
  });
  expect(() => render({}, setupOnlyContext)).not.toThrow();
});

test('optional plain hook calls remain explicitly unsupported', async () => {
  await expect(
    analyseModule(
      {
        path: 'component.tsx',
        code: `import { useCustom } from './hooks';
export default () => { useCustom?.(); return <span />; };`,
      },
      {}
    )
  ).rejects.toThrow(UnsupportedError);
});

test.each([
  'for (let index = 0; index < values.length; index++) { useTask$(() => values[index]); }',
  'for (const value of values) { useTask$(() => value); }',
  'for (const key in values) { useTask$(() => values[key]); }',
])('lowers hooks in a loop and providers after it: %s', async (loop) => {
  const plan = await analyseModule(
    {
      path: 'hooks.ts',
      code: `import { useTask$, useContextProvider } from '@qwik.dev/core';
export function useItems(values, context) {
  ${loop}
  useContextProvider(context, values);
}`,
    },
    {}
  );
  expect(plan.hooks.map((hook) => hook.name)).toContain('useItems');
  expect(plan.payloads.flatMap((payload) => payload.setups ?? [])).not.toHaveLength(0);
  expect(plan.hooks[0].body).toMatchObject({
    kind: 'setup',
    setup: expect.arrayContaining([expect.objectContaining({ providesContext: true })]),
  });
  for (const isServer of [true, false]) {
    const output = await transformModules({
      srcDir: 'src',
      isServer,
      input: [{ path: 'src/hooks.ts', code: plan.source.code }],
    });
    expect(output.diagnostics).toEqual([]);
    expect(output.modules.map((module) => module.code).join('\n')).toContain('for (');
  }
});

test('a loop before a provider makes the imported hook visible to SSR', async () => {
  const output = await transformModules({
    srcDir: 'src',
    isServer: true,
    input: [
      {
        path: 'src/hooks.ts',
        code: `import { useContextProvider } from '@qwik.dev/core';
export function useItems(context, values) {
  for (const value of values) console.log(value);
  useContextProvider(context, values);
}`,
      },
      {
        path: 'src/component.tsx',
        code: `import { useItems } from './hooks';
export default (props) => {
  useItems(props.context, props.values);
  return <span />;
};`,
      },
    ],
  });
  expect(output.diagnostics).toEqual([]);
  const component = output.modules.find((module) => module.path === 'src/component.tsx');
  expect(component?.code).toContain('optionalContextScopeRef()');
});

test.each([
  ["import { useCustom$ as hook } from './hooks';", 'hook'],
  ["import useCustom$ from './hooks';", 'useCustom$'],
  ['function useCustom$(callback) { return callback; }', 'useCustom$'],
])('recognizes setup hooks through their bindings: %s', async (declaration, callee) => {
  const plan = await analyseModule(
    {
      path: 'component.tsx',
      code: `${declaration}
export default () => { ${callee}(() => 1); return <span />; };`,
    },
    {}
  );
  expect(plan.programs.flatMap((program) => program.setup)[0]).toMatchObject({
    s: SetupKind.Call,
    args: [{ a: ArgKind.Qrl }],
    result: null,
  });
});

test.each(['useCustom$()', 'useCustom$(...callbacks)', 'useCustom$?.(() => 1)'])(
  'rejects deferred hook callback forms: %s',
  async (call) => {
    await expect(
      analyseModule(
        {
          path: 'component.tsx',
          code: `
import { useCustom$ } from './hooks';
export default () => { ${call}; return <span />; };`,
        },
        {}
      )
    ).rejects.toThrow(UnsupportedError);
  }
);

test('generic hooks link the authored import and retain callback captures', async () => {
  const plan = await analyseModule(
    {
      path: 'component.tsx',
      code: `import { useCustom$ as custom } from './hooks';
export default (props) => {
  const { result } = custom(() => props.value, props.options);
  return <span>{result}</span>;
};`,
    },
    {}
  );
  const hook = plan.programs.flatMap((program) => program.setup)[0];
  expect(hook).toMatchObject({
    s: SetupKind.Call,
    target: {
      kind: CallTargetKind.Marker,
      binding: plan.imports[0].binding,
      stem: 'useCustom',
    },
    args: [{ a: ArgKind.Qrl }, { a: ArgKind.Expr }],
  });
  const callback = plan.qrls.find((qrl) => qrl.ctxName === 'useCustom$')!;
  expect(callback.boundary).toEqual({ kind: BoundaryKind.Implicit, role: 'hook' });
  expect(callback.captures.map(({ binding }) => plan.bindings[binding].name)).toEqual(['props']);
  const restored = JSON.parse(JSON.stringify(plan));
  const result = linkPlans(
    deepFreeze([restored]),
    [{ kind: EntryKind.Module, module: plan.path }],
    serverSpecialization(),
    { edges: { [plan.path]: { 0: { r: ResolutionKind.External } } } },
    true
  );
  expect(result.kind).toBe(LinkResultKind.Linked);
  if (result.kind !== LinkResultKind.Linked) {
    return;
  }
  expect(result.plan.modules[0].edges[0].runtime).toBe(true);
  expect(restored).toEqual(plan);
});

test('custom hooks preserve lazy callbacks, return patterns and argument evaluation order', async () => {
  const output = await transformModules({
    srcDir: 'src',
    isServer: true,
    input: [
      {
        path: 'src/component.tsx',
        code: `import { useCustom$ as custom } from './hooks';
export default () => {
  const { label } = custom(() => read(), first(), ...rest());
  custom(() => label);
  return <span />;
};`,
      },
    ],
  });
  const calls: { qrl: QRL<() => unknown>; args: unknown[] }[] = [];
  const order: string[] = [];
  const useCustomQrl = (qrl: QRL<() => unknown>, ...args: unknown[]) => {
    expect(isQrl(qrl)).toBe(true);
    calls.push({ qrl, args });
    order.push('hook');
    return { label: 'result' };
  };
  const render = loadDefaultFunction(output.modules.find((module) => !module.segment)!, {
    ...core,
    useCustomQrl,
    get _capturesObj() {
      return core._capturesObj;
    },
    read: () => {
      order.push('callback');
      return 42;
    },
    first: () => {
      order.push('first');
      return 1;
    },
    rest: () => {
      order.push('rest');
      return [2, 3];
    },
  });
  render({}, setupOnlyContext);
  expect(order).toEqual(['first', 'rest', 'hook', 'hook']);
  expect(calls[0].args).toEqual([1, 2, 3]);
  expect(await calls[0].qrl()).toBe(42);
  expect(await calls[1].qrl()).toBe('result');
  expect(order).toEqual(['first', 'rest', 'hook', 'hook', 'callback']);
});

test('generated task and local custom hook track signals and dispose cleanups', async () => {
  const output = await transformModules({
    srcDir: 'src',
    isServer: true,
    input: [
      {
        path: 'src/component.tsx',
        code: `import { useSignal, useTask$ as task, useTaskQrl, implicit$FirstArg } from '@qwik.dev/core';
const useCustom$ = implicit$FirstArg(useTaskQrl);
export default () => {
  const count = useSignal(1);
  useCustom$(({ cleanup }) => {
    const value = count.value;
    console.log('custom', value);
    cleanup(() => console.log('cleanup-custom', value));
  });
  task(({ cleanup }) => {
    const value = count.value;
    console.log('task', value);
    cleanup(() => console.log('cleanup-task', value));
  });
  return <span />;
};`,
      },
    ],
  });
  const component = output.modules.find((module) => !module.segment)!;
  expect(component.code).toMatch(/import\s*\{[^}]*implicit\$FirstArg[^}]*\}\s*from/);
  expect(component.code).toMatch(/import\s*\{[^}]*useTaskQrl[^}]*\}\s*from/);
  const signals: core.Signal<number>[] = [];
  const logs: unknown[][] = [];
  const render = loadDefaultFunction(component, {
    ...core,
    task: core.useTask$,
    get _capturesObj() {
      return core._capturesObj;
    },
    console: { log: (...args: unknown[]) => logs.push(args) },
    useSignal: (initial: number) => {
      const signal = core.useSignal(initial);
      signals.push(signal);
      return signal;
    },
  });
  const owner = core.createOwner(null);
  try {
    core.runWithOwner(owner, render, undefined, setupOnlyContext);
    await defaultScheduler.flushInteraction();
    expect(logs).toEqual([
      ['custom', 1],
      ['task', 1],
    ]);
    signals[0].value = 2;
    await defaultScheduler.flushInteraction();
    expect(logs).toEqual([
      ['custom', 1],
      ['task', 1],
      ['cleanup-custom', 1],
      ['custom', 2],
      ['cleanup-task', 1],
      ['task', 2],
    ]);
  } finally {
    await core.disposeOwner(owner);
  }
  expect(logs.slice(-2)).toEqual([
    ['cleanup-task', 2],
    ['cleanup-custom', 2],
  ]);
});

test.each([true, false])(
  'an exported $ hook needs its twin exported in the same module (server: %s)',
  async (isServer) => {
    await expect(
      transformModules({
        srcDir: 'src',
        isServer,
        input: [
          {
            path: 'src/component.tsx',
            code: `import { implicit$FirstArg } from '@qwik.dev/core';
const useLocalQrl = (qrl) => qrl;
export const useLocal$ = implicit$FirstArg(useLocalQrl);
export default () => { useLocal$(() => 1); return <span />; };`,
          },
        ],
      })
    ).rejects.toThrow(UnsupportedError);
  }
);

test('a custom useComputed$ name does not inherit core callback restrictions', async () => {
  const plan = await analyseModule(
    {
      path: 'component.tsx',
      code: `
import { useComputed$ } from './hooks';
export default () => { useComputed$(async () => 1, { custom: true }); return <span />; };`,
    },
    {}
  );
  expect(plan.programs.flatMap((program) => program.setup)[0].s).toBe(SetupKind.Call);
});

test('forwarded setup QRLs retain identity and per-render captures across hooks', async () => {
  const output = await transformModules({
    srcDir: 'src',
    isServer: true,
    input: [
      {
        path: 'src/component.tsx',
        code: `
import { $, useSignal, useTask$, useComputed$ } from '@qwik.dev/core';
import { useCustom$ } from './hooks';
export default () => {
  const count = useSignal(1);
  const read = $(() => count.value);
  useTask$(read);
  useCustom$(read);
  const total = useComputed$(read);
  return <span />;
};`,
      },
    ],
  });
  expect(output.modules.filter((module) => module.segment)).toHaveLength(1);
  const callbacks: QRL<() => number>[] = [];
  const signals: core.Signal<number>[] = [];
  const computeds: ReturnType<typeof core.useComputedQrl>[] = [];
  const render = loadDefaultFunction(output.modules.find((module) => !module.segment)!, {
    ...core,
    get _capturesObj() {
      return core._capturesObj;
    },
    useSignal(initial: number) {
      const signal = core.useSignal(initial);
      signals.push(signal);
      return signal;
    },
    useTaskQrl(qrl: QRL<() => number>) {
      callbacks.push(qrl);
      return core.useTaskQrl(qrl);
    },
    useCustomQrl: (qrl: QRL<() => number>) => callbacks.push(qrl),
    useComputedQrl(qrl: QRL<() => number>) {
      callbacks.push(qrl);
      const computed = core.useComputedQrl(qrl);
      computeds.push(computed);
      return computed;
    },
  });
  const owner = core.createOwner(null);
  try {
    core.runWithOwner(owner, render, undefined, setupOnlyContext);
    core.runWithOwner(owner, render, undefined, setupOnlyContext);
    await defaultScheduler.flushInteraction();
    expect(callbacks).toHaveLength(6);
    expect(callbacks[1]).toBe(callbacks[0]);
    expect(callbacks[2]).toBe(callbacks[0]);
    expect(callbacks[4]).toBe(callbacks[3]);
    expect(callbacks[5]).toBe(callbacks[3]);
    expect(callbacks[3]).not.toBe(callbacks[0]);
    expect(callbacks[0].getCaptured()).toEqual([signals[0]]);
    expect(callbacks[3].getCaptured()).toEqual([signals[1]]);
    signals[0].value = 5;
    await defaultScheduler.flushInteraction();
    expect(computeds.map((computed) => computed.value)).toEqual([5, 1]);
    expect(await callbacks[0]()).toBe(5);
    expect(await callbacks[3]()).toBe(1);
  } finally {
    await core.disposeOwner(owner);
  }
});

test.each(['useTask$', 'useComputed$', 'useCustom$'])(
  'ships a body function binding to %s as its own segment',
  async (hook) => {
    const plan = await analyseModule(
      {
        path: 'component.tsx',
        code: `
import { useTask$, useComputed$ } from '@qwik.dev/core';
import { useCustom$ } from './hooks';
export default () => {
  const callback = () => 1;
  const result = ${hook}(callback);
  return <span />;
};`,
      },
      {}
    );
    const call = plan.programs[0].setup.find((entry) => entry.s === SetupKind.Call)!;
    expect(call).toMatchObject({ args: [{ a: ArgKind.Qrl }] });
    const use = (call.args[0] as Extract<Arg, { a: ArgKind.Qrl }>).use;
    // A body function passed by name lifts to its own segment; nothing wraps it.
    const qrl = plan.qrls.find((entry) => entry.id === use.qrl)!;
    expect(qrl.body.b).toBe(QrlBodyKind.Js);
    expect(qrl.captures).toHaveLength(0);
  }
);

test.each(['useTask$?.(callback)', 'useComputed$?.(callback, {})', 'useTask$(...callback)'])(
  'forwarded QRLs still validate the call form: %s',
  async (call) => {
    await expect(
      analyseModule(
        {
          path: 'component.tsx',
          code: `
import { $, useTask$, useComputed$ } from '@qwik.dev/core';
export default () => {
  const callback = $(() => 1);
  const result = ${call};
  return <span />;
};`,
        },
        {}
      )
    ).rejects.toThrow(UnsupportedError);
  }
);

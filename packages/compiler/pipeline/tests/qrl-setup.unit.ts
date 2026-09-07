import { expect, test } from 'vitest';
import { transformModules } from '../compat/transform-modules';
import { loadChunkFunction, loadDefaultFunction } from './fixtures';
import { analyseModule } from '../index';
import { BoundaryKind, SetupKind, ValueKind, QrlPayloadKind, ArgPass } from '../schema';
import { UnsupportedError } from '../errors';
import { _noopQrl, inlinedQrl } from '../../../qwik/src/core/shared/qrl/qrl';
import { _captures } from '../../../qwik/src/core/shared/qrl/qrl-captures';
import type { QRLInternal } from '../../../qwik/src/core/shared/qrl/qrl-class';

test('explicit boundaries retain binding identity and source ranges', async () => {
  const code = `import { $ as lazy } from '@qwik.dev/core';
export default (props) => {
  const onSave = lazy((value: number = props.id) => value);
  return <button onClick$={onSave}/>;
};`;
  const plan = await analyseModule({ path: 'component.tsx', code }, { transpileTs: true });
  const callback = plan.qrls.find((qrl) => qrl.boundary.kind === BoundaryKind.Explicit)!;
  expect(callback.payloadKind).toBe(QrlPayloadKind.Function);
  expect(callback.params.capturesBeforeParams).toBe(true);
  const sourceAt = (range: [number, number]) => plan.source.code.slice(...range);
  expect(sourceAt(callback.origin.calleeRange!)).toBe('lazy');
  expect(callback.origin.argumentRanges.map((range) => sourceAt(range!))).toEqual([
    sourceAt(callback.origin.functionRange),
  ]);
  const setup = plan.programs.flatMap((program) => program.setup);
  expect(setup).toHaveLength(1);
  expect(setup[0]).toMatchObject({
    s: SetupKind.Const,
    value: { v: ValueKind.Qrl, use: { qrl: callback.id, args: [{ pass: ArgPass.Props }] } },
  });
});

test.each([false, true])(
  'setup callbacks share native function semantics (SSR: %s)',
  async (isServer) => {
    const callbacks = [
      ['({ value = props.id } = {}) => value', 'outer'],
      ['async () => props.id', 'outer'],
      ['function (value = props.id) { return this.prefix + value; }', 'this:outer'],
      ['function repeat(n = 2) { return n ? repeat(n - 1) : props.id; }', 'outer'],
      ['() => {}', undefined],
    ] as const;
    for (const [callback, expected] of callbacks) {
      const output = await transformModules({
        srcDir: 'src',
        isServer,
        transpileTs: true,
        input: [
          {
            path: 'src/component.tsx',
            code: `import { $ } from '@qwik.dev/core';
export default (props) => {
  const handler = $(${callback});
  return <button onClick$={handler}/>;
};`,
          },
        ],
      });
      expect(output.diagnostics).toEqual([]);
      const chunk = output.modules.find((module) => module.segment?.ctxName === '$')!;
      expect(await loadChunkFunction(chunk, [{ id: 'outer' }]).call({ prefix: 'this:' })).toBe(
        expected
      );
    }
  }
);

test.each([false, true])(
  'setup QRLs pass through component props and props proxies (SSR: %s)',
  async (isServer) => {
    const output = await transformModules({
      srcDir: 'src',
      isServer,
      transpileTs: true,
      input: [
        {
          path: 'src/component.tsx',
          code: `import { $, useSignal } from '@qwik.dev/core';
export const Child = () => <span/>;
export default (props) => {
  const attributes = useSignal({ title: 'save' });
  const onSave = $(() => props.onSave$(props.id));
  return <main><Child onSave$={onSave}/><Child {...attributes.value} onSave$={onSave}/></main>;
};`,
        },
      ],
    });
    expect(output.diagnostics).toEqual([]);
    const chunks = output.modules.filter((module) => module.segment);
    expect(chunks.filter((module) => module.segment!.ctxName === '$')).toHaveLength(1);
    expect(chunks).toHaveLength(2);
    const component = output.modules.find((module) => !module.segment)!.code;
    expect(component).toContain('"onSave$": onSave');
    const proxy = chunks.find((module) => module.segment!.ctxName !== '$')!;
    expect(proxy.code).toContain('"onSave$": onSave');
    expect(proxy.segment!.captureNames).toEqual(['attributes', 'onSave']);
  }
);

test.each(['$()', '$(handler)', '$(...handlers)', '$(() => {}, 1)', '$?.(() => {})'])(
  'unsupported marker arguments fail closed: %s',
  async (initializer) => {
    await expect(
      analyseModule(
        {
          path: 'component.tsx',
          code: `import { $ } from '@qwik.dev/core';
export default () => { const onSave = ${initializer}; return <button onClick$={onSave}/>; };`,
        },
        {}
      )
    ).rejects.toThrow(UnsupportedError);
  }
);

test('a shadowed marker remains an ordinary local call', async () => {
  const plan = await analyseModule(
    {
      path: 'component.tsx',
      code: `import { $ } from '@qwik.dev/core';
export default () => {
  const $ = (value) => value;
  const onSave = $(() => 1);
  return <button onClick$={onSave}/>;
};`,
    },
    {}
  );
  expect(plan.qrls.some((qrl) => qrl.boundary.kind === BoundaryKind.Explicit)).toBe(false);
});

test('SSR reuses a callable QRL instance and isolates captures between renders', async () => {
  const output = await transformModules({
    srcDir: 'src',
    isServer: true,
    transpileTs: true,
    input: [
      {
        path: 'src/component.tsx',
        code: `import { $ } from '@qwik.dev/core';
export default (props) => {
  const onSave = $(() => props.onSave$(props.id));
  const result = onSave();
  return <main><button onClick$={onSave}/><button onClick$={onSave}/></main>;
};`,
      },
    ],
  });
  const component = output.modules.find((module) => !module.segment)!;
  const render = loadDefaultFunction(component, {
    _noopQrl,
    get _captures() {
      return _captures;
    },
  });
  const handlers: QRLInternal<() => string>[] = [];
  const calls: string[] = [];
  const ctx = {
    eventAttrParts(_name: string, handler: QRLInternal<() => string>) {
      handlers.push(handler);
      return '';
    },
  };
  const onSave$ = inlinedQrl((id: string) => {
    calls.push(id);
    return id;
  }, 'test_save');
  render({ id: 'first', onSave$ }, ctx);
  render({ id: 'second', onSave$ }, ctx);
  expect(calls).toEqual(['first', 'second']);
  expect(handlers).toHaveLength(4);
  expect(handlers[0]).toBe(handlers[1]);
  expect(handlers[2]).toBe(handlers[3]);
  expect(handlers[0]).not.toBe(handlers[2]);
  expect(await handlers[0]()).toBe('first');
  expect(await handlers[2]()).toBe('second');
});

test.each([false, true])('setup QRLs share one captured callback (SSR: %s)', async (isServer) => {
  const output = await transformModules({
    srcDir: 'src',
    isServer,
    transpileTs: true,
    input: [
      {
        path: 'src/component.tsx',
        code: `import { $ as lazy, useSignal } from '@qwik.dev/core';
export default (props) => {
  const count = useSignal(0);
  const onSave = lazy((event) => {
    count.value++;
    return props.onSave$(props.id, event.type);
  });
  return <main><button onClick$={onSave}/><button onClick$={onSave}/></main>;
};`,
      },
    ],
  });
  expect(output.diagnostics).toEqual([]);
  const chunks = output.modules.filter((module) => module.segment);
  expect(chunks).toHaveLength(1);
  expect(chunks[0].segment!.captureNames).toEqual(['count', 'props']);
  expect(chunks[0].segment!.ctxKind).toBe('function');
  const count = { value: 0 };
  const props = {
    id: 'saved',
    onSave$(id: string, type: string) {
      return `${id}:${type}`;
    },
  };
  const handler = loadChunkFunction(chunks[0], [count, props]);
  expect(handler({ type: 'click' })).toBe('saved:click');
  expect(count.value).toBe(1);
  const component = output.modules.find((module) => !module.segment)!.code;
  expect(component.match(/const onSave = /g)).toHaveLength(1);
  expect(component).not.toMatch(/createEventEffect|renderSsrEvent|lazy\(/);
  expect(
    component.match(
      isServer
        ? /eventAttrParts\("q-e:click", onSave\)/g
        : /setEvent\([^,]+, "q-e:click", onSave\)/g
    )
  ).toHaveLength(2);
});

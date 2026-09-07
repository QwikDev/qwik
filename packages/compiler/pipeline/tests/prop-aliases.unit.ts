import { expect, test } from 'vitest';
import { transformModules } from '../compat/transform-modules';
import { loadChunkFunction, loadDefaultFunction } from './fixtures';
import * as core from '../../../qwik/src/core/index';
import { createDocument } from '../../../qwik/src/testing/document';
import { Scheduler } from '../../../qwik/src/core/runtime/scheduler';
import { renderToStringCompiled as renderToString } from '../../../qwik/src/server/ssr-render';

test.each([
  ['title: heading', 'title'],
  ["'data-title': heading", 'data-title'],
  ['heading', 'heading'],
])('destructured props stay lazy and reactive: %s', async (pattern, propertyName) => {
  const output = await transformModules({
    srcDir: 'src',
    isServer: false,
    input: [
      {
        path: 'src/component.tsx',
        code: `export default ({ ${pattern}, onSave: save }) => <button onClick$={() => save({ heading })}>{heading}</button>;`,
      },
    ],
  });
  expect(output.diagnostics).toEqual([]);
  const text = output.modules.find((module) => module.segment?.ctxName === 'text')!;
  const event = output.modules.find((module) => module.segment?.ctxName === 'onClick$')!;
  expect(text.segment!.captureNames).toHaveLength(1);
  expect(event.segment!.captureNames).toEqual(text.segment!.captureNames);
  const value = core.useSignal('first');
  let reads = 0;
  let receiver: unknown = 'not called';
  let saved: unknown;
  const props = {
    get [propertyName]() {
      reads++;
      return value.value;
    },
    onSave(this: unknown, result: unknown) {
      receiver = this;
      saved = result;
    },
  };
  const globals: Record<string, unknown> = {
    ...core,
    get _captures() {
      return core._captures;
    },
  };
  for (const module of output.modules) {
    if (module.segment !== null) {
      const symbol = module.segment.name;
      globals[symbol] = loadDefaultFunction(
        { ...module, code: `${module.code}\nexport default ${symbol};` },
        globals
      );
    }
  }
  const renderComponent = loadDefaultFunction(
    output.modules.find((module) => !module.segment)!,
    globals
  );
  const save = loadChunkFunction(event, [props]);
  const document = createDocument();
  const scheduler = new Scheduler(() => {});
  const owner = core.createOwner(null);
  try {
    const button = core.runWithOwner(owner, () => renderComponent(props, { document, scheduler }));
    document.body.appendChild(button);
    expect(reads).toBe(0);
    await scheduler.flushInteraction();
    expect(button.textContent).toBe('first');
    value.value = 'second';
    await scheduler.flushInteraction();
    expect(button.textContent).toBe('second');
    save();
    expect(saved).toEqual({ heading: 'second' });
    expect(receiver).toBeUndefined();
  } finally {
    await core.disposeOwner(owner);
  }
});

test.each(['data-title', 'quote"slash\\key'])(
  'prop aliases work in setup without colliding with generated names: %s',
  async (key) => {
    const output = await transformModules({
      srcDir: 'src',
      isServer: true,
      input: [
        {
          path: 'src/component.tsx',
          code: `import { useComputed$ } from '@qwik.dev/core';
export default ({ ${JSON.stringify(key)}: props }) => {
  const heading = useComputed$(() => props.toUpperCase());
  return <strong>{heading.value}</strong>;
};`,
        },
      ],
    });
    expect(output.diagnostics).toEqual([]);
    const renderComponent = loadDefaultFunction(output.modules.find((module) => !module.segment)!, {
      ...core,
      get _captures() {
        return core._captures;
      },
    });
    const result = await renderToString(renderComponent, { props: { [key]: '<unsafe>' } });
    expect(result.html).toContain('&lt;UNSAFE&gt;</strong>');
  }
);

test.each(['format', 'useFormat'])('calls the prop alias %s in setup', async (alias) => {
  const output = await transformModules({
    srcDir: 'src',
    isServer: true,
    input: [
      {
        path: 'src/component.tsx',
        code: `export default ({ format: ${alias} }) => {
  const label = ${alias}('title');
  return <b />;
};`,
      },
    ],
  });
  expect(output.diagnostics).toEqual([]);
  let receiver: unknown = 'not called';
  let argument: unknown;
  const renderComponent = loadDefaultFunction(output.modules[0], core);
  renderComponent(
    {
      format(this: unknown, value: unknown) {
        receiver = this;
        argument = value;
      },
    },
    {}
  );
  expect(receiver).toBeUndefined();
  expect(argument).toBe('title');
});

test('a signal passed through a prop alias remains reactive', async () => {
  const output = await transformModules({
    srcDir: 'src',
    isServer: false,
    input: [
      {
        path: 'src/component.tsx',
        code: `export default ({ count: counter }) => <b>{counter.value}</b>;`,
      },
    ],
  });
  expect(output.diagnostics).toEqual([]);
  const read = loadChunkFunction(
    output.modules.find((module) => module.segment?.ctxName === 'text')!
  );
  const count = core.useSignal(1);
  const owner = core.createOwner(null);
  try {
    const value = core.runWithOwner(owner, () => core.useComputed(() => read({ count })));
    expect(value.value).toBe(1);
    count.value = 2;
    expect(value.value).toBe(2);
  } finally {
    await core.disposeOwner(owner);
  }
});

test('aliased children remain a slot without reading the props object', async () => {
  const output = await transformModules({
    srcDir: 'src',
    isServer: true,
    input: [
      {
        path: 'src/component.tsx',
        code: `export default ({ 'children': content }) => <section>{content}</section>;`,
      },
    ],
  });
  expect(output.diagnostics).toEqual([]);
  const render = loadDefaultFunction(output.modules[0], {
    ...core,
    renderSsrSlot: () => '<b>projected</b>',
  });
  const props = {
    get children() {
      throw new Error('children must not be read');
    },
  };
  expect((await render(props, {})).flat(Infinity).join('')).toBe(
    '<section><b>projected</b></section>'
  );
});

test.each(['...rest', '[key]: heading', 'nested: { title }'])(
  'keeps unsupported prop patterns explicit: %s',
  async (pattern) => {
    await expect(
      transformModules({
        input: [
          { path: 'src/component.tsx', code: `export default ({ ${pattern} }) => <span />;` },
        ],
        isServer: true,
      })
    ).rejects.toThrow('a destructured component parameter');
  }
);

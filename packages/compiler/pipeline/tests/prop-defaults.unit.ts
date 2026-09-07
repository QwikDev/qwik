import { expect, test } from 'vitest';
import { transformModules } from '../compat/transform-modules';
import { loadChunkFunction, loadDefaultFunction } from './fixtures';
import * as core from '../../../qwik/src/core/index';
import { getActiveCollector } from '../../../qwik/src/core/reactive/tracking';
import { createDocument } from '../../../qwik/src/testing/document';
import { Scheduler } from '../../../qwik/src/core/runtime/scheduler';
import { renderToStringCompiled } from '../../../qwik/src/server/ssr-render';
import { analyseModule } from '../analyse/analyse-module';
import { ExprKind, SetupKind } from '../schema';

test('prop default setup describes initialization rather than tracking control flow', async () => {
  const plan = await analyseModule(
    {
      path: 'component.tsx',
      code: `export default ({ title = createTitle() }) => <b>{title}</b>;`,
    },
    {}
  );
  expect(plan.programs[0].setup).toEqual([
    {
      s: SetupKind.PropDefault,
      result: expect.any(Number),
      props: expect.any(Number),
      name: 'title',
      initializer: { kind: ExprKind.Js, payload: expect.any(Number) },
    },
  ]);
  expect(plan.qrls.find((qrl) => qrl.ctxName === 'text')?.body).toMatchObject({
    b: 'expr',
    expr: {
      kind: ExprKind.Ir,
      ir: { kind: 'prop-read', name: 'title', fallback: { kind: 'binding-read' } },
    },
  });
});

test.each([true, false])(
  'defaults preserve identity, order and undefined semantics (SSR: %s)',
  async (isServer) => {
    const output = await transformModules({
      input: [
        {
          path: 'component.tsx',
          code: `export default ({ 'data-title': heading = createTitle(), suffix = '!', metadata = createMetadata() }) => {
  const defaultValue = 'occupied';
  return <button title={heading}>{heading + suffix}</button>;
};`,
        },
      ],
      isServer,
    });
    expect(output.diagnostics).toEqual([]);
    const calls: string[] = [];
    const title = core.useSignal<string | undefined>('<fallback>');
    const globals: Record<string, unknown> = {
      ...core,
      createTitle() {
        calls.push('title');
        return title.value;
      },
      createMetadata() {
        calls.push('metadata');
        return {};
      },
    };
    for (const module of output.modules) {
      if (module.segment !== null) {
        globals[module.segment.name] = loadChunkFunction(module, [], globals);
      }
    }
    if (isServer) {
      globals.renderSsrTextExpression = (
        ...args: Parameters<typeof core.renderSsrTextExpression>
      ) => core.renderSsrTextExpression(args[0], args[1], Array.from(args[2]), args[3]);
      const render = loadDefaultFunction(output.modules[0], globals);
      const result = await renderToStringCompiled(render, { props: {} });
      expect(result.html).toContain('&lt;fallback&gt;!');
      expect(result.html).toContain('title="&lt;fallback&gt;"');
      expect(calls).toEqual(['title', 'metadata']);
      return;
    }
    const document = createDocument();
    const renderComponent = loadDefaultFunction(output.modules[0], globals);
    const scheduler = new Scheduler(() => {});
    const owner = core.createOwner(null);
    const source = core.useSignal<string | null | undefined>(undefined);
    const suffix = core.useSignal<string | null | undefined>(undefined);
    try {
      const button = core.runWithOwner(owner, () =>
        renderComponent(
          {
            get 'data-title'() {
              return source.value;
            },
            get suffix() {
              return suffix.value;
            },
          },
          { document, scheduler }
        )
      );
      document.body.appendChild(button);
      await scheduler.flushInteraction();
      expect(button.textContent).toBe('<fallback>!');
      source.value = 'changed';
      suffix.value = null;
      await scheduler.flushInteraction();
      expect(button.textContent).toBe('changednull');
      source.value = undefined;
      suffix.value = undefined;
      title.value = 'not reevaluated';
      await scheduler.flushInteraction();
      expect(button.textContent).toBe('<fallback>!');
      expect(calls).toEqual(['title', 'metadata']);
    } finally {
      await core.disposeOwner(owner);
    }
  }
);

test('non-literal defaults retain the same object across reads and captures', async () => {
  const output = await transformModules({
    input: [
      {
        path: 'component.tsx',
        code: `export default ({ metadata = createMetadata() }) => <button onClick$={() => metadata}>{metadata.label}</button>;`,
      },
    ],
    isServer: true,
  });
  const metadata = { label: 'fallback' };
  let captures: unknown[] = [];
  const renderComponent = loadDefaultFunction(output.modules[0], {
    ...core,
    createMetadata: () => metadata,
    renderSsrTextExpression: () => '',
  });
  renderComponent(
    {},
    {
      nextId: () => 0,
      addRoot() {},
      eventAttrParts(_name: string, qrl: { getCaptured(): unknown[] }) {
        captures = qrl.getCaptured();
        return '';
      },
    }
  );
  const event = loadChunkFunction(
    output.modules.find((module) => module.segment?.ctxName === 'onClick$')!,
    captures
  );
  expect(event()).toBe(metadata);
  expect(event()).toBe(metadata);
});

test.each([undefined, null, 'initial'])(
  'dynamic defaults are initialized once, only for initially missing props: %s',
  async (initial) => {
    const output = await transformModules({
      srcDir: 'src',
      isServer: true,
      input: [
        {
          path: 'src/component.tsx',
          code: `import { createTitle } from './defaults';
export default ({ title: heading = createTitle() }) => <button onClick$={() => ({ heading })}>{heading}</button>;`,
        },
      ],
    });
    expect(output.diagnostics).toEqual([]);
    const owner = core.createOwner(null);
    const source = core.useSignal<string | null | undefined>(initial);
    const props = {
      get title() {
        return source.value;
      },
    };
    let calls = 0;
    const captured: unknown[][] = [];
    const renderComponent = loadDefaultFunction(output.modules[0], {
      ...core,
      createTitle() {
        calls++;
        return 'fallback';
      },
      renderSsrTextExpression(_id: unknown, _range: unknown, captures: unknown[]) {
        captured.push(captures);
        return '';
      },
    });
    const eventCaptures: unknown[][] = [];
    try {
      core.runWithOwner(owner, () =>
        renderComponent(props, {
          nextId: () => 0,
          addRoot() {},
          eventAttrParts(_name: string, qrl: { getCaptured(): unknown[] }) {
            eventCaptures.push(qrl.getCaptured());
            return '';
          },
        })
      );
      expect(calls).toBe(initial === undefined ? 1 : 0);
      const read = loadChunkFunction(
        output.modules.find((module) => module.segment?.ctxName === 'text')!
      );
      const event = loadChunkFunction(
        output.modules.find((module) => module.segment?.ctxName === 'onClick$')!,
        eventCaptures[0]
      );
      const value = core.runWithOwner(owner, () => core.useComputed(() => read(...captured[0])));
      for (const next of [initial, 'changed', undefined, null, 'again']) {
        source.value = next;
        const expected =
          next === undefined ? (initial === undefined ? 'fallback' : undefined) : next;
        expect(value.value).toBe(expected);
        expect(event()).toEqual({ heading: expected });
        expect(calls).toBe(initial === undefined ? 1 : 0);
      }
    } finally {
      await core.disposeOwner(owner);
    }
  }
);

test.each([
  'title = title',
  'title = other, other',
  'title = createTitle(other), other',
  'title = () => other, other',
  'children = createTitle()',
])('rejects deferred parameter defaults: %s', async (pattern) => {
  await expect(
    transformModules({
      input: [{ path: 'component.tsx', code: `export default ({ ${pattern} }) => <span />;` }],
      isServer: true,
    })
  ).rejects.toThrow('pipeline does not support');
});

test.each(['', 'import { createTitle } from "./defaults";'])(
  'rejects defaults whose references would be shadowed in the body: %s',
  async (prefix) => {
    await expect(
      transformModules({
        input: [
          {
            path: 'component.tsx',
            code: `${prefix}
export default ({ title = createTitle() }) => {
  const createTitle = () => 'local';
  return <b>{title}</b>;
};`,
          },
        ],
        isServer: true,
      })
    ).rejects.toThrow('a prop default shadowed by component setup');
  }
);

test('only the initial prop check is untracked', async () => {
  const output = await transformModules({
    input: [
      { path: 'component.tsx', code: `export default ({ title = createTitle() }) => <b />;` },
    ],
    isServer: true,
  });
  const owner = core.createOwner(null);
  const title = core.useSignal<string | undefined>(undefined);
  const fallback = core.useSignal('fallback');
  let calls = 0;
  let renders = 0;
  const renderComponent = loadDefaultFunction(output.modules[0], {
    ...core,
    createTitle() {
      calls++;
      expect(getActiveCollector()).not.toBeNull();
      return fallback.value;
    },
  });
  try {
    const rendered = core.runWithOwner(owner, () =>
      core.useComputed(() => {
        renders++;
        return renderComponent(
          {
            get title() {
              return title.value;
            },
          },
          {}
        );
      })
    );
    expect(rendered.value).toBeDefined();
    expect(calls).toBe(1);
    title.value = 'supplied';
    expect(rendered.value).toBeDefined();
    expect(calls).toBe(1);
    expect(renders).toBe(1);
    fallback.value = 'changed';
    expect(rendered.value).toBeDefined();
    expect(renders).toBe(2);
    title.value = undefined;
    expect(rendered.value).toBeDefined();
    expect(calls).toBe(1);
    expect(renders).toBe(2);
  } finally {
    await core.disposeOwner(owner);
  }
});

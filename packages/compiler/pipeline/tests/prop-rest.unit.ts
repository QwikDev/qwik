import { expect, test } from 'vitest';
import { transformModules } from '../compat/transform-modules';
import { loadDefaultFunction, readRenderedText } from './fixtures';
import * as core from '../../../qwik/src/core/index';
import { createDocument } from '../../../qwik/src/testing/document';
import { Scheduler } from '../../../qwik/src/core/runtime/scheduler';
import { renderToStringCompiled } from '../../../qwik/src/server/ssr-render';

test.each([true, false])(
  'forwards rest props with changing values and keys (SSR: %s)',
  async (isServer) => {
    const output = await transformModules({
      srcDir: 'src',
      isServer,
      input: [
        {
          path: 'src/component.tsx',
          code: `import { Child } from './child';
export default ({ title: heading, children, ...rest }) => <Child {...rest} title={heading}>{children}</Child>;`,
        },
      ],
    });
    expect(output.diagnostics).toEqual([]);
    expect(output.modules.some((module) => module.segment?.ctxName === 'props:rest')).toBe(false);
    const globals: Record<string, unknown> = {
      ...core,
      get _captures() {
        return core._captures;
      },
    };
    for (const module of output.modules) {
      if (!isServer && module.segment !== null) {
        globals[module.segment.name] = loadDefaultFunction(
          { ...module, code: `${module.code}\nexport default ${module.segment.name};` },
          globals,
          true
        );
      }
    }
    globals._qrlWithChunk = (_path: string, _load: unknown, symbol: string) => {
      const qrl = core._noopQrl(symbol);
      qrl.s(globals[symbol] as (...args: unknown[]) => unknown);
      return qrl;
    };
    let forwarded: Record<string, unknown> | undefined;
    globals.createComponent = (_component: unknown, props: Record<string, unknown>) => {
      forwarded = props;
      return [];
    };
    globals.Child = () => [];
    globals.forwardSlot = () => {};
    const renderComponent = loadDefaultFunction(output.modules[0], globals, true);
    const owner = core.createOwner(null);
    const source = core.useSignal<Record<string, unknown>>({ title: 'Title', label: 'first' });
    const props = core.createPropsProxy(source);
    try {
      core.runWithOwner(owner, () =>
        renderComponent(props, {
          document: createDocument(),
          scheduler: new Scheduler(() => {}),
          addRoot() {},
        })
      );
      expect(forwarded!.label).toBe('first');
      expect(forwarded!.title).toBe('Title');
      expect(Object.keys(forwarded!)).toEqual(['label', 'title']);
      source.value = { title: 'Next', second: 'second' };
      expect(forwarded!.label).toBeUndefined();
      expect(forwarded!.second).toBe('second');
      expect(forwarded!.title).toBe('Next');
      expect(Object.keys(forwarded!)).toEqual(['second', 'title']);
      expect('children' in forwarded!).toBe(false);
    } finally {
      await core.disposeOwner(owner);
    }
  }
);

test.each(['...rest', 'title: heading, children: content, ...rest'])(
  'captures component rest in a computed callback: %s',
  async (pattern) => {
    const output = await transformModules({
      srcDir: 'src',
      isServer: true,
      input: [
        {
          path: 'src/component.tsx',
          code: `import { useComputed$ } from '@qwik.dev/core';
export default ({ ${pattern} }) => {
  const label = useComputed$(() => rest.label.toUpperCase());
  return <strong>{label.value}</strong>;
};`,
        },
      ],
    });
    expect(output.diagnostics).toEqual([]);
    const render = loadDefaultFunction(
      output.modules[0],
      {
        ...core,
        get _captures() {
          return core._captures;
        },
      },
      true
    );
    const result = await renderToStringCompiled(render, {
      props: Object.defineProperty({ label: '<unsafe>' }, 'children', {
        get() {
          throw new Error('children must not be read');
        },
      }),
    });
    expect(result.html).toContain('&lt;UNSAFE&gt;');
    expect(readRenderedText(result.html, 'strong')).toEqual(['<UNSAFE>']);
  }
);

test('rejects a default referencing the rest binding', async () => {
  await expect(
    transformModules({
      isServer: true,
      input: [
        {
          path: 'component.tsx',
          code: 'export default ({ title = rest.label, ...rest }) => <b>{title}</b>;',
        },
      ],
    })
  ).rejects.toThrow('a prop default referencing another parameter binding');
});

test.each([true, false])(
  'forwards a rest-only spread without computation (SSR: %s)',
  async (isServer) => {
    const output = await transformModules({
      isServer,
      input: [
        {
          path: 'component.tsx',
          code: "import { Child } from './child'; export default ({ title, ...rest }) => <Child {...rest} />;",
        },
      ],
    });
    expect(output.diagnostics).toEqual([]);
    expect(output.modules).toHaveLength(1);
    expect(output.modules[0].code).toContain('createComponent(Child, rest, ctx)');
    expect(output.modules[0].code).not.toContain('useComputedQrl');
  }
);

import { expect, test } from 'vitest';
import { transformModules } from '../compat/transform-modules';
import { loadDefaultFunction } from './fixtures';
import * as core from '../../../qwik/src/core/index';
import { renderToStringCompiled as renderToString } from '../../../qwik/src/server/ssr-render';
import { createDocument } from '../../../qwik/src/testing/document';
import { Scheduler } from '../../../qwik/src/core/runtime/scheduler';

test.each([
  ['fragment', '<><b>first</b><i>second</i></>'],
  ['empty fragment', '<></>'],
  ['conditional', 'props.visible ? <b>on</b> : null'],
  ['logical', 'props.visible && <b>on</b>'],
  ['text alternative', 'props.visible ? <b>on</b> : props.label'],
])('renders a %s component return with the SSR runtime', async (name, expression) => {
  const output = await transformModules({
    srcDir: 'src',
    isServer: true,
    input: [
      {
        path: 'src/component.tsx',
        code: `export default function App(props) { return ${expression}; }`,
      },
    ],
  });
  expect(output.diagnostics).toEqual([]);
  const render = loadDefaultFunction(output.modules.find((module) => !module.segment)!, {
    ...core,
    get _captures() {
      return core._captures;
    },
    renderSsrTextExpression(...args: Parameters<typeof core.renderSsrTextExpression>) {
      // VM capture arrays must enter the serializer's realm.
      args[2] = Array.from(args[2]);
      return core.renderSsrTextExpression(...args);
    },
  });
  for (const visible of [true, false]) {
    const result = await renderToString(render, { props: { visible, label: '<unsafe>' } });
    if (name === 'fragment') {
      expect(result.html).toContain('<b>first</b><i>second</i>');
    } else if (name === 'empty fragment') {
      expect(result.html).toContain('<body></body>');
    } else {
      expect(result.html.includes('<b>on</b>')).toBe(visible);
      expect(result.html).toContain('<!b=');
      expect(result.html).toContain('<!/b>');
      if (!visible && name === 'text alternative') {
        expect(result.html).toMatch(/<!d=[^>]+>&lt;unsafe&gt;<!\/d>/);
      } else if (!visible) {
        expect(result.html).toMatch(/<!b=[^>]+><!\/b>/);
      }
    }
  }
});

test('a CSR fragment returns flat nodes when its children return arrays', async () => {
  const output = await transformModules({
    srcDir: 'src',
    isServer: false,
    input: [
      {
        path: 'src/component.tsx',
        code: `import { Child } from './child';
export default () => <><Child /><Child /></>;`,
      },
    ],
  });
  expect(output.diagnostics).toEqual([]);
  const document = createDocument();
  const render = loadDefaultFunction(output.modules.find((module) => !module.segment)!, {
    ...core,
    Child: () => [document.createTextNode('first'), document.createTextNode('second')],
  });
  const nodes: Node[] = render({}, { document });
  expect(nodes.map((node) => node.textContent)).toEqual(['first', 'second', 'first', 'second']);
  for (const node of nodes) {
    document.body.appendChild(node);
  }
  expect(document.body.textContent).toBe('firstsecondfirstsecond');
  expect(nodes).toHaveLength(4);
});

test.each(['props.visible.value ? <b>on</b> : null', 'props.visible.value && <b>on</b>'])(
  'a CSR root branch updates after its markers are mounted: %s',
  async (expression) => {
    const output = await transformModules({
      srcDir: 'src',
      isServer: false,
      input: [{ path: 'src/component.tsx', code: `export default (props) => ${expression};` }],
    });
    expect(output.diagnostics).toEqual([]);
    const globals: Record<string, unknown> = {
      ...core,
      get _captures() {
        return core._captures;
      },
      _qrlWithChunk(chunk: string, _importer: unknown, symbol: string) {
        return core._qrlWithChunk(chunk, async () => ({ [symbol]: globals[symbol] }), symbol);
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
    const render = loadDefaultFunction(output.modules.find((module) => !module.segment)!, globals);
    const document = createDocument();
    const scheduler = new Scheduler(() => {});
    const owner = core.createOwner(null);
    const visible = core.useSignal(false);
    try {
      const nodes: Node[] = core.runWithOwner(owner, () =>
        render({ visible }, { document, scheduler })
      );
      expect(nodes).toHaveLength(2);
      for (const node of nodes) {
        document.body.appendChild(node);
      }
      for (const value of [false, true, false, true]) {
        visible.value = value;
        await scheduler.flushInteraction();
        expect(document.body.querySelector('b')?.textContent ?? '').toBe(value ? 'on' : '');
        expect(document.body.firstChild).toBe(nodes[0]);
        expect(document.body.lastChild).toBe(nodes[1]);
      }
    } finally {
      await core.disposeOwner(owner);
    }
  }
);

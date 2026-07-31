import { parseSync } from 'oxc-parser';
import { describe, expect, test } from 'vitest';
import { transformModules } from './index';
import { validateModule, TransformDiagnosticCode } from './transform-diagnostics';
import { discoverComponents } from './discover';
import { extractQrls } from './extract';

function diagnostics(code: string) {
  const file = 'src/component.tsx';
  const parsed = parseSync(file, code, {
    lang: 'tsx',
    sourceType: 'module',
    astType: 'ts',
    range: true,
  });
  expect(parsed.errors).toEqual([]);
  const extracted = extractQrls(parsed.program, file);
  const components = discoverComponents(parsed.program, extracted.analysis);
  return validateModule(code, file, components, extracted);
}

function diagnosticCodes(code: string) {
  return diagnostics(code).map((diagnostic) => diagnostic.code);
}

describe('transform diagnostics', () => {
  test('transforms Suspense without an unsupported diagnostic or JSX fallback', async () => {
    const input = {
      path: 'src/component.tsx',
      code: `import { Suspense } from '@qwik.dev/core';
export function App() { return <Suspense>content</Suspense>; }`,
    };
    for (const isServer of [true, false]) {
      const result = await transformModules({
        input: [input],
        srcDir: 'src',
        sourceMaps: false,
        transpileTs: true,
        transpileJsx: true,
        isServer,
      });

      expect(result.diagnostics).toEqual([]);
      expect(result.modules[0].code).not.toContain('<Suspense');
    }
  });

  test('lowers runtime JSX in ordinary functions', async () => {
    const input = {
      path: 'src/helper.tsx',
      code: `export function helper() { const value = <div>content</div>; console.log(value); }`,
    };
    const result = await transformModules({
      input: [input],
      srcDir: 'src',
      sourceMaps: false,
      transpileTs: true,
      transpileJsx: true,
      isServer: true,
    });

    expect(result.diagnostics).toEqual([]);
    expect(result.modules[0].code).toContain('return "<div>content</div>";');
    expect(result.modules[0].code).not.toContain('<div>content</div>;');
  });

  test('accepts direct and namespace Suspense boundaries', () => {
    const result = diagnostics(`import { Suspense as Boundary } from '@qwik.dev/core';
import * as Qwik from '@qwik.dev/core';

export function App() {
  return <main><Boundary fallback="loading">content</Boundary><Qwik.Suspense /></main>;
}
`);

    expect(result).toEqual([]);
  });

  test('does not diagnose shadowed Suspense imports', () => {
    expect(
      diagnosticCodes(`import { Suspense as Boundary } from '@qwik.dev/core';
import * as Qwik from '@qwik.dev/core';

export function App(Boundary) {
  const Qwik = { Suspense: () => null };
  return <main><Boundary /><Qwik.Suspense /></main>;
}
`)
    ).toEqual([]);
  });

  test('rejects innerHTML props combined with renderable children', () => {
    const result = diagnostics(`export function App() {
  return <><div dangerouslySetInnerHTML={'<b>html</b>'}>child</div><p innerHTML={'html'}>{value}</p></>;
}
`);

    expect(result.map((diagnostic) => diagnostic.code)).toEqual([
      TransformDiagnosticCode.InnerHtmlChildren,
      TransformDiagnosticCode.InnerHtmlChildren,
    ]);
    expect(result.map((diagnostic) => diagnostic.message)).toEqual([
      'JSX prop "dangerouslySetInnerHTML" cannot be combined with JSX children in a render plan.',
      'JSX prop "innerHTML" cannot be combined with JSX children in a render plan.',
    ]);
  });

  test('allows innerHTML without renderable children', () => {
    expect(
      diagnosticCodes(`export function App() {
  return <><div dangerouslySetInnerHTML={'html'} /> <div dangerouslySetInnerHTML={'html'}>{null}</div></>;
}
`)
    ).toEqual([]);
  });

  test('rejects mixed dynamic raw-text children', () => {
    const result = diagnostics(`export function App({ title, suffix }) {
  return <><title>Prefix {title}</title><style>{title}{suffix}</style></>;
}
`);

    expect(result.map((diagnostic) => diagnostic.code)).toEqual([
      TransformDiagnosticCode.RawTextChildren,
      TransformDiagnosticCode.RawTextChildren,
    ]);
  });

  test('allows static or one dynamic raw-text child', () => {
    expect(
      diagnosticCodes(`export function App({ title, css }) {
  return <><title>Static</title><textarea>{title}</textarea><style>{css}</style></>;
}
`)
    ).toEqual([]);
  });

  test.each(['script', 'style', 'textarea', 'title'])(
    'rejects Suspense inside raw-text <%s>',
    (tag) => {
      expect(
        diagnosticCodes(`import { Suspense } from '@qwik.dev/core';
export function App() {
  return <${tag}><Suspense>ready</Suspense></${tag}>;
}`)
      ).toEqual([TransformDiagnosticCode.RawTextChildren]);
    }
  );

  test.each(['{<Suspense>ready</Suspense>}', '{true && <Suspense>ready</Suspense>}'])(
    'rejects expression-wrapped raw-text Suspense %s',
    (child) => {
      expect(
        diagnosticCodes(`import { Suspense } from '@qwik.dev/core';
export function App() {
  return <title>${child}</title>;
}`)
      ).toEqual([TransformDiagnosticCode.RawTextChildren]);
    }
  );

  test('allows Promise native attributes and rejects unsupported Promise surfaces', () => {
    const result = diagnostics(`const Child = (props) => <span>{props.value}</span>;
export function App() {
  return <><div title={Promise.resolve('title')} onClick$={Promise.resolve(null)} ref={Promise.resolve(null)} key={Promise.resolve('key')} {...Promise.resolve({})} /><div innerHTML={Promise.resolve('html')} /><Child value={new Promise(() => {})} data={import('./data')} other={(async () => 1)()} /></>;
}
`);

    expect(result.map((diagnostic) => diagnostic.code)).toEqual([
      TransformDiagnosticCode.PromiseScalar,
      TransformDiagnosticCode.PromiseScalar,
      TransformDiagnosticCode.PromiseScalar,
      TransformDiagnosticCode.PromiseScalar,
      TransformDiagnosticCode.PromiseScalar,
      TransformDiagnosticCode.PromiseScalar,
      TransformDiagnosticCode.PromiseScalar,
      TransformDiagnosticCode.PromiseScalar,
    ]);
    expect(result.map((diagnostic) => diagnostic.message)).toEqual([
      'Promise values are not supported for scalar JSX attribute or component prop "onClick$".',
      'Promise values are not supported for scalar JSX attribute or component prop "ref".',
      'Promise values are not supported for scalar JSX attribute or component prop "key".',
      'Promise values are not supported for JSX props spreads.',
      'Promise values are not supported for scalar JSX attribute or component prop "innerHTML".',
      'Promise values are not supported for scalar JSX attribute or component prop "value".',
      'Promise values are not supported for scalar JSX attribute or component prop "data".',
      'Promise values are not supported for scalar JSX attribute or component prop "other".',
    ]);
  });

  test('does not guess the type of dynamic scalar values or a shadowed Promise', () => {
    expect(
      diagnosticCodes(`export function App(Promise) {
  const value = loadValue();
  return <div title={Promise.resolve('local')} data-value={value} />;
}
`)
    ).toEqual([]);
  });

  test('recognizes a destructured Promise parameter as a local binding', () => {
    expect(
      diagnosticCodes(`export function App({ Promise }) {
  return <div title={Promise.resolve('local')} />;
}
`)
    ).toEqual([]);
  });

  test('rejects lifecycle hooks inside render functions but allows component setup hooks', () => {
    const result = diagnostics(`import { useSignal, useTask$ } from '@qwik.dev/core';

export function App() {
  const rows = useSignal([{ id: 'a' }]);
  useTask$(() => console.log('setup'));
  return <ul>{rows.value.map((row) => <li key={row.id}>{useTask$(() => console.log(row.id))}</li>)}</ul>;
}
`);

    expect(result).toHaveLength(1);
    expect(result[0].code).toBe(TransformDiagnosticCode.LifecycleInRender);
    expect(result[0].message).toBe(
      'Lifecycle hook "useTask$" cannot be registered inside a forRender render function.'
    );
  });

  test('requires the target-specific exported companion for a local marker', async () => {
    const input = {
      path: 'src/local.tsx',
      code: `export const local$ = (value) => value;
export const local = (value) => value;
export function App() {
  local$(() => 1);
  return <p>Local</p>;
}
`,
    };
    const csr = await transformModules({
      input: [input],
      srcDir: 'src',
      sourceMaps: false,
      transpileTs: true,
      transpileJsx: true,
      isServer: false,
    });
    const ssr = await transformModules({
      input: [input],
      srcDir: 'src',
      sourceMaps: false,
      transpileTs: true,
      transpileJsx: true,
      isServer: true,
    });

    expect(csr.diagnostics).toEqual([]);
    expect(ssr.diagnostics).toHaveLength(1);
    expect(ssr.diagnostics[0].code).toBe(TransformDiagnosticCode.MissingQrlImplementation);
    expect(ssr.diagnostics[0].message).toContain("corresponding exported 'localQrl'");
  });

  test('rejects a non-function QRL value that captures component scope', async () => {
    const input = {
      path: 'src/value.tsx',
      code: `import { serializer$ } from 'library';
export function App({ initial }) {
  serializer$({ initial });
  return <p>Value</p>;
}
`,
    };
    const result = await transformModules({
      input: [input],
      srcDir: 'src',
      sourceMaps: false,
      transpileTs: true,
      transpileJsx: true,
      isServer: false,
    });

    expect(result.diagnostics).toHaveLength(1);
    expect(result.diagnostics[0].code).toBe(TransformDiagnosticCode.NonFunctionCapture);
  });
});

describe('keyless reactive collections', () => {
  const sources: Record<string, string> = {
    'direct-reactive': `import { useSignal } from '@qwik.dev/core';
export function App() {
  const items = useSignal([]);
  return <ul>{items.value.map((item) => <li>{item}</li>)}</ul>;
}`,
    derived: `import { useSignal } from '@qwik.dev/core';
export function App() {
  const length = useSignal(0);
  return <ul>{Array.from({ length: length.value }).map((_, i) => <li>{i}</li>)}</ul>;
}`,
  };

  for (const [label, code] of Object.entries(sources)) {
    for (const isServer of [false, true]) {
      test(`${label} compiles with a warning (${isServer ? 'ssr' : 'csr'})`, async () => {
        const result = await transformModules({
          input: [{ path: `src/keyless-${label}.tsx`, code }],
          srcDir: 'src',
          sourceMaps: false,
          transpileTs: true,
          transpileJsx: true,
          isServer,
        });

        expect(
          result.diagnostics.map((item) => ({ code: item.code, category: item.category }))
        ).toEqual([{ code: 'for-key', category: 'warning' }]);
        expect(result.modules.length).toBeGreaterThan(0);
      });
    }
  }

  test('the warning points at the author line, not the transpiled one', async () => {
    const code = `import { useSignal } from '@qwik.dev/core';

interface Props {
  label: string;
}

export function App() {
  const items = useSignal<string[]>([]);
  return <ul>{items.value.map((item) => <li>{item}</li>)}</ul>;
}
`;
    const result = await transformModules({
      input: [{ path: 'src/keyless-position.tsx', code }],
      srcDir: 'src',
      sourceMaps: false,
      transpileTs: true,
      transpileJsx: true,
    });

    const mapLine = code.split('\n').findIndex((line) => line.includes('.map(')) + 1;
    expect(result.diagnostics[0]?.highlights?.[0]?.startLine).toBe(mapLine);
  });

  test('a keyed collection reports no diagnostics', async () => {
    const result = await transformModules({
      input: [
        {
          path: 'src/keyed-collection.tsx',
          code: `import { useSignal } from '@qwik.dev/core';
export function App() {
  const items = useSignal([]);
  return <ul>{items.value.map((item) => <li key={item}>{item}</li>)}</ul>;
}`,
        },
      ],
      srcDir: 'src',
      sourceMaps: false,
      transpileTs: true,
      transpileJsx: true,
    });

    expect(result.diagnostics).toEqual([]);
  });
});

describe('component keys', () => {
  test('warns that a component key does not remount the component', () => {
    const result = diagnostics(`import { Child } from './child';
export function App({ version }) {
  return <Child key={version} />;
}
`);

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      code: 'component-key',
      category: 'warning',
      message:
        'The "key" prop on a component outside a JSX collection is ignored and does not remount it. To force a remount, switch branches: condition ? <Component /> : <Component />.',
    });
    expect(result[0]?.highlights?.[0]?.startLine).toBe(3);
  });

  test('does not warn for native element keys', () => {
    expect(
      diagnostics(`export function App({ version }) {
  return <main key={version}>content</main>;
}
`)
    ).toEqual([]);
  });

  test('does not warn for static component keys', () => {
    expect(
      diagnostics(`import { Child } from './child';
export function App() {
  return <main><Child key="first" /><Child key={2} /><Child key={'third'} /></main>;
}
`)
    ).toEqual([]);
  });

  test('warns for namespace component keys', () => {
    expect(
      diagnostics(`import * as UI from './ui';
export function App({ version }) {
  return <UI.Child key={version} />;
}
`).map((diagnostic) => diagnostic.code)
    ).toEqual(['component-key']);
  });

  test('does not warn for component collection keys', () => {
    expect(
      diagnostics(`import { Row } from './row';
export function App({ rows }) {
  return <main>{rows.map((row) => <Row key={row.id} value={row} />)}</main>;
}
`)
    ).toEqual([]);
  });
});

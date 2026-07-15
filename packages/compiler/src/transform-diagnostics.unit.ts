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
  test('returns compiler diagnostics through transformModules without JSX fallback', async () => {
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

      expect(result.diagnostics.map((diagnostic) => diagnostic.code)).toEqual([
        TransformDiagnosticCode.SuspenseUnsupported,
      ]);
      expect(result.modules).toHaveLength(1);
      expect(result.modules[0].code).toBe('');
    }
  });

  test('diagnoses runtime JSX that does not belong to a supported component or boundary', async () => {
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

    expect(result.diagnostics.map((diagnostic) => diagnostic.code)).toEqual([
      TransformDiagnosticCode.UnsupportedRuntimeJsx,
    ]);
    expect(result.modules[0].code).toBe('');
  });

  test('rejects direct and namespace Suspense boundaries', () => {
    const result = diagnostics(`import { Suspense as Boundary } from '@qwik.dev/core';
import * as Qwik from '@qwik.dev/core';

export function App() {
  return <main><Boundary fallback="loading">content</Boundary><Qwik.Suspense /></main>;
}
`);

    expect(result).toHaveLength(2);
    expect(result.map((diagnostic) => diagnostic.code)).toEqual([
      TransformDiagnosticCode.SuspenseUnsupported,
      TransformDiagnosticCode.SuspenseUnsupported,
    ]);
    expect(result[0].message).toBe('Suspense is not supported by the compiler yet.');
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

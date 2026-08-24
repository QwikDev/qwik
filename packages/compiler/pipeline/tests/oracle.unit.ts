/**
 * Differential-oracle harness (DESIGN.md "Phases").
 *
 * Until cutover, the legacy pipeline (`../../src`) is the oracle: for every conformance fixture,
 * legacy and staged pipelines must produce field-identical full `TransformOutput`. Each `test.todo`
 * becomes a live comparison via `expectParity` as its fixture family lands.
 */
import { describe, expect, test } from 'vitest';
import type { TransformModulesOptions } from '@qwik.dev/optimizer';
import { transformModules as legacyTransformModules } from '../../src/index';
import { transformModules as stagedTransformModules } from '../compat/transform-modules';

const baseOptions = {
  srcDir: 'src',
  sourceMaps: false,
  transpileTs: true,
  transpileJsx: true,
};

async function expectParity(path: string, code: string, isServer = true) {
  const options: TransformModulesOptions = { ...baseOptions, isServer, input: [{ path, code }] };
  const legacy = await legacyTransformModules(options);
  const staged = await stagedTransformModules(options);
  expect(staged).toEqual(legacy);
}

describe('differential oracle: staged pipeline vs legacy transformModules', () => {
  test('foreign passthrough TypeScript module (ssr)', () =>
    expectParity('src/plain.ts', 'const value: number = 1;\nexport default value;\n'));

  test('foreign passthrough TypeScript module (csr)', () =>
    expectParity('src/plain.ts', 'const value: number = 1;\nexport default value;\n', false));

  test('static default-arrow component (ssr)', () =>
    expectParity('src/component.tsx', 'export default () => {\n  return <p>Hello Qwik</p>;\n};\n'));

  test('static default-arrow component (csr)', () =>
    expectParity(
      'src/component.tsx',
      'export default () => {\n  return <p>Hello Qwik</p>;\n};\n',
      false
    ));

  test('named const-export component (ssr)', () =>
    expectParity(
      'src/component.tsx',
      'export const App = () => {\n  return <p>Hello Qwik</p>;\n};\n'
    ));

  test('named const-export component (csr)', () =>
    expectParity(
      'src/component.tsx',
      'export const App = () => {\n  return <p>Hello Qwik</p>;\n};\n',
      false
    ));

  test('two components in one module (ssr)', () =>
    expectParity(
      'src/component.tsx',
      'export const Header = () => {\n  return <h1>Hi</h1>;\n};\nexport default () => {\n  return <p>Hello Qwik</p>;\n};\n'
    ));

  test('two components in one module (csr)', () =>
    expectParity(
      'src/component.tsx',
      'export const Header = () => {\n  return <h1>Hi</h1>;\n};\nexport default () => {\n  return <p>Hello Qwik</p>;\n};\n',
      false
    ));

  test('expression-body arrow component (ssr)', () =>
    expectParity('src/component.tsx', 'export default () => <p>Hello Qwik</p>;\n'));

  test('expression-body arrow component (csr)', () =>
    expectParity('src/component.tsx', 'export default () => <p>Hello Qwik</p>;\n', false));

  test('static attributes: strings, bare booleans, JSX aliases, aria (ssr)', () =>
    expectParity(
      'src/component.tsx',
      'export default () => {\n  return <main className="shell" htmlFor="x" hidden aria-hidden="false" title="A&B"></main>;\n};\n'
    ));

  test('nested tree with void tags and raw text (ssr)', () =>
    expectParity(
      'src/component.tsx',
      'export default () => {\n  return <section><h1 title="hi">A&B</h1><br/><p>x</p></section>;\n};\n'
    ));

  test('nested tree with void tags and raw text (csr)', () =>
    expectParity(
      'src/component.tsx',
      'export default () => {\n  return <section><h1 title="hi">A&B</h1><br/><p>x</p></section>;\n};\n',
      false
    ));

  test('multi-line JSX text normalization (ssr)', () =>
    expectParity(
      'src/component.tsx',
      'export default () => {\n  return (\n    <p>\n      one\n      two\n    </p>\n  );\n};\n'
    ));

  test('component with an unused props param (ssr)', () =>
    expectParity(
      'src/component.tsx',
      'export default (props) => {\n  return <p>Hello Qwik</p>;\n};\n'
    ));

  test('authored param name is reused as the props name (ssr)', () =>
    expectParity(
      'src/component.tsx',
      'export default (myProps) => {\n  return <p>Hello Qwik</p>;\n};\n'
    ));

  test('authored param name is reused as the props name (csr)', () =>
    expectParity(
      'src/component.tsx',
      'export default (myProps) => {\n  return <p>Hello Qwik</p>;\n};\n',
      false
    ));

  test('component with a const sibling statement (ssr)', () =>
    expectParity(
      'src/component.tsx',
      "const title = 'Hello';\nexport default () => {\n  return <p>Hello Qwik</p>;\n};\n"
    ));

  test('component with a const sibling statement (csr)', () =>
    expectParity(
      'src/component.tsx',
      "const title = 'Hello';\nexport default () => {\n  return <p>Hello Qwik</p>;\n};\n",
      false
    ));

  test('module binding named ctx forces an allocated name (ssr)', () =>
    expectParity(
      'src/component.tsx',
      'const ctx = 1;\nexport default () => {\n  return <p>Hello Qwik</p>;\n};\n'
    ));

  test('module binding named ctx forces an allocated name (csr)', () =>
    expectParity(
      'src/component.tsx',
      'const ctx = 1;\nexport default () => {\n  return <p>Hello Qwik</p>;\n};\n',
      false
    ));

  test('component with an import sibling (ssr)', () =>
    expectParity(
      'src/component.tsx',
      "import { something } from './helpers';\nexport default () => {\n  return <p>Hello Qwik</p>;\n};\n"
    ));

  test('dynamic text hole reading props (ssr)', () =>
    expectParity(
      'src/component.tsx',
      'export default (props) => {\n  return <p>{props.title}</p>;\n};\n'
    ));

  test('dynamic text hole in an expression-body arrow (ssr)', () =>
    expectParity('src/component.tsx', 'export default (props) => <p>{props.name}</p>;\n'));

  test('dynamic text hole reading props (csr)', () =>
    expectParity(
      'src/component.tsx',
      'export default (props) => {\n  return <p>{props.title}</p>;\n};\n',
      false
    ));

  test('useSignal with a signal-read hole (ssr)', () =>
    expectParity(
      'src/component.tsx',
      "import { useSignal } from '@qwik.dev/core';\nexport default () => {\n  const count = useSignal(0);\n  return <p>{count.value}</p>;\n};\n"
    ));

  test('useSignal with a signal-read hole (csr)', () =>
    expectParity(
      'src/component.tsx',
      "import { useSignal } from '@qwik.dev/core';\nexport default () => {\n  const count = useSignal(0);\n  return <p>{count.value}</p>;\n};\n",
      false
    ));

  test('element event handler without captures (ssr)', () =>
    expectParity(
      'src/component.tsx',
      'export default () => {\n  return <button onClick$={() => console.log(1)}>go</button>;\n};\n'
    ));

  test('element event handler without captures (csr)', () =>
    expectParity(
      'src/component.tsx',
      'export default () => {\n  return <button onClick$={() => console.log(1)}>go</button>;\n};\n',
      false
    ));

  test('event handler with a parameter (ssr)', () =>
    expectParity(
      'src/component.tsx',
      'export default () => {\n  return <button onDblClick$={(ev) => console.log(ev)}>go</button>;\n};\n'
    ));

  test('event handler alongside static attributes (ssr)', () =>
    expectParity(
      'src/component.tsx',
      'export default () => {\n  return <button class="cta" onClick$={() => console.log(1)} hidden>go</button>;\n};\n'
    ));

  test.todo('static markup and elements (declaration kinds, attributes, void tags, JSX text)');
  test.todo('JSX in a call argument lowers as an embedded function render');
  test.todo('JSX outside any candidate rejects with unsupported-runtime-jsx');
  test.todo('dynamic props, holes, events, bind, refs');
  test.todo('component calls, projections, slots');
  test.todo('branches (incl. build-constant conditions and residual isDev)');
  test.todo('collections (array/reactive/derived, inline and chunk rows)');
  test.todo('suspense, reveal, dynamic slots');
  test.todo('styles, context, custom hooks, tasks');
  test.todo('natives-as-JS, library mode');
  test.todo('incomplete link during per-module transform matches legacy conservative output');
  test.todo('complete link at generateBundle produces the artifact');
  test.todo('recognition parity — segment/marker/id/subscription counts per mode');
  test.todo('constants sweep across every payload carrier');
  test.todo('generateRustSsr shared should-generate corpus');
  test.todo('generateRustSsr should-reject corpus (unsupported-variant error arms)');
});

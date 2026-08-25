/** One row per conformance fixture; `name` is the snapshot filename (SSR + CSR in one file). */
export interface SnapshotFixture {
  name: string;
  path: string;
  code: string;
}

const COUNTER =
  "import { useSignal } from '@qwik.dev/core';\nexport default () => {\n  const count = useSignal(0);\n  return <button onClick$={() => count.value++}>{count.value}</button>;\n};\n";

const CAPTURING_EVENT =
  "import { useSignal } from '@qwik.dev/core';\nexport default () => {\n  const count = useSignal(0);\n  return <button onClick$={() => count.value++}>go</button>;\n};\n";

const USE_SIGNAL_HOLE =
  "import { useSignal } from '@qwik.dev/core';\nexport default () => {\n  const count = useSignal(0);\n  return <p>{count.value}</p>;\n};\n";

const SIGNAL_SIBLINGS =
  "import { useSignal } from '@qwik.dev/core';\nexport default () => {\n  const count = useSignal(0);\n  return <p>Count: {count.value}!</p>;\n};\n";

function fixture(name: string, path: string, code: string): SnapshotFixture {
  return { name, path, code };
}

export const SNAPSHOT_FIXTURES: SnapshotFixture[] = [
  fixture(
    'foreign-passthrough-ts',
    'src/plain.ts',
    'const value: number = 1;\nexport default value;\n'
  ),
  fixture(
    'static-default-arrow',
    'src/component.tsx',
    'export default () => {\n  return <p>Hello Qwik</p>;\n};\n'
  ),
  fixture(
    'named-const-export',
    'src/component.tsx',
    'export const App = () => {\n  return <p>Hello Qwik</p>;\n};\n'
  ),
  fixture(
    'two-components',
    'src/component.tsx',
    'export const Header = () => {\n  return <h1>Hi</h1>;\n};\nexport default () => {\n  return <p>Hello Qwik</p>;\n};\n'
  ),
  fixture(
    'expression-body-arrow',
    'src/component.tsx',
    'export default () => <p>Hello Qwik</p>;\n'
  ),
  fixture(
    'static-attributes',
    'src/component.tsx',
    'export default () => {\n  return <main className="shell" htmlFor="x" hidden aria-hidden="false" title="A&B"></main>;\n};\n'
  ),
  fixture(
    'nested-tree-void-raw-text',
    'src/component.tsx',
    'export default () => {\n  return <section><h1 title="hi">A&B</h1><br/><p>x</p></section>;\n};\n'
  ),
  fixture(
    'multi-line-jsx-text',
    'src/component.tsx',
    'export default () => {\n  return (\n    <p>\n      one\n      two\n    </p>\n  );\n};\n'
  ),
  fixture(
    'unused-props-param',
    'src/component.tsx',
    'export default (props) => {\n  return <p>Hello Qwik</p>;\n};\n'
  ),
  fixture(
    'authored-props-name',
    'src/component.tsx',
    'export default (myProps) => {\n  return <p>Hello Qwik</p>;\n};\n'
  ),
  fixture(
    'const-sibling-statement',
    'src/component.tsx',
    "const title = 'Hello';\nexport default () => {\n  return <p>Hello Qwik</p>;\n};\n"
  ),
  fixture(
    'ctx-module-binding',
    'src/component.tsx',
    'const ctx = 1;\nexport default () => {\n  return <p>Hello Qwik</p>;\n};\n'
  ),
  fixture(
    'import-sibling',
    'src/component.tsx',
    "import { something } from './helpers';\nexport default () => {\n  return <p>Hello Qwik</p>;\n};\n"
  ),
  fixture(
    'text-hole-props',
    'src/component.tsx',
    'export default (props) => {\n  return <p>{props.title}</p>;\n};\n'
  ),
  fixture(
    'text-hole-expression-body',
    'src/component.tsx',
    'export default (props) => <p>{props.name}</p>;\n'
  ),
  fixture('use-signal-hole', 'src/component.tsx', USE_SIGNAL_HOLE),
  fixture('capturing-event', 'src/component.tsx', CAPTURING_EVENT),
  fixture('counter', 'src/component.tsx', COUNTER),
  fixture(
    'event-no-captures',
    'src/component.tsx',
    'export default () => {\n  return <button onClick$={() => console.log(1)}>go</button>;\n};\n'
  ),
  fixture(
    'event-with-param',
    'src/component.tsx',
    'export default () => {\n  return <button onDblClick$={(ev) => console.log(ev)}>go</button>;\n};\n'
  ),
  fixture(
    'event-alongside-static-attrs',
    'src/component.tsx',
    'export default () => {\n  return <button class="cta" onClick$={() => console.log(1)} hidden>go</button>;\n};\n'
  ),
  fixture(
    'text-hole-siblings-props',
    'src/component.tsx',
    'export default (props) => {\n  return <p>a{props.title}b</p>;\n};\n'
  ),
  fixture('text-hole-siblings-signal', 'src/component.tsx', SIGNAL_SIBLINGS),
];

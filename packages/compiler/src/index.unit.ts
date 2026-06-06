import { describe, expect, test } from 'vitest';
import { transformModules } from './index';
import type {
  TransformModuleInput,
  TransformModulesOptions,
  TransformOutput,
} from '@qwik.dev/optimizer';

interface TestInput {
  code: string;
  path?: string;
}

const baseOptions = (input: TransformModuleInput, isServer: boolean): TransformModulesOptions => ({
  input: [input],
  srcDir: 'src',
  sourceMaps: false,
  transpileTs: true,
  transpileJsx: true,
  isServer,
});

async function testInput(snapshotName: string, input: TestInput) {
  const moduleInput = {
    path: input.path ?? 'src/component.tsx',
    code: input.code,
  };
  const ssr = await transformModules(baseOptions(moduleInput, true));
  const csr = await transformModules(baseOptions(moduleInput, false));
  await expect(snapshotResult(input.code, { ssr, csr })).toMatchFileSnapshot(
    `./snapshots/${snapshotName}.snap`
  );
  return { ssr, csr };
}

function snapshotResult(code: string, result: { ssr: TransformOutput; csr: TransformOutput }) {
  let output = `==INPUT==\n\n${code}`;

  output += snapshotTransformOutput('SSR', result.ssr);
  output += snapshotTransformOutput('CSR', result.csr);
  return output;
}

function snapshotTransformOutput(label: string, result: TransformOutput) {
  let output = `\n== ${label} OUTPUT ==\n`;

  for (const module of result.modules) {
    const isEntry = module.isEntry ? '(ENTRY POINT)' : '';
    output += `\n============================= ${module.path} ${isEntry}==\n\n${module.code}\n\n${module.map}`;
    if (module.segment) {
      output += `\n/*\n${JSON.stringify(module.segment, null, 2)}\n*/`;
    }
  }

  output += `\n== ${label} DIAGNOSTICS ==\n\n${JSON.stringify(result.diagnostics, null, 2)}`;
  return output;
}

describe('transformModules', () => {
  test('emits a static SSR renderer from an exported function component', async () => {
    await testInput('static_function', {
      code: `export function App() {
  return <main className="shell" hidden={true}><h1>Hello</h1><p>Qwik</p></main>;
}
`,
    });
  });

  test('emits a static CSR DOM renderer from an exported arrow component', async () => {
    await testInput('static_arrow_fragment', {
      code: `export const App = () => (
  <>
    <h1>Hello</h1>
    <p className="copy">Qwik</p>
  </>
);
`,
    });
  });

  test('discovers default function components', async () => {
    await testInput('default_function', {
      code: `export default function App() {
  return <section>Default function</section>;
}
`,
    });
  });

  test('discovers default arrow components', async () => {
    await testInput('default_arrow', {
      code: `export default () => <section>Default arrow</section>;`,
    });
  });

  test('unwraps component$ components', async () => {
    await testInput('component_dollar', {
      code: `import { component$ } from '@qwik.dev/core';
export const App = component$(() => <div>Hello</div>);
export default component$(function Home() {
  return <section>Default wrapped</section>;
});
`,
    });
  });

  test('extracts event handlers into QRL-style modules', async () => {
    await testInput('event_handler_qrl', {
      code: `export function App() {
  return <button onClick$={(ev) => console.log(ev.type)}>Click</button>;
}
`,
    });
  });

  test('uses _captures for extracted event lexical scope', async () => {
    await testInput('event_handler_captures', {
      code: `import { createSignal } from "@qwik.dev/core";
export function App() {
  const count = createSignal(1);
  return <button onClick$={() => count.value++}>Count</button>;
}
`,
    });
  });

  test('extracts multiple event names and scopes', async () => {
    await testInput('event_handler_scopes', {
      code: `export function App() {
  return <div onClick$={() => 1} onDblClick$={() => 2} window:onScroll$={() => 3} document:onKeyDown$={() => 4} />;
}
`,
    });
  });

  test('reports dynamic JSX expressions as unsupported', async () => {
    await testInput('unsupported_dynamic_jsx', {
      code: `const name = 'Qwik';
export function App() {
  return <p>Hello {name}</p>;
}
`,
    });
  });
});

import { describe, expect, test } from 'vitest';
import type { TransformModuleInput, TransformModulesOptions } from '@qwik.dev/optimizer';
import { parseModule } from '../stages/parse';
import type { CompilerContext } from '../types';
import { discoverRewriteComponents } from './discover';

const baseOptions = (input: TransformModuleInput): TransformModulesOptions => ({
  input: [input],
  srcDir: 'src',
  sourceMaps: false,
  transpileTs: true,
  transpileJsx: true,
});

function discoverInput(code: string) {
  const input = { path: 'src/component.tsx', code };
  const ctx: CompilerContext = {
    input,
    options: baseOptions(input),
    emitTarget: 'ssr',
    program: null,
    manifest: {
      components: [],
      segments: [],
      imports: [],
      diagnostics: [],
    },
    outputModules: null,
  };
  parseModule(ctx);
  expect(ctx.manifest.diagnostics).toEqual([]);
  expect(ctx.program).not.toBeNull();
  return discoverRewriteComponents(ctx.program!);
}

describe('discoverRewriteComponents', () => {
  test('discovers multiple exported function components', () => {
    const components = discoverInput(`export function Header() {
  return <header>Header</header>;
}

export function App() {
  return <main>Qwik</main>;
}
`);

    expect(components.map((component) => component.exportName)).toEqual(['Header', 'App']);
  });

  test('unwraps component$ named exports from core imports', () => {
    const components = discoverInput(`import { component$ as component } from '@qwik.dev/core';

export const App = component(() => <main>Qwik</main>);
`);

    expect(components.map((component) => component.exportName)).toEqual(['App']);
    expect(components.map((component) => component.declarationKind)).toEqual(['const']);
  });

  test('unwraps component$ default exports from core imports', () => {
    const components = discoverInput(`import { component$ } from '@qwik.dev/core';

export default component$(function Home() {
  return <main>Qwik</main>;
});
`);

    expect(components.map((component) => component.exportName)).toEqual(['default']);
    expect(components.map((component) => component.localName)).toEqual(['Home']);
    expect(components.map((component) => component.declarationKind)).toEqual(['defaultFunction']);
  });

  test('unwraps component$ default arrow exports from core imports', () => {
    const components = discoverInput(`import { component$ } from '@qwik.dev/core';

export default component$(() => <main>Qwik</main>);
`);

    expect(components.map((component) => component.exportName)).toEqual(['default']);
    expect(components.map((component) => component.localName)).toEqual([null]);
    expect(components.map((component) => component.declarationKind)).toEqual(['defaultArrow']);
  });
});

import { describe, expect, test } from 'vitest';
import type { TransformModuleInput, TransformModulesOptions } from '@qwik.dev/optimizer';
import { parseModule } from './parse';
import type { CompilerContext } from './types';
import { discoverComponents } from './discover';

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
    diagnostics: [],
  };
  parseModule(ctx);
  expect(ctx.diagnostics).toEqual([]);
  expect(ctx.program).not.toBeNull();
  return discoverComponents(ctx.program!);
}

describe('discoverComponents', () => {
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

  test('analyzes object props parameters', () => {
    const code = `export function App({ label: text }) {
  return <main>{text}</main>;
}

export const Rest = ({ count, ...rest } = defaults) => {
  return <main>{count}</main>;
};
`;
    const [app, rest] = discoverInput(code);

    expect(app.params[0]).toMatchObject({
      name: null,
      defaultRange: null,
      propAliases: [{ localName: 'text', propName: 'label' }],
      canProjectProps: true,
    });
    expect(code.slice(...app.params[0].bindingRange!)).toBe('{ label: text }');
    expect(rest.params[0]).toMatchObject({
      name: null,
      propAliases: [{ localName: 'count', propName: 'count' }],
      canProjectProps: false,
    });
    expect(code.slice(...rest.params[0].bindingRange!)).toBe('{ count, ...rest }');
    expect(code.slice(...rest.params[0].defaultRange!)).toBe('defaults');
  });

  test('unwraps component$ named exports from core imports', () => {
    const code = `import { component$ as component } from '@qwik.dev/core';

export const App = component(() => <main>Qwik</main>);
`;
    const components = discoverInput(code);

    expect(components.map((component) => component.exportName)).toEqual(['App']);
    expect(components.map((component) => component.declarationKind)).toEqual(['const']);
    expect(code.slice(...components[0].replacementRange)).toBe(
      'component(() => <main>Qwik</main>)'
    );
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

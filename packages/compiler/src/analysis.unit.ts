import { parseSync } from 'oxc-parser';
import { describe, expect, test } from 'vitest';
import { analyzeModule } from './analysis';

function analyze(code: string) {
  const parsed = parseSync('src/component.tsx', code, {
    lang: 'tsx',
    sourceType: 'module',
    astType: 'ts',
    range: true,
  });
  expect(parsed.errors).toEqual([]);
  return analyzeModule(parsed.program);
}

describe('analyzeModule', () => {
  test('classifies candidates by binding meaning instead of names', () => {
    const analysis = analyze(`import { component$ as component } from '@qwik.dev/core';

export function FormatName() {
  return 'not a component';
}

export function widget() {
  return <main>lowercase export</main>;
}

const _child = () => <span>child</span>;
export const Root = component(() => <_child />);
`);

    const candidates = analysis.items.flatMap((item) =>
      item.kind === 'component-candidate' ? item.candidates : []
    );
    expect(candidates.map((candidate) => [candidate.localName, candidate.qualification])).toEqual([
      ['widget', 'exported-jsx'],
      ['_child', 'jsx-tag'],
      ['Root', 'component$'],
    ]);
    expect(analysis.items.find((item) => item.range[0] <= 65 && item.range[1] >= 65)?.kind).toBe(
      'preserve'
    );
  });

  test('preserves binding IDs across hoisting, shadowing, loops, and shorthand reads', () => {
    const analysis = analyze(`const moduleValue = 1;
function App({ value: prop }) {
  consume(hoisted);
  if (prop) {
    var hoisted = prop;
    const moduleValue = prop;
    consume({ moduleValue });
  }
  return [1].map((row) => row + moduleValue);
}
`);

    const moduleValues = analysis.bindings.filter((binding) => binding.name === 'moduleValue');
    expect(moduleValues).toHaveLength(2);
    expect(new Set(moduleValues.map((binding) => binding.id)).size).toBe(2);
    expect(analysis.bindings.find((binding) => binding.name === 'prop')?.kind).toBe('param');
    expect(analysis.bindings.find((binding) => binding.name === 'row')?.kind).toBe('loop');

    const hoisted = analysis.bindings.find((binding) => binding.name === 'hoisted');
    const hoistedReferences = analysis.references.filter(
      (reference) => reference.bindingId === hoisted?.id
    );
    expect(hoistedReferences).toHaveLength(1);

    const shorthand = analysis.references.find((reference) => reference.role === 'shorthand');
    expect(shorthand?.bindingId).toBe(moduleValues[1].id);
  });

  test('keeps class-local bindings out of the enclosing scope', () => {
    const code = `function scope() {
  class Helper {
    static {
      const hidden = 1;
      consume(hidden);
    }
  }
  const Value = class Hidden {};
  consume(hidden, Hidden, Helper, Value);
}
`;
    const analysis = analyze(code);
    const references = analysis.references.map((reference) => ({
      name: code.slice(reference.range[0], reference.range[1]),
      bindingId: reference.bindingId,
    }));

    expect(references.filter((reference) => reference.name === 'hidden')).toEqual([
      { name: 'hidden', bindingId: expect.any(Number) },
      { name: 'hidden', bindingId: null },
    ]);
    expect(references.find((reference) => reference.name === 'Hidden')?.bindingId).toBeNull();
    expect(references.find((reference) => reference.name === 'Helper')?.bindingId).not.toBeNull();
    expect(references.find((reference) => reference.name === 'Value')?.bindingId).not.toBeNull();
  });

  test('does not treat a third-party component$ spelling as a Qwik component binding', () => {
    const analysis = analyze(`import { component$ } from 'third-party';
export const Value = component$(() => <main>value</main>);
`);

    expect(analysis.items.some((item) => item.kind === 'component-candidate')).toBe(false);
  });

  test('keeps the complete component wrapper replacement range', () => {
    const code = `import { component$ } from '@qwik.dev/core';
export const App = component$(() => <main />);
`;
    const analysis = analyze(code);
    const candidate = analysis.items.flatMap((item) =>
      item.kind === 'component-candidate' ? item.candidates : []
    )[0];

    expect(code.slice(candidate.functionRange[0], candidate.functionRange[1])).toBe(
      '() => <main />'
    );
    expect(code.slice(candidate.replacementRange[0], candidate.replacementRange[1])).toBe(
      'component$(() => <main />)'
    );
  });

  test('records local exports and exact import specifier ranges by binding ID', () => {
    const code = `import { marker$ as marker, marker as direct } from 'library';
const local$ = (value) => value;
export { local$ as publicMarker };
export const companion = (value) => value;
`;
    const analysis = analyze(code);
    const marker = analysis.bindings.find((binding) => binding.name === 'marker')!;
    const direct = analysis.bindings.find((binding) => binding.name === 'direct')!;
    const local = analysis.bindings.find((binding) => binding.name === 'local$')!;
    const companion = analysis.bindings.find((binding) => binding.name === 'companion')!;

    expect(code.slice(...marker.import!.specifierRange!)).toBe('marker$ as marker');
    expect(direct.import).toMatchObject({ source: 'library', importedName: 'marker' });
    expect(analysis.exports).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ bindingId: local.id, exportedName: 'publicMarker' }),
        expect.objectContaining({ bindingId: companion.id, exportedName: 'companion' }),
      ])
    );
  });
});

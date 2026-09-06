import { describe, expect, test } from 'vitest';
import { BindingScope } from '../schema';
import { createBindingGraph } from '../analyse/ast/bindings';
import { parseModule } from '../analyse/ast/parse';
import { isNode, type WalkableNode } from '../analyse/ast/ast-types';
import type { Node } from 'oxc-parser';
import { deepFreeze } from './fixtures';

function identifiers(root: Node, name: string): Node[] {
  const found: Node[] = [];
  const visit = (value: unknown): void => {
    if (Array.isArray(value)) {
      value.forEach(visit);
      return;
    }
    if (!isNode(value)) {
      return;
    }
    if (value.type === 'Identifier' && value.name === name) {
      found.push(value);
    }
    for (const key of Object.keys(value)) {
      if (key !== 'parent') {
        visit((value as WalkableNode)[key]);
      }
    }
  };
  visit(root);
  return found;
}

describe('createBindingGraph', () => {
  test('indexes declaration owners and destructured bindings', () => {
    const { program } = parseModule(
      'bindings.ts',
      `
import { source } from './source';
const { id: key, ...rest } = source;
var repeated = key;
var repeated = rest;
`
    );
    deepFreeze(program);
    const graph = createBindingGraph(program);
    const declaration = program.body[1];
    if (declaration.type !== 'VariableDeclaration') {
      throw new Error('expected a variable declaration');
    }
    const declarator = declaration.declarations[0];
    const bindings = graph.bindingsOf(declarator.id);
    expect(bindings.map((binding) => graph.bindings[binding].name)).toEqual(['key', 'rest']);
    expect(graph.bindingsOf(declarator.id)).toBe(bindings);
    for (const binding of bindings) {
      expect(graph.declarationsOf(binding)).toEqual([declarator]);
    }
    const repeated = graph.declaration(identifiers(program, 'repeated')[0])!;
    expect(graph.declarationsOf(repeated)).toHaveLength(2);
    const imported = graph.declaration(
      identifiers(program, 'source').find((node) => graph.declaration(node) !== null)!
    )!;
    const importDeclaration = program.body[0];
    if (importDeclaration.type !== 'ImportDeclaration') {
      throw new Error('expected an import');
    }
    expect(graph.declarationsOf(imported)).toEqual([importDeclaration.specifiers[0]]);
    expect(graph.declarationsOf(graph.addSynthetic('generated', BindingScope.Local))).toEqual([]);
  });

  test('queries free references without confusing shadowed bindings or property names', () => {
    const { program } = parseModule(
      'bindings.tsx',
      `
const source = {};
const outer = 1;
const render = ({ value = outer }) => <Child>{value + source.value + outer}</Child>;
const Child = () => null;
`
    );
    const graph = createBindingGraph(program);
    const declaration = program.body[2];
    if (declaration.type !== 'VariableDeclaration') {
      throw new Error('expected a variable declaration');
    }
    const render = declaration.declarations[0];
    expect(graph.freeReferences(render).map(({ binding }) => graph.bindings[binding].name)).toEqual(
      ['outer', 'Child', 'source', 'outer', 'Child']
    );
    expect(graph.freeReferences(program)).toEqual([]);
    expect(
      graph
        .freeReferences([program.body[1], render])
        .map(({ binding }) => graph.bindings[binding].name)
    ).toEqual(['Child', 'source', 'Child']);
  });

  test('selects transitive declarations in source order within the supplied boundary', () => {
    const { program } = parseModule(
      'bindings.ts',
      `
const source = {};
const prefix = source.type;
const unused = source.unused;
const { id = prefix } = source;
const key = id + ((unused) => unused)('!');
key;
`
    );
    const graph = createBindingGraph(program);
    const declarations = program.body.flatMap((statement) =>
      statement.type === 'VariableDeclaration' ? statement.declarations : []
    );
    const expression = program.body[5];
    expect(graph.dependenciesOf(expression, declarations.slice(1))).toEqual([
      declarations[1],
      declarations[3],
      declarations[4],
    ]);
    expect(graph.dependenciesOf(expression, declarations)).toEqual([
      declarations[0],
      declarations[1],
      declarations[3],
      declarations[4],
    ]);
  });

  test('terminates dependency cycles without changing declaration order', () => {
    const { program } = parseModule('bindings.ts', 'const a = () => b; const b = () => a; a;');
    const graph = createBindingGraph(program);
    const declarations = program.body.flatMap((statement) =>
      statement.type === 'VariableDeclaration' ? statement.declarations : []
    );
    expect(graph.dependenciesOf(program.body[2], declarations)).toEqual(declarations);
  });

  test('resolves shadowed references to distinct bindings', () => {
    const source = `
const value = 1;
const outer = () => value;
const inner = (value) => value;
`;
    const parsed = parseModule('bindings.ts', source);
    const graph = createBindingGraph(parsed.program);
    const values = identifiers(parsed.program, 'value');
    const moduleBinding = graph.declaration(values[0]);
    const outerReference = graph.reference(values[1]);
    const parameterBinding = graph.declaration(values[2]);
    const innerReference = graph.reference(values[3]);

    expect(moduleBinding).not.toBeNull();
    expect(parameterBinding).not.toBeNull();
    expect(moduleBinding).not.toBe(parameterBinding);
    expect(outerReference).toBe(moduleBinding);
    expect(innerReference).toBe(parameterBinding);
    expect(graph.bindings[moduleBinding!].scope).toBe(BindingScope.Module);
    expect(graph.bindings[parameterBinding!].scope).toBe(BindingScope.Param);
  });

  test('resolves destructured aliases and ignores property names', () => {
    const source = `
const source = { value: 1 };
const read = ({ value: alias }) => alias + source.value;
`;
    const parsed = parseModule('bindings.ts', source);
    const graph = createBindingGraph(parsed.program);
    const aliases = identifiers(parsed.program, 'alias');
    const sources = identifiers(parsed.program, 'source');
    const propertyNames = identifiers(parsed.program, 'value');

    expect(graph.reference(aliases[1])).toBe(graph.declaration(aliases[0]));
    expect(graph.reference(sources[1])).toBe(graph.declaration(sources[0]));
    expect(propertyNames.every((node) => graph.reference(node) === null)).toBe(true);
  });

  test('a parameter shadows a named function expression', () => {
    const source = `const fn = function value(value) { return value; };`;
    const parsed = parseModule('bindings.ts', source);
    const graph = createBindingGraph(parsed.program);
    const values = identifiers(parsed.program, 'value');

    expect(graph.declaration(values[0])).not.toBe(graph.declaration(values[1]));
    expect(graph.reference(values[2])).toBe(graph.declaration(values[1]));
  });
});

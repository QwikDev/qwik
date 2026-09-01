import { describe, expect, test } from 'vitest';
import { BindingScope } from '../schema';
import { createBindingGraph } from '../analyse/ast/bindings';
import { parseModule } from '../analyse/ast/parse';
import { isNode, type WalkableNode } from '../analyse/ast/ast-types';
import type { Node } from 'oxc-parser';

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

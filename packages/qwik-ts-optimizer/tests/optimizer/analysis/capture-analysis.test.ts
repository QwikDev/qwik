
import { describe, it, expect } from 'vitest';
import { parseSync } from 'oxc-parser';
import { walk } from 'oxc-walker';
import type { AstNode, AstProgram, AstFunction, AstMaybeNode } from '../../../src/ast-types.js';
import {
  analyzeCaptures,
  collectScopeIdentifiers,
  type CaptureAnalysisResult,
} from '../../../src/optimizer/analysis/capture-analysis.js';
import { computeClosureFreeIdentifiers } from '../../../src/optimizer/analysis/closure-free-identifiers.js';

interface DollarArgFacts {
  argNode: AstFunction;
  parentScopeIds: Set<string>;
  importedNames: Set<string>;
  freeIds: readonly string[];
}

function asClosureArg(node: AstNode): AstFunction | null {
  if (node.type !== 'CallExpression') return null;
  const { callee } = node;
  if (callee.type !== 'Identifier' || !callee.name.endsWith('$')) return null;
  const arg = node.arguments[0];
  if (arg?.type === 'ArrowFunctionExpression' || arg?.type === 'FunctionExpression') {
    return arg;
  }
  return null;
}

function collectDollarArgs(program: AstProgram): AstFunction[] {
  const args: AstFunction[] = [];
  walk(program, {
    enter(node: AstNode) {
      const arg = asClosureArg(node);
      if (arg) args.push(arg);
    },
  });
  return args;
}

function collectImportedNames(program: AstProgram): Set<string> {
  const names = new Set<string>();
  for (const node of program.body) {
    if (node.type === 'ImportDeclaration') {
      for (const spec of node.specifiers) {
        names.add(spec.local.name);
      }
    }
  }
  return names;
}

function collectParentScopeIds(program: AstProgram, argNode: AstFunction): Set<string> {
  const ids = new Set<string>();
  walk(program, {
    enter(node: AstNode) {
      if (node === argNode) {
        this.skip();
        return;
      }
      if (node.type === 'VariableDeclarator' && node.id.type === 'Identifier') {
        ids.add(node.id.name);
      }
      if (
        node.type === 'ArrowFunctionExpression' ||
        node.type === 'FunctionExpression' ||
        node.type === 'FunctionDeclaration'
      ) {
        for (const param of node.params) {
          collectBindingNames(param, ids);
        }
      }
    },
  });
  return ids;
}

function buildDollarArgFacts(program: AstProgram, argNode: AstFunction): DollarArgFacts {
  const freeIds =
    computeClosureFreeIdentifiers(program, new Map([['t', argNode]])).get(argNode) ?? [];
  return {
    argNode,
    parentScopeIds: collectParentScopeIds(program, argNode),
    importedNames: collectImportedNames(program),
    freeIds,
  };
}

function findDollarArg(source: string): DollarArgFacts {
  const { program } = parseSync('test.tsx', source);
  const argNode = collectDollarArgs(program)[0];
  if (!argNode) {
    throw new Error('No $() call argument found in source');
  }
  return buildDollarArgFacts(program, argNode);
}

function findNthDollarArg(source: string, n: number): DollarArgFacts {
  const { program } = parseSync('test.tsx', source);
  const argNodes = collectDollarArgs(program);
  if (argNodes.length <= n) {
    throw new Error(`Only found ${argNodes.length} $() calls, wanted index ${n}`);
  }
  return buildDollarArgFacts(program, argNodes[n]);
}

function collectBindingNames(node: AstMaybeNode, names: Set<string>): void {
  if (!node) return;
  if (node.type === 'Identifier') {
    names.add(node.name);
    return;
  }
  if (node.type === 'ObjectPattern') {
    for (const prop of node.properties) {
      if (prop.type === 'RestElement') {
        collectBindingNames(prop.argument, names);
      } else {
        collectBindingNames(prop.value, names);
      }
    }
    return;
  }
  if (node.type === 'ArrayPattern') {
    for (const elem of node.elements) {
      collectBindingNames(elem, names);
    }
    return;
  }
  if (node.type === 'RestElement') {
    collectBindingNames(node.argument, names);
    return;
  }
  if (node.type === 'AssignmentPattern') {
    collectBindingNames(node.left, names);
    return;
  }
}

describe('analyzeCaptures', () => {
  it('Test 1: simple capture - detects variable from enclosing scope', () => {
    const source = `
      import { component$, useStore, $ } from '@qwik.dev/core';
      export const App = component$(() => {
        const s = useStore({});
        return $(() => { s.count++ });
      });
    `;

    const { argNode, parentScopeIds, importedNames, freeIds } = findNthDollarArg(source, 1);
    const result = analyzeCaptures(argNode, parentScopeIds, freeIds);

    expect(result.captures).toBe(true);
    expect(result.captureNames).toEqual(['s']);
  });

  it('Test 2: multiple captures sorted alphabetically', () => {
    const source = `
      import { $ } from '@qwik.dev/core';
      function test() {
        const zebra = 1;
        const alpha = 2;
        const mid = 3;
        $(() => { zebra; alpha; mid; });
      }
    `;

    const { argNode, parentScopeIds, importedNames, freeIds } = findDollarArg(source);
    const result = analyzeCaptures(argNode, parentScopeIds, freeIds);

    expect(result.captures).toBe(true);
    expect(result.captureNames).toEqual(['alpha', 'mid', 'zebra']);
  });

  it('Test 3: globals excluded - console is not captured', () => {
    const source = `
      import { $ } from '@qwik.dev/core';
      function test() {
        const x = 1;
        $(() => { console.log(x); });
      }
    `;

    const { argNode, parentScopeIds, importedNames, freeIds } = findDollarArg(source);
    const result = analyzeCaptures(argNode, parentScopeIds, freeIds);

    expect(result.captures).toBe(true);
    expect(result.captureNames).toEqual(['x']);
    expect(result.captureNames).not.toContain('console');
  });

  it('Test 4: import bindings excluded - only local vars captured', () => {
    const source = `
      import { $, useStore } from '@qwik.dev/core';
      function test() {
        const state = useStore({});
        $(() => { useStore; state; });
      }
    `;

    const { argNode, parentScopeIds, importedNames, freeIds } = findDollarArg(source);
    const result = analyzeCaptures(argNode, parentScopeIds, freeIds);

    expect(result.captures).toBe(true);
    expect(result.captureNames).toEqual(['state']);
    expect(result.captureNames).not.toContain('useStore');
  });

  it('Test 5: var hoisting - var-declared variable IS captured', () => {
    const source = `
      import { $ } from '@qwik.dev/core';
      function test() {
        var x = 1;
        $(() => { x++; });
      }
    `;

    const { argNode, parentScopeIds, importedNames, freeIds } = findDollarArg(source);
    const result = analyzeCaptures(argNode, parentScopeIds, freeIds);

    expect(result.captures).toBe(true);
    expect(result.captureNames).toEqual(['x']);
  });

  it('Test 6: destructured parameters produce individual captures', () => {
    const source = `
      import { $ } from '@qwik.dev/core';
      const fn = ({count, name}) => {
        $(() => { count; name; });
      };
    `;

    const { argNode, parentScopeIds, importedNames, freeIds } = findDollarArg(source);
    const result = analyzeCaptures(argNode, parentScopeIds, freeIds);

    expect(result.captures).toBe(true);
    expect(result.captureNames).toEqual(['count', 'name']);
  });

  it('Test 7: paramNames extraction - arrow with single param', () => {
    const source = `
      import { $ } from '@qwik.dev/core';
      $((props) => { props.value; });
    `;

    const { argNode, parentScopeIds, importedNames, freeIds } = findDollarArg(source);
    const result = analyzeCaptures(argNode, parentScopeIds, freeIds);

    expect(result.paramNames).toEqual(['props']);
  });

  it('Test 8: no captures for module-level refs - returns empty', () => {
    const source = `
      import { $ } from '@qwik.dev/core';
      const moduleVar = 42;
      $(() => { moduleVar; });
    `;

    const { argNode, freeIds } = findDollarArg(source);
    const emptyParentScope = new Set<string>();
    const result = analyzeCaptures(argNode, emptyParentScope, freeIds);

    expect(result.captures).toBe(false);
    expect(result.captureNames).toEqual([]);
  });

  it('Test 9: function own parameters are NOT captured', () => {
    const source = `
      import { $ } from '@qwik.dev/core';
      $((event) => { event.target; });
    `;

    const { argNode, parentScopeIds, importedNames, freeIds } = findDollarArg(source);
    const result = analyzeCaptures(argNode, parentScopeIds, freeIds);

    expect(result.captureNames).not.toContain('event');
    expect(result.captures).toBe(false);
  });

  it('Test 10: inner-scope binding shadowing a top-level import IS captured', () => {
    const source = `
      import { qrl } from '@qwik.dev/core/what';
      function host() {
        const qrl = 23;
        $(() => { qrl; });
      }
    `;

    const { argNode, parentScopeIds, importedNames, freeIds } = findNthDollarArg(source, 0);
    expect(importedNames.has('qrl')).toBe(true);
    expect(parentScopeIds.has('qrl')).toBe(true);

    const result = analyzeCaptures(argNode, parentScopeIds, freeIds);

    expect(result.captures).toBe(true);
    expect(result.captureNames).toEqual(['qrl']);
  });
});


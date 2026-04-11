/**
 * Tests for variable migration analysis module.
 *
 * Tests the decision tree: move (single-use, safe), reexport (shared/exported/side-effects),
 * or keep (not used by segments).
 */

import { describe, it, expect } from 'vitest';
import { parseSync } from 'oxc-parser';
import {
  analyzeMigration,
  collectModuleLevelDecls,
  computeSegmentUsage,
  type MigrationDecision,
  type ModuleLevelDecl,
} from '../../src/optimizer/variable-migration.js';

// ---------------------------------------------------------------------------
// Helper to make ModuleLevelDecl objects for unit testing analyzeMigration()
// ---------------------------------------------------------------------------

function makeDecl(overrides: Partial<ModuleLevelDecl> & { name: string }): ModuleLevelDecl {
  return {
    declStart: 0,
    declEnd: 0,
    declText: '',
    isExported: false,
    hasSideEffects: false,
    isPartOfSharedDestructuring: false,
    kind: 'const',
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// analyzeMigration() unit tests
// ---------------------------------------------------------------------------

describe('analyzeMigration', () => {
  it('Test 1: single-use safe variable => move', () => {
    const decls = [makeDecl({ name: 'helperFn' })];
    const segmentUsage = new Map([['seg1', new Set(['helperFn'])]]);
    const rootUsage = new Set<string>();

    const decisions = analyzeMigration(decls, segmentUsage, rootUsage);

    expect(decisions).toHaveLength(1);
    expect(decisions[0].action).toBe('move');
    expect(decisions[0].varName).toBe('helperFn');
    expect(decisions[0].targetSegment).toBe('seg1');
  });

  it('Test 2: shared variable used by two segments => reexport', () => {
    const decls = [makeDecl({ name: 'SHARED' })];
    const segmentUsage = new Map([
      ['seg1', new Set(['SHARED'])],
      ['seg2', new Set(['SHARED'])],
    ]);
    const rootUsage = new Set<string>();

    const decisions = analyzeMigration(decls, segmentUsage, rootUsage);

    expect(decisions).toHaveLength(1);
    expect(decisions[0].action).toBe('reexport');
    expect(decisions[0].varName).toBe('SHARED');
    expect(decisions[0].targetSegment).toBeUndefined();
  });

  it('Test 3: exported variable used by segment => reexport (MIG-03)', () => {
    const decls = [makeDecl({ name: 'publicHelper', isExported: true })];
    const segmentUsage = new Map([['seg1', new Set(['publicHelper'])]]);
    const rootUsage = new Set<string>();

    const decisions = analyzeMigration(decls, segmentUsage, rootUsage);

    expect(decisions).toHaveLength(1);
    expect(decisions[0].action).toBe('reexport');
    expect(decisions[0].varName).toBe('publicHelper');
  });

  it('Test 4: side-effect declaration used by one segment => reexport (MIG-04)', () => {
    const decls = [makeDecl({ name: 'state', hasSideEffects: true })];
    const segmentUsage = new Map([['seg1', new Set(['state'])]]);
    const rootUsage = new Set<string>();

    const decisions = analyzeMigration(decls, segmentUsage, rootUsage);

    expect(decisions).toHaveLength(1);
    expect(decisions[0].action).toBe('reexport');
    expect(decisions[0].varName).toBe('state');
  });

  it('Test 5: safe literals are eligible for move if single-use', () => {
    const decls = [
      makeDecl({ name: 'COUNT' }),
      makeDecl({ name: 'NAME' }),
      makeDecl({ name: 'FN' }),
    ];
    const segmentUsage = new Map([
      ['seg1', new Set(['COUNT'])],
      ['seg2', new Set(['NAME'])],
      ['seg3', new Set(['FN'])],
    ]);
    const rootUsage = new Set<string>();

    const decisions = analyzeMigration(decls, segmentUsage, rootUsage);

    expect(decisions).toHaveLength(3);
    for (const d of decisions) {
      expect(d.action).toBe('move');
    }
    expect(decisions[0].targetSegment).toBe('seg1');
    expect(decisions[1].targetSegment).toBe('seg2');
    expect(decisions[2].targetSegment).toBe('seg3');
  });

  it('Test 6: destructuring with shared bindings => reexport (MIG-05)', () => {
    const decls = [makeDecl({ name: 'a', isPartOfSharedDestructuring: true })];
    const segmentUsage = new Map([['seg1', new Set(['a'])]]);
    const rootUsage = new Set<string>();

    const decisions = analyzeMigration(decls, segmentUsage, rootUsage);

    expect(decisions).toHaveLength(1);
    expect(decisions[0].action).toBe('reexport');
    expect(decisions[0].varName).toBe('a');
  });

  it('Test 7: variable not used by any segment => keep', () => {
    const decls = [makeDecl({ name: 'unused' })];
    const segmentUsage = new Map<string, Set<string>>();
    const rootUsage = new Set<string>();

    const decisions = analyzeMigration(decls, segmentUsage, rootUsage);

    expect(decisions).toHaveLength(1);
    expect(decisions[0].action).toBe('keep');
    expect(decisions[0].varName).toBe('unused');
  });

  it('Test 8: variable used by root AND a segment => reexport', () => {
    const decls = [makeDecl({ name: 'config' })];
    const segmentUsage = new Map([['seg1', new Set(['config'])]]);
    const rootUsage = new Set(['config']);

    const decisions = analyzeMigration(decls, segmentUsage, rootUsage);

    expect(decisions).toHaveLength(1);
    expect(decisions[0].action).toBe('reexport');
    expect(decisions[0].varName).toBe('config');
  });

  it('Test 9: arrow function expression => safe, eligible for move', () => {
    const decls = [makeDecl({ name: 'arrowFn', hasSideEffects: false })];
    const segmentUsage = new Map([['seg1', new Set(['arrowFn'])]]);
    const rootUsage = new Set<string>();

    const decisions = analyzeMigration(decls, segmentUsage, rootUsage);

    expect(decisions).toHaveLength(1);
    expect(decisions[0].action).toBe('move');
  });

  it('Test 10: function call as initializer => has side effects, not eligible for move', () => {
    const decls = [makeDecl({ name: 'cfg', hasSideEffects: true })];
    const segmentUsage = new Map([['seg1', new Set(['cfg'])]]);
    const rootUsage = new Set<string>();

    const decisions = analyzeMigration(decls, segmentUsage, rootUsage);

    expect(decisions).toHaveLength(1);
    expect(decisions[0].action).toBe('reexport');
  });

  it('exported variable NOT used by any segment => keep', () => {
    const decls = [makeDecl({ name: 'publicApi', isExported: true })];
    const segmentUsage = new Map<string, Set<string>>();
    const rootUsage = new Set<string>();

    const decisions = analyzeMigration(decls, segmentUsage, rootUsage);

    expect(decisions).toHaveLength(1);
    expect(decisions[0].action).toBe('keep');
  });
});

// ---------------------------------------------------------------------------
// collectModuleLevelDecls() tests
// ---------------------------------------------------------------------------

describe('collectModuleLevelDecls', () => {
  function parse(code: string) {
    return parseSync('test.tsx', code).program;
  }

  it('collects const declarations with literal initializers as safe', () => {
    const program = parse('const COUNT = 42;\nconst NAME = "hello";');
    const decls = collectModuleLevelDecls(program, 'const COUNT = 42;\nconst NAME = "hello";');

    expect(decls).toHaveLength(2);
    expect(decls[0].name).toBe('COUNT');
    expect(decls[0].hasSideEffects).toBe(false);
    expect(decls[0].kind).toBe('const');
    expect(decls[1].name).toBe('NAME');
    expect(decls[1].hasSideEffects).toBe(false);
  });

  it('detects arrow function as safe (no side effects)', () => {
    const code = 'const fn = (x) => x + 1;';
    const program = parse(code);
    const decls = collectModuleLevelDecls(program, code);

    expect(decls).toHaveLength(1);
    expect(decls[0].name).toBe('fn');
    expect(decls[0].hasSideEffects).toBe(false);
  });

  it('detects function call as having side effects', () => {
    const code = 'const state = createConfig();';
    const program = parse(code);
    const decls = collectModuleLevelDecls(program, code);

    expect(decls).toHaveLength(1);
    expect(decls[0].name).toBe('state');
    expect(decls[0].hasSideEffects).toBe(true);
  });

  it('detects exported declarations', () => {
    const code = 'export const helper = () => {};';
    const program = parse(code);
    const decls = collectModuleLevelDecls(program, code);

    expect(decls).toHaveLength(1);
    expect(decls[0].name).toBe('helper');
    expect(decls[0].isExported).toBe(true);
  });

  it('detects destructuring with multiple bindings', () => {
    const code = 'const { a, b } = obj;';
    const program = parse(code);
    const decls = collectModuleLevelDecls(program, code);

    // Both `a` and `b` should be marked as part of shared destructuring
    expect(decls).toHaveLength(2);
    expect(decls[0].name).toBe('a');
    expect(decls[0].isPartOfSharedDestructuring).toBe(true);
    expect(decls[1].name).toBe('b');
    expect(decls[1].isPartOfSharedDestructuring).toBe(true);
  });

  it('handles FunctionDeclaration', () => {
    const code = 'function greet(name) { return "hi " + name; }';
    const program = parse(code);
    const decls = collectModuleLevelDecls(program, code);

    expect(decls).toHaveLength(1);
    expect(decls[0].name).toBe('greet');
    expect(decls[0].hasSideEffects).toBe(false);
    expect(decls[0].kind).toBe('function');
  });

  it('treats Math.random() call as side effect', () => {
    const code = 'const id = Math.random();';
    const program = parse(code);
    const decls = collectModuleLevelDecls(program, code);

    expect(decls).toHaveLength(1);
    expect(decls[0].hasSideEffects).toBe(true);
  });

  it('treats object/array literals with only safe values as safe', () => {
    const code = 'const obj = { x: 1, y: "two" };\nconst arr = [1, 2, 3];';
    const program = parse(code);
    const decls = collectModuleLevelDecls(program, code);

    expect(decls).toHaveLength(2);
    expect(decls[0].hasSideEffects).toBe(false);
    expect(decls[1].hasSideEffects).toBe(false);
  });

  it('treats object with call expression value as having side effects', () => {
    const code = 'const obj = { x: getVal() };';
    const program = parse(code);
    const decls = collectModuleLevelDecls(program, code);

    expect(decls).toHaveLength(1);
    expect(decls[0].hasSideEffects).toBe(true);
  });

  it('collects single-binding destructuring as NOT shared', () => {
    const code = 'const { a } = obj;';
    const program = parse(code);
    const decls = collectModuleLevelDecls(program, code);

    expect(decls).toHaveLength(1);
    expect(decls[0].name).toBe('a');
    expect(decls[0].isPartOfSharedDestructuring).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// computeSegmentUsage() tests
// ---------------------------------------------------------------------------

describe('computeSegmentUsage', () => {
  function parse(code: string) {
    return parseSync('test.tsx', code).program;
  }

  it('attributes identifiers inside extraction range to segments', () => {
    const code = 'const x = 1;\ncomponent$(() => { return x; });';
    const program = parse(code);

    // The arrow fn body references `x`. Find the arg range.
    // component$(() => { return x; })
    // The argument is the arrow: () => { return x; }
    const arrowStart = code.indexOf('() =>');
    const arrowEnd = code.lastIndexOf(')');

    const { segmentUsage, rootUsage } = computeSegmentUsage(program, [
      { symbolName: 'seg1', argStart: arrowStart, argEnd: arrowEnd },
    ]);

    expect(segmentUsage.get('seg1')?.has('x')).toBe(true);
    // 'x' in `const x = 1` is a declaration-site binding at root level.
    // SWC's build_main_module_usage_set skips Stmt::Decl items, so
    // declaration-site identifiers are NOT in rootUsage.
    expect(rootUsage.has('x')).toBe(false);
  });

  it('attributes identifiers outside all ranges to root', () => {
    const code = 'const y = foo();\ncomponent$(() => { return 42; });';
    const program = parse(code);

    const arrowStart = code.indexOf('() =>');
    const arrowEnd = code.lastIndexOf(')');

    const { rootUsage } = computeSegmentUsage(program, [
      { symbolName: 'seg1', argStart: arrowStart, argEnd: arrowEnd },
    ]);

    expect(rootUsage.has('foo')).toBe(true);
  });
});

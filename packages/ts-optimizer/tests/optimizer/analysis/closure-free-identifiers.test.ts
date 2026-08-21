import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseSync } from 'oxc-parser';
import { walk, getUndeclaredIdentifiersInFunction } from 'oxc-walker';
import { computeClosureFreeIdentifiers } from '../../../src/optimizer/analysis/closure-free-identifiers.js';
import { parseSnapshot } from '../../../src/testing/snapshot-parser.js';
import { RAW_TRANSFER_PARSER_OPTIONS } from '../../../src/ast-types.js';
import type { AstFunction, AstNode, AstProgram } from '../../../src/ast-types.js';
import { SNAP_DIR } from '../../rust-snapshots.js';

function collectFunctionNodes(program: AstProgram): Map<string, AstFunction> {
  const nodes = new Map<string, AstFunction>();
  let i = 0;
  walk(program, {
    enter(node) {
      const n = node as AstNode;
      if (
        n.type === 'ArrowFunctionExpression' ||
        n.type === 'FunctionExpression' ||
        n.type === 'FunctionDeclaration'
      ) {
        nodes.set(`fn_${i++}`, n as AstFunction);
      }
    },
  });
  return nodes;
}

function collectComputedKeyNames(fn: AstFunction): Set<string> {
  const names = new Set<string>();
  walk(fn as AstNode, {
    enter(node, parent) {
      const n = node as AstNode;
      const p = parent as AstNode | null;
      if (n.type !== 'Identifier' || p === null) {
        return;
      }
      if (p.type === 'MemberExpression') {
        if (p.computed === true && p.property === n) {
          names.add(n.name);
        }
      } else if (
        p.type === 'Property' ||
        p.type === 'MethodDefinition' ||
        p.type === 'PropertyDefinition' ||
        p.type === 'AccessorProperty'
      ) {
        if (p.computed === true && p.key === n) {
          names.add(n.name);
        }
      }
    },
  });
  return names;
}

// `as T`, `x!`, `x satisfies T` and friends hold a real expression next to the
// type, so only their type child starts a type position.
const TS_NODES_HOLDING_A_VALUE = new Set([
  'TSAsExpression',
  'TSSatisfiesExpression',
  'TSNonNullExpression',
  'TSInstantiationExpression',
  'TSTypeAssertion',
  'TSEnumDeclaration',
  'TSEnumMember',
  'TSModuleDeclaration',
  'TSModuleBlock',
  'TSParameterProperty',
  'TSExportAssignment',
  'TSImportEqualsDeclaration',
]);

/**
 * Names that only ever appear in a type position (`props: Stuff`, `useSignal<Signal<number>>`). The
 * fused walk reports them; the oxc-walker oracle doesn't. Inert in the pipeline — `transpileTs`
 * strips types before this analysis runs, and the migration and capture gates downstream drop them
 * even when it doesn't — so the difference stays a test-only exclusion rather than a TS-grammar
 * exception list baked into the production walk.
 */
function collectTypePositionNames(fn: AstFunction): Set<string> {
  const names = new Set<string>();
  walk(fn as AstNode, {
    enter(node) {
      const n = node as AstNode;
      if (!n.type.startsWith('TS') || TS_NODES_HOLDING_A_VALUE.has(n.type)) {
        return;
      }
      walk(n, {
        enter(inner) {
          const i = inner as AstNode;
          if (i.type === 'Identifier') {
            names.add(i.name);
          }
        },
      });
    },
  });
  return names;
}

function collectJsxTagNames(fn: AstFunction): Set<string> {
  const names = new Set<string>();
  walk(fn as AstNode, {
    enter(node, parent) {
      const n = node as AstNode;
      const p = parent as AstNode | null;
      if (n.type !== 'JSXIdentifier' || p === null) {
        return;
      }
      if (p.type === 'JSXAttribute' || p.type === 'JSXNamespacedName') {
        return;
      }
      if (p.type === 'JSXMemberExpression' && (p as { property?: unknown }).property === n) {
        return;
      }
      if (/^[A-Z]/.test(n.name)) {
        names.add(n.name);
      }
    },
  });
  return names;
}

function diffAgainstLegacy(source: string, filename: string): string[] {
  const parsed = parseSync(filename, source, RAW_TRANSFER_PARSER_OPTIONS);
  if (!parsed.program || parsed.errors?.length) {
    return [];
  }
  const program = parsed.program as AstProgram;
  const nodes = collectFunctionNodes(program);
  const fused = computeClosureFreeIdentifiers(program, nodes);

  const mismatches: string[] = [];
  for (const [key, fn] of nodes) {
    let legacy: string[];
    try {
      legacy = getUndeclaredIdentifiersInFunction(fn);
    } catch {
      continue;
    }
    const ours = fused.get(fn) ?? [];
    const computedKeyNames = collectComputedKeyNames(fn);
    // The fused walk intentionally counts capitalized JSX tags as free
    // references (they capture like any binding); the oxc-walker oracle
    // doesn't know JSX tags, so exclude that known difference.
    const jsxTagNames = collectJsxTagNames(fn);
    // A name used in a type position is dropped from both sides: the fused walk
    // also sees it earlier there than the oracle sees it at its value use, so
    // its ordering can't be compared either.
    const typePositionNames = collectTypePositionNames(fn);
    const legacySet = new Set(legacy);
    const filtered = ours.filter(
      (n) =>
        !typePositionNames.has(n) &&
        (legacySet.has(n) || (!computedKeyNames.has(n) && !jsxTagNames.has(n)))
    );
    const expected = legacy.filter((n) => !typePositionNames.has(n));
    if (JSON.stringify(filtered) !== JSON.stringify(expected)) {
      mismatches.push(
        `${key} @ ${fn.start}: fused=${JSON.stringify(ours)} legacy=${JSON.stringify(legacy)}`
      );
    }
  }
  return mismatches;
}

describe('computeClosureFreeIdentifiers parity with per-closure analysis', () => {
  it('matches on handcrafted scope shapes', () => {
    const source = `
import { component$, $ } from '@qwik.dev/core';
const moduleVar = 1;
function moduleFn() { return moduleVar; }
class ModuleClass {}

export const A = component$(({ prop }) => {
  const local = 2;
  const shadow = 3;
  for (let i = 0; i < 3; i++) {
    register($((ev) => use(local, prop, i, moduleVar, unknownGlobal)));
  }
  const inner = $(() => {
    const shadowed = (shadow) => shadow + local;
    return shadowed(moduleFn()) + new ModuleClass().x;
  });
  const named = $(function self() { return self() + local; });
  const arrowInBlock = () => { { const blockScoped = 4; } return blockScoped; };
  return inner;
});

export const lateRef = $(() => laterDeclared + 1);
const laterDeclared = 5;
`;
    expect(diffAgainstLegacy(source, 'handcrafted.tsx')).toEqual([]);
  });

  it('keeps first-free-occurrence order when a name resolves internal at one scope and free at another', () => {
    const source = `
export const B = $(() => {
  use(firstFree);
  {
    let dual = 1;
    touch(dual);
  }
  return dual + secondFree;
});
const dual = 9;
`;
    expect(diffAgainstLegacy(source, 'handcrafted.tsx')).toEqual([]);

    const parsed = parseSync('handcrafted.tsx', source, RAW_TRANSFER_PARSER_OPTIONS);
    const program = parsed.program as AstProgram;
    const nodes = collectFunctionNodes(program);
    const fused = computeClosureFreeIdentifiers(program, nodes);
    const closure = [...nodes.values()][0];
    expect(fused.get(closure)).toEqual(['use', 'firstFree', 'touch', 'dual', 'secondFree']);
  });

  it('matches across the full snapshot fixture corpus', () => {
    const snapFiles = readdirSync(SNAP_DIR).filter((f) => f.endsWith('.snap'));
    expect(snapFiles.length).toBeGreaterThan(100);

    const failures: string[] = [];
    let checkedFns = 0;
    for (const snapFile of snapFiles) {
      const content = readFileSync(join(SNAP_DIR, snapFile), 'utf-8');
      const parsed = parseSnapshot(content);
      if (!parsed.input) {
        continue;
      }
      const mismatches = diffAgainstLegacy(parsed.input, 'test.tsx');
      checkedFns += 1;
      for (const m of mismatches) {
        failures.push(`${snapFile}: ${m}`);
      }
    }
    expect(checkedFns).toBeGreaterThan(100);
    expect(failures).toEqual([]);
  });
});

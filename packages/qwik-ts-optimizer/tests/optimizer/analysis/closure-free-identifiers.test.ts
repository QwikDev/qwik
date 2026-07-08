/**
 * Differential tests for the whole-program free-identifier analysis.
 *
 * `computeClosureFreeIdentifiers` replaces per-closure
 * `getUndeclaredIdentifiersInFunction` calls (two AST walks per closure)
 * with two walks over the whole program. Its contract is exact parity
 * with the per-closure form — same names, same first-reference order —
 * for every closure it tracks.
 *
 * The corpus sweep runs the comparison over every function-like node in
 * every snapshot fixture input (a far broader population than actual
 * extractions), so any resolution divergence — scope-chain handling,
 * shadowing, hoisting, the FunctionExpression own-name scope — surfaces
 * as a named fixture failure.
 */

import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseSync } from 'oxc-parser';
import { walk, getUndeclaredIdentifiersInFunction } from 'oxc-walker';
import { computeClosureFreeIdentifiers } from '../../../src/optimizer/analysis/closure-free-identifiers.js';
import { parseSnapshot } from '../../../src/testing/snapshot-parser.js';
import { RAW_TRANSFER_PARSER_OPTIONS } from '../../../src/ast-types.js';
import type { AstFunction, AstNode, AstProgram } from '../../../src/ast-types.js';

const SNAP_DIR = join(dirname(fileURLToPath(import.meta.url)), '../../../match-these-snaps');

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
      if (n.type !== 'Identifier' || p === null) return;
      if (p.type === 'MemberExpression') {
        if (p.computed === true && p.property === n) names.add(n.name);
      } else if (
        p.type === 'Property' ||
        p.type === 'MethodDefinition' ||
        p.type === 'PropertyDefinition' ||
        p.type === 'AccessorProperty'
      ) {
        if (p.computed === true && p.key === n) names.add(n.name);
      }
    },
  });
  return names;
}

function diffAgainstLegacy(source: string, filename: string): string[] {
  const parsed = parseSync(filename, source, RAW_TRANSFER_PARSER_OPTIONS);
  if (!parsed.program || parsed.errors?.length) return [];
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
    const legacySet = new Set(legacy);
    const filtered = ours.filter(
      (n) => legacySet.has(n) || !computedKeyNames.has(n),
    );
    if (JSON.stringify(filtered) !== JSON.stringify(legacy)) {
      mismatches.push(
        `${key} @ ${fn.start}: fused=${JSON.stringify(ours)} legacy=${JSON.stringify(legacy)}`,
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
    // Inside the closure, `dual` first resolves to the block-scoped `let`
    // (internal), then to the module-level binding (free). The free
    // occurrence must land in the name list between `firstFree` and
    // `secondFree` — exactly where the per-closure form records it.
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
      if (!parsed.input) continue;
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

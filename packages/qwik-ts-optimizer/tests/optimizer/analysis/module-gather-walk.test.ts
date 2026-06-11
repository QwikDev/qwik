/**
 * Differential tests for the canonical per-module gather walk.
 *
 * `gatherModuleFacts` fuses five formerly-independent full-program walks
 * (lexical scopes, extraction loop map, scope entries, segment usage,
 * passive-conflict detection) plus the free-identifier analysis into one
 * traversal. Each original function is retained as the differential oracle
 * for its projection; this suite asserts exact parity between the fused
 * walk's output and every oracle, per fixture.
 *
 * The corpus sweep synthesizes an "extraction" from every function-like
 * node in every snapshot fixture input — a far broader population than
 * actual extractions — so any divergence in stack handling, range
 * attribution, or hoisting order surfaces as a named fixture failure.
 * (Free-identifier parity has its own oracle suite in
 * `closure-free-identifiers.test.ts`, which now exercises the canonical
 * walk through the `computeClosureFreeIdentifiers` wrapper.)
 */

import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseSync } from 'oxc-parser';
import { walk } from 'oxc-walker';
import { gatherModuleFacts } from '../../../src/optimizer/analysis/module-gather-walk.js';
import { buildClosureLexicalScopes } from '../../../src/optimizer/analysis/capture-analysis.js';
import { computeSegmentUsage } from '../../../src/optimizer/analysis/variable-migration.js';
import {
  buildExtractionLoopMap,
  collectAllScopeEntries,
} from '../../../src/optimizer/jsx/event-capture-promotion.js';
import {
  detectPassivePreventdefaultConflicts,
  emitPassiveConflictDiagnostics,
} from '../../../src/optimizer/diagnostics/diagnostic-detection.js';
import type { ExtractionResult } from '../../../src/optimizer/extraction/extract.js';
import type { Diagnostic } from '../../../src/optimizer/types/types.js';
import { parseSnapshot } from '../../../src/testing/snapshot-parser.js';
import { RAW_TRANSFER_PARSER_OPTIONS } from '../../../src/ast-types.js';
import type { AstFunction, AstNode, AstProgram } from '../../../src/ast-types.js';

const SNAP_DIR = join(dirname(fileURLToPath(import.meta.url)), '../../../match-these-snaps');

interface SyntheticExtraction {
  symbolName: string;
  argStart: number;
  argEnd: number;
  callStart: number;
  callEnd: number;
}

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

function syntheticExtractions(nodes: Map<string, AstFunction>): SyntheticExtraction[] {
  const out: SyntheticExtraction[] = [];
  for (const [sym, fn] of nodes) {
    out.push({
      symbolName: sym,
      argStart: fn.start,
      argEnd: fn.end,
      callStart: fn.start,
      callEnd: fn.end,
    });
  }
  return out;
}

function mapOfSetsToPlain(m: ReadonlyMap<string, Set<string>>): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const [k, v] of m) out[k] = [...v].sort();
  return out;
}

/** LoopContext carries the loop's AST node; compare it by identity and the
 * rest structurally. */
function loopMapToComparable(
  m: ReadonlyMap<string, Array<{ type: string; iterVars: string[]; loopNode: unknown; loopBodyStart: number; loopBodyEnd: number }>>,
  nodeIds: Map<unknown, number>,
): Record<string, Array<Record<string, unknown>>> {
  const out: Record<string, Array<Record<string, unknown>>> = {};
  for (const [k, stack] of m) {
    out[k] = stack.map((lc) => {
      if (!nodeIds.has(lc.loopNode)) nodeIds.set(lc.loopNode, nodeIds.size);
      return {
        type: lc.type,
        iterVars: lc.iterVars,
        loopBodyStart: lc.loopBodyStart,
        loopBodyEnd: lc.loopBodyEnd,
        loopNode: nodeIds.get(lc.loopNode),
      };
    });
  }
  return out;
}

function diffFixture(source: string, filename: string): string[] {
  const parsed = parseSync(filename, source, RAW_TRANSFER_PARSER_OPTIONS);
  if (!parsed.program || parsed.errors?.length) return [];
  const program = parsed.program as AstProgram;
  const nodes = collectFunctionNodes(program);
  const extractions = syntheticExtractions(nodes);

  const facts = gatherModuleFacts({
    program,
    closureNodes: nodes,
    usageExtractions: extractions,
    loopExtractions: extractions,
    repairedCode: source,
    scopeEntries: true,
    passiveConflicts: true,
  });

  const mismatches: string[] = [];
  const check = (label: string, fused: unknown, oracle: unknown): void => {
    const a = JSON.stringify(fused);
    const b = JSON.stringify(oracle);
    if (a !== b) mismatches.push(`${label}: fused=${a} oracle=${b}`);
  };

  // Lexical scopes
  const oracleLex = buildClosureLexicalScopes(program, nodes);
  check('lexicalScopes', mapOfSetsToPlain(facts.closureLexicalScopes), mapOfSetsToPlain(oracleLex));

  // Loop map + loop body var decls. The oracle only reads symbolName /
  // callStart / callEnd off ExtractionResult; the synthetic records carry
  // exactly those fields.
  const oracleLoop = buildExtractionLoopMap(
    program,
    extractions as unknown as ExtractionResult[],
    source,
  );
  const nodeIds = new Map<unknown, number>();
  check(
    'extractionLoopMap',
    loopMapToComparable(facts.extractionLoopMap, nodeIds),
    loopMapToComparable(oracleLoop.extractionLoopMap, nodeIds),
  );
  check(
    'loopBodyVarDecls',
    Object.fromEntries(facts.loopBodyVarDecls),
    Object.fromEntries(oracleLoop.loopBodyVarDecls),
  );

  // Scope entries
  check('allScopeEntries', facts.allScopeEntries, collectAllScopeEntries(program));

  // Segment usage
  const oracleUsage = computeSegmentUsage(program, extractions);
  check('segmentUsage', mapOfSetsToPlain(facts.segmentUsage), mapOfSetsToPlain(oracleUsage.segmentUsage));
  check('rootUsage', [...facts.rootUsage].sort(), [...oracleUsage.rootUsage].sort());

  // Passive conflicts, compared at the diagnostic level so the gather+emit
  // split proves order-identical to the oracle's walk-and-emit.
  const oracleDiags: Diagnostic[] = [];
  detectPassivePreventdefaultConflicts(program, filename, source, oracleDiags);
  const fusedDiags: Diagnostic[] = [];
  emitPassiveConflictDiagnostics(facts.passiveConflicts, filename, source, fusedDiags);
  check('passiveConflicts', fusedDiags, oracleDiags);

  return mismatches;
}

/** A flat module with `count` extractions, each referencing one local, one
 * unique free identifier, and one shared module-level binding. */
function syntheticManyExtractionSource(count: number): string {
  const lines: string[] = ['const shared = 1;'];
  for (let i = 0; i < count; i++) {
    lines.push(
      `export const c${i} = $(() => { const l${i} = ${i}; return g${i} + l${i} + shared; });`,
    );
  }
  return lines.join('\n');
}

describe('gatherModuleFacts parity with the per-fact walks', () => {
  it('matches on a handcrafted kitchen-sink module', () => {
    const source = `
import { component$, $ } from '@qwik.dev/core';
const moduleVar = 1;
export const helper = (x) => x + moduleVar;

export const App = component$(({ prop }) => {
  const items = [1, 2, 3];
  let counter = 0;
  while (counter < 3) {
    const local = counter;
    register($(() => use(local, prop)));
    counter++;
  }
  for (const item of items) {
    items.map((inner) => $(() => inner + item));
  }
  for (let i = 0; i < 2; i++) {
    const inLoop = i * 2;
    register($(() => inLoop));
  }
  return (
    <div passive:scroll preventdefault:scroll onScroll$={() => counter}>
      <span passive:click>{hoisted()}</span>
    </div>
  );
});

function hoisted() { return laterDecl; }
const laterDecl = 7;
`;
    expect(diffFixture(source, 'test.tsx')).toEqual([]);

    // Guard against vacuous parity: the fixture must actually exercise
    // every projection.
    const parsed = parseSync('test.tsx', source, RAW_TRANSFER_PARSER_OPTIONS);
    const program = parsed.program as AstProgram;
    const nodes = collectFunctionNodes(program);
    const extractions = syntheticExtractions(nodes);
    const facts = gatherModuleFacts({
      program,
      closureNodes: nodes,
      usageExtractions: extractions,
      loopExtractions: extractions,
      repairedCode: source,
      scopeEntries: true,
      passiveConflicts: true,
    });
    expect(facts.passiveConflicts.length).toBe(1);
    expect(facts.passiveConflicts[0].eventName).toBe('scroll');
    expect(facts.extractionLoopMap.size).toBeGreaterThan(0);
    expect(facts.loopBodyVarDecls.size).toBeGreaterThan(0);
    expect(facts.allScopeEntries.some((e) => e.type === 'for-loop')).toBe(true);
    expect(facts.closureLexicalScopes.size).toBe(nodes.size);
    expect(facts.rootUsage.size).toBeGreaterThan(0);
    expect([...facts.closureFreeIdentifiers.values()].some((names) => names.length > 0)).toBe(true);
  });

  it('matches the oracle on a synthetic many-extraction module', () => {
    expect(diffFixture(syntheticManyExtractionSource(200), 'test.tsx')).toEqual([]);
  });

  it('matches across the full snapshot fixture corpus', () => {
    const snapFiles = readdirSync(SNAP_DIR).filter((f) => f.endsWith('.snap'));
    expect(snapFiles.length).toBeGreaterThan(100);

    const failures: string[] = [];
    let checkedFixtures = 0;
    for (const snapFile of snapFiles) {
      const content = readFileSync(join(SNAP_DIR, snapFile), 'utf-8');
      const parsed = parseSnapshot(content);
      if (!parsed.input) continue;
      const mismatches = diffFixture(parsed.input, 'test.tsx');
      checkedFixtures += 1;
      for (const m of mismatches) {
        failures.push(`${snapFile}: ${m}`);
      }
    }
    expect(checkedFixtures).toBeGreaterThan(100);
    expect(failures).toEqual([]);
  });
});

describe('segment-usage projection bounded behavior', () => {
  it('does work proportional to visits + extractions, not visits × extractions', () => {
    const source = syntheticManyExtractionSource(200);
    const parsed = parseSync('test.tsx', source, RAW_TRANSFER_PARSER_OPTIONS);
    const program = parsed.program as AstProgram;
    const nodes = collectFunctionNodes(program);

    // Count every property read against an extraction record. Containment
    // tests read `argStart` / `argEnd`, so the read count is a deterministic
    // proxy for how many range comparisons the projection performs.
    let reads = 0;
    const counted = syntheticExtractions(nodes).map(
      (ext) =>
        new Proxy(ext, {
          get(target, prop, receiver) {
            reads++;
            return Reflect.get(target, prop, receiver);
          },
        }),
    );
    const facts = gatherModuleFacts({ program, usageExtractions: counted });

    // Sanity: the projection actually classified this input.
    expect(facts.segmentUsage.size).toBe(counted.length);
    const perSegment = [...facts.segmentUsage.values()];
    expect(perSegment.every((used) => used.has('shared'))).toBe(true);
    expect(perSegment.some((used) => used.has('l0'))).toBe(false);
    expect(facts.rootUsage.has('shared')).toBe(false);

    // ~2,400 identifier visits × 200 extractions × 2 range reads ≈ 600k+
    // for a per-visit scan over every extraction. The range-stack sweep
    // stays around two orders of magnitude below that.
    expect(reads).toBeLessThan(100_000);
  });
});

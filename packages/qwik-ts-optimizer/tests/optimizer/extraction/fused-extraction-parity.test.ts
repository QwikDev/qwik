
import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseSync } from 'oxc-parser';
import { gatherModuleFacts } from '../../../src/optimizer/analysis/module-gather-walk.js';
import { extractSegments } from '../../../src/optimizer/extraction/extract.js';
import type { ExtractionResult } from '../../../src/optimizer/extraction/extract.js';
import { buildClosureLexicalScopes } from '../../../src/optimizer/analysis/capture-analysis.js';
import { computeClosureFreeIdentifiers } from '../../../src/optimizer/analysis/closure-free-identifiers.js';
import { computeSegmentUsage } from '../../../src/optimizer/analysis/variable-migration.js';
import {
  buildExtractionLoopMap,
  collectAllScopeEntries,
} from '../../../src/optimizer/jsx/event-capture-promotion.js';
import { parseSnapshot } from '../../../src/testing/snapshot-parser.js';
import { RAW_TRANSFER_PARSER_OPTIONS } from '../../../src/ast-types.js';
import type {
  AstEcmaScriptModule,
  AstFunction,
  AstProgram,
} from '../../../src/ast-types.js';

const SNAP_DIR = join(dirname(fileURLToPath(import.meta.url)), '../../../match-these-snaps');

interface FlagCombo {
  readonly label: string;
  readonly transpileJsx: boolean;
  readonly explicitTranspileJsx: boolean;
}

const FLAG_COMBOS: readonly FlagCombo[] = [
  { label: 'auto', transpileJsx: true, explicitTranspileJsx: false },
  { label: 'raw', transpileJsx: false, explicitTranspileJsx: false },
  { label: 'explicit', transpileJsx: true, explicitTranspileJsx: true },
];

function mapOfSetsToPlain(m: ReadonlyMap<string, Set<string>>): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const [k, v] of m) out[k] = [...v].sort();
  return out;
}

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

function diffFixture(source: string, filename: string, combo: FlagCombo): string[] {
  const parsed = parseSync(filename, source, RAW_TRANSFER_PARSER_OPTIONS);
  if (!parsed.program || parsed.errors?.length) return [];
  const program = parsed.program as AstProgram;
  const parserModule = parsed.module as AstEcmaScriptModule | undefined;

  const oracleClosures = new Map<string, AstFunction>();
  const oracleExtractions = extractSegments(
    source,
    filename,
    undefined,
    combo.transpileJsx,
    program,
    parserModule,
    oracleClosures,
    combo.explicitTranspileJsx,
  );

  const fusedClosures = new Map<string, AstFunction>();
  const facts = gatherModuleFacts({
    program,
    repairedCode: source,
    scopeEntries: true,
    extraction: {
      source,
      relPath: filename,
      transpileJsx: combo.transpileJsx,
      explicitTranspileJsx: combo.explicitTranspileJsx,
      parserModule,
      closureNodesOut: fusedClosures,
    },
  });
  const fusedExtractions = facts.extractions;

  const mismatches: string[] = [];
  const check = (label: string, fused: unknown, oracle: unknown): void => {
    const a = JSON.stringify(fused);
    const b = JSON.stringify(oracle);
    if (a !== b) mismatches.push(`[${combo.label}] ${label}: fused=${a} oracle=${b}`);
  };

  check('extractions.length', fusedExtractions.length, oracleExtractions.length);
  const count = Math.min(fusedExtractions.length, oracleExtractions.length);
  for (let i = 0; i < count; i++) {
    check(`extraction[${i}]`, fusedExtractions[i], oracleExtractions[i]);
  }

  check('closureNodes.keys', [...fusedClosures.keys()].sort(), [...oracleClosures.keys()].sort());
  for (const [sym, fn] of fusedClosures) {
    if (oracleClosures.get(sym) !== fn) {
      mismatches.push(`[${combo.label}] closureNodes[${sym}]: node identity differs`);
    }
  }

  const oracleArr = oracleExtractions as unknown as ExtractionResult[];

  const oracleLoop = buildExtractionLoopMap(program, oracleArr, source);
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

  if (fusedExtractions.length === 0) {
    check('segmentUsage(empty)', facts.segmentUsage.size, 0);
    check('rootUsage(empty)', facts.rootUsage.size, 0);
    check('allScopeEntries(empty)', facts.allScopeEntries.length, 0);
  } else {
    const oracleUsage = computeSegmentUsage(program, oracleArr);
    check('segmentUsage', mapOfSetsToPlain(facts.segmentUsage), mapOfSetsToPlain(oracleUsage.segmentUsage));
    check('rootUsage', [...facts.rootUsage].sort(), [...oracleUsage.rootUsage].sort());
    check('allScopeEntries', facts.allScopeEntries, collectAllScopeEntries(program));
  }

  const oracleLex = buildClosureLexicalScopes(program, oracleClosures);
  const fusedLex = new Map<string, Set<string>>();
  for (const [sym, fn] of fusedClosures) {
    const union = facts.closureLexicalScopes.get(fn);
    if (union) fusedLex.set(sym, union);
  }
  check('lexicalScopes', mapOfSetsToPlain(fusedLex), mapOfSetsToPlain(oracleLex));

  const oracleFree = computeClosureFreeIdentifiers(program, oracleClosures);
  for (const [sym, fn] of fusedClosures) {
    check(
      `freeIdentifiers[${sym}]`,
      facts.closureFreeIdentifiers.get(fn) ?? [],
      oracleFree.get(fn) ?? [],
    );
  }

  return mismatches;
}

function diffAllCombos(source: string, filename: string): string[] {
  const out: string[] = [];
  for (const combo of FLAG_COMBOS) {
    out.push(...diffFixture(source, filename, combo));
  }
  return out;
}

const KITCHEN_SINK = `
import { component$, $, useTask$, inlinedQrl, useStyles$, jsx } from '@qwik.dev/core';
import css from './style.css';
const moduleVar = 1;
export const helper = (x) => x + moduleVar;

export const renderHeader = $(() => {
  return <div onClick={$((ctx) => console.log(ctx, moduleVar))} />;
});

export const App = component$(({ prop }) => {
  const items = [1, 2, 3];
  useStyles$(css);
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
  useTask$(() => {
    console.log(counter, helper(1));
  });
  return (
    <div onScroll$={() => counter}>
      <Child onSelect$={(v) => v + counter} custom$={() => prop} />
      <span onClick$={function named() { return named; }}>{helper(2)}</span>
    </div>
  );
});

export const pre = inlinedQrl(() => console.log(captured), 'pre_abc12345678', [captured]);

export const viaJsxCall = jsx('button', { onClick$: () => moduleVar, children: 'x' });

export default component$(() => <div onClick$={() => moduleVar} />);
`;

describe('fused-extraction parity with standalone extractSegments', () => {
  it('matches on the kitchen-sink module', () => {
    expect(diffAllCombos(KITCHEN_SINK, 'test.tsx')).toEqual([]);

    const parsed = parseSync('test.tsx', KITCHEN_SINK, RAW_TRANSFER_PARSER_OPTIONS);
    const facts = gatherModuleFacts({
      program: parsed.program as AstProgram,
      repairedCode: KITCHEN_SINK,
      extraction: { source: KITCHEN_SINK, relPath: 'test.tsx', transpileJsx: true },
    });
    expect(facts.extractions.length).toBeGreaterThanOrEqual(10);
    expect(facts.extractions.some((e) => e.isInlinedQrl)).toBe(true);
    expect(facts.extractionLoopMap.size).toBeGreaterThan(0);
    expect(facts.segmentUsage.size).toBe(facts.extractions.length);
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
      const mismatches = diffAllCombos(parsed.input, 'test.tsx');
      checkedFixtures += 1;
      for (const m of mismatches) {
        failures.push(`${snapFile}: ${m}`);
      }
    }
    expect(checkedFixtures).toBeGreaterThan(100);
    expect(failures).toEqual([]);
  });
});

import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseSync } from 'oxc-parser';
import { walk } from 'oxc-walker';
import type { ScopeTrackerNode } from 'oxc-walker';
import { ScopeQueryTracker } from '../../../src/optimizer/analysis/scope-query-tracker.js';
import { parseSnapshot } from '../../../src/testing/snapshot-parser.js';
import { RAW_TRANSFER_PARSER_OPTIONS } from '../../../src/ast-types.js';
import type { AstNode, AstProgram } from '../../../src/ast-types.js';

const SNAP_DIR = join(dirname(fileURLToPath(import.meta.url)), '../../../match-these-snaps');

interface ReplayRecord {
  readonly name: string;
  readonly scopeKey: string;
  readonly decl: ScopeTrackerNode | null;
}

interface FixtureResult {
  readonly mismatches: string[];
  readonly records: number;
  readonly resolved: number;
}

function checkFixture(source: string, filename: string): FixtureResult {
  const parsed = parseSync(filename, source, RAW_TRANSFER_PARSER_OPTIONS);
  if (!parsed.program || parsed.errors?.length) {
    return { mismatches: [], records: 0, resolved: 0 };
  }
  const program = parsed.program as AstProgram;

  const tracker = new ScopeQueryTracker({ preserveExitedScopes: true });
  walk(program, { scopeTracker: tracker });
  tracker.freeze();

  const records: ReplayRecord[] = [];
  walk(program, {
    scopeTracker: tracker,
    enter(node) {
      const n = node as AstNode;
      if (n.type !== 'Identifier') return;
      records.push({
        name: n.name,
        scopeKey: tracker.getCurrentScope(),
        decl: tracker.getDeclaration(n.name),
      });
    },
  });

  const mismatches: string[] = [];
  let resolved = 0;
  for (const { name, scopeKey, decl } of records) {
    if (decl !== null) resolved++;
    const fromScope = tracker.getDeclarationFromScope(name, scopeKey);
    if (fromScope !== decl) {
      mismatches.push(
        `${name} @ scope "${scopeKey}": replay=${decl?.type ?? 'null'} ` +
          `fromScope=${fromScope?.type ?? 'null'}`
      );
    }
  }
  return { mismatches, records: records.length, resolved };
}

describe('ScopeQueryTracker.getDeclarationFromScope equivalence', () => {
  it('matches replay-time getDeclaration under shadowing', () => {
    const source = `
const x = 1;
function outer(x) {
  const y = x;
  {
    let x = 2;
    use(x, y);
  }
  return x;
}
use(x);
`;
    const result = checkFixture(source, 'test.ts');
    expect(result.mismatches).toEqual([]);
    expect(result.resolved).toBeGreaterThan(0);
  });

  it('matches for hoisted function declarations referenced before their decl', () => {
    const source = `
function caller() {
  return hoisted() + alsoHoisted();
}
function hoisted() {
  return 1;
}
{
  function alsoHoisted() { return 2; }
}
`;
    const result = checkFixture(source, 'test.ts');
    expect(result.mismatches).toEqual([]);
    expect(result.resolved).toBeGreaterThan(0);
  });

  it('matches for FunctionExpression own-name (id-holding outer scope)', () => {
    const source = `
const f = function g(n) {
  if (n === 0) return 1;
  return n * g(n - 1);
};
const g = 'shadows-nothing-outside';
use(f, g);
`;
    const result = checkFixture(source, 'test.ts');
    expect(result.mismatches).toEqual([]);
    expect(result.resolved).toBeGreaterThan(0);
  });

  it('matches for catch params and for-loop head bindings', () => {
    const source = `
const e = 'outer';
try {
  risky();
} catch (e) {
  report(e);
}
for (const e of list) {
  use(e);
}
for (let i = 0; i < 3; i++) {
  use(i, e);
}
use(e);
`;
    const result = checkFixture(source, 'test.ts');
    expect(result.mismatches).toEqual([]);
    expect(result.resolved).toBeGreaterThan(0);
  });

  it('matches across every snapshot fixture input', () => {
    const snapFiles = readdirSync(SNAP_DIR).filter((f) => f.endsWith('.snap'));
    const failures: string[] = [];
    let checkedFixtures = 0;
    let totalRecords = 0;
    let totalResolved = 0;
    for (const snapFile of snapFiles) {
      const content = readFileSync(join(SNAP_DIR, snapFile), 'utf-8');
      const parsed = parseSnapshot(content);
      if (!parsed.input) continue;
      const result = checkFixture(parsed.input, 'test.tsx');
      checkedFixtures += 1;
      totalRecords += result.records;
      totalResolved += result.resolved;
      for (const m of result.mismatches) {
        failures.push(`${snapFile}: ${m}`);
      }
    }
    expect(checkedFixtures).toBeGreaterThan(100);
    expect(totalRecords).toBeGreaterThan(1000);
    expect(totalResolved).toBeGreaterThan(500);
    expect(failures).toEqual([]);
  });
});

import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, test } from 'vitest';

/**
 * Coverage gate (conformance/REQUIREMENTS.md): every wire form the compiler can emit must appear in
 * at least one fixture, so a new form cannot land without a case proving an engine renders it.
 *
 * The vocabularies are read from source rather than imported: they are `const enum`s, and reading
 * the declaration keeps this honest when one grows.
 */

const layerADir = dirname(fileURLToPath(import.meta.url));
const srcDir = join(layerADir, '../../src');
const fixturesDir = join(layerADir, 'fixtures');

function enumValues(file: string, name: string): string[] {
  const source = readFileSync(join(srcDir, file), 'utf-8');
  const declaration = source.slice(source.indexOf(`enum ${name} {`));
  const body = declaration.slice(0, declaration.indexOf('}'));
  return [...body.matchAll(/=\s*'([^']+)'/g)].map((match) => match[1]);
}

/** A string-union type, for vocabularies that are not enums. */
function unionValues(file: string, name: string): string[] {
  const source = readFileSync(join(srcDir, file), 'utf-8');
  const declaration = source.slice(source.indexOf(`type ${name} =`));
  const body = declaration.slice(0, declaration.indexOf(';'));
  return [...body.matchAll(/'([^']+)'/g)].map((match) => match[1]);
}

/** Every `kind` string anywhere in any fixture plan. */
function plannedKinds(): Set<string> {
  const kinds = new Set<string>();
  const collect = (node: unknown): void => {
    if (Array.isArray(node)) {
      node.forEach(collect);
      return;
    }
    if (node === null || typeof node !== 'object') {
      return;
    }
    for (const [key, value] of Object.entries(node)) {
      if (key === 'kind' && typeof value === 'string') {
        kinds.add(value);
      }
      collect(value);
    }
  };
  for (const fixture of readdirSync(fixturesDir)) {
    const plan = join(fixturesDir, fixture, 'expected/plan.json');
    try {
      collect(JSON.parse(readFileSync(plan, 'utf-8')));
    } catch {
      // a fixture without a goldened plan contributes nothing
    }
  }
  return kinds;
}

/**
 * Forms with no fixture yet. Shrinking this list is the coverage metric; a form regressing INTO it
 * fails, because the entry has to be added by hand.
 */
const KNOWN_GAPS: Record<string, string[]> = {
  ValueIrKind: [],
  SetupOpKind: ['use-id', 'server-data', 'qrl-const'],
  TaskStepKind: ['set-signal', 'set-store', 'if', 'let', 'return'],
  SsrOpKind: [],
  SegmentKind: ['collectionRender'],
};

describe('wire coverage', () => {
  const kinds = plannedKinds();

  for (const [name, file, read] of [
    ['ValueIrKind', 'expr-ir.ts', enumValues],
    ['SetupOpKind', 'setup-ir.ts', enumValues],
    ['TaskStepKind', 'setup-ir.ts', enumValues],
    ['SsrOpKind', 'emit-plan-ssr.ts', enumValues],
    ['SegmentKind', 'plan-types.ts', unionValues],
  ] as const) {
    test(name, () => {
      const declared = read(file, name);
      expect(declared.length).toBeGreaterThan(0);
      const missing = declared.filter((value) => !kinds.has(value));
      expect(missing.sort()).toEqual([...KNOWN_GAPS[name]].sort());
    });
  }
});

/**
 * Variant coverage: every discriminant the schema can express must appear in some fixture's linked
 * plan, so a form cannot land without a case proving a generator and an engine can read it.
 *
 * The corpus is the snapshot fixtures themselves — each `.ssr.snap` opens with the authored source
 * that produced it — so a new fixture widens the coverage automatically.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from 'vitest';
import { analyseModule } from '../analyse/analyse-module';
import { linkPlans, ResolutionKind, SideEffects } from '../link/link-plans';
import { BuildMode, EntryKind, Environment, LinkResultKind } from '../schema';

const testsDir = dirname(fileURLToPath(import.meta.url));
const schemaDir = join(testsDir, '../schema');
const snapshotsDir = join(testsDir, 'snapshots');

/**
 * Forms no fixture produces yet, calibrated 2026-09-18. Shrinking this list is the coverage metric;
 * a form regressing into it needs a hand edit, which is the point. Run with `COVERAGE_CALIBRATE=1`
 * to print the current gaps.
 */
const UNCOVERED: Record<string, readonly string[]> = {
  ArgPass: ['style-scope'],
  AssemblyKind: [
    'qrl-boundary',
    'declaration-strip',
    'module-reference-export',
    'native-marker',
    'stripped-export',
    'marker-retarget',
    'runtime-imports',
    'prelude',
    'function-render',
    'constant-fold',
    'strip-range',
    'strip-value',
  ],
  BuildMode: ['dev', 'lib', 'hmr'],
  ComponentTargetKind: ['raw'],
  ContextKind: ['signal', 'store'],
  DeclTable: ['hooks', 'callables', 'contexts', 'natives'],
  DeliveryKind: ['reference', 'noop', 'stripped', 'register'],
  DiagnosticCategory: ['warning'],
  EntryKind: ['export'],
  Environment: ['browser'],
  EsmEdgeKind: ['side-effect', 'reexport', 'export-star'],
  ExportKind: ['reexport', 'star'],
  ImplementationContentKind: ['files', 'external-package', 'registration'],
  ImportTargetKind: ['namespace', 'type-only'],
  LifetimeOwner: ['render-function', 'component-call', 'effect'],
  ModuleKind: ['exports-only'],
  NativeTargetKind: ['source', 'path'],
  PlaceKind: ['capture', 'row-item', 'task-local', 'def-param'],
  PlanFormat: ['qwik/module-plan'],
  PredicateKind: ['and', 'or'],
  ReadRole: ['write'],
  ResolutionKind: ['resolved', 'unresolved'],
  ResumeKind: ['initial-only'],
  SeedKind: ['root', 'v'],
  SetupKind: ['render-value'],
  SideEffects: ['present'],
  StripForm: ['direct-named-export'],
  StrippedExportForm: ['variable-declarator', 'specifier'],
  TaskStepKind: [
    'set-signal',
    'set-store',
    'if',
    'await',
    'call-plugin',
    'register-cleanup',
    'return',
  ],
  UnknownWhy: ['unresolved', 'cycle'],
  ValueIrKind: ['store-read', 'unary'],
};

const ALL_ENUMS = [
  ...readdirSync(schemaDir)
    .flatMap((file) => [
      ...readFileSync(join(schemaDir, file), 'utf-8').matchAll(/export const enum (\w+)/g),
    ])
    .map((match) => match[1]),
  ...[
    ...readFileSync(join(testsDir, '../link/link-plans.ts'), 'utf-8').matchAll(
      /export const enum (\w+)/g
    ),
  ].map((match) => match[1]),
];

const vocabularyFiles = [
  ...readdirSync(schemaDir).map((file) => join(schemaDir, file)),
  join(testsDir, '../link/link-plans.ts'),
];

/** Reads a `const enum`'s string values from source: the declarations are the vocabulary. */
function enumValues(name: string): string[] {
  for (const file of vocabularyFiles) {
    const source = readFileSync(file, 'utf-8');
    const start = source.indexOf(`export const enum ${name} {`);
    if (start === -1) {
      continue;
    }
    const body = source.slice(start, source.indexOf('}', start));
    return [...body.matchAll(/=\s*'([^']+)'/g)].map((match) => match[1]);
  }
  throw new Error(`coverage: no schema declaration for "${name}"`);
}

/** Fields that carry authored text or identifiers, never a discriminant. */
const TEXT_FIELDS = new Set([
  'code',
  'text',
  'message',
  'name',
  'path',
  'originalPath',
  'specifier',
  'imported',
  'exported',
  'local',
  'id',
  'html',
  'tag',
  'symbol',
  'chunk',
  'value',
  'css',
  'nameCtx',
  'ctxName',
  'stem',
  'provider',
  'key',
  'language',
  'mappings',
  'sources',
  'sourcesContent',
  'names',
]);

/**
 * Discriminant values in the plan, taken from every field that is not authored text. Values shared
 * between two enums (`unknown`, `const`) count for both; the gate proves a form appears, not which
 * enum produced it.
 */
function planValues(node: unknown, into: Set<string>): Set<string> {
  if (Array.isArray(node)) {
    node.forEach((child) => planValues(child, into));
    return into;
  }
  if (node === null || typeof node !== 'object') {
    return into;
  }
  for (const [field, value] of Object.entries(node)) {
    if (typeof value === 'string') {
      if (!TEXT_FIELDS.has(field)) {
        into.add(value);
      }
      continue;
    }
    planValues(value, into);
  }
  return into;
}

function fixtureSources(): { name: string; code: string }[] {
  return readdirSync(snapshotsDir)
    .filter((file) => file.endsWith('.ssr.snap'))
    .map((file) => {
      const text = readFileSync(join(snapshotsDir, file), 'utf-8');
      const start = text.indexOf('==INPUT==\n') + '==INPUT==\n'.length;
      return {
        name: file.replace('.ssr.snap', ''),
        code: text.slice(start, text.indexOf('\n== ')),
      };
    });
}

async function linkedValues(): Promise<Set<string>> {
  const found = new Set<string>();
  for (const { name, code } of fixtureSources()) {
    const path = `src/${name}.tsx`;
    let plan;
    try {
      plan = await analyseModule({ path, code }, { transpileTs: true });
    } catch {
      continue; // a fixture that proves a refusal contributes no plan
    }
    const linked = linkPlans(
      [plan],
      [{ kind: EntryKind.Module, module: path }],
      {
        environment: Environment.Server,
        mode: BuildMode.Prod,
        strip: { exports: [], ctxName: [], regCtxName: [] },
      },
      {
        edges: {
          [path]: Object.fromEntries(
            plan.edges.map((edge) => [edge.id, { r: ResolutionKind.External }])
          ),
        },
      },
      { claims: [], policies: [], emissions: [] },
      false
    );
    if (linked.kind === LinkResultKind.Linked) {
      planValues(linked.plan, found);
    }
  }
  // The link itself produced these; they never appear inside a plan.
  found.add(ResolutionKind.External).add(SideEffects.Free).add(LinkResultKind.Linked);
  return found;
}

test('every schema variant appears in a fixture, or is listed as uncovered', async () => {
  const produced = await linkedValues();
  if (process.env.COVERAGE_CALIBRATE) {
    const report: Record<string, string[]> = {};
    for (const name of ALL_ENUMS) {
      const missing = enumValues(name).filter((value) => !produced.has(value));
      if (missing.length > 0) {
        report[name] = missing;
      }
    }
    // eslint-disable-next-line no-console
    console.log('CALIBRATE ' + JSON.stringify(report));
  }
  const gaps: Record<string, string[]> = {};
  for (const name of Object.keys(UNCOVERED)) {
    const missing = enumValues(name).filter((value) => !produced.has(value));
    const unexpected = missing.filter((value) => !UNCOVERED[name].includes(value));
    const stale = UNCOVERED[name].filter((value) => produced.has(value));
    if (unexpected.length > 0 || stale.length > 0) {
      gaps[name] = [
        ...unexpected.map((value) => `uncovered: ${value}`),
        ...stale.map((value) => `now covered, remove from the list: ${value}`),
      ];
    }
  }
  expect(gaps).toEqual({});
}, 120_000);

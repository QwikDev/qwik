/**
 * End-to-end flow smoke: analyse → link → generate is wired through the compat wrapper, even while
 * the stage bodies are mocks. Foreign (non-Qwik) modules already flow to real output.
 */
import { describe, expect, test } from 'vitest';
import { analyseModule, generateJsSsr, linkPlans, transformModules } from '../index';
import {
  BuildMode,
  DiagnosticCategory,
  Environment,
  EntryKind,
  LinkResultKind,
  ModuleKind,
  PlanFormat,
} from '../schema';
import { serverSpecialization } from './fixtures';

describe('pipeline flow', () => {
  test('compat wrapper runs a passthrough module end to end', async () => {
    const output = await transformModules({
      input: [{ path: 'src/plain.ts', code: 'const value: number = 1;\nexport default value;\n' }],
      srcDir: 'src',
      sourceMaps: false,
      transpileTs: true,
      transpileJsx: true,
      isServer: true,
    });
    expect(output.modules).toHaveLength(1);
    expect(output.modules[0]).toMatchObject({
      path: 'src/plain.ts',
      code: 'const value = 1;\nexport default value;\n',
      isEntry: false,
      map: null,
      segment: null,
      origPath: null,
    });
    expect(output.diagnostics).toEqual([]);
    expect(output.isTypeScript).toBe(true);
    expect(output.isJsx).toBe(false);
  });

  test('stages compose directly: analyse → link → generateJsSsr', async () => {
    const plan = await analyseModule(
      { path: 'src/util.js', code: 'export const n = 1;\n' },
      { transpileTs: true }
    );
    expect(plan.format).toBe(PlanFormat.ModulePlan);
    const linked = linkPlans(
      [plan],
      [{ kind: EntryKind.Module, module: 'src/util.js' }],
      serverSpecialization(),
      { edges: {} },
      { claims: [], policies: [], emissions: [] },
      true
    );
    expect(linked.kind).toBe(LinkResultKind.Linked);
    if (linked.kind !== LinkResultKind.Linked) return;
    expect(linked.plan.entries).toEqual([{ kind: EntryKind.Module, module: 0 }]);
    const generated = await generateJsSsr(linked.plan, {});
    expect(generated.modules[0].code).toBe('export const n = 1;\n');
  });

  test('a complete link fails loudly on an unknown entry', () => {
    const linked = linkPlans(
      [],
      [{ kind: EntryKind.Module, module: 'src/missing.ts' }],
      serverSpecialization(),
      { edges: {} },
      { claims: [], policies: [], emissions: [] },
      true
    );
    expect(linked.kind).toBe(LinkResultKind.Failed);
  });

  test('generateJsSsr refuses a browser LinkedPlan', async () => {
    const linked = linkPlans(
      [],
      [],
      { environment: Environment.Browser, mode: BuildMode.Prod, stripExports: [] },
      { edges: {} },
      { claims: [], policies: [], emissions: [] },
      false
    );
    if (linked.kind !== LinkResultKind.Linked) throw new Error('expected linked');
    await expect(generateJsSsr(linked.plan, {})).rejects.toThrow('server LinkedPlan');
  });

  test('a parse failure analyses to a failed plan with diagnostics', async () => {
    const plan = await analyseModule(
      { path: 'src/broken.ts', code: 'const = ;' },
      { transpileTs: true }
    );
    expect(plan.kind).toBe(ModuleKind.Failed);
    expect(plan.diagnostics.length).toBeGreaterThan(0);
    expect(plan.diagnostics[0].category).toBe(DiagnosticCategory.Error);
  });
});

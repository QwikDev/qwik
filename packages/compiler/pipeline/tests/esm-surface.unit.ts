import { describe, expect, test } from 'vitest';
import { analyseModule } from '../analyse/analyse-module';
import { BindingScope, EsmEdgeKind, ExportKind, ExportTargetKind } from '../schema';

describe('ESM surface analysis', () => {
  test('records every static import independently from its consumer', async () => {
    const code = `import DefaultValue, { Child as RenamedChild, helper } from './dep';
import * as namespace from './namespace';
import type { Model } from './types';
import './setup';

export default () => <main></main>;
`;
    const plan = await analyseModule(
      {
        path: 'src/app.tsx',
        code,
      },
      { transpileTs: true }
    );

    expect(
      plan.edges.map(({ kind, specifier, typeOnly }) => ({ kind, specifier, typeOnly }))
    ).toEqual([
      { kind: EsmEdgeKind.Static, specifier: './dep', typeOnly: false },
      { kind: EsmEdgeKind.Static, specifier: './namespace', typeOnly: false },
      { kind: EsmEdgeKind.Static, specifier: './types', typeOnly: true },
      { kind: EsmEdgeKind.SideEffect, specifier: './setup', typeOnly: false },
    ]);
    expect(
      plan.imports.map((entry) => ({
        local: plan.bindings[entry.binding].name,
        scope: plan.bindings[entry.binding].scope,
        imported: entry.imported,
        specifier: plan.edges[entry.edge].specifier,
      }))
    ).toEqual([
      {
        local: 'DefaultValue',
        scope: BindingScope.Import,
        imported: 'default',
        specifier: './dep',
      },
      {
        local: 'RenamedChild',
        scope: BindingScope.Import,
        imported: 'Child',
        specifier: './dep',
      },
      {
        local: 'helper',
        scope: BindingScope.Import,
        imported: 'helper',
        specifier: './dep',
      },
      {
        local: 'namespace',
        scope: BindingScope.Import,
        imported: '*',
        specifier: './namespace',
      },
      {
        local: 'Model',
        scope: BindingScope.Import,
        imported: 'Model',
        specifier: './types',
      },
    ]);
    expect(plan.exports).toEqual([
      {
        e: ExportKind.Local,
        exported: 'default',
        target: { t: ExportTargetKind.Declaration, table: 'qrls', index: 0 },
      },
    ]);
    expect(plan.edges.map((edge) => edge.order)).toEqual([0, 1, 2, 3]);
    expect(code.slice(...plan.edges[0].authoredOwnerRange)).toContain('import DefaultValue');
  });

  test('records local exports, reexports, and export stars', async () => {
    const plan = await analyseModule(
      {
        path: 'src/exports.tsx',
        code: `const value = 1;
export { value as answer };
export { remote as renamed } from './dep';
export * from './more';
export const App = () => <main></main>;
`,
      },
      { transpileTs: true }
    );

    const answer = plan.exports.find(
      (entry) => entry.e === ExportKind.Local && entry.exported === 'answer'
    );
    expect(answer).toMatchObject({
      e: ExportKind.Local,
      target: { t: ExportTargetKind.Binding },
    });
    expect(plan.exports).toContainEqual({
      e: ExportKind.Reexport,
      exported: 'renamed',
      edge: 0,
      imported: 'remote',
    });
    expect(plan.exports).toContainEqual({ e: ExportKind.Star, edge: 1 });
    const app = plan.exports.find(
      (entry) => entry.e === ExportKind.Local && entry.exported === 'App'
    );
    expect(app).toMatchObject({
      e: ExportKind.Local,
      target: { t: ExportTargetKind.Binding },
    });
    expect(app?.e === ExportKind.Local && app.target.t === ExportTargetKind.Binding).toBe(true);
    if (app?.e !== ExportKind.Local || app.target.t !== ExportTargetKind.Binding) {
      return;
    }
    expect(app.target.binding).toBe(plan.qrls[0].declaration?.binding);
  });

  test('matches normalized imports by binding when sources repeat', async () => {
    const plan = await analyseModule(
      {
        path: 'src/app.tsx',
        code: `import { unused } from './dep';
import { Child as RenamedChild } from './dep';
export default () => <main><RenamedChild /></main>;
`,
      },
      { transpileTs: true }
    );

    expect(plan.edges[0].ownerRange).toEqual([0, 0]);
    expect(plan.edges[1].ownerRange[1]).toBeGreaterThan(plan.edges[1].ownerRange[0]);
    expect(plan.bindings[plan.imports[1].binding].name).toBe('RenamedChild');
  });
});

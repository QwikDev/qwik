import { describe, expect, test } from 'vitest';
import { analyseModule } from '../analyse/analyse-module';
import { linkPlans, ResolutionKind, SideEffects } from '../link/link-plans';
import {
  ComponentTargetKind,
  DeclTable,
  EntryKind,
  ImportTargetKind,
  LinkResultKind,
  OpKind,
  ProjectionKind,
  ProgramBodyKind,
  UnknownWhy,
} from '../schema';
import { deepFreeze, serverSpecialization } from './fixtures';

const plugins = { claims: [], policies: [], emissions: [] };

const resolved = (path: string) => ({
  r: ResolutionKind.Resolved as const,
  path,
  sideEffects: SideEffects.Free,
});

async function analyse(path: string, code: string) {
  return analyseModule({ path, code }, { transpileTs: true });
}

async function crossModulePlans() {
  const app = await analyseModule(
    {
      path: 'src/app.tsx',
      code: `import { Child as RenamedChild } from './child';
export default () => <main><RenamedChild /></main>;
`,
    },
    { transpileTs: true }
  );
  const child = await analyseModule(
    {
      path: 'src/child.tsx',
      code: `export const Child = () => <strong>child</strong>;
`,
    },
    { transpileTs: true }
  );
  return [app, child] as const;
}

describe('linkPlans', () => {
  test('links an aliased component import through the generic import table', async () => {
    const analysed = await crossModulePlans();
    const serialized = JSON.stringify(analysed);
    const plans = deepFreeze(JSON.parse(serialized) as typeof analysed);
    const result = linkPlans(
      plans,
      [{ kind: EntryKind.Export, module: 'src/app.tsx', export: 'default' }],
      serverSpecialization(),
      {
        edges: {
          'src/app.tsx': { 0: resolved('src/child.tsx') },
        },
      },
      plugins,
      true
    );

    expect(result.kind).toBe(LinkResultKind.Linked);
    if (result.kind !== LinkResultKind.Linked) {
      return;
    }
    const app = result.plan.modules[0];
    const target = { module: 1, table: DeclTable.Qrls, index: 0 };
    expect(result.plan.entries).toEqual([
      {
        kind: EntryKind.Export,
        module: 0,
        export: 'default',
        target: { ok: true, value: { module: 0, table: DeclTable.Qrls, index: 0 } },
      },
    ]);
    expect(app.imports).toEqual([
      {
        kind: ImportTargetKind.Declaration,
        source: plans[0].imports[0],
        target: { ok: true, value: target },
      },
    ]);
    expect(app.edges[0].runtime).toBe(true);
    const body = app.programs[0].body;
    expect(body.kind).toBe(ProgramBodyKind.Ops);
    if (body.kind !== ProgramBodyKind.Ops) {
      return;
    }
    const root = body.ops[0];
    expect(root.op).toBe(OpKind.Element);
    if (root.op !== OpKind.Element) {
      return;
    }
    expect(root.children[0]).toMatchObject({
      op: OpKind.Component,
      target: {
        t: ComponentTargetKind.Declaration,
        declaration: { ok: true, value: target },
      },
    });
    expect(JSON.stringify(plans)).toBe(serialized);
  });

  test('keeps unresolved imports typed in an incomplete link', async () => {
    const [app] = await crossModulePlans();
    const result = linkPlans(
      [app],
      [{ kind: EntryKind.Export, module: 'src/app.tsx', export: 'default' }],
      serverSpecialization(),
      { edges: {} },
      plugins,
      false
    );

    expect(result.kind).toBe(LinkResultKind.Linked);
    if (result.kind !== LinkResultKind.Linked) {
      return;
    }
    expect(result.plan.modules[0].imports[0]).toMatchObject({
      kind: ImportTargetKind.Declaration,
      target: { ok: false, reason: { why: UnknownWhy.Unresolved } },
    });
  });

  test('reports an unresolved reachable edge in a complete link', async () => {
    const [app] = await crossModulePlans();
    const result = linkPlans(
      [app],
      [{ kind: EntryKind.Export, module: 'src/app.tsx', export: 'default' }],
      serverSpecialization(),
      { edges: {} },
      plugins,
      true
    );

    expect(result).toEqual({
      kind: LinkResultKind.Failed,
      diagnostics: [
        {
          module: 'src/app.tsx',
          code: 'unresolved-edge',
          message: 'Unable to resolve "./child".',
        },
      ],
    });
  });

  test('rejects duplicate module paths deterministically', async () => {
    const [app] = await crossModulePlans();
    const result = linkPlans([app, app], [], serverSpecialization(), { edges: {} }, plugins, true);
    expect(result).toEqual({
      kind: LinkResultKind.Failed,
      diagnostics: [
        {
          module: 'src/app.tsx',
          code: 'duplicate-module',
          message: 'Module "src/app.tsx" was provided more than once.',
        },
      ],
    });
  });

  test.each([false, true])(
    'reports an invalid projection QRL in complete=%s mode',
    async (complete) => {
      const plan = await analyse(
        'src/app.tsx',
        `export const Wrapper = (props) => <section>{props.children}</section>;
export default () => <Wrapper><p>Projected</p></Wrapper>;
`
      );
      const component = plan.programs
        .flatMap((program) => (program.body.kind === ProgramBodyKind.Ops ? program.body.ops : []))
        .find((op) => op.op === OpKind.Component);
      expect(component?.op).toBe(OpKind.Component);
      if (component?.op !== OpKind.Component) {
        return;
      }
      const projection = component.projections[0];
      expect(projection.kind).toBe(ProjectionKind.Render);
      if (projection.kind !== ProjectionKind.Render) {
        return;
      }
      projection.use.qrl = 'missing';

      expect(
        linkPlans(
          [plan],
          [{ kind: EntryKind.Export, module: 'src/app.tsx', export: 'default' }],
          serverSpecialization(),
          { edges: {} },
          plugins,
          complete
        )
      ).toEqual({
        kind: LinkResultKind.Failed,
        diagnostics: [
          {
            module: 'src/app.tsx',
            code: 'invalid-qrl-reference',
            message: 'Projection references unknown QRL "missing".',
          },
        ],
      });
    }
  );

  test.each([false, true])(
    'reports an invalid slot fallback QRL in complete=%s mode',
    async (complete) => {
      const plan = await analyse(
        'src/app.tsx',
        `import { Slot } from '@qwik.dev/core';
export default () => <section><Slot><p>Fallback</p></Slot></section>;
`
      );
      const slot = plan.programs
        .flatMap((program) => (program.body.kind === ProgramBodyKind.Ops ? program.body.ops : []))
        .flatMap((op) => (op.op === OpKind.Element ? op.children : []))
        .find((op) => op.op === OpKind.Slot);
      expect(slot?.op).toBe(OpKind.Slot);
      if (slot?.op !== OpKind.Slot || slot.fallback === null) {
        return;
      }
      slot.fallback.qrl = 'missing';

      expect(
        linkPlans(
          [plan],
          [{ kind: EntryKind.Export, module: 'src/app.tsx', export: 'default' }],
          serverSpecialization(),
          { edges: {} },
          plugins,
          complete
        )
      ).toEqual({
        kind: LinkResultKind.Failed,
        diagnostics: [
          {
            module: 'src/app.tsx',
            code: 'invalid-qrl-reference',
            message: 'Slot fallback references unknown QRL "missing".',
          },
        ],
      });
    }
  );

  test('links default and namespace imports without consumer-specific logic', async () => {
    const app = await analyse(
      'src/app.tsx',
      `import Child from './child';
import * as helpers from './helpers';
import type { Model } from './types';
export default () => <main><Child /></main>;
`
    );
    const child = await analyse('src/child.tsx', 'export default () => <strong>child</strong>;\n');
    const helpers = await analyse('src/helpers.ts', 'export const value = 1;\n');
    const result = linkPlans(
      [app, child, helpers],
      [{ kind: EntryKind.Export, module: 'src/app.tsx', export: 'default' }],
      serverSpecialization(),
      {
        edges: {
          'src/app.tsx': {
            0: resolved('src/child.tsx'),
            1: resolved('src/helpers.ts'),
          },
        },
      },
      plugins,
      true
    );
    expect(result.kind).toBe(LinkResultKind.Linked);
    if (result.kind !== LinkResultKind.Linked) {
      return;
    }
    expect(result.plan.modules[0].imports.map((entry) => entry.kind)).toEqual([
      ImportTargetKind.Declaration,
      ImportTargetKind.Namespace,
      ImportTargetKind.TypeOnly,
    ]);
    expect(result.plan.modules[0].imports[1]).toMatchObject({
      kind: ImportTargetKind.Namespace,
      target: { ok: true, value: 2 },
    });
    expect(result.plan.modules[0].edges.map((edge) => edge.runtime)).toEqual([true, false, false]);
  });

  test.each([
    ['named reexport', `export { Child } from './child';\n`],
    ['export star', `export * from './child';\n`],
  ])('links through a %s', async (_name, barrelSource) => {
    const app = await analyse(
      'src/app.tsx',
      `import { Child } from './barrel';
export default () => <main><Child /></main>;
`
    );
    const barrel = await analyse('src/barrel.ts', barrelSource);
    const child = await analyse(
      'src/child.tsx',
      'export const Child = () => <strong>child</strong>;\n'
    );
    const result = linkPlans(
      [app, barrel, child],
      [{ kind: EntryKind.Export, module: 'src/app.tsx', export: 'default' }],
      serverSpecialization(),
      {
        edges: {
          'src/app.tsx': { 0: resolved('src/barrel.ts') },
          'src/barrel.ts': { 0: resolved('src/child.tsx') },
        },
      },
      plugins,
      true
    );
    expect(result.kind).toBe(LinkResultKind.Linked);
    if (result.kind !== LinkResultKind.Linked) {
      return;
    }
    expect(result.plan.modules[0].imports[0]).toMatchObject({
      target: {
        ok: true,
        value: { module: 2, table: DeclTable.Qrls, index: 0 },
      },
    });
    expect(result.plan.modules[1].edges[0].runtime).toBe(true);
  });

  test('reports cyclic export-star chains', async () => {
    const app = await analyse(
      'src/app.tsx',
      `import { Child } from './a';
export default () => <main><Child /></main>;
`
    );
    const a = await analyse('src/a.ts', `export * from './b';\n`);
    const b = await analyse('src/b.ts', `export * from './a';\n`);
    const result = linkPlans(
      [app, a, b],
      [{ kind: EntryKind.Export, module: 'src/app.tsx', export: 'default' }],
      serverSpecialization(),
      {
        edges: {
          'src/app.tsx': { 0: resolved('src/a.ts') },
          'src/a.ts': { 0: resolved('src/b.ts') },
          'src/b.ts': { 0: resolved('src/a.ts') },
        },
      },
      plugins,
      true
    );
    expect(result).toMatchObject({
      kind: LinkResultKind.Failed,
      diagnostics: [{ code: 'cyclic-export' }],
    });
  });

  test('reports ambiguous export-star chains', async () => {
    const app = await analyse(
      'src/app.tsx',
      `import { Child } from './barrel';
export default () => <main><Child /></main>;
`
    );
    const barrel = await analyse(
      'src/barrel.ts',
      `export * from './one';
export * from './two';
`
    );
    const one = await analyse('src/one.tsx', 'export const Child = () => <p>one</p>;\n');
    const two = await analyse('src/two.tsx', 'export const Child = () => <p>two</p>;\n');
    const result = linkPlans(
      [app, barrel, one, two],
      [{ kind: EntryKind.Export, module: 'src/app.tsx', export: 'default' }],
      serverSpecialization(),
      {
        edges: {
          'src/app.tsx': { 0: resolved('src/barrel.ts') },
          'src/barrel.ts': {
            0: resolved('src/one.tsx'),
            1: resolved('src/two.tsx'),
          },
        },
      },
      plugins,
      true
    );
    expect(result).toMatchObject({
      kind: LinkResultKind.Failed,
      diagnostics: [{ code: 'ambiguous-star-export' }],
    });
  });

  test('reports a missing export but accepts an external target', async () => {
    const [app, child] = await crossModulePlans();
    child.exports = [];
    const missing = linkPlans(
      [app, child],
      [{ kind: EntryKind.Export, module: 'src/app.tsx', export: 'default' }],
      serverSpecialization(),
      { edges: { 'src/app.tsx': { 0: resolved('src/child.tsx') } } },
      plugins,
      true
    );
    expect(missing).toMatchObject({
      kind: LinkResultKind.Failed,
      diagnostics: [{ code: 'missing-export' }],
    });

    const external = linkPlans(
      [app],
      [{ kind: EntryKind.Export, module: 'src/app.tsx', export: 'default' }],
      serverSpecialization(),
      { edges: { 'src/app.tsx': { 0: { r: ResolutionKind.External } } } },
      plugins,
      true
    );
    expect(external.kind).toBe(LinkResultKind.Linked);
  });

  test('does not reject an unresolved call outside the entry closure', async () => {
    const [unused] = await crossModulePlans();
    const entry = await analyse('src/entry.tsx', 'export default () => <main>entry</main>;\n');
    const result = linkPlans(
      [unused, entry],
      [{ kind: EntryKind.Export, module: 'src/entry.tsx', export: 'default' }],
      serverSpecialization(),
      { edges: {} },
      plugins,
      true
    );
    expect(result.kind).toBe(LinkResultKind.Linked);
  });
});

import { describe, expect, test } from 'vitest';
import { analyseModule } from '../analyse/analyse-module';
import { linkPlans, ResolutionKind, SideEffects, type ResolverSnapshot } from '../link/link-plans';
import { EntryKind, LinkResultKind, UnknownWhy, type LinkResult, type ModulePlan } from '../schema';
import { serverSpecialization } from './fixtures';

/** Each module's authored source; a specifier `./x` resolves to `src/x.ts`. */
type Sources = Record<string, string>;

async function analyseAll(sources: Sources): Promise<ModulePlan[]> {
  return Promise.all(
    Object.entries(sources).map(([name, code]) =>
      analyseModule({ path: `src/${name}.ts`, code }, { transpileTs: true })
    )
  );
}

function resolveRelative(plans: readonly ModulePlan[]): ResolverSnapshot {
  return {
    edges: Object.fromEntries(
      plans.map((plan) => [
        plan.path,
        Object.fromEntries(
          plan.edges.map((edge) => [
            edge.id,
            {
              r: ResolutionKind.Resolved,
              path: `src/${edge.specifier.slice(2)}.ts`,
              sideEffects: SideEffects.Free,
            },
          ])
        ),
      ])
    ),
  };
}

function permutations<T>(values: readonly T[]): T[][] {
  if (values.length <= 1) {
    return [[...values]];
  }
  return values.flatMap((value, index) =>
    permutations([...values.slice(0, index), ...values.slice(index + 1)]).map((rest) => [
      value,
      ...rest,
    ])
  );
}

function linked(result: LinkResult) {
  if (result.kind !== LinkResultKind.Linked) {
    throw new Error(`expected a linked plan: ${JSON.stringify(result.diagnostics)}`);
  }
  return result.plan;
}

/** Where every importer's first import lands, by path, for one module order. */
function importTargets(plans: readonly ModulePlan[], importers: readonly string[]) {
  const plan = linked(linkPlans(plans, [], serverSpecialization(), resolveRelative(plans), false));
  return Object.fromEntries(
    importers.map((importer) => {
      const module = plan.modules.find(
        (linkedModule) => linkedModule.path === `src/${importer}.ts`
      )!;
      const target = module.imports[0].target;
      return [importer, target.ok ? plan.modules[target.value.module].path : target.reason];
    })
  );
}

/** Links the modules in every order and expects one answer. */
async function expectEveryOrder(sources: Sources, expected: Record<string, unknown>) {
  const plans = await analyseAll(sources);
  for (const order of permutations(plans)) {
    expect(importTargets(order, Object.keys(expected))).toEqual(expected);
  }
}

/** Counts how often linking reads a module's exports, a proxy for resolution work. */
function countExportReads(plans: readonly ModulePlan[]) {
  let reads = 0;
  const counted = plans.map(
    (plan) =>
      new Proxy(plan, {
        get: (target, property, receiver) => {
          if (property === 'exports') {
            reads++;
          }
          return Reflect.get(target, property, receiver);
        },
      })
  );
  return { counted, exportReads: () => reads };
}

describe('export * resolution', () => {
  test('a star cycle resolves to the definition behind it whichever importer links first', async () => {
    await expectEveryOrder(
      {
        a: `export * from './b';\n`,
        b: `export * from './a';\nexport * from './c';\n`,
        c: `export const y = 1;\n`,
        usea: `import { y } from './a';\nexport const read = () => y;\n`,
        useb: `import { y } from './b';\nexport const read = () => y;\n`,
      },
      { usea: 'src/c.ts', useb: 'src/c.ts' }
    );
  });

  test('a circular named re-export is a cycle whichever importer links first', async () => {
    await expectEveryOrder(
      {
        a: `export { x } from './b';\n`,
        b: `export { x } from './a';\n`,
        usea: `import { x } from './a';\nexport const read = () => x;\n`,
        useb: `import { x } from './b';\nexport const read = () => x;\n`,
      },
      { usea: { why: UnknownWhy.Cycle }, useb: { why: UnknownWhy.Cycle } }
    );
  });

  test.each(['p', 'q', 'r'])(
    'a three-module star ring resolves to the definition in %s from every member',
    async (defining) => {
      const ring = { p: 'q', q: 'r', r: 'p' } as const;
      const sources: Sources = {};
      for (const [member, next] of Object.entries(ring)) {
        sources[member] =
          `export * from './${next}';\n` + (member === defining ? 'export const y = 1;\n' : '');
        sources[`use${member}`] =
          `import { y } from './${member}';\nexport const read = () => y;\n`;
      }
      await expectEveryOrder(sources, {
        usep: `src/${defining}.ts`,
        useq: `src/${defining}.ts`,
        user: `src/${defining}.ts`,
      });
    }
  );

  test('a star ring that defines nothing exports nothing', async () => {
    await expectEveryOrder(
      {
        a: `export * from './b';\n`,
        b: `export * from './a';\n`,
        usea: `import { y } from './a';\nexport const read = () => y;\n`,
      },
      { usea: { why: UnknownWhy.Opaque, code: 'missing-export' } }
    );
  });

  test('a star cycle that reaches two definitions is ambiguous from every member', async () => {
    await expectEveryOrder(
      {
        k: `export * from './j';\nexport * from './l';\n`,
        j: `export * from './k';\nexport * from './x';\n`,
        l: `export const y = 1;\n`,
        x: `export const y = 2;\n`,
        usek: `import { y } from './k';\nexport const read = () => y;\n`,
        usej: `import { y } from './j';\nexport const read = () => y;\n`,
      },
      {
        usek: { why: UnknownWhy.Opaque, code: 'ambiguous-star-export' },
        usej: { why: UnknownWhy.Opaque, code: 'ambiguous-star-export' },
      }
    );
  });

  test('a star cycle that reaches two unknowns reports the same one from every member', async () => {
    await expectEveryOrder(
      {
        k: `export * from './j';\nexport * from './gone';\n`,
        j: `export * from './k';\nexport * from './x';\n`,
        x: `export * as y from './z';\n`,
        z: `export const w = 1;\n`,
        usek: `import { y } from './k';\nexport const read = () => y;\n`,
        usej: `import { y } from './j';\nexport const read = () => y;\n`,
      },
      {
        usek: { why: UnknownWhy.Opaque, code: 'non-portable-export' },
        usej: { why: UnknownWhy.Opaque, code: 'non-portable-export' },
      }
    );
  });

  test('a named cycle behind a star is missing to the star importer and a cycle to a direct one', async () => {
    await expectEveryOrder(
      {
        a: `export * from './b';\n`,
        b: `export { x } from './c';\n`,
        c: `export { x } from './b';\n`,
        usea: `import { x } from './a';\nexport const read = () => x;\n`,
        useb: `import { x } from './b';\nexport const read = () => x;\n`,
      },
      {
        usea: { why: UnknownWhy.Opaque, code: 'missing-export' },
        useb: { why: UnknownWhy.Cycle },
      }
    );
  });

  /**
   * `m{i}` stars into a diamond `l{i}`/`r{i}` that both star into `m{i+1}`; the ring closes at
   * `m0`.
   */
  const ringOfDiamonds = (size: number, isClosed = true): Sources => {
    const sources: Sources = { def: 'export const y = 1;\n' };
    for (let index = 0; index < size; index++) {
      const next = isClosed ? (index + 1) % size : index + 1;
      sources[`m${index}`] =
        `export * from './l${index}';\nexport * from './r${index}';\n` +
        (index === size - 1 ? `export * from './def';\n` : '');
      const target = next === size ? 'def' : `m${next}`;
      sources[`l${index}`] = `export * from './${target}';\n`;
      sources[`r${index}`] = `export * from './${target}';\n`;
      sources[`use${index}`] = `import { y } from './m${index}';\nexport const read = () => y;\n`;
    }
    return sources;
  };

  test.each([12, 40])(
    'a ring of %i diamonds resolves from every member while reading each module a bounded number of times',
    async (size) => {
      const plans = await analyseAll(ringOfDiamonds(size));
      const { counted, exportReads } = countExportReads(plans);
      const importers = Array.from({ length: size }, (_, index) => `use${index}`);
      expect(importTargets(counted, importers)).toEqual(
        Object.fromEntries(importers.map((importer) => [importer, 'src/def.ts']))
      );
      // Each search walks the ring once; re-walking converging paths doubles per diamond.
      expect(exportReads()).toBeLessThan(4 * plans.length ** 2);
    }
  );

  test('a chain of diamonds without a cycle resolves each module once', async () => {
    const size = 40;
    const plans = await analyseAll(ringOfDiamonds(size, false));
    const { counted, exportReads } = countExportReads(plans);
    const importers = Array.from({ length: size }, (_, index) => `use${index}`);
    expect(importTargets(counted, importers)).toEqual(
      Object.fromEntries(importers.map((importer) => [importer, 'src/def.ts']))
    );
    expect(exportReads()).toBeLessThan(8 * plans.length);
  });

  test('a ring of two diamonds resolves the same in every importer order', async () => {
    const sources = ringOfDiamonds(2);
    for (const member of ['l0', 'r0', 'l1', 'r1']) {
      sources[`use${member}`] = `import { y } from './${member}';\nexport const read = () => y;\n`;
    }
    const plans = await analyseAll(sources);
    const importers = plans.filter((plan) => plan.path.startsWith('src/use'));
    const rest = plans.filter((plan) => !importers.includes(plan));
    const names = importers.map((plan) => plan.path.slice('src/'.length, -'.ts'.length));
    const expected = Object.fromEntries(names.map((name) => [name, 'src/def.ts']));
    // Only importers resolve anything, so their relative order is the whole module order.
    for (const order of permutations(importers)) {
      for (const others of [rest, [...rest].reverse()]) {
        expect(importTargets([...others, ...order], names)).toEqual(expected);
      }
    }
  });
});

describe('exposed exports of a barrel', () => {
  const barrel = (own = '') =>
    analyseAll({
      barrel: `export * from './a';\nexport * from './b';\n${own}`,
      a: `export const helper = 1;\nexport const onlyA = 2;\nexport default 3;\n`,
      b: `export const helper = 4;\n`,
    });
  const expose = (plans: readonly ModulePlan[]) =>
    linkPlans(
      plans,
      [{ kind: EntryKind.Module, module: 'src/barrel.ts', exposeExports: true }],
      serverSpecialization(),
      resolveRelative(plans),
      true
    );
  const exposedNames = (plans: readonly ModulePlan[]) =>
    linked(expose(plans)).entries.flatMap((entry) =>
      entry.kind === EntryKind.Export ? [entry.export] : []
    );

  test('leaves out a name two stars export ambiguously', async () => {
    expect(exposedNames(await barrel())).toEqual(['onlyA']);
  });

  test('lets an explicit export shadow the star exports of the same name', async () => {
    const plans = await barrel('export const helper = 5;\n');
    const plan = linked(expose(plans));
    expect(exposedNames(plans).sort()).toEqual(['helper', 'onlyA']);
    expect(
      plan.entries.find((entry) => entry.kind === EntryKind.Export && entry.export === 'helper')
    ).toMatchObject({ target: { ok: true, value: { module: 0 } } });
  });

  test('never star-exports a default export', async () => {
    const plans = [
      ...(await barrel()),
      ...(await analyseAll({
        app: `import value from './barrel';\nexport const read = () => value;\n`,
      })),
    ];
    expect(exposedNames(plans)).not.toContain('default');
    const plan = linked(
      linkPlans(plans, [], serverSpecialization(), resolveRelative(plans), false)
    );
    expect(plan.modules[3].imports[0].target).toEqual({
      ok: false,
      reason: { why: UnknownWhy.Opaque, code: 'missing-export' },
    });
  });
});

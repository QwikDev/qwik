import { describe, expect, test } from 'vitest';
import { analyseModule } from '../analyse/analyse-module';
import { linkPlans, ResolutionKind, SideEffects, type ResolverSnapshot } from '../link/link-plans';
import { LinkResultKind, UnknownWhy, type LinkResult, type ModulePlan } from '../schema';
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
});

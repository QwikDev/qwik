/**
 * Differential-oracle harness (DESIGN.md "Phases").
 *
 * Until cutover, the legacy pipeline (`../../src`) is the oracle: for every conformance fixture,
 * legacy and staged pipelines must produce field-identical full `TransformOutput`. Each vertical
 * slice turns its `test.todo` entries into live comparisons via `expectParity`; a slice is done
 * when its fixture family passes here AND the schema gates pass.
 */
import { describe, expect, test } from 'vitest';
import type { TransformModulesOptions } from '@qwik.dev/optimizer';
import { transformModules as legacyTransformModules } from '../../src/index';
import { transformModules as stagedTransformModules } from '../compat/transform-modules';

const baseOptions = {
  srcDir: 'src',
  sourceMaps: false,
  transpileTs: true,
  transpileJsx: true,
  isServer: true,
};

async function expectParity(path: string, code: string) {
  const options: TransformModulesOptions = { ...baseOptions, input: [{ path, code }] };
  const legacy = await legacyTransformModules(options);
  const staged = await stagedTransformModules(options);
  expect(staged).toEqual(legacy);
}

describe('differential oracle: staged pipeline vs legacy transformModules', () => {
  // The wrapper's foreign passthrough already matches the oracle byte-for-byte.
  test('foreign passthrough TypeScript module', () =>
    expectParity('src/plain.ts', 'const value: number = 1;\nexport default value;\n'));

  // Slice 1 — core render fixtures (analyse → link(complete) → generateJsSsr)
  test.todo('slice 1: static markup and elements');
  test.todo('slice 1: dynamic props, holes, events, bind, refs');
  test.todo('slice 1: component calls, projections, slots');
  test.todo('slice 1: branches (incl. build-constant conditions and residual isDev)');

  // Slice 2 — full JS coverage + CSR
  test.todo('slice 2: collections (array/reactive/derived, inline and chunk rows)');
  test.todo('slice 2: suspense, reveal, dynamic slots');
  test.todo('slice 2: styles, context, custom hooks, tasks');
  test.todo('slice 2: natives-as-JS, foreign modules, library mode');
  test.todo('slice 2: generateJsCsr against the same fixtures (browser LinkedPlan)');

  // Slice 3 — hosts
  test.todo(
    'slice 3: incomplete link during per-module transform matches legacy conservative output'
  );
  test.todo('slice 3: complete link at generateBundle produces the artifact');

  // Slice 4 — specialization depth
  test.todo('slice 4: recognition parity — segment/marker/id/subscription counts per mode');
  test.todo('slice 4: constants sweep across every payload carrier');

  // Slice 5 — native
  test.todo('slice 5: generateRustSsr shared should-generate corpus');
  test.todo('slice 5: generateRustSsr should-reject corpus (unsupported-variant error arms)');
});

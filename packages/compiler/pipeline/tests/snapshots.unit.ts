/**
 * Golden snapshots (DESIGN.md "Phases"): per conformance fixture one file under `snapshots/` in the
 * legacy suite's form — input, SSR output, CSR output. Files were seeded from the legacy oracle;
 * until the cutover deletes `../../src`, reseed the same way. Updates via `vitest -u` come from the
 * STAGED pipeline — review the diff against the fixture's intent before accepting.
 */
import { describe, expect, test } from 'vitest';
import type { TransformModulesOptions } from '@qwik.dev/optimizer';
import { transformModules } from '../compat/transform-modules';
import { SNAPSHOT_FIXTURES } from './snapshot-fixtures';
import { snapshotResult } from './snapshot-format';

describe('staged pipeline output snapshots', () => {
  for (const fixture of SNAPSHOT_FIXTURES) {
    test(fixture.name, async () => {
      const options = (isServer: boolean): TransformModulesOptions => ({
        srcDir: 'src',
        sourceMaps: false,
        transpileTs: true,
        transpileJsx: true,
        isServer,
        input: [{ path: fixture.path, code: fixture.code }],
      });
      const ssr = await transformModules(options(true));
      const csr = await transformModules(options(false));
      await expect(await snapshotResult(fixture.code, { ssr, csr })).toMatchFileSnapshot(
        `snapshots/${fixture.name}.snap`
      );
    });
  }

  test.todo('static markup and elements (declaration kinds, attributes, void tags, JSX text)');
  test.todo('JSX in a call argument lowers as an embedded function render');
  test.todo('JSX outside any candidate rejects with unsupported-runtime-jsx');
  test.todo('dynamic props, holes, events, bind, refs');
  test.todo('component calls, projections, slots');
  test.todo('branches (incl. build-constant conditions and residual isDev)');
  test.todo('collections (array/reactive/derived, inline and chunk rows)');
  test.todo('suspense, reveal, dynamic slots');
  test.todo('styles, context, custom hooks, tasks');
  test.todo('natives-as-JS, library mode');
  test.todo('incomplete link during per-module transform matches legacy conservative output');
  test.todo('complete link at generateBundle produces the artifact');
  test.todo('recognition parity — segment/marker/id/subscription counts per mode');
  test.todo('constants sweep across every payload carrier');
  test.todo('generateRustSsr shared should-generate corpus');
  test.todo('generateRustSsr should-reject corpus (unsupported-variant error arms)');
});

import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, test } from 'vitest';
import type { TransformModulesOptions } from '@qwik.dev/optimizer';
import { transformModules } from './index';
import { startPlanEmissionCoverage, stopPlanEmissionCoverage } from './emit-ssr';

/**
 * Plan-first JS emission coverage (specs/01 endgame: JS as a plan projection). Every fixture listed
 * here emits ALL its components from the wire plan — the shell goldens prove the bytes match the
 * direct path. Growing this list is the migration metric; a fixture regressing OUT of it fails
 * loudly. When every fixture is listed, the direct emission path can be deleted.
 */
const FULLY_PLAN_EMITTED = ['inner-html', 'static-attrs', 'static-page'];

const fixturesDir = join(dirname(fileURLToPath(import.meta.url)), '../conformance/layerA/fixtures');

describe('plan-first JS emission coverage', () => {
  for (const name of readdirSync(fixturesDir).sort()) {
    test(name, async () => {
      const dir = join(fixturesDir, name);
      const input = readdirSync(dir)
        .filter((file) => file.endsWith('.tsx'))
        .map((file) => ({ path: `src/${file}`, code: readFileSync(join(dir, file), 'utf-8') }));
      const coverage = startPlanEmissionCoverage();
      try {
        await transformModules({
          input,
          srcDir: 'src',
          sourceMaps: false,
          transpileTs: true,
          transpileJsx: true,
          isServer: true,
        } as TransformModulesOptions);
      } finally {
        stopPlanEmissionCoverage();
      }
      const fullyPlanned = coverage.fallback === 0 && coverage.plan > 0;
      expect(
        fullyPlanned,
        `${name}: ${coverage.plan} from plan, ${coverage.fallback} fallback`
      ).toBe(FULLY_PLAN_EMITTED.includes(name));
    });
  }
});

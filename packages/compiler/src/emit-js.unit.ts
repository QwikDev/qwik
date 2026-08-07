import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, test } from 'vitest';
import type { TransformModulesOptions } from '@qwik.dev/optimizer';
import { transformModules } from './index';
import { startJsGenCoverage, stopJsGenCoverage } from './emit-ssr';
import { readFixturePlugins } from '../conformance/layerA/harness';

/**
 * Production plan-first emission coverage: every fixture listed here emits ALL its components
 * through the JS generator during a real transform — the rendered goldens prove byte parity. A
 * fixture regressing OUT of this list fails loudly; when real-world modules join, the legacy
 * component tree-walker can be deleted.
 */
const FULLY_GENERATED = new Set([
  'branch-collection',
  'child-props',
  'class-object',
  'component-event-prop',
  'component-signal-identity',
  'component-spread-mixed',
  'component-spread-props',
  'component-spread-signal',
  'computed-task',
  'cond-attr',
  'context',
  'def-helper',
  'deferred-collection',
  'derived-collection',
  'implicit-dollar-call',
  'imported-callback',
  'inner-html',
  'local-component',
  'local-component-captured',
  'local-component-context',
  'local-component-props',
  'local-component-signal-props',
  'local-component-slots',
  'mixed-text',
  'multi-module',
  'plugin-call',
  'plugin-callback',
  'signal-counter',
  'slot-fallback',
  'slot-projection',
  'static-attrs',
  'static-page',
  'store-bind',
  'suspense-inline',
  'suspense-stream',
  'template-text',
  'use-styles',
  'visible-task',
  'visible-task-static',
]);

const fixturesDir = join(dirname(fileURLToPath(import.meta.url)), '../conformance/layerA/fixtures');

describe('production js-generator coverage', () => {
  for (const name of readdirSync(fixturesDir).sort()) {
    test(name, async () => {
      const dir = join(fixturesDir, name);
      const input = readdirSync(dir)
        .filter((file) => file.endsWith('.tsx'))
        .map((file) => ({ path: `src/${file}`, code: readFileSync(join(dir, file), 'utf-8') }));
      const plugins = readFixturePlugins(dir);
      const coverage = startJsGenCoverage();
      try {
        await transformModules({
          input,
          srcDir: 'src',
          sourceMaps: false,
          transpileTs: true,
          transpileJsx: true,
          isServer: true,
          ...(plugins.length > 0 ? { plugins } : {}),
        } as TransformModulesOptions);
      } finally {
        stopJsGenCoverage();
      }
      const fullyGenerated = coverage.fallback === 0 && coverage.generated > 0;
      expect(
        fullyGenerated,
        `${name}: ${coverage.generated} generated, ${coverage.fallback} fallback`
      ).toBe(FULLY_GENERATED.has(name));
    });
  }
});

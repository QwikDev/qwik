import { createHash } from 'node:crypto';
import { cpSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, test } from 'vitest';
import { emitJsModule } from '../../src/emit-js';
import { renderFixture, renderFixtureRoot, readFixtureRequest } from './harness';
import type { SsrRenderRoot } from '../../../qwik/src/server/ssr-render';

/**
 * JS-generator gate (specs/08): each listed fixture renders through a module GENERATED from the
 * wire plan (`emit-js`, the JS peer of `qwik-ssr-gen`) and must byte-match the same shell golden
 * the legacy emitter produces. Growing this list is the migration metric — when every fixture
 * renders from generated JS, the legacy source-replay emitter can be deleted.
 */
const READY_FIXTURES = [
  'static-page',
  'static-attrs',
  'inner-html',
  'signal-counter',
  'mixed-text',
  'template-text',
  'class-object',
  'cond-attr',
  'def-helper',
  'store-bind',
  'use-styles',
  'visible-task',
  'plugin-call',
  'computed-task',
  'child-props',
  'multi-module',
  'slot-projection',
  'slot-fallback',
  'context',
  'local-component-props',
  'local-component-signal-props',
  'local-component-slots',
  'local-component-context',
];

const layerADir = dirname(fileURLToPath(import.meta.url));

describe('layerA js-generator parity', () => {
  for (const name of READY_FIXTURES) {
    test(name, async () => {
      // renderFixture writes the segment chunk modules the generated module imports
      const { plan } = await renderFixture(name);
      const code = emitJsModule(plan);
      expect(code, `emit-js could not generate ${name}`).not.toBeNull();

      // the generated module STANDS IN as input.tsx in its own tree, so chunks that import
      // "./input" (defs, captures) resolve to generated exports — never the legacy module
      const entryName = plan.components[plan.entry].name;
      const standInDir = join(layerADir, '.generated-js', name);
      rmSync(standInDir, { recursive: true, force: true });
      cpSync(join(layerADir, '.generated', name), standInDir, { recursive: true });
      const file = join(standInDir, 'src', 'input.tsx');
      writeFileSync(file, code!);
      const version = createHash('sha256').update(code!).digest('hex').slice(0, 12);
      const module = await import(`./.generated-js/${name}/src/input.tsx?v=${version}`);
      const root = module[entryName] as SsrRenderRoot;
      expect(root, `generated module exports ${entryName}`).toBeDefined();

      const { html } = await renderFixtureRoot(root, readFixtureRequest(name));
      expect(html + '\n').toBe(
        readFileSync(join(layerADir, 'fixtures', name, 'expected', 'shell.html'), 'utf-8')
      );
    });
  }
});

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { relative } from 'node:path';
import { transformModule } from '../../src/optimizer/transform.js';

const QWIK_PACKAGES_DIR = '/Users/jackshelton/dev/open-source/qwik/packages';
const WORST_CASE = QWIK_PACKAGES_DIR + '/qwik/src/core/tests/component.spec.tsx';

describe('PROFILE', () => {
  it('deep timing', () => {
    const code = readFileSync(WORST_CASE, 'utf-8');
    const filePath = relative(QWIK_PACKAGES_DIR, WORST_CASE);
    const opts = {
      input: [{ path: filePath, code }],
      srcDir: QWIK_PACKAGES_DIR, rootDir: QWIK_PACKAGES_DIR,
      entryStrategy: { type: 'segment' as const }, minify: 'simplify' as const,
      transpileTs: true, transpileJsx: true,
      preserveFilenames: false, explicitExtensions: false, sourceMaps: false,
    };
    // Warmup
    transformModule(opts);
    // Measured
    process.env['PERF_TRACE'] = '1';
    transformModule(opts);
    process.env['PERF_TRACE'] = '0';
    expect(true).toBe(true);
  });
});

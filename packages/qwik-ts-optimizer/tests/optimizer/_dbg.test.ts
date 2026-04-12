/**
 * Debug: re-categorize and find near-passes
 */
import { describe, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseSnapshot } from '../../src/testing/snapshot-parser.js';
import { compareAst } from '../../src/testing/ast-compare.js';
import { transformModule } from '../../src/optimizer/transform.js';
import { getSnapshotFiles } from '../../src/testing/batch-runner.js';
import { getSnapshotTransformOptions } from './snapshot-options.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SNAP_DIR = join(__dirname, '../../match-these-snaps');

function getTestName(snapFilename: string): string {
  return snapFilename.replace('qwik_core__test__', '').replace('.snap', '');
}

describe('categorize', () => {
  it('dump', () => {
    const allFiles = getSnapshotFiles(SNAP_DIR);
    const segOnly: { name: string; badSegs: number; totalSegs: number }[] = [];

    for (const snapFile of allFiles) {
      const testName = getTestName(snapFile);
      const fullPath = join(SNAP_DIR, snapFile);
      const content = readFileSync(fullPath, 'utf-8');
      const parsed = parseSnapshot(content);
      if (!parsed.input) continue;

      const options = getSnapshotTransformOptions(testName, parsed.input);
      let result;
      try { result = transformModule(options); } catch { continue; }

      let parentMatches = true;
      if (parsed.parentModules.length > 0) {
        const ep = parsed.parentModules[0];
        const ap = result.modules[0];
        if (!ap) parentMatches = false;
        else parentMatches = compareAst(ep.code, ap.code, 'test.tsx').match;
      }
      if (!parentMatches) continue;

      let badSegs = 0;
      const totalSegs = parsed.segments.length;
      for (const es of parsed.segments) {
        if (!es.metadata) continue;
        const as2 = result.modules.find(m => m.segment && m.segment.name === es.metadata!.name);
        let ok = true;
        if (!as2) { ok = false; }
        else {
          if (as2.code && es.code && !compareAst(es.code, as2.code, 'test.tsx').match) ok = false;
          if (as2.segment && es.metadata) {
            const a = as2.segment, e = es.metadata;
            if (a.origin !== e.origin || a.name !== e.name || a.displayName !== e.displayName ||
                a.hash !== e.hash || a.canonicalFilename !== e.canonicalFilename ||
                a.ctxKind !== e.ctxKind || a.ctxName !== e.ctxName || a.captures !== e.captures) {
              ok = false;
            }
          }
        }
        if (!ok) badSegs++;
      }
      if (badSegs > 0) {
        segOnly.push({ name: testName, badSegs, totalSegs });
      }
    }

    segOnly.sort((a, b) => a.badSegs - b.badSegs);
    console.log(`\nSEG_ONLY (${segOnly.length}) ranked by difficulty:`);
    for (const r of segOnly) {
      console.log(`  ${r.badSegs}/${r.totalSegs} bad: ${r.name}`);
    }
  });
});

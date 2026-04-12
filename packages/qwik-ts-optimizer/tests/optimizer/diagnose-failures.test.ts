/**
 * Diagnostic: categorize convergence failures
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

describe('diagnose failures', () => {
  it('categorize', () => {
    const allFiles = getSnapshotFiles(SNAP_DIR);
    const failures: Array<{testName: string; reason: string; detail: string}> = [];

    for (const snapFile of allFiles) {
      const testName = snapFile.replace('qwik_core__test__', '').replace('.snap', '');
      const content = readFileSync(join(SNAP_DIR, snapFile), 'utf-8');
      const parsed = parseSnapshot(content);
      if (!parsed.input) continue;
      const options = getSnapshotTransformOptions(testName, parsed.input);
      let result: any;
      try { result = transformModule(options); } catch(e) { failures.push({testName, reason:'THROW', detail:String(e).slice(0,150)}); continue; }

      let parentFail = false, segFail = false, parentDiff = '', segDiff = '';
      if (parsed.parentModules.length > 0) {
        const exp = parsed.parentModules[0];
        const act = result.modules[0];
        if (!act) { parentFail = true; parentDiff = 'no actual parent'; }
        else {
          const r = compareAst(exp.code, act.code, exp.filename || 'test.tsx');
          if (!r.match) { parentFail = true; parentDiff = `len:${act.code.length}v${exp.code.length}`; }
        }
      }

      for (const expectedSeg of parsed.segments) {
        if (!expectedSeg.metadata) continue;
        const actualSeg = result.modules.find((m: any) => m.segment && m.segment.name === expectedSeg.metadata!.name);
        if (!actualSeg) { segFail = true; segDiff += `missing:${expectedSeg.metadata.name} `; continue; }
        if (actualSeg.code && expectedSeg.code) {
          const r = compareAst(expectedSeg.code, actualSeg.code, expectedSeg.filename || 'test.tsx');
          if (!r.match) { segFail = true; segDiff += `code:${expectedSeg.metadata.name} `; }
        }
        if (actualSeg.segment && expectedSeg.metadata) {
          const a = actualSeg.segment, e = expectedSeg.metadata;
          const mf: string[] = [];
          if (a.origin !== e.origin) mf.push('origin');
          if (a.name !== e.name) mf.push('name');
          if (a.displayName !== e.displayName) mf.push('displayName');
          if (a.hash !== e.hash) mf.push('hash');
          if (a.canonicalFilename !== e.canonicalFilename) mf.push('canonicalFilename');
          if (a.ctxKind !== e.ctxKind) mf.push('ctxKind');
          if (a.ctxName !== e.ctxName) mf.push('ctxName');
          if (a.captures !== e.captures) mf.push('captures');
          if (mf.length > 0) { segFail = true; segDiff += `meta(${mf.join(',')}):${expectedSeg.metadata.name} `; }
        }
      }

      if (parentFail || segFail) {
        failures.push({
          testName,
          reason: (parentFail ? 'PARENT ' : '') + (segFail ? 'SEGMENT ' : ''),
          detail: (parentDiff + ' ' + segDiff).trim().slice(0, 250)
        });
      }
    }

    // Group
    const groups: Record<string, string[]> = {};
    for (const f of failures) {
      const key = f.reason + '| ' + f.detail.replace(/:[a-zA-Z0-9_]+/g, ':*').replace(/len:\d+v\d+/g, 'len:*');
      if (!groups[key]) groups[key] = [];
      groups[key].push(f.testName);
    }
    console.log('\n=== FAILURE GROUPS (sorted by count) ===');
    for (const [pattern, tests] of Object.entries(groups).sort((a, b) => b[1].length - a[1].length)) {
      console.log(`\n[${tests.length}] ${pattern}`);
      for (const t of tests.slice(0, 8)) console.log(`  - ${t}`);
      if (tests.length > 8) console.log(`  ... and ${tests.length - 8} more`);
    }
  });
});

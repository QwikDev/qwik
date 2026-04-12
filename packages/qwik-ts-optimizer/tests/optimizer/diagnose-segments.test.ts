/**
 * Diagnose segment-only failures with actual code diffs
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

describe('diagnose segment-only failures', () => {
  it('analyze', () => {
    const allFiles = getSnapshotFiles(SNAP_DIR);
    const segOnlyFails: Array<{testName: string; segName: string; expSnippet: string; actSnippet: string}> = [];

    for (const snapFile of allFiles) {
      const testName = snapFile.replace('qwik_core__test__', '').replace('.snap', '');
      const content = readFileSync(join(SNAP_DIR, snapFile), 'utf-8');
      const parsed = parseSnapshot(content);
      if (!parsed.input) continue;
      const options = getSnapshotTransformOptions(testName, parsed.input);
      let result: any;
      try { result = transformModule(options); } catch { continue; }

      // Check parent OK
      let parentOk = true;
      if (parsed.parentModules.length > 0) {
        const exp = parsed.parentModules[0];
        const act = result.modules[0];
        if (!act) parentOk = false;
        else {
          const r = compareAst(exp.code, act.code, exp.filename || 'test.tsx');
          if (!r.match) parentOk = false;
        }
      }
      if (!parentOk) continue; // skip parent failures

      // Check segments
      for (const expectedSeg of parsed.segments) {
        if (!expectedSeg.metadata) continue;
        const actualSeg = result.modules.find((m: any) => m.segment && m.segment.name === expectedSeg.metadata!.name);
        if (!actualSeg) {
          segOnlyFails.push({testName, segName: expectedSeg.metadata.name, expSnippet: expectedSeg.code.slice(0, 200), actSnippet: '<MISSING>'});
          continue;
        }
        const r = compareAst(expectedSeg.code, actualSeg.code, expectedSeg.filename || 'test.tsx');
        if (!r.match) {
          segOnlyFails.push({testName, segName: expectedSeg.metadata.name, expSnippet: expectedSeg.code.slice(0, 300), actSnippet: actualSeg.code.slice(0, 300)});
        }
      }
    }

    // Categorize by pattern
    const categories: Record<string, string[]> = {};
    for (const f of segOnlyFails) {
      let cat = 'unknown';
      if (f.actSnippet === '<MISSING>') cat = 'missing_segment';
      else if (f.expSnippet.includes('_wrapProp') && !f.actSnippet.includes('_wrapProp')) cat = 'missing_wrapProp';
      else if (f.expSnippet.includes('_wrapSignal') && !f.actSnippet.includes('_wrapSignal')) cat = 'missing_wrapSignal';
      else if (f.expSnippet.includes('_fnSignal') && !f.actSnippet.includes('_fnSignal')) cat = 'missing_fnSignal';
      else if (f.expSnippet.includes('_chk') && !f.actSnippet.includes('_chk')) cat = 'missing_chk';
      else {
        // Check for body differences
        const expBody = f.expSnippet.split('\n').slice(2).join('\n').trim();
        const actBody = f.actSnippet.split('\n').slice(2).join('\n').trim();
        if (expBody === actBody) cat = 'import_only_diff';
        else cat = 'body_diff';
      }
      if (!categories[cat]) categories[cat] = [];
      categories[cat].push(`${f.testName}::${f.segName}`);
    }

    console.log('\n=== SEGMENT-ONLY FAILURE CATEGORIES ===');
    for (const [cat, items] of Object.entries(categories).sort((a, b) => b[1].length - a[1].length)) {
      console.log(`\n[${items.length}] ${cat}:`);
      for (const item of items.slice(0, 5)) console.log(`  - ${item}`);
      if (items.length > 5) console.log(`  ... and ${items.length - 5} more`);
    }

    // Show first few of each category in detail
    for (const f of segOnlyFails.slice(0, 3)) {
      console.log(`\n--- ${f.testName}::${f.segName} ---`);
      console.log('EXPECTED:', f.expSnippet);
      console.log('ACTUAL:', f.actSnippet);
    }
  });
});

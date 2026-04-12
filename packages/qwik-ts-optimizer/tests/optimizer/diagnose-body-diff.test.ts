/**
 * Drill into body_diff segment failures to find sub-patterns
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

describe('body diff drill-down', () => {
  it('sub-categorize', () => {
    const allFiles = getSnapshotFiles(SNAP_DIR);
    const bodyDiffs: Array<{testName: string; segName: string; exp: string; act: string}> = [];

    for (const snapFile of allFiles) {
      const testName = snapFile.replace('qwik_core__test__', '').replace('.snap', '');
      const content = readFileSync(join(SNAP_DIR, snapFile), 'utf-8');
      const parsed = parseSnapshot(content);
      if (!parsed.input) continue;
      const options = getSnapshotTransformOptions(testName, parsed.input);
      let result: any;
      try { result = transformModule(options); } catch { continue; }

      // Only segment-only failures
      let parentOk = true;
      if (parsed.parentModules.length > 0) {
        const exp = parsed.parentModules[0];
        const act = result.modules[0];
        if (!act) parentOk = false;
        else { const r = compareAst(exp.code, act.code, exp.filename || 'test.tsx'); if (!r.match) parentOk = false; }
      }
      if (!parentOk) continue;

      for (const expectedSeg of parsed.segments) {
        if (!expectedSeg.metadata) continue;
        const actualSeg = result.modules.find((m: any) => m.segment && m.segment.name === expectedSeg.metadata!.name);
        if (!actualSeg) continue;
        const r = compareAst(expectedSeg.code, actualSeg.code, expectedSeg.filename || 'test.tsx');
        if (!r.match) {
          bodyDiffs.push({testName, segName: expectedSeg.metadata.name, exp: expectedSeg.code, act: actualSeg.code});
        }
      }
    }

    // Sub-categorize
    const cats: Record<string, string[]> = {};
    for (const f of bodyDiffs) {
      const subCats: string[] = [];

      // Check for destructuring differences (bind: props)
      if (f.exp.includes('_wrapProp') && !f.act.includes('_wrapProp')) subCats.push('missing_wrapProp');
      if (f.exp.includes('_fnSignal') && !f.act.includes('_fnSignal')) subCats.push('missing_fnSignal');
      if (f.exp.includes('_chk') && !f.act.includes('_chk')) subCats.push('missing_chk');

      // Check for destructuring that shouldn't be there
      if (!f.exp.includes('const {') && f.act.includes('const {')) subCats.push('unwanted_destructuring');
      if (f.exp.includes('const {') && !f.act.includes('const {')) subCats.push('missing_destructuring');

      // Check for key differences
      const expKeyMatch = f.exp.match(/"[a-z0-9_]+"/g);
      const actKeyMatch = f.act.match(/"[a-z0-9_]+"/g);

      // Check for `this` keyword issues
      if (f.exp.includes('this') !== f.act.includes('this')) subCats.push('this_diff');

      // Check nested qrl declarations
      if (f.exp.includes('qrl(') && !f.act.includes('qrl(')) subCats.push('missing_nested_qrl');
      if (!f.exp.includes('qrl(') && f.act.includes('qrl(')) subCats.push('extra_nested_qrl');

      // Check for _jsxSorted differences
      const expJsx = (f.exp.match(/_jsxSorted/g) || []).length;
      const actJsx = (f.act.match(/_jsxSorted/g) || []).length;
      if (expJsx !== actJsx) subCats.push(`jsx_count_${expJsx}v${actJsx}`);

      // Check for props handling
      if (f.exp.includes('(props)') && f.act.includes('(props)')) {
        // Same props handling
      } else if (f.exp.includes('(props)') && !f.act.includes('(props)')) {
        subCats.push('missing_props_param');
      }

      // Check for export const vs just const
      if (f.exp.includes('export const') && !f.act.includes('export const')) subCats.push('missing_export');

      // Key counter
      const expKeys = f.exp.match(/"[a-z0-9]+_\d+"/g) || [];
      const actKeys = f.act.match(/"[a-z0-9]+_\d+"/g) || [];
      if (JSON.stringify(expKeys) !== JSON.stringify(actKeys)) subCats.push('key_diff');

      const cat = subCats.length > 0 ? subCats.sort().join('+') : 'other';
      if (!cats[cat]) cats[cat] = [];
      cats[cat].push(`${f.testName}::${f.segName}`);
    }

    console.log('\n=== BODY DIFF SUB-CATEGORIES ===');
    for (const [cat, items] of Object.entries(cats).sort((a, b) => b[1].length - a[1].length)) {
      console.log(`\n[${items.length}] ${cat}:`);
      for (const item of items.slice(0, 5)) console.log(`  - ${item}`);
      if (items.length > 5) console.log(`  ... and ${items.length - 5} more`);
    }
  });
});

/**
 * Check how many segment failures are due to captured declarations being left in the segment body
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

describe('capture analysis', () => {
  it('check _captures pattern', () => {
    const allFiles = getSnapshotFiles(SNAP_DIR);
    let hasCapturesIssue = 0;
    let noCapturesIssue = 0;
    const captureTests: string[] = [];
    const noCaptureTests: string[] = [];

    for (const snapFile of allFiles) {
      const testName = snapFile.replace('qwik_core__test__', '').replace('.snap', '');
      const content = readFileSync(join(SNAP_DIR, snapFile), 'utf-8');
      const parsed = parseSnapshot(content);
      if (!parsed.input) continue;
      const options = getSnapshotTransformOptions(testName, parsed.input);
      let result: any;
      try { result = transformModule(options); } catch { continue; }

      for (const expectedSeg of parsed.segments) {
        if (!expectedSeg.metadata) continue;
        const actualSeg = result.modules.find((m: any) => m.segment && m.segment.name === expectedSeg.metadata!.name);
        if (!actualSeg) continue;
        const r = compareAst(expectedSeg.code, actualSeg.code, expectedSeg.filename || 'test.tsx');
        if (!r.match) {
          if (actualSeg.code.includes('_captures')) {
            hasCapturesIssue++;
            captureTests.push(`${testName}::${expectedSeg.metadata.name}`);
          } else {
            noCapturesIssue++;
            noCaptureTests.push(`${testName}::${expectedSeg.metadata.name}`);
          }
        }
      }
    }

    console.log(`\nSegments with _captures in actual: ${hasCapturesIssue}`);
    console.log(`Segments without _captures in actual: ${noCapturesIssue}`);
    console.log('\nWith _captures:');
    for (const t of captureTests.slice(0, 10)) console.log(`  - ${t}`);
    console.log('\nWithout _captures (first 20):');
    for (const t of noCaptureTests.slice(0, 20)) console.log(`  - ${t}`);
  });

  it('check JSX attribute placement pattern', () => {
    const allFiles = getSnapshotFiles(SNAP_DIR);
    let jsxAttrIssue = 0;
    const jsxAttrTests: string[] = [];

    for (const snapFile of allFiles) {
      const testName = snapFile.replace('qwik_core__test__', '').replace('.snap', '');
      const content = readFileSync(join(SNAP_DIR, snapFile), 'utf-8');
      const parsed = parseSnapshot(content);
      if (!parsed.input) continue;
      const options = getSnapshotTransformOptions(testName, parsed.input);
      let result: any;
      try { result = transformModule(options); } catch { continue; }

      for (const expectedSeg of parsed.segments) {
        if (!expectedSeg.metadata) continue;
        const actualSeg = result.modules.find((m: any) => m.segment && m.segment.name === expectedSeg.metadata!.name);
        if (!actualSeg) continue;
        const r = compareAst(expectedSeg.code, actualSeg.code, expectedSeg.filename || 'test.tsx');
        if (!r.match) {
          // Check if expected has _jsxSorted(tag, {props}, ...) but actual has _jsxSorted(tag, null, {props}, ...)
          // or vice versa
          const expHasStaticAttrs = /(_jsxSorted\([^,]+,\s*null\s*,\s*\{)/.test(expectedSeg.code);
          const actHasStaticAttrs = /(_jsxSorted\([^,]+,\s*null\s*,\s*\{)/.test(actualSeg.code);
          const expHasDynAttrs = /(_jsxSorted\([^,]+,\s*\{)/.test(expectedSeg.code);
          const actHasDynAttrs = /(_jsxSorted\([^,]+,\s*\{)/.test(actualSeg.code);
          if ((expHasStaticAttrs !== actHasStaticAttrs) || (expHasDynAttrs !== actHasDynAttrs)) {
            jsxAttrIssue++;
            jsxAttrTests.push(`${testName}::${expectedSeg.metadata.name}`);
          }
        }
      }
    }

    console.log(`\nJSX attribute placement issues: ${jsxAttrIssue}`);
    for (const t of jsxAttrTests.slice(0, 15)) console.log(`  - ${t}`);
  });

  it('check _hf counter ordering', () => {
    const allFiles = getSnapshotFiles(SNAP_DIR);
    let hfOrderIssue = 0;
    const hfTests: string[] = [];

    for (const snapFile of allFiles) {
      const testName = snapFile.replace('qwik_core__test__', '').replace('.snap', '');
      const content = readFileSync(join(SNAP_DIR, snapFile), 'utf-8');
      const parsed = parseSnapshot(content);
      if (!parsed.input) continue;
      const options = getSnapshotTransformOptions(testName, parsed.input);
      let result: any;
      try { result = transformModule(options); } catch { continue; }

      for (const expectedSeg of parsed.segments) {
        if (!expectedSeg.metadata) continue;
        const actualSeg = result.modules.find((m: any) => m.segment && m.segment.name === expectedSeg.metadata!.name);
        if (!actualSeg) continue;
        const r = compareAst(expectedSeg.code, actualSeg.code, expectedSeg.filename || 'test.tsx');
        if (!r.match) {
          const expHf = [...expectedSeg.code.matchAll(/_hf(\d+)/g)].map(m => parseInt(m[1]));
          const actHf = [...actualSeg.code.matchAll(/_hf(\d+)/g)].map(m => parseInt(m[1]));
          if (expHf.length > 0 && actHf.length > 0 && JSON.stringify(expHf) !== JSON.stringify(actHf)) {
            hfOrderIssue++;
            hfTests.push(`${testName}::${expectedSeg.metadata.name} exp=[${expHf}] act=[${actHf}]`);
          }
        }
      }
    }

    console.log(`\n_hf counter order issues: ${hfOrderIssue}`);
    for (const t of hfTests.slice(0, 15)) console.log(`  - ${t}`);
  });

  it('check nested qrl order', () => {
    const allFiles = getSnapshotFiles(SNAP_DIR);
    let qrlOrderIssue = 0;
    const qrlTests: string[] = [];

    for (const snapFile of allFiles) {
      const testName = snapFile.replace('qwik_core__test__', '').replace('.snap', '');
      const content = readFileSync(join(SNAP_DIR, snapFile), 'utf-8');
      const parsed = parseSnapshot(content);
      if (!parsed.input) continue;
      const options = getSnapshotTransformOptions(testName, parsed.input);
      let result: any;
      try { result = transformModule(options); } catch { continue; }

      for (const expectedSeg of parsed.segments) {
        if (!expectedSeg.metadata) continue;
        const actualSeg = result.modules.find((m: any) => m.segment && m.segment.name === expectedSeg.metadata!.name);
        if (!actualSeg) continue;
        const r = compareAst(expectedSeg.code, actualSeg.code, expectedSeg.filename || 'test.tsx');
        if (!r.match) {
          const expQrls = [...expectedSeg.code.matchAll(/const q_([^\s=]+)/g)].map(m => m[1]);
          const actQrls = [...actualSeg.code.matchAll(/const q_([^\s=]+)/g)].map(m => m[1]);
          if (expQrls.length > 0 && actQrls.length > 0) {
            const expSet = new Set(expQrls);
            const actSet = new Set(actQrls);
            const same = expQrls.length === actQrls.length && expQrls.every(q => actSet.has(q));
            if (same && JSON.stringify(expQrls) !== JSON.stringify(actQrls)) {
              qrlOrderIssue++;
              qrlTests.push(`${testName}::${expectedSeg.metadata.name}`);
            }
          }
        }
      }
    }

    console.log(`\nNested QRL declaration order issues: ${qrlOrderIssue}`);
    for (const t of qrlTests.slice(0, 15)) console.log(`  - ${t}`);
  });
});

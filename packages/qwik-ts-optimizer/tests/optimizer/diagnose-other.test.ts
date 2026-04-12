/**
 * Show first diff line for 'other' category segment failures
 */
import { describe, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseSync } from 'oxc-parser';
import equal from 'fast-deep-equal';
import { parseSnapshot } from '../../src/testing/snapshot-parser.js';
import { compareAst } from '../../src/testing/ast-compare.js';
import { transformModule } from '../../src/optimizer/transform.js';
import { getSnapshotFiles } from '../../src/testing/batch-runner.js';
import { getSnapshotTransformOptions } from './snapshot-options.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SNAP_DIR = join(__dirname, '../../match-these-snaps');

function stripPos(node: any): any {
  if (Array.isArray(node)) return node.map(stripPos);
  if (node === null || typeof node !== 'object') return node;
  if (node.type === 'ParenthesizedExpression' && node.expression) return stripPos(node.expression);
  const c: Record<string, any> = {};
  for (const [k, v] of Object.entries(node)) {
    if (['start','end','loc','range','shorthand','typeAnnotation','returnType','typeParameters','typeArguments'].includes(k)) continue;
    if (k === 'raw' && (node.type === 'Literal' || node.type === 'JSXText')) continue;
    c[k] = stripPos(v);
  }
  return c;
}

function normalizeImports(program: any): void {
  if (!program?.body) return;
  let i = 0;
  while (i < program.body.length && program.body[i]?.type === 'ImportDeclaration') i++;
  if (i <= 1) return;
  const imports = program.body.slice(0, i);
  imports.sort((a: any, b: any) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
  program.body.splice(0, i, ...imports);
}

function findFirstDiff(expCode: string, actCode: string, filename: string): string {
  const expAst = stripPos(parseSync(filename, expCode).program);
  const actAst = stripPos(parseSync(filename, actCode).program);
  normalizeImports(expAst);
  normalizeImports(actAst);

  // Walk body statements and find first differing one
  const expBody = expAst?.body || [];
  const actBody = actAst?.body || [];
  for (let i = 0; i < Math.max(expBody.length, actBody.length); i++) {
    const e = expBody[i];
    const a = actBody[i];
    if (!equal(e, a)) {
      const etype = e?.type || 'missing';
      const atype = a?.type || 'missing';
      // Get a snippet
      const eLines = expCode.split('\n');
      const aLines = actCode.split('\n');
      return `stmt[${i}] ${etype}/${atype}: exp="${eLines.find(l => l.trim() && !l.startsWith('import'))?.trim().slice(0,80) || '?'}" act="${aLines.find(l => l.trim() && !l.startsWith('import'))?.trim().slice(0,80) || '?'}"`;
    }
  }
  return 'no diff found (length: ' + expBody.length + 'v' + actBody.length + ')';
}

describe('other category drill-down', () => {
  it('show first diff per test', () => {
    const allFiles = getSnapshotFiles(SNAP_DIR);
    const diffs: Array<{test: string; seg: string; diff: string}> = [];

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
          try {
            const diff = findFirstDiff(expectedSeg.code, actualSeg.code, expectedSeg.filename || 'test.tsx');
            diffs.push({test: testName, seg: expectedSeg.metadata.name, diff});
          } catch(e) {
            diffs.push({test: testName, seg: expectedSeg.metadata.name, diff: 'PARSE_ERROR: ' + String(e).slice(0,80)});
          }
        }
      }
    }

    // Group by diff pattern
    const groups: Record<string, string[]> = {};
    for (const d of diffs) {
      // Normalize the diff for grouping
      const key = d.diff.replace(/stmt\[\d+\]/g, 'stmt[N]').replace(/"[^"]{20,}"/g, '"..."').slice(0, 120);
      if (!groups[key]) groups[key] = [];
      groups[key].push(d.test);
    }

    console.log('\n=== FIRST-DIFF GROUPS ===');
    for (const [pattern, tests] of Object.entries(groups).sort((a, b) => b[1].length - a[1].length)) {
      console.log(`\n[${tests.length}] ${pattern}`);
      for (const t of tests.slice(0, 5)) console.log(`  - ${t}`);
      if (tests.length > 5) console.log(`  ... and ${tests.length - 5} more`);
    }

    // Show detailed diffs for first few
    console.log('\n=== DETAILED FIRST DIFFS ===');
    for (const d of diffs.slice(0, 10)) {
      console.log(`\n${d.test}::${d.seg}: ${d.diff}`);
    }
  });
});

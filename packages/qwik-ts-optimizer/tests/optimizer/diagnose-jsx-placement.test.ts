/**
 * Detailed look at JSX attribute placement issues
 */
import { describe, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseSnapshot } from '../../src/testing/snapshot-parser.js';
import { compareAst } from '../../src/testing/ast-compare.js';
import { transformModule } from '../../src/optimizer/transform.js';
import { getSnapshotTransformOptions } from './snapshot-options.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SNAP_DIR = join(__dirname, '../../match-these-snaps');

function show(testName: string) {
  const content = readFileSync(join(SNAP_DIR, `qwik_core__test__${testName}.snap`), 'utf-8');
  const parsed = parseSnapshot(content);
  if (!parsed.input) return;
  const options = getSnapshotTransformOptions(testName, parsed.input);
  const result = transformModule(options);
  for (const seg of parsed.segments) {
    if (!seg.metadata) continue;
    const actual = result.modules.find((m: any) => m.segment?.name === seg.metadata!.name);
    if (!actual) continue;
    const r = compareAst(seg.code, actual.code, seg.filename || 'test.tsx');
    if (!r.match) {
      // Find _jsxSorted call patterns
      const expJsx = [...seg.code.matchAll(/_jsxSorted\(([^)]{0,200})/g)].map(m => m[1].split(',').slice(0, 3).map(s => s.trim()).join(', '));
      const actJsx = [...actual.code.matchAll(/_jsxSorted\(([^)]{0,200})/g)].map(m => m[1].split(',').slice(0, 3).map(s => s.trim()).join(', '));
      console.log(`\n${testName}::${seg.metadata.name}`);
      console.log('  EXP jsx patterns:', expJsx.slice(0, 4));
      console.log('  ACT jsx patterns:', actJsx.slice(0, 4));
    }
  }
}

describe('jsx placement detail', () => {
  it('example_of_synchronous_qrl', () => show('example_of_synchronous_qrl'));
  it('example_jsx_listeners', () => show('example_jsx_listeners'));
  it('example_class_name', () => show('example_class_name'));
  it('example_getter_generation', () => show('example_getter_generation'));
});

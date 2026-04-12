/**
 * Debug: trace q:p injection for should_extract_single_qrl
 */
import { describe, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseSnapshot } from '../../src/testing/snapshot-parser.js';
import { transformModule } from '../../src/optimizer/transform.js';
import { getSnapshotTransformOptions } from './snapshot-options.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SNAP_DIR = join(__dirname, '../../match-these-snaps');

describe('q:p debug', () => {
  it('should_extract_single_qrl', () => {
    const fullPath = join(SNAP_DIR, 'qwik_core__test__should_extract_single_qrl.snap');
    const content = readFileSync(fullPath, 'utf-8');
    const parsed = parseSnapshot(content);
    if (!parsed.input) return;

    const options = getSnapshotTransformOptions('should_extract_single_qrl', parsed.input);
    const result = transformModule(options);

    // Dump all segments and their metadata
    for (const mod of result.modules) {
      if (mod.segment) {
        console.log(`\nSegment: ${mod.segment.name}`);
        console.log(`  ctxKind: ${mod.segment.ctxKind}`);
        console.log(`  captures: ${mod.segment.captures}`);
        console.log(`  code (first 200): ${mod.code.substring(0, 200)}`);
      }
    }
  });

  it('should_extract_single_qrl_2', () => {
    const fullPath = join(SNAP_DIR, 'qwik_core__test__should_extract_single_qrl_2.snap');
    const content = readFileSync(fullPath, 'utf-8');
    const parsed = parseSnapshot(content);
    if (!parsed.input) return;

    const options = getSnapshotTransformOptions('should_extract_single_qrl_2', parsed.input);
    const result = transformModule(options);

    for (const mod of result.modules) {
      if (mod.segment) {
        console.log(`\nSegment: ${mod.segment.name}`);
        console.log(`  ctxKind: ${mod.segment.ctxKind}`);
        console.log(`  captures: ${mod.segment.captures}`);
        console.log(`  code (first 300): ${mod.code.substring(0, 300)}`);
      }
    }
  });
});

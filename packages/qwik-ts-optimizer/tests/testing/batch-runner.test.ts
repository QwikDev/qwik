import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  getSnapshotFiles,
  getBatchFiles,
  runBatch,
  loadLockedSnapshots,
  saveLockedSnapshots,
  lockPassingSnapshots,
  type BatchConfig,
  type BatchResult,
} from '../../src/testing/batch-runner.js';
import { resolve } from 'node:path';

const SNAP_DIR = resolve(
  import.meta.dirname,
  '../../match-these-snaps',
);

describe('batch-runner', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'batch-runner-test-'));
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('getSnapshotFiles returns all 209 files', () => {
    const files = getSnapshotFiles(SNAP_DIR);
    expect(files).toHaveLength(209);
    for (const f of files) {
      expect(f).toMatch(/\.snap$/);
    }
  });

  it('getBatchFiles returns correct slice', () => {
    const files = getSnapshotFiles(SNAP_DIR);

    // First batch: 10 items
    const batch0 = getBatchFiles(files, 10, 0);
    expect(batch0).toHaveLength(10);
    expect(batch0[0]).toBe(files[0]);

    // Last batch: 209 - 200 = 9 items
    const batch20 = getBatchFiles(files, 10, 20);
    expect(batch20).toHaveLength(9);
    expect(batch20[0]).toBe(files[200]);
  });

  it('runBatch parses a batch without errors (default testFn)', () => {
    const config: BatchConfig = {
      snapshotDir: SNAP_DIR,
      batchSize: 10,
      batchIndex: 0,
    };
    const result = runBatch(config);
    expect(result.total).toBe(10);
    expect(result.passed).toBe(10);
    expect(result.failed).toBe(0);
    expect(result.results).toHaveLength(10);
  });

  it('runBatch with custom testFn that always fails', () => {
    const config: BatchConfig = {
      snapshotDir: SNAP_DIR,
      batchSize: 5,
      batchIndex: 0,
    };
    const result = runBatch(config, () => ({
      passed: false,
      error: 'intentional failure',
    }));
    expect(result.total).toBe(5);
    expect(result.passed).toBe(0);
    expect(result.failed).toBe(5);
    for (const r of result.results) {
      expect(r.passed).toBe(false);
      expect(r.error).toBe('intentional failure');
    }
  });

  it('lock file round-trip', () => {
    const lockFile = join(tmpDir, 'lock.json');
    const names = ['snap_a.snap', 'snap_b.snap', 'snap_c.snap'];
    saveLockedSnapshots(lockFile, names);
    const loaded = loadLockedSnapshots(lockFile);
    expect(loaded).toEqual(['snap_a.snap', 'snap_b.snap', 'snap_c.snap']);
  });

  it('lockPassingSnapshots appends without removing', () => {
    const lockFile = join(tmpDir, 'lock.json');

    // Simulate batch 0 result
    const batch0Result: BatchResult = {
      total: 3,
      passed: 2,
      failed: 1,
      results: [
        { file: 'a.snap', passed: true },
        { file: 'b.snap', passed: false, error: 'fail' },
        { file: 'c.snap', passed: true },
      ],
    };
    lockPassingSnapshots(lockFile, batch0Result);

    // Simulate batch 1 result
    const batch1Result: BatchResult = {
      total: 2,
      passed: 2,
      failed: 0,
      results: [
        { file: 'd.snap', passed: true },
        { file: 'e.snap', passed: true },
      ],
    };
    lockPassingSnapshots(lockFile, batch1Result);

    const locked = loadLockedSnapshots(lockFile);
    expect(locked).toContain('a.snap');
    expect(locked).toContain('c.snap');
    expect(locked).toContain('d.snap');
    expect(locked).toContain('e.snap');
    expect(locked).not.toContain('b.snap');
  });

  it('locked snapshots are skipped (testFn not called)', () => {
    const lockFile = join(tmpDir, 'lock.json');
    const allFiles = getSnapshotFiles(SNAP_DIR);
    const batch0Files = getBatchFiles(allFiles, 5, 0);

    // Lock first 3 files
    saveLockedSnapshots(lockFile, batch0Files.slice(0, 3));

    let testFnCallCount = 0;
    const config: BatchConfig = {
      snapshotDir: SNAP_DIR,
      batchSize: 5,
      batchIndex: 0,
      lockFile,
    };
    const result = runBatch(config, (_snapshot, _filename) => {
      testFnCallCount++;
      return { passed: true };
    });

    // 3 locked (skipped), 2 tested
    expect(testFnCallCount).toBe(2);
    expect(result.total).toBe(5);
    expect(result.passed).toBe(5);
  });

  it('full corpus parse test - all 209 snapshots parse', () => {
    const allFiles = getSnapshotFiles(SNAP_DIR);
    const totalBatches = Math.ceil(allFiles.length / 10);
    let totalPassed = 0;
    let totalFailed = 0;
    const failures: Array<{ file: string; error?: string }> = [];

    for (let i = 0; i < totalBatches; i++) {
      const config: BatchConfig = {
        snapshotDir: SNAP_DIR,
        batchSize: 10,
        batchIndex: i,
      };
      const result = runBatch(config);
      totalPassed += result.passed;
      totalFailed += result.failed;
      for (const r of result.results) {
        if (!r.passed) {
          failures.push({ file: r.file, error: r.error });
        }
      }
    }

    expect(failures).toEqual([]);
    expect(totalPassed).toBe(209);
    expect(totalFailed).toBe(0);
  });
});

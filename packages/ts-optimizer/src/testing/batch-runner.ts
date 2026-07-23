import { readFileSync, existsSync, writeFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { parseSnapshot, type ParsedSnapshot } from './snapshot-parser.js';

export interface SnapshotTestResult {
  file: string;
  passed: boolean;
  error?: string;
}

export interface BatchResult {
  total: number;
  passed: number;
  failed: number;
  results: SnapshotTestResult[];
}

export interface BatchConfig {
  snapshotDir: string;
  batchSize: number;
  batchIndex: number;
  lockFile?: string;
}

export function getSnapshotFiles(dir: string): string[] {
  return readdirSync(dir)
    .filter((f) => f.endsWith('.snap'))
    .sort();
}

export function getBatchFiles(files: string[], batchSize: number, batchIndex: number): string[] {
  const start = batchIndex * batchSize;
  return files.slice(start, start + batchSize);
}

export function loadLockedSnapshots(lockFile: string): string[] {
  if (!existsSync(lockFile)) return [];
  const content = readFileSync(lockFile, 'utf-8');
  return JSON.parse(content) as string[];
}

export function saveLockedSnapshots(lockFile: string, names: string[]): void {
  writeFileSync(lockFile, JSON.stringify([...new Set(names)].sort(), null, 2) + '\n');
}

export function runBatch(
  config: BatchConfig,
  testFn?: (snapshot: ParsedSnapshot, filename: string) => { passed: boolean; error?: string }
): BatchResult {
  const allFiles = getSnapshotFiles(config.snapshotDir);
  const batchFiles = getBatchFiles(allFiles, config.batchSize, config.batchIndex);
  const locked = config.lockFile ? loadLockedSnapshots(config.lockFile) : [];

  const results: SnapshotTestResult[] = [];

  for (const file of batchFiles) {
    if (locked.includes(file)) {
      results.push({ file, passed: true });
      continue;
    }

    try {
      const content = readFileSync(join(config.snapshotDir, file), 'utf-8');
      const snapshot = parseSnapshot(content);

      if (testFn) {
        const result = testFn(snapshot, file);
        results.push({ file, passed: result.passed, error: result.error });
      } else {
        results.push({ file, passed: true });
      }
    } catch (err) {
      results.push({ file, passed: false, error: String(err) });
    }
  }

  const passed = results.filter((r) => r.passed).length;
  return {
    total: results.length,
    passed,
    failed: results.length - passed,
    results,
  };
}

export function lockPassingSnapshots(lockFile: string, batchResult: BatchResult): void {
  const existing = loadLockedSnapshots(lockFile);
  const newlyPassing = batchResult.results.filter((r) => r.passed).map((r) => r.file);
  saveLockedSnapshots(lockFile, [...existing, ...newlyPassing]);
}

import { type ParsedSnapshot } from './snapshot-parser.js';
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
/**
 * Get all .snap filenames from a directory, sorted alphabetically.
 */
export declare function getSnapshotFiles(dir: string): string[];
/**
 * Get the list of snapshot filenames for a specific batch.
 * @param files - All snapshot filenames (sorted)
 * @param batchSize - Number of snapshots per batch
 * @param batchIndex - 0-based batch index
 * @returns Array of filenames in this batch
 */
export declare function getBatchFiles(files: string[], batchSize: number, batchIndex: number): string[];
/**
 * Load locked snapshot names from a lock file.
 * Returns empty array if file does not exist.
 */
export declare function loadLockedSnapshots(lockFile: string): string[];
/**
 * Save locked snapshot names to a lock file.
 */
export declare function saveLockedSnapshots(lockFile: string, names: string[]): void;
/**
 * Run a batch of snapshot tests.
 *
 * For Phase 1, this only validates that snapshots parse correctly.
 * In Phase 2+, a `testFn` callback will be provided that runs the
 * actual optimizer and compares output.
 *
 * @param config - Batch configuration
 * @param testFn - Optional test function per snapshot. If not provided, only validates parsing.
 * @returns BatchResult with pass/fail for each snapshot
 */
export declare function runBatch(config: BatchConfig, testFn?: (snapshot: ParsedSnapshot, filename: string) => {
    passed: boolean;
    error?: string;
}): BatchResult;
/**
 * Lock all passing snapshots from a batch result.
 * Appends to existing locked list (never removes).
 */
export declare function lockPassingSnapshots(lockFile: string, batchResult: BatchResult): void;
//# sourceMappingURL=batch-runner.d.ts.map
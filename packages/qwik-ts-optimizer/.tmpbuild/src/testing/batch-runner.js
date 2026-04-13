import { readFileSync, existsSync, writeFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { parseSnapshot } from './snapshot-parser.js';
/**
 * Get all .snap filenames from a directory, sorted alphabetically.
 */
export function getSnapshotFiles(dir) {
    return readdirSync(dir)
        .filter((f) => f.endsWith('.snap'))
        .sort();
}
/**
 * Get the list of snapshot filenames for a specific batch.
 * @param files - All snapshot filenames (sorted)
 * @param batchSize - Number of snapshots per batch
 * @param batchIndex - 0-based batch index
 * @returns Array of filenames in this batch
 */
export function getBatchFiles(files, batchSize, batchIndex) {
    const start = batchIndex * batchSize;
    return files.slice(start, start + batchSize);
}
/**
 * Load locked snapshot names from a lock file.
 * Returns empty array if file does not exist.
 */
export function loadLockedSnapshots(lockFile) {
    if (!existsSync(lockFile))
        return [];
    const content = readFileSync(lockFile, 'utf-8');
    return JSON.parse(content);
}
/**
 * Save locked snapshot names to a lock file.
 */
export function saveLockedSnapshots(lockFile, names) {
    writeFileSync(lockFile, JSON.stringify([...new Set(names)].sort(), null, 2) + '\n');
}
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
export function runBatch(config, testFn) {
    const allFiles = getSnapshotFiles(config.snapshotDir);
    const batchFiles = getBatchFiles(allFiles, config.batchSize, config.batchIndex);
    const locked = config.lockFile ? loadLockedSnapshots(config.lockFile) : [];
    const results = [];
    for (const file of batchFiles) {
        // Skip locked snapshots (they already passed)
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
            }
            else {
                // Default: just validate parsing succeeded
                results.push({ file, passed: true });
            }
        }
        catch (err) {
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
/**
 * Lock all passing snapshots from a batch result.
 * Appends to existing locked list (never removes).
 */
export function lockPassingSnapshots(lockFile, batchResult) {
    const existing = loadLockedSnapshots(lockFile);
    const newlyPassing = batchResult.results
        .filter((r) => r.passed)
        .map((r) => r.file);
    saveLockedSnapshots(lockFile, [...existing, ...newlyPassing]);
}
//# sourceMappingURL=batch-runner.js.map
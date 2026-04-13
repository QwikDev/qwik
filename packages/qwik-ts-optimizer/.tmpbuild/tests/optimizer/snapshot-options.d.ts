/**
 * Per-snapshot options map for the Qwik optimizer convergence test.
 *
 * Maps snapshot test names (without qwik_core__test__ prefix and .snap suffix)
 * to their exact TransformModulesOptions overrides. Options not specified
 * use the Rust test defaults:
 *   - transpileTs: false
 *   - transpileJsx: false
 *   - mode: 'lib' (Rust's EmitMode::Test maps to our 'lib')
 *   - entryStrategy: { type: 'segment' }
 *   - minify: 'simplify'
 *   - filename: 'test.tsx'
 *   - srcDir: '/user/qwik/src/'
 *   - explicitExtensions: false
 *   - preserveFilenames: false
 *   - isServer: undefined
 *
 * Sources:
 *   - Rust test.rs from QwikDev/qwik (main branch, 3677 lines)
 *   - Snapshot output file analysis (extension, inline indicators, JSX markers)
 *   - Additional tests inferred from snapshot content for tests not in downloaded test.rs
 *
 * CRITICAL: The Rust default mode is EmitMode::Test which has no direct equivalent
 * in our TS API. It behaves like 'lib' mode (no prod optimizations, no dev instrumentation).
 */
import type { TransformModulesOptions } from '../../src/optimizer/types.js';
/**
 * Options override for a single snapshot test.
 * Only non-default fields need to be specified.
 */
export type SnapshotOptions = Partial<Pick<TransformModulesOptions, 'transpileTs' | 'transpileJsx' | 'mode' | 'entryStrategy' | 'minify' | 'explicitExtensions' | 'preserveFilenames' | 'isServer' | 'stripExports' | 'stripCtxName' | 'regCtxName' | 'stripEventHandlers' | 'scope'>> & {
    /** Override filename (default: 'test.tsx') */
    filename?: string;
    /** Override srcDir (default: '/user/qwik/src/') */
    srcDir?: string;
    /** Override devPath */
    devPath?: string;
};
/**
 * Default options matching Rust's TestInput::default().
 * Every snapshot uses these unless overridden in SNAPSHOT_OPTIONS.
 */
export declare const DEFAULT_OPTIONS: Required<Pick<SnapshotOptions, 'transpileTs' | 'transpileJsx' | 'mode' | 'minify' | 'filename' | 'srcDir'>> & {
    entryStrategy: {
        type: 'segment';
    };
};
/**
 * Map from snapshot name to options overrides.
 * Key is the test name (e.g., 'example_1', not the full filename).
 */
export declare const SNAPSHOT_OPTIONS: Record<string, SnapshotOptions>;
/**
 * Get the full TransformModulesOptions for a snapshot test.
 * Merges per-snapshot overrides with defaults.
 */
export declare function getSnapshotTransformOptions(snapshotName: string, inputCode: string): TransformModulesOptions;
//# sourceMappingURL=snapshot-options.d.ts.map
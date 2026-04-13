/**
 * Const replacement module for the Qwik optimizer.
 *
 * Replaces isServer/isBrowser/isDev identifiers imported from Qwik packages
 * with boolean literals based on build configuration.
 */
import type MagicString from 'magic-string';
import type { ImportInfo } from './marker-detection.js';
export interface ConstReplacementResult {
    replacedCount: number;
}
/**
 * Replace isServer/isBrowser/isDev identifiers with boolean literals.
 * Only replaces identifiers that trace to actual Qwik package imports.
 * After replacement, removes the corresponding import bindings.
 */
export declare function replaceConstants(source: string, s: MagicString, program: any, importMap: Map<string, ImportInfo>, isServer?: boolean, isDev?: boolean): ConstReplacementResult;
//# sourceMappingURL=const-replacement.d.ts.map
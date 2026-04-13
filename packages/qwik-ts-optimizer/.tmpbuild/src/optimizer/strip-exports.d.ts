/**
 * Strip exports module for the Qwik optimizer.
 *
 * When the `stripExports` option specifies export names, their bodies are
 * replaced with a throw statement. Imports that become unused after stripping
 * are removed.
 */
import type MagicString from 'magic-string';
import type { ImportInfo } from './marker-detection.js';
export interface StripExportsResult {
    strippedNames: string[];
}
/**
 * Replace specified exports with throw statements and remove unused imports.
 */
export declare function stripExportDeclarations(source: string, s: MagicString, program: any, stripExports: string[], importMap: Map<string, ImportInfo>): StripExportsResult;
//# sourceMappingURL=strip-exports.d.ts.map
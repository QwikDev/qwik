/**
 * Variable migration analysis for the Qwik optimizer.
 *
 * Decides whether module-level declarations should be:
 * - **moved** into a segment (single-use, safe, not exported)
 * - **re-exported** as _auto_VARNAME (shared, exported, side-effects)
 * - **kept** at root (not used by any segment)
 */
export interface MigrationDecision {
    action: 'move' | 'reexport' | 'keep';
    varName: string;
    targetSegment?: string;
    reason: string;
}
export interface ModuleLevelDecl {
    name: string;
    declStart: number;
    declEnd: number;
    declText: string;
    isExported: boolean;
    hasSideEffects: boolean;
    isPartOfSharedDestructuring: boolean;
    kind: string;
}
export declare function collectModuleLevelDecls(program: any, source: string): ModuleLevelDecl[];
/**
 * Collect all locally-declared names within a given AST range.
 * These shadow outer-scope names and should not count as segment dependencies.
 */
export declare function collectLocalDeclarations(program: any, start: number, end: number): Set<string>;
/**
 * Batch version of collectLocalDeclarations: collects locals for all
 * extractions in a single AST walk instead of O(N) separate walks.
 */
export declare function collectAllLocalDeclarations(program: any, extractions: Array<{
    symbolName: string;
    argStart: number;
    argEnd: number;
}>): Map<string, Set<string>>;
/**
 * Attribute every identifier reference to either a segment or root scope.
 * Filters out locally-declared names within segments and declaration-site
 * identifiers at root level.
 */
export declare function computeSegmentUsage(program: any, extractions: Array<{
    symbolName: string;
    argStart: number;
    argEnd: number;
}>): {
    segmentUsage: Map<string, Set<string>>;
    rootUsage: Set<string>;
};
/**
 * Decision tree for each module-level declaration (order matters):
 * 1. exported + used by segment -> reexport
 * 2. exported + unused by segments -> keep
 * 3. used by root + segment -> reexport
 * 4. used by multiple segments -> reexport
 * 5. has side effects -> reexport
 * 6. shared destructuring -> reexport
 * 7. used by exactly one segment -> move
 * 8. unused by any segment -> keep
 */
export declare function analyzeMigration(decls: ModuleLevelDecl[], segmentUsage: Map<string, Set<string>>, rootUsage: Set<string>): MigrationDecision[];
//# sourceMappingURL=variable-migration.d.ts.map
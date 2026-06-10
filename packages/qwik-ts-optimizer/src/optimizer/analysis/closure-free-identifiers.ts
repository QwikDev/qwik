/**
 * Whole-program free-identifier analysis for extraction closures.
 *
 * Computes, for every tracked closure node, the identifiers referenced
 * inside it that do not resolve to a declaration within the closure's own
 * subtree — the same fact `getUndeclaredIdentifiersInFunction` derives,
 * but for ALL closures in two walks over the program instead of two walks
 * per closure. Consumers (capture analysis, C02 diagnostics, event-handler
 * capture promotion) read their slice from the returned map.
 *
 * The analysis itself is the free-identifier projection of the canonical
 * gather walk (`module-gather-walk.ts`); this wrapper keeps the
 * single-projection entry point for callers and tests that need only the
 * free-identifier map. Parity with the per-closure form is pinned by the
 * differential corpus test in
 * `tests/optimizer/analysis/closure-free-identifiers.test.ts`.
 */

import type { AstFunction } from '../../ast-types.js';
import type { AstProgram } from '../../ast-types.js';
import { gatherModuleFacts } from './module-gather-walk.js';

/**
 * For each closure node in `closureNodes`, compute the ordered, deduplicated
 * list of free identifiers (first-reference order, as the per-closure form
 * returns). Every tracked node gets an entry, possibly empty. Keyed by node
 * identity — stable across symbol renames (prod `s_<hash>`), unlike
 * symbol-name keys.
 */
export function computeClosureFreeIdentifiers(
  program: AstProgram,
  closureNodes: ReadonlyMap<string, AstFunction>,
): ReadonlyMap<AstFunction, readonly string[]> {
  if (closureNodes.size === 0) return new Map();
  return gatherModuleFacts({ program, closureNodes }).closureFreeIdentifiers;
}

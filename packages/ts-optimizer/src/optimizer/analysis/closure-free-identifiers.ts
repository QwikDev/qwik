import type { AstFunction } from '../../ast-types.js';
import type { AstProgram } from '../../ast-types.js';
import { gatherModuleFacts } from './module-gather-walk.js';

/**
 * For each closure in `closureNodes`, the identifiers referenced inside it that don't resolve to a
 * declaration in its own subtree — ordered by first reference, deduplicated, one entry per tracked
 * node (possibly empty). Keyed by node identity so the map survives the prod symbol rename.
 */
export function computeClosureFreeIdentifiers(
  program: AstProgram,
  closureNodes: ReadonlyMap<string, AstFunction>
): ReadonlyMap<AstFunction, readonly string[]> {
  if (closureNodes.size === 0) return new Map();
  return gatherModuleFacts({ program, closureNodes }).closureFreeIdentifiers;
}

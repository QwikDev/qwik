/**
 * `ScopeTracker` with a cursor-free declaration query.
 *
 * Upstream `getDeclaration(name)` resolves against the tracker's *current*
 * scope key — the walk cursor — by splitting the dash-joined index path and
 * probing each prefix from innermost to root (`oxc-walker`'s
 * `ScopeTracker.getDeclaration`). That couples resolution to replay time:
 * a consumer must be inside a walk, at the identifier's position, to ask
 * where a name resolves.
 *
 * `getDeclarationFromScope(name, scopeKey)` is the same prefix chain-walk
 * with the cursor made explicit. On a tracker built with
 * `preserveExitedScopes: true` and then frozen, the full scope tree is
 * retained, so the query returns — for any `(name, scopeKey)` pair — exactly
 * what `getDeclaration(name)` would have returned with the cursor at
 * `scopeKey`. This decouples resolution from traversal: a walk can buffer
 * `(name, getCurrentScope())` pairs and resolve them all post-walk, which is
 * what lets the tracker build *during* the gather walk instead of in a
 * standalone build walk before it.
 *
 * Equivalence against replay-time `getDeclaration` is pinned per fixture by
 * `tests/optimizer/analysis/scope-query-tracker.test.ts`.
 */

import { ScopeTracker } from 'oxc-walker';
import type { ScopeTrackerNode } from 'oxc-walker';

export class ScopeQueryTracker extends ScopeTracker {
  /**
   * Resolve `name` as if the walk cursor were at `scopeKey`.
   *
   * Mirrors upstream `getDeclaration` exactly (including the
   * `.map(Number)` round-trip on the split key), substituting `scopeKey`
   * for `this.scopeIndexKey`. The root scope's key is the empty string.
   */
  getDeclarationFromScope(name: string, scopeKey: string): ScopeTrackerNode | null {
    if (!scopeKey) {
      return this.scopes.get('')?.get(name) ?? null;
    }
    const indices = scopeKey.split('-').map(Number);
    for (let i = indices.length; i >= 0; i--) {
      const node = this.scopes.get(indices.slice(0, i).join('-'))?.get(name);
      if (node) {
        return node;
      }
    }
    return null;
  }
}

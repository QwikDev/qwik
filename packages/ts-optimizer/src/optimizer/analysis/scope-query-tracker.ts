/**
 * `ScopeTracker` with a cursor-free declaration query.
 *
 * Upstream `getDeclaration(name)` resolves against the tracker's current scope (the walk cursor),
 * coupling resolution to replay time. `getDeclarationFromScope` takes the cursor as an explicit
 * `scopeKey`: on a tracker built with `preserveExitedScopes: true` and then frozen, the full scope
 * tree is retained, so it returns for any `(name, scopeKey)` exactly what `getDeclaration` would
 * with the cursor there. This lets a walk buffer `(name, currentScope)` pairs and resolve them
 * post-walk — which is what lets the tracker build during the gather walk instead of in a pass
 * before it.
 */

import { ScopeTracker } from 'oxc-walker';
import type { ScopeTrackerNode } from 'oxc-walker';

export class ScopeQueryTracker extends ScopeTracker {
  /**
   * Resolve `name` as if the walk cursor were at `scopeKey`. The root scope's key is the empty
   * string.
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

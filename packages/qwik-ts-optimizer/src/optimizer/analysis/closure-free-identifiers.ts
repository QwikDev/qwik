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
 * Parity with the per-closure form is by construction: the same `walk`
 * visitation, the same `isBindingIdentifier` filter, and the same
 * `ScopeTracker` machinery (build-then-freeze, resolve during a second
 * walk) — generalized only in the resolution test, which becomes "does the
 * declaring scope sit inside this closure's subtree" instead of "is the
 * name declared at all in a closure-rooted tracker". Known quirks of the
 * per-closure form (e.g. identifiers in computed-member-property position
 * are never visited, so `arr[i]` does not surface `i`) reproduce
 * identically because the visitation is shared.
 */

import { ScopeTracker, isBindingIdentifier, walk } from 'oxc-walker';
import type { AstFunction, AstNode } from '../../ast-types.js';
import type { AstProgram } from '../../ast-types.js';

/**
 * Scope-key containment: is `scope` equal to or nested under `ancestor`?
 * Scope keys are dash-joined index paths (`"0-2-1"`); the root scope is
 * the empty string. Segment-wise comparison — a bare `startsWith` would
 * make `"0-11"` a child of `"0-1"`.
 */
function isScopeWithin(scope: string, ancestor: string): boolean {
  if (ancestor === '') return true;
  return scope === ancestor || scope.startsWith(`${ancestor}-`);
}

function isFunctionLike(node: AstNode): node is AstFunction {
  return (
    node.type === 'ArrowFunctionExpression' ||
    node.type === 'FunctionExpression' ||
    node.type === 'FunctionDeclaration'
  );
}

interface OpenClosure {
  readonly fn: AstFunction;
  readonly names: string[];
  readonly dedupe: Set<string>;
  /**
   * Scope key of the outermost scope this closure node pushes. A
   * `FunctionExpression` pushes an id-holding scope above its param scope,
   * so its own-name binding (`$(function g() { g(); })`) counts as
   * internal — matching the closure-rooted analysis, where that binding
   * lands inside the walked subtree.
   */
  readonly ownScope: string;
}

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
  const result = new Map<AstFunction, string[]>();
  const dedupes = new Map<AstFunction, Set<string>>();
  for (const fn of closureNodes.values()) {
    if (!result.has(fn)) {
      result.set(fn, []);
      dedupes.set(fn, new Set());
    }
  }
  if (result.size === 0) return result;

  const tracker = new ScopeTracker({ preserveExitedScopes: true });
  walk(program, { scopeTracker: tracker });
  tracker.freeze();

  const open: OpenClosure[] = [];

  walk(program, {
    scopeTracker: tracker,
    enter(node, parent) {
      const astNode = node as AstNode;
      if (isFunctionLike(astNode) && result.has(astNode)) {
        // The tracker has already pushed this node's scope(s) — its
        // processNodeEnter runs before this callback. Current key is the
        // innermost own scope; for FunctionExpression strip one segment
        // to reach the id-holding outer scope.
        const current = tracker.getCurrentScope();
        let ownScope = current;
        if (astNode.type === 'FunctionExpression') {
          const cut = current.lastIndexOf('-');
          ownScope = cut === -1 ? '' : current.slice(0, cut);
        }
        open.push({
          fn: astNode,
          names: result.get(astNode)!,
          dedupe: dedupes.get(astNode)!,
          ownScope,
        });
      }

      if (open.length === 0) return;
      if (astNode.type !== 'Identifier') return;
      if (isBindingIdentifier(node, parent)) return;

      const name = astNode.name;
      // Resolution is the expensive step (per-ancestor map lookups in the
      // tracker); skip it when every open closure already recorded this
      // name as free. Names not yet recorded must re-resolve at each
      // occurrence — shadowing can make the same name free at one
      // reference site and internal at another.
      let unresolvedRemains = false;
      for (const oc of open) {
        if (!oc.dedupe.has(name)) {
          unresolvedRemains = true;
          break;
        }
      }
      if (!unresolvedRemains) return;

      const decl = tracker.getDeclaration(name);
      for (const oc of open) {
        if (oc.dedupe.has(name)) continue;
        let free: boolean;
        if (decl === null) {
          // No declaration anywhere on the chain — global or unresolved.
          // Free in every enclosing closure, as in the per-closure form.
          free = true;
        } else if (decl.node === (oc.fn as unknown)) {
          // A FunctionDeclaration closure referencing its own name: the
          // closure-rooted tracker declares that name at its root scope,
          // so the per-closure form treats it as internal.
          free = false;
        } else {
          free = !isScopeWithin(decl.scope, oc.ownScope);
        }
        if (free) {
          oc.dedupe.add(name);
          oc.names.push(name);
        }
      }
    },
    leave(node) {
      if (open.length > 0 && open[open.length - 1].fn === (node as AstNode)) {
        open.pop();
      }
    },
  });

  return result;
}

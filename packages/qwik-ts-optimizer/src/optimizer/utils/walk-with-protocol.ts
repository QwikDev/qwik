/**
 * Compile-time-enforced enter/exit protocol for AST walks.
 *
 * `oxc-walker`'s `walk()` accepts a `{ enter, leave }` pair, but the library has no
 * mechanism to make enter-phase and leave-phase access distinct — both handlers
 * see the same closure-captured state, and a future hand reaching for
 * `s.overwrite(...)` from the enter handler produces nonsense output that looks
 * plausible (the silent-failure class `CODING_BEST_PRACTICES.md` warns against).
 *
 * `walkWithProtocol` is a thin wrapper that lets each walk site declare two
 * interface types:
 *
 *   - `EnterContext` — the read-restricted view available during enter.
 *   - `ExitContext extends EnterContext` — adds the act-helpers + `s` MagicString.
 *
 * The enter handler receives only `EnterContext`; calling `ctx.s.overwrite(...)`
 * from enter is a compile error because the type has no `s` field.
 *
 * Per the "Protocols are encoded in types" rule.
 */

import { walk } from 'oxc-walker';
import type { WalkerThisContextEnter, WalkerThisContextLeave } from 'oxc-walker';
import type { AstNode, AstProgram } from '../../ast-types.js';

export interface ProtocolHandlers<E extends object, X extends E> {
  enter(this: WalkerThisContextEnter, node: AstNode, parent: AstNode | null, ctx: E): void;
  leave(this: WalkerThisContextLeave, node: AstNode, parent: AstNode | null, ctx: X): void;
}

/**
 * Walk the AST with separate Enter and Exit context types.
 *
 * `enterCtx` and `exitCtx` may share underlying state via closure — the type
 * split is the discipline. The convention is to build `enterCtx` first as a
 * minimal view, then construct `exitCtx` by spreading `enterCtx` plus the
 * exit-only fields.
 *
 * The `this` context (oxc-walker's `skip` / `remove` / `replace`) is preserved
 * for both handlers.
 *
 * @param program The AST root to walk.
 * @param enterCtx The Enter view. Must be a subset of `exitCtx`.
 * @param exitCtx The Exit view. Extends Enter with act-helpers.
 * @param handlers The enter/leave handler pair.
 */
export function walkWithProtocol<E extends object, X extends E>(
  program: AstProgram,
  enterCtx: E,
  exitCtx: X,
  handlers: ProtocolHandlers<E, X>,
): void {
  walk(program, {
    enter(node, parent) {
      handlers.enter.call(this, node as AstNode, parent as AstNode | null, enterCtx);
    },
    leave(node, parent) {
      handlers.leave.call(this, node as AstNode, parent as AstNode | null, exitCtx);
    },
  });
}

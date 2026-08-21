/**
 * Enter and exit get distinct context types so the enter handler cannot reach edit helpers —
 * editing during enter yields plausible-but-wrong output.
 */

import { walk } from 'oxc-walker';
import type { ScopeTracker, WalkerThisContextEnter, WalkerThisContextLeave } from 'oxc-walker';
import type { AstNode, AstProgram } from '../../ast-types.js';

export interface ProtocolHandlers<E extends object, X extends E> {
  enter(this: WalkerThisContextEnter, node: AstNode, parent: AstNode | null, ctx: E): void;
  leave(this: WalkerThisContextLeave, node: AstNode, parent: AstNode | null, ctx: X): void;
}

export function walkWithProtocol<E extends object, X extends E>(
  program: AstProgram,
  enterCtx: E,
  exitCtx: X,
  handlers: ProtocolHandlers<E, X>,
  opts?: { readonly scopeTracker?: ScopeTracker }
): void {
  walk(program, {
    scopeTracker: opts?.scopeTracker,
    enter(node, parent) {
      handlers.enter.call(this, node as AstNode, parent as AstNode | null, enterCtx);
    },
    leave(node, parent) {
      handlers.leave.call(this, node as AstNode, parent as AstNode | null, exitCtx);
    },
  });
}

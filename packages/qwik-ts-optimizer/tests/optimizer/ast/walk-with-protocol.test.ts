/**
 * Unit tests for `src/optimizer/ast/walk-with-protocol.ts` — the
 * compile-time-enforced enter/exit protocol wrapper.
 *
 * Three layers of coverage:
 *
 *   1. **Behavioural parity** — the wrapper walks the AST identically to
 *      raw `oxc-walker.walk`: visits every node, enters before children,
 *      leaves after children, preserves `this.skip()` semantics.
 *
 *   2. **Context delivery** — enter handlers receive `enterCtx`; leave
 *      handlers receive `exitCtx`; both contexts may be backed by the
 *      same closure-captured mutable state, with the type split being
 *      the discipline (not a runtime barrier).
 *
 *   3. **Compile-time enforcement** — `@ts-expect-error` directives in
 *      type-only positions assert that a field present on `ExitContext`
 *      but absent from `EnterContext` cannot be accessed during the
 *      enter phase. If a future change widens `EnterContext` so an
 *      ExitContext-only field becomes accessible, these directives go
 *      red and TS surfaces the leak.
 */

import { describe, it, expect } from 'vitest';
import MagicString from 'magic-string';
import { parseWithRawTransfer } from '../../../src/optimizer/ast/parse.js';
import { walkWithProtocol } from '../../../src/optimizer/ast/walk-with-protocol.js';
import { walk } from 'oxc-walker';
import type { AstNode, AstProgram } from '../../../src/ast-types.js';

function parse(source: string): AstProgram {
  return parseWithRawTransfer('test.tsx', source).program;
}

describe('walkWithProtocol — behavioural parity with raw walk', () => {
  it('visits the same node types in the same order as raw walk', () => {
    const source = `const x = 1; function f(a) { return a + 1; }`;
    const program = parse(source);

    const rawOrder: string[] = [];
    walk(program, {
      enter(node) { rawOrder.push(`enter:${node.type}`); },
      leave(node) { rawOrder.push(`leave:${node.type}`); },
    });

    const wrappedOrder: string[] = [];
    walkWithProtocol(
      parse(source),
      {},
      {},
      {
        enter(node) { wrappedOrder.push(`enter:${node.type}`); },
        leave(node) { wrappedOrder.push(`leave:${node.type}`); },
      },
    );

    expect(wrappedOrder).toEqual(rawOrder);
  });

  it('produces enter-before-children-before-leave for nested nodes', () => {
    const source = `const x = { a: 1 };`;
    const trace: string[] = [];

    walkWithProtocol(
      parse(source),
      {},
      {},
      {
        enter(node) { trace.push(`enter:${node.type}`); },
        leave(node) { trace.push(`leave:${node.type}`); },
      },
    );

    // ObjectExpression's enter must precede Property's enter,
    // and Property's leave must precede ObjectExpression's leave.
    const objEnter = trace.indexOf('enter:ObjectExpression');
    const propEnter = trace.indexOf('enter:Property');
    const propLeave = trace.indexOf('leave:Property');
    const objLeave = trace.indexOf('leave:ObjectExpression');
    expect(objEnter).toBeGreaterThanOrEqual(0);
    expect(propEnter).toBeGreaterThan(objEnter);
    expect(propLeave).toBeGreaterThan(propEnter);
    expect(objLeave).toBeGreaterThan(propLeave);
  });

  it('preserves this.skip() — children of skipped nodes are not visited', () => {
    const source = `const x = { a: 1, b: { c: 2 } };`;
    const visited: string[] = [];

    walkWithProtocol(
      parse(source),
      {},
      {},
      {
        enter(node) {
          visited.push(node.type);
          // Skip the outer ObjectExpression's children.
          if (node.type === 'ObjectExpression') this.skip();
        },
        leave() { /* no-op */ },
      },
    );

    // ObjectExpression itself is visited; its Property children are not.
    expect(visited).toContain('ObjectExpression');
    expect(visited).not.toContain('Property');
  });

  it('threads the parent argument identically to raw walk', () => {
    const source = `const x = 1;`;
    const parentPairs: Array<[string, string | null]> = [];

    walkWithProtocol(
      parse(source),
      {},
      {},
      {
        enter(node, parent) {
          parentPairs.push([node.type, parent?.type ?? null]);
        },
        leave() {},
      },
    );

    // Program has no parent; VariableDeclaration's parent is Program;
    // VariableDeclarator's parent is VariableDeclaration; Literal's
    // parent is VariableDeclarator (via init).
    expect(parentPairs).toContainEqual(['Program', null]);
    expect(parentPairs).toContainEqual(['VariableDeclaration', 'Program']);
    expect(parentPairs).toContainEqual([
      'VariableDeclarator',
      'VariableDeclaration',
    ]);
  });
});

describe('walkWithProtocol — context delivery', () => {
  it('delivers enterCtx to enter, exitCtx to leave', () => {
    interface E { source: string; readonly enterMark: string; }
    interface X extends E { readonly exitMark: string; }

    const enterCtx: E = { source: 'src', enterMark: 'E' };
    const exitCtx: X = { ...enterCtx, exitMark: 'X' };

    const seen: string[] = [];
    walkWithProtocol(
      parse(`const x = 1;`),
      enterCtx,
      exitCtx,
      {
        enter(_node, _parent, ctx) {
          seen.push(`enter:${ctx.enterMark}`);
          // Type-only: ctx is `E` here, so `ctx.exitMark` does not exist.
          // (The @ts-expect-error suite below pins the compile-time check.)
        },
        leave(_node, _parent, ctx) {
          seen.push(`leave:${ctx.enterMark}|${ctx.exitMark}`);
        },
      },
    );

    expect(seen.filter((s) => s.startsWith('enter:'))).toContain('enter:E');
    expect(seen.filter((s) => s.startsWith('leave:'))).toContain('leave:E|X');
  });

  it('allows enter and leave to share underlying state via closure', () => {
    // The protocol enforces the *type split*, not the *state split*. Walks
    // that need enter to buffer information consumed by leave (the
    // buffer-on-enter pattern) work the same as raw walk: enter mutates shared state via
    // an enterCtx method that closes over it; leave reads via exitCtx.
    interface E { recordEnter(t: string): void; }
    interface X extends E { drain(): string[]; }

    const buffer: string[] = [];
    const enterCtx: E = { recordEnter: (t) => buffer.push(t) };
    const exitCtx: X = { ...enterCtx, drain: () => buffer.splice(0) };

    const drained: string[] = [];
    walkWithProtocol(
      parse(`const x = 1;`),
      enterCtx,
      exitCtx,
      {
        enter(node, _parent, ctx) { ctx.recordEnter(node.type); },
        leave(node, _parent, ctx) {
          if (node.type === 'Program') {
            drained.push(...ctx.drain());
          }
        },
      },
    );

    expect(drained).toContain('Program');
    expect(drained).toContain('VariableDeclaration');
  });
});

// Type-only assertions live in a function the test never invokes; they
// are still typechecked. The TS suppression directives below are the
// actual assertion — if the wrapper's type design ever lets EnterContext
// see ExitContext-only fields, the suppressions go unused and tsc fails
// the build.
function _typeOnlyProtocolEnforcement(): void {
  interface E { readonly source: string; }
  interface X extends E { readonly s: MagicString; }

  const enterCtx: E = { source: 'src' };
  const exitCtx: X = { ...enterCtx, s: new MagicString('src') };

  walkWithProtocol(
    {} as AstProgram,
    enterCtx,
    exitCtx,
    {
      enter(_node, _parent, ctx) {
        // ctx is `E`. Accessing `ctx.s` must be a compile error.
        // @ts-expect-error - `s` only exists on ExitContext
        ctx.s.overwrite(0, 1, 'y');

        // Sanity: `ctx.source` IS accessible (it's on E). No suppression.
        void ctx.source;
      },
      leave(_node, _parent, ctx) {
        // ctx is `X`. Accessing `ctx.s` must NOT be a compile error.
        void ctx.s;
        void ctx.source;
      },
    },
  );
}

describe('walkWithProtocol — compile-time enforcement', () => {
  it('keeps the type-only assertions reachable for tsc', () => {
    // The real assertion is the suppression directive in
    // `_typeOnlyProtocolEnforcement` above; this test exists so the
    // function is referenced and tsc doesn't strip it as dead code.
    expect(typeof _typeOnlyProtocolEnforcement).toBe('function');
  });
});

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
      enter(node) {
        rawOrder.push(`enter:${node.type}`);
      },
      leave(node) {
        rawOrder.push(`leave:${node.type}`);
      },
    });

    const wrappedOrder: string[] = [];
    walkWithProtocol(
      parse(source),
      {},
      {},
      {
        enter(node) {
          wrappedOrder.push(`enter:${node.type}`);
        },
        leave(node) {
          wrappedOrder.push(`leave:${node.type}`);
        },
      }
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
        enter(node) {
          trace.push(`enter:${node.type}`);
        },
        leave(node) {
          trace.push(`leave:${node.type}`);
        },
      }
    );

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
          if (node.type === 'ObjectExpression') this.skip();
        },
        leave() {
          /* no-op */
        },
      }
    );

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
      }
    );

    expect(parentPairs).toContainEqual(['Program', null]);
    expect(parentPairs).toContainEqual(['VariableDeclaration', 'Program']);
    expect(parentPairs).toContainEqual(['VariableDeclarator', 'VariableDeclaration']);
  });
});

describe('walkWithProtocol — context delivery', () => {
  it('delivers enterCtx to enter, exitCtx to leave', () => {
    interface E {
      source: string;
      readonly enterMark: string;
    }
    interface X extends E {
      readonly exitMark: string;
    }

    const enterCtx: E = { source: 'src', enterMark: 'E' };
    const exitCtx: X = { ...enterCtx, exitMark: 'X' };

    const seen: string[] = [];
    walkWithProtocol(parse(`const x = 1;`), enterCtx, exitCtx, {
      enter(_node, _parent, ctx) {
        seen.push(`enter:${ctx.enterMark}`);
      },
      leave(_node, _parent, ctx) {
        seen.push(`leave:${ctx.enterMark}|${ctx.exitMark}`);
      },
    });

    expect(seen.filter((s) => s.startsWith('enter:'))).toContain('enter:E');
    expect(seen.filter((s) => s.startsWith('leave:'))).toContain('leave:E|X');
  });

  it('allows enter and leave to share underlying state via closure', () => {
    interface E {
      recordEnter(t: string): void;
    }
    interface X extends E {
      drain(): string[];
    }

    const buffer: string[] = [];
    const enterCtx: E = { recordEnter: (t) => buffer.push(t) };
    const exitCtx: X = { ...enterCtx, drain: () => buffer.splice(0) };

    const drained: string[] = [];
    walkWithProtocol(parse(`const x = 1;`), enterCtx, exitCtx, {
      enter(node, _parent, ctx) {
        ctx.recordEnter(node.type);
      },
      leave(node, _parent, ctx) {
        if (node.type === 'Program') {
          drained.push(...ctx.drain());
        }
      },
    });

    expect(drained).toContain('Program');
    expect(drained).toContain('VariableDeclaration');
  });
});

function _typeOnlyProtocolEnforcement(): void {
  interface E {
    readonly source: string;
  }
  interface X extends E {
    readonly s: MagicString;
  }

  const enterCtx: E = { source: 'src' };
  const exitCtx: X = { ...enterCtx, s: new MagicString('src') };

  walkWithProtocol({} as AstProgram, enterCtx, exitCtx, {
    enter(_node, _parent, ctx) {
      // @ts-expect-error - `s` only exists on ExitContext
      ctx.s.overwrite(0, 1, 'y');

      void ctx.source;
    },
    leave(_node, _parent, ctx) {
      void ctx.s;
      void ctx.source;
    },
  });
}

describe('walkWithProtocol — compile-time enforcement', () => {
  it('keeps the type-only assertions reachable for tsc', () => {
    expect(typeof _typeOnlyProtocolEnforcement).toBe('function');
  });
});

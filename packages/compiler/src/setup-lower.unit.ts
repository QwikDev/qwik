import { describe, expect, test } from 'vitest';
import { lowerSetupOp, type SetupLowerFacts } from './setup-lower';
import type { AstNode } from './types';

/** Hand-built ESTree-shaped statements; bindings keyed by identifier start offset. */
const LOCAL = 1;
const SIGNAL_HOOK = 2;
const STORE_HOOK = 3;
const CONTEXT_HOOK = 4;
const PROVIDER_HOOK = 5;
const SERVER_DATA_HOOK = 6;
const USE_ID_HOOK = 7;
const CONSTANT_HOOK = 8;
const CONTEXT_ID = 9;
const USER_FN = 10;

const HOOK_NAMES: Record<number, string> = {
  [SIGNAL_HOOK]: 'useSignal',
  [STORE_HOOK]: 'useStore',
  [CONTEXT_HOOK]: 'useContext',
  [PROVIDER_HOOK]: 'useContextProvider',
  [SERVER_DATA_HOOK]: 'useServerData',
  [USE_ID_HOOK]: 'useId',
  [CONSTANT_HOOK]: 'useConstant',
};

const BINDINGS: Record<number, number> = {
  20: LOCAL,
  30: SIGNAL_HOOK,
  31: STORE_HOOK,
  32: CONTEXT_HOOK,
  33: PROVIDER_HOOK,
  34: SERVER_DATA_HOOK,
  35: USE_ID_HOOK,
  36: CONSTANT_HOOK,
  40: CONTEXT_ID,
  50: USER_FN,
};

const facts: SetupLowerFacts = {
  bindingIdAt: (range) => (range === null ? null : (BINDINGS[range[0]] ?? null)),
  isSourceBinding: () => false,
  isFunctionBinding: (binding) => binding === USER_FN,
  isHook: (callee, hook) => {
    const node = callee as AstNode & { start?: number };
    const binding = typeof node.start === 'number' ? BINDINGS[node.start] : undefined;
    return binding !== undefined && HOOK_NAMES[binding] === hook;
  },
};

const at = (start: number, node: object) => ({ start, end: start + 1, ...node });
const local = () => at(20, { type: 'Identifier', name: 'count' });
const hookIdent = (offset: number) => at(offset, { type: 'Identifier', name: 'hook' });
const lit = (value: unknown) => ({ type: 'Literal', value });
const constDecl = (init: object) =>
  ({
    type: 'VariableDeclaration',
    kind: 'const',
    declarations: [{ id: local(), init }],
  }) as unknown as AstNode;
const hookCall = (offset: number, args: unknown[] = []) => ({
  type: 'CallExpression',
  callee: hookIdent(offset),
  arguments: args,
});

describe('lowerSetupOp', () => {
  test('useSignal with and without initializer', () => {
    expect(lowerSetupOp(constDecl(hookCall(30, [lit(3)])), facts)).toEqual({
      op: 'signal',
      local: LOCAL,
      init: { k: 'lit', v: 3 },
    });
    expect(lowerSetupOp(constDecl(hookCall(30)), facts)).toEqual({
      op: 'signal',
      local: LOCAL,
      init: { k: 'undef' },
    });
  });

  test('useStore single lowerable argument only', () => {
    expect(
      lowerSetupOp(
        constDecl(
          hookCall(31, [
            {
              type: 'ObjectExpression',
              properties: [
                {
                  type: 'Property',
                  kind: 'init',
                  computed: false,
                  key: { type: 'Identifier', name: 'items' },
                  value: { type: 'ArrayExpression', elements: [] },
                },
              ],
            },
          ])
        ),
        facts
      )
    ).toEqual({
      op: 'store',
      local: LOCAL,
      init: { k: 'object', entries: [['items', { k: 'array', items: [] }]] },
      deep: true,
    });
    // options bag stays verbatim
    expect(
      lowerSetupOp(
        constDecl(hookCall(31, [{ type: 'ObjectExpression', properties: [] }, lit(true)])),
        facts
      )
    ).toBeNull();
  });

  test('plain const, useConstant, useId, useContext, useServerData', () => {
    expect(lowerSetupOp(constDecl(lit('x')), facts)).toEqual({
      op: 'const',
      local: LOCAL,
      init: { k: 'lit', v: 'x' },
    });
    expect(lowerSetupOp(constDecl(hookCall(36, [lit(5)])), facts)).toEqual({
      op: 'const',
      local: LOCAL,
      init: { k: 'lit', v: 5 },
    });
    expect(lowerSetupOp(constDecl(hookCall(35)), facts)).toEqual({ op: 'use-id', local: LOCAL });
    expect(lowerSetupOp(constDecl(hookCall(35, [lit(1)])), facts)).toBeNull();
    expect(
      lowerSetupOp(constDecl(hookCall(32, [at(40, { type: 'Identifier', name: 'Ctx' })])), facts)
    ).toEqual({ op: 'context-read', local: LOCAL, context: CONTEXT_ID });
    expect(lowerSetupOp(constDecl(hookCall(34, [lit('locale'), lit('en')])), facts)).toEqual({
      op: 'server-data',
      local: LOCAL,
      key: { k: 'lit', v: 'locale' },
      fallback: { k: 'lit', v: 'en' },
    });
  });

  test('useContextProvider as expression statement', () => {
    expect(
      lowerSetupOp(
        {
          type: 'ExpressionStatement',
          expression: hookCall(33, [at(40, { type: 'Identifier', name: 'Ctx' }), lit('value')]),
        } as unknown as AstNode,
        facts
      )
    ).toEqual({ op: 'context-provider', context: CONTEXT_ID, value: { k: 'lit', v: 'value' } });
  });

  test('unsupported statements stay verbatim', () => {
    // user hook call
    expect(lowerSetupOp(constDecl(hookCall(50, [lit(1)])), facts)).toBeNull();
    // let declaration
    expect(
      lowerSetupOp(
        {
          type: 'VariableDeclaration',
          kind: 'let',
          declarations: [{ id: local(), init: lit(1) }],
        } as unknown as AstNode,
        facts
      )
    ).toBeNull();
    // destructuring
    expect(
      lowerSetupOp(
        {
          type: 'VariableDeclaration',
          kind: 'const',
          declarations: [{ id: { type: 'ObjectPattern' }, init: lit(1) }],
        } as unknown as AstNode,
        facts
      )
    ).toBeNull();
    // unlowerable signal initializer fails the whole statement
    expect(
      lowerSetupOp(
        constDecl(
          hookCall(30, [
            {
              type: 'CallExpression',
              callee: at(50, { type: 'Identifier', name: 'f' }),
              arguments: [],
            },
          ])
        ),
        facts
      )
    ).toBeNull();
  });
});

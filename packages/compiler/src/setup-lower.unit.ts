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
  [11]: 'useComputed$',
  [12]: 'useTask$',
  [13]: 'useVisibleTask$',
};

const COMPUTED_HOOK = 11;
const TASK_HOOK = 12;
const VISIBLE_TASK_HOOK = 13;
const SIGNAL_BINDING = 14;
const STORE_BINDING = 15;

const BINDINGS: Record<number, number> = {
  20: LOCAL,
  30: SIGNAL_HOOK,
  31: STORE_HOOK,
  32: CONTEXT_HOOK,
  33: PROVIDER_HOOK,
  34: SERVER_DATA_HOOK,
  35: USE_ID_HOOK,
  36: CONSTANT_HOOK,
  37: COMPUTED_HOOK,
  38: TASK_HOOK,
  39: VISIBLE_TASK_HOOK,
  40: CONTEXT_ID,
  50: USER_FN,
  60: SIGNAL_BINDING,
  61: STORE_BINDING,
};

const facts: SetupLowerFacts = {
  bindingIdAt: (range) => (range === null ? null : (BINDINGS[range[0]] ?? null)),
  isSourceBinding: (binding) => binding === SIGNAL_BINDING,
  isFunctionBinding: (binding) => binding === USER_FN,
  isHook: (callee, hook) => {
    const node = callee as AstNode & { start?: number };
    const binding = typeof node.start === 'number' ? BINDINGS[node.start] : undefined;
    return binding !== undefined && HOOK_NAMES[binding] === hook;
  },
  findQrlSegmentId: (range) => (range !== null && range[0] === 100 ? 'segment_0' : null),
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

  test('useComputed$ pairs the segment with a portable body when single-expression', () => {
    const signalRef = () => at(60, { type: 'Identifier', name: 'count' });
    const arrow = (body: object) =>
      at(100, { type: 'ArrowFunctionExpression', params: [], body, end: 120 });
    expect(
      lowerSetupOp(
        constDecl(
          hookCall(37, [
            arrow({
              type: 'BinaryExpression',
              operator: '*',
              left: {
                type: 'MemberExpression',
                object: signalRef(),
                property: { type: 'Identifier', name: 'value' },
                computed: false,
              },
              right: lit(2),
            }),
          ])
        ),
        facts
      )
    ).toEqual({
      op: 'computed',
      local: LOCAL,
      segment: 'segment_0',
      body: {
        k: 'bin',
        op: '*',
        a: { k: 'signal-read', binding: SIGNAL_BINDING },
        b: { k: 'lit', v: 2 },
      },
    });
    // multi-statement computed keeps the segment, drops the body
    expect(
      lowerSetupOp(
        constDecl(
          hookCall(37, [
            arrow({ type: 'BlockStatement', body: [{ type: 'ExpressionStatement' }, {}] }),
          ])
        ),
        facts
      )
    ).toEqual({ op: 'computed', local: LOCAL, segment: 'segment_0', body: null });
  });

  test('useTask$ lowers derive-into-state bodies; v3 tasks auto-track', () => {
    const signalValue = () => ({
      type: 'MemberExpression',
      object: at(60, { type: 'Identifier', name: 'count' }),
      property: { type: 'Identifier', name: 'value' },
      computed: false,
    });
    const taskStatement = {
      type: 'ExpressionStatement',
      expression: hookCall(38, [
        at(100, {
          type: 'ArrowFunctionExpression',
          params: [],
          async: false,
          body: {
            type: 'BlockStatement',
            body: [
              {
                type: 'VariableDeclaration',
                kind: 'const',
                declarations: [{ id: local(), init: signalValue() }],
              },
              {
                type: 'IfStatement',
                test: local(),
                consequent: {
                  type: 'ExpressionStatement',
                  expression: {
                    type: 'AssignmentExpression',
                    operator: '=',
                    left: {
                      type: 'MemberExpression',
                      object: at(61, { type: 'Identifier', name: 'store' }),
                      property: { type: 'Identifier', name: 'label' },
                      computed: false,
                    },
                    right: lit('on'),
                  },
                },
              },
              {
                type: 'ExpressionStatement',
                expression: {
                  type: 'AssignmentExpression',
                  operator: '=',
                  left: signalValue(),
                  right: lit(0),
                },
              },
            ],
          },
        }),
      ]),
    } as unknown as AstNode;
    expect(lowerSetupOp(taskStatement, facts)).toEqual({
      op: 'task',
      segment: 'segment_0',
      body: {
        async: false,
        steps: [
          { s: 'let', local: LOCAL, value: { k: 'signal-read', binding: SIGNAL_BINDING } },
          {
            s: 'if',
            test: { k: 'binding-read', binding: LOCAL },
            then: [
              {
                s: 'set-store',
                binding: STORE_BINDING,
                path: ['label'],
                value: { k: 'lit', v: 'on' },
              },
            ],
            else: [],
          },
          { s: 'set-signal', binding: SIGNAL_BINDING, value: { k: 'lit', v: 0 } },
        ],
      },
    });
  });

  test('useVisibleTask$ records the strategy carrier only', () => {
    const arrow = at(100, {
      type: 'ArrowFunctionExpression',
      params: [],
      body: { type: 'BlockStatement', body: [{ type: 'DebuggerStatement' }] },
    });
    const statement = (args: unknown[]) =>
      ({ type: 'ExpressionStatement', expression: hookCall(39, args) }) as unknown as AstNode;
    expect(lowerSetupOp(statement([arrow]), facts)).toEqual({
      op: 'visible-task',
      segment: 'segment_0',
      strategy: 'intersection-observer',
    });
    expect(
      lowerSetupOp(
        statement([
          arrow,
          {
            type: 'ObjectExpression',
            properties: [
              {
                type: 'Property',
                kind: 'init',
                computed: false,
                key: { type: 'Identifier', name: 'strategy' },
                value: lit('document-idle'),
              },
            ],
          },
        ]),
        facts
      )
    ).toEqual({ op: 'visible-task', segment: 'segment_0', strategy: 'document-idle' });
  });

  test('non-hook call inits lower as const via expression IR', () => {
    const methodCall = {
      type: 'CallExpression',
      callee: {
        type: 'MemberExpression',
        object: at(20, { type: 'Identifier', name: 'name' }),
        property: { type: 'Identifier', name: 'toLowerCase' },
        computed: false,
      },
      arguments: [],
    };
    expect(lowerSetupOp(constDecl(methodCall), facts)).toMatchObject({
      op: 'const',
      local: LOCAL,
      init: { k: 'call', fn: 'qwik:string.toLowerCase' },
    });
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

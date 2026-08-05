import { describe, expect, test } from 'vitest';
import { lowerValueIr, type ExprLowerFacts } from './expr-lower';

/** Hand-built ESTree-shaped nodes; binding ids are keyed by the identifier's start offset. */
const SIGNAL = 1;
const LOCAL = 2;
const FN = 3;

const facts: ExprLowerFacts = {
  bindingIdAt: (range) => {
    if (range === null) {
      return null;
    }
    return { 10: SIGNAL, 20: LOCAL, 30: FN }[range[0]] ?? null;
  },
  isSourceBinding: (binding) => binding === SIGNAL,
  isFunctionBinding: (binding) => binding === FN,
};

const at = (start: number, node: object) => ({ start, end: start + 1, ...node });
const signalIdent = () => at(10, { type: 'Identifier', name: 'count' });
const localIdent = () => at(20, { type: 'Identifier', name: 'item' });
const fnIdent = () => at(30, { type: 'Identifier', name: 'formatMoney' });
const unknownIdent = (name: string) => at(90, { type: 'Identifier', name });
const lit = (value: unknown) => ({ type: 'Literal', value });
const member = (object: object, name: string, extra: object = {}) => ({
  type: 'MemberExpression',
  object,
  property: { type: 'Identifier', name },
  computed: false,
  ...extra,
});

describe('lowerValueIr', () => {
  test('literals and undefined', () => {
    expect(lowerValueIr(lit('a'), facts)).toEqual({ k: 'lit', v: 'a' });
    expect(lowerValueIr(lit(3), facts)).toEqual({ k: 'lit', v: 3 });
    expect(lowerValueIr(lit(true), facts)).toEqual({ k: 'lit', v: true });
    expect(lowerValueIr(lit(null), facts)).toEqual({ k: 'lit', v: null });
    expect(lowerValueIr(unknownIdent('undefined'), facts)).toEqual({ k: 'undef' });
    expect(lowerValueIr({ type: 'Literal', value: /x/, regex: {} }, facts)).toBeNull();
  });

  test('binding reads: generic for locals, null for unknown globals and functions', () => {
    expect(lowerValueIr(localIdent(), facts)).toEqual({ k: 'binding-read', binding: LOCAL });
    expect(lowerValueIr(unknownIdent('window'), facts)).toBeNull();
    expect(lowerValueIr(fnIdent(), facts)).toBeNull();
  });

  test('proven signal.value becomes signal-read; unproven .value stays generic member', () => {
    expect(lowerValueIr(member(signalIdent(), 'value'), facts)).toEqual({
      k: 'signal-read',
      binding: SIGNAL,
    });
    expect(lowerValueIr(member(localIdent(), 'value'), facts)).toEqual({
      k: 'member',
      obj: { k: 'binding-read', binding: LOCAL },
      name: 'value',
    });
  });

  test('member paths, computed index, optional chaining', () => {
    expect(lowerValueIr(member(member(signalIdent(), 'value'), 'length'), facts)).toEqual({
      k: 'member',
      obj: { k: 'signal-read', binding: SIGNAL },
      name: 'length',
    });
    expect(
      lowerValueIr(
        { type: 'MemberExpression', object: localIdent(), property: lit(0), computed: true },
        facts
      )
    ).toEqual({
      k: 'index',
      obj: { k: 'binding-read', binding: LOCAL },
      key: { k: 'lit', v: 0 },
    });
    expect(
      lowerValueIr(
        { type: 'ChainExpression', expression: member(localIdent(), 'title', { optional: true }) },
        facts
      )
    ).toEqual({
      k: 'member',
      obj: { k: 'binding-read', binding: LOCAL },
      name: 'title',
      optional: true,
    });
  });

  test('operators: allowlist lowers, in/instanceof/delete reject the whole expression', () => {
    expect(
      lowerValueIr(
        {
          type: 'BinaryExpression',
          operator: '===',
          left: member(member(signalIdent(), 'value'), 'length'),
          right: lit(0),
        },
        facts
      )
    ).toEqual({
      k: 'bin',
      op: '===',
      a: { k: 'member', obj: { k: 'signal-read', binding: SIGNAL }, name: 'length' },
      b: { k: 'lit', v: 0 },
    });
    expect(
      lowerValueIr(
        { type: 'BinaryExpression', operator: 'in', left: lit('a'), right: localIdent() },
        facts
      )
    ).toBeNull();
    expect(
      lowerValueIr({ type: 'UnaryExpression', operator: '!', argument: localIdent() }, facts)
    ).toEqual({ k: 'unary', op: '!', a: { k: 'binding-read', binding: LOCAL } });
    expect(
      lowerValueIr({ type: 'UnaryExpression', operator: 'delete', argument: localIdent() }, facts)
    ).toBeNull();
    expect(
      lowerValueIr(
        { type: 'LogicalExpression', operator: '??', left: localIdent(), right: lit('x') },
        facts
      )
    ).toEqual({
      k: 'logic',
      op: '??',
      a: { k: 'binding-read', binding: LOCAL },
      b: { k: 'lit', v: 'x' },
    });
  });

  test('conditional and template literals', () => {
    expect(
      lowerValueIr(
        {
          type: 'ConditionalExpression',
          test: member(signalIdent(), 'value'),
          consequent: lit('on'),
          alternate: lit('off'),
        },
        facts
      )
    ).toEqual({
      k: 'cond',
      test: { k: 'signal-read', binding: SIGNAL },
      then: { k: 'lit', v: 'on' },
      else: { k: 'lit', v: 'off' },
    });
    expect(
      lowerValueIr(
        {
          type: 'TemplateLiteral',
          quasis: [{ value: { cooked: 'items-' } }, { value: { cooked: '' } }],
          expressions: [localIdent()],
        },
        facts
      )
    ).toEqual({ k: 'template', parts: ['items-', { k: 'binding-read', binding: LOCAL }] });
  });

  test('array and object literals; spreads/computed keys/getters reject', () => {
    expect(
      lowerValueIr({ type: 'ArrayExpression', elements: [lit(1), localIdent()] }, facts)
    ).toEqual({
      k: 'array',
      items: [
        { k: 'lit', v: 1 },
        { k: 'binding-read', binding: LOCAL },
      ],
    });
    expect(
      lowerValueIr(
        { type: 'ArrayExpression', elements: [lit(1), { type: 'SpreadElement' }] },
        facts
      )
    ).toBeNull();
    expect(
      lowerValueIr(
        {
          type: 'ObjectExpression',
          properties: [
            {
              type: 'Property',
              kind: 'init',
              computed: false,
              key: { type: 'Identifier', name: 'host' },
              value: lit(true),
            },
            {
              type: 'Property',
              kind: 'init',
              computed: false,
              key: lit(2),
              value: localIdent(),
            },
          ],
        },
        facts
      )
    ).toEqual({
      k: 'object',
      entries: [
        ['host', { k: 'lit', v: true }],
        ['2', { k: 'binding-read', binding: LOCAL }],
      ],
    });
    expect(
      lowerValueIr(
        {
          type: 'ObjectExpression',
          properties: [
            {
              type: 'Property',
              kind: 'get',
              computed: false,
              key: { type: 'Identifier', name: 'x' },
              value: lit(1),
            },
          ],
        },
        facts
      )
    ).toBeNull();
  });

  test('user function calls stay unsupported (plugin territory)', () => {
    expect(
      lowerValueIr({ type: 'CallExpression', callee: fnIdent(), arguments: [] }, facts)
    ).toBeNull();
  });

  test('method calls lower to qwik: ops on lowered receivers', () => {
    expect(
      lowerValueIr(
        { type: 'CallExpression', callee: member(localIdent(), 'trim'), arguments: [] },
        facts
      )
    ).toEqual({
      k: 'call',
      fn: 'qwik:string.trim',
      recv: { k: 'binding-read', binding: LOCAL },
      args: [],
    });
    expect(
      lowerValueIr(
        {
          type: 'CallExpression',
          callee: member(member(signalIdent(), 'value'), 'toFixed'),
          arguments: [lit(2)],
        },
        facts
      )
    ).toEqual({
      k: 'call',
      fn: 'qwik:number.toFixed',
      recv: { k: 'signal-read', binding: SIGNAL },
      args: [{ k: 'lit', v: 2 }],
    });
    // unknown method name fails the whole expression
    expect(
      lowerValueIr(
        { type: 'CallExpression', callee: member(localIdent(), 'reverse'), arguments: [] },
        facts
      )
    ).toBeNull();
    // optional call unsupported
    expect(
      lowerValueIr(
        {
          type: 'CallExpression',
          callee: member(localIdent(), 'trim'),
          arguments: [],
          optional: true,
        },
        facts
      )
    ).toBeNull();
  });

  test('static and bare-global ops require unbound globals', () => {
    const mathAbs = {
      type: 'CallExpression',
      callee: {
        type: 'MemberExpression',
        object: unknownIdent('Math'),
        property: { type: 'Identifier', name: 'abs' },
        computed: false,
      },
      arguments: [localIdent()],
    };
    expect(lowerValueIr(mathAbs, facts)).toEqual({
      k: 'call',
      fn: 'qwik:math.abs',
      recv: null,
      args: [{ k: 'binding-read', binding: LOCAL }],
    });
    expect(
      lowerValueIr(
        { type: 'CallExpression', callee: unknownIdent('String'), arguments: [localIdent()] },
        facts
      )
    ).toEqual({
      k: 'call',
      fn: 'qwik:global.String',
      recv: null,
      args: [{ k: 'binding-read', binding: LOCAL }],
    });
    // JSON.stringify only in its 1-arg form
    const stringify = (argumentNodes: unknown[]) => ({
      type: 'CallExpression',
      callee: {
        type: 'MemberExpression',
        object: unknownIdent('JSON'),
        property: { type: 'Identifier', name: 'stringify' },
        computed: false,
      },
      arguments: argumentNodes,
    });
    expect(lowerValueIr(stringify([localIdent()]), facts)).toEqual({
      k: 'call',
      fn: 'qwik:json.stringify',
      recv: null,
      args: [{ k: 'binding-read', binding: LOCAL }],
    });
    expect(lowerValueIr(stringify([localIdent(), lit(null)]), facts)).toBeNull();
  });

  test('higher-order ops accept a restricted lambda callback', () => {
    const PARAM = 4;
    const lambdaFacts: typeof facts = {
      ...facts,
      bindingIdAt: (range) =>
        range === null ? null : ({ 10: SIGNAL, 20: LOCAL, 40: PARAM }[range[0]] ?? null),
    };
    const rowParam = at(40, { type: 'Identifier', name: 'row' });
    const filter = {
      type: 'CallExpression',
      callee: member(member(signalIdent(), 'value'), 'filter'),
      arguments: [
        {
          type: 'ArrowFunctionExpression',
          params: [rowParam],
          body: {
            type: 'BinaryExpression',
            operator: '!==',
            left: member(at(40, { type: 'Identifier', name: 'row' }), 'id'),
            right: lit('hidden'),
          },
        },
      ],
    };
    expect(lowerValueIr(filter, lambdaFacts)).toEqual({
      k: 'call',
      fn: 'qwik:array.filter',
      recv: { k: 'signal-read', binding: SIGNAL },
      args: [
        {
          kind: 'lambda',
          params: [{ name: 'row', binding: PARAM }],
          body: {
            k: 'bin',
            op: '!==',
            a: { k: 'member', obj: { k: 'binding-read', binding: PARAM }, name: 'id' },
            b: { k: 'lit', v: 'hidden' },
          },
        },
      ],
    });
    // multi-statement lambda bodies stay unsupported
    expect(
      lowerValueIr(
        {
          type: 'CallExpression',
          callee: member(localIdent(), 'map'),
          arguments: [
            {
              type: 'ArrowFunctionExpression',
              params: [rowParam],
              body: {
                type: 'BlockStatement',
                body: [
                  { type: 'ExpressionStatement' },
                  { type: 'ReturnStatement', argument: lit(1) },
                ],
              },
            },
          ],
        },
        lambdaFacts
      )
    ).toBeNull();
  });
});

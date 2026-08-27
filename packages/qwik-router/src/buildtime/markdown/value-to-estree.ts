// Minimal inlined replacement for `estree-util-value-to-estree` (JSON values plus Date).

import type { Expression } from 'estree';

export function valueToEstree(value: unknown): Expression {
  if (value === undefined) {
    return { type: 'Identifier', name: 'undefined' };
  }
  if (value === null || typeof value === 'string' || typeof value === 'boolean') {
    return { type: 'Literal', value };
  }
  if (typeof value === 'number') {
    if (Number.isNaN(value)) {
      return { type: 'Identifier', name: 'NaN' };
    }
    if (value < 0 || Object.is(value, -0)) {
      return {
        type: 'UnaryExpression',
        operator: '-',
        prefix: true,
        argument: valueToEstree(-value),
      };
    }
    if (!Number.isFinite(value)) {
      return { type: 'Identifier', name: 'Infinity' };
    }
    return { type: 'Literal', value };
  }
  if (Array.isArray(value)) {
    return { type: 'ArrayExpression', elements: value.map(valueToEstree) };
  }
  if (value instanceof Date) {
    return {
      type: 'NewExpression',
      callee: { type: 'Identifier', name: 'Date' },
      arguments: [{ type: 'Literal', value: value.getTime() }],
    };
  }
  if (typeof value === 'object') {
    return {
      type: 'ObjectExpression',
      properties: Object.entries(value).map(([key, propValue]) => ({
        type: 'Property',
        method: false,
        shorthand: false,
        computed: false,
        kind: 'init',
        key: { type: 'Literal', value: key },
        value: valueToEstree(propValue),
      })),
    };
  }
  throw new TypeError(`Unsupported value in markdown export: ${typeof value}`);
}

import { describe, expect, test } from 'vitest';
import { UnsupportedError } from '../errors';
import { childOps, mapChildOps } from '../op-tree';
import { OpKind, type Op } from '../schema';

const text = (html: string) => ({ op: OpKind.Static, html }) as Op;
const element = (tag: string, children: Op[]) =>
  ({ op: OpKind.Element, tag, props: [], children }) as unknown as Op;
const leaf = (kind: OpKind) => ({ op: kind }) as Op;

const leafKinds = [
  OpKind.Static,
  OpKind.Hole,
  OpKind.Component,
  OpKind.Branch,
  OpKind.Each,
  OpKind.Slot,
  OpKind.Content,
  OpKind.Pending,
  OpKind.Catch,
];

describe('childOps', () => {
  test('an element nests its children in document order', () => {
    const children = [text('a'), element('b', [text('c')]), text('d')];
    expect(childOps(element('div', children))).toBe(children);
  });

  test.each(leafKinds)('a %s op nests no ops', (kind) => {
    expect(childOps(leaf(kind))).toEqual([]);
  });

  test('an unknown op kind fails loudly', () => {
    expect(() => childOps(leaf('fake' as OpKind))).toThrow(UnsupportedError);
  });
});

describe('mapChildOps', () => {
  test('maps an element children in order into a copy, leaving the original untouched', () => {
    const children = [text('a'), text('b')];
    const parent = element('div', children);
    const visited: Op[] = [];
    const mapped = mapChildOps(parent, (child) => {
      visited.push(child);
      return text('mapped');
    });
    expect(visited).toEqual(children);
    expect(mapped).not.toBe(parent);
    expect(mapped).toEqual({ ...parent, children: [text('mapped'), text('mapped')] });
    expect(childOps(parent)).toBe(children);
  });

  test('copies an element without children too', () => {
    const parent = element('br', []);
    const mapped = mapChildOps(parent, (child) => child);
    expect(mapped).not.toBe(parent);
    expect(childOps(mapped)).not.toBe(childOps(parent));
  });

  test.each(leafKinds)('returns a %s op itself', (kind) => {
    const op = leaf(kind);
    expect(mapChildOps(op, () => text('never'))).toBe(op);
  });
});

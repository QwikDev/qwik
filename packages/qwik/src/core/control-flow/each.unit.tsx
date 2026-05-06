import type { JSXOutput } from '@qwik.dev/core';
import { describe, expectTypeOf, test } from 'vitest';
import { Each } from './each';

describe('Each types', () => {
  test('infers item$ params and return type', () => () => {
    const entries = [
      { id: 1, label: 'one' },
      { id: 2, label: 'two' },
    ] as const;
    type Entry = (typeof entries)[number];

    const inferItem = <T, ITEM extends JSXOutput>(props: Parameters<typeof Each<T, ITEM>>[0]) => {
      return null as unknown as ITEM;
    };

    const item = inferItem({
      items: entries,
      key$: (entry, index) => {
        expectTypeOf(entry).toEqualTypeOf<Entry>();
        expectTypeOf(index).toEqualTypeOf<number>();
        return `${entry.id}:${index}`;
      },
      item$: (entry, index) => {
        expectTypeOf(entry).toEqualTypeOf<Entry>();
        expectTypeOf(index).toEqualTypeOf<number>();
        return <li data-index={index}>{entry.label}</li>;
      },
    });

    expectTypeOf(item).toEqualTypeOf<JSXOutput>();
    expectTypeOf(item).toMatchTypeOf<JSXOutput>();
  });
});

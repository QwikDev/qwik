import { describe, expectTypeOf, test } from 'vitest';
import { component$ } from '../shared/component.public';
import { useSignal } from './use-signal';
import { useStore } from './use-store.public';
import { useTask$ } from './use-task-dollar';
import { useResource$ } from './use-resource-dollar';

describe('types', () => {
  test('track', () => () => {
    component$(() => {
      const sig = useSignal(1);
      const store = useStore({ count: 1 });
      useResource$(({ track }) => {
        expectTypeOf(track(store)).toEqualTypeOf(store);
        expectTypeOf(track(sig)).toEqualTypeOf<number>();
        expectTypeOf(track(() => sig.value)).toEqualTypeOf<number>();
        expectTypeOf(track(() => store.count)).toEqualTypeOf<number>();
      });
      useTask$(({ track }) => {
        expectTypeOf(track(store)).toEqualTypeOf(store);
        expectTypeOf(track(sig)).toEqualTypeOf<number>();
        expectTypeOf(track(() => sig.value)).toEqualTypeOf<number>();
        expectTypeOf(track(() => store.count)).toEqualTypeOf<number>();
      });
      return null;
    });
  });
});

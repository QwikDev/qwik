import { describe, expectTypeOf, test } from 'vitest';
import { component$ } from '../component/component.public';
import { useResource$ } from './use-resource';
import { useSignal } from './use-signal';
import { useStore } from './use-store.public';
import { useTask$ } from './use-task';

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

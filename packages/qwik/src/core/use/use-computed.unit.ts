import { describe, expectTypeOf, test } from 'vitest';
import { component$ } from '../shared/component.public';
import { $ } from '../shared/qrl/qrl.public';
import { useSignal } from './use-signal';
import { useAsync, useAsync$ } from './use-async';
import { useComputed, useComputed$, useComputedQrl } from './use-computed';
import { useSerializer, useSerializer$ } from './use-serializer';
import { useStyles, useStyles$, useStylesScoped, useStylesScoped$ } from './use-styles';

describe('types', () => {
  test('useComputed accepts plain callbacks and QRLs', () => () => {
    component$(() => {
      const count = useSignal(1);

      const plain = useComputed(() => count.value * 2);
      expectTypeOf(plain.value).toEqualTypeOf<number>();

      const qrl = useComputed($(() => count.value * 2));
      expectTypeOf(qrl.value).toEqualTypeOf<number>();

      const qrlOnly = useComputedQrl($(() => count.value * 2));
      expectTypeOf(qrlOnly.value).toEqualTypeOf<number>();

      const legacy = useComputed$(() => count.value * 2);
      expectTypeOf(legacy.value).toEqualTypeOf<number>();

      expectTypeOf(useComputed(() => Promise.resolve(count.value))).toEqualTypeOf<never>();
      return null;
    });
  });

  test('related no-dollar hooks accept plain values and QRLs', () => () => {
    component$(() => {
      const count = useSignal(1);

      const asyncPlain = useAsync(async () => count.value);
      expectTypeOf(asyncPlain.value).toEqualTypeOf<number>();

      const asyncQrl = useAsync($(async () => count.value));
      expectTypeOf(asyncQrl.value).toEqualTypeOf<number>();

      const asyncLegacy = useAsync$(async () => count.value);
      expectTypeOf(asyncLegacy.value).toEqualTypeOf<number>();

      const serializerPlain = useSerializer({
        deserialize: (data: number | undefined) => ({ count: data ?? 0 }),
        serialize: (value) => value.count,
        initial: 1,
      });
      expectTypeOf(serializerPlain.value).toEqualTypeOf<{ count: number }>();

      const serializerQrl = useSerializer(
        $(() => ({
          deserialize: (data: number | undefined) => ({ count: data ?? 0 }),
          serialize: (value: { count: number }) => value.count,
          initial: 1,
        }))
      );
      expectTypeOf(serializerQrl.value).toEqualTypeOf<{ count: number }>();

      const serializerLegacy = useSerializer$({
        deserialize: (data: number | undefined) => ({ count: data ?? 0 }),
        serialize: (value) => value.count,
        initial: 1,
      });
      expectTypeOf(serializerLegacy.value).toEqualTypeOf<{ count: number }>();

      expectTypeOf(useStyles('div{}').styleId).toEqualTypeOf<string>();
      expectTypeOf(useStyles($('div{}')).styleId).toEqualTypeOf<string>();
      expectTypeOf(useStyles$('div{}').styleId).toEqualTypeOf<string>();
      expectTypeOf(useStylesScoped('div{}').scopeId).toEqualTypeOf<string>();
      expectTypeOf(useStylesScoped($('div{}')).scopeId).toEqualTypeOf<string>();
      expectTypeOf(useStylesScoped$('div{}').scopeId).toEqualTypeOf<string>();

      return null;
    });
  });
});

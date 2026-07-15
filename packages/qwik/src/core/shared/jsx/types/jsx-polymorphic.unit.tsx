import type { EventHandler, FunctionComponent, JSXOutput, PropsOf } from '@qwik.dev/core';
import { describe, expectTypeOf, test } from 'vitest';

// This is in a separate file because it makes TS very slow
describe('polymorphism', () => {
  test('polymorphic component', () => () => {
    const Poly = null as unknown as <C extends string | FunctionComponent = 'div'>(
      props: { as?: C } & PropsOf<string extends C ? 'div' : C>
    ) => JSXOutput;
    expectTypeOf<Parameters<typeof Poly<'button'>>[0]['popovertarget']>().toEqualTypeOf<
      string | undefined
    >();
    expectTypeOf<Parameters<typeof Poly<'a'>>[0]['href']>().toEqualTypeOf<string | undefined>();
    expectTypeOf<Parameters<typeof Poly<'button'>>[0]>().not.toHaveProperty('href');
    expectTypeOf<Parameters<typeof Poly<'a'>>[0]>().not.toHaveProperty('popovertarget');
    expectTypeOf<
      Parameters<Extract<Parameters<typeof Poly>[0]['onClick$'], EventHandler>>[1]
    >().toEqualTypeOf<HTMLDivElement>();
    expectTypeOf<
      Parameters<Extract<Parameters<typeof Poly<'button'>>[0]['onClick$'], EventHandler>>[1]
    >().toEqualTypeOf<HTMLButtonElement>();
    expectTypeOf<
      Parameters<Extract<Parameters<typeof Poly<'a'>>[0]['onClick$'], EventHandler>>[1]
    >().toEqualTypeOf<HTMLAnchorElement>();

    type MyCmp = FunctionComponent<{ name: string }>;
    expectTypeOf<Parameters<typeof Poly<MyCmp>>[0]['name']>().toEqualTypeOf<string>();
  });
});

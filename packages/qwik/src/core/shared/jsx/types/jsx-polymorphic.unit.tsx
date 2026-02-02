import type { EventHandler, FunctionComponent, PropsOf } from '@qwik.dev/core';
import { component$ } from '@qwik.dev/core';
import { describe, expectTypeOf, test } from 'vitest';

// This is in a separate file because it makes TS very slow
describe('polymorphism', () => {
  test('polymorphic component', () => () => {
    const Poly = component$(
      <C extends string | FunctionComponent = 'div'>({
        as,
        ...props
      }: { as?: C } & PropsOf<string extends C ? 'div' : C>) => {
        const Cmp = as || 'div';
        return <Cmp {...props}>hi</Cmp>;
      }
    );
    expectTypeOf<Parameters<typeof Poly<'button'>>[0]['popovertarget']>().toEqualTypeOf<
      string | undefined
    >();
    expectTypeOf<Parameters<typeof Poly<'a'>>[0]['href']>().toEqualTypeOf<string | undefined>();
    expectTypeOf<Parameters<typeof Poly<'button'>>[0]>().not.toHaveProperty('href');
    expectTypeOf<Parameters<typeof Poly<'a'>>[0]>().not.toHaveProperty('popovertarget');
    expectTypeOf<
      Parameters<Extract<Parameters<typeof Poly>[0]['onClick$'], EventHandler>>[1]
    >().toEqualTypeOf<HTMLDivElement>();

    const MyCmp = component$((p: { name: string }) => <span>Hi {p.name}</span>);

    return (
      <>
        <Poly
          onClick$={(ev, el) => {
            expectTypeOf(ev).not.toBeAny();
            expectTypeOf(ev).toEqualTypeOf<PointerEvent>();
            expectTypeOf(el).toEqualTypeOf<HTMLDivElement>();
          }}
          // This should error
          // popovertarget
        >
          Foo
        </Poly>
        <Poly
          as="a"
          onClick$={(ev, el) => {
            expectTypeOf(ev).not.toBeAny();
            expectTypeOf(ev).toEqualTypeOf<PointerEvent>();
            expectTypeOf(el).toEqualTypeOf<HTMLAnchorElement>();
          }}
          href="hi"
          // This should error
          // popovertarget
        >
          Foo
        </Poly>
        <Poly
          as="button"
          onClick$={(ev, el) => {
            expectTypeOf(ev).not.toBeAny();
            expectTypeOf(ev).toEqualTypeOf<PointerEvent>();
            expectTypeOf(el).toEqualTypeOf<HTMLButtonElement>();
          }}
          popovertarget="foo"
        >
          Bar
        </Poly>
        <Poly as={MyCmp} name="meep" />
      </>
    );
  });
});

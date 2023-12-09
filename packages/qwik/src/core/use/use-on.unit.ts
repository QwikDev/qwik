import { assertType, describe, expectTypeOf, test } from 'vitest';
import { useOn, type EventQRL } from './use-on';
import { $, type QRL, type QrlReturn } from '../qrl/qrl.public';

describe('types', () => {
  // Note, these type checks happen at compile time. We don't need to call anything, so we do ()=>()=>. We just need to
  // make sure the type check runs.
  test('EventQRL matching', () => () => {
    const cb0 = () => 'hello';
    const cb1 = (ev: MouseEvent) => 'hello';
    const cb2 = (ev: Event, elem: Element) => 'hello';
    const cbAny = (ev: any) => 'hello';
    const wrong1 = (ev: MouseEvent, elem: Element, extra: string) => 'hello';
    const wrong2 = (ev: boolean) => 'hello';

    expectTypeOf<undefined>().toMatchTypeOf<EventQRL>();
    expectTypeOf<QRL<typeof cb0>>().toMatchTypeOf<EventQRL>();
    expectTypeOf<QRL<typeof cb1>>().toMatchTypeOf<EventQRL>();
    expectTypeOf<QRL<typeof cb2>>().toMatchTypeOf<EventQRL>();

    expectTypeOf<QRL<typeof cbAny>>().toMatchTypeOf<EventQRL>();

    expectTypeOf<QRL<typeof wrong1>>().not.toMatchTypeOf<EventQRL>();
    expectTypeOf<QRL<typeof wrong2>>().not.toMatchTypeOf<EventQRL>();
  });

  test('inferring', () => () => {
    const getResult = <T extends EventQRL>(e: T) => e?.(true as any, true as any) as QrlReturn<T>;

    const called = getResult(
      $((ev, el) => {
        return { ev, el };
      })
    );
    expectTypeOf(called.ev).not.toBeAny();
    expectTypeOf(called.el).not.toBeAny();
    assertType<Element | undefined>(called.el);
    expectTypeOf<Event>().toMatchTypeOf(called.ev);
  });

  test('useOn', () => () => {
    useOn(
      'click',
      $((ev) => {
        expectTypeOf(ev).not.toBeAny();
        assertType<MouseEvent>(ev);
      })
    );
    useOn(
      'copy',
      $((ev) => {
        expectTypeOf(ev).not.toBeAny();
        assertType<ClipboardEvent>(ev);
      })
    );
    useOn(
      'custom',
      $((ev) => {
        expectTypeOf(ev).not.toBeAny();
        assertType<Event>(ev);
      })
    );
  });
});

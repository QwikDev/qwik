import { assertType, describe, expectTypeOf, test } from 'vitest';
import { $ } from '../../../qrl/qrl.public';
import type { EventHandler, QRLEventHandlerMulti } from './jsx-qwik-attributes';
import type { JSXNode } from './jsx-node';
import type { QwikIntrinsicElements } from './jsx-qwik-elements';
import type { JSXChildren } from './jsx-qwik-attributes';
import { component$, type PropsOf } from '../../../component/component.public';
import type { Size } from './jsx-generated';
import type { QwikJSX } from './jsx-qwik';

describe('types', () => {
  // Note, these type checks happen at compile time. We don't need to call anything, so we do ()=>()=>. We just need to
  // make sure the type check runs.
  test('basic', () => () => {
    expectTypeOf(<div />).toEqualTypeOf<JSXNode>();
    expectTypeOf<QRLEventHandlerMulti<PointerEvent, HTMLDivElement>>().toMatchTypeOf<
      QwikIntrinsicElements['div']['onAuxClick$']
    >();
    expectTypeOf<QwikIntrinsicElements['li']['children']>().toEqualTypeOf<JSXChildren>();
    expectTypeOf<QwikIntrinsicElements['link']['children']>().toEqualTypeOf<undefined>();
    expectTypeOf<QwikIntrinsicElements['svg']['width']>().toEqualTypeOf<Size | undefined>();
  });
  test('component', () => () => {
    const Cmp = component$((props: PropsOf<'svg'>) => {
      const { width = '240', height = '56', onClick$, ...rest } = props;
      expectTypeOf(onClick$).toEqualTypeOf<QRLEventHandlerMulti<PointerEvent, SVGSVGElement>>();
      return (
        <svg
          xmlns="http://www.w3.org/2000/svg"
          version="1.1"
          width={width}
          height={height}
          {...rest}
        />
      );
    });
    expectTypeOf<Parameters<typeof Cmp>[0]['onClick$']>().toMatchTypeOf<
      EventHandler<PointerEvent, SVGSVGElement> | QRLEventHandlerMulti<PointerEvent, SVGSVGElement>
    >();
  });
  test('unknown string component', () => () => {
    const t = (
      <hello-there
        class="hi"
        onClick$={(ev, el) => {
          expectTypeOf(ev).not.toBeAny();
          expectTypeOf(ev).toEqualTypeOf<PointerEvent>();
          // Because of interface constraints, this type is "never"
          // expectTypeOf(el).toEqualTypeOf<Element>();
        }}
      />
    );
    expectTypeOf(t).toEqualTypeOf<QwikJSX.Element>();
  });
  test('inferring', () => () => {
    // Popover API
    expectTypeOf<PropsOf<'button'>>().toMatchTypeOf<{
      popovertarget?: string;
    }>();
    expectTypeOf<{
      popovertarget?: string;
    }>().not.toMatchTypeOf<PropsOf<'input'>>();
    expectTypeOf<{
      type: 'button';
      popovertarget?: string;
    }>().toMatchTypeOf<PropsOf<'input'>>();
    <>
      <button popovertarget="meep" />
      <input type="button" popovertarget="meep" />
      <div popover="manual" id="meep" />
      <div
        onToggle$={(ev, el) => {
          expectTypeOf(ev).not.toBeAny();
          // It's Event because api extractor doesn't know about ToggleEvent
          // assertType<ToggleEvent>(ev);
          expectTypeOf(ev.newState).toBeString();
        }}
        onBeforeToggle$={(ev, el) => {
          expectTypeOf(ev).not.toBeAny();
          // assertType<ToggleEvent>(ev);
          expectTypeOf(ev.prevState).toBeString();
        }}
        onBlur$={(ev) => {
          expectTypeOf(ev).not.toBeAny();
          assertType<FocusEvent>(ev);
        }}
        window:onAnimationEnd$={(ev) => {
          expectTypeOf(ev).not.toBeAny();
          assertType<AnimationEvent>(ev);
        }}
        document:onAbort$={(ev) => {
          expectTypeOf(ev).not.toBeAny();
          assertType<UIEvent>(ev);
        }}
        // Infer through $
        onAuxClick$={$((ev) => {
          expectTypeOf(ev).not.toBeAny();
          assertType<PointerEvent>(ev);
        })}
        // Array of handlers
        onInput$={[
          $((ev) => {
            expectTypeOf(ev).not.toBeAny();
            assertType<InputEvent>(ev);
          }),
          null,
          undefined,
          [
            $(async (ev, el) => {
              expectTypeOf(ev).not.toBeAny();
              assertType<InputEvent>(ev);
              expectTypeOf(el).not.toBeAny();
              assertType<HTMLDivElement>(el);
            }),
          ],
        ]}
      />
    </>;
  });
});

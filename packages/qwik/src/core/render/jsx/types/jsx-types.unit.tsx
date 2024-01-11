import { assertType, describe, expectTypeOf, test } from 'vitest';
import { $ } from '../../../qrl/qrl.public';
import type { EventHandler, QRLEventHandlerMulti } from './jsx-qwik-attributes';
import type { FunctionComponent, JSXNode } from './jsx-node';
import type { QwikIntrinsicElements } from './jsx-qwik-elements';
import type { JSXChildren } from './jsx-qwik-attributes';
import { component$, type PropsOf, type PublicProps } from '../../../component/component.public';
import type { QwikHTMLElements, QwikSVGElements, Size } from './jsx-generated';
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

  test('polymorphic component', () => () => {
    const Poly = component$(
      <C extends string | FunctionComponent>({
        as: Cmp = 'div' as C,
        ...props
      }: { as?: C } & PropsOf<string extends C ? 'div' : C>) => {
        return <Cmp {...props}>hi</Cmp>;
      }
    );
    expectTypeOf<Parameters<typeof Poly<'button'>>[0]['popovertarget']>().toEqualTypeOf<
      string | undefined
    >();
    expectTypeOf<Parameters<typeof Poly<'a'>>[0]['href']>().toEqualTypeOf<string | undefined>();
    expectTypeOf<Parameters<typeof Poly<'button'>>[0]>().not.toHaveProperty('href');
    expectTypeOf<Parameters<typeof Poly<'a'>>[0]>().not.toHaveProperty('popovertarget');
    // Note that `<Poly onClick$={(ev, el)=>...}/>` (no `as`) doesn't infer the ev,el arguments
    // It does infer the prop type correctly, so that looks like a TS bug
    expectTypeOf<
      Parameters<Extract<Parameters<typeof Poly>[0]['onClick$'], EventHandler>>[1]
    >().toEqualTypeOf<HTMLDivElement>();

    return (
      <>
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
        <Poly as={Poly} />
        <Poly
          as={$((p: { name: string }) => (
            <span>Hi {p.name}</span>
          ))}
          name="meep"
        />
      </>
    );
  });

  test('FunctionComponent', () => () => {
    const Cmp = component$((props: { foo: string }) => null);
    expectTypeOf(Cmp).toMatchTypeOf<FunctionComponent<{ foo: string }>>();
    expectTypeOf<FunctionComponent<{ foo: string }>>().toMatchTypeOf(Cmp);

    expectTypeOf((p: { hi: number }) => <span>{p.hi}</span>).toMatchTypeOf<FunctionComponent>();
    expectTypeOf((p: { hi: number }) => <span>{p.hi}</span>).toMatchTypeOf<
      FunctionComponent<{ hi: number }>
    >();
    expectTypeOf((p: { hi: number }) => <span>{p.hi}</span>).not.toMatchTypeOf<
      FunctionComponent<{ hi: string }>
    >();
    expectTypeOf((p: { hi: number }) => <span>{p.hi}</span>).not.toMatchTypeOf<
      FunctionComponent<{ meep: string }>
    >();
    expectTypeOf((p: { hi: number }) => `${p.hi}`).toMatchTypeOf<
      FunctionComponent<{ hi: number }>
    >();
    expectTypeOf((p: { hi: number }) => p.hi).toMatchTypeOf<FunctionComponent<{ hi: number }>>();
    expectTypeOf((p: { hi?: number | boolean | null }) => p.hi).toMatchTypeOf<
      FunctionComponent<{ hi: number }>
    >();
    expectTypeOf(() => null).toMatchTypeOf<FunctionComponent<{ hi: number }>>();

    expectTypeOf(() => new Date()).not.toMatchTypeOf<FunctionComponent>();
    expectTypeOf((p: string) => null).not.toMatchTypeOf<FunctionComponent>();
  });

  test('PropsOf', () => () => {
    expectTypeOf<PropsOf<'div'>>().toEqualTypeOf<QwikHTMLElements['div']>();
    expectTypeOf<PropsOf<'div'>>().not.toEqualTypeOf<QwikIntrinsicElements['li']>();
    expectTypeOf<PropsOf<'path'>>().toEqualTypeOf<QwikSVGElements['path']>();
    expectTypeOf<PropsOf<'not-exist'>>().toEqualTypeOf<QwikHTMLElements['span']>();

    const Fn = (props: { foo: string }) => <div />;
    expectTypeOf<PropsOf<typeof Fn>>().toEqualTypeOf<{ foo: string }>();

    const Fn$ = $(Fn);
    expectTypeOf<PropsOf<typeof Fn$>>().toEqualTypeOf<{ foo: string }>();

    const Cmp = component$(Fn);
    expectTypeOf<PropsOf<typeof Cmp>>().toEqualTypeOf<PublicProps<{ foo: string }>>();

    expectTypeOf<PropsOf<typeof Fn$ | null>>().toEqualTypeOf<{ foo: string }>();

    expectTypeOf<PropsOf<17>>().toEqualTypeOf<Record<any, unknown>>();
  });
});

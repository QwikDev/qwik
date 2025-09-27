import { assertType, describe, expectTypeOf, test } from 'vitest';
import { component$, type PropsOf, type PublicProps } from '../../../shared/component.public';
import { $, type PropFunction } from '../../qrl/qrl.public';
import type { JSX } from '../jsx-runtime';
import type { QwikHTMLElements, QwikSVGElements, Size } from './jsx-generated';
import type { FunctionComponent, JSXOutput } from './jsx-node';
import type { EventHandler, JSXChildren, QRLEventHandlerMulti } from './jsx-qwik-attributes';
import type { QwikIntrinsicElements } from './jsx-qwik-elements';

const Fn = () => <div />;

describe('types', () => {
  // Note, these type checks happen at compile time. We don't need to call anything, so we do ()=>()=>. We just need to
  // make sure the type check runs.
  test('basic', () => () => {
    expectTypeOf(<div />).toEqualTypeOf<JSXOutput>();
    expectTypeOf<QRLEventHandlerMulti<PointerEvent, HTMLDivElement>>().toMatchTypeOf<
      QwikIntrinsicElements['div']['onAuxClick$']
    >();
    expectTypeOf<QwikIntrinsicElements['li']['children']>().toEqualTypeOf<JSXChildren>();
    expectTypeOf<QwikIntrinsicElements['link']['children']>().toEqualTypeOf<undefined>();
    expectTypeOf<QwikIntrinsicElements['svg']['width']>().toEqualTypeOf<Size | undefined>();
  });

  test('untyped components', () => () => {
    const WithP = component$((p) => {
      expectTypeOf(p).toEqualTypeOf<unknown>();
      return <div />;
    });
    const NoP = component$(() => <div />);
    expectTypeOf<PropsOf<typeof WithP>>().toEqualTypeOf<never>();
    expectTypeOf<PropsOf<typeof NoP>>().toEqualTypeOf<never>();
    component$(() => {
      return (
        <>
          <WithP key={123}>
            <div />
          </WithP>
          <NoP key={123}>
            <div />
          </NoP>
        </>
      );
    });

    expectTypeOf<PropsOf<typeof Fn>>().toEqualTypeOf<never>();
    const Cmp = component$(Fn);
    expectTypeOf(Cmp).toEqualTypeOf<FunctionComponent<PublicProps<unknown>>>();
    expectTypeOf(Cmp).not.toEqualTypeOf<FunctionComponent<{ foo: string }>>();
  });

  test('inferring FunctionComponent', () => () => {
    const makeFC = <T,>(fn: (p: T) => JSX.Element): FunctionComponent<T> => fn;

    const FCNoP = makeFC(() => <div />);
    expectTypeOf<PropsOf<typeof FCNoP>>().toEqualTypeOf<never>();

    const FCWithP = makeFC((p) => {
      expectTypeOf(p).not.toBeAny();
      expectTypeOf(p).toEqualTypeOf<unknown>();
      return <div />;
    });

    expectTypeOf<PropsOf<typeof FCWithP>>().toEqualTypeOf<never>();
  });

  test('accepting FunctionComponent', () => () => {
    const f = <P,>(fn: FunctionComponent<P>) => null as P;
    expectTypeOf(f(() => <div />)).toEqualTypeOf<unknown>();
    expectTypeOf(
      f((p) => {
        expectTypeOf(p).not.toBeAny();
        expectTypeOf(p).toEqualTypeOf<unknown>();
        return <div />;
      })
    ).toEqualTypeOf<unknown>();
    expectTypeOf(f(component$<{ foo: string }>(() => <div />))).toEqualTypeOf<
      PublicProps<{ foo: string }>
    >();
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

    return (
      <p>
        <Cmp />
      </p>
    );
  });
  test('PropFunction', () => () => {
    const CmpButton = component$<{
      onClick$?: PropFunction<() => void>;
    }>((props) => <button onClick$={props.onClick$} />);

    <CmpButton onClick$={() => alert('CLICKED!')}>click me!</CmpButton>;
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
    expectTypeOf(t).toEqualTypeOf<JSX.Element>();
  });

  test('inferring', () => () => {
    // Popover API
    expectTypeOf<PropsOf<'button'>>().toMatchTypeOf<{
      popovertarget?: string;
    }>();
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
  });

  test('PropsOf', () => () => {
    // tags
    expectTypeOf<PropsOf<'div'>>().toEqualTypeOf<QwikHTMLElements['div']>();
    expectTypeOf<PropsOf<'div'>>().not.toEqualTypeOf<QwikIntrinsicElements['li']>();
    expectTypeOf<PropsOf<'path'>>().toEqualTypeOf<QwikSVGElements['path']>();
    expectTypeOf<PropsOf<'not-exist'>>().toEqualTypeOf<QwikHTMLElements['span']>();

    // functions
    expectTypeOf<PropsOf<typeof NoProps>>().toEqualTypeOf<never>();
    expectTypeOf<PropsOf<typeof UnknownProps>>().toEqualTypeOf<never>();
    expectTypeOf<PropsOf<typeof AnyProps>>().toEqualTypeOf<any>();
    expectTypeOf<PropsOf<typeof DefProps>>().toEqualTypeOf<{ foo: string }>();
    expectTypeOf<PropsOf<typeof PolyProps<'hi'>>>().toMatchTypeOf<{
      as?: 'hi';
      b: boolean;
      foo: boolean;
    }>();

    // components
    expectTypeOf<PropsOf<typeof NoProps$>>().toEqualTypeOf<never>();
    expectTypeOf<PropsOf<typeof UnknownProps$>>().toEqualTypeOf<never>();
    expectTypeOf<PropsOf<typeof AnyProps$>>().toEqualTypeOf<any>();
    expectTypeOf<PropsOf<typeof DefProps$>>().toEqualTypeOf<{ foo: string }>();
    expectTypeOf<PropsOf<typeof PolyProps$<'hi'>>>().toMatchTypeOf<{
      as?: 'hi';
      b: boolean;
      foo: boolean;
    }>();

    // edge cases
    expectTypeOf<PropsOf<typeof DefProps$ | null>>().toEqualTypeOf<{ foo: string }>();

    expectTypeOf<PropsOf<17>>().toEqualTypeOf<never>();
  });

  test('CSSProperties', () => () => {
    return (
      <div
        style={{
          color: 'red',
          backgroundColor: 'blue',
          // Using a CSS variable
          '--my-variable': '10px',
          // Using a number value
          marginTop: 10,
          // Using a string value
          padding: '5px',
        }}
      />
    );
  });
});

const NoProps = () => <div />;
const UnknownProps = (p: unknown) => <div />;
const AnyProps = (p: any) => <div />;
const DefProps = (props: { foo: string }) => <div />;
const PolyProps = <C extends string = ''>(
  p: { as?: C; b: boolean } & (C extends 'hi' ? { foo: boolean } : never)
) => <div />;

const NoProps$ = component$(NoProps);
const UnknownProps$ = component$(UnknownProps);
const AnyProps$ = component$(AnyProps);
const DefProps$ = component$(DefProps);
const PolyProps$ = component$(PolyProps);

import { Fragment as Component, Fragment } from '@builder.io/qwik/jsx-runtime';
import { describe, expect, it } from 'vitest';
import { trigger } from '../../testing/element-fixture';
import { component$ } from '../component/component.public';
import { _IMMUTABLE, _fnSignal } from '../internal';
import { inlinedQrl } from '../qrl/qrl';
import { _jsxC } from '../render/jsx/jsx-runtime';
import { Slot } from '../render/jsx/slot.public';
import type { Signal } from '../state/signal';
import { untrack } from '../use/use-core';
import { useLexicalScope } from '../use/use-lexical-scope.public';
import { useSignal } from '../use/use-signal';
import { domRender, ssrRenderToDom } from './rendering.unit-util';
import type { fixMeAny } from './shared/types';
import './vdom-diff.unit-util';

const debug = false; //true;
Error.stackTraceLimit = 100;

[
  ssrRenderToDom, //
  domRender, //
].forEach((render) => {
  describe('useSignal', () => {
    it('should update value', async () => {
      const Counter = component$((props: { initial: number }) => {
        const count = useSignal(props.initial);
        return (
          <button onClick$={inlinedQrl(() => useLexicalScope()[0].value++, 's_onClick', [count])}>
            Count: {count.value}!
          </button>
        );
      });

      const { vNode, container } = await render(<Counter initial={123} />, { debug });
      expect(vNode).toMatchVDOM(
        <>
          <button>Count: {'123'}!</button>
        </>
      );
      await trigger(container.element, 'button', 'click');
      expect(vNode).toMatchVDOM(
        <>
          <button>Count: {'124'}!</button>
        </>
      );
    });
    it('should rerender child', async () => {
      const log: string[] = [];
      const Display = component$((props: { dValue: number }) => {
        log.push('Display');
        return <span>Count: {props.dValue}!</span>;
      });
      const Counter = component$((props: { initial: number }) => {
        log.push('Counter');
        const count = useSignal(props.initial);
        return (
          <button
            onClick$={inlinedQrl(
              () => {
                useLexicalScope()[0].value++;
              },
              's_onClick',
              [count]
            )}
          >
            <Display dValue={count.value} />
          </button>
        );
      });

      const { vNode, container } = await render(<Counter initial={123} />, { debug });
      expect(vNode).toMatchVDOM(
        <>
          <button>
            <>
              <span>Count: {'123'}!</span>
            </>
          </button>
        </>
      );
      log.length = 0;
      await trigger(container.element, 'button', 'click');
      expect(log).toEqual(['Counter', 'Display']);
      expect(vNode).toMatchVDOM(
        <>
          <button>
            <>
              <span>Count: {'124'}!</span>
            </>
          </button>
        </>
      );
    });
    it('should update from JSX', async () => {
      const Counter = component$((props: { initial: number }) => {
        const jsx = useSignal(<Child>content</Child>);
        const show = useSignal(false);
        return (
          <button onClick$={inlinedQrl(() => useLexicalScope()[0].value++, 's_onClick', [show])}>
            {show.value ? jsx.value : 'hidden'}
          </button>
        );
      });
      const Child = component$(() => {
        return (
          <span>
            <Slot />
          </span>
        );
      });

      const { vNode, container } = await render(<Counter initial={123} />, { debug });
      expect(vNode).toMatchVDOM(
        <>
          <button>hidden</button>
        </>
      );
      await trigger(container.element, 'button', 'click');
      expect(vNode).toMatchVDOM(
        <>
          <button>
            <Component>
              <span>
                <>content</>
              </span>
            </Component>
          </button>
        </>
      );
    });
    it('should render promise values', async () => {
      const MpCmp = component$(() => {
        const promise = Promise.resolve('const ');
        const signal = useSignal(Promise.resolve(0));
        return (
          <button
            onClick$={inlinedQrl(
              () => {
                const [s] = useLexicalScope<[typeof signal]>();
                s.value = s.value.then((v) => v + 1);
              },
              's_click',
              [signal]
            )}
          >
            {promise}
            {signal.value}
          </button>
        );
      });

      const { vNode, container, document } = await render(<MpCmp />, { debug });
      expect(vNode).toMatchVDOM(
        <>
          <button>
            <>const </>
            <>0</>
          </button>
        </>
      );
      await trigger(container.element, 'button', 'click');
      expect(vNode).toMatchVDOM(
        <>
          <button>
            <>const </>
            <>1</>
          </button>
        </>
      );
      expect(document.querySelector('button')!.innerHTML).toBe('const 1');
    });
    it('should manage different class definitions', async () => {
      const Cmp = component$(() => {
        const enable = useSignal(true);
        return (<div>
          <button onClick$={inlinedQrl(() => {
            const { enable } = useLexicalScope()[0];
            enable.value != enable.value;
          }, 's_onClick', [enable])}>
            Value: {enable.value.toString()}!
          </button>
          <div class={`my-class ${enable.value ? 'enable' : 'disable'}`} />
          <span class={{
            'my-class': true,
            'enable': enable.value,
            'disable': !enable.value,
            'another-class': false
          }} />
          <span class={[
            'my-class',
            enable.value.toString(),
            'signal-' + enable.value.toString(),
            enable.value ? 'enable' : 'disable'
          ]} />
        </div>
        )
      });

      const { vNode, container } = await render(<Cmp />, { debug });
      expect(vNode).toMatchVDOM(
        <Component>
          <div>
            <button>{'Value: '}{'true'}{'!'}</button>
            <div class="my-class enable" />
            <span class="my-class enable" />
            <span class="my-class true signal-true enable" />
          </div >
        </Component >
      );
      await trigger(container.element, 'button', 'click');
      expect(vNode).toMatchVDOM(
        <Component>
          <div>
            <button>{'Value: '}{'false'}{'!'}</button>
            <div class="my-class disable" />
            <span class="my-class disable" />
            <span class="my-class false signal-false disable" />
          </div>
        </Component>
      );
    });
    describe('derived', () => {
      it('should update value directly in DOM', async () => {
        const log: string[] = [];
        const Counter = component$((props: { initial: number }) => {
          const count = useSignal(props.initial);
          log.push('Counter: ' + untrack(() => count.value));
          return (
            <button onClick$={inlinedQrl(() => useLexicalScope()[0].value++, 's_onClick', [count])}>
              Count: {_fnSignal((p0) => p0.value, [count], 'p0.value')}!
            </button>
          );
        });

        const { vNode, container } = await render(<Counter initial={123} />, {
          debug,
          // oldSSR: true,
        });
        expect(log).toEqual(['Counter: 123']);
        log.length = 0;
        expect(vNode).toMatchVDOM(
          <Component>
            <button>
              Count: <>{'123'}</>!
            </button>
          </Component>
        );
        await trigger(container.element, 'button', 'click');
        expect(log).toEqual([]);
        log.length = 0;
        expect(vNode).toMatchVDOM(
          <>
            <button>
              Count: <>{'124'}</>!
            </button>
          </>
        );
      });
      it('should allow signal to deliver value or JSX', async () => {
        const log: string[] = [];
        const Counter = component$(() => {
          const count = useSignal<any>('initial');
          log.push('Counter: ' + untrack(() => count.value));
          return (
            <button
              onClick$={inlinedQrl(
                () => {
                  const [s] = useLexicalScope();
                  s.value = typeof s.value == 'string' ? <b>JSX</b> : 'text';
                },
                's_onClick',
                [count]
              )}
            >
              -{_fnSignal((p0) => p0.value, [count], 'p0.value')}-
            </button>
          );
        });

        const { vNode, container } = await render(<Counter />, { debug });
        expect(log).toEqual(['Counter: initial']);
        log.length = 0;
        expect(vNode).toMatchVDOM(
          <Component>
            <button>
              -<>{'initial'}</>-
            </button>
          </Component>
        );
        await trigger(container.element, 'button', 'click');
        expect(log).toEqual([]);
        log.length = 0;
        expect(vNode).toMatchVDOM(
          <>
            <button>
              -
              <>
                <b>JSX</b>
              </>
              -
            </button>
          </>
        );
        await trigger(container.element, 'button', 'click');
        expect(log).toEqual([]);
        log.length = 0;
        expect(vNode).toMatchVDOM(
          <>
            <button>
              -<>{'text'}</>-
            </button>
          </>
        );
      });
      it('should update value when store, update and render are separated', async () => {
        const renderLog: string[] = [];
        const Counter = component$(() => {
          renderLog.push('Counter');
          const count = useSignal(123);
          return (
            <>
              {/* <Display displayValue={count.value} /> */}
              {_jsxC(
                Display as fixMeAny,
                {
                  get displayValue() {
                    return count.value;
                  },
                  [_IMMUTABLE]: {
                    displayValue: _fnSignal((p0) => p0.value, [count], 'p0.value'),
                  },
                },
                3,
                'H1_0'
              )}
              <Incrementor countSignal={count} />
            </>
          );
        });
        const Incrementor = component$((props: { countSignal: Signal<number> }) => {
          renderLog.push('Incrementor');
          return (
            <button
              onClick$={inlinedQrl(
                () => {
                  const [countSignal] = useLexicalScope();
                  countSignal.value++;
                },
                's_onClick',
                [props.countSignal]
              )}
            >
              +1
            </button>
          );
        });
        const Display = component$((props: { displayValue: number }) => {
          renderLog.push('Display');
          return <>Count: {_fnSignal((p0) => p0.displayValue, [props], 'p0.displayValue')}!</>;
        });
        const { vNode, container } = await render(<Counter />, { debug });
        expect(renderLog).toEqual(['Counter', 'Display', 'Incrementor']);
        renderLog.length = 0;
        await trigger(container.element, 'button', 'click');
        expect(renderLog).toEqual([]);
        expect(vNode).toMatchVDOM(
          <Fragment>
            <>
              <Component>
                <>
                  Count: <>{'124'}</>!
                </>
              </Component>
              <Component>
                <button>+1</button>
              </Component>
            </>
          </Fragment>
        );
      });
    });
  });
});

import { Fragment as Component, Fragment } from '@builder.io/qwik/jsx-runtime';
import { describe, expect, it } from 'vitest';
import { trigger } from '../../testing/element-fixture';
import { component$ } from '../component/component.public';
import { _IMMUTABLE, _fnSignal } from '../internal';
import { inlinedQrl } from '../qrl/qrl';
import { _jsxC } from '../render/jsx/jsx-runtime';
import type { Signal } from '../state/signal';
import { untrack } from '../use/use-core';
import { useLexicalScope } from '../use/use-lexical-scope.public';
import { useSignal } from '../use/use-signal';
import { useStore } from '../use/use-store.public';
import { domRender, ssrRenderToDom } from './rendering.unit-util';
import type { fixMeAny } from './shared/types';
import './vdom-diff.unit-util';

const debug = true; //true;
Error.stackTraceLimit = 100;

[
  ssrRenderToDom, //
  domRender, //
].forEach((render) => {
  describe(render.name + ': useStore', () => {
    it('should render value', async () => {
      const Cmp = component$(() => {
        const store = useStore({ items: [{ num: 0 }] });
        return (<>
          {store.items.map((item, key) => (
            <div key={key}>{item.num}</div>
          ))}
        </>
        );
      });

      const { vNode } = await render(<Cmp />, { debug });
      expect(vNode).toMatchVDOM(
        <Component >
          <Fragment>
            <div key="0">0</div>
          </Fragment>
        </Component>
      );
    });
    it('should update value', async () => {
      const Counter = component$(() => {
        const count = useStore({ count: 123 });
        return (
          <button onClick$={inlinedQrl(() => useLexicalScope()[0].count++, 's_onClick', [count])}>
            Count: {count.count}!
          </button>
        );
      });

      const { vNode, container } = await render(<Counter />, { debug });
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
    it('should update deep value', async () => {
      const Counter = component$(() => {
        const count = useStore({ obj: { count: 123 } });
        return (
          <button
            onClick$={inlinedQrl(() => useLexicalScope()[0].obj.count++, 's_onClick', [count])}
          >
            Count: {count.obj.count}!
          </button>
        );
      });

      const { vNode, container } = await render(<Counter />, { debug });
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
    it('should update value for issue 5597', async () => {
      const Cmp = component$(() => {
        const count = useSignal(0);
        const store = useStore({ items: [{ num: 0 }] });
        return (<>
          <button
            onClick$={inlinedQrl(() => useLexicalScope()[0].obj.value++, 's_onClick', [count])}
          >
            Count: {count}!
          </button>
          {store.items.map((item, key) => (
            <div key={key}>{item.num}</div>
          ))}
        </>
        );
      });

      const { vNode } = await render(<Cmp />, { debug });
      expect(vNode).toMatchVDOM(
        <Component >
          <button>
            Count: {'0'}!
          </button>
          <div key="0">
            0
          </div>
        </Component>
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
        const count = useStore({ obj: { value: props.initial } });
        return (
          <button
            onClick$={inlinedQrl(
              () => {
                useLexicalScope()[0].obj.value++;
              },
              's_onClick',
              [count]
            )}
          >
            <Display dValue={count.obj.value} />
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
    describe('derived', () => {
      it('should update value directly in DOM', async () => {
        const log: string[] = [];
        const Counter = component$((props: { initial: number }) => {
          const count = useStore({ value: props.initial });
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
          const count = useStore<any>({ value: 'initial' });
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
          const count = useStore({ value: 123 });
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

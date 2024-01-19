import { describe, expect, it } from 'vitest';
import { trigger } from '../../testing/element-fixture';
import { component$ } from '../component/component.public';
import { inlinedQrl } from '../qrl/qrl';
import { useLexicalScope } from '../use/use-lexical-scope.public';
import { useSignal } from '../use/use-signal';
import { ssrRenderToDom } from './ssr-render.unit';
import './vdom-diff.unit';
import type { Signal } from '../state/signal';
import { Fragment } from '@builder.io/qwik/jsx-runtime';

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

    const { vNode, container } = await ssrRenderToDom(<Counter initial={123} />, {
      debug: true,
    });
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
  it.only('should rerender child', async () => {
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

    const { vNode, container } = await ssrRenderToDom(<Counter initial={123} />, {
      debug: true,
      oldSSR: true,
    });
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
  it.skip('should update value when store, update and render are separated', async () => {
    const renderLog: string[] = [];
    const Counter = component$((props: { initVal: number }) => {
      renderLog.push('Counter');
      console.log('Render: Counter');
      const count = useSignal(props.initVal);
      return (
        <>
          <Display displayValue={count.value} />
          <Incrementor countSignal={count} />
        </>
      );
    });
    const Incrementor = component$((props: { countSignal: Signal<number> }) => {
      renderLog.push('Incrementor');
      console.log('Render: Incrementor');
      return (
        <button
          onClick$={inlinedQrl(
            () => {
              const [countSignal] = useLexicalScope();
              countSignal.value++;
              console.log('increment', countSignal.value);
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
      console.log('Render: Display');
      return <>Count: {props.displayValue}!</>;
    });
    const { vNode, container } = await ssrRenderToDom(<Counter initVal={123}>content</Counter>, {
      debug: true,
      oldSSR: true,
    });
    // expect(renderLog).toEqual(['Counter', 'Display', 'Incrementor']);
    renderLog.length = 0;
    await trigger(container.element, 'button', 'click');
    expect(renderLog).toEqual(['Counter', 'Display']);
    console.log('AFTER RENDER');
    expect(vNode).toMatchVDOM(
      <Fragment>
        <Fragment>
          <Fragment>
            <Fragment>Count: {'124'}!</Fragment>
          </Fragment>
          <Fragment>
            <button>+1</button>
          </Fragment>
        </Fragment>
      </Fragment>
    );
  });
});

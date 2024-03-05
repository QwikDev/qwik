import { describe, expect, it } from 'vitest';
import { trigger } from '../../testing/element-fixture';
import { component$ } from '../component/component.public';
import { inlinedQrl } from '../qrl/qrl';
import { useLexicalScope } from '../use/use-lexical-scope.public';
import { useSignal } from '../use/use-signal';
import { useStore } from '../use/use-store.public';
import { useComputedQrl } from '../use/use-task';
import { domRender, ssrRenderToDom } from './rendering.unit-util';
import './vdom-diff.unit-util';

const debug = false; //true;
Error.stackTraceLimit = 100;

[
  ssrRenderToDom, //
  domRender, //
].forEach((render) => {
  describe(render.name + 'useComputed', () => {
    it('should update value based on signal', async () => {
      const DoubleCounter = component$((props: { initial: number }) => {
        const count = useSignal(props.initial);
        const doubleCount = useComputedQrl(
          inlinedQrl(() => useLexicalScope()[0].value * 2, 's_doubleCount', [count])
        );
        return (
          <button onClick$={inlinedQrl(() => useLexicalScope()[0].value++, 's_onClick', [count])}>
            Double count: {doubleCount.value}! {count.value}
          </button>
        );
      });

      const { vNode, container } = await render(<DoubleCounter initial={123} />, { debug });
      expect(vNode).toMatchVDOM(
        <>
          <button>
            Double count: {'246'}! {'123'}
          </button>
        </>
      );
      await trigger(container.element, 'button', 'click');
      expect(vNode).toMatchVDOM(
        <>
          <button>
            Double count: {'248'}! {'124'}
          </button>
        </>
      );
    });

    it('should update value based on another computed', async () => {
      const QuadrupleCounter = component$((props: { initial: number }) => {
        const count = useSignal(props.initial);
        const doubleCount = useComputedQrl(
          inlinedQrl(() => useLexicalScope()[0].value * 2, 's_doubleCount', [count])
        );
        const quadrupleCount = useComputedQrl(
          inlinedQrl(() => useLexicalScope()[0].value * 2, 's_quadrupleCount', [doubleCount])
        );
        return (
          <button onClick$={inlinedQrl(() => useLexicalScope()[0].value++, 's_onClick', [count])}>
            Double count: {quadrupleCount.value}!
          </button>
        );
      });

      const { vNode, container } = await render(<QuadrupleCounter initial={123} />, { debug });
      expect(vNode).toMatchVDOM(
        <>
          <button>Double count: {'492'}!</button>
        </>
      );
      await trigger(container.element, 'button', 'click');
      expect(vNode).toMatchVDOM(
        <>
          <button>Double count: {'496'}!</button>
        </>
      );
    });

    it('should not rerun if there are no signal dependencies', async () => {
      let runCount = 0;
      const DoubleCounter = component$((props: { initial: number }) => {
        const count = props.initial;
        const doubleCount = useComputedQrl(
          inlinedQrl(() => {
            runCount++;
            return useLexicalScope()[0] * 2;
          }, 's_doubleCount', [count])
        );
        return (
          <button onClick$={inlinedQrl(() => useLexicalScope()[0]++, 's_onClick', [count])}>
            Double count: {doubleCount.value}!
          </button>
        );
      });

      const { vNode, container } = await render(<DoubleCounter initial={123} />, { debug });
      expect(vNode).toMatchVDOM(
        <>
          <button>Double count: {'246'}!</button>
        </>
      );
      expect(runCount).toBe(1);
      await trigger(container.element, 'button', 'click');
      expect(vNode).toMatchVDOM(
        <>
          <button>Double count: {'246'}!</button>
        </>
      );
      expect(runCount).toBe(1);
    });

    it('should not rerun if value did not change', async () => {
      let runCount = 0;
      const DoubleCounter = component$(() => {
        const count = useSignal(1);
        const doubleCount = useComputedQrl(
          inlinedQrl(() => {
            runCount++;
            return useLexicalScope()[0].value * 2;
          }, 's_doubleCount', [count])
        );
        return (
          <button onClick$={inlinedQrl(() => useLexicalScope()[0].value = 1, 's_onClick', [count])}>
            Double count: {doubleCount.value}!
          </button>
        );
      });

      const { vNode, container } = await render(<DoubleCounter />, { debug });
      expect(vNode).toMatchVDOM(
        <>
          <button>Double count: {'2'}!</button>
        </>
      );
      expect(runCount).toBe(1);
      await trigger(container.element, 'button', 'click');
      expect(vNode).toMatchVDOM(
        <>
          <button>Double count: {'2'}!</button>
        </>
      );
      expect(runCount).toBe(1);
    });

    it('should allow return signal inside computed', async () => {
      const Counter = component$(() => {
        const foo = useSignal(1);
        const count = useComputedQrl(
          inlinedQrl(() => foo, 's_count', [foo])
        );
        return (
          <button onClick$={inlinedQrl(() => useLexicalScope()[0].value.value++, 's_onClick', [count])}>
            Count: {count.value.value}!
          </button>
        );
      });

      const { vNode, container } = await render(<Counter />, { debug });
      expect(vNode).toMatchVDOM(
        <>
          <button>Count: {'1'}!</button>
        </>
      );
      await trigger(container.element, 'button', 'click');
      expect(vNode).toMatchVDOM(
        <>
          <button>Count: {'2'}!</button>
        </>
      );
    });

    it('#4979 - should work with inner computed', async () => {
      const InnerComponent = component$((props: { value: number }) => {
        const foo = useComputedQrl(
          inlinedQrl(() => useLexicalScope()[0].value, 's_foo', [props])
        );
        return (
          <div>{JSON.stringify(foo.value)}</div>
        );
      });

      const OuterComponent = component$(() => {
        const count = useSignal(123);
        return (
          <>
            <button onClick$={inlinedQrl(() => useLexicalScope()[0].value += 1, 's_onClick', [count])}>
              Next
            </button>
            {[count.value].map(o => <InnerComponent key={o} value={o} />)}
          </>
        );
      });

      const { vNode } = await render(<OuterComponent />, { debug });
      expect(vNode).toMatchVDOM(
        <>
          <>
            <button>
              Next
            </button>
            <>
              <div>
                {'123'}
              </div>
            </>
          </>
        </>
      );
    });

    it.skip('#3294 - improvement(after v2): should lazily evaluate the function with useSignal', async () => {
      let useComputedCount = 0;
      const Issue3294 = component$(() => {
        const firstName = useSignal('Misko');
        const lastName = useSignal('Hevery');
        const execFirstUseComputed = useSignal(true);
        const firstUseComputed = useComputedQrl(
          inlinedQrl(
            () => {
              useComputedCount++;
              return useLexicalScope()[1].value + ' ' + useLexicalScope()[0].value;
            },
            's_firstUseComputed',
            [firstName, lastName]
          )
        );
        const secondUseComputed = useComputedQrl(
          inlinedQrl(
            () => {
              useComputedCount++;
              return useLexicalScope()[0].value + ' ' + useLexicalScope()[1].value;
            },
            's_secondUseComputed',
            [firstName, lastName]
          )
        );
        return (
          <div>
            {execFirstUseComputed.value ? (
              <span>{firstUseComputed.value}</span>
            ) : (
              <span>{secondUseComputed.value}</span>
            )}
          </div>
        );
      });

      const { vNode } = await render(<Issue3294 />, { debug });
      expect(vNode).toMatchVDOM(
        <>
          <div>
            <span>Hevery Misko</span>
          </div>
        </>
      );
      expect(useComputedCount).toBe(1);
    });

    it.skip('#3294 - improvement(after v2): should lazily evaluate the function with store', async () => {
      let useComputedCount = 0;
      const Issue3294 = component$(() => {
        const store = useStore({ firstName: 'Misko', lastName: 'Hevery' });
        const execFirstUseComputed = useSignal(true);
        const firstUseComputed = useComputedQrl(
          inlinedQrl(
            () => {
              useComputedCount++;
              return useLexicalScope()[0].lastName + ' ' + useLexicalScope()[0].firstName;
            },
            's_firstUseComputed',
            [store]
          )
        );
        const secondUseComputed = useComputedQrl(
          inlinedQrl(
            () => {
              useComputedCount++;
              return useLexicalScope()[0].firstName + ' ' + useLexicalScope()[0].lastName;
            },
            's_secondUseComputed',
            [store]
          )
        );
        return (
          <div>
            {execFirstUseComputed.value ? (
              <span>{firstUseComputed.value}</span>
            ) : (
              <span>{secondUseComputed.value}</span>
            )}
          </div>
        );
      });

      const { vNode } = await render(<Issue3294 />, { debug });
      expect(vNode).toMatchVDOM(
        <>
          <div>
            <span>Hevery Misko</span>
          </div>
        </>
      );
      expect(useComputedCount).toBe(1);
    });
  });
});

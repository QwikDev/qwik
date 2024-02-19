import { describe, expect, it } from 'vitest';
import { trigger } from '../../testing/element-fixture';
import { component$ } from '../component/component.public';
import { inlinedQrl } from '../qrl/qrl';
import { useLexicalScope } from '../use/use-lexical-scope.public';
import { useOn, useOnDocument, useOnWindow } from '../use/use-on';
import { useSignal } from '../use/use-signal';
import { domRender, ssrRenderToDom } from './rendering.unit-util';
import './vdom-diff.unit-util';
import { useVisibleTaskQrl } from '../use/use-task';

const debug = false; //true;
Error.stackTraceLimit = 100;

[
  ssrRenderToDom, //
  domRender, //
].forEach((render) => {
  describe(render.name + ': useOn', () => {
    it('should update value', async () => {
      const Counter = component$((props: { initial: number }) => {
        const count = useSignal(props.initial);
        useOn(
          'click',
          inlinedQrl(() => useLexicalScope()[0].value++, 's_onClick', [count])
        );
        return <button>Count: {count.value}!</button>;
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

    it('should update value with multiple useOn', async () => {
      const Counter = component$((props: { initial: number }) => {
        const count = useSignal(props.initial);
        useOn(
          'click',
          inlinedQrl(() => useLexicalScope()[0].value++, 's_onClick', [count])
        );
        useOn(
          'focus',
          inlinedQrl(
            () => {
              useLexicalScope()[0].value += 2;
            },
            's_onFocus',
            [count]
          )
        );
        useVisibleTaskQrl(
          inlinedQrl(() => (useLexicalScope()[0].value += 2), 's_visibleTask', [count])
        );
        return <button>Count: {count.value}!</button>;
      });

      const { vNode, container } = await render(<Counter initial={123} />, { debug });
      expect(vNode).toMatchVDOM(
        <>
          <button>Count: {'123'}!</button>
        </>
      );
      await trigger(container.element, 'button', 'qvisible');
      expect(vNode).toMatchVDOM(
        <>
          <button>Count: {'125'}!</button>
        </>
      );
      await trigger(container.element, 'button', 'click');
      expect(vNode).toMatchVDOM(
        <>
          <button>Count: {'126'}!</button>
        </>
      );
      await trigger(container.element, 'button', 'focus');
      expect(vNode).toMatchVDOM(
        <>
          <button>Count: {'128'}!</button>
        </>
      );
    });

    it('should update value with mixed listeners', async () => {
      const Counter = component$((props: { initial: number }) => {
        const count = useSignal(props.initial);
        useOn(
          'click',
          inlinedQrl(() => useLexicalScope()[0].value++, 's_onClick', [count])
        );
        return (
          <button
            onFocus$={inlinedQrl(() => (useLexicalScope()[0].value += 2), 's_onFocus', [count])}
          >
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
      await trigger(container.element, 'button', 'focus');
      expect(vNode).toMatchVDOM(
        <>
          <button>Count: {'126'}!</button>
        </>
      );
    });
  });

  describe(render.name + ': useOnDocument', () => {
    it('should update value', async () => {
      const Counter = component$((props: { initial: number }) => {
        const count = useSignal(props.initial);
        useOnDocument(
          'click',
          inlinedQrl(() => useLexicalScope()[0].value++, 's_onClick', [count])
        );
        return <button>Count: {count.value}!</button>;
      });

      const { vNode, container } = await render(<Counter initial={123} />, { debug });
      expect(vNode).toMatchVDOM(
        <>
          <button>Count: {'123'}!</button>
        </>
      );

      await trigger(container.element, 'button', ':document:click');
      expect(vNode).toMatchVDOM(
        <>
          <button>Count: {'124'}!</button>
        </>
      );
    });

    it('should update value with multiple useOnDocument', async () => {
      const Counter = component$((props: { initial: number }) => {
        const count = useSignal(props.initial);
        useOnDocument(
          'click',
          inlinedQrl(() => useLexicalScope()[0].value++, 's_onClick', [count])
        );
        useOnDocument(
          'focus',
          inlinedQrl(
            () => {
              useLexicalScope()[0].value += 2;
            },
            's_onFocus',
            [count]
          )
        );
        useVisibleTaskQrl(
          inlinedQrl(() => (useLexicalScope()[0].value += 2), 's_visibleTask', [count])
        );
        return <button>Count: {count.value}!</button>;
      });

      const { vNode, container } = await render(<Counter initial={123} />, { debug });
      expect(vNode).toMatchVDOM(
        <>
          <button>Count: {'123'}!</button>
        </>
      );
      await trigger(container.element, 'button', 'qvisible');
      expect(vNode).toMatchVDOM(
        <>
          <button>Count: {'125'}!</button>
        </>
      );
      await trigger(container.element, 'button', ':document:click');
      expect(vNode).toMatchVDOM(
        <>
          <button>Count: {'126'}!</button>
        </>
      );
      await trigger(container.element, 'button', ':document:focus');
      expect(vNode).toMatchVDOM(
        <>
          <button>Count: {'128'}!</button>
        </>
      );
    });

    it('should update value with mixed listeners', async () => {
      const Counter = component$((props: { initial: number }) => {
        const count = useSignal(props.initial);
        useOnWindow(
          'click',
          inlinedQrl(() => useLexicalScope()[0].value++, 's_onClick', [count])
        );
        return (
          <button
            onFocus$={inlinedQrl(() => (useLexicalScope()[0].value += 2), 's_onFocus', [count])}
          >
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
      await trigger(container.element, 'button', ':window:click');
      expect(vNode).toMatchVDOM(
        <>
          <button>Count: {'124'}!</button>
        </>
      );
      await trigger(container.element, 'button', 'focus');
      expect(vNode).toMatchVDOM(
        <>
          <button>Count: {'126'}!</button>
        </>
      );
    });
  });

  describe(render.name + ': useOnWindow', () => {
    it('should update value', async () => {
      const Counter = component$((props: { initial: number }) => {
        const count = useSignal(props.initial);
        useOnWindow(
          'click',
          inlinedQrl(() => useLexicalScope()[0].value++, 's_onClick', [count])
        );
        return <button>Count: {count.value}!</button>;
      });

      const { vNode, container } = await render(<Counter initial={123} />, { debug });
      expect(vNode).toMatchVDOM(
        <>
          <button>Count: {'123'}!</button>
        </>
      );

      await trigger(container.element, 'button', ':window:click');
      expect(vNode).toMatchVDOM(
        <>
          <button>Count: {'124'}!</button>
        </>
      );
    });

    it('should update value with multiple useOnWindow', async () => {
      const Counter = component$((props: { initial: number }) => {
        const count = useSignal(props.initial);
        useOnWindow(
          'click',
          inlinedQrl(() => useLexicalScope()[0].value++, 's_onClick', [count])
        );
        useOnWindow(
          'focus',
          inlinedQrl(
            () => {
              useLexicalScope()[0].value += 2;
            },
            's_onFocus',
            [count]
          )
        );
        useVisibleTaskQrl(
          inlinedQrl(() => (useLexicalScope()[0].value += 2), 's_visibleTask', [count])
        );
        return <button>Count: {count.value}!</button>;
      });

      const { vNode, container } = await render(<Counter initial={123} />, { debug });
      expect(vNode).toMatchVDOM(
        <>
          <button>Count: {'123'}!</button>
        </>
      );
      await trigger(container.element, 'button', 'qvisible');
      expect(vNode).toMatchVDOM(
        <>
          <button>Count: {'125'}!</button>
        </>
      );
      await trigger(container.element, 'button', ':window:click');
      expect(vNode).toMatchVDOM(
        <>
          <button>Count: {'126'}!</button>
        </>
      );
      await trigger(container.element, 'button', ':window:focus');
      expect(vNode).toMatchVDOM(
        <>
          <button>Count: {'128'}!</button>
        </>
      );
    });

    it('should update value with mixed listeners', async () => {
      const Counter = component$((props: { initial: number }) => {
        const count = useSignal(props.initial);
        useOnDocument(
          'click',
          inlinedQrl(() => useLexicalScope()[0].value++, 's_onClick', [count])
        );
        return (
          <button
            onFocus$={inlinedQrl(() => (useLexicalScope()[0].value += 2), 's_onFocus', [count])}
          >
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
      await trigger(container.element, 'button', ':document:click');
      expect(vNode).toMatchVDOM(
        <>
          <button>Count: {'124'}!</button>
        </>
      );
      await trigger(container.element, 'button', 'focus');
      expect(vNode).toMatchVDOM(
        <>
          <button>Count: {'126'}!</button>
        </>
      );
    });
  });

  it(render.name + ': should update value with useOn, useOnDocument and useOnWindow', async () => {
    const Counter = component$((props: { initial: number }) => {
      const count = useSignal(props.initial);
      useOn(
        'click',
        inlinedQrl(() => useLexicalScope()[0].value++, 's_onClick', [count])
      );
      useOnWindow(
        'focus',
        inlinedQrl(
          () => {
            useLexicalScope()[0].value += 2;
          },
          's_onFocus',
          [count]
        )
      );
      useOnDocument(
        'blur',
        inlinedQrl(
          () => {
            useLexicalScope()[0].value += 3;
          },
          's_onBlur',
          [count]
        )
      );
      useVisibleTaskQrl(
        inlinedQrl(() => (useLexicalScope()[0].value += 2), 's_visibleTask', [count])
      );
      return (
        <button
          onResize$={inlinedQrl(() => (useLexicalScope()[0].value += 4), 's_onResize', [count])}
        >
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
    await trigger(container.element, 'button', 'qvisible');
    expect(vNode).toMatchVDOM(
      <>
        <button>Count: {'125'}!</button>
      </>
    );
    await trigger(container.element, 'button', 'click');
    expect(vNode).toMatchVDOM(
      <>
        <button>Count: {'126'}!</button>
      </>
    );
    await trigger(container.element, 'button', ':window:focus');
    expect(vNode).toMatchVDOM(
      <>
        <button>Count: {'128'}!</button>
      </>
    );
    await trigger(container.element, 'button', ':document:blur');
    expect(vNode).toMatchVDOM(
      <>
        <button>Count: {'131'}!</button>
      </>
    );
    await trigger(container.element, 'button', 'resize');
    expect(vNode).toMatchVDOM(
      <>
        <button>Count: {'135'}!</button>
      </>
    );
  });
});

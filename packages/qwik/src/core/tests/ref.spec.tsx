import {
  Fragment as Component,
  Fragment as Signal,
  component$,
  createContextId,
  useContext,
  useContextProvider,
  useSignal,
  useStore,
  useVisibleTask$,
} from '@qwik.dev/core';
import { domRender, ssrRenderToDom, trigger } from '@qwik.dev/core/testing';
import { describe, expect, it } from 'vitest';
import { isElement } from '../../testing/html';

const debug = false; //true;
Error.stackTraceLimit = 100;

describe.each([
  { render: ssrRenderToDom }, //
  { render: domRender }, //
])('$render.name: ref', ({ render }) => {
  describe('useVisibleTask$', () => {
    it('should handle ref prop', async () => {
      const Cmp = component$(() => {
        const v = useSignal<Element>();
        useVisibleTask$(() => {
          v.value!.textContent = 'Abcd';
        });
        return <p ref={v}>Hello Qwik</p>;
      });

      const { document } = await render(<Cmp />, { debug });

      if (render === ssrRenderToDom) {
        await trigger(document.body, 'p', 'qvisible');
      }

      await expect(document.querySelector('p')).toMatchDOM(<p>Abcd</p>);
    });
  });

  it('should execute function', async () => {
    (global as any).logs = [] as string[];
    const Cmp = component$(() => {
      return (
        <div
          ref={(element) => {
            (global as any).logs.push('ref function', element);
          }}
        ></div>
      );
    });

    const { vNode } = await render(<Cmp />, { debug });

    expect(vNode).toMatchVDOM(
      <Component>
        <div></div>
      </Component>
    );

    expect((global as any).logs[0]).toEqual('ref function');
    expect((global as any).logs[1]).toBeDefined();
    (global as any).logs = undefined;
  });

  it('should serialize array of refs', async () => {
    (globalThis as any).element = [] as HTMLElement[];

    const Parent = component$(() => {
      const childElements = useSignal<HTMLElement[]>([]);

      useVisibleTask$(() => {
        (globalThis as any).element.push(childElements.value[0]);
      });

      return <div ref={(element) => childElements.value.push(element)}></div>;
    });

    const { document } = await render(<Parent />, { debug });

    if (ssrRenderToDom === render) {
      await trigger(document.body, 'div', 'qvisible');
    }

    expect(isElement((globalThis as any).element[0])).toBeTruthy();
    (globalThis as any).element = undefined;
  });

  it('should serialize object of refs', async () => {
    (globalThis as any).element = [] as HTMLElement[];

    const Parent = component$(() => {
      const childElements = useSignal<{ obj: HTMLElement[] }>({ obj: [] });

      useVisibleTask$(() => {
        (globalThis as any).element.push(childElements.value.obj[0]);
      });

      return <div ref={(element) => childElements.value.obj.push(element)}></div>;
    });

    const { document } = await render(<Parent />, { debug });

    if (ssrRenderToDom === render) {
      await trigger(document.body, 'div', 'qvisible');
    }

    expect(isElement((globalThis as any).element[0])).toBeTruthy();
    (globalThis as any).element = undefined;
  });

  it('should serialize refs inside store', async () => {
    (globalThis as any).element = [] as HTMLElement[];

    const Parent = component$(() => {
      const childElements = useStore<{ obj: HTMLElement[] }>({ obj: [] });

      useVisibleTask$(() => {
        (globalThis as any).element.push(childElements.obj[0]);
      });

      return <div ref={(element) => childElements.obj.push(element)}></div>;
    });

    const { document } = await render(<Parent />, { debug });

    if (ssrRenderToDom === render) {
      await trigger(document.body, 'div', 'qvisible');
    }

    expect(isElement((globalThis as any).element[0])).toBeTruthy();
    (globalThis as any).element = undefined;
  });

  describe('should serialize refs inside context', () => {
    it('should serialize refs from child component', async () => {
      (globalThis as any).element = [] as HTMLElement[];

      const contextId = createContextId('test');

      const Child = component$(() => {
        const store = useContext<any>(contextId);
        return <span ref={(element) => store.refs.push(element)}></span>;
      });

      const Parent = component$(() => {
        const store = useStore({
          refs: [],
        });
        useContextProvider(contextId, store);
        useVisibleTask$(() => {
          (globalThis as any).element.push(store.refs[0]);
        });
        return (
          <div>
            <Child />
          </div>
        );
      });

      const { document } = await render(<Parent />, { debug });

      if (ssrRenderToDom === render) {
        await trigger(document.body, 'div', 'qvisible');
      }

      expect(isElement((globalThis as any).element[0])).toBeTruthy();
      (globalThis as any).element = undefined;
    });

    it('should serialize refs from parent component', async () => {
      (globalThis as any).element = [] as HTMLElement[];

      const contextId = createContextId('test');

      const Child = component$(() => {
        useContext<any>(contextId);
        return <span></span>;
      });

      const Parent = component$(() => {
        const store = useStore<any>({
          refs: [],
        });
        useContextProvider(contextId, store);
        useVisibleTask$(() => {
          (globalThis as any).element.push(store.refs[0]);
        });
        return (
          <div ref={(element) => store.refs.push(element)}>
            <Child />
          </div>
        );
      });

      const { document } = await render(<Parent />, { debug });

      if (ssrRenderToDom === render) {
        await trigger(document.body, 'div', 'qvisible');
      }

      expect(isElement((globalThis as any).element[0])).toBeTruthy();
      (globalThis as any).element = undefined;
    });
  });

  it('should skip null refs', async () => {
    const Cmp = component$(() => {
      return <div ref={null!}></div>;
    });

    const { vNode } = await render(<Cmp />, { debug });

    expect(vNode).toMatchVDOM(
      <Component>
        <div></div>
      </Component>
    );
  });

  it('should skip undefined refs', async () => {
    const Cmp = component$(() => {
      return <div ref={undefined}></div>;
    });

    const { vNode } = await render(<Cmp />, { debug });

    expect(vNode).toMatchVDOM(
      <Component>
        <div></div>
      </Component>
    );
  });

  it('should track element ref', async () => {
    const Cmp = component$(() => {
      const element = useSignal<HTMLDivElement>();
      const signal = useSignal(0);

      useVisibleTask$(({ track }) => {
        track(element);
        signal.value++;
      });

      return (
        <div>
          <div ref={element}>Test</div>
          {signal.value}
        </div>
      );
    });

    const { vNode, document } = await render(<Cmp />, { debug });
    if (render === ssrRenderToDom) {
      await trigger(document.body, 'div', 'qvisible');
    }

    expect(vNode).toMatchVDOM(
      <Component>
        <div>
          <div>Test</div>
          <Signal ssr-required>1</Signal>
        </div>
      </Component>
    );
  });
});

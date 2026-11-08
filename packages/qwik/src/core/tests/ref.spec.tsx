import {
  component$,
  useSignal,
  createContextId,
  useContext,
  useContextProvider,
  useStore,
  useVisibleTask$,
} from '@qwik.dev/core';
import { describe, expect, it, onTestFinished } from 'vitest';
import { testRenderer } from '../test-utils';
import { triggerAll } from './test-hooks';
import { trigger } from '@qwik.dev/core/testing';

const { name, render } = testRenderer;

describe(`${name}: ref`, () => {
  it('runs a function ref once when its element is created', async () => {
    const App = component$(() => {
      const calls: string[] = [];
      return (
        <section>
          <div ref={() => calls.push('ref')}>target</div>
          <span>{calls.length}</span>
        </section>
      );
    });

    const { container, cleanup } = await render(App);

    expect(container.querySelector('span')?.textContent).toBe('1');
    cleanup();
  });

  it('restores a forwarded signal ref as the matching DOM element', async () => {
    const App = component$(() => {
      const input = useSignal<Element>();
      const tag = useSignal('pending');
      return (
        <section>
          <input ref={input} />
          <button onClick$={() => (tag.value = input.value?.tagName ?? 'missing')}>read</button>
          <span>{tag.value}</span>
        </section>
      );
    });

    const { container, cleanup, qwikLoader } = await render(App);
    await qwikLoader?.dispatch(container.querySelector('button')!, 'click');

    expect(container.querySelector('span')?.textContent).toBe('INPUT');
    cleanup();
  });

  it('applies a ref forwarded through opaque component props', async () => {
    const Field = component$((props: Record<string, unknown>) => <input {...props} />);
    const App = component$(() => {
      const input = useSignal<Element>();
      const tag = useSignal('pending');
      return (
        <section>
          <Field ref={input} />
          <button onClick$={() => (tag.value = input.value?.tagName ?? 'missing')}>read</button>
          <span>{tag.value}</span>
        </section>
      );
    });

    const { container, cleanup, qwikLoader } = await render(App);
    await qwikLoader?.dispatch(container.querySelector('button')!, 'click');

    expect(container.querySelector('span')?.textContent).toBe('INPUT');
    cleanup();
  });

  it('runs a ref when a branch creates a new element', async () => {
    const App = component$(() => {
      const visible = useSignal(false);
      const calls = useSignal(0);
      return (
        <section>
          <button onClick$={() => (visible.value = true)}>show</button>
          {visible.value && <i ref={() => calls.value++}>target</i>}
          <span>{calls.value}</span>
        </section>
      );
    });

    const { container, cleanup, qwikLoader } = await render(App);
    expect(container.querySelector('span')?.textContent).toBe('0');

    await qwikLoader?.dispatch(container.querySelector('button')!, 'click');

    expect(container.querySelector('i')?.textContent).toBe('target');
    expect(container.querySelector('span')?.textContent).toBe('1');
    cleanup();
  });
});

const debug = false;

describe(`${name}: ref`, () => {
  describe('useVisibleTask$', () => {
    it('should handle ref prop', async () => {
      const Cmp = component$(() => {
        const v = useSignal<Element>();
        useVisibleTask$(() => {
          v.value!.textContent = 'Abcd';
        });
        return <p ref={v}>Hello Qwik</p>;
      });

      const { container, cleanup, flush } = await render(Cmp, { debug });
      onTestFinished(cleanup);

      await triggerAll(container, 'p', 'qvisible');
      await flush();

      await expect(container.querySelector('p')!.textContent).toBe('Abcd');
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

    const { container, cleanup } = await render(Cmp, { debug });
    onTestFinished(cleanup);

    expect(container.querySelectorAll('div')).toHaveLength(1);
    expect(container.querySelector('div')!.textContent).toBe('');

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

    const { container, cleanup, flush } = await render(Parent, { debug });
    onTestFinished(cleanup);

    await triggerAll(container, 'div', 'qvisible');
    await flush();

    expect((globalThis as any).element[0]?.nodeType === 1).toBeTruthy();
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

    const { container, cleanup, flush } = await render(Parent, { debug });
    onTestFinished(cleanup);

    await triggerAll(container, 'div', 'qvisible');
    await flush();

    expect((globalThis as any).element[0]?.nodeType === 1).toBeTruthy();
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

    const { container, cleanup, flush } = await render(Parent, { debug });
    onTestFinished(cleanup);

    await triggerAll(container, 'div', 'qvisible');
    await flush();

    expect((globalThis as any).element[0]?.nodeType === 1).toBeTruthy();
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

      const { container, cleanup, flush } = await render(Parent, { debug });
      onTestFinished(cleanup);

      await triggerAll(container, 'div', 'qvisible');
      await flush();

      expect((globalThis as any).element[0]?.nodeType === 1).toBeTruthy();
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

      const { container, cleanup, flush } = await render(Parent, { debug });
      onTestFinished(cleanup);

      await triggerAll(container, 'div', 'qvisible');
      await flush();

      expect((globalThis as any).element[0]?.nodeType === 1).toBeTruthy();
      (globalThis as any).element = undefined;
    });
  });

  it('should skip null refs', async () => {
    const Cmp = component$(() => {
      return <div ref={null!}></div>;
    });

    const { container, cleanup } = await render(Cmp, { debug });
    onTestFinished(cleanup);

    expect(container.querySelectorAll('div')).toHaveLength(1);
    expect(container.querySelector('div')!.textContent).toBe('');
  });

  it('should skip undefined refs', async () => {
    const Cmp = component$(() => {
      return <div ref={undefined}></div>;
    });

    const { container, cleanup } = await render(Cmp, { debug });
    onTestFinished(cleanup);

    expect(container.querySelectorAll('div')).toHaveLength(1);
    expect(container.querySelector('div')!.textContent).toBe('');
  });

  it('should track element ref', async () => {
    const Cmp = component$(() => {
      const element = useSignal<HTMLDivElement>();
      const signal = useSignal(0);

      useVisibleTask$(() => {
        element.value;
        signal.value++;
      });

      return (
        <div id="ref-test">
          <div ref={element}>Test</div>
          {signal.value}
        </div>
      );
    });

    const { container, cleanup, flush } = await render(Cmp, { debug });
    onTestFinished(cleanup);
    await trigger(container, '[id="ref-test"]', 'qvisible');
    await flush();

    expect(container.querySelectorAll('div')).toHaveLength(2);
    expect(container.querySelector('div')!.textContent).toBe('Test1');
    expect(container.querySelector('div')!.getAttribute('id')).toBe('ref-test');
    expect(container.querySelectorAll('div')[1]!.textContent).toBe('Test');
    expect(container.querySelectorAll('div')[1]!.getAttribute('id')).toBe(null);
  });
});

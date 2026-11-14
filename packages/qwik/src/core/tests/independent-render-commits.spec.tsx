import { component$, useSignal, useVisibleTask$, type Signal } from '@qwik.dev/core';
import { trigger, waitForDrain } from '@qwik.dev/core/testing';
import { describe, expect, it } from 'vitest';
import { domRender, ssrRenderToDom } from '../../testing/rendering.unit-util';

function createGate() {
  let release!: () => void;
  let enter!: () => void;
  const wait = new Promise<void>((resolve) => (release = resolve));
  const entered = new Promise<void>((resolve) => (enter = resolve));
  const state = { wait, enter, order: [] as string[], afterFlush: [] as string[] };
  (globalThis as any).__independentRenderCommit = state;
  return { state, entered, release };
}

const Counter = component$<{ count: number }>(({ count }) => {
  const value = Number(count);
  (globalThis as any).__independentRenderCommit.order.push('counter');
  return <span id="count">{value}</span>;
});

const SlowToast = component$<{ count: number }>(({ count }) => {
  const state = (globalThis as any).__independentRenderCommit;
  state.order.push('toast');
  if (count === 0) {
    return <span id="toast">old toast</span>;
  }
  state.enter();
  return state.wait.then(() => <span id="toast">toast {count}</span>);
});

const Tail = component$<{ count: number }>(({ count }) => {
  const value = Number(count);
  (globalThis as any).__independentRenderCommit.order.push('tail');
  return <span id="tail">{value}</span>;
});

describe.each([{ render: domRender }, { render: ssrRenderToDom }])(
  '$render.name: independent render commits',
  ({ render }) => {
    it('commits a finished counter while its sibling waits without rendering later siblings early', async () => {
      const gate = createGate();
      const App = component$(() => {
        const count = useSignal(0);
        const value = count.value;
        (globalThis as any).__independentRenderCommit.order.push('parent');
        return (
          <section>
            <button id="update" onClick$={() => count.value++}>
              update
            </button>
            <Counter count={value} />
            <SlowToast count={value} />
            <Tail count={value} />
          </section>
        );
      });
      const { document, container } = await render(<App />);
      gate.state.order.length = 0;
      try {
        await trigger(document.body, '#update', 'click', {}, { waitForIdle: false });
        await gate.entered;
        expect(document.querySelector('#count')?.textContent).toBe('1');
        expect(document.querySelector('#toast')?.textContent).toBe('old toast');
        expect(document.querySelector('#tail')?.textContent).toBe('0');
        expect(gate.state.order).toEqual(['parent', 'counter', 'toast']);
      } finally {
        gate.release();
        await waitForDrain(container);
      }
      expect(document.querySelector('#toast')?.textContent).toBe('toast 1');
      expect(document.querySelector('#tail')?.textContent).toBe('1');
      expect(gate.state.order).toEqual(['parent', 'counter', 'toast', 'tail']);
    });

    it('runs visible tasks after their own subtree is committed while a sibling waits', async () => {
      const gate = createGate();
      const ObservedCounter = component$<{ count: number }>(({ count }) => {
        const value = Number(count);
        const element = useSignal<Element>();
        useVisibleTask$(({ track }) => {
          track(() => Number(count));
          (globalThis as any).__independentRenderCommit.afterFlush.push(element.value?.textContent);
        });
        return (
          <span id="observed-count" ref={element}>
            {value}
          </span>
        );
      });
      const App = component$(() => {
        const count = useSignal(0);
        const value = count.value;
        return (
          <section>
            <button id="update" onClick$={() => count.value++}>
              update
            </button>
            <ObservedCounter count={value} />
            <SlowToast count={value} />
          </section>
        );
      });
      const { document, container } = await render(<App />);
      await trigger(document.body, '#observed-count', 'qvisible');
      gate.state.afterFlush.length = 0;
      try {
        await trigger(document.body, '#update', 'click', {}, { waitForIdle: false });
        await gate.entered;
        expect(document.querySelector('#observed-count')?.textContent).toBe('1');
        expect(gate.state.afterFlush).toEqual(['1']);
        expect(document.querySelector('#toast')?.textContent).toBe('old toast');
      } finally {
        gate.release();
        await waitForDrain(container);
      }
      expect(gate.state.afterFlush).toEqual(['1']);
    });

    it('commits every finished sibling while a later one waits', async () => {
      const gate = createGate();
      const App = component$(() => {
        const count = useSignal(0);
        const value = count.value;
        return (
          <section>
            <button id="update" onClick$={() => count.value++}>
              update
            </button>
            <Counter count={value} />
            <Tail count={value} />
            <SlowToast count={value} />
          </section>
        );
      });
      const { document, container } = await render(<App />);
      try {
        await trigger(document.body, '#update', 'click', {}, { waitForIdle: false });
        await gate.entered;
        expect(document.querySelector('#count')?.textContent).toBe('1');
        expect(document.querySelector('#tail')?.textContent).toBe('1');
        expect(document.querySelector('#toast')?.textContent).toBe('old toast');
      } finally {
        gate.release();
        await waitForDrain(container);
      }
      expect(document.querySelector('#toast')?.textContent).toBe('toast 1');
    });

    it('commits all siblings together when none of them waits', async () => {
      const gate = createGate();
      const Row = component$<{ count: number }>(({ count }) => {
        const value = Number(count);
        const element = useSignal<Element>();
        useVisibleTask$(({ track }) => {
          track(() => Number(count));
          (globalThis as any).__independentRenderCommit.afterFlush.push(
            element.value?.parentElement?.textContent
          );
        });
        return <span ref={element}>{value}</span>;
      });
      const App = component$(() => {
        const count = useSignal(0);
        const value = count.value;
        return (
          <section>
            <button id="update" onClick$={() => count.value++}>
              update
            </button>
            <p id="rows">
              <Row count={value} />
              <Row count={value} />
              <Row count={value} />
            </p>
          </section>
        );
      });
      const { document } = await render(<App />);
      await trigger(document.body, '#rows span', 'qvisible');
      gate.state.afterFlush.length = 0;
      await trigger(document.body, '#update', 'click');
      expect(gate.state.afterFlush).toEqual(['111', '111', '111']);
    });

    it('runs a visible task only after its own waiting render is committed', async () => {
      const gate = createGate();
      const ObservedToast = component$<{ count: number }>(({ count }) => {
        const state = (globalThis as any).__independentRenderCommit;
        const element = useSignal<Element>();
        useVisibleTask$(({ track }) => {
          track(() => Number(count));
          (globalThis as any).__independentRenderCommit.afterFlush.push(element.value?.textContent);
        });
        if (count === 0) {
          return <span ref={element}>old toast</span>;
        }
        state.enter();
        return state.wait.then(() => <span ref={element}>toast {count}</span>);
      });
      const App = component$(() => {
        const count = useSignal(0);
        const value = count.value;
        return (
          <section>
            <button id="update" onClick$={() => count.value++}>
              update
            </button>
            <ObservedToast count={value} />
          </section>
        );
      });
      const { document, container } = await render(<App />);
      await trigger(document.body, 'span', 'qvisible');
      gate.state.afterFlush.length = 0;
      try {
        await trigger(document.body, '#update', 'click', {}, { waitForIdle: false });
        await gate.entered;
        expect(gate.state.afterFlush).toEqual([]);
      } finally {
        gate.release();
        await waitForDrain(container);
      }
      expect(gate.state.afterFlush).toEqual(['toast 1']);
    });

    it('keeps the previous page until a replacement subtree finishes', async () => {
      const gate = createGate();
      const Page = component$(() => (
        <section id="new-page">
          <h1>new page</h1>
          <SlowToast count={1} />
        </section>
      ));
      const App = component$(() => {
        const next = useSignal(false);
        return (
          <div>
            <button id="navigate" onClick$={() => (next.value = true)}>
              navigate
            </button>
            {next.value ? <Page /> : <main id="old-page">old page</main>}
          </div>
        );
      });
      const { document, container } = await render(<App />);
      const previous = document.querySelector('#old-page');
      try {
        await trigger(document.body, '#navigate', 'click', {}, { waitForIdle: false });
        await gate.entered;
        expect(previous?.isConnected).toBe(true);
        expect(document.querySelector('#old-page')).toBe(previous);
        expect(document.querySelector('#new-page')).toBeFalsy();
      } finally {
        gate.release();
        await waitForDrain(container);
      }
      expect(document.querySelector('#old-page')).toBeFalsy();
      expect(document.querySelector('#new-page')?.textContent).toBe('new pagetoast 1');
    });

    it('keeps keyed reorders together until their inserted subtree is ready', async () => {
      const gate = createGate();
      const Row = component$<{ name: string }>(({ name }) => (
        <label data-row={name}>
          <input value={name} />
        </label>
      ));
      const App = component$(() => {
        const next = useSignal(false);
        const changed = next.value;
        return (
          <section>
            <button id="reorder" onClick$={() => (next.value = true)}>
              reorder
            </button>
            {changed
              ? [
                  <Row key="b" name="b" />,
                  <SlowToast key="slow" count={1} />,
                  <Row key="a" name="a" />,
                ]
              : [<Row key="a" name="a" />, <Row key="b" name="b" />]}
          </section>
        );
      });
      const { document, container } = await render(<App />);
      const input = document.querySelector('[data-row="a"] input') as HTMLInputElement;
      input.value = 'edited';
      const rows = () =>
        Array.from(document.querySelectorAll('[data-row]')).map((row) =>
          row.getAttribute('data-row')
        );
      try {
        await trigger(document.body, '#reorder', 'click', {}, { waitForIdle: false });
        await gate.entered;
        expect(rows()).toEqual(['a', 'b']);
        expect(input.isConnected).toBe(true);
      } finally {
        gate.release();
        await waitForDrain(container);
      }
      expect(rows()).toEqual(['b', 'a']);
      expect(document.querySelector('[data-row="a"] input')).toBe(input);
      expect(input.value).toBe('edited');
    });

    it('holds back a parent that finished waiting until its waiting child is ready', async () => {
      const gate = createGate();
      let releaseChild!: () => void;
      let enterChild!: () => void;
      const childEntered = new Promise<void>((resolve) => (enterChild = resolve));
      (globalThis as any).__independentRenderCommitChild = {
        wait: new Promise<void>((resolve) => (releaseChild = resolve)),
        enter: enterChild,
      };
      const SlowChild = component$(() => {
        const child = (globalThis as any).__independentRenderCommitChild;
        child.enter();
        return child.wait.then(() => <span id="child">child</span>);
      });
      const SlowParent = component$<{ count: number }>(({ count }) => {
        const state = (globalThis as any).__independentRenderCommit;
        if (count === 0) {
          return <span id="toast">old toast</span>;
        }
        state.enter();
        return state.wait.then(() => (
          <div id="wrapper">
            <SlowChild />
          </div>
        ));
      });
      const App = component$(() => {
        const count = useSignal(0);
        return (
          <section>
            <button id="update" onClick$={() => count.value++}>
              update
            </button>
            <SlowParent count={count.value} />
          </section>
        );
      });
      const { document, container } = await render(<App />);
      try {
        await trigger(document.body, '#update', 'click', {}, { waitForIdle: false });
        await gate.entered;
        gate.release();
        await childEntered;
        expect(document.querySelector('#wrapper')).toBeFalsy();
        expect(document.querySelector('#toast')?.textContent).toBe('old toast');
      } finally {
        gate.release();
        releaseChild();
        await waitForDrain(container);
      }
      expect(document.querySelector('#wrapper')?.textContent).toBe('child');
      expect(document.querySelector('#toast')).toBeFalsy();
    });

    it('does not restore a waiting sibling after its parent removes it', async () => {
      const gate = createGate();
      const Inner = component$<{ count: Signal<number> }>(({ count }) => {
        const value = count.value;
        return (
          <div>
            <Counter count={value} />
            <SlowToast count={value} />
          </div>
        );
      });
      const App = component$(() => {
        const count = useSignal(0);
        const visible = useSignal(true);
        const shown = visible.value;
        return (
          <section>
            <button id="update" onClick$={() => count.value++}>
              update
            </button>
            <button id="remove" onClick$={() => (visible.value = false)}>
              remove
            </button>
            {shown ? <Inner count={count} /> : <span id="removed">removed</span>}
          </section>
        );
      });
      const { document, container } = await render(<App />);
      try {
        await trigger(document.body, '#update', 'click', {}, { waitForIdle: false });
        await gate.entered;
        await trigger(document.body, '#remove', 'click', {}, { waitForIdle: false });
        await waitForDrain(container);
        expect(document.querySelector('#toast')).toBeFalsy();
        expect(document.querySelector('#removed')?.textContent).toBe('removed');
      } finally {
        gate.release();
        await waitForDrain(container);
      }
      expect(document.querySelector('#toast')).toBeFalsy();
      expect(document.querySelector('#removed')?.textContent).toBe('removed');
    });
  }
);

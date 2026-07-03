import {
  Fragment as Component,
  Fragment as Signal,
  component$,
  useSignal,
  useStore,
  useTask$,
  useVisibleTask$,
} from '@qwik.dev/core';
import { domRender, ssrRenderToDom, trigger, waitForDrain } from '@qwik.dev/core/testing';
import { describe, expect, it } from 'vitest';
import { _useHmr } from '../internal';
import { VNodeFlags } from '../client/types';
import { ELEMENT_SEQ } from '../../server/qwik-copy';
import { Task } from '../use/use-task';
import { ErrorProvider } from '../../testing/rendering.unit-util';

const debug = false; //true;
Error.stackTraceLimit = 100;

/**
 * Helper to fire the qHmr document event that triggers HMR re-renders.
 *
 * Uses the kebab-cased `d:q-hmr` form so `trigger` finds elements with the `q-d:q-hmr` attribute
 * set by `useOnDocument('qHmr', …)`.
 */
async function triggerHmr(container: any, files: string[]) {
  const t = Date.now();
  container.document.__hmrT = t;
  await trigger(container.element, null, 'd:q-hmr', {
    detail: { files, t },
  });
  // markVNodeDirty schedules cursor work as a microtask. Ensure it runs.
  await true;
  await waitForDrain(container);
}

// ── domRender tests ─────────────────────────────────────────────────────
// These cover the full end-to-end HMR flow: handler dispatch → markVNodeDirty
// → cursor processing → component re-render with state preservation.

describe('domRender: HMR', () => {
  const render = domRender;

  /**
   * Scenario: **client-rendered component** — the QRL has a live `symbolFn`. Fire HMR _without_ any
   * prior user interaction.
   */
  it('should re-render a fresh client component and preserve initial state', async () => {
    const log: string[] = [];

    const Counter = component$(() => {
      log.push('render');
      const count = useSignal(42);
      _useHmr('test-file.tsx');
      return (
        <div data-qwik-inspector="test-file.tsx:1:1">
          <span>{count.value}</span>
        </div>
      );
    });

    const { vNode, container } = await render(<Counter />, { debug });
    const rendersBeforeHmr = log.length;

    await triggerHmr(container, ['test-file.tsx']);

    expect(log.length).toBeGreaterThan(rendersBeforeHmr);

    // State is preserved (still 42)
    expect(vNode).toMatchVDOM(
      <Component>
        <div data-qwik-inspector="test-file.tsx:1:1">
          <span>
            <Signal>{'42'}</Signal>
          </span>
        </div>
      </Component>
    );
  });

  it('re-runs a visible task whose source file changed, running its prior cleanup first', async () => {
    const log: string[] = [];

    const Counter = component$(() => {
      log.push('render');
      const count = useSignal(0);
      useVisibleTask$(() => {
        log.push('task-run');
        return () => {
          log.push('task-cleanup');
        };
      });
      _useHmr('vt.tsx');
      return (
        <div data-qwik-inspector="vt.tsx:1:1">
          <span>{count.value}</span>
        </div>
      );
    });

    const { vNode, container } = await render(<Counter />, { debug });

    // domRender runs the visible task eagerly on mount.
    expect(log.filter((l) => l === 'task-run').length).toBe(1);
    const rendersBeforeHmr = log.filter((l) => l === 'render').length;

    // Match against the task QRL's real dev file so the changed-file check fires.
    const seq = (container as any).getHostProp(vNode, ELEMENT_SEQ) as unknown[];
    const task = seq.find((item) => item instanceof Task) as any;
    const taskFile = task.$qrl$.dev.file as string;

    await triggerHmr(container, ['vt.tsx', taskFile]);

    expect(log.filter((l) => l === 'render').length).toBeGreaterThan(rendersBeforeHmr);
    expect(log.filter((l) => l === 'task-cleanup').length).toBe(1);
    expect(log.filter((l) => l === 'task-run').length).toBe(2);
  });

  it('re-runs a regular task whose source file changed', async () => {
    const log: string[] = [];

    const Counter = component$(() => {
      log.push('render');
      const count = useSignal(0);
      useTask$(() => {
        log.push('task-run');
      });
      _useHmr('rt.tsx');
      return <div data-qwik-inspector="rt.tsx:1:1">{count.value}</div>;
    });

    const { vNode, container } = await render(<Counter />, { debug });
    expect(log.filter((l) => l === 'task-run').length).toBe(1);

    const seq = (container as any).getHostProp(vNode, ELEMENT_SEQ) as unknown[];
    const task = seq.find((item) => item instanceof Task) as any;
    const taskFile = task.$qrl$.dev.file as string;

    await triggerHmr(container, ['rt.tsx', taskFile]);

    expect(log.filter((l) => l === 'task-run').length).toBe(2);
  });

  it('does not re-run a task whose source file did not change', async () => {
    const log: string[] = [];

    const Counter = component$(() => {
      log.push('render');
      useVisibleTask$(() => {
        log.push('task-run');
      });
      _useHmr('host.tsx');
      return <div data-qwik-inspector="host.tsx:1:1">x</div>;
    });

    const { container } = await render(<Counter />, { debug });
    expect(log.filter((l) => l === 'task-run').length).toBe(1);

    // Only the component host file changed; the task's own file is unchanged, so it must not re-run.
    await triggerHmr(container, ['host.tsx']);

    expect(log.filter((l) => l === 'task-run').length).toBe(1);
  });

  it('does not re-render when a prefix-sibling file changes (foo.ts vs foo.tsx)', async () => {
    const log: string[] = [];

    const Counter = component$(() => {
      log.push('render');
      const count = useSignal(42);
      _useHmr('/src/foo.tsx');
      return (
        <div data-qwik-inspector="/src/foo.tsx:1:1">
          <span>{count.value}</span>
        </div>
      );
    });

    const { container } = await render(<Counter />, { debug });
    const rendersBeforeHmr = log.length;

    await triggerHmr(container, ['/src/foo.ts']);
    expect(log.length).toBe(rendersBeforeHmr);

    await triggerHmr(container, ['/src/foo.tsx']);
    expect(log.length).toBeGreaterThan(rendersBeforeHmr);
  });

  it('matches a query-suffixed devPath against the bare changed file', async () => {
    const log: string[] = [];

    const Counter = component$(() => {
      log.push('render');
      const count = useSignal(1);
      _useHmr('/src/bar.tsx?v=123');
      return (
        <div data-qwik-inspector="/src/bar.tsx:1:1">
          <span>{count.value}</span>
        </div>
      );
    });

    const { container } = await render(<Counter />, { debug });
    const rendersBeforeHmr = log.length;

    await triggerHmr(container, ['/src/bar.ts']);
    expect(log.length).toBe(rendersBeforeHmr);

    await triggerHmr(container, ['/src/bar.tsx']);
    expect(log.length).toBeGreaterThan(rendersBeforeHmr);
  });

  /**
   * Scenario: **interacted client component** — the QRL has been resolved. Interact first, then
   * fire HMR.
   */
  it('should re-render an interacted component and preserve mutated state', async () => {
    const log: string[] = [];

    const Counter = component$(() => {
      log.push('render');
      const count = useSignal(10);
      _useHmr('counter.tsx');
      return (
        <div data-qwik-inspector="counter.tsx:5:1">
          <button onClick$={() => count.value++}>
            <span>{count.value}</span>
          </button>
        </div>
      );
    });

    const { vNode, container } = await render(<Counter />, { debug });

    // Click to interact — increments count 10 → 11
    await trigger(container.element, 'button', 'click');

    expect(vNode).toMatchVDOM(
      <Component>
        <div data-qwik-inspector="counter.tsx:5:1">
          <button>
            <span>
              <Signal>{'11'}</Signal>
            </span>
          </button>
        </div>
      </Component>
    );

    const rendersBeforeHmr = log.length;

    await triggerHmr(container, ['counter.tsx']);

    expect(log.length).toBeGreaterThan(rendersBeforeHmr);

    // State is preserved at 11
    expect(vNode).toMatchVDOM(
      <Component>
        <div data-qwik-inspector="counter.tsx:5:1">
          <button>
            <span>
              <Signal>{'11'}</Signal>
            </span>
          </button>
        </div>
      </Component>
    );
  });

  it('should preserve store state across HMR', async () => {
    const log: string[] = [];

    const TodoApp = component$(() => {
      log.push('render');
      const store = useStore({ items: ['buy milk'], input: '' });
      _useHmr('todo.tsx');
      return (
        <div data-qwik-inspector="todo.tsx:1:1">
          <ul>
            {store.items.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>
      );
    });

    const { vNode, container } = await render(<TodoApp />, { debug });

    const rendersBeforeHmr = log.length;

    await triggerHmr(container, ['todo.tsx']);

    expect(log.length).toBeGreaterThan(rendersBeforeHmr);

    // Store state is preserved
    expect(vNode).toMatchVDOM(
      <Component>
        <div data-qwik-inspector="todo.tsx:1:1">
          <ul>
            <li>{'buy milk'}</li>
          </ul>
        </div>
      </Component>
    );
  });

  it('should ignore HMR events for non-matching files', async () => {
    const log: string[] = [];

    const Counter = component$(() => {
      log.push('render');
      const count = useSignal(0);
      _useHmr('my-component.tsx');
      return (
        <div data-qwik-inspector="my-component.tsx:1:1">
          <span>{count.value}</span>
        </div>
      );
    });

    const { container } = await render(<Counter />, { debug });
    const rendersBeforeHmr = log.length;

    await triggerHmr(container, ['other-file.tsx']);

    expect(log.length).toBe(rendersBeforeHmr);
  });

  it('should re-render after HMR removes and restores a stateful component', async () => {
    const log: string[] = [];
    const state: {
      phase: 'initial' | 'removed' | 'restored' | 'removed-again' | 'restored-again';
    } = { phase: 'initial' };

    const StatefulChild = component$(() => {
      const store = useStore({ label: 'qwik-state' });
      return (
        <section data-testid={state.phase.startsWith('restored') ? 'hmr-restored' : 'hmr-initial'}>
          {store.label}:{state.phase}
        </section>
      );
    });

    const Parent = component$(() => {
      log.push(state.phase);
      _useHmr('parent.tsx');
      return (
        <div data-qwik-inspector="parent.tsx:1:1">
          {state.phase !== 'removed' && state.phase !== 'removed-again' && <StatefulChild />}
        </div>
      );
    });

    const { container } = await render(<Parent />, { debug });
    expect(container.element.querySelector('[data-testid="hmr-initial"]')).toBeTruthy();

    state.phase = 'removed';
    await triggerHmr(container, ['parent.tsx']);

    expect(log[log.length - 1]).toBe('removed');
    expect(container.element.querySelector('[data-testid="hmr-initial"]')).toBeFalsy();
    container.element.querySelector('[q-d\\:q-hmr]')?.removeAttribute('data-qwik-inspector');

    state.phase = 'restored';
    const rendersBeforeRestore = log.length;

    await triggerHmr(container, ['parent.tsx']);

    expect(log.length).toBeGreaterThan(rendersBeforeRestore);
    expect(container.element.querySelector('[data-testid="hmr-restored"]')?.textContent).toBe(
      'qwik-state:restored'
    );

    state.phase = 'removed-again';
    const rendersBeforeSecondRemove = log.length;

    await triggerHmr(container, ['parent.tsx']);

    expect(log.length).toBeGreaterThan(rendersBeforeSecondRemove);
    expect(log[log.length - 1]).toBe('removed-again');
    expect(container.element.querySelector('[data-testid="hmr-restored"]')).toBeFalsy();

    state.phase = 'restored-again';
    const rendersBeforeSecondRestore = log.length;

    await triggerHmr(container, ['parent.tsx']);

    expect(log.length).toBeGreaterThan(rendersBeforeSecondRestore);
    expect(container.element.querySelector('[data-testid="hmr-restored"]')?.textContent).toBe(
      'qwik-state:restored-again'
    );
  });

  it('does not re-render when the captured host has been deleted', async () => {
    const log: string[] = [];
    const Counter = component$(() => {
      log.push('render');
      _useHmr('deleted-host.tsx');
      return <div data-qwik-inspector="deleted-host.tsx:1:1">current</div>;
    });

    const { container, vNode } = await render(<Counter />, { debug });
    if (!vNode) {
      throw new Error('Expected rendered VNode');
    }
    vNode.flags |= VNodeFlags.Deleted;
    const rendersBeforeHmr = log.length;

    await triggerHmr(container, ['deleted-host.tsx']);

    expect(log.length).toBe(rendersBeforeHmr);
  });
});

// ── domRender: adaptive remount-on-throw ────────────────────────────────
// A re-run task doing non-idempotent setup (e.g. a canvas already transferred to an offscreen
// worker) throws on the reused DOM. Recovery remounts the host — fresh DOM + state — within HMR,
// with no full reload, bounded to one remount per HMR event.

describe('domRender: HMR remount-on-throw', () => {
  const render = domRender;

  /** Reads the changed-file the re-run check matches: the visible/regular task's own QRL dev file. */
  function taskFileOf(container: any, el: Element): string {
    const host = container.getParentHost(container.vNodeLocate(el));
    const seq = container.getHostProp(host, ELEMENT_SEQ) as unknown[];
    const task = seq.find((item) => item instanceof Task) as any;
    return task.$qrl$.dev.file as string;
  }

  /** Drains repeatedly so an async remount's follow-up cursor pass also settles. */
  async function drainAll(container: any) {
    for (let i = 0; i < 20; i++) {
      await Promise.resolve();
      await waitForDrain(container);
    }
  }

  it('remounts a component whose visible task throws on HMR re-run and recovers with fresh DOM', async () => {
    const log: string[] = [];

    const Child = component$(() => {
      log.push('render');
      const canvasRef = useSignal<Element>();
      useVisibleTask$(() => {
        log.push('task-run');
        const el = canvasRef.value! as any;
        if (el.transferred) {
          throw new Error('canvas already transferred');
        }
        el.transferred = true;
        log.push('transfer-ok');
      });
      _useHmr('child.tsx');
      return <canvas data-qwik-inspector="child.tsx:1:1" ref={canvasRef} />;
    });

    const Parent = component$(() => <div>{<Child />}</div>);

    const { container } = await render(
      <ErrorProvider>
        <Parent />
      </ErrorProvider>,
      { debug }
    );

    expect(log.filter((l) => l === 'transfer-ok').length).toBe(1);
    const firstCanvas = container.element.querySelector('canvas');
    expect(firstCanvas).toBeTruthy();

    const taskFile = taskFileOf(container, firstCanvas!);
    await triggerHmr(container, ['child.tsx', taskFile]);
    await drainAll(container);

    // Fresh mount succeeded on a brand-new canvas; no error surfaced, no full reload.
    expect(log.filter((l) => l === 'transfer-ok').length).toBe(2);
    expect(log.filter((l) => l === 'task-run').length).toBe(3);
    expect(ErrorProvider.error).toBe(null);
    const secondCanvas = container.element.querySelector('canvas');
    expect(secondCanvas).toBeTruthy();
    expect(secondCanvas).not.toBe(firstCanvas);
  });

  it('remounts at most once and surfaces the error when the fresh task also throws', async () => {
    const log: string[] = [];
    let runs = 0;

    const Child = component$(() => {
      log.push('render');
      const canvasRef = useSignal<Element>();
      useVisibleTask$(() => {
        log.push('task-run');
        runs++;
        if (runs > 1) {
          throw new Error('always throws after first run');
        }
      });
      _useHmr('broken.tsx');
      return <canvas data-qwik-inspector="broken.tsx:1:1" ref={canvasRef} />;
    });

    const Parent = component$(() => <div>{<Child />}</div>);

    const { container } = await render(
      <ErrorProvider>
        <Parent />
      </ErrorProvider>,
      { debug }
    );

    expect(log.filter((l) => l === 'task-run').length).toBe(1);
    const canvas = container.element.querySelector('canvas')!;
    const taskFile = taskFileOf(container, canvas);

    await triggerHmr(container, ['broken.tsx', taskFile]);
    await drainAll(container);

    // mount ok → HMR re-run throws → remount once → fresh run throws → error surfaced, loop stops.
    expect(log.filter((l) => l === 'task-run').length).toBe(3);
    expect(ErrorProvider.error).toBeInstanceOf(Error);
  });

  it('remounts only the throwing child, preserving sibling DOM and parent state', async () => {
    const siblingLog: string[] = [];

    const Sibling = component$(() => {
      siblingLog.push('render');
      const n = useSignal(0);
      return <button onClick$={() => n.value++}>{n.value}</button>;
    });

    const Child = component$(() => {
      const canvasRef = useSignal<Element>();
      useVisibleTask$(() => {
        const el = canvasRef.value! as any;
        if (el.transferred) {
          throw new Error('canvas already transferred');
        }
        el.transferred = true;
      });
      _useHmr('c.tsx');
      return <canvas data-qwik-inspector="c.tsx:1:1" ref={canvasRef} />;
    });

    const Parent = component$(() => (
      <div>
        <Sibling />
        <Child />
      </div>
    ));

    const { container } = await render(
      <ErrorProvider>
        <Parent />
      </ErrorProvider>,
      { debug }
    );

    // Mutate sibling state so we can prove it survives the child's remount.
    await trigger(container.element, 'button', 'click');
    expect(container.element.querySelector('button')?.textContent).toBe('1');
    const siblingButton = container.element.querySelector('button');
    const firstCanvas = container.element.querySelector('canvas');
    const siblingRendersBefore = siblingLog.length;

    const taskFile = taskFileOf(container, firstCanvas!);
    await triggerHmr(container, ['c.tsx', taskFile]);
    await drainAll(container);

    // Child got a fresh canvas; sibling was neither re-rendered nor recreated, keeping its state.
    expect(container.element.querySelector('canvas')).not.toBe(firstCanvas);
    expect(container.element.querySelector('button')).toBe(siblingButton);
    expect(container.element.querySelector('button')?.textContent).toBe('1');
    expect(siblingLog.length).toBe(siblingRendersBefore);
    expect(ErrorProvider.error).toBe(null);
  });

  it('remounts when a non-idempotent regular task throws on HMR re-run', async () => {
    const log: string[] = [];

    const Child = component$(() => {
      const store = useStore({ setUp: false });
      useTask$(() => {
        log.push('task-run');
        if (store.setUp) {
          throw new Error('regular setup is not repeatable');
        }
        store.setUp = true;
      });
      _useHmr('reg.tsx');
      return <span data-qwik-inspector="reg.tsx:1:1">ok</span>;
    });

    const Parent = component$(() => <div>{<Child />}</div>);

    const { container } = await render(
      <ErrorProvider>
        <Parent />
      </ErrorProvider>,
      { debug }
    );

    expect(log.filter((l) => l === 'task-run').length).toBe(1);
    const span = container.element.querySelector('span')!;
    const taskFile = taskFileOf(container, span);

    await triggerHmr(container, ['reg.tsx', taskFile]);
    await drainAll(container);

    // mount → HMR re-run throws (store.setUp still true) → remount → fresh store, task succeeds.
    expect(log.filter((l) => l === 'task-run').length).toBe(3);
    expect(ErrorProvider.error).toBe(null);
    expect(container.element.querySelector('span')?.textContent).toBe('ok');
  });

  it('remounts when a visible task rejects asynchronously on HMR re-run', async () => {
    const log: string[] = [];

    const Child = component$(() => {
      const canvasRef = useSignal<Element>();
      useVisibleTask$(async () => {
        log.push('task-run');
        const el = canvasRef.value! as any;
        if (el.transferred) {
          throw new Error('async canvas already transferred');
        }
        el.transferred = true;
        log.push('transfer-ok');
      });
      _useHmr('async.tsx');
      return <canvas data-qwik-inspector="async.tsx:1:1" ref={canvasRef} />;
    });

    const Parent = component$(() => <div>{<Child />}</div>);

    const { container } = await render(
      <ErrorProvider>
        <Parent />
      </ErrorProvider>,
      { debug }
    );

    await drainAll(container);
    expect(log.filter((l) => l === 'transfer-ok').length).toBe(1);
    const firstCanvas = container.element.querySelector('canvas');
    const taskFile = taskFileOf(container, firstCanvas!);

    await triggerHmr(container, ['async.tsx', taskFile]);
    await drainAll(container);

    expect(log.filter((l) => l === 'transfer-ok').length).toBe(2);
    expect(container.element.querySelector('canvas')).not.toBe(firstCanvas);
    expect(ErrorProvider.error).toBe(null);
  });
});

// ── ssrRenderToDom tests ────────────────────────────────────────────────
// SSR tests verify handler registration and file filtering. The full re-render
// flow for SSR-paused components is covered by the E2E test in qwik-cli-e2e.
// (The test cursor system doesn't re-execute paused components after markVNodeDirty.)

describe('ssrRenderToDom: HMR', () => {
  const render = ssrRenderToDom;

  it('should register q-d:q-hmr attribute on the component host element', async () => {
    const Counter = component$(() => {
      const count = useSignal(0);
      _useHmr('my-comp.tsx');
      return (
        <div data-qwik-inspector="my-comp.tsx:1:1">
          <span>{count.value}</span>
        </div>
      );
    });

    const { document } = await render(<Counter />, { debug });

    // The `useOnDocument('qHmr', …)` call should produce a `q-d:q-hmr` attribute
    const hmrElements = document.querySelectorAll('[q-d\\:q-hmr]');
    expect(hmrElements.length).toBe(1);
    expect(hmrElements[0].getAttribute('data-qwik-inspector')).toBe('my-comp.tsx:1:1');
  });

  it('should call _hmr handler with correct element for matching files', async () => {
    const Counter = component$(() => {
      const count = useSignal(0);
      _useHmr('target.tsx');
      return (
        <div data-qwik-inspector="target.tsx:1:1">
          <span>{count.value}</span>
        </div>
      );
    });

    const { container } = await render(<Counter />, { debug });

    // Verify the handler filters correctly — triggering for the right file
    // should NOT throw (it should call _hmr and attempt to mark dirty)
    await triggerHmr(container, ['target.tsx']);

    // Triggering for a wrong file should also not throw
    await triggerHmr(container, ['wrong-file.tsx']);
  });

  it('should preserve state after interaction then HMR', async () => {
    const Counter = component$(() => {
      const count = useSignal(10);
      _useHmr('counter.tsx');
      return (
        <div data-qwik-inspector="counter.tsx:1:1">
          <button onClick$={() => count.value++}>
            <span>{count.value}</span>
          </button>
        </div>
      );
    });

    const { vNode, container } = await render(<Counter />, { debug });

    // Click to resume and increment
    await trigger(container.element, 'button', 'click');

    expect(vNode).toMatchVDOM(
      <Component>
        <div data-qwik-inspector="counter.tsx:1:1">
          <button>
            <span>
              <Signal ssr-required>{'11'}</Signal>
            </span>
          </button>
        </div>
      </Component>
    );

    // Fire HMR — state should remain at 11 (not reset)
    await triggerHmr(container, ['counter.tsx']);

    expect(vNode).toMatchVDOM(
      <Component>
        <div data-qwik-inspector="counter.tsx:1:1">
          <button>
            <span>
              <Signal ssr-required>{'11'}</Signal>
            </span>
          </button>
        </div>
      </Component>
    );
  });
});

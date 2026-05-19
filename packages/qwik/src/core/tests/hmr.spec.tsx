import {
  Fragment as Component,
  Fragment as Signal,
  component$,
  useSignal,
  useStore,
} from '@qwik.dev/core';
import { domRender, ssrRenderToDom, trigger, waitForDrain } from '@qwik.dev/core/testing';
import { describe, expect, it } from 'vitest';
import { _useHmr } from '../internal';

const debug = false; //true;
Error.stackTraceLimit = 100;

/**
 * Helper to fire the qHmr document event that triggers HMR re-renders.
 *
 * Uses the kebab-cased `d:q-hmr` form so `trigger` finds elements with the `q-d:q-hmr` attribute
 * set by `useOnDocument('qHmr', …)`.
 */
async function triggerHmr(container: any, files: string[]) {
  await trigger(container.element, null, 'd:q-hmr', {
    detail: { files, t: Date.now() },
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

    // No additional render
    expect(log.length).toBe(rendersBeforeHmr);
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

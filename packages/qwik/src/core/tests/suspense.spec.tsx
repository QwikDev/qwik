import {
  Slot,
  Suspense,
  component$,
  useSignal,
  useTask$,
  useErrorBoundary,
  type JSXOutput,
  Fragment,
  Fragment as Awaited,
  Fragment as Component,
  Fragment as Signal,
} from '@qwik.dev/core';
import { domRender, ssrRenderToDom, trigger, waitForDrain } from '@qwik.dev/core/testing';
import { describe, expect, it } from 'vitest';
import { vnode_getFirstChild, vnode_walkVNode } from '../client/vnode-utils';
import { getCursorData } from '../shared/cursor/cursor-props';
import { ErrorProvider } from '../../testing/rendering.unit-util';
import { delay } from '../shared/utils/promises';

const debug = false; //true;
Error.stackTraceLimit = 100;

describe.each([
  { render: ssrRenderToDom }, //
  { render: domRender }, //
])('$render.name: Suspense', ({ render }) => {
  it('should render sync children', async () => {
    const { document, vNode } = await render(
      <div>
        <Suspense fallback={<span>Loading...</span>}>
          <p>Sync content</p>
        </Suspense>
      </div>,
      { debug }
    );

    expect(document.querySelector('div')!.innerHTML).toContain('Sync content');
    expect(document.querySelector('div')!.innerHTML).not.toContain('Loading...');

    expect(vNode).toMatchVDOM(
      <div>
        <Component>
          <q-sus style="display:contents">
            <p>Sync content</p>
          </q-sus>
          {''}
        </Component>
      </div>
    );
  });

  it('should render component children', async () => {
    const Child = component$(() => <p>Child content</p>);

    const { document, vNode } = await render(
      <div>
        <Suspense fallback={<span>Loading...</span>}>
          <Child />
        </Suspense>
      </div>,
      { debug }
    );

    expect(document.querySelector('div')!.innerHTML).toContain('Child content');
    expect(document.querySelector('div')!.innerHTML).not.toContain('Loading...');

    expect(vNode).toMatchVDOM(
      <div>
        <Component ssr-required>
          <q-sus style="display:contents">
            <Component>
              <p>Child content</p>
            </Component>
          </q-sus>
          {''}
        </Component>
      </div>
    );
  });

  it('should render async children, never the fallback', async () => {
    const AsyncChild = component$(() => {
      const content = new Promise<JSXOutput>((resolve) => {
        setTimeout(() => resolve(<p>Async content</p>), 10);
      });
      return <>{content}</>;
    });

    const { document, vNode } = await render(
      <div>
        <Suspense fallback={<span>Loading...</span>}>
          <AsyncChild />
        </Suspense>
      </div>,
      { debug }
    );

    expect(document.querySelector('div')!.innerHTML).toContain('Async content');
    expect(document.querySelector('div')!.innerHTML).not.toContain('Loading...');
    expect(vNode).toMatchVDOM(
      <div>
        <Component ssr-required>
          <q-sus style="display:contents">
            <Component>
              <Fragment>
                <Awaited>
                  <p>Async content</p>
                </Awaited>
              </Fragment>
            </Component>
          </q-sus>
          {''}
        </Component>
      </div>
    );
  });

  it('should render without a fallback', async () => {
    const { document, vNode } = await render(
      <div>
        <Suspense>
          <p>No fallback</p>
        </Suspense>
      </div>,
      { debug }
    );

    expect(document.querySelector('div')!.innerHTML).toContain('No fallback');
    expect(vNode).toMatchVDOM(
      <div>
        <Component>
          <q-sus style="display:contents">
            <p>No fallback</p>
          </q-sus>
          {''}
        </Component>
      </div>
    );
  });

  it('should render multiple Suspense boundaries independently', async () => {
    const { document, vNode } = await render(
      <div>
        <Suspense fallback={<span>Loading 1...</span>}>
          <p>Content 1</p>
        </Suspense>
        <Suspense fallback={<span>Loading 2...</span>}>
          <p>Content 2</p>
        </Suspense>
      </div>,
      { debug }
    );

    const html = document.querySelector('div')!.innerHTML;
    expect(html).toContain('Content 1');
    expect(html).toContain('Content 2');
    expect(html).not.toContain('Loading 1...');
    expect(html).not.toContain('Loading 2...');
    expect(vNode).toMatchVDOM(
      <div>
        <Component>
          <q-sus style="display:contents">
            <p>Content 1</p>
          </q-sus>
          {''}
        </Component>
        <Component>
          <q-sus style="display:contents">
            <p>Content 2</p>
          </q-sus>
          {''}
        </Component>
      </div>
    );
  });

  it('should handle empty Suspense', async () => {
    const { document, vNode } = await render(
      <div>
        <Suspense fallback={<span>Loading...</span>} />
      </div>,
      { debug }
    );

    expect(document.querySelector('div')!.innerHTML).not.toContain('Loading...');
    expect(vNode).toMatchVDOM(
      <div>
        <Component>
          <q-sus style="display:contents"></q-sus>
          {''}
        </Component>
      </div>
    );
  });

  it('should render async JSX child directly', async () => {
    const content = Promise.resolve(<p>Resolved</p>);

    const { document, vNode } = await render(
      <div>
        <Suspense fallback={<span>Loading...</span>}>{content}</Suspense>
      </div>,
      { debug }
    );

    expect(document.querySelector('div')!.innerHTML).toContain('Resolved');
    expect(document.querySelector('div')!.innerHTML).not.toContain('Loading...');
    expect(vNode).toMatchVDOM(
      <div>
        <Component ssr-required>
          <q-sus style="display:contents">
            <Awaited>
              <p>Resolved</p>
            </Awaited>
          </q-sus>
          {''}
        </Component>
      </div>
    );
  });

  it('should bubble descendant throws to the nearest regular error boundary on the client', async () => {
    const ErrorBoundary = component$(() => {
      const boundary = useErrorBoundary();
      return boundary.error ? <p>Error: {(boundary.error as Error).message}</p> : <Slot />;
    });
    const BadChild = component$(() => {
      throw new Error('boom');
    });

    if (render === ssrRenderToDom) {
      // SSR still propagates the error synchronously — Suspense is not an SSR error boundary.
      let caught: unknown;
      try {
        await render(
          <ErrorBoundary>
            <div>
              <Suspense fallback={<span>Loading...</span>}>
                <BadChild />
              </Suspense>
            </div>
          </ErrorBoundary>,
          { debug }
        );
      } catch (e) {
        caught = e;
      }
      expect(caught).toBeInstanceOf(Error);
    } else {
      const { document } = await render(
        <ErrorBoundary>
          <div>
            <Suspense fallback={<span>Loading...</span>}>
              <BadChild />
            </Suspense>
          </div>
        </ErrorBoundary>,
        { debug }
      );
      const html = document.body.innerHTML;
      expect(html).toContain('Error: boom');
      expect(html).not.toContain('Loading...');
    }
  });

  it('should not show fallback when Promise resolves before timeout', async () => {
    const fastContent = new Promise<JSXOutput>((resolve) =>
      setTimeout(() => resolve(<p>Fast</p>), 5)
    );

    const { document, vNode } = await render(
      <div>
        <Suspense fallback={<span>Loading...</span>} timeout={100}>
          {fastContent as any}
        </Suspense>
      </div>,
      { debug }
    );

    const html = document.querySelector('div')!.innerHTML;
    expect(html).toContain('Fast');
    expect(html).not.toContain('Loading...');
    expect(vNode).toMatchVDOM(
      <div>
        <Component ssr-required>
          <q-sus style="display:contents">
            <Awaited>
              <p>Fast</p>
            </Awaited>
          </q-sus>
          {''}
        </Component>
      </div>
    );
  });

  it('should keep using the generic error path when descendant throws', async () => {
    const BadChild = component$(() => {
      throw new Error('boom');
    });

    if (render === ssrRenderToDom) {
      let caught: unknown;
      try {
        await render(
          <div>
            <Suspense fallback={<span>Loading...</span>}>
              <BadChild />
            </Suspense>
          </div>,
          { debug }
        );
      } catch (e) {
        caught = e;
      }

      expect(caught).toBeInstanceOf(Error);
    } else {
      const { document } = await render(
        <ErrorProvider>
          <div>
            <Suspense fallback={<span>Loading...</span>}>
              <BadChild />
            </Suspense>
          </div>
        </ErrorProvider>,
        { debug }
      );

      expect(ErrorProvider.error).toBeInstanceOf(Error);
      expect(document.body.innerHTML).not.toContain('Loading...');
    }
  });
});

describe('domRender: Suspense client-side pause timeout', () => {
  it('should assign deferred children cursor priority from the parent cursor', async () => {
    const { vNode } = await domRender(
      <div>
        <Suspense fallback={<span>Loading...</span>}>
          <p>Priority</p>
        </Suspense>
      </div>,
      { debug }
    );

    expect(vNode).toMatchVDOM(
      <div>
        <Component>
          <q-sus style="display:contents">
            <p>Priority</p>
          </q-sus>
          {''}
        </Component>
      </div>
    );
    const suspenseBoundary = vnode_getFirstChild(vNode!)!;
    const contentRoot = vnode_getFirstChild(suspenseBoundary)!;
    expect(getCursorData(contentRoot)?.priority).toBe(-1);
  });

  it('should cascade nested Suspense priorities', async () => {
    const { vNode } = await domRender(
      <div>
        <Suspense fallback={<span>Outer...</span>}>
          <Suspense fallback={<span>Inner...</span>}>
            <p>Nested</p>
          </Suspense>
        </Suspense>
      </div>,
      { debug }
    );

    expect(vNode).toMatchVDOM(
      <div>
        <Component>
          <q-sus style="display:contents">
            <Component>
              <q-sus style="display:contents">
                <p>Nested</p>
              </q-sus>
              {''}
            </Component>
          </q-sus>
          {''}
        </Component>
      </div>
    );
    const outerBoundary = vnode_getFirstChild(vNode!)!;
    const outerContentRoot = vnode_getFirstChild(outerBoundary)!;
    const innerBoundary = vnode_getFirstChild(outerContentRoot)!;
    const innerContentRoot = vnode_getFirstChild(innerBoundary)!;
    expect(getCursorData(outerContentRoot)?.priority).toBe(-1);
    expect(getCursorData(innerContentRoot)?.priority).toBe(-2);
  });

  it('should show fallback mid-flight and swap it for children on completion', async () => {
    (globalThis as any).__slowContent = new Promise<JSXOutput>((resolve) => {
      (globalThis as any).__slowResolve = resolve;
    });
    const SlowChild = component$(() => {
      return <>{(globalThis as any).__slowContent}</>;
    });

    const renderPromise = domRender(
      <div>
        <Suspense fallback={<span>Loading...</span>} timeout={10}>
          <SlowChild />
        </Suspense>
      </div>,
      { debug }
    );

    // Wait past the timeout (10ms) so the pause-timer fires and marks fallback visible.
    await new Promise((r) => setTimeout(r, 40));

    (globalThis as any).__slowResolve(<p>Done</p>);
    const { document, vNode } = await renderPromise;

    const html = document.querySelector('div')!.innerHTML;
    expect(html).toContain('Done');
    expect(html).not.toContain('Loading...');
    expect(vNode).toMatchVDOM(
      <div>
        <Component>
          <q-sus style="display:contents">
            <Component>
              <Fragment>
                <Awaited>
                  <p>Done</p>
                </Awaited>
              </Fragment>
            </Component>
          </q-sus>
          {''}
        </Component>
      </div>
    );

    delete (globalThis as any).__slowContent;
    delete (globalThis as any).__slowResolve;
  });

  it('should re-show fallback when a descendant updates and blocks past timeout', async () => {
    // After initial mount, flip the signal: the child's render returns a Promise that takes
    // longer than the Suspense timeout. The new update-time cursor should inherit the
    // boundary's hooks and re-trigger the fallback, then clear it once resolved.
    (globalThis as any).__susToggle = null as any;
    (globalThis as any).__susResolve = null as any;

    const Child = component$(() => {
      const toggle = useSignal(0);
      (globalThis as any).__susToggle = toggle;
      useTask$(({ track }) => {
        const t = track(() => toggle.value);
        if (t === 0) {
          return; // initial: sync
        }
        return new Promise<void>((resolve) => {
          (globalThis as any).__susResolve = resolve;
        });
      });
      return <p>value={toggle.value}</p>;
    });

    const { document, vNode } = await domRender(
      <div>
        <Suspense fallback={<span>Loading...</span>} timeout={10}>
          <Child />
        </Suspense>
      </div>,
      { debug }
    );

    // Initial render finished; children in place, no fallback.
    let html = document.querySelector('div')!.innerHTML;
    expect(html).toContain('value=0');
    expect(html).not.toContain('Loading...');
    expect(vNode).toMatchVDOM(
      <div>
        <Component>
          <q-sus style="display:contents">
            <Component>
              <p>
                value=<Signal>0</Signal>
              </p>
            </Component>
          </q-sus>
          {''}
        </Component>
      </div>
    );

    // Trigger an update that will pause the cursor.
    const toggle = (globalThis as any).__susToggle as { value: number };
    toggle.value = 1;

    // Wait past the timeout so the new cursor's pause-timer fires.
    await delay(40);

    html = document.querySelector('div')!.innerHTML;
    expect(html).toContain('Loading...');

    // Resolve the pending task and let the render settle.
    const resolveFn = (globalThis as any).__susResolve as () => void;
    expect(resolveFn).toBeDefined();
    resolveFn();
    await new Promise((r) => setTimeout(r, 10));

    html = document.querySelector('div')!.innerHTML;
    expect(html).toContain('value=1');
    expect(html).not.toContain('Loading...');
    expect(vNode).toMatchVDOM(
      <div>
        <Component>
          <q-sus style="display:contents">
            <Component>
              <p>
                value=<Signal>1</Signal>
              </p>
            </Component>
          </q-sus>
          {''}
        </Component>
      </div>
    );

    delete (globalThis as any).__susToggle;
    delete (globalThis as any).__susResolve;
  });

  it('should keep stale content visible while showing fallback during updates when showStale is enabled', async () => {
    (globalThis as any).__showStaleToggle = null as any;
    (globalThis as any).__showStaleResolve = null as any;

    const Child = component$(() => {
      const toggle = useSignal(0);
      (globalThis as any).__showStaleToggle = toggle;
      useTask$(({ track }) => {
        const t = track(() => toggle.value);
        if (t === 0) {
          return;
        }
        return new Promise<void>((resolve) => {
          (globalThis as any).__showStaleResolve = resolve;
        });
      });
      return <p>value={toggle.value}</p>;
    });

    const { document, vNode } = await domRender(
      <div>
        <Suspense fallback={<span>Loading...</span>} timeout={10} showStale>
          <Child />
        </Suspense>
      </div>,
      { debug }
    );

    let html = document.querySelector('div')!.innerHTML;
    expect(html).toContain('value=0');
    expect(html).not.toContain('Loading...');
    expect(vNode).toMatchVDOM(
      <div>
        <Component>
          <q-sus style="display:contents">
            <Component>
              <p>
                value=<Signal>0</Signal>
              </p>
            </Component>
          </q-sus>
          {''}
        </Component>
      </div>
    );

    const toggle = (globalThis as any).__showStaleToggle as { value: number };
    toggle.value = 1;
    await new Promise((r) => setTimeout(r, 40));

    html = document.querySelector('div')!.innerHTML;
    expect(html).toContain('value=0');
    expect(html).toContain('Loading...');
    expect(html.indexOf('value=0')).toBeLessThan(html.indexOf('Loading...'));

    const resolveFn = (globalThis as any).__showStaleResolve as () => void;
    expect(resolveFn).toBeDefined();
    resolveFn();
    await new Promise((r) => setTimeout(r, 10));

    html = document.querySelector('div')!.innerHTML;
    expect(html).toContain('value=1');
    expect(html).not.toContain('Loading...');
    expect(vNode).toMatchVDOM(
      <div>
        <Component>
          <q-sus style="display:contents">
            <Component>
              <p>
                value=<Signal>1</Signal>
              </p>
            </Component>
          </q-sus>
          {''}
        </Component>
      </div>
    );

    delete (globalThis as any).__showStaleToggle;
    delete (globalThis as any).__showStaleResolve;
  });

  it('should show fallback when a child component rerenders to a promise child', async () => {
    (globalThis as any).__slowChildResolve = null as any;

    const Slow = component$(({ count }: { count: number }) => {
      if (count === 0) {
        return <div>Count: {count}</div>;
      }
      return (
        <div>
          Count:{' '}
          {
            new Promise<number>((resolve) => {
              (globalThis as any).__slowChildResolve = () => resolve(count);
            })
          }
        </div>
      );
    });

    const App = component$(() => {
      const count = useSignal(0);
      return (
        <main>
          <p>Count: {count.value}</p>
          <div>
            <button onClick$={() => count.value++}>Click</button>
            <Suspense fallback={<div>counting...</div>} timeout={10}>
              <Slow count={count.value} />
            </Suspense>
          </div>
        </main>
      );
    });

    const { container, document, vNode } = await domRender(<App />, { debug });

    let html = document.querySelector('main > div')!.innerHTML;
    expect(html).toContain('Count: 0');
    expect(html).not.toContain('counting...');
    expect(vNode).toMatchVDOM(
      <Component>
        <main>
          <p>
            Count: <Signal>0</Signal>
          </p>
          <div>
            <button>Click</button>
            <Component>
              <q-sus style="display:contents">
                <Component>
                  <div>
                    Count: <Signal>0</Signal>
                  </div>
                </Component>
              </q-sus>
              {''}
            </Component>
          </div>
        </main>
      </Component>
    );

    await trigger(document.body, 'button', 'click', {}, { waitForIdle: false });
    await new Promise((r) => setTimeout(r, 40));

    html = document.querySelector('main > div')!.innerHTML;
    expect(html).toContain('counting...');

    const resolve = (globalThis as any).__slowChildResolve as (() => void) | null;
    expect(resolve).toBeTruthy();
    resolve!();
    await waitForDrain(container);

    html = document.querySelector('main > div')!.innerHTML;
    expect(html).toContain('Count: 1');
    expect(html).not.toContain('counting...');
    expect(vNode).toMatchVDOM(
      <Component>
        <main>
          <p>
            Count: <Signal>1</Signal>
          </p>
          <div>
            <button>Click</button>
            <Component>
              <q-sus style="display:contents">
                <Component>
                  <div>
                    Count: <Awaited>1</Awaited>
                  </div>
                </Component>
              </q-sus>
              {''}
            </Component>
          </div>
        </main>
      </Component>
    );

    delete (globalThis as any).__slowChildResolve;
  });
});

describe('ssrRenderToDom: Suspense resumed updates', () => {
  it('should still show fallback for descendant updates after resume', async () => {
    (globalThis as any).__ssrSusResolve = null as any;

    const Child = component$(() => {
      const value = useSignal(0);
      useTask$(({ track }) => {
        const current = track(() => value.value);
        if (current === 0) {
          return;
        }
        return new Promise<void>((resolve) => {
          (globalThis as any).__ssrSusResolve = resolve;
        });
      });
      return (
        <>
          <button onClick$={() => (value.value = 1)}>toggle</button>
          <p>value={value.value}</p>
        </>
      );
    });

    const { container, document, vNode } = await ssrRenderToDom(
      <div>
        <Suspense fallback={<span>Loading...</span>} timeout={10}>
          <Child />
        </Suspense>
      </div>,
      { debug }
    );

    expect(vNode).toMatchVDOM(
      <div>
        <Component ssr-required>
          <q-sus style="display:contents">
            <Component ssr-required>
              <Fragment ssr-required>
                <button>toggle</button>
                <p>
                  value=<Signal ssr-required>0</Signal>
                </p>
              </Fragment>
            </Component>
          </q-sus>
          {''}
        </Component>
      </div>
    );
    const suspenseBoundary = vnode_getFirstChild(vNode!)!;
    const contentRoot = vnode_getFirstChild(suspenseBoundary)!;

    await trigger(document.body, 'button', 'click', {}, { waitForIdle: false });
    await new Promise((r) => setTimeout(r, 0));
    let updateCursorPriority: number | undefined;
    vnode_walkVNode(contentRoot, (vNode) => {
      const priority = getCursorData(vNode)?.priority;
      if (priority === 0) {
        updateCursorPriority = priority;
        return true;
      }
    });
    expect(updateCursorPriority).toBe(0);
    await new Promise((r) => setTimeout(r, 40));
    expect(document.querySelector('div')!.innerHTML).toContain('Loading...');

    const resolve = (globalThis as any).__ssrSusResolve as (() => void) | null;
    expect(resolve).toBeTruthy();
    resolve!();
    await waitForDrain(container);

    const html = document.querySelector('div')!.innerHTML;
    expect(html).toContain('value=1');
    expect(html).not.toContain('Loading...');
    expect(vNode).toMatchVDOM(
      <div>
        <Component ssr-required>
          <q-sus style="display:contents">
            <Component ssr-required>
              <Fragment ssr-required>
                <button>toggle</button>
                <p>
                  value=<Signal ssr-required>1</Signal>
                </p>
              </Fragment>
            </Component>
          </q-sus>
          {''}
        </Component>
      </div>
    );

    delete (globalThis as any).__ssrSusResolve;
  });

  it('should keep SSR-rendered content visible while showing fallback after resume when showStale is enabled', async () => {
    (globalThis as any).__ssrShowStaleResolve = null as any;

    const Child = component$(() => {
      const value = useSignal(0);
      useTask$(({ track }) => {
        const current = track(() => value.value);
        if (current === 0) {
          return;
        }
        return new Promise<void>((resolve) => {
          (globalThis as any).__ssrShowStaleResolve = resolve;
        });
      });
      return (
        <>
          <button onClick$={() => (value.value = 1)}>toggle</button>
          <p>value={value.value}</p>
        </>
      );
    });

    const { container, document, vNode } = await ssrRenderToDom(
      <div>
        <Suspense fallback={<span>Loading...</span>} timeout={10} showStale>
          <Child />
        </Suspense>
      </div>,
      { debug }
    );

    expect(vNode).toMatchVDOM(
      <div>
        <Component ssr-required>
          <q-sus style="display:contents">
            <Component ssr-required>
              <Fragment ssr-required>
                <button>toggle</button>
                <p>
                  value=
                  <Signal ssr-required>0</Signal>
                </p>
              </Fragment>
            </Component>
          </q-sus>
          {''}
        </Component>
      </div>
    );

    await trigger(document.body, 'button', 'click', {}, { waitForIdle: false });
    await new Promise((r) => setTimeout(r, 40));

    let html = document.querySelector('div')!.innerHTML;
    expect(html).toContain('value=0');
    expect(html).toContain('Loading...');
    expect(html.indexOf('value=0')).toBeLessThan(html.indexOf('Loading...'));

    const resolve = (globalThis as any).__ssrShowStaleResolve as (() => void) | null;
    expect(resolve).toBeTruthy();
    resolve!();
    await waitForDrain(container);

    html = document.querySelector('div')!.innerHTML;
    expect(html).toContain('value=1');
    expect(html).not.toContain('Loading...');
    expect(vNode).toMatchVDOM(
      <div>
        <Component ssr-required>
          <q-sus style="display:contents">
            <Component ssr-required>
              <Fragment ssr-required>
                <button>toggle</button>
                <p>
                  value=<Signal ssr-required>1</Signal>
                </p>
              </Fragment>
            </Component>
          </q-sus>
          {''}
        </Component>
      </div>
    );

    delete (globalThis as any).__ssrShowStaleResolve;
  });
});

import { domRender, ssrRenderToDom, trigger, waitForDrain } from '@qwik.dev/core/testing';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  Fragment as Component,
  Reveal,
  Suspense,
  Fragment,
  Fragment as Projection,
  Fragment as Awaited,
  component$,
  type JSXOutput,
  useErrorBoundary,
  Slot,
  useTask$,
  useSignal,
  Fragment as Signal,
} from '@qwik.dev/core';
import { ErrorProvider } from '../../testing/rendering.unit-util';
import { delay } from '../shared/utils/promises';
import * as logUtils from '../shared/utils/log';

const debug = false; //true;
Error.stackTraceLimit = 100;

const loading = '<div style="display:contents"><span>Loading...</span></div>';

describe.each([
  { render: ssrRenderToDom }, //
  { render: domRender }, //
])('$render.name: loops', ({ render }) => {
  it('should render sync children', async () => {
    const { vNode } = await render(
      <Suspense fallback={<span>Loading...</span>}>
        <p>Sync content</p>
      </Suspense>,
      { debug }
    );

    expect(vNode).toMatchVDOM(
      <Component ssr-required>
        <Fragment ssr-required>
          <div style="display:none">
            <span>Loading...</span>
          </div>
          <div style="display:contents">
            <Projection ssr-required>
              <p>Sync content</p>
            </Projection>
          </div>
        </Fragment>
      </Component>
    );
  });

  it('should render component children', async () => {
    const Child = component$(() => <p>Child content</p>);

    const { vNode } = await render(
      <Suspense fallback={<span>Loading...</span>}>
        <Child />
      </Suspense>,
      { debug }
    );

    expect(vNode).toMatchVDOM(
      <Component ssr-required>
        <Fragment ssr-required>
          <div style="display:none">
            <span>Loading...</span>
          </div>
          <div style="display:contents">
            <Projection ssr-required>
              <Component ssr-required>
                <p>Child content</p>
              </Component>
            </Projection>
          </div>
        </Fragment>
      </Component>
    );
  });

  it('should render async children, never the fallback', async () => {
    const AsyncChild = component$(() => {
      const content = new Promise<JSXOutput>((resolve) => {
        setTimeout(() => resolve(<p>Async content</p>), 10);
      });
      return <>{content}</>;
    });

    const { vNode } = await render(
      <Suspense fallback={<span>Loading...</span>}>
        <AsyncChild />
      </Suspense>,
      { debug }
    );

    expect(vNode).toMatchVDOM(
      <Component ssr-required>
        <Fragment ssr-required>
          <div style="display:none">
            <span>Loading...</span>
          </div>
          <div style="display:contents">
            <Projection ssr-required>
              <Component ssr-required>
                <Fragment ssr-required>
                  <Awaited ssr-required>
                    <p>Async content</p>
                  </Awaited>
                </Fragment>
              </Component>
            </Projection>
          </div>
        </Fragment>
      </Component>
    );
  });

  it('should render without a fallback', async () => {
    const { vNode } = await render(
      <Suspense>
        <p>No fallback</p>
      </Suspense>,
      { debug }
    );

    expect(vNode).toMatchVDOM(
      <Component ssr-required>
        <Fragment ssr-required>
          <div style="display:none" />
          <div style="display:contents">
            <Projection ssr-required>
              <p>No fallback</p>
            </Projection>
          </div>
        </Fragment>
      </Component>
    );
  });

  it('should render multiple Suspense boundaries independently', async () => {
    const { vNode } = await render(
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

    expect(vNode).toMatchVDOM(
      <div>
        <Component ssr-required>
          <Fragment ssr-required>
            <div style="display:none">
              <span>Loading 1...</span>
            </div>
            <div style="display:contents">
              <Projection ssr-required>
                <p>Content 1</p>
              </Projection>
            </div>
          </Fragment>
        </Component>

        <Component ssr-required>
          <Fragment ssr-required>
            <div style="display:none">
              <span>Loading 2...</span>
            </div>
            <div style="display:contents">
              <Projection ssr-required>
                <p>Content 2</p>
              </Projection>
            </div>
          </Fragment>
        </Component>
      </div>
    );
  });

  it('should handle empty Suspense', async () => {
    const { vNode } = await render(
      <div>
        <Suspense fallback={<span>Loading...</span>} />
      </div>,
      { debug }
    );
    expect(vNode).toMatchVDOM(
      <div>
        <Component ssr-required>
          <Fragment ssr-required>
            <div style="display:none">
              <span>Loading...</span>
            </div>
            <div style="display:contents">
              <Projection ssr-required></Projection>
            </div>
          </Fragment>
        </Component>
      </div>
    );
  });

  it('should render async JSX child directly', async () => {
    const content = Promise.resolve(<p>Resolved</p>);

    const { vNode } = await render(
      <div>
        <Suspense fallback={<span>Loading...</span>}>{content}</Suspense>
      </div>,
      { debug }
    );

    expect(vNode).toMatchVDOM(
      <div>
        <Component ssr-required>
          <Fragment ssr-required>
            <div style="display:none">
              <span>Loading...</span>
            </div>
            <div style="display:contents">
              <Projection ssr-required>
                <Awaited>
                  <p>Resolved</p>
                </Awaited>
              </Projection>
            </div>
          </Fragment>
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
      expect(html).not.toContain(loading);
    }
  });

  it('should not show fallback when Promise resolves before delay', async () => {
    const fastContent = new Promise<JSXOutput>((resolve) =>
      setTimeout(() => resolve(<p>Fast</p>), 5)
    );

    const { vNode } = await render(
      <div>
        <Suspense fallback={<span>Loading...</span>} delay={100}>
          {fastContent as any}
        </Suspense>
      </div>,
      { debug }
    );

    expect(vNode).toMatchVDOM(
      <div>
        <Component ssr-required>
          <Fragment ssr-required>
            <div style="display:none">
              <span>Loading...</span>
            </div>
            <div style="display:contents">
              <Projection ssr-required>
                <Awaited>
                  <p>Fast</p>
                </Awaited>
              </Projection>
            </div>
          </Fragment>
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
      expect(document.body.innerHTML).not.toContain(loading);
    }
  });
});

describe('ssrRenderToDom: Reveal suspense coordination', () => {
  it('should not schedule reveal updates during SSR registration', async () => {
    const logWarnSpy = vi.spyOn(logUtils, 'logWarn').mockImplementation(() => {});

    try {
      await ssrRenderToDom(
        <Reveal order="sequential" collapsed>
          <Suspense fallback={<span>Loading first</span>}>
            <p>First</p>
          </Suspense>
          <Suspense fallback={<span>Loading second</span>}>
            <p>Second</p>
          </Suspense>
        </Reveal>,
        { debug }
      );

      const lateChoreWarnings = logWarnSpy.mock.calls.filter(([message]) =>
        String(message).includes('A chore was scheduled on a host element')
      );
      expect(lateChoreWarnings).toEqual([]);
    } finally {
      logWarnSpy.mockRestore();
    }
  });
});

describe('domRender: Suspense client-side pause delay', () => {
  afterEach(() => {
    delete (globalThis as any).__slowContent;
    delete (globalThis as any).__slowResolve;
    delete (globalThis as any).__susToggle;
    delete (globalThis as any).__susResolve;
    delete (globalThis as any).__zeroFallbackToggle;
    delete (globalThis as any).__zeroFallbackResolve;
    delete (globalThis as any).__showStaleToggle;
    delete (globalThis as any).__showStaleResolve;
    delete (globalThis as any).__slowChildResolve;
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
        <Suspense fallback={<span>Loading...</span>} delay={10}>
          <SlowChild />
        </Suspense>
      </div>,
      { debug }
    );

    // Wait past the delay (10ms) so the pause-timer fires and marks fallback visible.
    await new Promise((r) => setTimeout(r, 40));

    (globalThis as any).__slowResolve(<p>Done</p>);
    const { document, vNode } = await renderPromise;

    const html = document.querySelector('div')!.innerHTML;
    expect(html).toContain('Done');
    expect(html).not.toContain(loading);
    expect(vNode).toMatchVDOM(
      <div>
        <Component>
          <Fragment>
            <div style="display:none">
              <span>Loading...</span>
            </div>
            <div style="display:contents">
              <Projection>
                <Component>
                  <Fragment>
                    <Awaited>
                      <p>Done</p>
                    </Awaited>
                  </Fragment>
                </Component>
              </Projection>
            </div>
          </Fragment>
        </Component>
      </div>
    );
  });

  it('should re-show fallback when a descendant updates and blocks past delay', async () => {
    // After initial mount, flip the signal: the child's render returns a Promise that takes
    // longer than the Suspense delay. The new update-time cursor should inherit the
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
        <Suspense fallback={<span>Loading...</span>} delay={10}>
          <Child />
        </Suspense>
      </div>,
      { debug }
    );

    // Initial render finished; children in place, no fallback.
    let html = document.querySelector('div')!.innerHTML;
    expect(html).toContain('value=0');
    expect(html).not.toContain(loading);
    expect(vNode).toMatchVDOM(
      <div>
        <Component ssr-required>
          <Fragment ssr-required>
            <div style="display:none">
              <span>Loading...</span>
            </div>
            <div style="display:contents">
              <Projection ssr-required>
                <Component>
                  <p>
                    value=<Signal>0</Signal>
                  </p>
                </Component>
              </Projection>
            </div>
          </Fragment>
        </Component>
      </div>
    );

    // Trigger an update that will pause the cursor.
    const toggle = (globalThis as any).__susToggle as { value: number };
    toggle.value = 1;

    // Wait past the delay so the new cursor's pause-timer fires.
    await delay(40);

    html = document.querySelector('div')!.innerHTML;
    expect(html).toContain(loading);

    // Resolve the pending task and let the render settle.
    const resolveFn = (globalThis as any).__susResolve as () => void;
    expect(resolveFn).toBeDefined();
    resolveFn();
    await new Promise((r) => setTimeout(r, 10));

    html = document.querySelector('div')!.innerHTML;
    expect(html).toContain('value=1');
    expect(html).not.toContain(loading);
    expect(vNode).toMatchVDOM(
      <div>
        <Component ssr-required>
          <Fragment ssr-required>
            <div style="display:none">
              <span>Loading...</span>
            </div>
            <div style="display:contents">
              <Projection ssr-required>
                <Component>
                  <p>
                    value=<Signal>1</Signal>
                  </p>
                </Component>
              </Projection>
            </div>
          </Fragment>
        </Component>
      </div>
    );
  });

  it('should show a numeric zero fallback while a descendant update is blocked', async () => {
    (globalThis as any).__zeroFallbackToggle = null as any;
    (globalThis as any).__zeroFallbackResolve = null as any;

    const Child = component$(() => {
      const toggle = useSignal(0);
      (globalThis as any).__zeroFallbackToggle = toggle;
      useTask$(({ track }) => {
        const t = track(() => toggle.value);
        if (t === 0) {
          return;
        }
        return new Promise<void>((resolve) => {
          (globalThis as any).__zeroFallbackResolve = resolve;
        });
      });
      return <p>value={toggle.value}</p>;
    });

    const { container, document } = await domRender(
      <div>
        <Suspense fallback={0} delay={10}>
          <Child />
        </Suspense>
      </div>,
      { debug }
    );

    const suspenseRoot = document.querySelector('div')!;
    const fallbackHost = suspenseRoot.children[0] as HTMLElement;
    const contentHost = suspenseRoot.children[1] as HTMLElement;
    expect(fallbackHost.textContent).toBe('0');
    expect(fallbackHost.style.display).toBe('none');
    expect(contentHost.style.display).toBe('contents');

    const toggle = (globalThis as any).__zeroFallbackToggle as { value: number };
    toggle.value = 1;
    await delay(40);

    expect(fallbackHost.textContent).toBe('0');
    expect(fallbackHost.style.display).toBe('contents');
    expect(contentHost.style.display).toBe('none');

    const resolveFn = (globalThis as any).__zeroFallbackResolve as () => void;
    expect(resolveFn).toBeDefined();
    resolveFn();
    await waitForDrain(container);

    expect(fallbackHost.style.display).toBe('none');
    expect(contentHost.style.display).toBe('contents');
    expect(contentHost.textContent).toContain('value=1');
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
        <Suspense fallback={<span>Loading...</span>} delay={10} showStale>
          <Child />
        </Suspense>
      </div>,
      { debug }
    );

    const suspenseRoot = document.querySelector('div')!;
    let html = suspenseRoot.innerHTML;
    expect(html).toContain('value=0');
    expect(html).not.toContain(loading);
    expect((suspenseRoot.children[0] as HTMLElement).style.display).toBe('none');
    expect((suspenseRoot.children[1] as HTMLElement).style.display).toBe('contents');
    expect(vNode).toMatchVDOM(
      <div>
        <Component>
          <Fragment ssr-required>
            <div style="display:none">
              <span>Loading...</span>
            </div>
            <div style="display:contents">
              <Projection ssr-required>
                <Component>
                  <p>
                    value=<Signal>0</Signal>
                  </p>
                </Component>
              </Projection>
            </div>
          </Fragment>
        </Component>
      </div>
    );

    const toggle = (globalThis as any).__showStaleToggle as { value: number };
    toggle.value = 1;
    await new Promise((r) => setTimeout(r, 40));

    html = suspenseRoot.innerHTML;
    expect(html).toContain('value=0');
    expect(html).toContain(loading);
    expect(html.indexOf('value=0')).toBeGreaterThan(html.indexOf(loading));
    expect((suspenseRoot.children[0] as HTMLElement).style.display).toBe('contents');
    expect((suspenseRoot.children[1] as HTMLElement).style.display).toBe('contents');

    const resolveFn = (globalThis as any).__showStaleResolve as () => void;
    expect(resolveFn).toBeDefined();
    resolveFn();
    await new Promise((r) => setTimeout(r, 10));

    html = suspenseRoot.innerHTML;
    expect(html).toContain('value=1');
    expect(html).not.toContain(loading);
    expect((suspenseRoot.children[0] as HTMLElement).style.display).toBe('none');
    expect((suspenseRoot.children[1] as HTMLElement).style.display).toBe('contents');
    expect(vNode).toMatchVDOM(
      <div>
        <Component>
          <Fragment ssr-required>
            <div style="display:none">
              <span>Loading...</span>
            </div>
            <div style="display:contents">
              <Projection ssr-required>
                <Component>
                  <p>
                    value=<Signal>1</Signal>
                  </p>
                </Component>
              </Projection>
            </div>
          </Fragment>
        </Component>
      </div>
    );
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
            <Suspense fallback={<div>counting...</div>} delay={10}>
              <Slow count={count.value} />
            </Suspense>
          </div>
        </main>
      );
    });

    const { container, document, vNode } = await domRender(<App />, { debug });

    let html = document.querySelector('main > div')!.innerHTML;
    expect(html).toContain('Count: 0');

    const countingHtml = '<div style="display:contents"><div>counting...</div></div>';
    expect(html).not.toContain(countingHtml);
    expect(vNode).toMatchVDOM(
      <Component>
        <main>
          <p>
            Count: <Signal>0</Signal>
          </p>
          <div>
            <button>Click</button>
            <Component>
              <Fragment ssr-required>
                <div style="display:none">
                  <div>counting...</div>
                </div>
                <div style="display:contents">
                  <Projection ssr-required>
                    <Component>
                      <div>
                        Count: <Signal>0</Signal>
                      </div>
                    </Component>
                  </Projection>
                </div>
              </Fragment>
            </Component>
          </div>
        </main>
      </Component>
    );

    await trigger(document.body, 'button', 'click', {}, { waitForIdle: false });
    await new Promise((r) => setTimeout(r, 40));

    html = document.querySelector('main > div')!.innerHTML;
    expect(html).toContain(countingHtml);

    const resolve = (globalThis as any).__slowChildResolve as (() => void) | null;
    expect(resolve).toBeTruthy();
    resolve!();
    await waitForDrain(container);

    html = document.querySelector('main > div')!.innerHTML;
    expect(html).toContain('Count: 1');
    expect(html).not.toContain(countingHtml);
    expect(vNode).toMatchVDOM(
      <Component>
        <main>
          <p>
            Count: <Signal>1</Signal>
          </p>
          <div>
            <button>Click</button>
            <Component>
              <Fragment ssr-required>
                <div style="display:none">
                  <div>counting...</div>
                </div>
                <div style="display:contents">
                  <Projection ssr-required>
                    <Component>
                      <div>
                        Count: <Signal>1</Signal>
                      </div>
                    </Component>
                  </Projection>
                </div>
              </Fragment>
            </Component>
          </div>
        </main>
      </Component>
    );
  });
});

describe('domRender: Reveal suspense coordination', () => {
  type RevealTestState = {
    toggles: Record<string, { value: number }>;
    resolvers: Record<string, () => void>;
  };

  const RevealTestChild = component$((props: { id: string }) => {
    const toggle = useSignal(0);
    const state = (globalThis as any).__revealState as RevealTestState;
    state.toggles[props.id] = toggle;
    useTask$(({ track }) => {
      const value = track(() => toggle.value);
      if (value === 0) {
        return;
      }
      return new Promise<void>((resolve) => {
        state.resolvers[props.id] = resolve;
      });
    });
    return (
      <p>
        {props.id}:{toggle.value}
      </p>
    );
  });

  const renderReveal = async (props: {
    order?: 'parallel' | 'sequential' | 'reverse' | 'together';
    collapsed?: boolean;
  }) => {
    const state: RevealTestState = { toggles: {}, resolvers: {} };
    (globalThis as any).__revealState = state;
    const result = await domRender(
      <div id="reveal-root">
        <Reveal {...props}>
          <Suspense fallback={<span>Loading first</span>} delay={10}>
            <RevealTestChild id="first" />
          </Suspense>
          <Suspense fallback={<span>Loading second</span>} delay={10}>
            <RevealTestChild id="second" />
          </Suspense>
        </Reveal>
      </div>,
      { debug }
    );
    return { ...result, state, root: result.document.querySelector('#reveal-root')! };
  };

  const getRevealHosts = (root: Element) => {
    const children = root.children;
    return {
      firstFallback: children[0] as HTMLElement,
      firstContent: children[1] as HTMLElement,
      secondFallback: children[2] as HTMLElement,
      secondContent: children[3] as HTMLElement,
    };
  };

  const blockRevealChildren = async (state: RevealTestState) => {
    state.toggles.first.value = 1;
    state.toggles.second.value = 1;
    await delay(40);
  };

  afterEach(() => {
    delete (globalThis as any).__revealState;
  });

  it('should keep parallel boundaries independent', async () => {
    const { container, root, state } = await renderReveal({ order: 'parallel' });

    await blockRevealChildren(state);
    let hosts = getRevealHosts(root);
    expect(hosts.firstFallback.style.display).toBe('contents');
    expect(hosts.secondFallback.style.display).toBe('contents');

    state.resolvers.second();
    await delay(20);

    hosts = getRevealHosts(root);
    expect(hosts.firstFallback.style.display).toBe('contents');
    expect(hosts.secondFallback.style.display).toBe('none');

    expect(hosts.secondContent.style.display).toBe('contents');

    state.resolvers.first();
    await waitForDrain(container);
  });

  it('should reveal sequential content in registration order', async () => {
    const { container, root, state } = await renderReveal({ order: 'sequential' });

    await blockRevealChildren(state);
    let hosts = getRevealHosts(root);
    expect(hosts.firstFallback.style.display).toBe('contents');
    expect(hosts.secondFallback.style.display).toBe('contents');

    expect(hosts.secondContent.style.display).toBe('none');

    state.resolvers.second();
    await delay(20);

    hosts = getRevealHosts(root);
    expect(hosts.secondFallback.style.display).toBe('none');
    expect(hosts.secondContent.style.display).toBe('none');

    state.resolvers.first();
    await waitForDrain(container);

    hosts = getRevealHosts(root);
    expect(hosts.firstContent.style.display).toBe('contents');
    expect(hosts.secondContent.style.display).toBe('contents');
  });

  it('should collapse unrevealed sequential fallbacks', async () => {
    const { container, root, state } = await renderReveal({ order: 'sequential', collapsed: true });

    await blockRevealChildren(state);
    const hosts = getRevealHosts(root);
    expect(hosts.firstFallback.style.display).toBe('contents');
    expect(hosts.secondFallback.style.display).toBe('none');

    expect(hosts.secondContent.style.display).toBe('none');

    state.resolvers.first();
    state.resolvers.second();
    await waitForDrain(container);
  });

  it('should reveal reverse content from the end', async () => {
    const { container, root, state } = await renderReveal({ order: 'reverse' });

    await blockRevealChildren(state);
    state.resolvers.first();
    await delay(20);

    let hosts = getRevealHosts(root);
    expect(hosts.firstFallback.style.display).toBe('none');

    expect(hosts.firstContent.style.display).toBe('none');

    state.resolvers.second();
    await waitForDrain(container);

    hosts = getRevealHosts(root);
    expect(hosts.firstContent.style.display).toBe('contents');
    expect(hosts.secondContent.style.display).toBe('contents');
  });

  it('should reveal together only after all boundaries resolve', async () => {
    const { container, root, state } = await renderReveal({ order: 'together' });

    await blockRevealChildren(state);
    state.resolvers.first();
    await delay(20);

    let hosts = getRevealHosts(root);
    expect(hosts.firstFallback.style.display).toBe('none');

    expect(hosts.firstContent.style.display).toBe('none');

    expect(hosts.secondFallback.style.display).toBe('contents');

    state.resolvers.second();
    await waitForDrain(container);

    hosts = getRevealHosts(root);
    expect(hosts.firstContent.style.display).toBe('contents');
    expect(hosts.secondContent.style.display).toBe('contents');
  });
});

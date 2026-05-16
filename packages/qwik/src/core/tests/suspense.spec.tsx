import {
  createDocument,
  domRender,
  emulateExecutionOfQwikFuncs,
  getTestPlatform,
  ssrRenderToDom,
  trigger,
  waitForDrain,
} from '@qwik.dev/core/testing';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  Fragment as Component,
  Reveal,
  Suspense,
  Fragment,
  Fragment as Projection,
  Fragment as Awaited,
  component$,
  getPlatform,
  getDomContainer,
  setPlatform,
  type JSXOutput,
  useErrorBoundary,
  Slot,
  useTask$,
  useSignal,
  useStylesScoped$,
  useStore,
  Fragment as Signal,
} from '@qwik.dev/core';
import { ErrorProvider, emulateExecutionOfBackpatch } from '../../testing/rendering.unit-util';
import { delay } from '../shared/utils/promises';
import { getScopedStyles } from '../shared/utils/scoped-stylesheet';
import { TypeIds } from '../shared/serdes/constants';
import * as logUtils from '../shared/utils/log';
import { renderToStream } from '../../server/ssr-render';
import type { StreamWriter } from '../../server/types';
import { cleanupAttrs } from '../../testing/element-fixture';

const debug = false; //true;
Error.stackTraceLimit = 100;

const collectStream = (chunks: string[]): StreamWriter => ({
  write(chunk) {
    chunks.push(chunk);
  },
});

const loading = '<div style="display:contents"><span>Loading...</span></div>';
const OOOS_SCOPED_STYLE = `.ooos-scoped { color: red; }`;

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

describe('renderToStream: out-of-order Suspense', () => {
  it('should not use out-of-order streaming when suspense strategy is disabled', async () => {
    let resolveSlow!: (value: JSXOutput) => void;
    const slow = new Promise<JSXOutput>((resolve) => {
      resolveSlow = resolve;
    });
    const Slow = component$(() => <>{slow}</>);
    const chunks: string[] = [];

    const renderPromise = renderToStream(
      <main>
        <Suspense fallback={<button>Waiting</button>}>
          <Slow />
        </Suspense>
      </main>,
      {
        containerTagName: 'div',
        qwikLoader: 'never',
        stream: collectStream(chunks),
        streaming: {
          inOrder: { strategy: 'disabled' },
          outOfOrder: { strategy: 'disabled' },
        },
      }
    );

    resolveSlow(<section>Done</section>);
    await renderPromise;

    const html = chunks.join('');
    expect(html).toContain('Done');
    expect(html).not.toContain('q:rp=');
    expect(html).not.toContain('q:r=');
    expect(html).not.toContain('qO(');
  });

  it('should stream fallback and shell before slow content resolves', async () => {
    let resolveSlow!: (value: JSXOutput) => void;
    const slow = new Promise<JSXOutput>((resolve) => {
      resolveSlow = resolve;
    });
    const Slow = component$(() => <>{slow}</>);
    const chunks: string[] = [];
    const stream = collectStream(chunks);

    const renderPromise = renderToStream(
      <main>
        <h1>Title</h1>
        <Suspense fallback={<button>Waiting</button>}>
          <Slow />
        </Suspense>
        <footer>Footer</footer>
      </main>,
      {
        containerTagName: 'div',
        qwikLoader: 'never',
        stream,
        streaming: {
          inOrder: { strategy: 'disabled' },
          outOfOrder: { strategy: 'suspense' },
        },
      }
    );

    await vi.waitFor(() => expect(chunks.join('')).toContain('Waiting'));
    await vi.waitFor(() => expect(chunks.join('')).toContain('Footer'));
    expect(chunks.join('')).not.toContain('Done');

    resolveSlow(<section>Done</section>);
    await renderPromise;
    const html = chunks.join('');
    expect(html).not.toContain('q:sus');
    expect(html).not.toContain('q:f=');
    expect(html).toContain('<div style="display:contents"');
    expect(html).toContain('q:rp="1"');
    expect(html).toContain('<template q:r="1"></template>');
    expect(html).toContain('<template q:r="1">');
    expect(html).toContain('qO(1)');
    expect(html).toContain('Done');

    const document = createDocument({ html });
    const scripts = Array.from(
      document.querySelectorAll('script[type="text/javascript"]'),
      (script) => script.textContent || ''
    );
    // eslint-disable-next-line no-new-func
    new Function('document', scripts.join('\n'))(document);
    const fallbackHost = document.querySelector('button')!.parentElement as HTMLElement;
    const contentHost = document.querySelector('section')!.parentElement as HTMLElement;
    expect(fallbackHost.style.display).toBe('none');
    expect(contentHost.style.display).toBe('contents');
  });

  it('should stream resolved HTML and segment vnode data before root state when ready early', async () => {
    let resolveSlow!: (value: JSXOutput) => void;
    let releaseFirstFlush!: () => void;
    let flushes = 0;
    const slow = new Promise<JSXOutput>((resolve) => {
      resolveSlow = resolve;
    });
    const Slow = component$(() => <>{slow}</>);
    const App = component$(() => {
      const count = useSignal(0);
      return (
        <main>
          <button onClick$={() => count.value++}>{count.value}</button>
          <Suspense fallback={<button onClick$={() => undefined}>Waiting</button>}>
            <Slow />
          </Suspense>
          <footer>Footer</footer>
        </main>
      );
    });
    const chunks: string[] = [];

    const renderPromise = renderToStream(<App />, {
      containerTagName: 'div',
      qwikLoader: 'never',
      stream: {
        write(chunk) {
          chunks.push(chunk);
          flushes++;
          if (flushes === 1) {
            return new Promise<void>((resolve) => {
              releaseFirstFlush = resolve;
            });
          }
        },
      },
      streaming: {
        inOrder: { strategy: 'disabled' },
        outOfOrder: { strategy: 'suspense' },
      },
    });

    await vi.waitFor(() => expect(chunks.join('')).toContain('Waiting'));
    resolveSlow(<button onClick$={() => undefined}>Done early</button>);
    await vi.waitFor(() => expect(releaseFirstFlush).toBeDefined());
    releaseFirstFlush();
    await renderPromise;

    const html = chunks.join('');
    const resolvedHtmlIndex = html.indexOf('<template q:r="1">');
    const swapIndex = html.indexOf('qO(1)');
    const segmentVnodeIndex = html.indexOf('type="qwik/vnode" q:r="1"');
    const rootStateIndex = html.indexOf('type="qwik/state"');
    const swapChunkIndex = chunks.findIndex((chunk) => chunk.includes('qO(1)'));
    const rootStateChunkIndex = chunks.findIndex((chunk) => chunk.includes('type="qwik/state"'));

    expect(resolvedHtmlIndex).toBeGreaterThan(-1);
    expect(swapIndex).toBeGreaterThan(resolvedHtmlIndex);
    expect(segmentVnodeIndex).toBeGreaterThan(resolvedHtmlIndex);
    expect(rootStateIndex).toBeGreaterThan(-1);
    expect(swapChunkIndex).toBeGreaterThan(-1);
    expect(rootStateChunkIndex).toBeGreaterThan(-1);
    expect(html).not.toContain('q:patch');
  });

  it('should preserve a slow root forward ref when a later segment has a faster forward ref', async () => {
    let resolveRootPromise!: (value: string) => void;
    let resolveSegment!: (value: JSXOutput) => void;
    const rootPromise = new Promise<string>((resolve) => {
      resolveRootPromise = resolve;
    });
    const segmentGate = new Promise<JSXOutput>((resolve) => {
      resolveSegment = resolve;
    });
    const segmentPromise = Promise.resolve('fast segment promise');
    (globalThis as any).__ooosUnitSlowForwardRefValue = '';
    (globalThis as any).__ooosUnitFastForwardRefValue = '';

    const SegmentContent = component$(() => {
      const fast = useSignal<Promise<string>>(segmentPromise);
      return (
        <button
          id="ooos-unit-fast-forward-ref-button"
          onClick$={async () => {
            (globalThis as any).__ooosUnitFastForwardRefValue = await fast.value;
          }}
        >
          Read fast forward ref
        </button>
      );
    });
    const Slow = component$(() => <>{segmentGate}</>);
    const App = component$(() => {
      const slow = useSignal<Promise<string>>(rootPromise);
      return (
        <main>
          <button
            id="ooos-unit-slow-forward-ref-button"
            onClick$={async () => {
              (globalThis as any).__ooosUnitSlowForwardRefValue = await slow.value;
            }}
          >
            Read slow forward ref
          </button>
          <Suspense fallback={<p>Waiting forward refs</p>}>
            <Slow />
          </Suspense>
        </main>
      );
    });
    const chunks: string[] = [];
    const renderPromise = renderToStream(<App />, {
      containerTagName: 'div',
      qwikLoader: 'never',
      stream: collectStream(chunks),
      streaming: {
        inOrder: { strategy: 'disabled' },
        outOfOrder: { strategy: 'suspense' },
      },
    });

    try {
      await vi.waitFor(() => expect(chunks.join('')).toContain('Waiting forward refs'));
      resolveRootPromise('slow root promise');
      resolveSegment(<SegmentContent />);
      await renderPromise;
      const { vNode } = await ssrRenderToDom(<App />, { debug });
      expect(vNode).toMatchVDOM(
        <Component>
          <main>
            <button id="ooos-unit-slow-forward-ref-button">Read slow forward ref</button>
            <Component ssr-required>
              <Fragment ssr-required>
                <div style="display:none">
                  <p>Waiting forward refs</p>
                </div>
                <div style="display:contents">
                  <Projection ssr-required>
                    <Component>
                      <Fragment ssr-required>
                        <Component>
                          <Fragment ssr-required>
                            <Fragment ssr-required>
                              <button id="ooos-unit-fast-forward-ref-button">
                                Read fast forward ref
                              </button>
                            </Fragment>
                          </Fragment>
                        </Component>
                      </Fragment>
                    </Component>
                  </Projection>
                </div>
              </Fragment>
            </Component>
          </main>
        </Component>
      );

      const document = createDocument({ html: chunks.join('') });
      const scripts = Array.from(
        document.querySelectorAll('script[type="text/javascript"]'),
        (script) => script.textContent || ''
      );
      // eslint-disable-next-line no-new-func
      new Function('document', scripts.join('\n'))(document);
      const rootStateScript = document.querySelector('script[type="qwik/state"]:not([q\\:patch])');
      const segmentStateScript = document.querySelector(
        'script[type="qwik/state"][q\\:patch][q\\:r]'
      );
      expect(rootStateScript).not.toBeNull();
      expect(segmentStateScript).not.toBeNull();
      expect(JSON.parse(rootStateScript!.textContent!) as unknown[]).toContain(TypeIds.ForwardRefs);
      const segmentPatch = JSON.parse(segmentStateScript!.textContent!) as unknown[];
      const segmentRoots = segmentPatch[1] as unknown[];
      const segmentForwardRefs = segmentPatch[2] as unknown[];
      const hasForwardRef = (value: unknown): boolean =>
        Array.isArray(value) &&
        value.some(
          (item, index) =>
            (item === TypeIds.ForwardRef && value[index + 1] === 1) || hasForwardRef(item)
        );
      expect(segmentForwardRefs.length).toBe(1);
      expect(hasForwardRef(segmentRoots)).toBe(true);

      const platform = getPlatform();
      setPlatform(getTestPlatform());
      try {
        emulateExecutionOfQwikFuncs(document);
        emulateExecutionOfBackpatch(document);
        const container = getDomContainer(document.querySelector('[q\\:container]') as HTMLElement);

        await trigger(container.element, '#ooos-unit-slow-forward-ref-button', 'click');
        await waitForDrain(container);
        expect((globalThis as any).__ooosUnitSlowForwardRefValue).toBe('slow root promise');

        await trigger(container.element, '#ooos-unit-fast-forward-ref-button', 'click');
        await waitForDrain(container);
        expect((globalThis as any).__ooosUnitFastForwardRefValue).toBe('fast segment promise');
      } finally {
        setPlatform(platform);
      }
    } finally {
      resolveRootPromise('slow root promise');
      resolveSegment(<SegmentContent />);
      await renderPromise;
      delete (globalThis as any).__ooosUnitSlowForwardRefValue;
      delete (globalThis as any).__ooosUnitFastForwardRefValue;
    }
  });

  it('should stream sibling task-backed boundaries as each task resolves once', async () => {
    const firstResolvers: Array<() => void> = [];
    const secondResolvers: Array<() => void> = [];
    (globalThis as any).__ooosTaskFirstResolvers = firstResolvers;
    (globalThis as any).__ooosTaskSecondResolvers = secondResolvers;

    const First = component$(() => {
      useTask$(() => {
        return new Promise<void>((resolve) => {
          (globalThis as any).__ooosTaskFirstResolvers.push(resolve);
        });
      });
      return <p>First task ready</p>;
    });
    const Second = component$(() => {
      useTask$(() => {
        return new Promise<void>((resolve) => {
          (globalThis as any).__ooosTaskSecondResolvers.push(resolve);
        });
      });
      return <p>Second task ready</p>;
    });
    const chunks: string[] = [];

    const renderPromise = renderToStream(
      <main>
        <Suspense fallback={<p>First waiting</p>}>
          <First />
        </Suspense>
        <Suspense fallback={<p>Second waiting</p>}>
          <Second />
        </Suspense>
      </main>,
      {
        containerTagName: 'div',
        qwikLoader: 'never',
        stream: collectStream(chunks),
        streaming: {
          inOrder: { strategy: 'disabled' },
          outOfOrder: { strategy: 'suspense' },
        },
      }
    );

    try {
      await vi.waitFor(() => expect(firstResolvers.length).toBe(1));
      await vi.waitFor(() => expect(secondResolvers.length).toBe(1));
      firstResolvers.shift()!();
      await vi.waitFor(() => expect(chunks.join('')).toContain('First task ready'));
      expect(chunks.join('')).not.toContain('Second task ready');

      secondResolvers.shift()!();
      await renderPromise;
      expect(chunks.join('')).toContain('Second task ready');
      expect(firstResolvers.length).toBe(0);
      expect(secondResolvers.length).toBe(0);
    } finally {
      while (firstResolvers.length) {
        firstResolvers.shift()!();
      }
      while (secondResolvers.length) {
        secondResolvers.shift()!();
      }
      delete (globalThis as any).__ooosTaskFirstResolvers;
      delete (globalThis as any).__ooosTaskSecondResolvers;
    }
  });

  it('should emit compact segment vnode attributes', async () => {
    let resolveSlow!: (value: JSXOutput) => void;
    const slow = new Promise<JSXOutput>((resolve) => {
      resolveSlow = resolve;
    });
    const Slow = component$(() => <>{slow}</>);
    const chunks: string[] = [];

    const renderPromise = renderToStream(
      <main>
        <Suspense fallback={<button onClick$={() => undefined}>Fallback</button>}>
          <Slow />
        </Suspense>
      </main>,
      {
        containerTagName: 'div',
        qwikLoader: 'never',
        stream: collectStream(chunks),
        streaming: {
          inOrder: { strategy: 'disabled' },
          outOfOrder: { strategy: 'suspense' },
        },
      }
    );

    await vi.waitFor(() => expect(chunks.join('')).toContain('Fallback'));
    resolveSlow(<button onClick$={() => undefined}>Resolved</button>);
    await renderPromise;
    const html = chunks.join('');
    expect(html).not.toContain('q:s=');
    expect(html).toContain('type="qwik/vnode" q:r="1"');
    expect(html).not.toContain('type="qwik/vnode" q:r="1" q:o=');
    expect(html).not.toContain('q:segment');
    expect(html).not.toContain('q:suspense');
  });

  it('should replay projected Slot children when resolved content is rendered later', async () => {
    let resolveSlow!: (value: JSXOutput) => void;
    const slow = new Promise<JSXOutput>((resolve) => {
      resolveSlow = resolve;
    });
    const Slow = component$(() => <>{slow}</>);
    const Boundary = component$(() => (
      <Suspense fallback={<p>Waiting slot</p>}>
        <Slot />
      </Suspense>
    ));
    const chunks: string[] = [];

    const renderPromise = renderToStream(
      <main>
        <Boundary>
          <Slow />
        </Boundary>
      </main>,
      {
        containerTagName: 'div',
        qwikLoader: 'never',
        stream: collectStream(chunks),
        streaming: {
          inOrder: { strategy: 'disabled' },
          outOfOrder: { strategy: 'suspense' },
        },
      }
    );

    await vi.waitFor(() => expect(chunks.join('')).toContain('Waiting slot'));
    expect(chunks.join('')).not.toContain('Slotted done');

    resolveSlow(<strong>Slotted done</strong>);
    await renderPromise;

    const html = chunks.join('');
    expect(html).toContain('<template q:r="1">');
    expect(html).toContain('Slotted done');
  });

  it('should swap projected Slot children into the content host when resolved later', async () => {
    let resolveSlow!: (value: JSXOutput) => void;
    const slow = new Promise<JSXOutput>((resolve) => {
      resolveSlow = resolve;
    });
    const Slow = component$(() => <>{slow}</>);
    const Boundary = component$(() => (
      <Suspense fallback={<p id="ooos-slot-fallback">Waiting slot swap</p>}>
        <Slot />
      </Suspense>
    ));
    const chunks: string[] = [];

    const renderPromise = renderToStream(
      <main>
        <Boundary>
          <Slow />
        </Boundary>
      </main>,
      {
        containerTagName: 'div',
        qwikLoader: 'never',
        stream: collectStream(chunks),
        streaming: {
          inOrder: { strategy: 'disabled' },
          outOfOrder: { strategy: 'suspense' },
        },
      }
    );

    await vi.waitFor(() => expect(chunks.join('')).toContain('Waiting slot swap'));
    resolveSlow(<strong id="ooos-slot-resolved">Slotted swapped</strong>);
    await renderPromise;

    const document = createDocument({ html: chunks.join('') });
    const scripts = Array.from(
      document.querySelectorAll('script[type="text/javascript"]'),
      (script) => script.textContent || ''
    );
    // eslint-disable-next-line no-new-func
    new Function('document', scripts.join('\n'))(document);

    const contentHost = document.querySelector('[q\\:rp="1"]') as HTMLElement;
    const resolved = document.querySelector('#ooos-slot-resolved') as HTMLElement;
    const fallbackHost = document.querySelector('#ooos-slot-fallback')!
      .parentElement as HTMLElement;
    expect(contentHost.contains(resolved)).toBe(true);
    expect(contentHost.style.display).toBe('contents');
    expect(fallbackHost.style.display).toBe('none');
    expect(contentHost.querySelector('template[q\\:r="1"]')).toBeFalsy();
  });

  it('should preserve scoped styles for projected Slot children when resolved later', async () => {
    let resolveSlow!: (value: JSXOutput) => void;
    const slow = new Promise<JSXOutput>((resolve) => {
      resolveSlow = resolve;
    });
    (globalThis as any).__ooosScopedStyleId = '';

    const StyledSlotContent = component$(() => {
      const scopedStyle = useStylesScoped$(OOOS_SCOPED_STYLE);
      (globalThis as any).__ooosScopedStyleId = scopedStyle.scopeId;
      return (
        <strong id="ooos-scoped-slot" class="ooos-scoped">
          Styled slot
        </strong>
      );
    });
    const Slow = component$(() => <>{slow}</>);
    const Boundary = component$(() => (
      <Suspense fallback={<p id="ooos-scoped-fallback">Waiting scoped slot</p>}>
        <Slot />
      </Suspense>
    ));
    const chunks: string[] = [];

    const renderPromise = renderToStream(
      <main>
        <Boundary>
          <Slow />
        </Boundary>
      </main>,
      {
        containerTagName: 'div',
        qwikLoader: 'never',
        stream: collectStream(chunks),
        streaming: {
          inOrder: { strategy: 'disabled' },
          outOfOrder: { strategy: 'suspense' },
        },
      }
    );

    await vi.waitFor(() => expect(chunks.join('')).toContain('Waiting scoped slot'));
    resolveSlow(<StyledSlotContent />);
    await renderPromise;

    const document = createDocument({ html: chunks.join('') });
    const scripts = Array.from(
      document.querySelectorAll('script[type="text/javascript"]'),
      (script) => script.textContent || ''
    );
    // eslint-disable-next-line no-new-func
    new Function('document', scripts.join('\n'))(document);

    const rawStyleId = (globalThis as any).__ooosScopedStyleId as string;
    const styleId = rawStyleId.substring(2);
    const scopeStyle = getScopedStyles(OOOS_SCOPED_STYLE, styleId);
    const resolved = document.querySelector('#ooos-scoped-slot') as HTMLElement;
    const styleElement = document.querySelector(`style[q\\:style="${styleId}"]`) as HTMLElement;
    expect(rawStyleId).not.toBe('');
    expect(resolved.className).toBe(`${rawStyleId} ooos-scoped`);
    expect(cleanupAttrs(styleElement.outerHTML)).toBe(
      `<style q:style="${styleId}">${scopeStyle}</style>`
    );
    expect((document.querySelector('[q\\:rp="1"]') as HTMLElement).contains(styleElement)).toBe(
      true
    );
    delete (globalThis as any).__ooosScopedStyleId;
  });

  it('should let resolved segment QRLs capture root-owned state', async () => {
    let resolveSlow!: (value: JSXOutput) => void;
    const slow = new Promise<JSXOutput>((resolve) => {
      resolveSlow = resolve;
    });
    (globalThis as any).__ooosUnitSharedShellValue = 0;
    (globalThis as any).__ooosUnitSharedResolvedValue = 0;

    const Slow = component$((props: { count: any }) => (
      <>
        {slow}
        <button
          id="ooos-unit-shared-resolved-button"
          onClick$={() => {
            props.count.value += 1;
            (globalThis as any).__ooosUnitSharedResolvedValue = props.count.value;
          }}
        >
          Touch resolved shared
        </button>
      </>
    ));
    const App = component$(() => {
      const count = useSignal(0);
      return (
        <main>
          <button
            id="ooos-unit-shared-shell-button"
            onClick$={() => {
              count.value += 1;
              (globalThis as any).__ooosUnitSharedShellValue = count.value;
            }}
          >
            Touch shell shared
          </button>
          <span id="ooos-unit-shared-count">{count.value}</span>
          <Suspense fallback={<p>Waiting shared</p>}>
            <Slow count={count} />
          </Suspense>
        </main>
      );
    });
    const chunks: string[] = [];

    const renderPromise = renderToStream(<App />, {
      containerTagName: 'div',
      qwikLoader: 'never',
      stream: collectStream(chunks),
      streaming: {
        inOrder: { strategy: 'disabled' },
        outOfOrder: { strategy: 'suspense' },
      },
    });

    try {
      await vi.waitFor(() => expect(chunks.join('')).toContain('Waiting shared'));
      resolveSlow(<span id="ooos-unit-shared-ready">Ready shared</span>);
      await renderPromise;

      const html = chunks.join('');
      const document = createDocument({ html });
      const scripts = Array.from(
        document.querySelectorAll('script[type="text/javascript"]'),
        (script) => script.textContent || ''
      );
      // eslint-disable-next-line no-new-func
      new Function('document', scripts.join('\n'))(document);
      const segmentStateScript = document.querySelector('script[type="qwik/state"][q\\:patch]');
      expect(segmentStateScript).not.toBeNull();
      expect(segmentStateScript?.hasAttribute('q:s')).toBe(false);
      expect(segmentStateScript?.getAttribute('q:r')).toBe('1');
      expect(segmentStateScript?.hasAttribute('q:fx')).toBe(false);
      expect(document.querySelector('#ooos-unit-shared-resolved-button')).not.toBeNull();

      emulateExecutionOfQwikFuncs(document);
      emulateExecutionOfBackpatch(document);
      const container = getDomContainer(document.querySelector('[q\\:container]') as HTMLElement);

      await trigger(container.element, '#ooos-unit-shared-shell-button', 'click');
      expect((globalThis as any).__ooosUnitSharedShellValue).toBe(1);
    } finally {
      delete (globalThis as any).__ooosUnitSharedShellValue;
      delete (globalThis as any).__ooosUnitSharedResolvedValue;
    }
  });

  it('should merge resolved segment effects for root-owned stores', async () => {
    let resolveSlow!: (value: JSXOutput) => void;
    const slow = new Promise<JSXOutput>((resolve) => {
      resolveSlow = resolve;
    });
    (globalThis as any).__ooosUnitStoreShellValue = 0;
    (globalThis as any).__ooosUnitStoreResolvedValue = 0;

    const Slow = component$((props: { state: { count: number } }) => (
      <>
        {slow}
        <button
          id="ooos-unit-store-resolved-button"
          onClick$={() => {
            props.state.count += 1;
            (globalThis as any).__ooosUnitStoreResolvedValue = props.state.count;
          }}
        >
          Touch resolved store
        </button>
        <span id="ooos-unit-store-resolved-count">{props.state.count}</span>
      </>
    ));
    const App = component$(() => {
      const state = useStore({ count: 0 });
      return (
        <main>
          <button
            id="ooos-unit-store-shell-button"
            onClick$={() => {
              state.count += 1;
              (globalThis as any).__ooosUnitStoreShellValue = state.count;
            }}
          >
            Touch shell store
          </button>
          <span id="ooos-unit-store-shell-count">{state.count}</span>
          <Suspense fallback={<p>Waiting store</p>}>
            <Slow state={state} />
          </Suspense>
        </main>
      );
    });
    const chunks: string[] = [];

    const renderPromise = renderToStream(<App />, {
      containerTagName: 'div',
      qwikLoader: 'never',
      stream: collectStream(chunks),
      streaming: {
        inOrder: { strategy: 'disabled' },
        outOfOrder: { strategy: 'suspense' },
      },
    });

    try {
      await vi.waitFor(() => expect(chunks.join('')).toContain('Waiting store'));
      resolveSlow(<span id="ooos-unit-store-ready">Ready store</span>);
      await renderPromise;

      const html = chunks.join('');
      const document = createDocument({ html });
      const scripts = Array.from(
        document.querySelectorAll('script[type="text/javascript"]'),
        (script) => script.textContent || ''
      );
      // eslint-disable-next-line no-new-func
      new Function('document', scripts.join('\n'))(document);
      const segmentStateScript = document.querySelector('script[type="qwik/state"][q\\:patch]');
      expect(segmentStateScript?.getAttribute('q:r')).toBe('1');
      expect(segmentStateScript?.hasAttribute('q:fx')).toBe(false);
      expect(JSON.parse(segmentStateScript!.textContent!)[3]).toBeDefined();
      expect(segmentStateScript?.hasAttribute('q:s')).toBe(false);
      expect(document.querySelector('#ooos-unit-store-resolved-button')).not.toBeNull();

      const platform = getPlatform();
      setPlatform(getTestPlatform());
      try {
        emulateExecutionOfQwikFuncs(document);
        emulateExecutionOfBackpatch(document);
        const container = getDomContainer(document.querySelector('[q\\:container]') as HTMLElement);

        await trigger(container.element, '#ooos-unit-store-shell-button', 'click');
        await waitForDrain(container);
        expect((globalThis as any).__ooosUnitStoreShellValue).toBe(1);
        expect(document.querySelector('#ooos-unit-store-shell-count')?.textContent).toBe('1');
        expect(document.querySelector('#ooos-unit-store-resolved-count')?.textContent).toBe('1');
      } finally {
        setPlatform(platform);
      }
    } finally {
      delete (globalThis as any).__ooosUnitStoreShellValue;
      delete (globalThis as any).__ooosUnitStoreResolvedValue;
    }
  });

  it('should share a root-owned store across multiple resolved segments', async () => {
    let resolveFirst!: (value: JSXOutput) => void;
    let resolveSecond!: (value: JSXOutput) => void;
    const first = new Promise<JSXOutput>((resolve) => {
      resolveFirst = resolve;
    });
    const second = new Promise<JSXOutput>((resolve) => {
      resolveSecond = resolve;
    });
    (globalThis as any).__ooosUnitSharedStoreFirstValue = 0;

    const First = component$((props: { shared: { count: number } }) => (
      <>
        {first}
        <button
          id="ooos-unit-shared-store-first-button"
          onClick$={() => {
            props.shared.count += 1;
            (globalThis as any).__ooosUnitSharedStoreFirstValue = props.shared.count;
          }}
        >
          Touch first shared store
        </button>
        <span id="ooos-unit-shared-store-first-count">{props.shared.count}</span>
      </>
    ));
    const Second = component$((props: { shared: { count: number } }) => (
      <>
        {second}
        <span id="ooos-unit-shared-store-second-count">{props.shared.count}</span>
      </>
    ));
    const App = component$(() => {
      const shared = useStore({ count: 0 });
      return (
        <main>
          <button
            id="ooos-unit-shared-store-shell-button"
            onClick$={() => {
              shared.count += 1;
            }}
          >
            Touch shell shared store
          </button>
          <span id="ooos-unit-shared-store-shell-count">{shared.count}</span>
          <Suspense fallback={<p>Waiting first shared store</p>}>
            <First shared={shared} />
          </Suspense>
          <Suspense fallback={<p>Waiting second shared store</p>}>
            <Second shared={shared} />
          </Suspense>
        </main>
      );
    });
    const chunks: string[] = [];

    const renderPromise = renderToStream(<App />, {
      containerTagName: 'div',
      qwikLoader: 'never',
      stream: collectStream(chunks),
      streaming: {
        inOrder: { strategy: 'disabled' },
        outOfOrder: { strategy: 'suspense' },
      },
    });

    try {
      await vi.waitFor(() => expect(chunks.join('')).toContain('Waiting first shared store'));
      await vi.waitFor(() => expect(chunks.join('')).toContain('Waiting second shared store'));
      resolveFirst(<span id="ooos-unit-shared-store-first-ready">First ready</span>);
      resolveSecond(<span id="ooos-unit-shared-store-second-ready">Second ready</span>);
      await renderPromise;

      const html = chunks.join('');
      const document = createDocument({ html });
      const scripts = Array.from(
        document.querySelectorAll('script[type="text/javascript"]'),
        (script) => script.textContent || ''
      );
      // eslint-disable-next-line no-new-func
      new Function('document', scripts.join('\n'))(document);
      const segmentStateScripts = document.querySelectorAll(
        'script[type="qwik/state"][q\\:patch][q\\:r]'
      );
      expect(segmentStateScripts.length).toBe(2);
      for (let i = 0; i < segmentStateScripts.length; i++) {
        const script = segmentStateScripts[i];
        expect(script.hasAttribute('q:fx')).toBe(false);
        expect(JSON.parse(script.textContent!)[3]).toBeDefined();
      }
      expect(document.querySelector('#ooos-unit-shared-store-first-button')).not.toBeNull();
      expect(document.querySelector('#ooos-unit-shared-store-second-count')).not.toBeNull();

      const platform = getPlatform();
      setPlatform(getTestPlatform());
      try {
        emulateExecutionOfQwikFuncs(document);
        emulateExecutionOfBackpatch(document);
        const container = getDomContainer(document.querySelector('[q\\:container]') as HTMLElement);

        await trigger(container.element, '#ooos-unit-shared-store-first-button', 'click');
        await waitForDrain(container);
        expect((globalThis as any).__ooosUnitSharedStoreFirstValue).toBe(1);
        expect(document.querySelector('#ooos-unit-shared-store-shell-count')?.textContent).toBe(
          '1'
        );
        expect(document.querySelector('#ooos-unit-shared-store-first-count')?.textContent).toBe(
          '1'
        );
        expect(document.querySelector('#ooos-unit-shared-store-second-count')?.textContent).toBe(
          '1'
        );
      } finally {
        setPlatform(platform);
      }
    } finally {
      delete (globalThis as any).__ooosUnitSharedStoreFirstValue;
    }
  });

  it('should share a store used only by multiple resolved segments', async () => {
    let resolveFirst!: (value: JSXOutput) => void;
    let resolveSecond!: (value: JSXOutput) => void;
    const first = new Promise<JSXOutput>((resolve) => {
      resolveFirst = resolve;
    });
    const second = new Promise<JSXOutput>((resolve) => {
      resolveSecond = resolve;
    });
    (globalThis as any).__ooosUnitCrossStoreFirstValue = 0;

    const First = component$((props: { shared: { count: number } }) => (
      <>
        {first}
        <button
          id="ooos-unit-cross-store-first-button"
          onClick$={() => {
            props.shared.count += 1;
            (globalThis as any).__ooosUnitCrossStoreFirstValue = props.shared.count;
          }}
        >
          Touch first cross store
        </button>
        <span id="ooos-unit-cross-store-first-count">{props.shared.count}</span>
      </>
    ));
    const Second = component$((props: { shared: { count: number } }) => (
      <>
        {second}
        <span id="ooos-unit-cross-store-second-count">{props.shared.count}</span>
      </>
    ));
    const App = component$(() => {
      const shared = useStore({ count: 0 });
      return (
        <main>
          <h1>Shell does not read the cross store</h1>
          <Suspense fallback={<p>Waiting first cross store</p>}>
            <First shared={shared} />
          </Suspense>
          <Suspense fallback={<p>Waiting second cross store</p>}>
            <Second shared={shared} />
          </Suspense>
        </main>
      );
    });
    const chunks: string[] = [];

    const renderPromise = renderToStream(<App />, {
      containerTagName: 'div',
      qwikLoader: 'never',
      stream: collectStream(chunks),
      streaming: {
        inOrder: { strategy: 'disabled' },
        outOfOrder: { strategy: 'suspense' },
      },
    });

    try {
      await vi.waitFor(() => expect(chunks.join('')).toContain('Waiting first cross store'));
      await vi.waitFor(() => expect(chunks.join('')).toContain('Waiting second cross store'));
      resolveFirst(<span id="ooos-unit-cross-store-first-ready">First ready</span>);
      resolveSecond(<span id="ooos-unit-cross-store-second-ready">Second ready</span>);
      await renderPromise;

      const html = chunks.join('');
      const document = createDocument({ html });
      const scripts = Array.from(
        document.querySelectorAll('script[type="text/javascript"]'),
        (script) => script.textContent || ''
      );
      // eslint-disable-next-line no-new-func
      new Function('document', scripts.join('\n'))(document);
      const segmentStateScripts = document.querySelectorAll('script[type="qwik/state"][q\\:patch]');
      expect(segmentStateScripts.length).toBeGreaterThan(0);
      for (let i = 0; i < segmentStateScripts.length; i++) {
        const script = segmentStateScripts[i];
        expect(script.hasAttribute('q:s')).toBe(false);
      }
      expect(document.querySelector('#ooos-unit-cross-store-first-button')).not.toBeNull();
      expect(document.querySelector('#ooos-unit-cross-store-second-count')).not.toBeNull();

      const platform = getPlatform();
      setPlatform(getTestPlatform());
      try {
        emulateExecutionOfQwikFuncs(document);
        emulateExecutionOfBackpatch(document);
        const container = getDomContainer(document.querySelector('[q\\:container]') as HTMLElement);

        expect(document.querySelector('#ooos-unit-cross-store-first-count')?.textContent).toBe('0');
        expect(document.querySelector('#ooos-unit-cross-store-second-count')?.textContent).toBe(
          '0'
        );

        await trigger(container.element, '#ooos-unit-cross-store-first-button', 'click');
        await waitForDrain(container);
        expect((globalThis as any).__ooosUnitCrossStoreFirstValue).toBe(1);
        expect(document.querySelector('#ooos-unit-cross-store-first-count')?.textContent).toBe('1');
        expect(document.querySelector('#ooos-unit-cross-store-second-count')?.textContent).toBe(
          '1'
        );
      } finally {
        setPlatform(platform);
      }
    } finally {
      delete (globalThis as any).__ooosUnitCrossStoreFirstValue;
    }
  });

  it('should coordinate out-of-order segments inside sequential collapsed Reveal', async () => {
    let resolveFirst!: (value: JSXOutput) => void;
    let resolveSecond!: (value: JSXOutput) => void;
    const first = new Promise<JSXOutput>((resolve) => {
      resolveFirst = resolve;
    });
    const second = new Promise<JSXOutput>((resolve) => {
      resolveSecond = resolve;
    });
    const First = component$(() => <>{first}</>);
    const Second = component$(() => <>{second}</>);
    const chunks: string[] = [];

    const renderPromise = renderToStream(
      <main>
        <Reveal order="sequential" collapsed>
          <Suspense fallback={<p>First fallback</p>}>
            <First />
          </Suspense>
          <Suspense fallback={<p>Second fallback</p>}>
            <Second />
          </Suspense>
        </Reveal>
        <footer>Footer</footer>
      </main>,
      {
        containerTagName: 'div',
        qwikLoader: 'never',
        stream: collectStream(chunks),
        streaming: {
          inOrder: { strategy: 'disabled' },
          outOfOrder: { strategy: 'suspense' },
        },
      }
    );

    await vi.waitFor(() => expect(chunks.join('')).toContain('First fallback'));
    await vi.waitFor(() => expect(chunks.join('')).toContain('Footer'));
    const shellDocument = createDocument({ html: chunks.join('') });
    const shellFallbackHosts = ['First fallback', 'Second fallback'].map(
      (text) =>
        Array.from(shellDocument.querySelectorAll('p')).find((node) => node.textContent === text)!
          .parentElement as HTMLElement
    );
    expect(shellFallbackHosts[0].style.display).toBe('contents');
    expect(shellFallbackHosts[1].style.display).toBe('none');

    resolveSecond(<p>Second done</p>);
    await delay(40);
    const secondReadyHtml = chunks.join('');
    expect(secondReadyHtml).toContain('Second done');
    expect(secondReadyHtml).toContain('qO(2)');
    expect(secondReadyHtml).toContain('qO.g(1,2,"s")');
    expect(secondReadyHtml).toContain('<template q:r="2" q:g="1" q:i="1" q:o="s" q:c');
    expect(secondReadyHtml).not.toContain('q:f=');

    const runOutOfOrderScripts = (html: string) => {
      const document = createDocument({ html });
      const scripts = Array.from(
        document.querySelectorAll('script[type="text/javascript"]'),
        (script) => script.textContent || ''
      );
      // eslint-disable-next-line no-new-func
      new Function('document', scripts.join('\n'))(document);
      return document;
    };

    const secondReadyDocument = runOutOfOrderScripts(secondReadyHtml);
    expect(secondReadyDocument.querySelector('main')!.textContent).toContain('First fallback');
    expect(
      (
        Array.from(secondReadyDocument.querySelectorAll('p')).find(
          (node) => node.textContent === 'Second done'
        )!.parentElement as HTMLElement
      ).style.display
    ).toBe('none');
    expect(
      (
        Array.from(secondReadyDocument.querySelectorAll('p')).find(
          (node) => node.textContent === 'Second fallback'
        )!.parentElement as HTMLElement
      ).style.display
    ).toBe('none');

    resolveFirst(<p>First done</p>);
    await renderPromise;

    const html = chunks.join('');
    expect(html).toContain('qO(1)');
    expect(html).toContain('qO(2)');
    const document = runOutOfOrderScripts(html);
    const text = document.querySelector('main')!.textContent!;
    expect(text).toContain('First done');
    expect(text).toContain('Second done');
    expect(
      (
        Array.from(document.querySelectorAll('p')).find(
          (node) => node.textContent === 'First fallback'
        )!.parentElement as HTMLElement
      ).style.display
    ).toBe('none');
    expect(
      (
        Array.from(document.querySelectorAll('p')).find(
          (node) => node.textContent === 'Second fallback'
        )!.parentElement as HTMLElement
      ).style.display
    ).toBe('none');
  });

  it('should keep pending fallback state isolated from shell state', async () => {
    let resolveSlow!: (value: JSXOutput) => void;
    const slow = new Promise<JSXOutput>((resolve) => {
      resolveSlow = resolve;
    });
    (globalThis as any).__ooosUnitFallbackClicks = 0;
    (globalThis as any).__ooosUnitShellClicks = 0;
    const Slow = component$(() => <>{slow}</>);
    const Fallback = component$(() => {
      const count = useSignal(0);
      return (
        <section id="ooos-unit-fallback">
          <button
            id="ooos-unit-fallback-button"
            onClick$={() => {
              (globalThis as any).__ooosUnitFallbackClicks =
                ((globalThis as any).__ooosUnitFallbackClicks || 0) + 1;
              count.value += 1;
              (globalThis as any).__ooosUnitFallbackValue = count.value;
            }}
          >
            Touch fallback
          </button>
          <span id="ooos-unit-fallback-count">{count.value}</span>
        </section>
      );
    });
    const App = component$(() => {
      const count = useSignal(0);
      return (
        <main>
          <Suspense fallback={<Fallback />}>
            <Slow />
          </Suspense>
          <button
            id="ooos-unit-shell-button"
            onClick$={() => {
              (globalThis as any).__ooosUnitShellClicks =
                ((globalThis as any).__ooosUnitShellClicks || 0) + 1;
              count.value += 1;
              (globalThis as any).__ooosUnitShellValue = count.value;
            }}
          >
            Touch shell
          </button>
          <span id="ooos-unit-shell-count">{count.value}</span>
        </main>
      );
    });
    const chunks: string[] = [];

    const renderPromise = renderToStream(<App />, {
      containerTagName: 'div',
      qwikLoader: 'never',
      stream: collectStream(chunks),
      streaming: {
        inOrder: { strategy: 'disabled' },
        outOfOrder: { strategy: 'suspense' },
      },
    });

    try {
      await vi.waitFor(() => expect(chunks.join('')).toContain('ooos-unit-fallback-button'));
      await vi.waitFor(() => expect(chunks.join('')).toContain('ooos-unit-shell-button'));
      await vi.waitFor(() => expect(chunks.join('')).toContain('type="qwik/state"'));
      const html = chunks.join('');
      const document = createDocument({ html });
      emulateExecutionOfQwikFuncs(document);
      emulateExecutionOfBackpatch(document);
      const container = getDomContainer(document.querySelector('[q\\:container]') as HTMLElement);
      expect(document.querySelector('script[type="qwik/state"][q\\:s]') == null).toBe(true);

      await trigger(container.element, '#ooos-unit-fallback-button', 'click');
      expect((globalThis as any).__ooosUnitFallbackClicks).toBe(1);
      expect((globalThis as any).__ooosUnitFallbackValue).toBe(1);

      await trigger(container.element, '#ooos-unit-shell-button', 'click');
      expect((globalThis as any).__ooosUnitShellClicks).toBe(1);
      expect((globalThis as any).__ooosUnitShellValue).toBe(1);
    } finally {
      resolveSlow(<section>Done</section>);
      await renderPromise;
      delete (globalThis as any).__ooosUnitFallbackClicks;
      delete (globalThis as any).__ooosUnitShellClicks;
      delete (globalThis as any).__ooosUnitFallbackValue;
      delete (globalThis as any).__ooosUnitShellValue;
    }
  });
});

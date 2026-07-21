import {
  createDocument,
  domRender,
  emulateExecutionOfQwikFuncs,
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
  getDomContainer,
  type JSXOutput,
  useAsync$,
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
import { processOutOfOrderSegmentVNodeData } from '../client/process-vnode-data';
import * as logUtils from '../shared/utils/log';
import type { StreamWriter, StreamingOptions } from '../../server/types';
import { cleanupAttrs } from '../../testing/element-fixture';

const debug = false; //true;
Error.stackTraceLimit = 100;

const collectStream = (chunks: string[]): StreamWriter => ({
  write(chunk) {
    chunks.push(chunk);
  },
});

type SsrRenderSuspenseStreamOptions = {
  outOfOrder?: boolean;
  streaming?: StreamingOptions;
  debug?: boolean;
  raw?: boolean;
  resume?: boolean;
};

const ssrRenderSuspenseStream = (
  jsx: JSXOutput,
  streamOrChunks: StreamWriter | string[],
  opts: SsrRenderSuspenseStreamOptions = {}
) => {
  const stream = Array.isArray(streamOrChunks) ? collectStream(streamOrChunks) : streamOrChunks;
  const streaming = opts.streaming ?? {
    inOrder: { strategy: 'disabled' } as const,
    ...(opts.outOfOrder === undefined ? {} : { outOfOrder: opts.outOfOrder }),
  };
  return ssrRenderToDom(jsx, {
    raw: opts.raw,
    debug: opts.debug ?? debug,
    stream,
    streaming,
    resume: opts.resume,
  });
};

const loading = '<div style="display:contents"><span>Loading...</span></div>';
const OOOS_SCOPED_STYLE = `.ooos-scoped { color: red; }`;

describe.each([
  { render: ssrRenderToDom }, //
  { render: domRender }, //
])('$render.name: loops', ({ render }) => {
  const isSsr = render === ssrRenderToDom;
  const fallbackAttrs = {
    style: isSsr ? 'display: none;' : 'display:none',
  };
  const contentAttrs = (id = '1') =>
    isSsr ? { 'q:rp': id, style: 'display: contents;' } : { style: 'display:contents' };

  it('should render sync children', async () => {
    const { vNode } = await render(
      <Suspense fallback={<span>Loading...</span>}>
        <p>Sync content</p>
      </Suspense>,
      { debug }
    );

    expect(vNode).toMatchVDOM(
      <Component ssr-required>
        <div {...fallbackAttrs}>
          <span>Loading...</span>
        </div>
        <div {...contentAttrs()}>
          <Projection ssr-required>
            <p>Sync content</p>
          </Projection>
        </div>
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
        <div {...fallbackAttrs}>
          <span>Loading...</span>
        </div>
        <div {...contentAttrs()}>
          <Projection ssr-required>
            <Component ssr-required>
              <p>Child content</p>
            </Component>
          </Projection>
        </div>
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
        <div {...fallbackAttrs}>
          <span>Loading...</span>
        </div>
        <div {...contentAttrs()}>
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
        <div {...fallbackAttrs} />
        <div {...contentAttrs()}>
          <Projection ssr-required>
            <p>No fallback</p>
          </Projection>
        </div>
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
          <div {...fallbackAttrs}>
            <span>Loading 1...</span>
          </div>
          <div {...contentAttrs('1')}>
            <Projection ssr-required>
              <p>Content 1</p>
            </Projection>
          </div>
        </Component>

        <Component ssr-required>
          <div {...fallbackAttrs}>
            <span>Loading 2...</span>
          </div>
          <div {...contentAttrs('2')}>
            <Projection ssr-required>
              <p>Content 2</p>
            </Projection>
          </div>
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
          <div {...fallbackAttrs}>
            <span>Loading...</span>
          </div>
          <div {...contentAttrs()}>
            <Projection ssr-required></Projection>
          </div>
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
          <div {...fallbackAttrs}>
            <span>Loading...</span>
          </div>
          <div {...contentAttrs()}>
            <Projection ssr-required>
              <Awaited>
                <p>Resolved</p>
              </Awaited>
            </Projection>
          </div>
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
          <div {...fallbackAttrs}>
            <span>Loading...</span>
          </div>
          <div {...contentAttrs()}>
            <Projection ssr-required>
              <Awaited>
                <p>Fast</p>
              </Awaited>
            </Projection>
          </div>
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
        </Component>
      </div>
    );
  });

  it('should keep resolved content visible when a descendant update blocks', async () => {
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
        </Component>
      </div>
    );

    // Trigger an update that will pause the cursor.
    const toggle = (globalThis as any).__susToggle as { value: number };
    toggle.value = 1;

    // Wait past the delay to ensure the fallback stays hidden.
    await delay(40);

    html = document.querySelector('div')!.innerHTML;
    expect(html).toContain('value=0');
    expect(html).not.toContain(loading);

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
        </Component>
      </div>
    );
  });

  it('should keep projected button interactive when Slot is wrapped in Suspense', async () => {
    const Child = component$(() => (
      <Suspense>
        <Slot />
      </Suspense>
    ));

    const Parent = component$(() => {
      const counter = useSignal(0);
      return (
        <Child>
          <button onClick$={() => counter.value++}>{counter.value}</button>
        </Child>
      );
    });

    const { container, document, vNode } = await domRender(<Parent />, { debug });

    await trigger(document.body, 'button', 'click');
    await waitForDrain(container);

    expect(vNode).toMatchVDOM(
      <Component>
        <Component>
          <Component>
            <div style="display:none" />
            <div style="display:contents">
              <Projection ssr-required>
                <Fragment>
                  <button>
                    <Signal>1</Signal>
                  </button>
                </Fragment>
              </Projection>
            </div>
          </Component>
        </Component>
      </Component>
    );
  });
});

describe('ssrRenderToDom: out-of-order Suspense', () => {
  const runOutOfOrderScripts = (html: string) => {
    const document = createDocument({ html });
    executeOutOfOrderScripts(document);
    return document;
  };

  const executeOutOfOrderScripts = (document: Document) => {
    const scripts = Array.from(
      document.querySelectorAll('script[type="text/javascript"]'),
      (script) => script.textContent || ''
    );
    const qDocument = document as Document & {
      qProcessOOOS?: (boundaryId: number, content: Element | null) => void;
    };
    const previousProcessOOOS = qDocument.qProcessOOOS;
    qDocument.qProcessOOOS = (boundaryId, content) => {
      processOutOfOrderSegmentVNodeData(document, String(boundaryId), content);
      previousProcessOOOS?.(boundaryId, content);
    };
    try {
      // eslint-disable-next-line no-new-func
      new Function('document', scripts.join('\n'))(document);
    } finally {
      qDocument.qProcessOOOS = previousProcessOOOS;
    }
  };

  const executeOutOfOrderScriptsWithoutVNodeProcessing = (document: Document) => {
    const scripts = Array.from(
      document.querySelectorAll('script[type="text/javascript"]'),
      (script) => script.textContent || ''
    );
    const qDocument = document as Document & {
      qProcessOOOS?: (boundaryId: number, content: Element | null) => void;
    };
    const previousProcessOOOS = qDocument.qProcessOOOS;
    qDocument.qProcessOOOS = undefined;
    try {
      // eslint-disable-next-line no-new-func
      new Function('document', scripts.join('\n'))(document);
    } finally {
      qDocument.qProcessOOOS = previousProcessOOOS;
    }
  };

  const getParagraphHost = (document: Document, text: string) =>
    Array.from(document.querySelectorAll('p')).find((node) => node.textContent === text)!
      .parentElement as HTMLElement;

  it('should not use out-of-order streaming when outOfOrder is false', async () => {
    let resolveSlow!: (value: JSXOutput) => void;
    const slow = new Promise<JSXOutput>((resolve) => {
      resolveSlow = resolve;
    });
    const Slow = component$(() => <>{slow}</>);
    const chunks: string[] = [];

    const renderPromise = ssrRenderSuspenseStream(
      <main>
        <Suspense fallback={<button>Waiting</button>}>
          <Slow />
        </Suspense>
      </main>,
      chunks,
      { outOfOrder: false }
    );

    resolveSlow(<section>Done</section>);
    await renderPromise;

    const html = chunks.join('');
    expect(html).toContain('Done');
    expect(html).not.toContain('q:rp=');
    expect(html).not.toContain('q:r=');
    expect(html).not.toContain('qO(');
  });

  it('should use out-of-order streaming by default when Suspense is enabled', async () => {
    let resolveSlow!: (value: JSXOutput) => void;
    const slow = new Promise<JSXOutput>((resolve) => {
      resolveSlow = resolve;
    });
    const Slow = component$(() => <>{slow}</>);
    const chunks: string[] = [];

    const renderPromise = ssrRenderSuspenseStream(
      <main>
        <Suspense fallback={<button>Waiting default</button>}>
          <Slow />
        </Suspense>
      </main>,
      chunks
    );

    await vi.waitFor(() => expect(chunks.join('')).toContain('Waiting default'));
    expect(chunks.join('')).not.toContain('Done default');

    resolveSlow(<section>Done default</section>);
    await renderPromise;

    const html = chunks.join('');
    expect(html).toContain('Done default');
    expect(html).toContain('q:rp="1"');
    expect(html).toContain('<template q:r="1"></template>');
    expect(html).toContain('qO(1)');
  });

  it('should emit the out-of-order executor only once for multiple segments', async () => {
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

    const renderPromise = ssrRenderSuspenseStream(
      <main>
        <Suspense fallback={<p>First waiting</p>}>
          <First />
        </Suspense>
        <Suspense fallback={<p>Second waiting</p>}>
          <Second />
        </Suspense>
      </main>,
      chunks
    );

    await vi.waitFor(() => expect(chunks.join('')).toContain('First waiting'));
    await vi.waitFor(() => expect(chunks.join('')).toContain('Second waiting'));
    resolveFirst(<section>First done</section>);
    resolveSecond(<section>Second done</section>);
    await renderPromise;

    const html = chunks.join('');
    const executorMatches = html.match(/globalThis\.qO\|\|globalThis\.qO\.d!==document/g) || [];
    expect(executorMatches.length).toBe(1);
    expect(html).toContain('qO(1)');
    expect(html).toContain('qO(2)');
  });

  it('should stream fallback and shell before slow content resolves', async () => {
    let resolveSlow!: (value: JSXOutput) => void;
    const slow = new Promise<JSXOutput>((resolve) => {
      resolveSlow = resolve;
    });
    const Slow = component$(() => <>{slow}</>);
    const chunks: string[] = [];

    const renderPromise = ssrRenderSuspenseStream(
      <main>
        <h1>Title</h1>
        <Suspense fallback={<button>Waiting</button>}>
          <Slow />
        </Suspense>
        <footer>Footer</footer>
      </main>,
      chunks
    );

    await vi.waitFor(() => expect(chunks.join('')).toContain('Waiting'));
    await vi.waitFor(() => expect(chunks.join('')).toContain('Footer'));
    expect(chunks.join('')).not.toContain('Done');

    resolveSlow(<section>Done</section>);
    const { document } = await renderPromise;
    const html = chunks.join('');
    expect(html).not.toContain('q:sus');
    expect(html).not.toContain('q:f=');
    expect(html).toContain('<div style="display:contents"');
    expect(html).toContain('q:rp="1"');
    expect(html).toContain('<template q:r="1"></template>');
    expect(html).toContain('<template q:r="1">');
    expect(html).toContain('qO(1)');
    expect(html).toContain('Done');

    const fallbackHost = document.querySelector('button')!.parentElement as HTMLElement;
    const contentHost = document.querySelector('section')!.parentElement as HTMLElement;
    expect(fallbackHost.style.display).toBe('none');
    expect(contentHost.style.display).toBe('contents');
  });

  it('should reveal delayed fallback with a backpatch when content is still pending', async () => {
    let resolveSlow!: (value: JSXOutput) => void;
    const slow = new Promise<JSXOutput>((resolve) => {
      resolveSlow = resolve;
    });
    const Slow = component$(() => <>{slow}</>);
    const chunks: string[] = [];

    const renderPromise = ssrRenderSuspenseStream(
      <main>
        <Suspense fallback={<button id="ooos-delay-fallback">Delayed waiting</button>} delay={10}>
          <Slow />
        </Suspense>
        <footer>Footer</footer>
      </main>,
      chunks
    );

    await vi.waitFor(() => expect(chunks.join('')).toContain('Delayed waiting'));
    await vi.waitFor(() => expect(chunks.join('')).toContain('Footer'));
    await vi.waitFor(() => expect(chunks.join('')).toContain('type="qwik/backpatch"'));

    const shellHtml = chunks.join('');
    expect(shellHtml).toContain('<div style="display:none"');
    expect(shellHtml).toContain('"style","display:contents"');
    const document = createDocument({ html: shellHtml });
    const scripts = Array.from(
      document.querySelectorAll('script[type="text/javascript"]'),
      (script) => script.textContent || ''
    );
    // eslint-disable-next-line no-new-func
    new Function('document', 'debug', scripts.join('\n'))(document, false);
    emulateExecutionOfBackpatch(document);
    const fallbackHost = document.querySelector('#ooos-delay-fallback')!
      .parentElement as HTMLElement;
    expect(fallbackHost.style.display).toBe('contents');

    resolveSlow(<section>Delayed done</section>);
    await renderPromise;
  });

  it('should not emit delayed fallback backpatch when content resolves before delay', async () => {
    let resolveSlow!: (value: JSXOutput) => void;
    const slow = new Promise<JSXOutput>((resolve) => {
      resolveSlow = resolve;
    });
    const Slow = component$(() => <>{slow}</>);
    const chunks: string[] = [];

    const renderPromise = ssrRenderSuspenseStream(
      <main>
        <Suspense
          fallback={<button id="ooos-fast-delay-fallback">Fast waiting</button>}
          delay={10_000}
        >
          <Slow />
        </Suspense>
      </main>,
      chunks
    );

    await vi.waitFor(() => expect(chunks.join('')).toContain('Fast waiting'));
    resolveSlow(<section id="ooos-fast-delay-content">Fast done</section>);
    const { document } = await renderPromise;

    const html = chunks.join('');
    expect(html).toContain('<div style="display:none"');
    expect(html).not.toContain('type="qwik/backpatch"');
    const fallbackHost = document.querySelector('#ooos-fast-delay-fallback')!
      .parentElement as HTMLElement;
    const contentHost = document.querySelector('#ooos-fast-delay-content')!
      .parentElement as HTMLElement;
    expect(fallbackHost.style.display).toBe('none');
    expect(contentHost.style.display).toBe('contents');
  });

  it('should not emit delayed fallback backpatch when delayed Suspense has no fallback', async () => {
    let resolveSlow!: (value: JSXOutput) => void;
    const slow = new Promise<JSXOutput>((resolve) => {
      resolveSlow = resolve;
    });
    const Slow = component$(() => <>{slow}</>);
    const chunks: string[] = [];

    const renderPromise = ssrRenderSuspenseStream(
      <main>
        <Suspense delay={10}>
          <Slow />
        </Suspense>
        <footer>Footer</footer>
      </main>,
      chunks
    );

    await vi.waitFor(() => expect(chunks.join('')).toContain('Footer'));
    await delay(40);
    expect(chunks.join('')).not.toContain('type="qwik/backpatch"');

    resolveSlow(<section id="ooos-no-fallback-delay-content">No fallback done</section>);
    const { document } = await renderPromise;

    const html = chunks.join('');
    expect(html).not.toContain('type="qwik/backpatch"');
    const contentHost = document.querySelector('#ooos-no-fallback-delay-content')!
      .parentElement as HTMLElement;
    expect(contentHost.style.display).toBe('contents');
  });

  it('should show a numeric zero fallback immediately during initial loading', async () => {
    let resolveSlow!: (value: JSXOutput) => void;
    const slow = new Promise<JSXOutput>((resolve) => {
      resolveSlow = resolve;
    });
    const Slow = component$(() => <>{slow}</>);
    const chunks: string[] = [];

    const renderPromise = ssrRenderSuspenseStream(
      <main>
        <Suspense fallback={0} delay={0}>
          <Slow />
        </Suspense>
      </main>,
      chunks
    );

    await vi.waitFor(() => expect(chunks.join('')).toContain('>0</div>'));
    expect(chunks.join('')).toContain('<div style="display:contents"');
    expect(chunks.join('')).not.toContain('type="qwik/backpatch"');

    resolveSlow(<section>Immediate done</section>);
    await renderPromise;
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
          <Suspense
            fallback={
              <button
                onClick$={() => {
                  // do nothing, workaround for the optimizer bug
                  globalThis;
                }}
              >
                Waiting
              </button>
            }
          >
            <Slow />
          </Suspense>
          <footer>Footer</footer>
        </main>
      );
    });
    const chunks: string[] = [];

    const renderPromise = ssrRenderSuspenseStream(
      <App />,
      {
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
      { resume: false }
    );

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

  it('should resume an early-finalized segment after delayed vnode data is emitted', async () => {
    let resolveSegment!: (value: JSXOutput) => void;
    let resolveRoot!: (value: JSXOutput) => void;
    const segment = new Promise<JSXOutput>((resolve) => {
      resolveSegment = resolve;
    });
    const root = new Promise<JSXOutput>((resolve) => {
      resolveRoot = resolve;
    });
    (globalThis as any).__ooosUnitEarlySegmentClicks = 0;

    const Slow = component$(() => (
      <>
        {segment}
        <button
          id="ooos-unit-early-segment-button"
          onClick$={() => {
            (globalThis as any).__ooosUnitEarlySegmentClicks += 1;
          }}
        >
          Touch early segment
        </button>
      </>
    ));
    const chunks: string[] = [];

    const renderPromise = ssrRenderSuspenseStream(
      <main>
        <Suspense fallback={<p>Waiting early segment</p>}>
          <Slow />
        </Suspense>
        {root}
      </main>,
      chunks
    );

    try {
      await vi.waitFor(() => expect(chunks.join('')).toContain('Waiting early segment'));
      resolveSegment(<span id="ooos-unit-early-segment-ready">Early ready</span>);
      await vi.waitFor(() => expect(chunks.join('')).toContain('qO(1)'));
      expect(chunks.join('')).not.toContain('type="qwik/vnode" q:r="1"');
      resolveRoot(<footer>Root ready</footer>);
      const { document, container } = await renderPromise;
      const html = chunks.join('');

      expect(html.indexOf('qO(1)')).toBeGreaterThan(-1);
      expect(html.indexOf('type="qwik/vnode" q:r="1"')).toBeGreaterThan(html.indexOf('qO(1)'));
      expect(document.querySelector('#ooos-unit-early-segment-ready')).not.toBeNull();

      await trigger(container.element, '#ooos-unit-early-segment-button', 'click');
      await waitForDrain(container);
      expect((globalThis as any).__ooosUnitEarlySegmentClicks).toBe(1);
    } finally {
      resolveSegment(<span id="ooos-unit-early-segment-ready">Early ready</span>);
      resolveRoot(<footer>Root ready</footer>);
      await renderPromise;
      delete (globalThis as any).__ooosUnitEarlySegmentClicks;
    }
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
    const renderPromise = ssrRenderSuspenseStream(<App />, chunks);

    try {
      await vi.waitFor(() => expect(chunks.join('')).toContain('Waiting forward refs'));
      resolveRootPromise('slow root promise');
      resolveSegment(<SegmentContent />);
      const { document, container } = await renderPromise;
      const { vNode } = await ssrRenderToDom(<App />, { debug });
      expect(vNode).toMatchVDOM(
        <Component>
          <main>
            <button id="ooos-unit-slow-forward-ref-button">Read slow forward ref</button>
            <Component ssr-required>
              <div style="display: none;">
                <p>Waiting forward refs</p>
              </div>
              {/* @ts-ignore-next-line */}
              <div q:rp="1" style="display: contents;">
                <Projection ssr-required>
                  <Component>
                    <Fragment ssr-required>
                      <Awaited>
                        <Component>
                          <Fragment ssr-required>
                            <Fragment ssr-required>
                              <button id="ooos-unit-fast-forward-ref-button">
                                Read fast forward ref
                              </button>
                            </Fragment>
                          </Fragment>
                        </Component>
                      </Awaited>
                    </Fragment>
                  </Component>
                </Projection>
              </div>
            </Component>
          </main>
        </Component>
      );

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

      await trigger(container.element, '#ooos-unit-slow-forward-ref-button', 'click');
      await waitForDrain(container);
      expect((globalThis as any).__ooosUnitSlowForwardRefValue).toBe('slow root promise');

      await trigger(container.element, '#ooos-unit-fast-forward-ref-button', 'click');
      await waitForDrain(container);
      expect((globalThis as any).__ooosUnitFastForwardRefValue).toBe('fast segment promise');
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

    const renderPromise = ssrRenderSuspenseStream(
      <main>
        <Suspense fallback={<p>First waiting</p>}>
          <First />
        </Suspense>
        <Suspense fallback={<p>Second waiting</p>}>
          <Second />
        </Suspense>
      </main>,
      chunks
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

    const renderPromise = ssrRenderSuspenseStream(
      <main>
        <Suspense
          fallback={
            <button
              onClick$={() => {
                // do nothing, workaround for the optimizer bug
                globalThis;
              }}
            >
              Fallback
            </button>
          }
        >
          <Slow />
        </Suspense>
      </main>,
      chunks
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

    const renderPromise = ssrRenderSuspenseStream(
      <main>
        <Boundary>
          <Slow />
        </Boundary>
      </main>,
      chunks
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

    const renderPromise = ssrRenderSuspenseStream(
      <main>
        <Boundary>
          <Slow />
        </Boundary>
      </main>,
      chunks
    );

    await vi.waitFor(() => expect(chunks.join('')).toContain('Waiting slot swap'));
    resolveSlow(<strong id="ooos-slot-resolved">Slotted swapped</strong>);
    const { document } = await renderPromise;

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

    const renderPromise = ssrRenderSuspenseStream(
      <main>
        <Boundary>
          <Slow />
        </Boundary>
      </main>,
      chunks
    );

    await vi.waitFor(() => expect(chunks.join('')).toContain('Waiting scoped slot'));
    resolveSlow(<StyledSlotContent />);
    const { document } = await renderPromise;

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
    expect(document.head.contains(styleElement)).toBe(true);
    delete (globalThis as any).__ooosScopedStyleId;
  });

  it('should let projected Slot QRLs capture root-owned state when resolved later', async () => {
    let resolveSlow!: (value: JSXOutput) => void;
    const slow = new Promise<JSXOutput>((resolve) => {
      resolveSlow = resolve;
    });
    (globalThis as any).__ooosUnitProjectedSlotValue = 0;

    const Boundary = component$(() => (
      <Suspense fallback={<p>Waiting projected QRL</p>}>
        <Slot />
      </Suspense>
    ));
    const App = component$(() => {
      const count = useSignal(0);
      return (
        <main>
          <span id="ooos-unit-projected-slot-count">{count.value}</span>
          <Boundary>
            {slow}
            <button
              id="ooos-unit-projected-slot-button"
              onClick$={() => {
                count.value += 1;
                (globalThis as any).__ooosUnitProjectedSlotValue = count.value;
              }}
            >
              Touch projected slot
            </button>
          </Boundary>
        </main>
      );
    });
    const chunks: string[] = [];

    const renderPromise = ssrRenderSuspenseStream(<App />, chunks);

    try {
      await vi.waitFor(() => expect(chunks.join('')).toContain('Waiting projected QRL'));
      resolveSlow(<span id="ooos-unit-projected-slot-ready">Projected ready</span>);
      const { document, container } = await renderPromise;
      expect(chunks.join('')).toContain('type="qwik/vnode" q:patch');

      await trigger(container.element, '#ooos-unit-projected-slot-button', 'click');
      await waitForDrain(container);
      expect((globalThis as any).__ooosUnitProjectedSlotValue).toBe(1);
      expect(document.querySelector('#ooos-unit-projected-slot-count')?.textContent).toBe('1');
    } finally {
      resolveSlow(<span id="ooos-unit-projected-slot-ready">Projected ready</span>);
      await renderPromise;
      delete (globalThis as any).__ooosUnitProjectedSlotValue;
    }
  });

  it('should process vnode patches on resume when qO already swapped content', async () => {
    let resolveSlow!: (value: JSXOutput) => void;
    const slow = new Promise<JSXOutput>((resolve) => {
      resolveSlow = resolve;
    });
    (globalThis as any).__ooosUnitResumeAfterQOValue = 0;

    const Boundary = component$(() => (
      <Suspense fallback={<p>Waiting resume after qO</p>}>
        <Slot />
      </Suspense>
    ));
    const App = component$(() => {
      const count = useSignal(0);
      return (
        <main>
          <span id="ooos-unit-resume-after-qo-count">{count.value}</span>
          <Boundary>
            {slow}
            <button
              id="ooos-unit-resume-after-qo-button"
              onClick$={() => {
                count.value += 1;
                (globalThis as any).__ooosUnitResumeAfterQOValue = count.value;
              }}
            >
              Touch resume after qO
            </button>
          </Boundary>
        </main>
      );
    });
    const chunks: string[] = [];

    const renderPromise = ssrRenderSuspenseStream(<App />, chunks, { resume: false });

    try {
      await vi.waitFor(() => expect(chunks.join('')).toContain('Waiting resume after qO'));
      resolveSlow(<span id="ooos-unit-resume-after-qo-ready">Resume after qO ready</span>);
      const { document } = await renderPromise;

      expect(chunks.join('')).toContain('type="qwik/vnode" q:patch');
      emulateExecutionOfQwikFuncs(document);
      executeOutOfOrderScriptsWithoutVNodeProcessing(document);
      emulateExecutionOfBackpatch(document);
      expect(document.querySelector('#ooos-unit-resume-after-qo-ready')).not.toBeNull();

      const container = getDomContainer(document.querySelector('[q\\:container]')!);
      await trigger(container.element, '#ooos-unit-resume-after-qo-button', 'click');
      await waitForDrain(container);
      expect((globalThis as any).__ooosUnitResumeAfterQOValue).toBe(1);
      expect(document.querySelector('#ooos-unit-resume-after-qo-count')?.textContent).toBe('1');
    } finally {
      resolveSlow(<span id="ooos-unit-resume-after-qo-ready">Resume after qO ready</span>);
      await renderPromise;
      delete (globalThis as any).__ooosUnitResumeAfterQOValue;
    }
  });

  it('should keep hoisted loop event params on their own buttons in resolved segments', async () => {
    (globalThis as any).__ooosUnitLoopNavValue = 0;
    (globalThis as any).__ooosUnitLoopItemValue = '';
    (globalThis as any).__ooosUnitLoopRequests = [];
    (globalThis as any).__ooosUnitLoopResolvers = [];

    type Story = { id: string; label: string };
    const storiesForPage = (page: number): Story[] =>
      Array.from({ length: 30 }, (_, index) => ({
        id: `${page}-${index}`,
        label: `Story ${page}-${index}`,
      }));
    const resolveNextPage = async (page: number) => {
      await vi.waitFor(() =>
        expect((globalThis as any).__ooosUnitLoopResolvers.length).toBeGreaterThan(0)
      );
      const resolve = (globalThis as any).__ooosUnitLoopResolvers.shift() as (
        value: Story[]
      ) => void;
      resolve(storiesForPage(page));
    };

    const Stories = component$(
      ({ stories, 'bind:page': page }: { stories?: Story[]; 'bind:page': { value: number } }) => (
        <>
          <button
            id="ooos-unit-loop-next"
            onClick$={() => {
              page.value += 1;
              (globalThis as any).__ooosUnitLoopNavValue = page.value;
            }}
          >
            Next
          </button>
          <ul>
            {stories?.map((story) => (
              <button
                id={`ooos-unit-loop-item-${story.id}`}
                onClick$={() => {
                  (globalThis as any).__ooosUnitLoopItemValue = story.id;
                }}
              >
                {story.label}
              </button>
            ))}
          </ul>
        </>
      )
    );
    const App = component$(() => {
      const page = useSignal(0);
      const stories = useAsync$<Story[]>(async ({ track }) => {
        const pageNum = track(page);
        (globalThis as any).__ooosUnitLoopRequests.push(pageNum);
        return new Promise<Story[]>((resolve) => {
          (globalThis as any).__ooosUnitLoopResolvers.push(resolve);
        });
      });
      return (
        <main>
          <span id="ooos-unit-loop-page">{page.value}</span>
          <Suspense fallback={<p>Waiting loop params</p>}>
            <Stories stories={stories.value} bind:page={page} />
          </Suspense>
        </main>
      );
    });
    const chunks: string[] = [];

    const renderPromise = ssrRenderSuspenseStream(<App />, chunks, { debug });

    try {
      await vi.waitFor(() => expect(chunks.join('')).toContain('Waiting loop params'));
      await resolveNextPage(0);
      const { document, container } = await renderPromise;

      expect(chunks.join('')).toContain('type="qwik/vnode" q:patch');
      const segmentStateScript = document.querySelector('script[type="qwik/state"][q\\:patch]');
      const [rootStart, segmentRoots] = JSON.parse(segmentStateScript!.textContent!) as [
        number,
        unknown[],
      ];
      for (let i = 0; i < segmentRoots.length; i += 2) {
        expect([segmentRoots[i], segmentRoots[i + 1]]).not.toEqual([
          TypeIds.RootRef,
          rootStart + i / 2,
        ]);
      }

      await trigger(container.element, '#ooos-unit-loop-item-0-1', 'click');
      await waitForDrain(container);
      expect((globalThis as any).__ooosUnitLoopItemValue).toBe('0-1');

      await trigger(container.element, '#ooos-unit-loop-next', 'click');
      await waitForDrain(container);
      expect((globalThis as any).__ooosUnitLoopNavValue).toBe(1);
      await vi.waitFor(() => expect((globalThis as any).__ooosUnitLoopRequests).toEqual([0, 1]));
      expect(document.querySelector('#ooos-unit-loop-page')?.textContent).toBe('1');
    } finally {
      const resolvers = (globalThis as any).__ooosUnitLoopResolvers;
      for (let i = 0; i < resolvers.length; i++) {
        resolvers[i](storiesForPage(-1));
      }
      await renderPromise;
      delete (globalThis as any).__ooosUnitLoopNavValue;
      delete (globalThis as any).__ooosUnitLoopItemValue;
      delete (globalThis as any).__ooosUnitLoopRequests;
      delete (globalThis as any).__ooosUnitLoopResolvers;
    }
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

    const renderPromise = ssrRenderSuspenseStream(<App />, chunks);

    try {
      await vi.waitFor(() => expect(chunks.join('')).toContain('Waiting shared'));
      resolveSlow(<span id="ooos-unit-shared-ready">Ready shared</span>);
      const { document, container } = await renderPromise;

      const segmentStateScript = document.querySelector('script[type="qwik/state"][q\\:patch]');
      expect(segmentStateScript).not.toBeNull();
      expect(segmentStateScript?.hasAttribute('q:s')).toBe(false);
      expect(segmentStateScript?.getAttribute('q:r')).toBe('1');
      expect(segmentStateScript?.hasAttribute('q:fx')).toBe(false);
      expect(document.querySelector('#ooos-unit-shared-resolved-button')).not.toBeNull();

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

    const renderPromise = ssrRenderSuspenseStream(<App />, chunks);

    try {
      await vi.waitFor(() => expect(chunks.join('')).toContain('Waiting store'));
      resolveSlow(<span id="ooos-unit-store-ready">Ready store</span>);
      const { document, container } = await renderPromise;

      const segmentStateScript = document.querySelector('script[type="qwik/state"][q\\:patch]');
      expect(segmentStateScript?.getAttribute('q:r')).toBe('1');
      expect(segmentStateScript?.hasAttribute('q:fx')).toBe(false);
      expect(JSON.parse(segmentStateScript!.textContent!)[3]).toBeDefined();
      expect(segmentStateScript?.hasAttribute('q:s')).toBe(false);
      expect(document.querySelector('#ooos-unit-store-resolved-button')).not.toBeNull();

      await trigger(container.element, '#ooos-unit-store-shell-button', 'click');
      await waitForDrain(container);
      expect((globalThis as any).__ooosUnitStoreShellValue).toBe(1);
      expect(document.querySelector('#ooos-unit-store-shell-count')?.textContent).toBe('1');
      expect(document.querySelector('#ooos-unit-store-resolved-count')?.textContent).toBe('1');
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

    const renderPromise = ssrRenderSuspenseStream(<App />, chunks);

    try {
      await vi.waitFor(() => expect(chunks.join('')).toContain('Waiting first shared store'));
      await vi.waitFor(() => expect(chunks.join('')).toContain('Waiting second shared store'));
      resolveFirst(<span id="ooos-unit-shared-store-first-ready">First ready</span>);
      resolveSecond(<span id="ooos-unit-shared-store-second-ready">Second ready</span>);
      const { document, container } = await renderPromise;

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

      await trigger(container.element, '#ooos-unit-shared-store-first-button', 'click');
      await waitForDrain(container);
      expect((globalThis as any).__ooosUnitSharedStoreFirstValue).toBe(1);
      expect(document.querySelector('#ooos-unit-shared-store-shell-count')?.textContent).toBe('1');
      expect(document.querySelector('#ooos-unit-shared-store-first-count')?.textContent).toBe('1');
      expect(document.querySelector('#ooos-unit-shared-store-second-count')?.textContent).toBe('1');
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

    const renderPromise = ssrRenderSuspenseStream(<App />, chunks);

    try {
      await vi.waitFor(() => expect(chunks.join('')).toContain('Waiting first cross store'));
      await vi.waitFor(() => expect(chunks.join('')).toContain('Waiting second cross store'));
      resolveFirst(<span id="ooos-unit-cross-store-first-ready">First ready</span>);
      resolveSecond(<span id="ooos-unit-cross-store-second-ready">Second ready</span>);
      const { document, container } = await renderPromise;

      const segmentStateScripts = document.querySelectorAll('script[type="qwik/state"][q\\:patch]');
      expect(segmentStateScripts.length).toBeGreaterThan(0);
      for (let i = 0; i < segmentStateScripts.length; i++) {
        const script = segmentStateScripts[i];
        expect(script.hasAttribute('q:s')).toBe(false);
      }
      expect(document.querySelector('#ooos-unit-cross-store-first-button')).not.toBeNull();
      expect(document.querySelector('#ooos-unit-cross-store-second-count')).not.toBeNull();

      expect(document.querySelector('#ooos-unit-cross-store-first-count')?.textContent).toBe('0');
      expect(document.querySelector('#ooos-unit-cross-store-second-count')?.textContent).toBe('0');

      await trigger(container.element, '#ooos-unit-cross-store-first-button', 'click');
      await waitForDrain(container);
      expect((globalThis as any).__ooosUnitCrossStoreFirstValue).toBe(1);
      expect(document.querySelector('#ooos-unit-cross-store-first-count')?.textContent).toBe('1');
      expect(document.querySelector('#ooos-unit-cross-store-second-count')?.textContent).toBe('1');
    } finally {
      delete (globalThis as any).__ooosUnitCrossStoreFirstValue;
    }
  });

  it('should share a signal used only by multiple resolved segments', async () => {
    let resolveFirst!: (value: JSXOutput) => void;
    let resolveSecond!: (value: JSXOutput) => void;
    const first = new Promise<JSXOutput>((resolve) => {
      resolveFirst = resolve;
    });
    const second = new Promise<JSXOutput>((resolve) => {
      resolveSecond = resolve;
    });
    (globalThis as any).__ooosUnitCrossSignalSecondValue = 0;

    const First = component$((props: { count: { value: number } }) => (
      <>
        {first}
        <span id="ooos-unit-cross-signal-first-count">{props.count.value}</span>
      </>
    ));
    const Second = component$((props: { count: { value: number } }) => (
      <>
        {second}
        <button
          id="ooos-unit-cross-signal-second-button"
          onClick$={() => {
            props.count.value += 1;
            (globalThis as any).__ooosUnitCrossSignalSecondValue = props.count.value;
          }}
        >
          Touch second cross signal
        </button>
      </>
    ));
    const App = component$(() => {
      const count = useSignal(0);
      return (
        <main>
          <h1>Shell does not read the cross signal</h1>
          <Suspense fallback={<p>Waiting first cross signal</p>}>
            <First count={count} />
          </Suspense>
          <Suspense fallback={<p>Waiting second cross signal</p>}>
            <Second count={count} />
          </Suspense>
        </main>
      );
    });
    const chunks: string[] = [];

    const renderPromise = ssrRenderSuspenseStream(<App />, chunks);

    try {
      await vi.waitFor(() => expect(chunks.join('')).toContain('Waiting first cross signal'));
      await vi.waitFor(() => expect(chunks.join('')).toContain('Waiting second cross signal'));
      resolveFirst(<span id="ooos-unit-cross-signal-first-ready">First ready</span>);
      await vi.waitFor(() => expect(chunks.join('')).toContain('First ready'));
      expect(chunks.join('')).not.toContain('Second ready');
      resolveSecond(<span id="ooos-unit-cross-signal-second-ready">Second ready</span>);
      const { document, container } = await renderPromise;

      expect(
        document.querySelector('script[type="qwik/vnode"][q\\:patch][q\\:r="1"]')
      ).not.toBeNull();
      expect(
        document.querySelector('script[type="qwik/state"][q\\:patch][q\\:r="2"]')
      ).not.toBeNull();
      expect(document.querySelector('#ooos-unit-cross-signal-first-count')?.textContent).toBe('0');
      expect(document.querySelector('#ooos-unit-cross-signal-second-button')).not.toBeNull();

      await trigger(container.element, '#ooos-unit-cross-signal-second-button', 'click');
      await waitForDrain(container);
      expect((globalThis as any).__ooosUnitCrossSignalSecondValue).toBe(1);
      await vi.waitFor(() =>
        expect(document.querySelector('#ooos-unit-cross-signal-first-count')?.textContent).toBe('1')
      );
    } finally {
      delete (globalThis as any).__ooosUnitCrossSignalSecondValue;
    }
  });

  it('should coordinate out-of-order segments inside reverse Reveal', async () => {
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

    const renderPromise = ssrRenderSuspenseStream(
      <main>
        <Reveal order="reverse">
          <Suspense fallback={<p>First reverse fallback</p>}>
            <First />
          </Suspense>
          <Suspense fallback={<p>Second reverse fallback</p>}>
            <Second />
          </Suspense>
        </Reveal>
      </main>,
      chunks
    );

    await vi.waitFor(() => expect(chunks.join('')).toContain('First reverse fallback'));
    await vi.waitFor(() => expect(chunks.join('')).toContain('Second reverse fallback'));

    resolveFirst(<p>First reverse done</p>);
    await delay(40);
    const firstReadyHtml = chunks.join('');
    expect(firstReadyHtml).toContain('qO(1)');
    expect(firstReadyHtml).toContain('qO.g(1,2,"r")');
    const firstReadyDocument = runOutOfOrderScripts(firstReadyHtml);
    expect(getParagraphHost(firstReadyDocument, 'First reverse done').style.display).toBe('none');

    resolveSecond(<p>Second reverse done</p>);
    const { document } = await renderPromise;

    expect(getParagraphHost(document, 'First reverse done').style.display).toBe('contents');
    expect(getParagraphHost(document, 'Second reverse done').style.display).toBe('contents');
    expect(getParagraphHost(document, 'First reverse fallback').style.display).toBe('none');
    expect(getParagraphHost(document, 'Second reverse fallback').style.display).toBe('none');
  });

  it('should coordinate out-of-order segments inside together Reveal', async () => {
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

    const renderPromise = ssrRenderSuspenseStream(
      <main>
        <Reveal order="together">
          <Suspense fallback={<p>First together fallback</p>}>
            <First />
          </Suspense>
          <Suspense fallback={<p>Second together fallback</p>}>
            <Second />
          </Suspense>
        </Reveal>
      </main>,
      chunks
    );

    await vi.waitFor(() => expect(chunks.join('')).toContain('First together fallback'));
    await vi.waitFor(() => expect(chunks.join('')).toContain('Second together fallback'));

    resolveFirst(<p>First together done</p>);
    await delay(40);
    const firstReadyHtml = chunks.join('');
    expect(firstReadyHtml).toContain('qO(1)');
    expect(firstReadyHtml).toContain('qO.g(1,2,"t")');
    const firstReadyDocument = runOutOfOrderScripts(firstReadyHtml);
    expect(getParagraphHost(firstReadyDocument, 'First together done').style.display).toBe('none');

    resolveSecond(<p>Second together done</p>);
    const { document } = await renderPromise;

    expect(getParagraphHost(document, 'First together done').style.display).toBe('contents');
    expect(getParagraphHost(document, 'Second together done').style.display).toBe('contents');
    expect(getParagraphHost(document, 'First together fallback').style.display).toBe('none');
    expect(getParagraphHost(document, 'Second together fallback').style.display).toBe('none');
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

    const renderPromise = ssrRenderSuspenseStream(
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
      chunks
    );

    await vi.waitFor(() => expect(chunks.join('')).toContain('First fallback'));
    await vi.waitFor(() => expect(chunks.join('')).toContain('Footer'));
    const shellDocument = createDocument({ html: chunks.join('') });
    const shellFallbackHosts = ['First fallback', 'Second fallback'].map((text) =>
      getParagraphHost(shellDocument, text)
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

    const secondReadyDocument = runOutOfOrderScripts(secondReadyHtml);
    expect(secondReadyDocument.querySelector('main')!.textContent).toContain('First fallback');
    expect(getParagraphHost(secondReadyDocument, 'Second done').style.display).toBe('none');
    expect(getParagraphHost(secondReadyDocument, 'Second fallback').style.display).toBe('none');

    resolveFirst(<p>First done</p>);
    const { document } = await renderPromise;

    const html = chunks.join('');
    expect(html).toContain('qO(1)');
    expect(html).toContain('qO(2)');
    const text = document.querySelector('main')!.textContent!;
    expect(text).toContain('First done');
    expect(text).toContain('Second done');
    expect(getParagraphHost(document, 'First fallback').style.display).toBe('none');
    expect(getParagraphHost(document, 'Second fallback').style.display).toBe('none');
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

    const renderPromise = ssrRenderSuspenseStream(<App />, chunks);

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

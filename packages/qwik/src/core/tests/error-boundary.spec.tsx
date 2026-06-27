import {
  $,
  component$,
  createAsync$,
  ErrorBoundary,
  render,
  setPlatform,
  Slot,
  Suspense,
  useSignal,
  useTask$,
  useVisibleTask$,
  type JSXOutput,
} from '@qwik.dev/core';
import { _getDomContainer } from '@qwik.dev/core/internal';
import {
  createDocument,
  domRender,
  getTestPlatform,
  ssrRenderToDom,
  trigger,
  waitForDrain,
} from '@qwik.dev/core/testing';
import { describe, expect, it } from 'vitest';
import { processOutOfOrderSegmentVNodeData } from '../client/process-vnode-data';
import { rerenderComponent } from '../../testing/rendering.unit-util';
import { delay } from '../shared/utils/promises';
import {
  markBoundaryErrored,
  toSerializableBoundaryError,
  type ErrorBoundaryStore,
} from '../shared/error/error-handling';

const debug = false;

const Thrower = component$(() => {
  throw new Error('boom');
});

const AsyncThrower = component$(() => {
  const pending = new Promise<JSXOutput>((_resolve, reject) => reject(new Error('async boom')));
  return <>{pending}</>;
});

const AsyncRejector = component$(
  () => new Promise<JSXOutput>((_resolve, reject) => reject(new Error('async boom'))) as any
);

const FallbackBoomer = component$(() => {
  throw new Error('fallback boom');
});

const AsyncSignalThrower = component$(() => {
  const sig = createAsync$(() => Promise.reject(new Error('async signal boom')));
  return <>{sig}</>;
});

const ThrowerA = component$(() => {
  throw new Error('boomA');
});
const ThrowerB = component$(() => {
  throw new Error('boomB');
});

// Must be module-scoped: it's captured by a `component$` QRL.
class NonSerializableError {
  message = 'non-serializable boom';
  toJSON() {
    return this.message;
  }
}

const streamAndResume = async (jsx: JSXOutput) => {
  const chunks: string[] = [];
  await ssrRenderToDom(jsx, {
    stream: {
      write: (c: string) => {
        chunks.push(c);
      },
    },
    streaming: { inOrder: { strategy: 'disabled' }, outOfOrder: true },
    debug,
  });
  const html = chunks.join('');
  const document = createDocument({ html });
  (document as any).qProcessOOOS = (boundaryId: number, content: Element | null) =>
    processOutOfOrderSegmentVNodeData(document, String(boundaryId), content);
  const scripts = Array.from(
    document.querySelectorAll('script[type="text/javascript"]'),
    (s) => s.textContent || ''
  ).filter(
    (code) =>
      code.includes('qO') ||
      code.includes('qInstallOOOS') ||
      code.includes('qErr') ||
      code.includes('qInstallErrorSwap')
  );
  // eslint-disable-next-line no-new-func
  new Function('document', scripts.join('\n'))(document);
  return { html, document };
};

const displayOf = (el: Element | null | undefined) =>
  (el as HTMLElement | null | undefined)?.style?.display;

const dispatchQError = (
  target: Element,
  detail: { error: unknown; element?: Element; importError?: string }
) => {
  const ev = target.ownerDocument.createEvent('Event');
  ev.initEvent('qerror', false, false);
  (ev as any).detail = detail;
  target.ownerDocument.dispatchEvent(ev);
};

const fbCount = (root: any) => root.querySelectorAll('#fb').length;

// ===== I. Core behaviour: catch a throw, show the fallback =====
describe('ErrorBoundary', () => {
  it('projects children when there is no error', async () => {
    const { container } = await domRender(
      <ErrorBoundary
        fallback$={$((e: any) => (
          <p id="fb">caught: {e.message}</p>
        ))}
      >
        <div id="content">All good</div>
      </ErrorBoundary>,
      { debug }
    );
    expect(container.element.querySelector('#content')).toBeTruthy();
    expect(container.element.querySelector('#fb')).toBeFalsy();
  });

  it('SSR: shows the fallback and swaps the content out when a child throws during render', async () => {
    const { container } = await ssrRenderToDom(
      <ErrorBoundary
        fallback$={$((e: any) => (
          <p id="fb">caught: {e.message}</p>
        ))}
      >
        <div id="content">content</div>
        <Thrower />
      </ErrorBoundary>,
      { debug, streaming: { outOfOrder: false } }
    );
    const el = container.element;
    expect(el.querySelector('#fb')?.textContent).toContain('caught: boom');
    const contentHost = el.querySelector('[q\\:ebc]') as HTMLElement;
    expect(contentHost.style.display).toBe('none');
    expect(contentHost.contains(el.querySelector('#content'))).toBe(true);
  });

  it('client: a render throw is caught by the NEAREST boundary', async () => {
    const { container } = await domRender(
      <ErrorBoundary
        fallback$={$(() => (
          <p id="fb-outer">outer</p>
        ))}
      >
        <div id="content">ok</div>
        <ErrorBoundary
          fallback$={$(() => (
            <p id="fb-inner">inner</p>
          ))}
        >
          <Thrower />
        </ErrorBoundary>
      </ErrorBoundary>,
      { debug }
    );
    const el = container.element;
    expect(el.querySelector('#fb-inner')).toBeTruthy();
    expect(el.querySelector('#fb-outer')).toBeFalsy();
    expect(el.querySelector('#content')).toBeTruthy();
  });

  it('client: an async qerror is routed to the NEAREST boundary', async () => {
    const { container } = await domRender(
      <ErrorBoundary
        fallback$={$(() => (
          <p id="fb-outer">outer</p>
        ))}
      >
        <ErrorBoundary
          fallback$={$(() => (
            <p id="fb-inner">inner</p>
          ))}
        >
          <button id="target">x</button>
        </ErrorBoundary>
      </ErrorBoundary>,
      { debug }
    );
    const el = container.element;
    const target = el.querySelector('#target')!;
    const ev = el.ownerDocument.createEvent('Event');
    ev.initEvent('qerror', false, false);
    (ev as any).detail = { error: new Error('async boom'), element: target };
    el.ownerDocument.dispatchEvent(ev);
    await waitForDrain(container);

    expect(el.querySelector('#fb-inner')).toBeTruthy();
    expect(el.querySelector('#fb-outer')).toBeFalsy();
  });

  it('client: a throwing fallback does not infinite-loop handleError', async () => {
    const { container } = await domRender(
      <ErrorBoundary
        fallback$={$(() => {
          throw new Error('fallback boom');
        })}
      >
        <button id="target">x</button>
      </ErrorBoundary>,
      { debug }
    );
    const el = container.element;
    const target = el.querySelector('#target')!;
    const ev = el.ownerDocument.createEvent('Event');
    ev.initEvent('qerror', false, false);
    (ev as any).detail = { error: new Error('client boom'), element: target };
    el.ownerDocument.dispatchEvent(ev);
    try {
      await waitForDrain(container);
    } catch {
      /* expected */
    }
    expect(el.querySelector('#fb')).toBeFalsy();
  });
});

// ===== II. Routing & scope: which boundary catches =====
describe('ErrorBoundary combinations', () => {
  describe('CSR', () => {
    it('two throwing children in one boundary render a single fallback (first error wins)', async () => {
      const { container } = await domRender(
        <ErrorBoundary
          fallback$={$((e: any) => (
            <p id="fb">caught: {e.message}</p>
          ))}
        >
          <ThrowerA />
          <ThrowerB />
        </ErrorBoundary>,
        { debug }
      );
      expect(fbCount(container.element)).toBe(1);
      expect(container.element.querySelector('#fb')?.textContent).toContain('caught: boomA');
    });

    it('two adjacent boundaries that both throw each show their own fallback', async () => {
      const { container } = await domRender(
        <main>
          <ErrorBoundary
            fallback$={$(() => (
              <p id="fb-a">A</p>
            ))}
          >
            <ThrowerA />
          </ErrorBoundary>
          <ErrorBoundary
            fallback$={$(() => (
              <p id="fb-b">B</p>
            ))}
          >
            <ThrowerB />
          </ErrorBoundary>
        </main>,
        { debug }
      );
      expect(container.element.querySelector('#fb-a')).toBeTruthy();
      expect(container.element.querySelector('#fb-b')).toBeTruthy();
    });

    it('nested boundaries: when the outer also throws it supersedes the inner fallback', async () => {
      const { container } = await domRender(
        <ErrorBoundary
          fallback$={$(() => (
            <p id="fb-outer">outer</p>
          ))}
        >
          <ErrorBoundary
            fallback$={$(() => (
              <p id="fb-inner">inner</p>
            ))}
          >
            <ThrowerA />
          </ErrorBoundary>
          <ThrowerB />
        </ErrorBoundary>,
        { debug }
      );
      expect(container.element.querySelector('#fb-outer')).toBeTruthy();
      expect(container.element.querySelector('#fb-inner')).toBeFalsy();
    });

    it('a throwing inner fallback escalates to the outer boundary', async () => {
      const { container } = await domRender(
        <ErrorBoundary
          fallback$={$(() => (
            <p id="fb-outer">outer</p>
          ))}
        >
          <ErrorBoundary
            fallback$={$(() => {
              throw new Error('inner fallback boom');
            })}
          >
            <Thrower />
          </ErrorBoundary>
        </ErrorBoundary>,
        { debug }
      );
      await waitForDrain(container).catch(() => {});
      expect(container.element.querySelector('#fb-outer')?.textContent).toBe('outer');
      expect(container.element.querySelector('#fb-inner')).toBeFalsy();
    });
  });

  describe('in-order SSR', () => {
    it('two throwing children in one boundary render a single fallback', async () => {
      const { container } = await ssrRenderToDom(
        <ErrorBoundary
          fallback$={$((e: any) => (
            <p id="fb">caught: {e.message}</p>
          ))}
        >
          <ThrowerA />
          <ThrowerB />
        </ErrorBoundary>,
        { debug }
      );
      expect(fbCount(container.element)).toBe(1);
    });

    it('two adjacent boundaries that both throw each show their own fallback', async () => {
      const { container } = await ssrRenderToDom(
        <main>
          <ErrorBoundary
            fallback$={$(() => (
              <p id="fb-a">A</p>
            ))}
          >
            <ThrowerA />
          </ErrorBoundary>
          <ErrorBoundary
            fallback$={$(() => (
              <p id="fb-b">B</p>
            ))}
          >
            <ThrowerB />
          </ErrorBoundary>
        </main>,
        { debug }
      );
      expect(container.element.querySelector('#fb-a')).toBeTruthy();
      expect(container.element.querySelector('#fb-b')).toBeTruthy();
    });
  });

  describe('out-of-order streaming', () => {
    it('two adjacent boundaries that both throw each swap in their own fallback', async () => {
      const { document } = await streamAndResume(
        <main>
          <ErrorBoundary
            fallback$={$(() => (
              <p id="fb-a">A</p>
            ))}
          >
            <ThrowerA />
          </ErrorBoundary>
          <ErrorBoundary
            fallback$={$(() => (
              <p id="fb-b">B</p>
            ))}
          >
            <ThrowerB />
          </ErrorBoundary>
        </main>
      );
      expect(document.querySelector('#fb-a')).toBeTruthy();
      expect(document.querySelector('#fb-b')).toBeTruthy();
    });

    it('two boundaries inside one Suspense each show their own fallback', async () => {
      const { document } = await streamAndResume(
        <main>
          <Suspense fallback={<span id="skel">loading</span>}>
            <ErrorBoundary
              fallback$={$(() => (
                <p id="fb-a">A</p>
              ))}
            >
              <ThrowerA />
            </ErrorBoundary>
            <ErrorBoundary
              fallback$={$(() => (
                <p id="fb-b">B</p>
              ))}
            >
              <ThrowerB />
            </ErrorBoundary>
          </Suspense>
        </main>
      );
      expect(document.querySelector('#fb-a')).toBeTruthy();
      expect(document.querySelector('#fb-b')).toBeTruthy();
    });
  });
});

describe('ErrorBoundary projection', () => {
  const Boxed = component$(() => {
    return (
      <ErrorBoundary
        fallback$={$((e: any) => (
          <p id="fb">caught: {e.message}</p>
        ))}
      >
        <Slot />
      </ErrorBoundary>
    );
  });

  const BoxedWithSibling = component$(() => {
    return (
      <ErrorBoundary
        fallback$={$((e: any) => (
          <p id="fb">caught: {e.message}</p>
        ))}
      >
        <div id="sibling">sibling</div>
        <Slot />
      </ErrorBoundary>
    );
  });

  describe('CSR', () => {
    it('a render throw in projected content is caught by the boundary it is projected into', async () => {
      const { container } = await domRender(
        <Boxed>
          <Thrower />
        </Boxed>,
        { debug }
      );
      const el = container.element;
      expect(el.querySelector('#fb')?.textContent).toContain('caught: boom');
    });

    it('only the fallback shows: a non-throwing sibling and the projected throw are both gone', async () => {
      const { container } = await domRender(
        <BoxedWithSibling>
          <Thrower />
          <div id="projected-ok">projected ok</div>
        </BoxedWithSibling>,
        { debug }
      );
      const el = container.element;
      expect(el.querySelector('#fb')?.textContent).toContain('caught: boom');
      expect(el.querySelector('#sibling')).toBeFalsy();
      expect(el.querySelector('#projected-ok')).toBeFalsy();
    });
  });

  describe('in-order SSR', () => {
    it('a render throw in projected content is caught by the boundary it is projected into', async () => {
      const { container } = await ssrRenderToDom(
        <Boxed>
          <Thrower />
        </Boxed>,
        { debug }
      );
      const el = container.element;
      expect(el.querySelector('#fb')?.textContent).toContain('caught: boom');
    });

    it('swaps the partial content out (hidden) and shows the fallback instead', async () => {
      const { container } = await ssrRenderToDom(
        <BoxedWithSibling>
          <Thrower />
          <div id="projected-ok">projected ok</div>
        </BoxedWithSibling>,
        { debug, streaming: { outOfOrder: false } }
      );
      const el = container.element;
      expect(el.querySelector('#fb')?.textContent).toContain('caught: boom');
      const sibling = el.querySelector('#sibling');
      expect(sibling).toBeTruthy();
      const contentHost = el.querySelector('[q\\:ebc]') as HTMLElement;
      expect(contentHost.style.display).toBe('none');
      expect(contentHost.contains(sibling)).toBe(true);
    });
  });
});

describe('ErrorBoundary across multiple containers on one document', () => {
  const renderTwoContainers = async (jsxA: any, jsxB: any) => {
    setPlatform(getTestPlatform());
    const document = createDocument();
    const hostA = document.createElement('div');
    const hostB = document.createElement('div');
    document.body.appendChild(hostA);
    document.body.appendChild(hostB);
    await render(hostA, jsxA);
    await render(hostB, jsxB);
    const containerA = _getDomContainer(hostA);
    const containerB = _getDomContainer(hostB);
    return { document, hostA, hostB, containerA, containerB };
  };

  it('routes a qerror from container A only to A, leaving B untouched', async () => {
    const { hostA, hostB, containerA } = await renderTwoContainers(
      <ErrorBoundary
        fallback$={$((e: any) => (
          <p id="fb-a">caught A: {e.message}</p>
        ))}
      >
        <button id="target-a">a</button>
      </ErrorBoundary>,
      <ErrorBoundary
        fallback$={$((e: any) => (
          <p id="fb-b">caught B: {e.message}</p>
        ))}
      >
        <button id="target-b">b</button>
      </ErrorBoundary>
    );

    expect(hostA.querySelector('#fb-a')).toBeFalsy();
    expect(hostB.querySelector('#fb-b')).toBeFalsy();
    expect(hostA.querySelector('#target-a')).toBeTruthy();
    expect(hostB.querySelector('#target-b')).toBeTruthy();

    const targetA = hostA.querySelector('#target-a')!;
    dispatchQError(targetA, { error: new Error('boom from A'), element: targetA });
    await waitForDrain(containerA);

    expect(hostA.querySelector('#fb-a')?.textContent).toContain('caught A: boom from A');
    expect(hostB.querySelector('#fb-b')).toBeFalsy();
    expect(hostB.querySelector('#target-b')).toBeTruthy();
  });

  it('routes a qerror from container B only to B, leaving A untouched', async () => {
    const { hostA, hostB, containerB } = await renderTwoContainers(
      <ErrorBoundary
        fallback$={$((e: any) => (
          <p id="fb-a">caught A: {e.message}</p>
        ))}
      >
        <button id="target-a">a</button>
      </ErrorBoundary>,
      <ErrorBoundary
        fallback$={$((e: any) => (
          <p id="fb-b">caught B: {e.message}</p>
        ))}
      >
        <button id="target-b">b</button>
      </ErrorBoundary>
    );

    const targetB = hostB.querySelector('#target-b')!;
    dispatchQError(targetB, { error: new Error('boom from B'), element: targetB });
    await waitForDrain(containerB);

    expect(hostB.querySelector('#fb-b')?.textContent).toContain('caught B: boom from B');
    expect(hostA.querySelector('#fb-a')).toBeFalsy();
    expect(hostA.querySelector('#target-a')).toBeTruthy();
  });
});

// ===== III. Error sources: what a boundary catches (and what it must not) =====
describe('ErrorBoundary catches task throws', () => {
  describe('CSR (domRender)', () => {
    it('a useTask$ throw is caught by the nearest <ErrorBoundary>', async () => {
      const ThrowingTask = component$(() => {
        useTask$(() => {
          throw new Error('task boom');
        });
        return <span id="content">ok</span>;
      });

      const { container } = await domRender(
        <ErrorBoundary
          fallback$={$((e: any) => (
            <p id="fb">caught: {e.message}</p>
          ))}
        >
          <ThrowingTask />
        </ErrorBoundary>,
        { debug }
      );
      await waitForDrain(container);

      const el = container.element;
      expect(el.querySelector('#fb')?.textContent).toContain('caught: task boom');
      expect(el.querySelector('#content')).toBeFalsy();
    });

    it('an async useTask$ throw is caught by the nearest <ErrorBoundary>', async () => {
      const ThrowingTask = component$(() => {
        useTask$(async () => {
          await delay(1);
          throw new Error('async task boom');
        });
        return <span id="content">ok</span>;
      });

      const { container } = await domRender(
        <ErrorBoundary
          fallback$={$((e: any) => (
            <p id="fb">caught: {e.message}</p>
          ))}
        >
          <ThrowingTask />
        </ErrorBoundary>,
        { debug }
      );
      await waitForDrain(container);

      const el = container.element;
      expect(el.querySelector('#fb')?.textContent).toContain('caught: async task boom');
      expect(el.querySelector('#content')).toBeFalsy();
    });

    it('a useVisibleTask$ throw is caught by the nearest <ErrorBoundary>', async () => {
      const ThrowingVisibleTask = component$(() => {
        const state = useSignal('init');
        useVisibleTask$(() => {
          throw new Error('visible task boom');
        });
        return <span id="content">{state.value}</span>;
      });

      const { container } = await domRender(
        <ErrorBoundary
          fallback$={$((e: any) => (
            <p id="fb">caught: {e.message}</p>
          ))}
        >
          <ThrowingVisibleTask />
        </ErrorBoundary>,
        { debug }
      );
      await waitForDrain(container);

      const el = container.element;
      expect(el.querySelector('#fb')?.textContent).toContain('caught: visible task boom');
      expect(el.querySelector('#content')).toBeFalsy();
    });

    it('a useTask$ throw is caught by the NEAREST of nested boundaries', async () => {
      const ThrowingTask = component$(() => {
        useTask$(() => {
          throw new Error('task boom');
        });
        return <span id="content">ok</span>;
      });

      const { container } = await domRender(
        <ErrorBoundary
          fallback$={$(() => (
            <p id="fb-outer">outer</p>
          ))}
        >
          <div id="outer-ok">outer ok</div>
          <ErrorBoundary
            fallback$={$(() => (
              <p id="fb-inner">inner</p>
            ))}
          >
            <ThrowingTask />
          </ErrorBoundary>
        </ErrorBoundary>,
        { debug }
      );
      await waitForDrain(container);

      const el = container.element;
      expect(el.querySelector('#fb-inner')).toBeTruthy();
      expect(el.querySelector('#fb-outer')).toBeFalsy();
      expect(el.querySelector('#outer-ok')).toBeTruthy();
    });
  });

  describe('in-order SSR (ssrRenderToDom)', () => {
    it('a useTask$ throw is caught by the nearest <ErrorBoundary>', async () => {
      const ThrowingTask = component$(() => {
        useTask$(() => {
          throw new Error('task boom');
        });
        return <span id="content">ok</span>;
      });

      const { container } = await ssrRenderToDom(
        <ErrorBoundary
          fallback$={$((e: any) => (
            <p id="fb">caught: {e.message}</p>
          ))}
        >
          <ThrowingTask />
        </ErrorBoundary>,
        { debug }
      );

      const el = container.element;
      expect(el.querySelector('#fb')?.textContent).toContain('caught: task boom');
      expect(el.querySelector('#content')).toBeFalsy();
    });
  });
});

describe('ErrorBoundary SSR async-generator + non-serializable throws (experimental)', () => {
  const AsyncGenThrower = component$(() => {
    return (
      <>
        {(async function* () {
          yield <div id="chunk">chunk</div>;
          throw new Error('async gen boom');
        })()}
      </>
    ) as unknown as JSXOutput;
  });

  const NonSerializableThrower = component$((): JSXOutput => {
    throw new NonSerializableError();
  });

  const NormalErrorThrower = component$((): JSXOutput => {
    throw new Error('normal boom');
  });

  it('routes an async-generator child throw to the enclosing boundary fallback', async () => {
    const { container } = await ssrRenderToDom(
      <ErrorBoundary
        fallback$={$((e: any) => (
          <p id="fb">caught: {String(e?.message ?? e)}</p>
        ))}
      >
        <AsyncGenThrower />
      </ErrorBoundary>,
      { debug }
    );
    expect(container.element.querySelector('#fb')?.textContent).toContain('caught: async gen boom');
  });

  it('a non-serializable throw renders the fallback AND the page still serializes', async () => {
    const { container } = await ssrRenderToDom(
      <ErrorBoundary
        fallback$={$((e: any) => (
          <p id="fb">caught: {String(e?.message ?? e)}</p>
        ))}
      >
        <NonSerializableThrower />
      </ErrorBoundary>,
      { debug }
    );
    expect(container.element.querySelector('#fb')?.textContent).toContain(
      'caught: non-serializable boom'
    );
  });

  it('a normal Error throw is unchanged (still renders its fallback)', async () => {
    const { container } = await ssrRenderToDom(
      <ErrorBoundary
        fallback$={$((e: any) => (
          <p id="fb">caught: {String(e?.message ?? e)}</p>
        ))}
      >
        <NormalErrorThrower />
      </ErrorBoundary>,
      { debug }
    );
    expect(container.element.querySelector('#fb')?.textContent).toContain('caught: normal boom');
  });
});

describe('ErrorBoundary: falsy thrown values', () => {
  const Boundary = component$(() => {
    return (
      <ErrorBoundary
        fallback$={$((e: any) => (
          <p id="fb">caught: {String(e)}</p>
        ))}
      >
        <button id="content">x</button>
      </ErrorBoundary>
    );
  });

  const expectFallbackShown = async (error: unknown) => {
    const { container } = await domRender(<Boundary />, { debug });
    const el = container.element;
    expect(el.querySelector('#content')).toBeTruthy();

    dispatchQError(el.querySelector('#content')!, {
      error,
      element: el.querySelector('#content')!,
    });
    await waitForDrain(container);

    expect(el.querySelector('#fb')).toBeTruthy();
    expect(el.querySelector('#content')).toBeFalsy();
  };

  it('shows the fallback when 0 is thrown', async () => {
    await expectFallbackShown(0);
  });

  it('shows the fallback when null is thrown', async () => {
    await expectFallbackShown(null);
  });

  it('shows the fallback when an empty string is thrown', async () => {
    await expectFallbackShown('');
  });

  it('shows the fallback when false is thrown', async () => {
    await expectFallbackShown(false);
  });

  it('out-of-order streaming: a thrown falsy value reveals the fallback host', async () => {
    const FalsyThrower = component$((): JSXOutput => {
      throw 0;
    });
    const chunks: string[] = [];
    await ssrRenderToDom(
      <main>
        <ErrorBoundary
          fallback$={$((e: any) => (
            <p id="fb">caught: {String(e)}</p>
          ))}
        >
          <FalsyThrower />
        </ErrorBoundary>
      </main>,
      {
        stream: {
          write: (c: string) => {
            chunks.push(c);
          },
        },
        streaming: { inOrder: { strategy: 'disabled' }, outOfOrder: true },
        debug,
      }
    );
    const document = createDocument({ html: chunks.join('') });
    (document as any).qProcessOOOS = (boundaryId: number, content: Element | null) =>
      processOutOfOrderSegmentVNodeData(document, String(boundaryId), content);
    const scripts = Array.from(
      document.querySelectorAll('script[type="text/javascript"]'),
      (s) => s.textContent || ''
    ).filter((code) => code.includes('qO') || code.includes('qInstallOOOS'));
    // eslint-disable-next-line no-new-func
    new Function('document', scripts.join('\n'))(document);

    expect(document.querySelector('#fb')?.textContent).toContain('caught: 0');
    const fallbackHost = document.querySelector('#fb')?.closest('[q\\:rp]') as HTMLElement | null;
    expect(fallbackHost?.style?.display).toBe('contents');
  });
});

describe('ErrorBoundary: recoverable vs build errors (dev)', () => {
  // Vite/Rollup stamp `.plugin` on build errors, so `isRecoverable` is false: a boundary must NOT hide them.
  const PluginThrower = component$(() => {
    const err = new Error('build boom');
    (err as any).plugin = 'vite:some-plugin';
    throw err;
  });

  const boxed = (child: JSXOutput) => (
    <ErrorBoundary
      fallback$={$((e: any) => (
        <p id="fb">caught: {e.message}</p>
      ))}
    >
      {child}
    </ErrorBoundary>
  );

  it('SSR: a recoverable error renders the fallback', async () => {
    const { container } = await ssrRenderToDom(boxed(<Thrower />), { debug });
    expect(container.element.querySelector('#fb')?.textContent).toContain('caught: boom');
  });

  it('SSR: a non-recoverable build error is NOT hidden in the fallback (it surfaces)', async () => {
    await expect(ssrRenderToDom(boxed(<PluginThrower />), { debug })).rejects.toThrow('build boom');
  });

  it('CSR: a recoverable error renders the fallback', async () => {
    const { container } = await domRender(boxed(<Thrower />), { debug });
    expect(container.element.querySelector('#fb')?.textContent).toContain('caught: boom');
  });

  it('CSR: a non-recoverable build error is not caught by the boundary', async () => {
    const { container } = await domRender(boxed(<button id="content">x</button>), { debug });
    const el = container.element;
    const target = el.querySelector('#content')!;
    const err = new Error('build boom');
    (err as any).plugin = 'vite:some-plugin';
    const ev = target.ownerDocument.createEvent('Event');
    ev.initEvent('qerror', false, false);
    (ev as any).detail = { error: err, element: target };
    target.ownerDocument.dispatchEvent(ev);
    try {
      await waitForDrain(container);
    } catch {
      /* rethrown build error may surface during drain — expected */
    }
    expect(el.querySelector('#fb')).toBeFalsy();
  });
});

// ===== IV. Escalation & no-boundary edges =====
describe('ErrorBoundary throwing-fallback escalation (SSR)', () => {
  // Fresh tree per test: rendering one JSX object in two containers trips "props across containers".
  const nested = () => (
    <ErrorBoundary
      fallback$={$(() => (
        <p id="fb-outer">outer</p>
      ))}
    >
      <ErrorBoundary
        fallback$={$(() => {
          throw new Error('inner fallback boom');
        })}
      >
        <Thrower />
      </ErrorBoundary>
    </ErrorBoundary>
  );

  it('in-order: a throwing inner fallback escalates to the outer boundary', async () => {
    const { container } = await ssrRenderToDom(nested(), {
      debug,
      streaming: { outOfOrder: false },
    });
    const el = container.element;
    expect(el.querySelector('#fb-outer')?.textContent).toBe('outer');
  });

  it('out-of-order: a throwing inner fallback escalates to the outer boundary', async () => {
    const { container } = await ssrRenderToDom(nested(), {
      debug,
      streaming: { outOfOrder: true },
    });
    const el = container.element;
    expect(el.querySelector('#fb-outer')?.textContent).toBe('outer');
    expect(displayOf(el.querySelector('[q\\:ebc="1"]'))).toBe('none');
  });
});

describe('ErrorBoundary safety net: in-order SSR throw with no boundary above', () => {
  const PromiseChild = component$(() => {
    const pending = new Promise<JSXOutput>((_resolve, reject) => reject(new Error('async boom')));
    return <>{pending}</>;
  });

  it('a synchronous render throw propagates and rejects the render', async () => {
    await expect(
      ssrRenderToDom(
        <main>
          <Thrower />
        </main>,
        { debug }
      )
    ).rejects.toThrow('boom');
  });

  it('the ORIGINAL error object propagates unchanged (not wrapped/projected)', async () => {
    const original = new Error('boom');
    const Throws = component$(() => {
      throw original;
    });
    let caught: unknown;
    try {
      await ssrRenderToDom(
        <main>
          <Throws />
        </main>,
        { debug }
      );
    } catch (err) {
      caught = err;
    }
    expect(caught).toBe(original);
  });

  it('an async component whose render rejects propagates and rejects the render', async () => {
    await expect(
      ssrRenderToDom(
        <main>
          <AsyncRejector />
        </main>,
        { debug }
      )
    ).rejects.toThrow('async boom');
  });

  it('a rejected promise child propagates and rejects the render', async () => {
    await expect(
      ssrRenderToDom(
        <main>
          <PromiseChild />
        </main>,
        { debug }
      )
    ).rejects.toThrow('async boom');
  });
});

describe('ErrorBoundary qerror listener', () => {
  it('does NOT throw when a qerror has no enclosing ErrorBoundary', async () => {
    const { container } = await domRender(
      <main>
        <button id="target">x</button>
      </main>,
      { debug }
    );
    const target = container.element.querySelector('#target')!;

    expect(() =>
      dispatchQError(target, { error: new Error('boom'), element: target })
    ).not.toThrow();
  });

  it('control: a with-boundary qerror still reveals the fallback', async () => {
    const { container } = await domRender(
      <ErrorBoundary
        fallback$={$((e: any) => (
          <p id="fb">caught: {e.message}</p>
        ))}
      >
        <button id="target">x</button>
      </ErrorBoundary>,
      { debug }
    );
    const target = container.element.querySelector('#target')!;

    dispatchQError(target, { error: new Error('async boom'), element: target });
    await waitForDrain(container);

    expect(container.element.querySelector('#fb')?.textContent).toContain('caught: async boom');
  });

  it('an importError qerror is not re-logged or routed to a boundary (qwikloader already logged it)', async () => {
    const { container } = await domRender(
      <ErrorBoundary
        fallback$={$((e: any) => (
          <p id="fb">caught: {e.message}</p>
        ))}
      >
        <button id="target">x</button>
      </ErrorBoundary>,
      { debug }
    );
    const target = container.element.querySelector('#target')!;

    expect(() =>
      dispatchQError(target, { error: new Error('sym:0'), element: target, importError: 'sync' })
    ).not.toThrow();
    await waitForDrain(container);

    expect(container.element.querySelector('#fb')).toBeFalsy();
  });
});

// ===== V. SSR streaming swap mechanics (experimental) =====
describe('ErrorBoundary in-order swap (no out-of-order streaming)', () => {
  const inOrder = { debug, streaming: { outOfOrder: false } } as const;

  it('happy path: content streams; no fallback content and no qErr swap script', async () => {
    const { container } = await ssrRenderToDom(
      <main>
        <ErrorBoundary
          fallback$={$(() => (
            <p id="fb">fallback</p>
          ))}
        >
          <div id="content">all good</div>
        </ErrorBoundary>
      </main>,
      inOrder
    );
    const el = container.element;
    expect(el.querySelector('#content')?.textContent).toBe('all good');
    expect(el.querySelector('#fb')).toBeFalsy();
    const contentHost = el.querySelector('[q\\:ebc]') as HTMLElement;
    expect(contentHost.style.display).toBe('contents');
    expect(el.outerHTML).not.toContain('qErr(');
  });

  it('sync throw: content-host hidden, fallback in the sibling host, qErr swap emitted', async () => {
    const { container } = await ssrRenderToDom(
      <main>
        <ErrorBoundary
          fallback$={$((e: any) => (
            <p id="fb">caught: {e.message}</p>
          ))}
        >
          <div id="before">before</div>
          <Thrower />
          <div id="after">after</div>
        </ErrorBoundary>
      </main>,
      inOrder
    );
    const el = container.element;
    const contentHost = el.querySelector('[q\\:ebc]') as HTMLElement;
    const fallbackHost = el.querySelector('[q\\:ebf]') as HTMLElement;
    expect(contentHost.style.display).toBe('none');
    expect(fallbackHost.style.display).toBe('contents');
    expect(fallbackHost.querySelector('#fb')?.textContent).toContain('caught: boom');
    expect(contentHost.querySelector('#before')).toBeTruthy();
    expect(contentHost.contains(fallbackHost)).toBe(false);
    expect(el.outerHTML).toContain('qErr(');
  });

  it('siblings OUTSIDE the boundary that streamed before the throw remain visible', async () => {
    const { container } = await ssrRenderToDom(
      <main>
        <div id="outside-before">outside-before</div>
        <ErrorBoundary
          fallback$={$((e: any) => (
            <p id="fb">caught: {e.message}</p>
          ))}
        >
          <Thrower />
        </ErrorBoundary>
        <div id="outside-after">outside-after</div>
      </main>,
      inOrder
    );
    const el = container.element;
    expect(el.querySelector('#fb')?.textContent).toContain('caught: boom');
    const outsideBefore = el.querySelector('#outside-before');
    const outsideAfter = el.querySelector('#outside-after');
    expect(outsideBefore?.textContent).toBe('outside-before');
    expect(outsideAfter?.textContent).toBe('outside-after');
    const contentHost = el.querySelector('[q\\:ebc]') as HTMLElement;
    expect(contentHost.contains(outsideBefore)).toBe(false);
    expect(contentHost.contains(outsideAfter)).toBe(false);
  });

  it('awaited-async throw: fallback delivered in document order (sibling host)', async () => {
    const { container } = await ssrRenderToDom(
      <main>
        <ErrorBoundary
          fallback$={$((e: any) => (
            <p id="fb">caught: {String(e?.message ?? e)}</p>
          ))}
        >
          <div id="before">before</div>
          <AsyncThrower />
        </ErrorBoundary>
      </main>,
      inOrder
    );
    const el = container.element;
    const contentHost = el.querySelector('[q\\:ebc]') as HTMLElement;
    const fallbackHost = el.querySelector('[q\\:ebf]') as HTMLElement;
    const fb = el.querySelector('#fb');
    expect(fb?.textContent).toContain('caught: async boom');
    expect(contentHost.style.display).toBe('none');
    expect(fallbackHost.style.display).toBe('contents');
    // qwik-dom's element.querySelector is NOT subtree-scoped, so assert placement via `contains`.
    expect(fallbackHost.contains(fb)).toBe(true);
    expect(contentHost.contains(fb)).toBe(false);
    expect(el.outerHTML).toContain('qErr(');
  });

  it('a throw deep inside nested tags yields well-formed HTML (hideable content-host)', async () => {
    const { container } = await ssrRenderToDom(
      <main>
        <ErrorBoundary
          fallback$={$((e: any) => (
            <p id="fb">caught: {e.message}</p>
          ))}
        >
          <div id="lvl1">
            <section id="lvl2">
              <article id="lvl3">
                <Thrower />
              </article>
            </section>
          </div>
        </ErrorBoundary>
      </main>,
      inOrder
    );
    const el = container.element;
    const contentHost = el.querySelector('[q\\:ebc]') as HTMLElement;
    expect(el.querySelector('#fb')?.textContent).toContain('caught: boom');
    expect(contentHost.style.display).toBe('none');
    expect(contentHost.querySelector('#lvl1 #lvl2 #lvl3')).toBeTruthy();
  });

  it('the qErr executor installs independently of OOOS (no qO on the page)', async () => {
    const chunks: string[] = [];
    await ssrRenderToDom(
      <main>
        <ErrorBoundary
          fallback$={$(() => (
            <p id="fb">fallback</p>
          ))}
        >
          <Thrower />
        </ErrorBoundary>
      </main>,
      {
        debug,
        stream: { write: (c: string) => void chunks.push(c) },
        streaming: { outOfOrder: false },
      }
    );
    const html = chunks.join('');
    expect(html).toContain('qErr(');
    expect(html).toContain('qInstallErrorSwap');
    expect(html).not.toMatch(/qInstallOOOS|qO\(/);
  });
});

describe('ErrorBoundary streaming swap (experimental)', () => {
  it('streams the content, then hides it and reveals the fallback when a descendant throws', async () => {
    const { html, document } = await streamAndResume(
      <main>
        <ErrorBoundary
          fallback$={$((e: any) => (
            <p id="fb">caught: {e.message}</p>
          ))}
        >
          <div id="before">before</div>
          <Thrower />
          <div id="after">after</div>
        </ErrorBoundary>
        <footer id="eb-tail">tail</footer>
      </main>
    );
    expect(html).toContain('id="before"');
    const swapPos = html.search(/qO\(\d/);
    expect(swapPos).toBeGreaterThan(html.indexOf('id="before"'));
    expect(swapPos).toBeLessThan(html.indexOf('id="eb-tail"'));
    expect(document.querySelector('#fb')?.textContent).toContain('caught: boom');
    expect(displayOf(document.querySelector('#fb')?.closest('[q\\:rp]'))).toBe('contents');
    expect(displayOf(document.querySelector('#before')?.closest('div[style]'))).toBe('none');
  });

  it('renders the content unchanged when nothing throws (ships no swap JS)', async () => {
    const { html, document } = await streamAndResume(
      <main>
        <ErrorBoundary
          fallback$={$(() => (
            <p id="fb">fallback</p>
          ))}
        >
          <div id="before">before</div>
          <div id="content">all good</div>
          <div id="after">after</div>
        </ErrorBoundary>
      </main>
    );
    expect(document.querySelector('#content')?.textContent).toBe('all good');
    expect(displayOf(document.querySelector('#content')?.closest('div[style]'))).toBe('contents');
    expect(document.querySelector('#fb')).toBeFalsy();
    expect(html).not.toMatch(/qO\(|qInstallOOOS/);
  });

  it('a deferred (async) throw inside a child <Suspense> tears down the WHOLE boundary', async () => {
    const { html, document } = await streamAndResume(
      <main>
        <ErrorBoundary
          fallback$={$((e: any) => (
            <p id="fb">caught: {String(e?.message ?? e)}</p>
          ))}
        >
          <div id="sibling">sibling</div>
          <Suspense fallback={<span id="skel">loading</span>}>
            <AsyncThrower />
          </Suspense>
        </ErrorBoundary>
      </main>
    );
    expect(html).toContain('id="sibling"');
    expect(document.querySelector('#fb')?.textContent).toContain('caught: async boom');
    expect(displayOf(document.querySelector('#fb')?.closest('[q\\:rp]'))).toBe('contents');
    expect(displayOf(document.querySelector('#sibling')?.closest('div[style]'))).toBe('none');
  });

  it('nested boundaries: the inner one tears down, the outer subtree stays visible', async () => {
    const { document } = await streamAndResume(
      <main>
        <ErrorBoundary
          fallback$={$(() => (
            <p id="fb-outer">outer</p>
          ))}
        >
          <div id="outer-sibling">outer-sibling</div>
          <ErrorBoundary
            fallback$={$(() => (
              <p id="fb-inner">inner</p>
            ))}
          >
            <div id="before">before</div>
            <Thrower />
            <div id="after">after</div>
          </ErrorBoundary>
        </ErrorBoundary>
      </main>
    );
    expect(document.querySelector('#fb-inner')).toBeTruthy();
    expect(document.querySelector('#fb-outer')).toBeFalsy();
    expect(displayOf(document.querySelector('#before')?.closest('div[style]'))).toBe('none');
    expect(document.querySelector('#outer-sibling')).toBeTruthy();
    expect(displayOf(document.querySelector('#outer-sibling')?.closest('div[style]'))).toBe(
      'contents'
    );
  });

  it('boundary inside a <Suspense> swaps within the segment (skeleton → fallback)', async () => {
    const { document } = await streamAndResume(
      <main>
        <Suspense fallback={<span id="loading">loading</span>}>
          <ErrorBoundary
            fallback$={$((e: any) => (
              <p id="fb">caught: {e.message}</p>
            ))}
          >
            <div id="before">before</div>
            <Thrower />
            <div id="after">after</div>
          </ErrorBoundary>
        </Suspense>
      </main>
    );
    expect(document.querySelector('#fb')?.textContent).toContain('caught: boom');
    const contentHost = document.querySelector('[q\\:ebc]');
    expect(contentHost?.querySelector('#before')).toBeTruthy();
    expect(displayOf(contentHost)).toBe('none');
  });

  it('boundary inside a <Suspense>: an async throw swaps out the WHOLE content', async () => {
    const { document } = await streamAndResume(
      <main>
        <Suspense fallback={<span id="loading">loading</span>}>
          <ErrorBoundary
            fallback$={$((e: any) => (
              <p id="fb">caught: {String(e?.message ?? e)}</p>
            ))}
          >
            <div id="before">before</div>
            <AsyncThrower />
            <div id="after">after</div>
          </ErrorBoundary>
        </Suspense>
      </main>
    );
    expect(document.querySelector('#fb')?.textContent).toContain('caught: async boom');
    const contentHost = document.querySelector('[q\\:ebc]');
    expect(contentHost?.querySelector('#before')).toBeTruthy();
    expect(displayOf(contentHost)).toBe('none');
  });

  it('catches an async component whose render rejects (no <Suspense>)', async () => {
    const { document } = await streamAndResume(
      <main>
        <ErrorBoundary
          fallback$={$((e: any) => (
            <p id="fb">caught: {String(e?.message ?? e)}</p>
          ))}
        >
          <div id="before">before</div>
          <AsyncRejector />
        </ErrorBoundary>
      </main>
    );
    expect(document.querySelector('#fb')?.textContent).toContain('caught: async boom');
    expect(displayOf(document.querySelector('#fb')?.closest('[q\\:rp]'))).toBe('contents');
    expect(displayOf(document.querySelector('#before')?.closest('div[style]'))).toBe('none');
  });

  it('catches a rejected promise child (no <Suspense>)', async () => {
    const { document } = await streamAndResume(
      <main>
        <ErrorBoundary
          fallback$={$((e: any) => (
            <p id="fb">caught: {String(e?.message ?? e)}</p>
          ))}
        >
          <AsyncThrower />
        </ErrorBoundary>
      </main>
    );
    expect(document.querySelector('#fb')?.textContent).toContain('caught: async boom');
  });

  it('a fallback whose own render throws aborts the stream instead of deadlocking', async () => {
    await expect(
      streamAndResume(
        <main>
          <ErrorBoundary
            fallback$={$(() => (
              <FallbackBoomer />
            ))}
          >
            <Thrower />
          </ErrorBoundary>
        </main>
      )
    ).rejects.toThrow('fallback boom');
  });

  it('catches an async signal that rejects (no <Suspense>)', async () => {
    const { document } = await streamAndResume(
      <main>
        <ErrorBoundary
          fallback$={$((e: any) => (
            <p id="fb">caught: {String(e?.message ?? e)}</p>
          ))}
        >
          <div id="before">before</div>
          <AsyncSignalThrower />
        </ErrorBoundary>
      </main>
    );
    expect(document.querySelector('#fb')?.textContent).toContain('caught: async signal boom');
    expect(displayOf(document.querySelector('#before')?.closest('div[style]'))).toBe('none');
  });

  it('sibling boundaries swap independently', async () => {
    const { document } = await streamAndResume(
      <main>
        <ErrorBoundary
          fallback$={$(() => (
            <p id="fb-a">A failed</p>
          ))}
        >
          <Thrower />
        </ErrorBoundary>
        <ErrorBoundary
          fallback$={$(() => (
            <p id="fb-b">B failed</p>
          ))}
        >
          <div id="ok-b">b ok</div>
        </ErrorBoundary>
      </main>
    );
    expect(document.querySelector('#fb-a')).toBeTruthy();
    expect(document.querySelector('#ok-b')?.textContent).toBe('b ok');
    expect(document.querySelector('#fb-b')).toBeFalsy();
    expect(displayOf(document.querySelector('#fb-a')?.closest('[q\\:rp]'))).toBe('contents');
    expect(displayOf(document.querySelector('#ok-b')?.closest('div[style]'))).toBe('contents');
  });

  it('client: a post-resume error on an out-of-order streamed boundary re-renders to its fallback', async () => {
    const { container } = await ssrRenderToDom(
      <main>
        <ErrorBoundary
          fallback$={$((e: any) => (
            <p id="fb">caught: {e.message}</p>
          ))}
        >
          <button id="target">x</button>
          <div id="content">content ok</div>
        </ErrorBoundary>
      </main>,
      { streaming: { inOrder: { strategy: 'disabled' }, outOfOrder: true }, debug }
    );
    const el = container.element;
    expect(el.querySelector('#content')?.textContent).toBe('content ok');
    expect(el.querySelector('#fb')).toBeFalsy();

    const target = el.querySelector('#target')!;
    const ev = el.ownerDocument.createEvent('Event');
    ev.initEvent('qerror', false, false);
    (ev as any).detail = { error: new Error('client boom'), element: target };
    el.ownerDocument.dispatchEvent(ev);
    await waitForDrain(container);

    expect(el.querySelector('#fb')?.textContent).toContain('caught: client boom');
    expect(el.querySelector('#content')).toBeFalsy();
  });
});

describe('ErrorBoundary routing through Suspense (experimental)', () => {
  it('EB-outer › Suspense › EB-inner › throw → EB-inner catches, EB-outer untouched', async () => {
    const { document } = await streamAndResume(
      <main>
        <ErrorBoundary
          fallback$={$(() => (
            <p id="fb-outer">outer</p>
          ))}
        >
          <div id="outer-ok">outer-ok</div>
          <Suspense fallback={<span id="skel">loading</span>}>
            <ErrorBoundary
              fallback$={$((e: any) => (
                <p id="fb-inner">caught: {e.message}</p>
              ))}
            >
              <Thrower />
            </ErrorBoundary>
          </Suspense>
        </ErrorBoundary>
      </main>
    );
    expect(document.querySelector('#fb-inner')?.textContent).toContain('caught: boom');
    expect(document.querySelector('#fb-outer')).toBeFalsy();
    expect(document.querySelector('#outer-ok')?.textContent).toBe('outer-ok');
  });

  it('EB-outer › Suspense-A › EB-mid › Suspense-B › throw → EB-mid catches, EB-outer untouched', async () => {
    const { document } = await streamAndResume(
      <main>
        <ErrorBoundary
          fallback$={$(() => (
            <p id="fb-outer">outer</p>
          ))}
        >
          <div id="outer-ok">outer-ok</div>
          <Suspense fallback={<span id="skel-a">a</span>}>
            <ErrorBoundary
              fallback$={$((e: any) => (
                <p id="fb-mid">caught: {e.message}</p>
              ))}
            >
              <div id="mid-ok">mid-ok</div>
              <Suspense fallback={<span id="skel-b">b</span>}>
                <Thrower />
              </Suspense>
            </ErrorBoundary>
          </Suspense>
        </ErrorBoundary>
      </main>
    );
    expect(document.querySelector('#fb-mid')?.textContent).toContain('caught: boom');
    expect(document.querySelector('#fb-outer')).toBeFalsy();
    expect(document.querySelector('#outer-ok')?.textContent).toBe('outer-ok');
  });
});

describe('ErrorBoundary concurrent fallback teardown (experimental)', () => {
  it('two sibling <Suspense> that both reject tear the boundary down exactly once', async () => {
    const { document } = await streamAndResume(
      <main>
        <ErrorBoundary
          fallback$={$((e: any) => (
            <p id="fb">caught: {String(e?.message ?? e)}</p>
          ))}
        >
          <div id="sibling">sibling</div>
          <Suspense fallback={<span id="skel-a">loading a</span>}>
            <AsyncThrower />
          </Suspense>
          <Suspense fallback={<span id="skel-b">loading b</span>}>
            <AsyncThrower />
          </Suspense>
        </ErrorBoundary>
      </main>
    );

    const fallbacks = document.querySelectorAll('#fb');
    expect(fallbacks.length).toBe(1);
    expect(fallbacks[0]?.textContent).toContain('caught: async boom');
    expect(displayOf(document.querySelector('#fb')?.closest('[q\\:rp]'))).toBe('contents');
    expect(displayOf(document.querySelector('#sibling')?.closest('div[style]'))).toBe('none');
  });
});

describe('ErrorBoundary: a re-render deletes the inert swapped-out content', () => {
  it('in-order: re-rendering an SSR-errored boundary drops the inert content-host, fallback stays', async () => {
    const { container } = await ssrRenderToDom(
      <main>
        <ErrorBoundary
          fallback$={$((e: any) => (
            <p id="fb">caught: {e.message}</p>
          ))}
        >
          <div id="content">content</div>
          <Thrower />
        </ErrorBoundary>
      </main>,
      { debug, streaming: { outOfOrder: false } }
    );
    const el = container.element;
    const contentHost = el.querySelector('[q\\:ebc]') as HTMLElement;
    expect(el.querySelector('#fb')?.textContent).toContain('caught: boom');
    expect(contentHost.style.display).toBe('none');
    expect(contentHost.contains(el.querySelector('#content'))).toBe(true);

    await rerenderComponent(contentHost);
    await waitForDrain(container);

    expect(el.querySelector('[q\\:ebc]')).toBeFalsy();
    expect(el.querySelector('#content')).toBeFalsy();
    expect(el.querySelector('#fb')?.textContent).toContain('caught: boom');
  });

  it('out-of-order: re-rendering an SSR-errored boundary drops the inert content, fallback stays', async () => {
    const { container } = await ssrRenderToDom(
      <main>
        <ErrorBoundary
          fallback$={$((e: any) => (
            <p id="fb">caught: {e.message}</p>
          ))}
        >
          <div id="content">content</div>
          <Thrower />
        </ErrorBoundary>
      </main>,
      { streaming: { inOrder: { strategy: 'disabled' }, outOfOrder: true }, debug }
    );
    const el = container.element;
    const contentHost = el.querySelector('[q\\:ebc]') as HTMLElement;
    expect(el.querySelector('#fb')?.textContent).toContain('caught: boom');
    expect(contentHost.contains(el.querySelector('#content'))).toBe(true);

    await rerenderComponent(contentHost);
    await waitForDrain(container);

    expect(el.querySelector('#content')).toBeFalsy();
    expect(el.querySelector('#fb')?.textContent).toContain('caught: boom');
  });
});

describe('ErrorBoundary SSR→CSR cross-phase (experimental)', () => {
  it('SSR inner error, then a client throw to the OUTER boundary replaces the whole subtree', async () => {
    const { container } = await ssrRenderToDom(
      <main>
        <ErrorBoundary
          fallback$={$((e: any) => (
            <p id="fb-outer">outer: {e.message}</p>
          ))}
        >
          <button id="outer-btn">x</button>
          <ErrorBoundary
            fallback$={$((e: any) => (
              <p id="fb-inner">inner: {e.message}</p>
            ))}
          >
            <Thrower />
          </ErrorBoundary>
        </ErrorBoundary>
      </main>,
      { streaming: { inOrder: { strategy: 'disabled' }, outOfOrder: true }, debug }
    );
    const el = container.element;
    expect(el.querySelector('#fb-inner')?.textContent).toContain('inner: boom');
    expect(el.querySelector('#fb-outer')).toBeFalsy();
    expect(el.querySelector('#outer-btn')).toBeTruthy();

    const target = el.querySelector('#outer-btn')!;
    dispatchQError(target, { error: new Error('outer boom'), element: target });
    await waitForDrain(container);

    expect(el.querySelector('#fb-outer')?.textContent).toContain('outer: outer boom');
    expect(el.querySelector('#fb-inner')).toBeFalsy();
    expect(el.querySelector('#outer-btn')).toBeFalsy();
  });

  it('an in-order two-host collapses cleanly when a client-first error re-renders the boundary (no Missing child)', async () => {
    const { container } = await ssrRenderToDom(
      <main>
        <ErrorBoundary
          fallback$={$((e: any) => (
            <p id="fb">caught: {String(e?.message ?? e)}</p>
          ))}
        >
          <button id="content-btn">x</button>
          <div id="content">content ok</div>
        </ErrorBoundary>
      </main>,
      { streaming: { outOfOrder: false }, debug }
    );
    const el = container.element;
    expect(el.querySelector('#content')?.textContent).toBe('content ok');
    expect(el.querySelector('#fb')).toBeFalsy();
    expect((el.querySelector('[q\\:ebc]') as HTMLElement).style.display).toBe('contents');

    const target = el.querySelector('#content-btn')!;
    dispatchQError(target, { error: new Error('client boom'), element: target });
    await waitForDrain(container);

    expect(el.querySelectorAll('#fb').length).toBe(1);
    expect(el.querySelector('#fb')?.textContent).toContain('caught: client boom');
    expect(el.querySelector('#content')).toBeFalsy();
    expect(el.querySelector('[q\\:ebc]')).toBeFalsy();
    expect(el.querySelector('[q\\:ebf]')).toBeFalsy();
  });
});

describe('ErrorBoundary error redaction (prod payload safety)', () => {
  it('prod: scrubs message + attached props to a generic message + stable digest', () => {
    const original = Object.assign(new Error('secret-db-detail'), {
      query: 'SELECT * FROM users',
    });
    const redacted = toSerializableBoundaryError(original, /* dev */ false) as Error & {
      digest?: string;
    };
    expect(redacted).toBeInstanceOf(Error);
    expect(redacted.message).toBe('An error occurred');
    expect(redacted.message).not.toContain('secret');
    expect((redacted as Record<string, unknown>).query).toBeUndefined();
    expect(typeof redacted.digest).toBe('string');
    expect(redacted.digest!.length).toBeGreaterThan(0);
  });

  it('prod: digest is deterministic per error and distinguishes different errors', () => {
    const err = new Error('boom');
    const d1 = (toSerializableBoundaryError(err, false) as Error & { digest: string }).digest;
    const d2 = (toSerializableBoundaryError(err, false) as Error & { digest: string }).digest;
    const dOther = (
      toSerializableBoundaryError(new Error('different'), false) as Error & {
        digest: string;
      }
    ).digest;
    expect(d1).toBe(d2);
    expect(d1).not.toBe(dOther);
  });

  it('dev: keeps full fidelity (returns the original Error unchanged)', () => {
    const original = new Error('full-detail');
    expect(toSerializableBoundaryError(original, /* dev */ true)).toBe(original);
  });

  it('markBoundaryErrored fires onError$ with the ORIGINAL error, not the redacted projection', () => {
    const received: unknown[] = [];
    const store: ErrorBoundaryStore = { error: undefined, $onError$: (e) => received.push(e) };
    const original = Object.assign(new Error('boom'), { secret: 'x' });
    markBoundaryErrored(store, original);
    expect(received).toHaveLength(1);
    expect(received[0]).toBe(original);
  });
});

// ===== VI. Side effects: onError$ =====
describe('ErrorBoundary onError$', () => {
  // Object ref survives `$()` capture; a primitive `let` would be frozen to its initial value.
  const onErrorLog: { errors: unknown[] } = { errors: [] };

  it('fires once with the caught error and does not affect rendering (CSR)', async () => {
    onErrorLog.errors = [];
    const { container } = await domRender(
      <ErrorBoundary
        fallback$={$((e: any) => (
          <p id="fb">caught: {e.message}</p>
        ))}
        onError$={$((e: any) => {
          onErrorLog.errors.push(e instanceof Error ? e.message : e);
        })}
      >
        <Thrower />
      </ErrorBoundary>,
      { debug }
    );
    await waitForDrain(container);
    await getTestPlatform().flush();

    expect(container.element.querySelector('#fb')?.textContent).toContain('caught: boom');
    expect(onErrorLog.errors).toEqual(['boom']);
  });

  it('is optional: a boundary without onError$ still catches', async () => {
    const { container } = await domRender(
      <ErrorBoundary
        fallback$={$((e: any) => (
          <p id="fb">caught: {e.message}</p>
        ))}
      >
        <Thrower />
      </ErrorBoundary>,
      { debug }
    );
    await waitForDrain(container);
    expect(container.element.querySelector('#fb')?.textContent).toContain('caught: boom');
  });

  it('fires once for an SSR-caught throw (out-of-order) and not again on resume', async () => {
    onErrorLog.errors = [];
    await ssrRenderToDom(
      <ErrorBoundary
        fallback$={$((e: any) => (
          <p id="fb">caught: {e.message}</p>
        ))}
        onError$={$((e: any) => {
          onErrorLog.errors.push(e instanceof Error ? e.message : e);
        })}
      >
        <Thrower />
      </ErrorBoundary>,
      { debug, streaming: { inOrder: { strategy: 'disabled' }, outOfOrder: true } }
    );
    await getTestPlatform().flush();
    await delay(0);
    expect(onErrorLog.errors).toEqual(['boom']);
  });

  it('fires once for an SSR-caught throw (in-order) and not again on resume', async () => {
    onErrorLog.errors = [];
    await ssrRenderToDom(
      <ErrorBoundary
        fallback$={$((e: any) => (
          <p id="fb">caught: {e.message}</p>
        ))}
        onError$={$((e: any) => {
          onErrorLog.errors.push(e instanceof Error ? e.message : e);
        })}
      >
        <Thrower />
      </ErrorBoundary>,
      { debug, streaming: { outOfOrder: false } }
    );
    await getTestPlatform().flush();
    await delay(0);
    expect(onErrorLog.errors).toEqual(['boom']);
  });

  it('fires once from serialized props.onError$ on a post-resume client error', async () => {
    // A captured ref would be pushed to a DESERIALIZED copy after resume, so use a `globalThis` sink
    // the QRL captures nothing of, observable across the serialization boundary.
    (globalThis as any).__ebOnErrorLog = [];
    const { container } = await ssrRenderToDom(
      <ErrorBoundary
        fallback$={$((e: any) => (
          <p id="fb">caught: {e.message}</p>
        ))}
        onError$={$((e: any) => {
          ((globalThis as any).__ebOnErrorLog ||= []).push(e instanceof Error ? e.message : e);
        })}
      >
        <button id="target">x</button>
      </ErrorBoundary>,
      { debug }
    );
    expect((globalThis as any).__ebOnErrorLog).toEqual([]);

    const el = container.element;
    const target = el.querySelector('#target')!;
    dispatchQError(target, { error: new Error('client boom'), element: target });
    await waitForDrain(container);
    await getTestPlatform().flush();
    await delay(0);

    expect((globalThis as any).__ebOnErrorLog).toEqual(['client boom']);
    expect(el.querySelector('#fb')?.textContent).toContain('caught: client boom');
    delete (globalThis as any).__ebOnErrorLog;
  });

  it('a synchronously throwing onError$ is swallowed; the fallback still renders (CSR)', async () => {
    const log: unknown[] = [];
    const { container } = await domRender(
      <ErrorBoundary
        fallback$={$((e: any) => (
          <p id="fb">caught: {e.message}</p>
        ))}
        onError$={$((e: any) => {
          log.push(e instanceof Error ? e.message : e);
          throw new Error('onError boom');
        })}
      >
        <Thrower />
      </ErrorBoundary>,
      { debug }
    );
    await waitForDrain(container);
    await getTestPlatform().flush();
    expect(log).toEqual(['boom']);
    expect(container.element.querySelector('#fb')?.textContent).toContain('caught: boom');
  });

  it('an async-rejecting onError$ is swallowed; the fallback still renders (CSR)', async () => {
    const log: unknown[] = [];
    const { container } = await domRender(
      <ErrorBoundary
        fallback$={$((e: any) => (
          <p id="fb">caught: {e.message}</p>
        ))}
        onError$={$((e: any) => {
          log.push(e instanceof Error ? e.message : e);
          return Promise.reject(new Error('onError async boom'));
        })}
      >
        <Thrower />
      </ErrorBoundary>,
      { debug }
    );
    await waitForDrain(container);
    await getTestPlatform().flush();
    await delay(0);
    expect(log).toEqual(['boom']);
    expect(container.element.querySelector('#fb')?.textContent).toContain('caught: boom');
  });

  it('a throwing onError$ does not abort SSR; the page still renders the fallback', async () => {
    const log: unknown[] = [];
    const { container } = await ssrRenderToDom(
      <ErrorBoundary
        fallback$={$((e: any) => (
          <p id="fb">caught: {e.message}</p>
        ))}
        onError$={$((e: any) => {
          log.push(e instanceof Error ? e.message : e);
          throw new Error('onError boom');
        })}
      >
        <Thrower />
      </ErrorBoundary>,
      { debug, streaming: { outOfOrder: false } }
    );
    await getTestPlatform().flush();
    await delay(0);
    expect(log).toEqual(['boom']);
    expect(container.element.querySelector('#fb')?.textContent).toContain('caught: boom');
  });

  it('escalation: inner and outer onError$ each fire once for their own error (CSR)', async () => {
    const innerLog: unknown[] = [];
    const outerLog: unknown[] = [];
    const { container } = await domRender(
      <ErrorBoundary
        fallback$={$(() => (
          <p id="fb-outer">outer</p>
        ))}
        onError$={$((e: any) => {
          outerLog.push(e instanceof Error ? e.message : e);
        })}
      >
        <ErrorBoundary
          fallback$={$(() => {
            throw new Error('inner fallback boom');
          })}
          onError$={$((e: any) => {
            innerLog.push(e instanceof Error ? e.message : e);
          })}
        >
          <Thrower />
        </ErrorBoundary>
      </ErrorBoundary>,
      { debug }
    );
    await waitForDrain(container).catch(() => {});
    await getTestPlatform().flush();

    const el = container.element;
    expect(el.querySelector('#fb-outer')?.textContent).toBe('outer');
    expect(el.querySelector('#fb-inner')).toBeFalsy();
    expect(innerLog).toEqual(['boom']);
    expect(outerLog).toEqual(['inner fallback boom']);
  });

  it('escalation: inner and outer onError$ each fire once for their own error (in-order SSR)', async () => {
    const innerLog: unknown[] = [];
    const outerLog: unknown[] = [];
    await ssrRenderToDom(
      <ErrorBoundary
        fallback$={$(() => (
          <p id="fb-outer">outer</p>
        ))}
        onError$={$((e: any) => {
          outerLog.push(e instanceof Error ? e.message : e);
        })}
      >
        <ErrorBoundary
          fallback$={$(() => {
            throw new Error('inner fallback boom');
          })}
          onError$={$((e: any) => {
            innerLog.push(e instanceof Error ? e.message : e);
          })}
        >
          <Thrower />
        </ErrorBoundary>
      </ErrorBoundary>,
      { debug, streaming: { outOfOrder: false } }
    );
    await getTestPlatform().flush();
    await delay(0);
    expect(innerLog).toEqual(['boom']);
    expect(outerLog).toEqual(['inner fallback boom']);
  });
});

// Module-level counters: a `let` captured in a `component$` becomes a const.
const resetRef = { flake: 0, toggle: 0 };
const ResetFlake = component$(() => {
  resetRef.flake++;
  if (resetRef.flake === 1) {
    throw new Error('boom');
  }
  return <div id="ok">ok</div>;
});
const ResetAlwaysThrows = component$(() => {
  throw new Error('persistent');
});
const ResetToggle = component$(() => {
  resetRef.toggle++;
  if (resetRef.toggle % 2 === 1) {
    throw new Error(`boom-${resetRef.toggle}`);
  }
  return <div id="alive">alive</div>;
});
const withResetBoundary = (child: JSXOutput) =>
  component$(() => (
    <main>
      <ErrorBoundary
        fallback$={$((e: any, reset: any) => (
          <button id="retry" onClick$={() => reset()}>
            caught: {e.message}
          </button>
        ))}
      >
        {child}
      </ErrorBoundary>
    </main>
  ));

describe('ErrorBoundary reset', () => {
  it('CSR: reset re-executes a flaky projected child and recovers', async () => {
    resetRef.flake = 0;
    const App = withResetBoundary(<ResetFlake />);
    const { container } = await domRender(<App />, { debug });
    const el = container.element;
    expect(el.querySelector('#retry')).toBeTruthy();
    expect(el.querySelector('#ok')).toBeFalsy();

    await trigger(el, '#retry', 'click');

    expect(el.querySelector('#ok')?.textContent).toContain('ok');
    expect(el.querySelector('#retry')).toBeFalsy();
  });

  it('CSR: a still-throwing child re-shows the fallback (no loop)', async () => {
    const App = withResetBoundary(<ResetAlwaysThrows />);
    const { container } = await domRender(<App />, { debug });
    const el = container.element;

    await trigger(el, '#retry', 'click');

    expect(el.querySelector('#retry')?.textContent).toContain('persistent');
  });

  it('CSR: reset re-arms the boundary for a later error', async () => {
    resetRef.toggle = 0;
    const App = withResetBoundary(<ResetToggle />);
    const { container } = await domRender(<App />, { debug });
    const el = container.element;
    expect(el.querySelector('#retry')?.textContent).toContain('boom-1');

    await trigger(el, '#retry', 'click');

    expect(el.querySelector('#alive')).toBeTruthy();
  });

  // Harness can't dispatch resumed handlers, so drive reset directly; the e2e is the real path.
  const resetResumed = async (container: any) => {
    const c = _getDomContainer(container.element) as any;
    c.resetErrorBoundary(c.vNodeLocate(container.element.querySelector('#retry')));
    await waitForDrain(container);
  };

  it('in-order SSR resume: reset re-executes the child', async () => {
    resetRef.flake = 0;
    const App = withResetBoundary(<ResetFlake />);
    const { container } = await ssrRenderToDom(<App />, {
      debug,
      streaming: { outOfOrder: false },
    });
    expect(container.element.querySelector('#retry')).toBeTruthy();

    await resetResumed(container);

    expect(container.element.querySelector('#ok')).toBeTruthy();
    expect(container.element.querySelector('#retry')).toBeFalsy();
  });

  it('out-of-order SSR resume: reset re-executes the child', async () => {
    resetRef.flake = 0;
    const App = withResetBoundary(<ResetFlake />);
    const { container } = await ssrRenderToDom(<App />, {
      debug,
      streaming: { inOrder: { strategy: 'disabled' }, outOfOrder: true },
    });
    expect(container.element.querySelector('#retry')).toBeTruthy();

    await resetResumed(container);

    expect(container.element.querySelector('#ok')).toBeTruthy();
  });
});

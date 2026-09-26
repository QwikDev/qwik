import {
  $,
  component$,
  createComputed$,
  Catch,
  render,
  setPlatform,
  Slot,
  SSRStream,
  Pending,
  useComputed$,
  useSignal,
  type Signal,
  useTask$,
  useVisibleTask$,
  type JSXOutput,
} from '@qwik.dev/core';
import { _deserialize, _getDomContainer, _serialize } from '@qwik.dev/core/internal';
import {
  createDocument,
  domRender,
  getTestPlatform,
  ssrRenderToDom,
  trigger,
  waitForDrain,
} from '@qwik.dev/core/testing';
import { describe, expect, it, vi } from 'vitest';
import * as logUtils from '../shared/utils/log';
import { qrl } from '../shared/qrl/qrl';
import {
  emulateExecutionOfStreamingOutOfOrderScripts,
  rerenderComponent,
} from '../../testing/rendering.unit-util';
import { delay } from '../shared/utils/promises';
import { isServerPlatform } from '../shared/platform/platform';
import { resetCatch } from '../shared/error/catch';
import {
  ERROR_CONTEXT,
  getOwnCatchStore,
  redactBoundaryErrorForDisplay,
} from '../shared/error/error-handling';

const debug = false;

// With the pendingBoundary flag on, out-of-order is the default; IN_ORDER is the opt-out.
const OOOS = {
  streaming: { inOrder: { strategy: 'disabled' as const }, outOfOrder: true },
};
const IN_ORDER = { streaming: { outOfOrder: false } };
const streamingModes = [
  ['in-order', IN_ORDER],
  ['out-of-order', OOOS],
] as const;

const Thrower = component$<{ message?: string }>((props) => {
  throw new Error(props.message ?? 'boom');
});

const AsyncThrower = component$(() => {
  const pending = new Promise<JSXOutput>((_resolve, reject) => reject(new Error('async boom')));
  return <>{pending}</>;
});

const AsyncRejector = component$(
  () => new Promise<JSXOutput>((_resolve, reject) => reject(new Error('async boom'))) as any
);

const AsyncSignalThrower = component$(() => {
  const sig = createComputed$(() => Promise.reject(new Error('async signal boom')));
  return <>{sig}</>;
});

const ThrowingTask = component$<{ message?: string; async?: boolean }>((props) => {
  useTask$(() => {
    const fail = () => {
      throw new Error(props.message ?? 'task boom');
    };
    if (props.async) {
      return delay(1).then(fail);
    }
    fail();
  });
  return <span id="content">ok</span>;
});

class NonSerializableError {
  message = 'non-serializable boom';
  toJSON() {
    return this.message;
  }
}

const NonSerializableThrower = component$((): JSXOutput => {
  throw new NonSerializableError();
});

const streamAndResume = async (jsx: JSXOutput, opts: Record<string, unknown> = {}) => {
  const chunks: string[] = [];
  await ssrRenderToDom(jsx, {
    stream: {
      write: (c: string) => {
        chunks.push(c);
      },
    },
    debug,
    ...opts,
  });
  const html = chunks.join('');
  const document = createDocument({ html });
  emulateExecutionOfStreamingOutOfOrderScripts(document);
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

const settleOnErrorDelivery = async (container: Parameters<typeof waitForDrain>[0]) => {
  await waitForDrain(container).catch(() => {});
  await getTestPlatform().flush();
  await delay(0);
};

const fb = (id = 'fb') => $((e: any) => <p id={id}>caught: {String(e?.message ?? e)}</p>);

const Boxed = component$(() => {
  return (
    <Catch fallback$={fb()}>
      <Slot />
    </Catch>
  );
});

const BoxedWithSibling = component$(() => {
  return (
    <Catch fallback$={fb()}>
      <div id="sibling">sibling</div>
      <Slot />
    </Catch>
  );
});

const TwoNamedSlots = component$(() => {
  return (
    <div id="two-hosts">
      <Catch fallback$={fb('fb-danger')}>
        <div id="danger-host">
          <Slot name="danger" />
        </div>
      </Catch>
      <Catch fallback$={fb('fb-warning')}>
        <div id="warning-host">
          <Slot name="warning" />
        </div>
      </Catch>
    </div>
  );
});

const PluginThrower = component$(() => {
  const err = new Error('build boom');
  (err as any).plugin = 'vite:some-plugin';
  throw err;
});

const NestedEscalation = component$<{ innerOnError?: any; outerOnError?: any }>((props) => (
  <Catch
    fallback$={$(() => (
      <p id="fb-outer">outer</p>
    ))}
    onError$={props.outerOnError}
  >
    <Catch
      fallback$={$(() => {
        throw new Error('inner fallback boom');
      })}
      onError$={props.innerOnError}
    >
      <Thrower />
    </Catch>
  </Catch>
));

const onErrorLog: { errors: unknown[] } = { errors: [] };

const modes = [
  [
    'SSR',
    (jsx: () => JSXOutput, opts: Record<string, unknown> = {}) =>
      ssrRenderToDom(jsx(), { debug, ...opts }),
  ],
  [
    'CSR',
    (jsx: () => JSXOutput, opts: Record<string, unknown> = {}) =>
      domRender(jsx(), { debug, ...opts }),
  ],
  [
    'SSR in a deferred segment',
    (jsx: () => JSXOutput, opts: Record<string, unknown> = {}) =>
      ssrRenderToDom(
        <Pending fallback={<span id="segment-skel">deferring</span>}>{jsx()}</Pending>,
        { debug, ...opts }
      ),
  ],
] as const;
const AsyncGenThrower = component$(() => (
  <SSRStream>
    {async function* () {
      yield <div id="chunk">chunk</div>;
      throw new Error('async gen boom');
    }}
  </SSRStream>
));
const StreamWriterThrower = component$(() => (
  <SSRStream>
    {async (stream) => {
      stream.write(<div id="chunk">chunk</div>);
      throw new Error('stream writer boom');
    }}
  </SSRStream>
));

describe('Catch + fallback$', () => {
  describe.each(modes)('%s', (mode, renderMode) => {
    it('projects children when there is no error', async () => {
      const { container } = await renderMode(() => (
        <Catch fallback$={fb()}>
          <div id="content">All good</div>
        </Catch>
      ));
      expect(container.element.querySelector('#content')).toBeTruthy();
      expect(container.element.querySelector('#fb')).toBeFalsy();
    });

    it('a recoverable error renders the fallback', async () => {
      const { container } = await renderMode(() => (
        <Catch fallback$={fb()}>
          <Thrower />
        </Catch>
      ));
      expect(container.element.querySelector('#fb')?.textContent).toContain('caught: boom');
    });

    it('a thrown non-Error class instance is caught', async () => {
      const { container } = await renderMode(() => (
        <Catch fallback$={fb()}>
          <NonSerializableThrower />
        </Catch>
      ));
      expect(container.element.querySelector('#fb')?.textContent).toContain(
        'caught: non-serializable boom'
      );
    });

    it('two throwing children in one boundary render a single fallback (first error wins)', async () => {
      const { container } = await renderMode(() => (
        <Catch fallback$={fb()}>
          <Thrower message="boomA" />
          <Thrower message="boomB" />
        </Catch>
      ));
      expect(fbCount(container.element)).toBe(1);
      if (mode === 'CSR') {
        expect(container.element.querySelector('#fb')?.textContent).toContain('caught: boomA');
      }
    });

    it('a render throw is caught by the NEAREST boundary', async () => {
      const { container } = await renderMode(() => (
        <Catch
          fallback$={$(() => (
            <p id="fb-outer">outer</p>
          ))}
        >
          <div id="content">ok</div>
          <Catch
            fallback$={$(() => (
              <p id="fb-inner">inner</p>
            ))}
          >
            <Thrower />
          </Catch>
        </Catch>
      ));
      const el = container.element;
      expect(el.querySelector('#fb-inner')).toBeTruthy();
      expect(el.querySelector('#fb-outer')).toBeFalsy();
      expect(el.querySelector('#content')).toBeTruthy();
    });

    it('nested boundaries: when the outer also throws it supersedes the inner fallback', async () => {
      const { container } = await renderMode(() => (
        <Catch
          fallback$={$(() => (
            <p id="fb-outer">outer</p>
          ))}
        >
          <Catch
            fallback$={$(() => (
              <p id="fb-inner">inner</p>
            ))}
          >
            <Thrower message="boomA" />
          </Catch>
          <Thrower message="boomB" />
        </Catch>
      ));
      const el = container.element;
      expect(el.querySelector('#fb-outer')).toBeTruthy();
      if (mode === 'CSR') {
        expect(el.querySelector('#fb-inner')).toBeFalsy();
      } else {
        const contentHost = el.querySelector('[q\\:cc]') as HTMLElement;
        expect(contentHost.style.display).toBe('none');
        expect(contentHost.contains(el.querySelector('#fb-inner'))).toBe(true);
        const state = el.querySelector('script[type="qwik/state"]')!;
        const rootCount = (JSON.parse(state.textContent!) as unknown[]).length / 2;
        for (let i = 0; i < rootCount; i++) {
          container.$getObjectById$(i);
        }
      }
    });

    it('two adjacent boundaries that both throw each show their own fallback', async () => {
      const { container } = await renderMode(() => (
        <main>
          <Catch
            fallback$={$(() => (
              <p id="fb-a">A</p>
            ))}
          >
            <Thrower message="boomA" />
          </Catch>
          <Catch
            fallback$={$(() => (
              <p id="fb-b">B</p>
            ))}
          >
            <Thrower message="boomB" />
          </Catch>
        </main>
      ));
      expect(container.element.querySelector('#fb-a')).toBeTruthy();
      expect(container.element.querySelector('#fb-b')).toBeTruthy();
    });

    it('a throwing inner fallback escalates to the outer boundary', async () => {
      const { container } = await renderMode(() => <NestedEscalation />);
      await waitForDrain(container).catch(() => {});
      const el = container.element;
      expect(el.querySelector('#fb-outer')?.textContent).toBe('outer');
      expect(el.querySelector('#fb-inner')).toBeFalsy();
      expect(el.ownerDocument.querySelector('[role="alert"]')).toBeFalsy();
    });
  });

  describe('SSR only', () => {
    describe('safety net: an in-order SSR throw with no boundary above', () => {
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
              <AsyncThrower />
            </main>,
            { debug }
          )
        ).rejects.toThrow('async boom');
      });
    });

    const NormalErrorThrower = component$((): JSXOutput => {
      throw new Error('normal boom');
    });

    it('a normal Error throw is unchanged (still renders its fallback)', async () => {
      const { container } = await ssrRenderToDom(
        <Catch
          fallback$={$((e: Error) => (
            <p id="fb">caught: {e.message}</p>
          ))}
        >
          <NormalErrorThrower />
        </Catch>,
        { debug }
      );
      expect(container.element.querySelector('#fb')?.textContent).toContain('caught: normal boom');
    });

    const UndefinedThrower = component$((): JSXOutput => {
      throw undefined;
    });

    it('a throw of undefined during SSR render reveals the fallback', async () => {
      const { container } = await ssrRenderToDom(
        <Catch fallback$={fb()}>
          <UndefinedThrower />
        </Catch>,
        { debug }
      );
      expect(container.element.querySelector('#fb')).toBeTruthy();
    });

    it('a non-recoverable build error is NOT hidden in the fallback (it surfaces)', async () => {
      await expect(
        ssrRenderToDom(
          <Catch fallback$={fb()}>
            <PluginThrower />
          </Catch>,
          { debug }
        )
      ).rejects.toThrow('build boom');
    });
  });

  describe('CSR only', () => {
    describe('last-resort fallback', () => {
      it('renders a built-in role="alert" node when the fallback$ chunk fails to load', async () => {
        const failingFallback = qrl(
          () => Promise.reject(new Error('chunk load failure')),
          'fb'
        ) as any;
        const { container } = await domRender(
          <Catch fallback$={failingFallback}>
            <Thrower />
          </Catch>,
          { debug }
        );
        await waitForDrain(container).catch(() => {});
        const el = container.element;
        const alert = el.querySelector('[role="alert"]');
        expect(alert).toBeTruthy();
        expect(alert?.textContent).toContain('Something went wrong');
      });

      it('a failing fallback$ chunk with an outer boundary still renders the last-resort locally', async () => {
        const failingFallback = qrl(
          () => Promise.reject(new Error('chunk load failure')),
          'fb'
        ) as any;
        const { container } = await domRender(
          <Catch
            fallback$={$(() => (
              <p id="fb-outer">outer</p>
            ))}
          >
            <Catch fallback$={failingFallback}>
              <Thrower />
            </Catch>
          </Catch>,
          { debug }
        );
        await waitForDrain(container).catch(() => {});
        const el = container.element;
        const alert = el.querySelector('[role="alert"]');
        expect(alert?.textContent).toContain('Something went wrong');
        expect(el.querySelector('#fb-outer')).toBeFalsy();
      });
    });

    it('safety net: a render throw with no enclosing boundary surfaces the ORIGINAL error to logError', async () => {
      const original = new Error('unbounded boom');
      const UnboundedThrower = component$((): JSXOutput => {
        throw original;
      });
      const throwAsyncSpy = vi
        .spyOn(logUtils, 'logErrorAndThrowAsync')
        .mockImplementation((message?: any) => message as Error);
      try {
        const { container } = await domRender(
          <main>
            <UnboundedThrower />
          </main>,
          { debug }
        );
        await waitForDrain(container).catch(() => {});
        expect(throwAsyncSpy).toHaveBeenCalledTimes(1);
        expect(throwAsyncSpy).toHaveBeenCalledWith(original);
      } finally {
        throwAsyncSpy.mockRestore();
      }
    });
  });

  describe('hostile thrown values', () => {
    it('SSR: a component throwing a revoked Proxy still renders the fallback', async () => {
      const HostileThrower = component$((): JSXOutput => {
        const { proxy, revoke } = Proxy.revocable({}, {});
        revoke();
        throw proxy;
      });
      const { container } = await ssrRenderToDom(
        <Catch fallback$={fb()}>
          <HostileThrower />
        </Catch>,
        { debug }
      );
      expect(container.element.querySelector('#fb')).toBeTruthy();
    });

    it('CSR: an event handler throwing a revoked Proxy still renders the fallback', async () => {
      const HostileClicker = component$(() => (
        <button
          onClick$={() => {
            const { proxy, revoke } = Proxy.revocable({}, {});
            revoke();
            throw proxy;
          }}
        >
          go
        </button>
      ));
      const { container } = await domRender(
        <Catch fallback$={fb()}>
          <HostileClicker />
        </Catch>,
        { debug }
      );
      await trigger(container.element, 'button', 'click');
      expect(container.element.querySelector('#fb')).toBeTruthy();
    });
  });

  describe('SSR delivery & teardown', () => {
    describe('in-place swap (qErr)', () => {
      it('happy path (default streaming): renders the content unchanged and ships no swap JS', async () => {
        const { html, document } = await streamAndResume(
          <main>
            <Catch fallback$={fb()}>
              <div id="content">all good</div>
            </Catch>
          </main>
        );
        expect(document.querySelector('#content')?.textContent).toBe('all good');
        expect(document.querySelector('#fb')).toBeFalsy();
        expect(html).not.toContain('qErr(');
        expect(html).not.toMatch(/qO\(|qInstallOOOS/);
      });

      it('sync throw (default streaming): content-host hidden, fallback in the sibling host via qErr', async () => {
        const { html, document } = await streamAndResume(
          <main>
            <Catch fallback$={fb()}>
              <div id="before">before</div>
              <Thrower />
              <div id="after">after</div>
            </Catch>
          </main>
        );
        const contentHost = document.querySelector('[q\\:cc]') as HTMLElement | null;
        const fallbackHost = document.querySelector('[q\\:cf]') as HTMLElement | null;
        const fbEl = document.querySelector('#fb');
        expect(fbEl?.textContent).toContain('caught: boom');
        expect(displayOf(contentHost)).toBe('none');
        expect(displayOf(fallbackHost)).toBe('contents');
        expect(fallbackHost?.contains(fbEl)).toBe(true);
        expect(contentHost?.contains(document.querySelector('#before'))).toBe(true);
        expect(contentHost?.contains(fallbackHost)).toBe(false);
        expect(html).toContain('qErr(');
        expect(html).not.toMatch(/qO\(/);
      });

      it('siblings OUTSIDE the boundary that streamed before the throw remain visible', async () => {
        const { container } = await ssrRenderToDom(
          <main>
            <div id="outside-before">outside-before</div>
            <Catch fallback$={fb()}>
              <Thrower />
            </Catch>
            <div id="outside-after">outside-after</div>
          </main>,
          { debug, ...IN_ORDER }
        );
        const el = container.element;
        expect(el.querySelector('#fb')?.textContent).toContain('caught: boom');
        const outsideBefore = el.querySelector('#outside-before');
        const outsideAfter = el.querySelector('#outside-after');
        expect(outsideBefore?.textContent).toBe('outside-before');
        expect(outsideAfter?.textContent).toBe('outside-after');
        const contentHost = el.querySelector('[q\\:cc]') as HTMLElement;
        expect(contentHost.contains(outsideBefore)).toBe(false);
        expect(contentHost.contains(outsideAfter)).toBe(false);
      });

      it('awaited-async throw: fallback delivered in document order (sibling host)', async () => {
        const { container } = await ssrRenderToDom(
          <main>
            <Catch fallback$={fb()}>
              <div id="before">before</div>
              <AsyncThrower />
            </Catch>
          </main>,
          { debug, ...IN_ORDER }
        );
        const el = container.element;
        const contentHost = el.querySelector('[q\\:cc]') as HTMLElement;
        const fallbackHost = el.querySelector('[q\\:cf]') as HTMLElement;
        const fbEl = el.querySelector('#fb');
        expect(fbEl?.textContent).toContain('caught: async boom');
        expect(contentHost.style.display).toBe('none');
        expect(fallbackHost.style.display).toBe('contents');
        expect(fallbackHost.contains(fbEl)).toBe(true);
        expect(contentHost.contains(fbEl)).toBe(false);
        expect(el.outerHTML).toContain('qErr(');
      });

      it('a throw deep inside nested tags yields well-formed HTML (hideable content-host)', async () => {
        const { container } = await ssrRenderToDom(
          <main>
            <Catch fallback$={fb()}>
              <div id="lvl1">
                <section id="lvl2">
                  <article id="lvl3">
                    <Thrower />
                  </article>
                </section>
              </div>
            </Catch>
          </main>,
          { debug, ...IN_ORDER }
        );
        const el = container.element;
        const contentHost = el.querySelector('[q\\:cc]') as HTMLElement;
        expect(el.querySelector('#fb')?.textContent).toContain('caught: boom');
        expect(contentHost.style.display).toBe('none');
        expect(contentHost.querySelector('#lvl1 #lvl2 #lvl3')).toBeTruthy();
      });

      it('the qErr executor installs independently of OOOS (no qO on the page)', async () => {
        const chunks: string[] = [];
        await ssrRenderToDom(
          <main>
            <Catch
              fallback$={$(() => (
                <p id="fb">fallback</p>
              ))}
            >
              <Thrower />
            </Catch>
          </main>,
          {
            debug,
            stream: { write: (c: string) => void chunks.push(c) },
            ...IN_ORDER,
          }
        );
        const html = chunks.join('');
        expect(html).toContain('qErr(');
        expect(html).toContain('qInstallErrorSwap');
        expect(html).not.toMatch(/qInstallOOOS|qO\(/);
      });

      it('a thrown falsy value (0) swaps in the fallback via qErr (default streaming)', async () => {
        const FalsyThrower = component$((): JSXOutput => {
          throw 0;
        });
        const { html, document } = await streamAndResume(
          <main>
            <Catch fallback$={fb()}>
              <FalsyThrower />
            </Catch>
          </main>
        );
        expect(document.querySelector('#fb')?.textContent).toContain('caught: 0');
        expect(html).toContain('qErr(');
        expect(html).not.toMatch(/qO\(/);
      });

      describe('under explicit out-of-order streaming', () => {
        it('escalates to the outer boundary in place via qErr', async () => {
          const { html, document } = await streamAndResume(<NestedEscalation />, OOOS);
          expect(document.querySelector('#fb-outer')?.textContent).toBe('outer');
          expect(displayOf(document.querySelector('[q\\:cc]'))).toBe('none');
          expect(document.querySelector('#fb-outer')?.closest('[q\\:cf]')).toBeTruthy();
          expect(html).toContain('qErr(');
        });

        it('nested boundaries: the inner one tears down in place via qErr, the outer subtree stays visible', async () => {
          const { html, document } = await streamAndResume(
            <main>
              <Catch
                fallback$={$(() => (
                  <p id="fb-outer">outer</p>
                ))}
              >
                <div id="outer-sibling">outer-sibling</div>
                <Catch
                  fallback$={$(() => (
                    <p id="fb-inner">inner</p>
                  ))}
                >
                  <div id="before">before</div>
                  <Thrower />
                  <div id="after">after</div>
                </Catch>
              </Catch>
            </main>,
            OOOS
          );
          expect(document.querySelector('#fb-inner')).toBeTruthy();
          expect(document.querySelector('#fb-outer')).toBeFalsy();
          expect(document.querySelector('#outer-sibling')).toBeTruthy();
          expect(displayOf(document.querySelector('#before')?.closest('[q\\:cc]'))).toBe('none');
          expect(displayOf(document.querySelector('#outer-sibling')?.closest('[q\\:cc]'))).toBe(
            'contents'
          );
          expect(document.querySelector('#fb-inner')?.closest('[q\\:cf]')).toBeTruthy();
          expect(html).toContain('qErr(');
        });

        it('sibling boundaries swap independently in place via qErr', async () => {
          const { html, document } = await streamAndResume(
            <main>
              <Catch
                fallback$={$(() => (
                  <p id="fb-a">A failed</p>
                ))}
              >
                <Thrower />
              </Catch>
              <Catch
                fallback$={$(() => (
                  <p id="fb-b">B failed</p>
                ))}
              >
                <div id="ok-b">b ok</div>
              </Catch>
            </main>,
            OOOS
          );
          expect(document.querySelector('#fb-a')).toBeTruthy();
          expect(document.querySelector('#ok-b')?.textContent).toBe('b ok');
          expect(document.querySelector('#fb-b')).toBeFalsy();
          expect(displayOf(document.querySelector('#fb-a')?.closest('[q\\:cf]'))).toBe('contents');
          expect(displayOf(document.querySelector('#ok-b')?.closest('[q\\:cc]'))).toBe('contents');
          expect(html).toContain('qErr(');
        });

        it.each([
          { kind: 'an async component that rejects', Cmp: AsyncRejector, message: 'async boom' },
          { kind: 'a rejected promise child', Cmp: AsyncThrower, message: 'async boom' },
          {
            kind: 'an async signal that rejects',
            Cmp: AsyncSignalThrower,
            message: 'async signal boom',
          },
        ])(
          '$kind (no <Pending>) swaps in place via qErr under out-of-order streaming',
          async ({ Cmp, message }) => {
            const { html, document } = await streamAndResume(
              <main>
                <Catch fallback$={fb()}>
                  <div id="before">before</div>
                  <Cmp />
                </Catch>
              </main>,
              OOOS
            );
            const fbEl = document.querySelector('#fb');
            expect(fbEl?.textContent).toContain(`caught: ${message}`);
            expect(fbEl?.closest('[q\\:cf]')).toBeTruthy();
            expect(fbEl?.closest('[q\\:rp]')).toBeFalsy();
            expect(displayOf(document.querySelector('#before')?.closest('[q\\:cc]'))).toBe('none');
            expect(html).toContain('qErr(');
            expect(html).not.toMatch(/qO\(/);
          }
        );

        it('a fallback whose own render throws aborts the stream instead of deadlocking', async () => {
          await expect(
            streamAndResume(
              <main>
                <Catch
                  fallback$={$(() => (
                    <Thrower message="fallback boom" />
                  ))}
                >
                  <Thrower />
                </Catch>
              </main>,
              OOOS
            )
          ).rejects.toThrow('fallback boom');
        });

        it('a sync throw in a boundary that is a SIBLING of a real Pending segment still swaps in place via qErr', async () => {
          const SlowResolver = component$(() => {
            const pending = delay(5).then(() => <span id="deferred-ok">deferred ok</span>) as any;
            return <>{pending}</>;
          });
          const { html, document } = await streamAndResume(
            <main>
              <Catch fallback$={fb()}>
                <div id="before">before</div>
                <Thrower />
              </Catch>
              <Pending fallback={<span id="skel">loading</span>}>
                <SlowResolver />
              </Pending>
            </main>,
            OOOS
          );
          const fbEl = document.querySelector('#fb');
          expect(fbEl?.textContent).toContain('caught: boom');
          expect(fbEl?.closest('[q\\:cf]')).toBeTruthy();
          expect(fbEl?.closest('[q\\:rp]')).toBeFalsy();
          expect(displayOf(document.querySelector('#before')?.closest('[q\\:cc]'))).toBe('none');
          expect(html).toContain('qErr(');
          expect(document.querySelector('#deferred-ok')?.textContent).toBe('deferred ok');
          expect(html).toContain('qO(');
        });
      });
    });

    describe('discards queued content after a catch', () => {
      it('a queued sibling component after the throw never executes and emits no HTML', async () => {
        const executed: string[] = [];
        const AfterSibling = component$(() => {
          executed.push('after');
          return <div id="after-cmp">after</div>;
        });
        const { container } = await ssrRenderToDom(
          <Catch fallback$={fb()}>
            <div id="before">before</div>
            <Thrower />
            <AfterSibling />
            <div id="after-static">after-static</div>
          </Catch>,
          { debug, ...IN_ORDER }
        );
        const el = container.element;
        expect(el.querySelector('#fb')?.textContent).toContain('caught: boom');
        expect(executed).toEqual([]);
        expect(el.querySelector('#after-cmp')).toBeFalsy();
        expect(el.querySelector('#after-static')).toBeFalsy();
        expect(el.querySelector('#before')).toBeTruthy();
      });

      it('a never-settling promise sibling after the throw does not block SSR', async () => {
        const neverSettles = new Promise<JSXOutput>(() => {});
        const { container } = await ssrRenderToDom(
          <Catch fallback$={fb()}>
            <Thrower />
            {neverSettles}
          </Catch>,
          { debug, ...IN_ORDER }
        );
        expect(container.element.querySelector('#fb')?.textContent).toContain('caught: boom');
      });

      it('a later-rejecting promise sibling after the throw is discarded but stays observed', async () => {
        let rejectLate!: (e: unknown) => void;
        const late = new Promise<JSXOutput>((_, reject) => (rejectLate = reject));
        const { container } = await ssrRenderToDom(
          <Catch fallback$={fb()}>
            <Thrower />
            {late}
          </Catch>,
          { debug, ...IN_ORDER }
        );
        expect(container.element.querySelector('#fb')?.textContent).toContain('caught: boom');
        rejectLate(new Error('late boom'));
        await delay(5);
      });

      it('an inner-boundary catch discards only inner queued content', async () => {
        const { container } = await ssrRenderToDom(
          <Catch fallback$={fb('fb-outer')}>
            <div id="outer-before">outer-before</div>
            <Catch fallback$={fb('fb-inner')}>
              <Thrower />
              <div id="inner-after">inner-after</div>
            </Catch>
            <div id="outer-after">outer-after</div>
          </Catch>,
          { debug, ...IN_ORDER }
        );
        const el = container.element;
        expect(el.querySelector('#fb-inner')?.textContent).toContain('caught: boom');
        expect(el.querySelector('#fb-outer')).toBeFalsy();
        expect(el.querySelector('#inner-after')).toBeFalsy();
        expect(el.querySelector('#outer-after')).toBeTruthy();
      });

      it('a function child after the throw is not invoked', async () => {
        const invoked: string[] = [];
        const { container } = await ssrRenderToDom(
          <Catch fallback$={fb()}>
            <Thrower />
            {
              (() => {
                invoked.push('fn-child');
                return null;
              }) as any
            }
          </Catch>,
          { debug, ...IN_ORDER }
        );
        expect(container.element.querySelector('#fb')?.textContent).toContain('caught: boom');
        expect(invoked).toEqual([]);
      });
    });

    describe('out-of-order streaming (Pending)', () => {
      it('out-of-order is the default: a bare Pending render emits the qO executor; IN_ORDER opts out', async () => {
        const DeferredOk = component$(() => {
          const pending = delay(1).then(() => <span id="late">late</span>) as Promise<JSXOutput>;
          return <>{pending}</>;
        });
        const tree = () => (
          <main>
            <Pending fallback={<span id="skel">loading</span>}>
              <DeferredOk />
            </Pending>
          </main>
        );
        const bare = await streamAndResume(tree());
        expect(bare.html).toContain('qO(');
        const inOrder = await streamAndResume(tree(), IN_ORDER);
        expect(inOrder.html).not.toContain('qO(');
      });

      it('two adjacent boundaries that both throw each swap in their own fallback', async () => {
        const { document } = await streamAndResume(
          <main>
            <Pending fallback={<span id="skel">loading</span>}>
              <Catch
                fallback$={$(() => (
                  <p id="fb-a">A</p>
                ))}
              >
                <Thrower message="boomA" />
              </Catch>
            </Pending>
            <Pending fallback={<span id="skel">loading</span>}>
              <Catch
                fallback$={$(() => (
                  <p id="fb-b">B</p>
                ))}
              >
                <Thrower message="boomB" />
              </Catch>
            </Pending>
          </main>,
          OOOS
        );
        expect(document.querySelector('#fb-a')).toBeTruthy();
        expect(document.querySelector('#fb-b')).toBeTruthy();
      });

      it('two boundaries inside one Pending each show their own fallback', async () => {
        const { document } = await streamAndResume(
          <main>
            <Pending fallback={<span id="skel">loading</span>}>
              <Catch
                fallback$={$(() => (
                  <p id="fb-a">A</p>
                ))}
              >
                <Thrower message="boomA" />
              </Catch>
              <Catch
                fallback$={$(() => (
                  <p id="fb-b">B</p>
                ))}
              >
                <Thrower message="boomB" />
              </Catch>
            </Pending>
          </main>,
          OOOS
        );
        expect(document.querySelector('#fb-a')).toBeTruthy();
        expect(document.querySelector('#fb-b')).toBeTruthy();
      });

      it('a deferred (async) throw inside a child <Pending> tears down the WHOLE boundary', async () => {
        const { html, document } = await streamAndResume(
          <main>
            <Catch fallback$={fb()}>
              <div id="sibling">sibling</div>
              <Pending fallback={<span id="skel">loading</span>}>
                <AsyncThrower />
              </Pending>
            </Catch>
          </main>,
          OOOS
        );
        expect(html).toContain('id="sibling"');
        expect(document.querySelector('#fb')?.textContent).toContain('caught: async boom');
        expect(displayOf(document.querySelector('#fb')?.closest('[q\\:rp]'))).toBe('contents');
        expect(displayOf(document.querySelector('#sibling')?.closest('div[style]'))).toBe('none');
      });

      it.each([
        ['in-order', IN_ORDER],
        ['out-of-order', OOOS],
      ])(
        '%s: a sync throw inside a <Pending> reports to onError$ exactly once',
        async (_m, opts) => {
          const fires: string[] = [];
          await ssrRenderToDom(
            <main>
              <Catch
                fallback$={fb()}
                onError$={$((e: any) => {
                  fires.push(e.message);
                })}
              >
                <Pending fallback={<span id="skel">loading</span>}>
                  <Thrower />
                </Pending>
              </Catch>
            </main>,
            { debug, ...opts }
          );

          expect(fires).toEqual(['boom']);
        }
      );

      it('a sync throw inside a <Pending> boundary swaps within the segment', async () => {
        const { document } = await streamAndResume(
          <main>
            <Pending fallback={<span id="loading">loading</span>}>
              <Catch fallback$={fb()}>
                <div id="before">before</div>
                <Thrower />
                <div id="after">after</div>
              </Catch>
            </Pending>
          </main>,
          OOOS
        );
        expect(document.querySelector('#fb')?.textContent).toContain('caught: boom');
        const contentHost = document.querySelector('[q\\:cc]');
        expect(contentHost?.querySelector('#before')).toBeTruthy();
        expect(displayOf(contentHost)).toBe('none');
      });

      it('boundary inside a <Pending>: an async throw swaps out the WHOLE content', async () => {
        const { document } = await streamAndResume(
          <main>
            <Pending fallback={<span id="loading">loading</span>}>
              <Catch fallback$={fb()}>
                <div id="before">before</div>
                <AsyncThrower />
                <div id="after">after</div>
              </Catch>
            </Pending>
          </main>,
          OOOS
        );
        expect(document.querySelector('#fb')?.textContent).toContain('caught: async boom');
        const contentHost = document.querySelector('[q\\:cc]');
        expect(contentHost?.querySelector('#before')).toBeTruthy();
        expect(displayOf(contentHost)).toBe('none');
      });

      it('Catch-outer › Pending › Catch-inner › throw → Catch-inner catches, Catch-outer untouched', async () => {
        const { document } = await streamAndResume(
          <main>
            <Catch
              fallback$={$(() => (
                <p id="fb-outer">outer</p>
              ))}
            >
              <div id="outer-ok">outer-ok</div>
              <Pending fallback={<span id="skel">loading</span>}>
                <Catch fallback$={fb('fb-inner')}>
                  <Thrower />
                </Catch>
              </Pending>
            </Catch>
          </main>,
          OOOS
        );
        expect(document.querySelector('#fb-inner')?.textContent).toContain('caught: boom');
        expect(document.querySelector('#fb-outer')).toBeFalsy();
        expect(document.querySelector('#outer-ok')?.textContent).toBe('outer-ok');
      });

      it('Catch-outer › Pending-A › Catch-mid › Pending-B › throw → Catch-mid catches, Catch-outer untouched', async () => {
        const { document } = await streamAndResume(
          <main>
            <Catch
              fallback$={$(() => (
                <p id="fb-outer">outer</p>
              ))}
            >
              <div id="outer-ok">outer-ok</div>
              <Pending fallback={<span id="skel-a">a</span>}>
                <Catch fallback$={fb('fb-mid')}>
                  <div id="mid-ok">mid-ok</div>
                  <Pending fallback={<span id="skel-b">b</span>}>
                    <Thrower />
                  </Pending>
                </Catch>
              </Pending>
            </Catch>
          </main>,
          OOOS
        );
        expect(document.querySelector('#fb-mid')?.textContent).toContain('caught: boom');
        expect(document.querySelector('#fb-outer')).toBeFalsy();
        expect(document.querySelector('#outer-ok')?.textContent).toBe('outer-ok');
      });

      it('two sibling <Pending> that both reject tear the boundary down exactly once', async () => {
        const { document } = await streamAndResume(
          <main>
            <Catch fallback$={fb()}>
              <div id="sibling">sibling</div>
              <Pending fallback={<span id="skel-a">loading a</span>}>
                <AsyncThrower />
              </Pending>
              <Pending fallback={<span id="skel-b">loading b</span>}>
                <AsyncThrower />
              </Pending>
            </Catch>
          </main>,
          OOOS
        );

        const fallbacks = document.querySelectorAll('#fb');
        expect(fallbacks.length).toBe(1);
        expect(fallbacks[0]?.textContent).toContain('caught: async boom');
        expect(displayOf(document.querySelector('#fb')?.closest('[q\\:rp]'))).toBe('contents');
        expect(displayOf(document.querySelector('#sibling')?.closest('div[style]'))).toBe('none');
      });

      it('an in-place throw beside a deferred <Pending> swaps via qErr and absorbs the late rejection', async () => {
        const SlowRejector = component$(() => {
          const pending = delay(5).then(() => Promise.reject(new Error('late boom'))) as any;
          return <>{pending}</>;
        });
        const { html, document } = await streamAndResume(
          <main>
            <Catch fallback$={fb()}>
              <Thrower />
              <Pending fallback={<span id="skel">loading</span>}>
                <SlowRejector />
              </Pending>
            </Catch>
          </main>,
          OOOS
        );
        expect(fbCount(document)).toBe(1);
        expect(document.querySelector('#fb')?.textContent).toContain('caught: boom');
        expect(document.querySelector('#fb')?.closest('[q\\:cf]')).toBeTruthy();
        expect(html).toContain('qErr(');
      });

      it('onError$ fires once for an SSR-caught throw (out-of-order) and not again on resume', async () => {
        onErrorLog.errors = [];
        await ssrRenderToDom(
          <Catch
            fallback$={fb()}
            onError$={$((e: any) => {
              onErrorLog.errors.push(e instanceof Error ? e.message : e);
            })}
          >
            <Thrower />
          </Catch>,
          { debug, ...OOOS }
        );
        await getTestPlatform().flush();
        await delay(0);
        expect(onErrorLog.errors).toEqual(['boom']);
      });
    });

    describe('late-delivered fallback', () => {
      // Boundary OUTSIDE a <Pending> whose child rejects late: the catch rethrows
      // into the segment and $emitFallback$ streams the fallback afterwards.
      const LateRejector = component$((): JSXOutput => {
        const pending = delay(5).then(() =>
          Promise.reject(new Error('late boom'))
        ) as Promise<JSXOutput>;
        return <>{pending}</>;
      });

      it('a throw arriving after the segment deferred still swaps in the fallback', async () => {
        const { container } = await ssrRenderToDom(
          <main>
            <Catch fallback$={fb()}>
              <Pending fallback={<span id="skel">loading</span>}>
                <LateRejector />
              </Pending>
            </Catch>
          </main>,
          { debug, ...OOOS }
        );
        const el = container.element;
        emulateExecutionOfStreamingOutOfOrderScripts(el.ownerDocument);
        expect(el.querySelector('#fb')?.textContent).toContain('caught: late boom');
      });

      // https://github.com/QwikDev/qwik/issues/8885
      it.skip('late delivery: a bound attribute in the errored content stops tracking after resume', async () => {
        const Bound = component$<{ src: Signal<string> }>((props) => (
          <img id="dead-img" src={props.src.value} />
        ));
        const App = component$(() => {
          const src = useSignal('/first.png');
          return (
            <main>
              <button id="bump" onClick$={() => (src.value = '/second.png')}>
                bump
              </button>
              <Catch fallback$={fb()}>
                <Bound src={src} />
                <Pending fallback={<span id="skel">loading</span>}>
                  <LateRejector />
                </Pending>
              </Catch>
            </main>
          );
        });
        const { container } = await ssrRenderToDom(<App />, { debug, ...OOOS });
        const el = container.element;
        emulateExecutionOfStreamingOutOfOrderScripts(el.ownerDocument);
        expect(el.querySelector('#dead-img')?.getAttribute('src')).toBe('/first.png');

        await trigger(el, '#bump', 'click');

        expect(el.querySelector('#dead-img')?.getAttribute('src')).toBe('/first.png');
      });

      it('late delivery: a document-ready visible task in the errored content does not throw on resume', async () => {
        const logErrorSpy = vi
          .spyOn(logUtils, 'logError')
          .mockImplementation((message?: any) => message as Error);
        const DeadTask = component$(() => {
          useVisibleTask$(
            () => {
              // ignore
            },
            { strategy: 'document-ready' }
          );
          return <div id="dead-task">dead</div>;
        });
        const { container } = await ssrRenderToDom(
          <main>
            <Catch fallback$={fb()}>
              <DeadTask />
              <Pending fallback={<span id="skel">loading</span>}>
                <LateRejector />
              </Pending>
            </Catch>
          </main>,
          { debug, ...OOOS }
        );
        const el = container.element;
        emulateExecutionOfStreamingOutOfOrderScripts(el.ownerDocument);
        expect(el.querySelector('#fb')?.textContent).toContain('caught: late boom');

        await expect(trigger(el, null, 'd:qinit')).resolves.not.toThrow();
        expect(logErrorSpy).not.toHaveBeenCalled();
        logErrorSpy.mockRestore();
      });

      it('transformError projects the late-streamed fallback; the raw message never reaches the HTML', async () => {
        const SecretLateRejector = component$((): JSXOutput => {
          const pending = delay(5).then(() =>
            Promise.reject(new Error('SECRET-late-detail'))
          ) as Promise<JSXOutput>;
          return <>{pending}</>;
        });
        const { html, document } = await streamAndResume(
          <main>
            <Catch fallback$={fb()}>
              <Pending fallback={<span id="skel">loading</span>}>
                <SecretLateRejector />
              </Pending>
            </Catch>
          </main>,
          { ...OOOS, transformError: () => new Error('redacted-by-app') }
        );
        expect(document.querySelector('#fb')?.textContent).toContain('redacted-by-app');
        expect(html).not.toContain('SECRET-late-detail');
      });
    });

    describe('stateless wire', () => {
      const WireSecretThrower = component$((): JSXOutput => {
        throw new Error('wire-secret-boom');
      });

      it('an SSR-errored boundary serializes neither the error nor its message', async () => {
        const { html, document } = await streamAndResume(
          <main>
            <Catch
              fallback$={$(() => (
                <p id="fb">static fallback</p>
              ))}
            >
              <WireSecretThrower />
            </Catch>
          </main>
        );
        expect(document.querySelector('#fb')).toBeTruthy();
        expect(html).not.toContain('wire-secret-boom');
      });

      it('the boundary store serializes only boundaryId, and no error key', async () => {
        const { container } = await ssrRenderToDom(
          <main>
            <Catch fallback$={fb()}>
              <Thrower />
            </Catch>
          </main>,
          { debug }
        );
        const el = container.element;
        const state = el.querySelector('script[type="qwik/state"]')!;
        const rootCount = (JSON.parse(state.textContent!) as unknown[]).length / 2;
        let store: Record<string, unknown> | undefined;
        for (let i = 0; i < rootCount; i++) {
          const root = container.$getObjectById$(i);
          if (
            root &&
            typeof root === 'object' &&
            'boundaryId' in root &&
            'error' in root === false
          ) {
            store = root as Record<string, unknown>;
          }
        }
        expect(store).toBeDefined();
        expect('error' in store!).toBe(false);
        expect(Object.keys(store!)).toEqual(['boundaryId']);
      });
    });
  });

  describe('after resume', () => {
    it('an SSR inner error, then a client throw to the OUTER boundary, replaces the whole subtree', async () => {
      const { container } = await ssrRenderToDom(
        <main>
          <Catch
            fallback$={$((e: any) => (
              <p id="fb-outer">outer: {e.message}</p>
            ))}
          >
            <button id="outer-btn">x</button>
            <Catch
              fallback$={$((e: any) => (
                <p id="fb-inner">inner: {e.message}</p>
              ))}
            >
              <Thrower />
            </Catch>
          </Catch>
        </main>,
        { debug, ...OOOS }
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

    describe('two-host collapse', () => {
      it.each(streamingModes)(
        '%s: a client error collapses the two-host boundary cleanly (no Missing child)',
        async (_label, streamingOpts) => {
          const { container } = await ssrRenderToDom(
            <main>
              <Catch fallback$={fb()}>
                <button id="target">x</button>
                <div id="content">content ok</div>
              </Catch>
            </main>,
            { debug, ...streamingOpts }
          );
          const el = container.element;
          expect(el.querySelector('#content')?.textContent).toBe('content ok');
          expect(el.querySelector('#fb')).toBeFalsy();

          const target = el.querySelector('#target')!;
          dispatchQError(target, { error: new Error('client boom'), element: target });
          await waitForDrain(container);

          expect(el.querySelectorAll('#fb').length).toBe(1);
          expect(el.querySelector('#fb')?.textContent).toContain('caught: client boom');
          expect(el.querySelector('#content')).toBeFalsy();
          expect(el.querySelector('[q\\:cc]')).toBeFalsy();
          expect(el.querySelector('[q\\:cf]')).toBeFalsy();
        }
      );
    });

    describe('inert subtree', () => {
      it('a bound attribute in the errored content stops tracking after resume', async () => {
        const Bound = component$<{ src: Signal<string> }>((props) => (
          <img id="dead-img" src={props.src.value} />
        ));
        const App = component$(() => {
          const src = useSignal('/first.png');
          return (
            <main>
              <button id="bump" onClick$={() => (src.value = '/second.png')}>
                bump
              </button>
              <Catch fallback$={fb()}>
                <Bound src={src} />
                <Thrower />
              </Catch>
            </main>
          );
        });
        const { container } = await ssrRenderToDom(<App />, { debug });
        const el = container.element;
        expect(el.querySelector('#dead-img')?.getAttribute('src')).toBe('/first.png');

        await trigger(el, '#bump', 'click');

        expect(el.querySelector('#dead-img')?.getAttribute('src')).toBe('/first.png');
      });

      it('a document-ready visible task in the errored content does not throw on resume', async () => {
        const logErrorSpy = vi
          .spyOn(logUtils, 'logError')
          .mockImplementation((message?: any) => message as Error);
        const DeadTask = component$(() => {
          useVisibleTask$(
            () => {
              // ignore
            },
            { strategy: 'document-ready' }
          );
          return <div id="dead-task">dead</div>;
        });
        const { container } = await ssrRenderToDom(
          <main>
            <Catch fallback$={fb()}>
              <DeadTask />
              <Thrower />
            </Catch>
          </main>,
          { debug }
        );

        await expect(trigger(container.element, null, 'd:qinit')).resolves.not.toThrow();
        expect(logErrorSpy).not.toHaveBeenCalled();
        logErrorSpy.mockRestore();
      });
    });

    describe('re-derivation', () => {
      const HealedThrower = component$((): JSXOutput => {
        if (isServerPlatform()) {
          throw new Error('ssr-only boom');
        }
        return <span id="healed">healed</span>;
      });

      it('an SSR-errored boundary resumes with its owner component still re-renderable', async () => {
        const App = withRerenderOwner(<Thrower message="owner retention boom" />);
        const { container } = await ssrRenderToDom(<App />, { debug });
        const el = container.element;
        expect(el.querySelector('#fb')?.textContent).toContain('caught: owner retention boom');

        await rerenderComponent(el.querySelector('#owner-anchor') as HTMLElement);
        await waitForDrain(container);

        expect(el.querySelector('#owner-anchor')).toBeTruthy();
        expect(el.querySelector('#fb')?.textContent).toContain('caught: owner retention boom');
      });

      it('re-rendering an SSR-errored boundary auto-recovers when the child no longer throws', async () => {
        const App = withRerenderOwner(<HealedThrower />);
        const { container } = await ssrRenderToDom(<App />, { debug });
        const el = container.element;
        expect(el.querySelector('#fb')).toBeTruthy();

        await rerenderComponent(el.querySelector('#owner-anchor') as HTMLElement);
        await waitForDrain(container);

        expect(el.querySelector('#healed')).toBeTruthy();
        expect(el.querySelector('#fb')).toBeFalsy();
      });

      it.each(streamingModes)(
        '%s: re-rendering an SSR-errored boundary re-runs the children and re-derives the fallback',
        async (_label, streamingOpts) => {
          const App = withRerenderOwner(
            <>
              <div id="content">content</div>
              <Thrower />
            </>
          );
          const { container } = await ssrRenderToDom(<App />, { debug, ...streamingOpts });
          const el = container.element;
          const contentHost = el.querySelector('[q\\:cc]') as HTMLElement;
          expect(el.querySelector('#fb')?.textContent).toContain('caught: boom');
          expect(contentHost.contains(el.querySelector('#content'))).toBe(true);

          await rerenderComponent(el.querySelector('#owner-anchor') as HTMLElement);
          await waitForDrain(container);

          expect(el.querySelector('#content')).toBeFalsy();
          expect(el.querySelector('#fb')?.textContent).toContain('caught: boom');
        }
      );

      it('re-rendering a sibling outside the boundary leaves the swapped content hidden', async () => {
        const Sibling = component$(() => <p id="outside">outside</p>);
        const { container } = await ssrRenderToDom(
          <main>
            <Sibling />
            <Catch fallback$={fb()}>
              <div id="content">content</div>
              <Thrower />
            </Catch>
          </main>,
          { debug }
        );
        const el = container.element;
        const contentHost = el.querySelector('[q\\:cc]') as HTMLElement;
        expect(contentHost.style.display).toBe('none');

        await rerenderComponent(el.querySelector('#outside') as HTMLElement);
        await waitForDrain(container);

        expect(contentHost.style.display).toBe('none');
        expect(el.querySelector('#fb')).toBeTruthy();
      });
    });
  });

  describe('integration', () => {
    describe('Slot projection', () => {
      describe.each(modes)('%s', (mode, renderMode) => {
        it('a render throw in projected content is caught by the boundary it is projected into', async () => {
          const { container } = await renderMode(() => (
            <Boxed>
              <Thrower />
            </Boxed>
          ));
          expect(container.element.querySelector('#fb')?.textContent).toContain('caught: boom');
        });

        it("two named slots: the throw is caught by its own slot's boundary, not the sibling", async () => {
          const { container } = await renderMode(() => (
            <TwoNamedSlots>
              <div q:slot="warning">
                <Thrower />
              </div>
            </TwoNamedSlots>
          ));
          const el = container.element;
          expect(el.querySelector('#fb-warning')?.textContent).toContain('caught: boom');
          expect(el.querySelector('#fb-danger')).toBeFalsy();
          expect(el.querySelector('#danger-host')).toBeTruthy();
        });

        it('only the fallback shows: the non-throwing sibling and the projected throw are neutralized', async () => {
          const { container } = await renderMode(() => (
            <BoxedWithSibling>
              <Thrower />
              <div id="projected-ok">projected ok</div>
            </BoxedWithSibling>
          ));
          const el = container.element;
          expect(el.querySelector('#fb')?.textContent).toContain('caught: boom');
          if (mode === 'CSR') {
            expect(el.querySelector('#sibling')).toBeFalsy();
            expect(el.querySelector('#projected-ok')).toBeFalsy();
          } else {
            const sibling = el.querySelector('#sibling');
            expect(sibling).toBeTruthy();
            const contentHost = el.querySelector('[q\\:cc]') as HTMLElement;
            expect(contentHost.style.display).toBe('none');
            expect(contentHost.contains(sibling)).toBe(true);
          }
        });
      });
    });

    describe('tasks', () => {
      describe.each(modes)('%s', (_mode, renderMode) => {
        it('a useTask$ throw is caught by the nearest parent <Catch>', async () => {
          const { container } = await renderMode(() => (
            <Catch fallback$={fb()}>
              <ThrowingTask />
            </Catch>
          ));
          await waitForDrain(container);

          const el = container.element;
          expect(el.querySelector('#fb')?.textContent).toContain('caught: task boom');
          expect(el.querySelector('#content')).toBeFalsy();
        });

        it('an async useTask$ throw is caught by the nearest <Catch>', async () => {
          const { container } = await renderMode(() => (
            <Catch fallback$={fb()}>
              <ThrowingTask async message="async task boom" />
            </Catch>
          ));
          await waitForDrain(container);

          const el = container.element;
          expect(el.querySelector('#fb')?.textContent).toContain('caught: async task boom');
          expect(el.querySelector('#content')).toBeFalsy();
        });

        it('a useTask$ throw is caught by the NEAREST parent of nested boundaries', async () => {
          const { container } = await renderMode(() => (
            <Catch
              fallback$={$(() => (
                <p id="fb-outer">outer</p>
              ))}
            >
              <div id="outer-ok">outer ok</div>
              <Catch
                fallback$={$(() => (
                  <p id="fb-inner">inner</p>
                ))}
              >
                <ThrowingTask />
              </Catch>
            </Catch>
          ));
          await waitForDrain(container);

          const el = container.element;
          expect(el.querySelector('#fb-inner')).toBeTruthy();
          expect(el.querySelector('#fb-outer')).toBeFalsy();
          expect(el.querySelector('#outer-ok')).toBeTruthy();
        });
      });

      it('degrade: a task-thrown SSR error yields content, not the fallback, on re-execution', async () => {
        const ServerTaskThrower = component$(() => {
          useTask$(() => {
            if (isServerPlatform()) {
              throw new Error('task boom');
            }
          });
          return <p id="task-content">task content</p>;
        });
        const App = withRerenderOwner(<ServerTaskThrower />);
        const { container } = await ssrRenderToDom(<App />, { debug });
        const el = container.element;
        expect(el.querySelector('#fb')?.textContent).toContain('caught: task boom');

        await rerenderComponent(el.querySelector('#owner-anchor') as HTMLElement);
        await waitForDrain(container);

        expect(el.querySelector('#task-content')).toBeTruthy();
        expect(el.querySelector('#fb')).toBeFalsy();
      });
    });

    describe('visible tasks', () => {
      it('a useVisibleTask$ throw is caught by the nearest parent <Catch>', async () => {
        const ThrowingVisibleTask = component$(() => {
          const state = useSignal('init');
          useVisibleTask$(() => {
            throw new Error('visible task boom');
          });
          return <span id="content">{state.value}</span>;
        });

        const { container } = await domRender(
          <Catch fallback$={fb()}>
            <ThrowingVisibleTask />
          </Catch>,
          { debug }
        );
        await trigger(container.element, 'span', 'qvisible');
        await waitForDrain(container);

        const el = container.element;
        expect(el.querySelector('#fb')?.textContent).toContain('caught: visible task boom');
        expect(el.querySelector('#content')).toBeFalsy();
      });
    });

    describe('computeds', () => {
      it('a serialized computed that throws on read re-derives the fallback on re-render', async () => {
        const ComputedThrower = component$(() => {
          const boom = useComputed$((): string => {
            throw new Error('computed boom');
          });
          return <p>{boom.value}</p>;
        });
        const App = withRerenderOwner(<ComputedThrower />);
        const { container } = await ssrRenderToDom(<App />, { debug });
        const el = container.element;
        expect(el.querySelector('#fb')?.textContent).toContain('caught: computed boom');

        await rerenderComponent(el.querySelector('#owner-anchor') as HTMLElement);
        await waitForDrain(container);

        expect(el.querySelector('#fb')?.textContent).toContain('caught: computed boom');
      });
    });

    describe('function children', () => {
      const throwingFnChild = (message = 'jsx error') =>
        (() => {
          throw new Error(message);
        }) as unknown as JSXOutput;

      it('SSR: a sync function-child throw renders the fallback', async () => {
        const { container } = await ssrRenderToDom(
          <Catch fallback$={fb()}>{throwingFnChild()}</Catch>,
          { debug }
        );
        expect(container.element.querySelector('#fb')?.textContent).toContain('caught: jsx error');
      });

      it('SSR: an async function child whose promise rejects renders the fallback', async () => {
        const asyncThrower = (async () => {
          throw new Error('async jsx error');
        }) as unknown as JSXOutput;
        const { container } = await ssrRenderToDom(<Catch fallback$={fb()}>{asyncThrower}</Catch>, {
          debug,
        });
        expect(container.element.querySelector('#fb')?.textContent).toContain(
          'caught: async jsx error'
        );
      });

      it('SSR: a function-child throw with NO boundary above still rejects the render', async () => {
        await expect(ssrRenderToDom(<main>{throwingFnChild()}</main>, { debug })).rejects.toThrow(
          'jsx error'
        );
      });

      it('SSR: a function child RETURNING JSX renders nothing and does not error', async () => {
        const thunk = (() => <div id="thunk">thunk</div>) as unknown as JSXOutput;
        const { container } = await ssrRenderToDom(<Catch fallback$={fb()}>{thunk}</Catch>, {
          debug,
        });
        expect(container.element.querySelector('#thunk')).toBeFalsy();
        expect(container.element.querySelector('#fb')).toBeFalsy();
      });

      it('SSR: onError$ receives info.phase "render" once for a function-child error, identity-preserved', async () => {
        const received: unknown[] = [];
        const infos: Array<{ phase: string }> = [];
        const original = new Error('jsx error');
        const identityThrower = (() => {
          throw original;
        }) as unknown as JSXOutput;
        const { container } = await ssrRenderToDom(
          <Catch
            fallback$={fb()}
            onError$={$((e: any, info: any) => {
              received.push(e);
              infos.push({ phase: info.phase });
            })}
          >
            {identityThrower}
          </Catch>,
          { debug, ...IN_ORDER }
        );
        await settleOnErrorDelivery(container);

        expect(received).toHaveLength(1);
        expect(received[0]).toBe(original);
        expect(infos).toEqual([{ phase: 'render' }]);
      });

      it('CSR: a function child inside a boundary renders empty — no crash, no fallback', async () => {
        const { container } = await domRender(<Catch fallback$={fb()}>{throwingFnChild()}</Catch>, {
          debug,
        });
        expect(container.element.querySelector('#fb')).toBeFalsy();
      });

      it('SSR OOOS: a sync function-child throw inside a Pending segment renders the fallback', async () => {
        const { document } = await streamAndResume(
          <main>
            <Pending fallback={<span id="skel">loading</span>}>
              <Catch fallback$={fb()}>{throwingFnChild()}</Catch>
            </Pending>
          </main>,
          OOOS
        );
        expect(document.querySelector('#fb')?.textContent).toContain('caught: jsx error');
      });
    });

    describe('SSRStream', () => {
      it('routes an <SSRStream> generator throw to the boundary, already-streamed chunks intact', async () => {
        const { container } = await ssrRenderToDom(
          <Catch fallback$={fb()}>
            <AsyncGenThrower />
          </Catch>,
          { debug }
        );
        const el = container.element;
        expect(el.querySelector('#fb')?.textContent).toContain('caught: async gen boom');
        expect(el.querySelector('#chunk')).toBeTruthy();
      });

      it('routes an <SSRStream> writer-function throw to the boundary', async () => {
        const { container } = await ssrRenderToDom(
          <Catch fallback$={fb()}>
            <StreamWriterThrower />
          </Catch>,
          { debug }
        );
        expect(container.element.querySelector('#fb')?.textContent).toContain(
          'caught: stream writer boom'
        );
      });
    });
  });
});

describe('qerror (client event channel)', () => {
  describe('qerror routing', () => {
    it('CSR: a qerror routes to the NEAREST of nested boundaries', async () => {
      const { container } = await domRender(
        <Catch
          fallback$={$(() => (
            <p id="fb-outer">outer</p>
          ))}
        >
          <Catch
            fallback$={$(() => (
              <p id="fb-inner">inner</p>
            ))}
          >
            <button id="target">x</button>
          </Catch>
        </Catch>,
        { debug }
      );
      const el = container.element;
      const target = el.querySelector('#target')!;
      dispatchQError(target, { error: new Error('async boom'), element: target });
      await waitForDrain(container);

      expect(el.querySelector('#fb-inner')).toBeTruthy();
      expect(el.querySelector('#fb-outer')).toBeFalsy();
    });

    it('CSR: a throwing fallback does not infinite-loop handleError', async () => {
      const { container } = await domRender(
        <Catch
          fallback$={$(() => {
            throw new Error('fallback boom');
          })}
        >
          <button id="target">x</button>
        </Catch>,
        { debug }
      );
      const el = container.element;
      const target = el.querySelector('#target')!;
      dispatchQError(target, { error: new Error('client boom'), element: target });
      await waitForDrain(container).catch(() => {});
      expect(el.querySelector('#target')).toBeFalsy();
      expect(el.querySelector('#fb')).toBeFalsy();
    });

    it('does NOT throw when a qerror has no enclosing Catch', async () => {
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
        <Catch fallback$={fb()}>
          <button id="target">x</button>
        </Catch>,
        { debug }
      );
      const target = container.element.querySelector('#target')!;

      dispatchQError(target, { error: new Error('async boom'), element: target });
      await waitForDrain(container);

      expect(container.element.querySelector('#fb')?.textContent).toContain('caught: async boom');
    });

    it('an importError qerror is not re-logged or routed to a boundary (qwikloader already logged it)', async () => {
      const { container } = await domRender(
        <Catch fallback$={fb()}>
          <button id="target">x</button>
        </Catch>,
        { debug }
      );
      const target = container.element.querySelector('#target')!;

      expect(() =>
        dispatchQError(target, {
          error: new Error('sym:0'),
          element: target,
          importError: 'sync',
        })
      ).not.toThrow();
      await waitForDrain(container);

      expect(container.element.querySelector('#fb')).toBeFalsy();
    });

    it('CSR: a non-recoverable build error is not caught by the boundary', async () => {
      const { container } = await domRender(
        <Catch fallback$={fb()}>
          <button id="content">x</button>
        </Catch>,
        { debug }
      );
      const el = container.element;
      const target = el.querySelector('#content')!;
      const err = new Error('build boom');
      (err as any).plugin = 'vite:some-plugin';
      dispatchQError(target, { error: err, element: target });
      try {
        await waitForDrain(container);
      } catch {
        // ignore
      }
      expect(el.querySelector('#fb')).toBeFalsy();
    });

    it('after resume: a qerror routes to the NEAREST of nested boundaries', async () => {
      const { container } = await ssrRenderToDom(
        <main>
          <Catch
            fallback$={$(() => (
              <p id="fb-outer">outer</p>
            ))}
          >
            <Catch
              fallback$={$(() => (
                <p id="fb-inner">inner</p>
              ))}
            >
              <button id="target">x</button>
            </Catch>
          </Catch>
        </main>,
        { debug }
      );
      const el = container.element;
      expect(el.querySelector('#fb-inner')).toBeFalsy();

      const target = el.querySelector('#target')!;
      dispatchQError(target, { error: new Error('client boom'), element: target });
      await waitForDrain(container);

      expect(el.querySelector('#fb-inner')).toBeTruthy();
      expect(el.querySelector('#fb-outer')).toBeFalsy();
    });
  });

  describe('falsy thrown values', () => {
    const seenFalsy: { errors: unknown[] } = { errors: [] };
    const Boundary = component$(() => {
      return (
        <Catch
          fallback$={$((e: any) => {
            seenFalsy.errors.push(e);
            return <p id="fb">caught: {String(e)}</p>;
          })}
        >
          <button id="content">x</button>
        </Catch>
      );
    });

    it.each([0, null, '', false, undefined])(
      'shows the fallback when %j is thrown',
      async (thrown) => {
        seenFalsy.errors = [];
        const { container } = await domRender(<Boundary />, { debug });
        const el = container.element;
        expect(el.querySelector('#content')).toBeTruthy();

        dispatchQError(el.querySelector('#content')!, {
          error: thrown,
          element: el.querySelector('#content')!,
        });
        await waitForDrain(container);

        expect(el.querySelector('#fb')).toBeTruthy();
        expect(el.querySelector('#content')).toBeFalsy();

        const seen = seenFalsy.errors[seenFalsy.errors.length - 1] as Error & { cause?: unknown };
        expect(seen).toBeInstanceOf(Error);
        expect(seen.message).toBe(String(thrown));
        expect('cause' in seen).toBe(true);
        expect(seen.cause).toBe(thrown);
      }
    );

    it.each([null, new Error('first')])(
      'a later error still escalates after %s was thrown',
      async (first) => {
        const outerSeen: unknown[] = [];
        const { container } = await domRender(
          <Catch
            fallback$={fb('fb-outer')}
            onError$={$((e: any) => {
              outerSeen.push(e);
            })}
          >
            <Catch fallback$={fb('fb-inner')}>
              <button id="content">x</button>
            </Catch>
          </Catch>,
          { debug }
        );
        const el = container.element;
        const target = el.querySelector('#content')!;

        dispatchQError(target, { error: first, element: target });
        await settleOnErrorDelivery(container);
        expect(el.querySelector('#fb-inner')).toBeTruthy();
        expect(el.querySelector('#fb-outer')).toBeFalsy();

        dispatchQError(el.querySelector('#fb-inner')!, {
          error: new Error('second'),
          element: el.querySelector('#fb-inner')!,
        });
        await settleOnErrorDelivery(container);

        expect(el.querySelector('#fb-outer')).toBeTruthy();
        expect((outerSeen[0] as Error)?.message).toBe('second');
      }
    );
  });

  describe('multiple containers on one document', () => {
    const renderTwoContainers = async () => {
      setPlatform(getTestPlatform());
      const document = createDocument();
      const hostA = document.createElement('div');
      const hostB = document.createElement('div');
      document.body.appendChild(hostA);
      document.body.appendChild(hostB);
      await render(
        hostA,
        <Catch
          fallback$={$((e: any) => (
            <p id="fb-A">caught A: {e.message}</p>
          ))}
        >
          <button id="target-A">a</button>
        </Catch>
      );
      await render(
        hostB,
        <Catch
          fallback$={$((e: any) => (
            <p id="fb-B">caught B: {e.message}</p>
          ))}
        >
          <button id="target-B">b</button>
        </Catch>
      );
      return {
        hosts: { A: hostA, B: hostB },
        containers: { A: _getDomContainer(hostA), B: _getDomContainer(hostB) },
      };
    };

    it.each([
      ['A', 'B'],
      ['B', 'A'],
    ] as const)(
      'routes a qerror from container %s only to itself, leaving %s untouched',
      async (erroring, untouched) => {
        const { hosts, containers } = await renderTwoContainers();
        expect(hosts[erroring].querySelector(`#fb-${erroring}`)).toBeFalsy();
        expect(hosts[untouched].querySelector(`#fb-${untouched}`)).toBeFalsy();
        expect(hosts[erroring].querySelector(`#target-${erroring}`)).toBeTruthy();
        expect(hosts[untouched].querySelector(`#target-${untouched}`)).toBeTruthy();

        const target = hosts[erroring].querySelector(`#target-${erroring}`)!;
        dispatchQError(target, { error: new Error(`boom from ${erroring}`), element: target });
        await waitForDrain(containers[erroring]);

        expect(hosts[erroring].querySelector(`#fb-${erroring}`)?.textContent).toContain(
          `caught ${erroring}: boom from ${erroring}`
        );
        expect(hosts[untouched].querySelector(`#fb-${untouched}`)).toBeFalsy();
        expect(hosts[untouched].querySelector(`#target-${untouched}`)).toBeTruthy();
      }
    );

    it('registers one qerror listener on the document, not one per container', async () => {
      setPlatform(getTestPlatform());
      const document = createDocument();
      const qerrorHandlers: ((e: any) => void)[] = [];
      const addEventListener = document.addEventListener.bind(document);
      document.addEventListener = ((type: string, cb: any, opts?: any) => {
        type === 'qerror' && qerrorHandlers.push(cb);
        return addEventListener(type, cb, opts);
      }) as typeof document.addEventListener;
      const hostA = document.createElement('div');
      const hostB = document.createElement('div');
      document.body.appendChild(hostA);
      document.body.appendChild(hostB);
      await render(hostA, <div id="a">a</div>);
      await render(hostB, <div id="b">b</div>);

      expect(qerrorHandlers).toHaveLength(1);
    });

    it('installs one qerror listener per document even from a second runtime instance', async () => {
      setPlatform(getTestPlatform());
      const document = createDocument();
      const qerrorHandlers: ((e: any) => void)[] = [];
      const addEventListener = document.addEventListener.bind(document);
      document.addEventListener = ((type: string, cb: any, opts?: any) => {
        type === 'qerror' && qerrorHandlers.push(cb);
        return addEventListener(type, cb, opts);
      }) as typeof document.addEventListener;
      const host = document.createElement('div');
      document.body.appendChild(host);
      await render(host, <div id="a">a</div>);
      expect(qerrorHandlers).toHaveLength(1);

      // A second bundle on the page has its own module state but shares the document.
      vi.resetModules();
      const secondRuntime = await import('../shared/error/error-handling');
      secondRuntime.installQErrorListener(document as any);

      expect(qerrorHandlers).toHaveLength(1);
    });

    it('ignores a qerror whose element belongs to another document', async () => {
      setPlatform(getTestPlatform());
      const documentA = createDocument();
      const hostA = documentA.createElement('div');
      documentA.body.appendChild(hostA);
      await render(hostA, <div id="a">a</div>);

      const documentB = createDocument();
      const hostB = documentB.createElement('div');
      documentB.body.appendChild(hostB);
      await render(
        hostB,
        <Catch
          fallback$={$((e: any) => (
            <p id="fb-B">caught B: {e.message}</p>
          ))}
        >
          <button id="target-B">b</button>
        </Catch>
      );

      const target = hostB.querySelector('#target-B')!;
      const ev = documentA.createEvent('Event');
      ev.initEvent('qerror', false, false);
      (ev as any).detail = { error: new Error('from another document'), element: target };
      documentA.dispatchEvent(ev);
      await settleOnErrorDelivery(_getDomContainer(hostB));

      expect(hostB.querySelector('#fb-B')).toBeFalsy();
      expect(hostB.querySelector('#target-B')).toBeTruthy();
    });

    it('routes a qerror to the NEAREST owning container when an inner container nests inside an outer one', async () => {
      setPlatform(getTestPlatform());
      const document = createDocument();
      const hostOuter = document.createElement('div');
      document.body.appendChild(hostOuter);
      await render(
        hostOuter,
        <Catch
          fallback$={$((e: any) => (
            <p id="fb-outer">caught outer: {e.message}</p>
          ))}
        >
          <div id="embed-host" />
        </Catch>
      );
      const embedHost = hostOuter.querySelector('#embed-host')!;
      const hostInner = document.createElement('div');
      embedHost.appendChild(hostInner);
      await render(
        hostInner,
        <Catch
          fallback$={$((e: any) => (
            <p id="fb-inner">caught inner: {e.message}</p>
          ))}
        >
          <button id="target-inner">x</button>
        </Catch>
      );
      const outer = _getDomContainer(hostOuter) as any;
      const inner = _getDomContainer(hostInner);
      const outerHandleError = vi.spyOn(outer, 'handleError');

      const innerTarget = hostInner.querySelector('#target-inner')!;
      dispatchQError(innerTarget, { error: new Error('boom from inner'), element: innerTarget });
      await waitForDrain(inner).catch(() => {});
      await waitForDrain(outer).catch(() => {});

      expect(hostInner.querySelector('#fb-inner')?.textContent).toContain(
        'caught inner: boom from inner'
      );
      expect(outerHandleError).not.toHaveBeenCalled();
      expect(hostOuter.querySelector('#fb-outer')).toBeFalsy();
    });
  });
});

describe('onError$', () => {
  describe.each(modes)('onError$ (%s)', (mode, renderMode) => {
    it('fires once with the caught error and does not affect rendering', async () => {
      onErrorLog.errors = [];
      const { container } = await renderMode(() => (
        <Catch
          fallback$={fb()}
          onError$={$((e: any) => {
            onErrorLog.errors.push(e instanceof Error ? e.message : e);
          })}
        >
          <Thrower />
        </Catch>
      ));
      await settleOnErrorDelivery(container);

      expect(container.element.querySelector('#fb')?.textContent).toContain('caught: boom');
      expect(onErrorLog.errors).toEqual(['boom']);
    });

    it('receives the IDENTICAL Error instance that was thrown', async () => {
      const received: unknown[] = [];
      const original = new Error('identity boom');
      const IdentityThrower = component$((): JSXOutput => {
        throw original;
      });
      const { container } = await renderMode(() => (
        <Catch fallback$={fb()} onError$={$((e: any) => received.push(e))}>
          <IdentityThrower />
        </Catch>
      ));
      await settleOnErrorDelivery(container);

      expect(received).toHaveLength(1);
      expect(received[0]).toBe(original);
    });

    it.each([[{ code: 401 }], [0]])(
      'guarantees the Error type: a non-Error throw %j is coerced, raw value on cause',
      async (raw) => {
        const received: unknown[] = [];
        const RawThrower = component$((): JSXOutput => {
          throw raw;
        });
        const { container } = await renderMode(() => (
          <Catch fallback$={fb()} onError$={$((e: any) => received.push(e))}>
            <RawThrower />
          </Catch>
        ));
        await settleOnErrorDelivery(container);

        expect(received).toHaveLength(1);
        const seen = received[0] as Error & { cause?: unknown };
        expect(seen).toBeInstanceOf(Error);
        expect(seen.message).toBe(String(raw));
        expect(seen.cause).toBe(raw);
      }
    );

    it('info.digest matches the digest a production fallback displays', async () => {
      const digests: Array<string | undefined> = [];
      const seen: unknown[] = [];
      const { container } = await renderMode(() => (
        <Catch
          fallback$={fb()}
          onError$={$((e: any, info: any) => {
            seen.push(e);
            digests.push(info.digest);
          })}
        >
          <Thrower />
        </Catch>
      ));
      await settleOnErrorDelivery(container);

      const onScreen = redactBoundaryErrorForDisplay(seen[0], false) as Error & { digest: string };
      expect(digests).toEqual([onScreen.digest]);
      expect(onScreen.digest).toBeTruthy();
    });

    it('a synchronously throwing onError$ is swallowed; the fallback still renders and info is delivered exactly once', async () => {
      const calls: Array<{ phase: string; boundaryId: string }> = [];
      const { container } = await renderMode(() => (
        <Catch
          fallback$={fb()}
          onError$={$((_e: any, info: any) => {
            calls.push({ phase: info.phase, boundaryId: info.boundaryId });
            throw new Error('onError boom');
          })}
        >
          <Thrower />
        </Catch>
      ));
      await settleOnErrorDelivery(container);

      expect(calls).toHaveLength(1);
      expect(calls[0].phase).toBe('render');
      expect(calls[0].boundaryId.length).toBeGreaterThan(0);
      expect(container.element.querySelector('#fb')?.textContent).toContain('caught: boom');
    });

    it('an async-rejecting onError$ is swallowed; the fallback still renders', async () => {
      const log: unknown[] = [];
      const { container } = await renderMode(() => (
        <Catch
          fallback$={fb()}
          onError$={$((e: any) => {
            log.push(e instanceof Error ? e.message : e);
            return Promise.reject(new Error('onError async boom'));
          })}
        >
          <Thrower />
        </Catch>
      ));
      await settleOnErrorDelivery(container);

      expect(log).toEqual(['boom']);
      expect(container.element.querySelector('#fb')?.textContent).toContain('caught: boom');
    });

    it('is optional: a boundary without onError$ still catches', async () => {
      const { container } = await renderMode(() => (
        <Catch fallback$={fb()}>
          <Thrower />
        </Catch>
      ));
      await waitForDrain(container);
      expect(container.element.querySelector('#fb')?.textContent).toContain('caught: boom');
    });

    it('the outer onError$ stays silent when the inner boundary catches cleanly', async () => {
      const outerLog: unknown[] = [];
      const { container } = await renderMode(() => (
        <Catch
          fallback$={$(() => (
            <p id="fb-outer">outer</p>
          ))}
          onError$={$((e: any) => {
            outerLog.push(e instanceof Error ? e.message : e);
          })}
        >
          <Catch fallback$={fb('fb-inner')}>
            <Thrower />
          </Catch>
        </Catch>
      ));
      await settleOnErrorDelivery(container);

      const el = container.element;
      expect(el.querySelector('#fb-inner')?.textContent).toContain('caught: boom');
      expect(el.querySelector('#fb-outer')).toBeFalsy();
      expect(outerLog).toEqual([]);
    });

    it('escalation: inner and outer onError$ each fire once for their own error', async () => {
      const innerLog: unknown[] = [];
      const outerLog: unknown[] = [];
      const { container } = await renderMode(() => (
        <NestedEscalation
          innerOnError={$((e: any) => {
            innerLog.push(e instanceof Error ? e.message : e);
          })}
          outerOnError={$((e: any) => {
            outerLog.push(e instanceof Error ? e.message : e);
          })}
        />
      ));
      await settleOnErrorDelivery(container);

      const el = container.element;
      expect(el.querySelector('#fb-outer')?.textContent).toBe('outer');
      expect(el.querySelector('#fb-inner')).toBeFalsy();
      expect(innerLog).toEqual(['boom']);
      expect(outerLog).toEqual(['inner fallback boom']);
    });

    describe('info.phase', () => {
      it('onError$ receives info.phase "render" and a non-empty boundaryId for a render throw', async () => {
        const infos: Array<{ phase: string; boundaryId: string }> = [];
        const { container } = await renderMode(() => (
          <Catch
            fallback$={fb()}
            onError$={$((_e: any, info: any) => {
              infos.push({ phase: info.phase, boundaryId: info.boundaryId });
            })}
          >
            <Thrower />
          </Catch>
        ));
        await settleOnErrorDelivery(container);

        expect(infos).toHaveLength(1);
        expect(infos[0].phase).toBe('render');
        expect(typeof infos[0].boundaryId).toBe('string');
        expect(infos[0].boundaryId.length).toBeGreaterThan(0);
      });

      it('onError$ receives info.phase "hook" for a useTask$ throw', async () => {
        const infos: Array<{ phase: string; boundaryId: string }> = [];
        const { container } = await renderMode(() => (
          <Catch
            fallback$={fb()}
            onError$={$((_e: any, info: any) => {
              infos.push({ phase: info.phase, boundaryId: info.boundaryId });
            })}
          >
            <ThrowingTask />
          </Catch>
        ));
        await waitForDrain(container);
        await getTestPlatform().flush();

        expect(infos).toHaveLength(1);
        expect(infos[0].phase).toBe('hook');
        expect(infos[0].boundaryId.length).toBeGreaterThan(0);
      });
    });
  });

  describe('onError$ (mode-specific)', () => {
    it('the serialized props.onError$ fires once on a client error', async () => {
      (globalThis as any).__catchOnErrorLog = [];
      const { container } = await ssrRenderToDom(
        <Catch
          fallback$={fb()}
          onError$={$((e: any) => {
            ((globalThis as any).__catchOnErrorLog ||= []).push(e instanceof Error ? e.message : e);
          })}
        >
          <button id="target">x</button>
        </Catch>,
        { debug }
      );
      expect((globalThis as any).__catchOnErrorLog).toEqual([]);

      const el = container.element;
      const target = el.querySelector('#target')!;
      dispatchQError(target, { error: new Error('client boom'), element: target });
      await settleOnErrorDelivery(container);

      expect((globalThis as any).__catchOnErrorLog).toEqual(['client boom']);
      expect(el.querySelector('#fb')?.textContent).toContain('caught: client boom');
      delete (globalThis as any).__catchOnErrorLog;
    });

    it('a client error fires the serialized onError$ again after an SSR catch', async () => {
      (globalThis as any).__catchRederiveLog = [];
      const App = withRerenderOwner(<Thrower message="rederive boom" />, {
        onError$: $((e: any) => {
          ((globalThis as any).__catchRederiveLog ||= []).push(e instanceof Error ? e.message : e);
        }),
      });
      const { container } = await ssrRenderToDom(<App />, { debug });
      const el = container.element;
      expect((globalThis as any).__catchRederiveLog).toEqual(['rederive boom']);

      await rerenderComponent(el.querySelector('#owner-anchor') as HTMLElement);
      await settleOnErrorDelivery(container);

      expect((globalThis as any).__catchRederiveLog).toEqual(['rederive boom', 'rederive boom']);
      delete (globalThis as any).__catchRederiveLog;
    });

    describe('info.phase', () => {
      it('onError$ receives info.phase "event" for a qerror-delivered client error', async () => {
        const infos: Array<{ phase: string; boundaryId: string }> = [];
        const { container } = await domRender(
          <Catch
            fallback$={fb()}
            onError$={$((_e: any, info: any) => {
              infos.push({ phase: info.phase, boundaryId: info.boundaryId });
            })}
          >
            <button id="target">x</button>
          </Catch>,
          { debug }
        );
        const target = container.element.querySelector('#target')!;
        dispatchQError(target, { error: new Error('client boom'), element: target });
        await settleOnErrorDelivery(container);

        expect(infos).toHaveLength(1);
        expect(infos[0].phase).toBe('event');
        expect(infos[0].boundaryId.length).toBeGreaterThan(0);
      });

      it('onError$ receives info.phase "render" for an <SSRStream> generator throw', async () => {
        const infos: Array<{ phase: string; boundaryId: string }> = [];
        await ssrRenderToDom(
          <Catch
            fallback$={fb()}
            onError$={$((_e: any, info: any) => {
              infos.push({ phase: info.phase, boundaryId: info.boundaryId });
            })}
          >
            <AsyncGenThrower />
          </Catch>,
          { debug }
        );
        await getTestPlatform().flush();
        await delay(0);
        expect(infos).toHaveLength(1);
        expect(infos[0].phase).toBe('render');
        expect(infos[0].boundaryId.length).toBeGreaterThan(0);
      });

      it('onError$ receives info.phase "hook" for a rejecting async signal', async () => {
        (globalThis as any).__catchAsyncSignalInfo = [];
        await streamAndResume(
          <main>
            <Catch
              fallback$={fb()}
              onError$={$((_e: any, info: any) => {
                ((globalThis as any).__catchAsyncSignalInfo ||= []).push({
                  phase: info.phase,
                  boundaryId: info.boundaryId,
                });
              })}
            >
              <div id="before">before</div>
              <AsyncSignalThrower />
            </Catch>
          </main>
        );
        const infos = (globalThis as any).__catchAsyncSignalInfo as Array<{
          phase: string;
          boundaryId: string;
        }>;
        expect(infos).toHaveLength(1);
        expect(infos[0].phase).toBe('hook');
        expect(infos[0].boundaryId.length).toBeGreaterThan(0);
        delete (globalThis as any).__catchAsyncSignalInfo;
      });
    });
  });
});

const resetRef = { flake: 0, toggle: 0 };
const ResetFlake = component$(() => {
  resetRef.flake++;
  if (resetRef.flake === 1) {
    throw new Error('boom');
  }
  return <div id="ok">ok</div>;
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
      <Catch
        fallback$={$((e: any, reset: any) => (
          <button id="retry" onClick$={() => reset()}>
            caught: {e.message}
          </button>
        ))}
      >
        {child}
      </Catch>
    </main>
  ));

const withRerenderOwner = (
  child: JSXOutput,
  boundaryProps: { fallback$?: any; onError$?: any } = {}
) =>
  component$(() => {
    const ticks = useSignal(0);
    return (
      <main>
        <span id="owner-anchor">{ticks.value}</span>
        <Catch fallback$={boundaryProps.fallback$ ?? fb()} onError$={boundaryProps.onError$}>
          {child}
        </Catch>
      </main>
    );
  });

const resetResumed = async (container: any, retrySelector = '#retry') => {
  const c = _getDomContainer(container.element) as any;
  resetCatch(c, c.vNodeLocate(container.element.querySelector(retrySelector)));
  await waitForDrain(container);
};

const resetModes = [
  [
    'SSR-resume-in-order',
    {
      render: (jsx: JSXOutput) => ssrRenderToDom(jsx, { debug, ...IN_ORDER }),
      driveReset: resetResumed,
    },
  ],
  [
    'CSR-click',
    {
      render: (jsx: JSXOutput) => domRender(jsx, { debug }),
      driveReset: async (container: any) => {
        await trigger(container.element, '#retry', 'click');
      },
    },
  ],
  [
    'SSR-resume-out-of-order',
    {
      render: (jsx: JSXOutput) => ssrRenderToDom(jsx, { debug, ...OOOS }),
      driveReset: resetResumed,
    },
  ],
] as const;

describe('Catch reset', () => {
  describe.each(resetModes)('%s', (_mode, { render: renderReset, driveReset }) => {
    it('reset re-executes a flaky projected child and recovers', async () => {
      resetRef.flake = 0;
      const App = withResetBoundary(<ResetFlake />);
      const { container } = await renderReset(<App />);
      const el = container.element;
      expect(el.querySelector('#retry')).toBeTruthy();
      expect(el.querySelector('#ok')).toBeFalsy();

      await driveReset(container);

      expect(el.querySelector('#ok')?.textContent).toContain('ok');
      expect(el.querySelector('#retry')).toBeFalsy();
    });

    it('a still-throwing child re-shows the fallback (no loop)', async () => {
      const App = withResetBoundary(<Thrower message="persistent" />);
      const { container } = await renderReset(<App />);
      const el = container.element;

      await driveReset(container);

      expect(el.querySelector('#retry')?.textContent).toContain('persistent');
    });

    it('reset recovers the toggle child', async () => {
      resetRef.toggle = 0;
      const App = withResetBoundary(<ResetToggle />);
      const { container } = await renderReset(<App />);
      const el = container.element;
      expect(el.querySelector('#retry')?.textContent).toContain('boom-1');

      await driveReset(container);

      expect(el.querySelector('#alive')).toBeTruthy();
    });
  });

  it('a boundary healthy at SSR still resets after a client error post-resume', async () => {
    const Healthy = component$(() => <button id="target">x</button>);
    const App = withResetBoundary(<Healthy />);
    const { container } = await ssrRenderToDom(<App />, { debug, ...IN_ORDER });
    const el = container.element;
    expect(el.querySelector('#target')).toBeTruthy();

    dispatchQError(el.querySelector('#target')!, {
      error: new Error('client boom'),
      element: el.querySelector('#target')!,
    });
    await settleOnErrorDelivery(container);
    expect(el.querySelector('#retry')).toBeTruthy();

    await resetResumed(container);

    expect(el.querySelector('#target')).toBeTruthy();
    expect(el.querySelector('#retry')).toBeFalsy();
  });

  it('sequential errors across resets: a second error after recovery shows the second message, and reset recovers again', async () => {
    resetRef.toggle = 0;
    const App = withResetBoundary(<ResetToggle />);
    const { container } = await domRender(<App />, { debug });
    const el = container.element;
    expect(el.querySelector('#retry')?.textContent).toContain('boom-1');

    await trigger(el, '#retry', 'click');
    expect(el.querySelector('#alive')).toBeTruthy();

    await rerenderComponent(el.querySelector('#alive') as HTMLElement);
    await waitForDrain(container).catch(() => {});
    expect(el.querySelector('#retry')?.textContent).toContain('boom-3');

    await trigger(el, '#retry', 'click');
    expect(el.querySelector('#alive')).toBeTruthy();
    expect(el.querySelector('#retry')).toBeFalsy();
  });

  describe('nested boundaries', () => {
    const NestedResetApp = component$(() => (
      <main>
        <Catch
          fallback$={$((e: any) => (
            <p id="fb-outer">outer: {String(e?.message ?? e)}</p>
          ))}
        >
          <div id="outer-sibling">outer sibling</div>
          <Catch
            fallback$={$((e: any, reset: any) => (
              <button id="retry-inner" onClick$={() => reset()}>
                caught: {e.message}
              </button>
            ))}
          >
            <ResetFlake />
          </Catch>
        </Catch>
      </main>
    ));

    it('after a server-side error: reset on a nested inner boundary re-executes its children, outer intact', async () => {
      resetRef.flake = 0;
      const { container } = await ssrRenderToDom(<NestedResetApp />, { debug, ...IN_ORDER });
      const el = container.element;
      expect(el.querySelector('#retry-inner')).toBeTruthy();
      expect(el.querySelector('#ok')).toBeFalsy();
      expect(el.querySelector('#outer-sibling')).toBeTruthy();

      await resetResumed(container, '#retry-inner');

      expect(el.querySelector('#ok')?.textContent).toContain('ok');
      expect(el.querySelector('#retry-inner')).toBeFalsy();
      expect(el.querySelector('#fb-outer')).toBeFalsy();
      expect(el.querySelector('#outer-sibling')).toBeTruthy();
    });

    const escalationRef = { fallbackCalls: 0 };
    const EscalationResetApp = component$(() => (
      <Catch
        fallback$={$((e: any, reset: any) => (
          <button id="retry-outer" onClick$={() => reset()}>
            outer: {String(e?.message ?? e)}
          </button>
        ))}
      >
        <Catch
          fallback$={$(() => {
            escalationRef.fallbackCalls++;
            if (escalationRef.fallbackCalls === 1) {
              throw new Error('inner fallback boom');
            }
            return <p id="fb-inner">inner recovered</p>;
          })}
        >
          <Thrower />
        </Catch>
      </Catch>
    ));

    it('reset after escalation: the outer boundary resets and re-attempts the whole subtree', async () => {
      escalationRef.fallbackCalls = 0;
      const { container } = await domRender(<EscalationResetApp />, { debug });
      await waitForDrain(container).catch(() => {});
      const el = container.element;
      expect(el.querySelector('#retry-outer')?.textContent).toContain('inner fallback boom');

      await trigger(el, '#retry-outer', 'click');
      await waitForDrain(container).catch(() => {});

      expect(el.querySelector('#fb-inner')?.textContent).toContain('inner recovered');
      expect(el.querySelector('#retry-outer')).toBeFalsy();
    });

    describe('reset inside the outer fallback', () => {
      // A captured flag freezes across the resume wire; gate on the platform.
      const SsrFallbackNestedFlake = component$(() => {
        if (isServerPlatform()) {
          throw new Error('inner-boom');
        }
        return <div id="ssr-inner-ok">inner ok</div>;
      });
      const ssrNestedInnerFb = $((ie: any, reset: any) => (
        <button id="ssr-retry-nested" onClick$={() => reset()}>
          inner caught: {ie.message}
        </button>
      ));
      const ssrNestedOuterFb = $((e: any) => (
        <>
          <p id="ssr-outer-fb">outer: {String(e?.message ?? e)}</p>
          <Catch fallback$={ssrNestedInnerFb}>
            <SsrFallbackNestedFlake />
          </Catch>
        </>
      ));
      const SsrFallbackNestedApp = component$(() => (
        <main>
          <Catch fallback$={ssrNestedOuterFb}>
            <Thrower message="outer-boom" />
          </Catch>
        </main>
      ));

      it('after a server-side error: re-derives the outer and recovers the inner', async () => {
        const { container } = await ssrRenderToDom(<SsrFallbackNestedApp />, {
          debug,
          ...IN_ORDER,
        });
        const el = container.element;
        expect(el.querySelector('#ssr-outer-fb')).toBeTruthy();
        expect(el.querySelector('#ssr-retry-nested')).toBeTruthy();
        expect(el.querySelector('#ssr-inner-ok')).toBeFalsy();

        await resetResumed(container, '#ssr-retry-nested');

        expect(el.querySelector('#ssr-outer-fb')).toBeTruthy();
        expect(el.querySelector('#ssr-inner-ok')?.textContent).toContain('inner ok');
        expect(el.querySelector('#ssr-retry-nested')).toBeFalsy();
      });

      const fallbackNestedRef = { outerThrown: false, innerThrows: true };
      const FallbackOuterOnce = component$(() => {
        if (!fallbackNestedRef.outerThrown) {
          fallbackNestedRef.outerThrown = true;
          throw new Error('outer-boom');
        }
        return <div id="outer-child-ok">outer child ok</div>;
      });
      const FallbackNestedFlake = component$(() => {
        if (fallbackNestedRef.innerThrows) {
          throw new Error('inner-boom');
        }
        return <div id="inner-ok">inner ok</div>;
      });
      // Hoisted like the optimizer emits: this fixture needs stable QRL identity.
      const nestedInnerFb = $((ie: any, reset: any) => (
        <button id="retry-nested" onClick$={() => reset()}>
          inner caught: {ie.message}
        </button>
      ));
      const nestedOuterFb = $((e: any) => (
        <>
          <p id="outer-fb">outer: {String(e?.message ?? e)}</p>
          <Catch fallback$={nestedInnerFb}>
            <FallbackNestedFlake />
          </Catch>
        </>
      ));
      const FallbackNestedApp = component$(() => (
        <main>
          <Catch fallback$={nestedOuterFb}>
            <FallbackOuterOnce />
          </Catch>
        </main>
      ));

      it('after a client-side error: re-executes its child, outer intact', async () => {
        fallbackNestedRef.outerThrown = false;
        fallbackNestedRef.innerThrows = true;
        const { container } = await domRender(<FallbackNestedApp />, { debug });
        await waitForDrain(container).catch(() => {});
        const el = container.element;
        expect(el.querySelector('#outer-fb')).toBeTruthy();
        expect(el.querySelector('#retry-nested')).toBeTruthy();
        expect(el.querySelector('#inner-ok')).toBeFalsy();

        fallbackNestedRef.innerThrows = false;
        await resetResumed(container, '#retry-nested');

        expect(el.querySelector('#inner-ok')?.textContent).toContain('inner ok');
        expect(el.querySelector('#retry-nested')).toBeFalsy();
        expect(el.querySelector('#outer-fb')).toBeTruthy();
      });
    });
  });

  describe('through wrapper components', () => {
    const WrappedSsrFlake = component$(() => {
      if (isServerPlatform()) {
        throw new Error('wrapped-boom');
      }
      return <p id="wrapped-ok">recovered</p>;
    });
    const wrappedResetFb = $((e: any, reset: any) => (
      <button id="retry-wrapped" onClick$={() => reset()}>
        caught: {e.message}
      </button>
    ));
    // Children arrive through <Slot/> (#8881).
    const BoxedBoundary = component$(() => (
      <Catch fallback$={wrappedResetFb}>
        <Slot />
      </Catch>
    ));

    it.each([
      ['SSR-resume-in-order', IN_ORDER],
      ['SSR-resume-out-of-order', OOOS],
    ])(
      '%s: reset through a boundary packaged in a wrapper re-executes the children',
      async (_mode, streamOpts) => {
        const App = component$(() => (
          <main>
            <BoxedBoundary>
              <WrappedSsrFlake />
            </BoxedBoundary>
          </main>
        ));
        const { container } = await ssrRenderToDom(<App />, { debug, ...streamOpts });
        const el = container.element;
        const retry = el.querySelector('#retry-wrapped')!;
        expect(retry).toBeTruthy();

        const domContainer = _getDomContainer(el) as any;
        const retryHost = domContainer.vNodeLocate(retry);
        const boundaryHost = domContainer.resolveContextHost(retryHost, ERROR_CONTEXT);
        const store = getOwnCatchStore(domContainer, boundaryHost);
        expect(store?.projectedContentOwner).toBeTruthy();

        await resetResumed(container, '#retry-wrapped');

        expect(el.querySelector('#wrapped-ok')?.textContent).toContain('recovered');
        expect(el.querySelector('#retry-wrapped')).toBeFalsy();
      }
    );

    it('CSR-click: reset through a boundary packaged in a wrapper re-executes the children', async () => {
      resetRef.flake = 0;
      const App = component$(() => (
        <main>
          <BoxedBoundary>
            <ResetFlake />
          </BoxedBoundary>
        </main>
      ));
      const { container } = await domRender(<App />, { debug });
      const el = container.element;
      expect(el.querySelector('#retry-wrapped')).toBeTruthy();

      await trigger(el, '#retry-wrapped', 'click');

      expect(el.querySelector('#ok')?.textContent).toContain('ok');
      expect(el.querySelector('#retry-wrapped')).toBeFalsy();
    });

    const WrapperProjector = component$(() => (
      <div data-wrapper="">
        <Slot />
      </div>
    ));
    const WrappedResetApp = component$(() => (
      <Pending fallback={<span id="skel">loading</span>}>
        <WrapperProjector>
          <Catch fallback$={wrappedResetFb}>
            <WrappedSsrFlake />
          </Catch>
        </WrapperProjector>
      </Pending>
    ));

    // out-of-order: https://github.com/QwikDev/qwik/issues/8884
    it.each([['in-order', IN_ORDER]] as const)(
      '%s, after a server-side error: reset through a Pending + Slot-projecting wrapper re-executes the children',
      async (_mode, streamOpts) => {
        const { container } = await ssrRenderToDom(<WrappedResetApp />, { debug, ...streamOpts });
        const el = container.element;
        expect(el.querySelector('#retry-wrapped')).toBeTruthy();
        expect(el.querySelector('#wrapped-ok')).toBeFalsy();

        await resetResumed(container, '#retry-wrapped');

        expect(el.querySelector('#wrapped-ok')?.textContent).toContain('recovered');
        expect(el.querySelector('#retry-wrapped')).toBeFalsy();
      }
    );
  });
});

describe('transformError (render option)', () => {
  it('redacts the SSR boundary error end-to-end', async () => {
    const { container } = await ssrRenderToDom(
      <Catch fallback$={fb()}>
        <Thrower message="SECRET-db-detail" />
      </Catch>,
      { debug, transformError: () => new Error('redacted-by-app') }
    );
    const text = container.element.querySelector('#fb')?.textContent;
    expect(text).toContain('redacted-by-app');
    expect(text).not.toContain('SECRET');
  });

  it('declining falls through to the default policy', async () => {
    const { container } = await ssrRenderToDom(
      <Catch fallback$={fb()}>
        <Thrower message="declined boom" />
      </Catch>,
      {
        debug,
        transformError: (e: unknown) =>
          e instanceof Error && e.message.startsWith('transform:') ? e : undefined,
      }
    );
    expect(container.element.querySelector('#fb')?.textContent).toContain('declined boom');
  });

  it('a projection with unserializable fields renders its own message and SSR still completes', async () => {
    const { container } = await ssrRenderToDom(
      <Catch fallback$={fb()}>
        <Thrower message="SECRET-db-detail" />
      </Catch>,
      {
        debug,
        transformError: () => Object.assign(new Error('shown-to-user'), { retry: () => {} }),
      }
    );
    const text = container.element.querySelector('#fb')?.textContent;
    expect(text).toContain('shown-to-user');
    expect(text).not.toContain('SECRET');
  });
});

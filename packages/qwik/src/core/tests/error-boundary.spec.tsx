import {
  $,
  component$,
  createAsync$,
  ErrorBoundary,
  PublicError,
  render,
  setPlatform,
  Slot,
  SSRStream,
  Suspense,
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
import { redactBoundaryErrorForDisplay } from '../shared/error/error-handling';

const debug = false;

// With the suspense flag on, out-of-order is the default; IN_ORDER is the opt-out.
const OOOS = {
  streaming: { inOrder: { strategy: 'disabled' as const }, outOfOrder: true },
};
const IN_ORDER = { streaming: { outOfOrder: false } };
const streamingModes = [
  ['in-order', IN_ORDER],
  ['out-of-order', OOOS],
] as const;

const PublicThrower = component$((): JSXOutput => {
  throw new PublicError({ message: 'Out of stock', sku: 'A1' });
});

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

const FallbackBoomer = component$(() => {
  throw new Error('fallback boom');
});

const AsyncSignalThrower = component$(() => {
  const sig = createAsync$(() => Promise.reject(new Error('async signal boom')));
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
  emulateExecutionOfStreamingOutOfOrderScripts(document, ['qErr', 'qInstallErrorSwap']);
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
    <ErrorBoundary fallback$={fb()}>
      <Slot />
    </ErrorBoundary>
  );
});

const BoxedWithSibling = component$(() => {
  return (
    <ErrorBoundary fallback$={fb()}>
      <div id="sibling">sibling</div>
      <Slot />
    </ErrorBoundary>
  );
});

const TwoNamedSlots = component$(() => {
  return (
    <div id="two-hosts">
      <ErrorBoundary fallback$={fb('fb-danger')}>
        <div id="danger-host">
          <Slot name="danger" />
        </div>
      </ErrorBoundary>
      <ErrorBoundary fallback$={fb('fb-warning')}>
        <div id="warning-host">
          <Slot name="warning" />
        </div>
      </ErrorBoundary>
    </div>
  );
});

const PluginThrower = component$(() => {
  const err = new Error('build boom');
  (err as any).plugin = 'vite:some-plugin';
  throw err;
});

const NestedEscalation = component$<{ innerOnError?: any; outerOnError?: any }>((props) => (
  <ErrorBoundary
    fallback$={$(() => (
      <p id="fb-outer">outer</p>
    ))}
    onError$={props.outerOnError}
  >
    <ErrorBoundary
      fallback$={$(() => {
        throw new Error('inner fallback boom');
      })}
      onError$={props.innerOnError}
    >
      <Thrower />
    </ErrorBoundary>
  </ErrorBoundary>
));

const onErrorLog: { errors: unknown[] } = { errors: [] };

const modes = [
  [
    'CSR',
    (jsx: () => JSXOutput, opts: Record<string, unknown> = {}) =>
      domRender(jsx(), { debug, ...opts }),
  ],
  [
    'SSR',
    (jsx: () => JSXOutput, opts: Record<string, unknown> = {}) =>
      ssrRenderToDom(jsx(), { debug, ...opts }),
  ],
  [
    'SSR in a deferred segment',
    (jsx: () => JSXOutput, opts: Record<string, unknown> = {}) =>
      ssrRenderToDom(
        <Suspense fallback={<span id="segment-skel">deferring</span>}>{jsx()}</Suspense>,
        { debug, ...opts }
      ),
  ],
] as const;

describe.each(modes)('ErrorBoundary behavior (%s)', (mode, renderMode) => {
  it('projects children when there is no error', async () => {
    const { container } = await renderMode(() => (
      <ErrorBoundary fallback$={fb()}>
        <div id="content">All good</div>
      </ErrorBoundary>
    ));
    expect(container.element.querySelector('#content')).toBeTruthy();
    expect(container.element.querySelector('#fb')).toBeFalsy();
  });

  it('a recoverable error renders the fallback', async () => {
    const { container } = await renderMode(() => (
      <ErrorBoundary fallback$={fb()}>
        <Thrower />
      </ErrorBoundary>
    ));
    expect(container.element.querySelector('#fb')?.textContent).toContain('caught: boom');
  });

  it('a thrown non-Error class instance is caught', async () => {
    const { container } = await renderMode(() => (
      <ErrorBoundary fallback$={fb()}>
        <NonSerializableThrower />
      </ErrorBoundary>
    ));
    expect(container.element.querySelector('#fb')?.textContent).toContain(
      'caught: non-serializable boom'
    );
  });

  it('a render throw is caught by the NEAREST boundary', async () => {
    const { container } = await renderMode(() => (
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
      </ErrorBoundary>
    ));
    const el = container.element;
    expect(el.querySelector('#fb-inner')).toBeTruthy();
    expect(el.querySelector('#fb-outer')).toBeFalsy();
    expect(el.querySelector('#content')).toBeTruthy();
  });

  it('nested boundaries: when the outer also throws it supersedes the inner fallback', async () => {
    const { container } = await renderMode(() => (
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
          <Thrower message="boomA" />
        </ErrorBoundary>
        <Thrower message="boomB" />
      </ErrorBoundary>
    ));
    const el = container.element;
    expect(el.querySelector('#fb-outer')).toBeTruthy();
    if (mode === 'CSR') {
      expect(el.querySelector('#fb-inner')).toBeFalsy();
    } else {
      const contentHost = el.querySelector('[q\\:ebc]') as HTMLElement;
      expect(contentHost.style.display).toBe('none');
      expect(contentHost.contains(el.querySelector('#fb-inner'))).toBe(true);
      const state = el.querySelector('script[type="qwik/state"]')!;
      const rootCount = (JSON.parse(state.textContent!) as unknown[]).length / 2;
      for (let i = 0; i < rootCount; i++) {
        container.$getObjectById$(i);
      }
    }
  });

  it('two throwing children in one boundary render a single fallback (first error wins)', async () => {
    const { container } = await renderMode(() => (
      <ErrorBoundary fallback$={fb()}>
        <Thrower message="boomA" />
        <Thrower message="boomB" />
      </ErrorBoundary>
    ));
    expect(fbCount(container.element)).toBe(1);
    if (mode === 'CSR') {
      expect(container.element.querySelector('#fb')?.textContent).toContain('caught: boomA');
    }
  });

  it('two adjacent boundaries that both throw each show their own fallback', async () => {
    const { container } = await renderMode(() => (
      <main>
        <ErrorBoundary
          fallback$={$(() => (
            <p id="fb-a">A</p>
          ))}
        >
          <Thrower message="boomA" />
        </ErrorBoundary>
        <ErrorBoundary
          fallback$={$(() => (
            <p id="fb-b">B</p>
          ))}
        >
          <Thrower message="boomB" />
        </ErrorBoundary>
      </main>
    ));
    expect(container.element.querySelector('#fb-a')).toBeTruthy();
    expect(container.element.querySelector('#fb-b')).toBeTruthy();
  });

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
      const contentHost = el.querySelector('[q\\:ebc]') as HTMLElement;
      expect(contentHost.style.display).toBe('none');
      expect(contentHost.contains(sibling)).toBe(true);
    }
  });

  it('a throwing inner fallback escalates to the outer boundary', async () => {
    const { container } = await renderMode(() => <NestedEscalation />);
    await waitForDrain(container).catch(() => {});
    const el = container.element;
    expect(el.querySelector('#fb-outer')?.textContent).toBe('outer');
    expect(el.querySelector('#fb-inner')).toBeFalsy();
    expect(el.ownerDocument.querySelector('[role="alert"]')).toBeFalsy();
  });

  it('a useTask$ throw is caught by the nearest parent <ErrorBoundary>', async () => {
    const { container } = await renderMode(() => (
      <ErrorBoundary fallback$={fb()}>
        <ThrowingTask />
      </ErrorBoundary>
    ));
    await waitForDrain(container);

    const el = container.element;
    expect(el.querySelector('#fb')?.textContent).toContain('caught: task boom');
    expect(el.querySelector('#content')).toBeFalsy();
  });

  it('onError$ receives info.phase "task" for a useTask$ throw', async () => {
    const infos: Array<{ phase: string; boundaryId: string }> = [];
    const { container } = await renderMode(() => (
      <ErrorBoundary
        fallback$={fb()}
        onError$={$((_e: any, info: any) => {
          infos.push({ phase: info.phase, boundaryId: info.boundaryId });
        })}
      >
        <ThrowingTask />
      </ErrorBoundary>
    ));
    await waitForDrain(container);
    await getTestPlatform().flush();

    expect(infos).toHaveLength(1);
    expect(infos[0].phase).toBe('task');
    expect(infos[0].boundaryId.length).toBeGreaterThan(0);
  });

  it('an async useTask$ throw is caught by the nearest <ErrorBoundary>', async () => {
    const { container } = await renderMode(() => (
      <ErrorBoundary fallback$={fb()}>
        <ThrowingTask async message="async task boom" />
      </ErrorBoundary>
    ));
    await waitForDrain(container);

    const el = container.element;
    expect(el.querySelector('#fb')?.textContent).toContain('caught: async task boom');
    expect(el.querySelector('#content')).toBeFalsy();
  });

  it('a useTask$ throw is caught by the NEAREST parent of nested boundaries', async () => {
    const { container } = await renderMode(() => (
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
      </ErrorBoundary>
    ));
    await waitForDrain(container);

    const el = container.element;
    expect(el.querySelector('#fb-inner')).toBeTruthy();
    expect(el.querySelector('#fb-outer')).toBeFalsy();
    expect(el.querySelector('#outer-ok')).toBeTruthy();
  });

  describe('onError$', () => {
    it('fires once with the caught error and does not affect rendering', async () => {
      onErrorLog.errors = [];
      const { container } = await renderMode(() => (
        <ErrorBoundary
          fallback$={fb()}
          onError$={$((e: any) => {
            onErrorLog.errors.push(e instanceof Error ? e.message : e);
          })}
        >
          <Thrower />
        </ErrorBoundary>
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
        <ErrorBoundary fallback$={fb()} onError$={$((e: any) => received.push(e))}>
          <IdentityThrower />
        </ErrorBoundary>
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
          <ErrorBoundary fallback$={fb()} onError$={$((e: any) => received.push(e))}>
            <RawThrower />
          </ErrorBoundary>
        ));
        await settleOnErrorDelivery(container);

        expect(received).toHaveLength(1);
        const seen = received[0] as Error & { cause?: unknown };
        expect(seen).toBeInstanceOf(Error);
        expect(seen.message).toBe(String(raw));
        expect(seen.cause).toBe(raw);
      }
    );

    it('onError$ receives info.phase "render" and a non-empty boundaryId for a render throw', async () => {
      const infos: Array<{ phase: string; boundaryId: string }> = [];
      const { container } = await renderMode(() => (
        <ErrorBoundary
          fallback$={fb()}
          onError$={$((_e: any, info: any) => {
            infos.push({ phase: info.phase, boundaryId: info.boundaryId });
          })}
        >
          <Thrower />
        </ErrorBoundary>
      ));
      await settleOnErrorDelivery(container);

      expect(infos).toHaveLength(1);
      expect(infos[0].phase).toBe('render');
      expect(typeof infos[0].boundaryId).toBe('string');
      expect(infos[0].boundaryId.length).toBeGreaterThan(0);
    });

    it('info.digest matches the digest a production fallback displays', async () => {
      const digests: Array<string | undefined> = [];
      const seen: unknown[] = [];
      const { container } = await renderMode(() => (
        <ErrorBoundary
          fallback$={fb()}
          onError$={$((e: any, info: any) => {
            seen.push(e);
            digests.push(info.digest);
          })}
        >
          <Thrower />
        </ErrorBoundary>
      ));
      await settleOnErrorDelivery(container);

      const onScreen = redactBoundaryErrorForDisplay(seen[0], false) as Error & { digest: string };
      expect(digests).toEqual([onScreen.digest]);
      expect(onScreen.digest).toBeTruthy();
    });

    it('a synchronously throwing onError$ is swallowed; the fallback still renders and info is delivered exactly once', async () => {
      const calls: Array<{ phase: string; boundaryId: string }> = [];
      const { container } = await renderMode(() => (
        <ErrorBoundary
          fallback$={fb()}
          onError$={$((_e: any, info: any) => {
            calls.push({ phase: info.phase, boundaryId: info.boundaryId });
            throw new Error('onError boom');
          })}
        >
          <Thrower />
        </ErrorBoundary>
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
        <ErrorBoundary
          fallback$={fb()}
          onError$={$((e: any) => {
            log.push(e instanceof Error ? e.message : e);
            return Promise.reject(new Error('onError async boom'));
          })}
        >
          <Thrower />
        </ErrorBoundary>
      ));
      await settleOnErrorDelivery(container);

      expect(log).toEqual(['boom']);
      expect(container.element.querySelector('#fb')?.textContent).toContain('caught: boom');
    });

    it('is optional: a boundary without onError$ still catches', async () => {
      const { container } = await renderMode(() => (
        <ErrorBoundary fallback$={fb()}>
          <Thrower />
        </ErrorBoundary>
      ));
      await waitForDrain(container);
      expect(container.element.querySelector('#fb')?.textContent).toContain('caught: boom');
    });

    it('the outer onError$ stays silent when the inner boundary catches cleanly', async () => {
      const outerLog: unknown[] = [];
      const { container } = await renderMode(() => (
        <ErrorBoundary
          fallback$={$(() => (
            <p id="fb-outer">outer</p>
          ))}
          onError$={$((e: any) => {
            outerLog.push(e instanceof Error ? e.message : e);
          })}
        >
          <ErrorBoundary fallback$={fb('fb-inner')}>
            <Thrower />
          </ErrorBoundary>
        </ErrorBoundary>
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

const withRerenderOwner = (
  child: JSXOutput,
  boundaryProps: { fallback$?: any; onError$?: any } = {}
) =>
  component$(() => {
    const ticks = useSignal(0);
    return (
      <main>
        <span id="owner-anchor">{ticks.value}</span>
        <ErrorBoundary
          fallback$={boundaryProps.fallback$ ?? fb()}
          onError$={boundaryProps.onError$}
        >
          {child}
        </ErrorBoundary>
      </main>
    );
  });

const resetResumed = async (container: any) => {
  const c = _getDomContainer(container.element) as any;
  c.resetErrorBoundary(c.vNodeLocate(container.element.querySelector('#retry')));
  await waitForDrain(container);
};

const resetModes = [
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
    'SSR-resume-in-order',
    {
      render: (jsx: JSXOutput) => ssrRenderToDom(jsx, { debug, ...IN_ORDER }),
      driveReset: resetResumed,
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

describe('ErrorBoundary reset', () => {
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
      const App = withResetBoundary(<ResetAlwaysThrows />);
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

  describe('nested boundaries', () => {
    const escalationRef = { fallbackCalls: 0 };
    const EscalationResetApp = component$(() => (
      <ErrorBoundary
        fallback$={$((e: any, reset: any) => (
          <button id="retry-outer" onClick$={() => reset()}>
            outer: {String(e?.message ?? e)}
          </button>
        ))}
      >
        <ErrorBoundary
          fallback$={$(() => {
            escalationRef.fallbackCalls++;
            if (escalationRef.fallbackCalls === 1) {
              throw new Error('inner fallback boom');
            }
            return <p id="fb-inner">inner recovered</p>;
          })}
        >
          <Thrower />
        </ErrorBoundary>
      </ErrorBoundary>
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

    const NestedResetApp = component$(() => (
      <main>
        <ErrorBoundary
          fallback$={$((e: any) => (
            <p id="fb-outer">outer: {String(e?.message ?? e)}</p>
          ))}
        >
          <div id="outer-sibling">outer sibling</div>
          <ErrorBoundary
            fallback$={$((e: any, reset: any) => (
              <button id="retry-inner" onClick$={() => reset()}>
                caught: {e.message}
              </button>
            ))}
          >
            <ResetFlake />
          </ErrorBoundary>
        </ErrorBoundary>
      </main>
    ));

    it('after a server-side error: reset on a nested inner boundary re-executes its children, outer intact', async () => {
      resetRef.flake = 0;
      const { container } = await ssrRenderToDom(<NestedResetApp />, { debug, ...IN_ORDER });
      const el = container.element;
      expect(el.querySelector('#retry-inner')).toBeTruthy();
      expect(el.querySelector('#ok')).toBeFalsy();
      expect(el.querySelector('#outer-sibling')).toBeTruthy();

      const c = _getDomContainer(el) as any;
      c.resetErrorBoundary(c.vNodeLocate(el.querySelector('#retry-inner')));
      await waitForDrain(container);

      expect(el.querySelector('#ok')?.textContent).toContain('ok');
      expect(el.querySelector('#retry-inner')).toBeFalsy();
      expect(el.querySelector('#fb-outer')).toBeFalsy();
      expect(el.querySelector('#outer-sibling')).toBeTruthy();
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
        <ErrorBoundary fallback$={nestedInnerFb}>
          <FallbackNestedFlake />
        </ErrorBoundary>
      </>
    ));
    const FallbackNestedApp = component$(() => (
      <main>
        <ErrorBoundary fallback$={nestedOuterFb}>
          <FallbackOuterOnce />
        </ErrorBoundary>
      </main>
    ));

    it('after a client-side error: reset inside the outer fallback re-executes its child, outer intact', async () => {
      fallbackNestedRef.outerThrown = false;
      fallbackNestedRef.innerThrows = true;
      const { container } = await domRender(<FallbackNestedApp />, { debug });
      await waitForDrain(container).catch(() => {});
      const el = container.element;
      expect(el.querySelector('#outer-fb')).toBeTruthy();
      expect(el.querySelector('#retry-nested')).toBeTruthy();
      expect(el.querySelector('#inner-ok')).toBeFalsy();

      fallbackNestedRef.innerThrows = false;
      const c = _getDomContainer(el) as any;
      c.resetErrorBoundary(c.vNodeLocate(el.querySelector('#retry-nested')));
      await waitForDrain(container);

      expect(el.querySelector('#inner-ok')?.textContent).toContain('inner ok');
      expect(el.querySelector('#retry-nested')).toBeFalsy();
      expect(el.querySelector('#outer-fb')).toBeTruthy();
    });

    // A captured flag freezes across the resume wire; gate on the platform.
    const SsrFallbackAlwaysThrower = component$((): JSXOutput => {
      throw new Error('outer-boom');
    });
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
        <ErrorBoundary fallback$={ssrNestedInnerFb}>
          <SsrFallbackNestedFlake />
        </ErrorBoundary>
      </>
    ));
    const SsrFallbackNestedApp = component$(() => (
      <main>
        <ErrorBoundary fallback$={ssrNestedOuterFb}>
          <SsrFallbackAlwaysThrower />
        </ErrorBoundary>
      </main>
    ));

    it('after a server-side error: reset inside the outer fallback re-derives the outer and recovers the inner', async () => {
      const { container } = await ssrRenderToDom(<SsrFallbackNestedApp />, {
        debug,
        ...IN_ORDER,
      });
      const el = container.element;
      expect(el.querySelector('#ssr-outer-fb')).toBeTruthy();
      expect(el.querySelector('#ssr-retry-nested')).toBeTruthy();
      expect(el.querySelector('#ssr-inner-ok')).toBeFalsy();

      const c = _getDomContainer(el) as any;
      c.resetErrorBoundary(c.vNodeLocate(el.querySelector('#ssr-retry-nested')));
      await waitForDrain(container);

      expect(el.querySelector('#ssr-outer-fb')).toBeTruthy();
      expect(el.querySelector('#ssr-inner-ok')?.textContent).toContain('inner ok');
      expect(el.querySelector('#ssr-retry-nested')).toBeFalsy();
    });
  });

  describe('through wrapper components', () => {
    const WrapperProjector = component$(() => (
      <div data-wrapper="">
        <Slot />
      </div>
    ));
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
    const WrappedResetApp = component$(() => (
      <Suspense fallback={<span id="skel">loading</span>}>
        <WrapperProjector>
          <ErrorBoundary fallback$={wrappedResetFb}>
            <WrappedSsrFlake />
          </ErrorBoundary>
        </WrapperProjector>
      </Suspense>
    ));

    // out-of-order: https://github.com/QwikDev/qwik/issues/8884
    it.each([['in-order', IN_ORDER]] as const)(
      '%s, after a server-side error: reset through a Suspense + Slot-projecting wrapper re-executes the children',
      async (_mode, streamOpts) => {
        const { container } = await ssrRenderToDom(<WrappedResetApp />, { debug, ...streamOpts });
        const el = container.element;
        expect(el.querySelector('#retry-wrapped')).toBeTruthy();
        expect(el.querySelector('#wrapped-ok')).toBeFalsy();

        const c = _getDomContainer(el) as any;
        c.resetErrorBoundary(c.vNodeLocate(el.querySelector('#retry-wrapped')));
        await waitForDrain(container);

        expect(el.querySelector('#wrapped-ok')?.textContent).toContain('recovered');
        expect(el.querySelector('#retry-wrapped')).toBeFalsy();
      }
    );

    // Children arrive through <Slot/> (#8881).
    const BoxedBoundary = component$(() => (
      <ErrorBoundary fallback$={wrappedResetFb}>
        <Slot />
      </ErrorBoundary>
    ));

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
        expect(el.querySelector('#retry-wrapped')).toBeTruthy();

        const c = _getDomContainer(el) as any;
        c.resetErrorBoundary(c.vNodeLocate(el.querySelector('#retry-wrapped')));
        await waitForDrain(container);

        expect(el.querySelector('#wrapped-ok')?.textContent).toContain('recovered');
        expect(el.querySelector('#retry-wrapped')).toBeFalsy();
      }
    );
  });
});

describe('ErrorBoundary CSR-specific', () => {
  describe('qerror routing', () => {
    it('CSR: a qerror routes to the NEAREST of nested boundaries', async () => {
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
      dispatchQError(target, { error: new Error('async boom'), element: target });
      await waitForDrain(container);

      expect(el.querySelector('#fb-inner')).toBeTruthy();
      expect(el.querySelector('#fb-outer')).toBeFalsy();
    });

    it('CSR: a throwing fallback does not infinite-loop handleError', async () => {
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
      dispatchQError(target, { error: new Error('client boom'), element: target });
      await waitForDrain(container).catch(() => {});
      expect(el.querySelector('#target')).toBeFalsy();
      expect(el.querySelector('#fb')).toBeFalsy();
    });

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
        <ErrorBoundary fallback$={fb()}>
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
        <ErrorBoundary fallback$={fb()}>
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

    it('onError$ receives info.phase "event" for a qerror-delivered client error', async () => {
      const infos: Array<{ phase: string; boundaryId: string }> = [];
      const { container } = await domRender(
        <ErrorBoundary
          fallback$={fb()}
          onError$={$((_e: any, info: any) => {
            infos.push({ phase: info.phase, boundaryId: info.boundaryId });
          })}
        >
          <button id="target">x</button>
        </ErrorBoundary>,
        { debug }
      );
      const target = container.element.querySelector('#target')!;
      dispatchQError(target, { error: new Error('client boom'), element: target });
      await settleOnErrorDelivery(container);

      expect(infos).toHaveLength(1);
      expect(infos[0].phase).toBe('event');
      expect(infos[0].boundaryId.length).toBeGreaterThan(0);
    });

    it('CSR: a non-recoverable build error is not caught by the boundary', async () => {
      const { container } = await domRender(
        <ErrorBoundary fallback$={fb()}>
          <button id="content">x</button>
        </ErrorBoundary>,
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
  });

  describe('falsy thrown values', () => {
    const seenFalsy: { errors: unknown[] } = { errors: [] };
    const Boundary = component$(() => {
      return (
        <ErrorBoundary
          fallback$={$((e: any) => {
            seenFalsy.errors.push(e);
            return <p id="fb">caught: {String(e)}</p>;
          })}
        >
          <button id="content">x</button>
        </ErrorBoundary>
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
          <ErrorBoundary
            fallback$={fb('fb-outer')}
            onError$={$((e: any) => {
              outerSeen.push(e);
            })}
          >
            <ErrorBoundary fallback$={fb('fb-inner')}>
              <button id="content">x</button>
            </ErrorBoundary>
          </ErrorBoundary>,
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
        <ErrorBoundary
          fallback$={$((e: any) => (
            <p id="fb-A">caught A: {e.message}</p>
          ))}
        >
          <button id="target-A">a</button>
        </ErrorBoundary>
      );
      await render(
        hostB,
        <ErrorBoundary
          fallback$={$((e: any) => (
            <p id="fb-B">caught B: {e.message}</p>
          ))}
        >
          <button id="target-B">b</button>
        </ErrorBoundary>
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

    it('routes a qerror to the NEAREST owning container when an inner container nests inside an outer one', async () => {
      setPlatform(getTestPlatform());
      const document = createDocument();
      const hostOuter = document.createElement('div');
      document.body.appendChild(hostOuter);
      await render(
        hostOuter,
        <ErrorBoundary
          fallback$={$((e: any) => (
            <p id="fb-outer">caught outer: {e.message}</p>
          ))}
        >
          <div id="embed-host" />
        </ErrorBoundary>
      );
      const embedHost = hostOuter.querySelector('#embed-host')!;
      const hostInner = document.createElement('div');
      embedHost.appendChild(hostInner);
      await render(
        hostInner,
        <ErrorBoundary
          fallback$={$((e: any) => (
            <p id="fb-inner">caught inner: {e.message}</p>
          ))}
        >
          <button id="target-inner">x</button>
        </ErrorBoundary>
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

  it('a useVisibleTask$ throw is caught by the nearest parent <ErrorBoundary>', async () => {
    const ThrowingVisibleTask = component$(() => {
      const state = useSignal('init');
      useVisibleTask$(() => {
        throw new Error('visible task boom');
      });
      return <span id="content">{state.value}</span>;
    });

    const { container } = await domRender(
      <ErrorBoundary fallback$={fb()}>
        <ThrowingVisibleTask />
      </ErrorBoundary>,
      { debug }
    );
    await waitForDrain(container);

    const el = container.element;
    expect(el.querySelector('#fb')?.textContent).toContain('caught: visible task boom');
    expect(el.querySelector('#content')).toBeFalsy();
  });

  describe('last-resort fallback', () => {
    it('CSR: renders a built-in role="alert" node when the fallback$ chunk fails to load', async () => {
      const failingFallback = qrl(
        () => Promise.reject(new Error('chunk load failure')),
        'fb'
      ) as any;
      const { container } = await domRender(
        <ErrorBoundary fallback$={failingFallback}>
          <Thrower />
        </ErrorBoundary>,
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
        <ErrorBoundary
          fallback$={$(() => (
            <p id="fb-outer">outer</p>
          ))}
        >
          <ErrorBoundary fallback$={failingFallback}>
            <Thrower />
          </ErrorBoundary>
        </ErrorBoundary>,
        { debug }
      );
      await waitForDrain(container).catch(() => {});
      const el = container.element;
      const alert = el.querySelector('[role="alert"]');
      expect(alert?.textContent).toContain('Something went wrong');
      expect(el.querySelector('#fb-outer')).toBeFalsy();
    });
  });

  describe('unhandledrejection bridge', () => {
    const renderTwoContainersWithStubbedView = async () => {
      setPlatform(getTestPlatform());
      const document = createDocument();
      const listeners: Record<string, ((e: any) => void)[]> = {};
      const view = document.defaultView as any;
      view.addEventListener = vi.fn((type: string, cb: (e: any) => void) => {
        (listeners[type] ||= []).push(cb);
      });
      const hostA = document.createElement('div');
      const hostB = document.createElement('div');
      document.body.appendChild(hostA);
      document.body.appendChild(hostB);
      await render(hostA, <div id="a">a</div>);
      await render(hostB, <div id="b">b</div>);
      return { document, view, listeners };
    };

    it('registers exactly one unhandledrejection listener across two containers, routing to logError once', async () => {
      const logErrorSpy = vi
        .spyOn(logUtils, 'logError')
        .mockImplementation((message?: any) => message as Error);
      try {
        const { view, listeners } = await renderTwoContainersWithStubbedView();
        const registrations = (view.addEventListener as any).mock.calls.filter(
          (c: any[]) => c[0] === 'unhandledrejection'
        );
        expect(registrations.length).toBe(1);

        const handlers = listeners['unhandledrejection'] ?? [];
        expect(handlers.length).toBe(1);
        const reason = new Error('fire-and-forget rejection');
        handlers[0]({ reason });

        expect(logErrorSpy).toHaveBeenCalledTimes(1);
        expect(logErrorSpy).toHaveBeenCalledWith(reason);
      } finally {
        logErrorSpy.mockRestore();
      }
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

describe('ErrorBoundary SSR-specific', () => {
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

  it('routes an <SSRStream> generator throw to the boundary, already-streamed chunks intact', async () => {
    const { container } = await ssrRenderToDom(
      <ErrorBoundary fallback$={fb()}>
        <AsyncGenThrower />
      </ErrorBoundary>,
      { debug }
    );
    const el = container.element;
    expect(el.querySelector('#fb')?.textContent).toContain('caught: async gen boom');
    expect(el.querySelector('#chunk')).toBeTruthy();
  });

  it('routes an <SSRStream> writer-function throw to the boundary', async () => {
    const { container } = await ssrRenderToDom(
      <ErrorBoundary fallback$={fb()}>
        <StreamWriterThrower />
      </ErrorBoundary>,
      { debug }
    );
    expect(container.element.querySelector('#fb')?.textContent).toContain(
      'caught: stream writer boom'
    );
  });

  it('onError$ receives info.phase "async-generator" for an <SSRStream> generator throw', async () => {
    const infos: Array<{ phase: string; boundaryId: string }> = [];
    await ssrRenderToDom(
      <ErrorBoundary
        fallback$={fb()}
        onError$={$((_e: any, info: any) => {
          infos.push({ phase: info.phase, boundaryId: info.boundaryId });
        })}
      >
        <AsyncGenThrower />
      </ErrorBoundary>,
      { debug }
    );
    await getTestPlatform().flush();
    await delay(0);
    expect(infos).toHaveLength(1);
    expect(infos[0].phase).toBe('async-generator');
    expect(infos[0].boundaryId.length).toBeGreaterThan(0);
  });

  const NormalErrorThrower = component$((): JSXOutput => {
    throw new Error('normal boom');
  });

  it('a normal Error throw is unchanged (still renders its fallback)', async () => {
    const { container } = await ssrRenderToDom(
      <ErrorBoundary
        fallback$={$((e: Error) => (
          <p id="fb">caught: {e.message}</p>
        ))}
      >
        <NormalErrorThrower />
      </ErrorBoundary>,
      { debug }
    );
    expect(container.element.querySelector('#fb')?.textContent).toContain('caught: normal boom');
  });

  const UndefinedThrower = component$((): JSXOutput => {
    throw undefined;
  });

  it('a throw of undefined during SSR render reveals the fallback', async () => {
    const { container } = await ssrRenderToDom(
      <ErrorBoundary fallback$={fb()}>
        <UndefinedThrower />
      </ErrorBoundary>,
      { debug }
    );
    expect(container.element.querySelector('#fb')).toBeTruthy();
  });

  it('SSR: a non-recoverable build error is NOT hidden in the fallback (it surfaces)', async () => {
    await expect(
      ssrRenderToDom(
        <ErrorBoundary fallback$={fb()}>
          <PluginThrower />
        </ErrorBoundary>,
        { debug }
      )
    ).rejects.toThrow('build boom');
  });
});

describe('ErrorBoundary function children', () => {
  const throwingFnChild = (message = 'jsx error') =>
    (() => {
      throw new Error(message);
    }) as unknown as JSXOutput;

  it('SSR: a sync function-child throw renders the fallback', async () => {
    const { container } = await ssrRenderToDom(
      <ErrorBoundary fallback$={fb()}>{throwingFnChild()}</ErrorBoundary>,
      { debug }
    );
    expect(container.element.querySelector('#fb')?.textContent).toContain('caught: jsx error');
  });

  it('SSR OOOS: a sync function-child throw inside a Suspense segment renders the fallback', async () => {
    const { document } = await streamAndResume(
      <main>
        <Suspense fallback={<span id="skel">loading</span>}>
          <ErrorBoundary fallback$={fb()}>{throwingFnChild()}</ErrorBoundary>
        </Suspense>
      </main>,
      OOOS
    );
    expect(document.querySelector('#fb')?.textContent).toContain('caught: jsx error');
  });

  it('SSR: an async function child whose promise rejects renders the fallback', async () => {
    const asyncThrower = (async () => {
      throw new Error('async jsx error');
    }) as unknown as JSXOutput;
    const { container } = await ssrRenderToDom(
      <ErrorBoundary fallback$={fb()}>{asyncThrower}</ErrorBoundary>,
      { debug }
    );
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
    const { container } = await ssrRenderToDom(
      <ErrorBoundary fallback$={fb()}>{thunk}</ErrorBoundary>,
      { debug }
    );
    expect(container.element.querySelector('#thunk')).toBeFalsy();
    expect(container.element.querySelector('#fb')).toBeFalsy();
  });

  it('CSR: a function child inside a boundary renders empty — no crash, no fallback', async () => {
    const { container } = await domRender(
      <ErrorBoundary fallback$={fb()}>{throwingFnChild()}</ErrorBoundary>,
      { debug }
    );
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
      <ErrorBoundary
        fallback$={fb()}
        onError$={$((e: any, info: any) => {
          received.push(e);
          infos.push({ phase: info.phase });
        })}
      >
        {identityThrower}
      </ErrorBoundary>,
      { debug, ...IN_ORDER }
    );
    await settleOnErrorDelivery(container);

    expect(received).toHaveLength(1);
    expect(received[0]).toBe(original);
    expect(infos).toEqual([{ phase: 'render' }]);
  });
});

describe('ErrorBoundary SSR→CSR cross-phase', () => {
  it('fires once from serialized props.onError$ on a post-resume client error', async () => {
    (globalThis as any).__ebOnErrorLog = [];
    const { container } = await ssrRenderToDom(
      <ErrorBoundary
        fallback$={fb()}
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
    await settleOnErrorDelivery(container);

    expect((globalThis as any).__ebOnErrorLog).toEqual(['client boom']);
    expect(el.querySelector('#fb')?.textContent).toContain('caught: client boom');
    delete (globalThis as any).__ebOnErrorLog;
  });

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

  it.each(streamingModes)(
    '%s: a post-resume client error collapses the two-host boundary cleanly (no Missing child)',
    async (_label, streamingOpts) => {
      const { container } = await ssrRenderToDom(
        <main>
          <ErrorBoundary fallback$={fb()}>
            <button id="target">x</button>
            <div id="content">content ok</div>
          </ErrorBoundary>
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
      expect(el.querySelector('[q\\:ebc]')).toBeFalsy();
      expect(el.querySelector('[q\\:ebf]')).toBeFalsy();
    }
  );

  it('a qerror on a resumed container routes to the NEAREST of nested boundaries', async () => {
    const { container } = await ssrRenderToDom(
      <main>
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
        </ErrorBoundary>
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

describe('ErrorBoundary client re-derivation', () => {
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

  it('a client error fires the serialized onError$ again after an SSR catch', async () => {
    (globalThis as any).__ebRederiveLog = [];
    const App = withRerenderOwner(<Thrower message="rederive boom" />, {
      onError$: $((e: any) => {
        ((globalThis as any).__ebRederiveLog ||= []).push(e instanceof Error ? e.message : e);
      }),
    });
    const { container } = await ssrRenderToDom(<App />, { debug });
    const el = container.element;
    expect((globalThis as any).__ebRederiveLog).toEqual(['rederive boom']);

    await rerenderComponent(el.querySelector('#owner-anchor') as HTMLElement);
    await settleOnErrorDelivery(container);

    expect((globalThis as any).__ebRederiveLog).toEqual(['rederive boom', 'rederive boom']);
    delete (globalThis as any).__ebRederiveLog;
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
      const contentHost = el.querySelector('[q\\:ebc]') as HTMLElement;
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
        <ErrorBoundary fallback$={fb()}>
          <div id="content">content</div>
          <Thrower />
        </ErrorBoundary>
      </main>,
      { debug }
    );
    const el = container.element;
    const contentHost = el.querySelector('[q\\:ebc]') as HTMLElement;
    expect(contentHost.style.display).toBe('none');

    await rerenderComponent(el.querySelector('#outside') as HTMLElement);
    await waitForDrain(container);

    expect(contentHost.style.display).toBe('none');
    expect(el.querySelector('#fb')).toBeTruthy();
  });
});

describe('ErrorBoundary swap mechanics (qErr)', () => {
  it('happy path (default streaming): renders the content unchanged and ships no swap JS', async () => {
    const { html, document } = await streamAndResume(
      <main>
        <ErrorBoundary fallback$={fb()}>
          <div id="content">all good</div>
        </ErrorBoundary>
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
        <ErrorBoundary fallback$={fb()}>
          <div id="before">before</div>
          <Thrower />
          <div id="after">after</div>
        </ErrorBoundary>
      </main>
    );
    const contentHost = document.querySelector('[q\\:ebc]') as HTMLElement | null;
    const fallbackHost = document.querySelector('[q\\:ebf]') as HTMLElement | null;
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
        <ErrorBoundary fallback$={fb()}>
          <Thrower />
        </ErrorBoundary>
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
    const contentHost = el.querySelector('[q\\:ebc]') as HTMLElement;
    expect(contentHost.contains(outsideBefore)).toBe(false);
    expect(contentHost.contains(outsideAfter)).toBe(false);
  });

  it('awaited-async throw: fallback delivered in document order (sibling host)', async () => {
    const { container } = await ssrRenderToDom(
      <main>
        <ErrorBoundary fallback$={fb()}>
          <div id="before">before</div>
          <AsyncThrower />
        </ErrorBoundary>
      </main>,
      { debug, ...IN_ORDER }
    );
    const el = container.element;
    const contentHost = el.querySelector('[q\\:ebc]') as HTMLElement;
    const fallbackHost = el.querySelector('[q\\:ebf]') as HTMLElement;
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
        <ErrorBoundary fallback$={fb()}>
          <div id="lvl1">
            <section id="lvl2">
              <article id="lvl3">
                <Thrower />
              </article>
            </section>
          </div>
        </ErrorBoundary>
      </main>,
      { debug, ...IN_ORDER }
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
        <ErrorBoundary fallback$={fb()}>
          <FalsyThrower />
        </ErrorBoundary>
      </main>
    );
    expect(document.querySelector('#fb')?.textContent).toContain('caught: 0');
    expect(html).toContain('qErr(');
    expect(html).not.toMatch(/qO\(/);
  });

  it('escalates to the outer boundary under explicit out-of-order (in place via qErr)', async () => {
    const { html, document } = await streamAndResume(<NestedEscalation />, OOOS);
    expect(document.querySelector('#fb-outer')?.textContent).toBe('outer');
    expect(displayOf(document.querySelector('[q\\:ebc]'))).toBe('none');
    expect(document.querySelector('#fb-outer')?.closest('[q\\:ebf]')).toBeTruthy();
    expect(html).toContain('qErr(');
  });

  it('nested boundaries: the inner one tears down in place via qErr, the outer subtree stays visible', async () => {
    const { html, document } = await streamAndResume(
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
      </main>,
      OOOS
    );
    expect(document.querySelector('#fb-inner')).toBeTruthy();
    expect(document.querySelector('#fb-outer')).toBeFalsy();
    expect(document.querySelector('#outer-sibling')).toBeTruthy();
    expect(displayOf(document.querySelector('#before')?.closest('[q\\:ebc]'))).toBe('none');
    expect(displayOf(document.querySelector('#outer-sibling')?.closest('[q\\:ebc]'))).toBe(
      'contents'
    );
    expect(document.querySelector('#fb-inner')?.closest('[q\\:ebf]')).toBeTruthy();
    expect(html).toContain('qErr(');
  });

  it('sibling boundaries swap independently (in place via qErr, out-of-order)', async () => {
    const { html, document } = await streamAndResume(
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
      </main>,
      OOOS
    );
    expect(document.querySelector('#fb-a')).toBeTruthy();
    expect(document.querySelector('#ok-b')?.textContent).toBe('b ok');
    expect(document.querySelector('#fb-b')).toBeFalsy();
    expect(displayOf(document.querySelector('#fb-a')?.closest('[q\\:ebf]'))).toBe('contents');
    expect(displayOf(document.querySelector('#ok-b')?.closest('[q\\:ebc]'))).toBe('contents');
    expect(html).toContain('qErr(');
  });

  it.each([
    { kind: 'an async component that rejects', Cmp: AsyncRejector, message: 'async boom' },
    { kind: 'a rejected promise child', Cmp: AsyncThrower, message: 'async boom' },
    { kind: 'an async signal that rejects', Cmp: AsyncSignalThrower, message: 'async signal boom' },
  ])(
    '$kind (no <Suspense>) swaps in place via qErr under out-of-order streaming',
    async ({ Cmp, message }) => {
      const { html, document } = await streamAndResume(
        <main>
          <ErrorBoundary fallback$={fb()}>
            <div id="before">before</div>
            <Cmp />
          </ErrorBoundary>
        </main>,
        OOOS
      );
      const fbEl = document.querySelector('#fb');
      expect(fbEl?.textContent).toContain(`caught: ${message}`);
      expect(fbEl?.closest('[q\\:ebf]')).toBeTruthy();
      expect(fbEl?.closest('[q\\:rp]')).toBeFalsy();
      expect(displayOf(document.querySelector('#before')?.closest('[q\\:ebc]'))).toBe('none');
      expect(html).toContain('qErr(');
      expect(html).not.toMatch(/qO\(/);
    }
  );

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
        </main>,
        OOOS
      )
    ).rejects.toThrow('fallback boom');
  });

  it('onError$ receives info.phase "async-signal" for a rejecting async signal', async () => {
    (globalThis as any).__ebAsyncSignalInfo = [];
    await streamAndResume(
      <main>
        <ErrorBoundary
          fallback$={fb()}
          onError$={$((_e: any, info: any) => {
            ((globalThis as any).__ebAsyncSignalInfo ||= []).push({
              phase: info.phase,
              boundaryId: info.boundaryId,
            });
          })}
        >
          <div id="before">before</div>
          <AsyncSignalThrower />
        </ErrorBoundary>
      </main>
    );
    const infos = (globalThis as any).__ebAsyncSignalInfo as Array<{
      phase: string;
      boundaryId: string;
    }>;
    expect(infos).toHaveLength(1);
    expect(infos[0].phase).toBe('async-signal');
    expect(infos[0].boundaryId.length).toBeGreaterThan(0);
    delete (globalThis as any).__ebAsyncSignalInfo;
  });

  it('a sync throw in a boundary that is a SIBLING of a real Suspense segment still swaps in place via qErr', async () => {
    const SlowResolver = component$(() => {
      const pending = delay(5).then(() => <span id="deferred-ok">deferred ok</span>) as any;
      return <>{pending}</>;
    });
    const { html, document } = await streamAndResume(
      <main>
        <ErrorBoundary fallback$={fb()}>
          <div id="before">before</div>
          <Thrower />
        </ErrorBoundary>
        <Suspense fallback={<span id="skel">loading</span>}>
          <SlowResolver />
        </Suspense>
      </main>,
      OOOS
    );
    const fbEl = document.querySelector('#fb');
    expect(fbEl?.textContent).toContain('caught: boom');
    expect(fbEl?.closest('[q\\:ebf]')).toBeTruthy();
    expect(fbEl?.closest('[q\\:rp]')).toBeFalsy();
    expect(displayOf(document.querySelector('#before')?.closest('[q\\:ebc]'))).toBe('none');
    expect(html).toContain('qErr(');
    expect(document.querySelector('#deferred-ok')?.textContent).toBe('deferred ok');
    expect(html).toContain('qO(');
  });
});

describe('ErrorBoundary discards queued content after a catch', () => {
  it('a queued sibling component after the throw never executes and emits no HTML', async () => {
    const executed: string[] = [];
    const AfterSibling = component$(() => {
      executed.push('after');
      return <div id="after-cmp">after</div>;
    });
    const { container } = await ssrRenderToDom(
      <ErrorBoundary fallback$={fb()}>
        <div id="before">before</div>
        <Thrower />
        <AfterSibling />
        <div id="after-static">after-static</div>
      </ErrorBoundary>,
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
      <ErrorBoundary fallback$={fb()}>
        <Thrower />
        {neverSettles}
      </ErrorBoundary>,
      { debug, ...IN_ORDER }
    );
    expect(container.element.querySelector('#fb')?.textContent).toContain('caught: boom');
  });

  it('a later-rejecting promise sibling after the throw is discarded but stays observed', async () => {
    let rejectLate!: (e: unknown) => void;
    const late = new Promise<JSXOutput>((_, reject) => (rejectLate = reject));
    const { container } = await ssrRenderToDom(
      <ErrorBoundary fallback$={fb()}>
        <Thrower />
        {late}
      </ErrorBoundary>,
      { debug, ...IN_ORDER }
    );
    expect(container.element.querySelector('#fb')?.textContent).toContain('caught: boom');
    rejectLate(new Error('late boom'));
    await delay(5);
  });

  it('an inner-boundary catch discards only inner queued content', async () => {
    const { container } = await ssrRenderToDom(
      <ErrorBoundary fallback$={fb('fb-outer')}>
        <div id="outer-before">outer-before</div>
        <ErrorBoundary fallback$={fb('fb-inner')}>
          <Thrower />
          <div id="inner-after">inner-after</div>
        </ErrorBoundary>
        <div id="outer-after">outer-after</div>
      </ErrorBoundary>,
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
      <ErrorBoundary fallback$={fb()}>
        <Thrower />
        {
          (() => {
            invoked.push('fn-child');
            return null;
          }) as any
        }
      </ErrorBoundary>,
      { debug, ...IN_ORDER }
    );
    expect(container.element.querySelector('#fb')?.textContent).toContain('caught: boom');
    expect(invoked).toEqual([]);
  });
});

describe('ErrorBoundary out-of-order streaming (Suspense)', () => {
  it('out-of-order is the default: a bare Suspense render emits the qO executor; IN_ORDER opts out', async () => {
    const DeferredOk = component$(() => {
      const pending = delay(1).then(() => <span id="late">late</span>) as Promise<JSXOutput>;
      return <>{pending}</>;
    });
    const tree = () => (
      <main>
        <Suspense fallback={<span id="skel">loading</span>}>
          <DeferredOk />
        </Suspense>
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
        <Suspense fallback={<span id="skel">loading</span>}>
          <ErrorBoundary
            fallback$={$(() => (
              <p id="fb-a">A</p>
            ))}
          >
            <Thrower message="boomA" />
          </ErrorBoundary>
        </Suspense>
        <Suspense fallback={<span id="skel">loading</span>}>
          <ErrorBoundary
            fallback$={$(() => (
              <p id="fb-b">B</p>
            ))}
          >
            <Thrower message="boomB" />
          </ErrorBoundary>
        </Suspense>
      </main>,
      OOOS
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
            <Thrower message="boomA" />
          </ErrorBoundary>
          <ErrorBoundary
            fallback$={$(() => (
              <p id="fb-b">B</p>
            ))}
          >
            <Thrower message="boomB" />
          </ErrorBoundary>
        </Suspense>
      </main>,
      OOOS
    );
    expect(document.querySelector('#fb-a')).toBeTruthy();
    expect(document.querySelector('#fb-b')).toBeTruthy();
  });

  it('a deferred (async) throw inside a child <Suspense> tears down the WHOLE boundary', async () => {
    const { html, document } = await streamAndResume(
      <main>
        <ErrorBoundary fallback$={fb()}>
          <div id="sibling">sibling</div>
          <Suspense fallback={<span id="skel">loading</span>}>
            <AsyncThrower />
          </Suspense>
        </ErrorBoundary>
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
  ])('%s: a sync throw inside a <Suspense> reports to onError$ exactly once', async (_m, opts) => {
    const fires: string[] = [];
    await ssrRenderToDom(
      <main>
        <ErrorBoundary
          fallback$={fb()}
          onError$={$((e: any) => {
            fires.push(e.message);
          })}
        >
          <Suspense fallback={<span id="skel">loading</span>}>
            <Thrower />
          </Suspense>
        </ErrorBoundary>
      </main>,
      { debug, ...opts }
    );

    expect(fires).toEqual(['boom']);
  });

  it('a sync throw inside a <Suspense> boundary swaps within the segment', async () => {
    const { document } = await streamAndResume(
      <main>
        <Suspense fallback={<span id="loading">loading</span>}>
          <ErrorBoundary fallback$={fb()}>
            <div id="before">before</div>
            <Thrower />
            <div id="after">after</div>
          </ErrorBoundary>
        </Suspense>
      </main>,
      OOOS
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
          <ErrorBoundary fallback$={fb()}>
            <div id="before">before</div>
            <AsyncThrower />
            <div id="after">after</div>
          </ErrorBoundary>
        </Suspense>
      </main>,
      OOOS
    );
    expect(document.querySelector('#fb')?.textContent).toContain('caught: async boom');
    const contentHost = document.querySelector('[q\\:ebc]');
    expect(contentHost?.querySelector('#before')).toBeTruthy();
    expect(displayOf(contentHost)).toBe('none');
  });

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
            <ErrorBoundary fallback$={fb('fb-inner')}>
              <Thrower />
            </ErrorBoundary>
          </Suspense>
        </ErrorBoundary>
      </main>,
      OOOS
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
            <ErrorBoundary fallback$={fb('fb-mid')}>
              <div id="mid-ok">mid-ok</div>
              <Suspense fallback={<span id="skel-b">b</span>}>
                <Thrower />
              </Suspense>
            </ErrorBoundary>
          </Suspense>
        </ErrorBoundary>
      </main>,
      OOOS
    );
    expect(document.querySelector('#fb-mid')?.textContent).toContain('caught: boom');
    expect(document.querySelector('#fb-outer')).toBeFalsy();
    expect(document.querySelector('#outer-ok')?.textContent).toBe('outer-ok');
  });

  it('two sibling <Suspense> that both reject tear the boundary down exactly once', async () => {
    const { document } = await streamAndResume(
      <main>
        <ErrorBoundary fallback$={fb()}>
          <div id="sibling">sibling</div>
          <Suspense fallback={<span id="skel-a">loading a</span>}>
            <AsyncThrower />
          </Suspense>
          <Suspense fallback={<span id="skel-b">loading b</span>}>
            <AsyncThrower />
          </Suspense>
        </ErrorBoundary>
      </main>,
      OOOS
    );

    const fallbacks = document.querySelectorAll('#fb');
    expect(fallbacks.length).toBe(1);
    expect(fallbacks[0]?.textContent).toContain('caught: async boom');
    expect(displayOf(document.querySelector('#fb')?.closest('[q\\:rp]'))).toBe('contents');
    expect(displayOf(document.querySelector('#sibling')?.closest('div[style]'))).toBe('none');
  });

  it('an in-place throw beside a deferred <Suspense> swaps via qErr and absorbs the late rejection', async () => {
    const SlowRejector = component$(() => {
      const pending = delay(5).then(() => Promise.reject(new Error('late boom'))) as any;
      return <>{pending}</>;
    });
    const { html, document } = await streamAndResume(
      <main>
        <ErrorBoundary fallback$={fb()}>
          <Thrower />
          <Suspense fallback={<span id="skel">loading</span>}>
            <SlowRejector />
          </Suspense>
        </ErrorBoundary>
      </main>,
      OOOS
    );
    expect(fbCount(document)).toBe(1);
    expect(document.querySelector('#fb')?.textContent).toContain('caught: boom');
    expect(document.querySelector('#fb')?.closest('[q\\:ebf]')).toBeTruthy();
    expect(html).toContain('qErr(');
  });

  it('onError$ fires once for an SSR-caught throw (out-of-order) and not again on resume', async () => {
    onErrorLog.errors = [];
    await ssrRenderToDom(
      <ErrorBoundary
        fallback$={fb()}
        onError$={$((e: any) => {
          onErrorLog.errors.push(e instanceof Error ? e.message : e);
        })}
      >
        <Thrower />
      </ErrorBoundary>,
      { debug, ...OOOS }
    );
    await getTestPlatform().flush();
    await delay(0);
    expect(onErrorLog.errors).toEqual(['boom']);
  });
});

describe('ErrorBoundary late-delivered fallback', () => {
  // Boundary OUTSIDE a <Suspense> whose child rejects late: the catch rethrows
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
        <ErrorBoundary fallback$={fb()}>
          <Suspense fallback={<span id="skel">loading</span>}>
            <LateRejector />
          </Suspense>
        </ErrorBoundary>
      </main>,
      { debug, ...OOOS }
    );
    const el = container.element;
    emulateExecutionOfStreamingOutOfOrderScripts(el.ownerDocument, ['qErr', 'qInstallErrorSwap']);
    expect(el.querySelector('#fb')?.textContent).toContain('caught: late boom');
  });

  // https://github.com/QwikDev/qwik/issues/8885
  it.skip('marks the errored content inert: a bound attribute stops tracking after resume', async () => {
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
          <ErrorBoundary fallback$={fb()}>
            <Bound src={src} />
            <Suspense fallback={<span id="skel">loading</span>}>
              <LateRejector />
            </Suspense>
          </ErrorBoundary>
        </main>
      );
    });
    const { container } = await ssrRenderToDom(<App />, { debug, ...OOOS });
    const el = container.element;
    emulateExecutionOfStreamingOutOfOrderScripts(el.ownerDocument, ['qErr', 'qInstallErrorSwap']);
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
        <ErrorBoundary fallback$={fb()}>
          <DeadTask />
          <Suspense fallback={<span id="skel">loading</span>}>
            <LateRejector />
          </Suspense>
        </ErrorBoundary>
      </main>,
      { debug, ...OOOS }
    );
    const el = container.element;
    emulateExecutionOfStreamingOutOfOrderScripts(el.ownerDocument, ['qErr', 'qInstallErrorSwap']);
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
        <ErrorBoundary fallback$={fb()}>
          <Suspense fallback={<span id="skel">loading</span>}>
            <SecretLateRejector />
          </Suspense>
        </ErrorBoundary>
      </main>,
      { ...OOOS, transformError: () => new Error('redacted-by-app') }
    );
    expect(document.querySelector('#fb')?.textContent).toContain('redacted-by-app');
    expect(html).not.toContain('SECRET-late-detail');
  });
});

describe('ErrorBoundary inert subtree', () => {
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
          <ErrorBoundary fallback$={fb()}>
            <Bound src={src} />
            <Thrower />
          </ErrorBoundary>
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
        <ErrorBoundary fallback$={fb()}>
          <DeadTask />
          <Thrower />
        </ErrorBoundary>
      </main>,
      { debug }
    );

    await expect(trigger(container.element, null, 'd:qinit')).resolves.not.toThrow();
    expect(logErrorSpy).not.toHaveBeenCalled();
    logErrorSpy.mockRestore();
  });
});

describe('ErrorBoundary stateless wire', () => {
  const WireSecretThrower = component$((): JSXOutput => {
    throw new Error('wire-secret-boom');
  });

  it('an SSR-errored boundary serializes neither the error nor its message', async () => {
    const { html, document } = await streamAndResume(
      <main>
        <ErrorBoundary
          fallback$={$(() => (
            <p id="fb">static fallback</p>
          ))}
        >
          <WireSecretThrower />
        </ErrorBoundary>
      </main>
    );
    expect(document.querySelector('#fb')).toBeTruthy();
    expect(html).not.toContain('wire-secret-boom');
  });

  it('the boundary store serializes only boundaryId, and no error key', async () => {
    const { container } = await ssrRenderToDom(
      <main>
        <ErrorBoundary fallback$={fb()}>
          <Thrower />
        </ErrorBoundary>
      </main>,
      { debug }
    );
    const el = container.element;
    const state = el.querySelector('script[type="qwik/state"]')!;
    const rootCount = (JSON.parse(state.textContent!) as unknown[]).length / 2;
    let store: Record<string, unknown> | undefined;
    for (let i = 0; i < rootCount; i++) {
      const root = container.$getObjectById$(i);
      if (root && typeof root === 'object' && 'boundaryId' in root && 'error' in root === false) {
        store = root as Record<string, unknown>;
      }
    }
    expect(store).toBeDefined();
    expect('error' in store!).toBe(false);
    expect(Object.keys(store!)).toEqual(['boundaryId']);
  });
});

describe('ErrorBoundary transformError (render option)', () => {
  it('transformError (render option): redacts the SSR-serialized boundary error end-to-end', async () => {
    const { container } = await ssrRenderToDom(
      <ErrorBoundary fallback$={fb()}>
        <Thrower message="SECRET-db-detail" />
      </ErrorBoundary>,
      { debug, transformError: () => new Error('redacted-by-app') }
    );
    const text = container.element.querySelector('#fb')?.textContent;
    expect(text).toContain('redacted-by-app');
    expect(text).not.toContain('SECRET');
  });

  it('transformError (render option): declining on a PublicError renders its data unredacted', async () => {
    const { container } = await ssrRenderToDom(
      <ErrorBoundary
        fallback$={$((e: any) => (
          <p id="fb">{e instanceof PublicError ? `public:${e.data.sku}` : 'not-public'}</p>
        ))}
      >
        <PublicThrower />
      </ErrorBoundary>,
      {
        debug,
        transformError: (e: unknown) =>
          e instanceof Error && e.message.startsWith('transform:') ? e : undefined,
      }
    );
    expect(container.element.querySelector('#fb')?.textContent).toBe('public:A1');
  });

  it('transformError (render option): a projection with unserializable fields renders its own message and SSR still completes', async () => {
    const { container } = await ssrRenderToDom(
      <ErrorBoundary fallback$={fb()}>
        <Thrower message="SECRET-db-detail" />
      </ErrorBoundary>,
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

describe('ErrorBoundary PublicError (rendered)', () => {
  it.each(streamingModes)(
    '%s: a thrown PublicError renders its message through the fallback and does NOT serialize its data',
    async (_label, streamingOpts) => {
      const { html, document } = await streamAndResume(
        <main>
          <ErrorBoundary fallback$={fb()}>
            <PublicThrower />
          </ErrorBoundary>
        </main>,
        streamingOpts
      );
      expect(document.querySelector('#fb')?.textContent).toContain('caught: Out of stock');
      expect(html).not.toContain('A1');
      expect(html).not.toContain('An error occurred');
    }
  );

  it.each(streamingModes)(
    '%s: a client re-render re-derives a PublicError with readable data',
    async (_label, streamingOpts) => {
      const App = withRerenderOwner(<PublicThrower />, {
        fallback$: $((e: any) => (
          <p id="fb">{e instanceof PublicError ? `public:${e.data.sku}` : 'not-public'}</p>
        )),
      });
      const { container } = await ssrRenderToDom(<App />, { debug, ...streamingOpts });
      const el = container.element;
      expect(el.querySelector('#fb')?.textContent).toBe('public:A1');

      await rerenderComponent(el.querySelector('#owner-anchor') as HTMLElement);
      await waitForDrain(container);
      expect(el.querySelector('#fb')?.textContent).toBe('public:A1');
    }
  );

  it('CSR: an event handler throwing a PublicError shows its message in the fallback', async () => {
    const Clicker = component$(() => (
      <button
        onClick$={() => {
          throw new PublicError('Out of stock');
        }}
      >
        go
      </button>
    ));
    const { container } = await domRender(
      <ErrorBoundary fallback$={fb()}>
        <Clicker />
      </ErrorBoundary>,
      { debug }
    );
    await trigger(container.element, 'button', 'click');
    expect(container.element.querySelector('#fb')?.textContent).toContain('caught: Out of stock');
  });

  it('an inner fallback throwing a PublicError escalates to the outer boundary unredacted', async () => {
    const { container } = await ssrRenderToDom(
      <ErrorBoundary fallback$={fb('fb-outer')}>
        <ErrorBoundary
          fallback$={$(() => {
            throw new PublicError('outer-facing');
          })}
        >
          <Thrower />
        </ErrorBoundary>
      </ErrorBoundary>,
      { debug }
    );
    await waitForDrain(container).catch(() => {});
    expect(container.element.querySelector('#fb-outer')?.textContent).toContain(
      'caught: outer-facing'
    );
  });
});

describe('ErrorBoundary hostile thrown values (render paths)', () => {
  it('SSR: a component throwing a revoked Proxy still renders the fallback', async () => {
    const HostileThrower = component$((): JSXOutput => {
      const { proxy, revoke } = Proxy.revocable({}, {});
      revoke();
      throw proxy;
    });
    const { container } = await ssrRenderToDom(
      <ErrorBoundary fallback$={fb()}>
        <HostileThrower />
      </ErrorBoundary>,
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
      <ErrorBoundary fallback$={fb()}>
        <HostileClicker />
      </ErrorBoundary>,
      { debug }
    );
    await trigger(container.element, 'button', 'click');
    expect(container.element.querySelector('#fb')).toBeTruthy();
  });
});

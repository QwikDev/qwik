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
import { processOutOfOrderSegmentVNodeData } from '../client/process-vnode-data';
import { rerenderComponent } from '../../testing/rendering.unit-util';
import { delay } from '../shared/utils/promises';
import {
  markBoundaryErrored,
  redactBoundaryErrorForDisplay,
  toSerializableBoundaryError,
  type ErrorBoundaryStore,
} from '../shared/error/error-handling';

const debug = false;

const OOOS_OPT_IN = {
  streaming: { inOrder: { strategy: 'disabled' as const }, outOfOrder: true },
};
const IN_ORDER = { streaming: { outOfOrder: false } };

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

const settleOnErrorDelivery = async (container: Parameters<typeof waitForDrain>[0]) => {
  await waitForDrain(container).catch(() => {});
  await getTestPlatform().flush();
  await delay(0);
};

// Fresh QRL per call: must not cross containers.
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

const NamedSlotProjector = component$(() => {
  return (
    <ErrorBoundary fallback$={fb()}>
      <div id="named-host">
        <Slot name="danger" />
      </div>
    </ErrorBoundary>
  );
});

// `.plugin`-stamped errors are non-recoverable; boundary must not hide them.
const PluginThrower = component$(() => {
  const err = new Error('build boom');
  (err as any).plugin = 'vite:some-plugin';
  throw err;
});

const boxed = (child: JSXOutput) => <ErrorBoundary fallback$={fb()}>{child}</ErrorBoundary>;

// Fresh tree per test: a reused JSX object trips "props across containers".
const nestedEscalation = ({
  innerOnError,
  outerOnError,
}: { innerOnError?: any; outerOnError?: any } = {}) => (
  <ErrorBoundary
    fallback$={$(() => (
      <p id="fb-outer">outer</p>
    ))}
    onError$={outerOnError}
  >
    <ErrorBoundary
      fallback$={$(() => {
        throw new Error('inner fallback boom');
      })}
      onError$={innerOnError}
    >
      <Thrower />
    </ErrorBoundary>
  </ErrorBoundary>
);

// Object ref survives `$()` capture; a `let` would freeze at its initial value.
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
] as const;

describe.each(modes)('ErrorBoundary behavior (%s)', (mode, renderMode) => {
  const modeOpts = mode === 'SSR' ? IN_ORDER : {};

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
    const { container } = await renderMode(() => boxed(<Thrower />));
    expect(container.element.querySelector('#fb')?.textContent).toContain('caught: boom');
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
      // No serialized refs may dangle into the inert region.
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
      // Only CSR guarantees first-error-wins; SSR surfaces the last.
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

  it('named-slot projection: a throw in named-slot content is caught by the projected-into boundary', async () => {
    const { container } = await renderMode(
      () => (
        <NamedSlotProjector>
          <div q:slot="danger">
            <Thrower />
          </div>
        </NamedSlotProjector>
      ),
      modeOpts
    );
    expect(container.element.querySelector('#fb')?.textContent).toContain('caught: boom');
  });

  it('only the fallback shows: the non-throwing sibling and the projected throw are neutralized', async () => {
    const { container } = await renderMode(
      () => (
        <BoxedWithSibling>
          <Thrower />
          <div id="projected-ok">projected ok</div>
        </BoxedWithSibling>
      ),
      modeOpts
    );
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
    const { container } = await renderMode(nestedEscalation, modeOpts);
    await waitForDrain(container).catch(() => {});
    const el = container.element;
    expect(el.querySelector('#fb-outer')?.textContent).toBe('outer');
    expect(el.querySelector('#fb-inner')).toBeFalsy();
    // A threw-after-load fallback escalates, not last-resort.
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
      const { container } = await renderMode(
        () => (
          <ErrorBoundary
            fallback$={fb()}
            onError$={$((e: any) => {
              onErrorLog.errors.push(e instanceof Error ? e.message : e);
            })}
          >
            <Thrower />
          </ErrorBoundary>
        ),
        modeOpts
      );
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
      const { container } = await renderMode(
        () => (
          <ErrorBoundary fallback$={fb()} onError$={$((e: any) => received.push(e))}>
            <IdentityThrower />
          </ErrorBoundary>
        ),
        modeOpts
      );
      await settleOnErrorDelivery(container);

      expect(received).toHaveLength(1);
      expect(received[0]).toBe(original);
    });

    it.each([[{ code: 401 }], [0]])(
      'wraps a non-Error throw %o in an Error carrying the raw value as cause',
      async (raw) => {
        const received: unknown[] = [];
        const RawThrower = component$((): JSXOutput => {
          throw raw;
        });
        const { container } = await renderMode(
          () => (
            <ErrorBoundary fallback$={fb()} onError$={$((e: any) => received.push(e))}>
              <RawThrower />
            </ErrorBoundary>
          ),
          modeOpts
        );
        await settleOnErrorDelivery(container);

        expect(received).toHaveLength(1);
        const seen = received[0] as Error & { cause?: unknown };
        expect(seen).toBeInstanceOf(Error);
        expect(seen.message).toBe(String(raw));
        expect(seen.cause).toBe(raw);
      }
    );

    it('passes an info arg with phase "render" and a non-empty boundaryId for a render throw', async () => {
      const infos: Array<{ phase: string; boundaryId: string }> = [];
      const { container } = await renderMode(
        () => (
          <ErrorBoundary
            fallback$={fb()}
            onError$={$((_e: any, info: any) => {
              infos.push({ phase: info.phase, boundaryId: info.boundaryId });
            })}
          >
            <Thrower />
          </ErrorBoundary>
        ),
        modeOpts
      );
      await settleOnErrorDelivery(container);

      expect(infos).toHaveLength(1);
      expect(infos[0].phase).toBe('render');
      expect(typeof infos[0].boundaryId).toBe('string');
      expect(infos[0].boundaryId.length).toBeGreaterThan(0);
    });

    it('a synchronously throwing onError$ is swallowed; the fallback still renders and info is delivered exactly once', async () => {
      const calls: Array<{ phase: string; boundaryId: string }> = [];
      const { container } = await renderMode(
        () => (
          <ErrorBoundary
            fallback$={fb()}
            onError$={$((_e: any, info: any) => {
              calls.push({ phase: info.phase, boundaryId: info.boundaryId });
              throw new Error('onError boom');
            })}
          >
            <Thrower />
          </ErrorBoundary>
        ),
        modeOpts
      );
      await settleOnErrorDelivery(container);

      expect(calls).toHaveLength(1);
      expect(calls[0].phase).toBe('render');
      expect(calls[0].boundaryId.length).toBeGreaterThan(0);
      expect(container.element.querySelector('#fb')?.textContent).toContain('caught: boom');
    });

    it('an async-rejecting onError$ is swallowed; the fallback still renders', async () => {
      const log: unknown[] = [];
      const { container } = await renderMode(
        () => (
          <ErrorBoundary
            fallback$={fb()}
            onError$={$((e: any) => {
              log.push(e instanceof Error ? e.message : e);
              return Promise.reject(new Error('onError async boom'));
            })}
          >
            <Thrower />
          </ErrorBoundary>
        ),
        modeOpts
      );
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
      const { container } = await renderMode(
        () => (
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
        ),
        modeOpts
      );
      await settleOnErrorDelivery(container);

      const el = container.element;
      expect(el.querySelector('#fb-inner')?.textContent).toContain('caught: boom');
      expect(el.querySelector('#fb-outer')).toBeFalsy();
      expect(outerLog).toEqual([]);
    });

    it('escalation: inner and outer onError$ each fire once for their own error', async () => {
      const innerLog: unknown[] = [];
      const outerLog: unknown[] = [];
      const { container } = await renderMode(
        () =>
          nestedEscalation({
            innerOnError: $((e: any) => {
              innerLog.push(e instanceof Error ? e.message : e);
            }),
            outerOnError: $((e: any) => {
              outerLog.push(e instanceof Error ? e.message : e);
            }),
          }),
        modeOpts
      );
      await settleOnErrorDelivery(container);

      const el = container.element;
      expect(el.querySelector('#fb-outer')?.textContent).toBe('outer');
      expect(el.querySelector('#fb-inner')).toBeFalsy();
      expect(innerLog).toEqual(['boom']);
      expect(outerLog).toEqual(['inner fallback boom']);
    });
  });
});

describe('ErrorBoundary behavior', () => {
  it('a thrown non-Error class instance is caught (CSR)', async () => {
    const { container } = await domRender(boxed(<NonSerializableThrower />), { debug });
    await waitForDrain(container);
    expect(container.element.querySelector('#fb')?.textContent).toContain(
      'caught: non-serializable boom'
    );
  });
});

// Object ref: a `let` captured in a `component$` becomes a const.
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

// Harness can't dispatch resumed handlers; drive reset directly.
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
    'SSR-resume-OOOS',
    {
      render: (jsx: JSXOutput) => ssrRenderToDom(jsx, { debug, ...OOOS_OPT_IN }),
      driveReset: resetResumed,
    },
  ],
] as const;

describe.each(resetModes)(
  'ErrorBoundary reset (%s)',
  (_mode, { render: renderReset, driveReset }) => {
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
  }
);

describe('ErrorBoundary reset', () => {
  it('sequential errors across resets: a second error after recovery shows the second message, and reset recovers again', async () => {
    resetRef.toggle = 0;
    const App = withResetBoundary(<ResetToggle />);
    const { container } = await domRender(<App />, { debug });
    const el = container.element;
    expect(el.querySelector('#retry')?.textContent).toContain('boom-1');

    await trigger(el, '#retry', 'click');
    expect(el.querySelector('#alive')).toBeTruthy();

    // A signal write is text-only; force a full re-render instead.
    await rerenderComponent(el.querySelector('#alive') as HTMLElement);
    await waitForDrain(container).catch(() => {});
    expect(el.querySelector('#retry')?.textContent).toContain('boom-3');

    await trigger(el, '#retry', 'click');
    expect(el.querySelector('#alive')).toBeTruthy();
    expect(el.querySelector('#retry')).toBeFalsy();
  });

  const escalationRef = { fallbackCalls: 0 };
  // reset() re-renders the children's OWNER, so the boundary needs one.
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
});

describe('ErrorBoundary CSR-specific', () => {
  describe('qerror routing', () => {
    it('client: a qerror routes to the NEAREST of nested boundaries', async () => {
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
  });

  it('onError$ info.phase for a qerror-delivered client error', async () => {
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

  describe('falsy thrown values', () => {
    // Object ref survives `$()` capture; reset per test case.
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
      'shows the fallback when %s is thrown',
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
        if (thrown !== undefined) {
          // Dev-only: the raw serializable throw survives via `cause`.
          expect(seen.cause).toBe(thrown);
        }
      }
    );
  });

  it('CSR: a non-recoverable build error is not caught by the boundary', async () => {
    const { container } = await domRender(boxed(<button id="content">x</button>), { debug });
    const el = container.element;
    const target = el.querySelector('#content')!;
    const err = new Error('build boom');
    (err as any).plugin = 'vite:some-plugin';
    dispatchQError(target, { error: err, element: target });
    try {
      await waitForDrain(container);
    } catch {
      /* rethrown build error may surface during drain — expected */
    }
    expect(el.querySelector('#fb')).toBeFalsy();
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
      // A contains()-gated handler would double-handle via outer A.
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
    const renderTwoContainers = async () => {
      setPlatform(getTestPlatform());
      const document = createDocument();
      // Mock window's addEventListener is a noop; make it real + spyable.
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
        const { view, listeners } = await renderTwoContainers();
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

  it('a render throw with no enclosing boundary surfaces the ORIGINAL error to logError', async () => {
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

  it('routes an async-generator child throw to the enclosing boundary fallback', async () => {
    const { container } = await ssrRenderToDom(
      <ErrorBoundary fallback$={fb()}>
        <AsyncGenThrower />
      </ErrorBoundary>,
      { debug }
    );
    expect(container.element.querySelector('#fb')?.textContent).toContain('caught: async gen boom');
  });

  it('onError$ receives info.phase "async-generator" for an async-generator child throw', async () => {
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

  it('a non-serializable throw renders the fallback AND the page still serializes', async () => {
    const { container } = await ssrRenderToDom(
      <ErrorBoundary fallback$={fb()}>
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
      // Typed `Error` param: `e.message` must be safe without `String()`.
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
    const { container } = await ssrRenderToDom(boxed(<UndefinedThrower />), { debug });
    expect(container.element.querySelector('#fb')).toBeTruthy();
  });

  it('SSR: a non-recoverable build error is NOT hidden in the fallback (it surfaces)', async () => {
    await expect(ssrRenderToDom(boxed(<PluginThrower />), { debug })).rejects.toThrow('build boom');
  });

  it('fires once from serialized props.onError$ on a post-resume client error', async () => {
    // A captured ref lands in a deserialized copy after resume; sink via `globalThis`.
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
});

describe('ErrorBoundary function children', () => {
  const throwingFnChild = (message = 'jsx error') =>
    (() => {
      throw new Error(message);
    }) as unknown as JSXOutput;

  it('SSR: a sync function-child throw renders the fallback', async () => {
    const { container } = await ssrRenderToDom(boxed(throwingFnChild()), { debug });
    expect(container.element.querySelector('#fb')?.textContent).toContain('caught: jsx error');
  });

  it('SSR OOOS: a sync function-child throw inside a Suspense segment renders the fallback', async () => {
    const { document } = await streamAndResume(
      <main>
        <Suspense fallback={<span id="skel">loading</span>}>
          <ErrorBoundary fallback$={fb()}>{throwingFnChild()}</ErrorBoundary>
        </Suspense>
      </main>,
      OOOS_OPT_IN
    );
    expect(document.querySelector('#fb')?.textContent).toContain('caught: jsx error');
  });

  it('SSR: an async function child whose promise rejects renders the fallback', async () => {
    const asyncThrower = (async () => {
      throw new Error('async jsx error');
    }) as unknown as JSXOutput;
    const { container } = await ssrRenderToDom(boxed(asyncThrower), { debug });
    expect(container.element.querySelector('#fb')?.textContent).toContain(
      'caught: async jsx error'
    );
  });

  it('SSR: a function-child throw with NO boundary above still rejects the render', async () => {
    await expect(ssrRenderToDom(<main>{throwingFnChild()}</main>, { debug })).rejects.toThrow(
      'jsx error'
    );
  });

  // Pins invoke-and-discard so option A cannot silently become thunk-children without the RFC.
  it('SSR: a function child RETURNING JSX renders nothing and does not error', async () => {
    const thunk = (() => <div id="thunk">thunk</div>) as unknown as JSXOutput;
    const { container } = await ssrRenderToDom(boxed(thunk), { debug });
    expect(container.element.querySelector('#thunk')).toBeFalsy();
    expect(container.element.querySelector('#fb')).toBeFalsy();
  });

  it('CSR: a function child inside a boundary renders empty — no crash, no fallback', async () => {
    const { container } = await domRender(boxed(throwingFnChild()), { debug });
    expect(container.element.querySelector('#fb')).toBeFalsy();
  });

  it('SSR: routes the function-child error to onError$ once, identity-preserved, phase "render"', async () => {
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
      { debug, ...OOOS_OPT_IN }
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

  it.each([
    ['default', {}],
    ['opted-in OOOS', OOOS_OPT_IN],
  ] as const)(
    '%s streaming: a post-resume client error collapses the two-host boundary cleanly (no Missing child)',
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

  it.each([
    ['default', {}],
    ['opted-in OOOS', OOOS_OPT_IN],
  ] as const)(
    '%s streaming: re-rendering an SSR-errored boundary drops the inert content, fallback stays',
    async (_label, streamingOpts) => {
      const { container } = await ssrRenderToDom(
        <main>
          <ErrorBoundary fallback$={fb()}>
            <div id="content">content</div>
            <Thrower />
          </ErrorBoundary>
        </main>,
        { debug, ...streamingOpts }
      );
      const el = container.element;
      const contentHost = el.querySelector('[q\\:ebc]') as HTMLElement;
      expect(el.querySelector('#fb')?.textContent).toContain('caught: boom');
      expect(contentHost.contains(el.querySelector('#content'))).toBe(true);

      await rerenderComponent(contentHost);
      await waitForDrain(container);

      expect(el.querySelector('#content')).toBeFalsy();
      expect(el.querySelector('#fb')?.textContent).toContain('caught: boom');
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
    // qwik-dom querySelector is document-wide; assert placement via `contains`.
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
    // qwik-dom querySelector is document-wide; assert placement via `contains`.
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

  it('escalates to the outer boundary even when outOfOrder is opted in (in place via qErr)', async () => {
    const { html, document } = await streamAndResume(nestedEscalation(), OOOS_OPT_IN);
    expect(document.querySelector('#fb-outer')?.textContent).toBe('outer');
    // First [q:ebc] in document order is the outer content host.
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
      OOOS_OPT_IN
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

  it('sibling boundaries swap independently (in place via qErr, opted-in OOOS)', async () => {
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
      OOOS_OPT_IN
    );
    expect(document.querySelector('#fb-a')).toBeTruthy();
    expect(document.querySelector('#ok-b')?.textContent).toBe('b ok');
    expect(document.querySelector('#fb-b')).toBeFalsy();
    expect(displayOf(document.querySelector('#fb-a')?.closest('[q\\:ebf]'))).toBe('contents');
    expect(displayOf(document.querySelector('#ok-b')?.closest('[q\\:ebc]'))).toBe('contents');
    expect(html).toContain('qErr(');
  });

  it.each([
    { kind: 'an async component whose render rejects', Cmp: AsyncRejector, message: 'async boom' },
    { kind: 'a rejected promise child', Cmp: AsyncThrower, message: 'async boom' },
    { kind: 'an async signal that rejects', Cmp: AsyncSignalThrower, message: 'async signal boom' },
  ])(
    '$kind (no <Suspense>) swaps in place via qErr even when outOfOrder is opted in',
    async ({ Cmp, message }) => {
      const { html, document } = await streamAndResume(
        <main>
          <ErrorBoundary fallback$={fb()}>
            <div id="before">before</div>
            <Cmp />
          </ErrorBoundary>
        </main>,
        OOOS_OPT_IN
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
        OOOS_OPT_IN
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
      OOOS_OPT_IN
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

describe('ErrorBoundary OOOS (opt-in, Suspense)', () => {
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
      OOOS_OPT_IN
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
      OOOS_OPT_IN
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
      OOOS_OPT_IN
    );
    expect(html).toContain('id="sibling"');
    expect(document.querySelector('#fb')?.textContent).toContain('caught: async boom');
    expect(displayOf(document.querySelector('#fb')?.closest('[q\\:rp]'))).toBe('contents');
    expect(displayOf(document.querySelector('#sibling')?.closest('div[style]'))).toBe('none');
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
      OOOS_OPT_IN
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
      OOOS_OPT_IN
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
      OOOS_OPT_IN
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
      OOOS_OPT_IN
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
      OOOS_OPT_IN
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
      OOOS_OPT_IN
    );
    expect(fbCount(document)).toBe(1);
    expect(document.querySelector('#fb')?.textContent).toContain('caught: boom');
    expect(document.querySelector('#fb')?.closest('[q\\:ebf]')).toBeTruthy();
    expect(html).toContain('qErr(');
  });

  it('fires once for an SSR-caught throw (out-of-order) and not again on resume', async () => {
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
      { debug, ...OOOS_OPT_IN }
    );
    await getTestPlatform().flush();
    await delay(0);
    expect(onErrorLog.errors).toEqual(['boom']);
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
    expect((redacted as unknown as Record<string, unknown>).query).toBeUndefined();
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

  // The e2e builds in dev, so this is the prod-redaction proof.
  it('redactBoundaryErrorForDisplay: prod redacts a raw client error to generic + digest', () => {
    const raw = Object.assign(new Error('client secret'), { token: 'abc' });
    const out = redactBoundaryErrorForDisplay(raw, /* dev */ false) as Error & { digest?: string };
    expect(out.message).toBe('An error occurred');
    expect((out as unknown as Record<string, unknown>).token).toBeUndefined();
    expect(typeof out.digest).toBe('string');
  });

  it('redactBoundaryErrorForDisplay: dev keeps the original error (full fidelity)', () => {
    const raw = new Error('client secret');
    expect(redactBoundaryErrorForDisplay(raw, /* dev */ true)).toBe(raw);
  });

  it('redactBoundaryErrorForDisplay: keeps an already-redacted projection (preserves the digest)', () => {
    const alreadyRedacted = toSerializableBoundaryError(new Error('orig'), false) as Error & {
      digest: string;
    };
    expect(redactBoundaryErrorForDisplay(alreadyRedacted, false)).toBe(alreadyRedacted);
  });

  it('prod: the redacted error carries no cause and no custom fields', () => {
    const original = Object.assign(new Error('secret'), { token: 'abc' });
    (original as Error & { cause?: unknown }).cause = { db: 'internal' };
    const raws = [original, { code: 401 }];
    for (let i = 0; i < raws.length; i++) {
      const redacted = toSerializableBoundaryError(raws[i], /* dev */ false) as Error & {
        cause?: unknown;
      };
      expect(redacted.cause).toBeUndefined();
      expect(Object.keys(redacted)).toEqual(['digest']);
    }
  });

  describe('dev coercion to Error', () => {
    it.each([[0], ['x'], [{ code: 401 }]])(
      'a serializable non-Error throw %o becomes an Error with the raw as cause',
      (raw) => {
        const out = toSerializableBoundaryError(raw, /* dev */ true) as Error & { cause?: unknown };
        expect(out).toBeInstanceOf(Error);
        expect(out.message).toBe(String(raw));
        expect(out.cause).toBe(raw);
      }
    );

    it('dev: a serializable non-Error throw keeps its raw cause across an SSR→resume round-trip', async () => {
      const raw = { code: 401 };
      const serializable = toSerializableBoundaryError(raw, /* dev */ true);
      // Serialization captures enumerable own props only, so a non-enumerable cause would be dropped.
      const resumed = (await _deserialize(await _serialize(serializable))) as Error & {
        cause?: unknown;
      };
      expect(resumed).toBeInstanceOf(Error);
      expect(resumed.message).toBe(String(raw));
      // Deserialized copy, so structural (not reference) equality.
      expect(resumed.cause).toEqual(raw);
    });

    it('an Error throw passes untouched, custom enumerable fields included', () => {
      const original = Object.assign(new Error('full-detail'), { code: 401 });
      expect(toSerializableBoundaryError(original, /* dev */ true)).toBe(original);
    });

    it('a non-serializable throw with a string message keeps the message and gets NO cause', () => {
      const out = toSerializableBoundaryError(
        new NonSerializableError(),
        /* dev */ true
      ) as Error & {
        cause?: unknown;
      };
      expect(out).toBeInstanceOf(Error);
      expect(out.message).toBe('non-serializable boom');
      expect('cause' in out).toBe(false);
    });

    it('a non-serializable throw without a message coerces via String and gets NO cause', () => {
      const fn = () => {};
      const out = toSerializableBoundaryError(fn, /* dev */ true) as Error & { cause?: unknown };
      expect(out).toBeInstanceOf(Error);
      expect(out.message).toBe(String(fn));
      expect('cause' in out).toBe(false);
    });

    it('markBoundaryErrored: a non-Error throw reaches onError$ wrapped with the raw as cause', () => {
      const received: unknown[] = [];
      const store: ErrorBoundaryStore = { error: undefined, $onError$: (e) => received.push(e) };
      const raw = { code: 401 };
      markBoundaryErrored(store, raw);
      expect(received).toHaveLength(1);
      const seen = received[0] as Error & { cause?: unknown };
      expect(seen).toBeInstanceOf(Error);
      expect(seen.cause).toBe(raw);
      expect(store.error).toBeInstanceOf(Error);
    });
  });

  it('transformError: overrides the projection in both dev and prod', () => {
    const original = Object.assign(new Error('secret-db-detail'), { query: 'SELECT 1' });
    const transformError = (e: unknown) =>
      new Error(`safe: ${e instanceof Error ? e.name : 'unknown'}`);
    const inDev = toSerializableBoundaryError(original, /* dev */ true, transformError) as Error;
    expect(inDev.message).toBe('safe: Error');
    expect((inDev as unknown as Record<string, unknown>).query).toBeUndefined();
    const inProd = toSerializableBoundaryError(original, /* dev */ false, transformError) as Error;
    expect(inProd.message).toBe('safe: Error');
  });

  it('transformError: fail-closed — a throwing transform redacts to generic + digest, never the raw', () => {
    const out = toSerializableBoundaryError(new Error('secret'), /* dev */ true, () => {
      throw new Error('transform bug');
    }) as Error & { digest?: string };
    expect(out.message).toBe('An error occurred');
    expect(out.message).not.toContain('secret');
    expect(typeof out.digest).toBe('string');
  });

  it('transformError: a non-Error projection redacts to generic + digest', () => {
    const out = toSerializableBoundaryError(
      new Error('secret'),
      /* dev */ true,
      () => 'safe message'
    ) as Error & { digest?: string };
    expect(out).toBeInstanceOf(Error);
    expect(out.message).toBe('An error occurred');
    expect(typeof out.digest).toBe('string');
  });

  it('transformError: fail-closed — a non-serializable return redacts to generic + digest', () => {
    const out = toSerializableBoundaryError(
      new Error('secret'),
      /* dev */ true,
      () => () => {}
    ) as Error & {
      digest?: string;
    };
    expect(out.message).toBe('An error occurred');
    expect(typeof out.digest).toBe('string');
  });

  it('markBoundaryErrored: applies transformError to store.error but fires onError$ with the original', () => {
    const received: unknown[] = [];
    const store: ErrorBoundaryStore = { error: undefined, $onError$: (e) => received.push(e) };
    const original = Object.assign(new Error('boom'), { secret: 'x' });
    markBoundaryErrored(store, original, 'render', () => new Error('redacted'));
    expect((store.error as Error).message).toBe('redacted');
    expect(received).toEqual([original]);
  });

  it('transformError (render option): redacts the SSR-serialized boundary error end-to-end', async () => {
    const SecretThrower = component$((): JSXOutput => {
      throw new Error('SECRET-db-detail');
    });
    const { container } = await ssrRenderToDom(
      <ErrorBoundary
        fallback$={$((e: any) => (
          <p id="fb">shown: {e instanceof Error ? e.message : String(e)}</p>
        ))}
      >
        <SecretThrower />
      </ErrorBoundary>,
      { debug, transformError: () => new Error('redacted-by-app') }
    );
    const text = container.element.querySelector('#fb')?.textContent;
    expect(text).toContain('redacted-by-app');
    expect(text).not.toContain('SECRET');
  });

  it.each([
    ['function-valued field', () => Object.assign(new Error('leaky'), { retry: () => {} })],
    [
      'nested unserializable field',
      () => Object.assign(new Error('leaky'), { meta: { cb: () => {} } }),
    ],
    [
      'throwing getter field',
      () => {
        const projected = new Error('leaky');
        Object.defineProperty(projected, 'trap', {
          enumerable: true,
          get() {
            throw new Error('getter trap');
          },
        });
        return projected;
      },
    ],
  ] as Array<[string, () => Error]>)(
    'transformError: an Error projection with an unserializable %s redacts to generic + digest',
    (_, makeProjection) => {
      const out = toSerializableBoundaryError(
        new Error('secret'),
        /* dev */ false,
        makeProjection
      ) as Error & { digest?: string };
      expect(out.message).toBe('An error occurred');
      expect(typeof out.digest).toBe('string');
    }
  );

  it('transformError: an Error projection with serializable custom fields is kept by identity', () => {
    const projected = Object.assign(new Error('safe'), { code: 401, meta: { retryable: true } });
    expect(toSerializableBoundaryError(new Error('secret'), /* dev */ false, () => projected)).toBe(
      projected
    );
  });

  it('transformError (render option): an unserializable projection still completes SSR with the generic fallback', async () => {
    const SecretThrower = component$((): JSXOutput => {
      throw new Error('SECRET-db-detail');
    });
    const { container } = await ssrRenderToDom(
      <ErrorBoundary
        fallback$={$((e: any) => (
          <p id="fb">shown: {e instanceof Error ? e.message : String(e)}</p>
        ))}
      >
        <SecretThrower />
      </ErrorBoundary>,
      { debug, transformError: () => Object.assign(new Error('leaky'), { retry: () => {} }) }
    );
    const text = container.element.querySelector('#fb')?.textContent;
    expect(text).toContain('An error occurred');
    expect(text).not.toContain('SECRET');
    expect(text).not.toContain('leaky');
  });

  it('digest is produced and deterministic for non-Error thrown values', () => {
    const digestOf = (thrown: unknown) => {
      const projected = toSerializableBoundaryError(thrown, false) as Error & { digest: string };
      expect(projected).toBeInstanceOf(Error);
      expect(projected.message).toBe('An error occurred');
      expect(typeof projected.digest).toBe('string');
      expect(projected.digest.length).toBeGreaterThan(0);
      return projected.digest;
    };
    const digests = [0, 'string boom', { code: 'X' }].map((thrown) => {
      expect(digestOf(thrown)).toBe(digestOf(thrown));
      return digestOf(thrown);
    });
    expect(new Set(digests).size).toBe(digests.length);
  });

  it('markBoundaryErrored called twice: each new error re-fires onError$ and overwrites store.error', () => {
    const received: unknown[] = [];
    const store: ErrorBoundaryStore = { error: undefined, $onError$: (e) => received.push(e) };
    const first = new Error('first');
    const second = new Error('second');
    markBoundaryErrored(store, first);
    expect(received).toEqual([first]);
    expect(store.error).toBe(first);

    markBoundaryErrored(store, second);
    expect(received).toEqual([first, second]);
    expect(store.error).toBe(second);
  });
});

describe('hostile thrown values (fail-closed normalization)', () => {
  const makeRevokedProxy = () => {
    const { proxy, revoke } = Proxy.revocable({}, {});
    revoke();
    return proxy;
  };
  const hostileRows: Array<[string, () => unknown]> = [
    ['revoked Proxy', makeRevokedProxy],
    [
      'throwing getPrototypeOf trap',
      () =>
        new Proxy(
          {},
          {
            getPrototypeOf() {
              throw new Error('proto trap');
            },
          }
        ),
    ],
    [
      'Error wrapped in a throwing has trap',
      () =>
        new Proxy(new Error('trapped'), {
          has() {
            throw new Error('has trap');
          },
        }),
    ],
    [
      'throwing toString',
      () => ({
        toString() {
          throw new Error('toString trap');
        },
      }),
    ],
    [
      'Error subclass with a throwing message getter',
      () => {
        class Evil extends Error {
          // eslint-disable-next-line getter-return
          get message(): string {
            throw new Error('message trap');
          }
        }
        return new Evil();
      },
    ],
    [
      'cyclic object',
      () => {
        const cyclic: Record<string, unknown> = { name: 'cycle' };
        cyclic.self = cyclic;
        return cyclic;
      },
    ],
  ];

  it.each(hostileRows)('toSerializableBoundaryError never throws: %s', (_, makeHostile) => {
    for (const dev of [true, false]) {
      const out = toSerializableBoundaryError(makeHostile(), dev) as Error & { digest?: string };
      expect(out).toBeInstanceOf(Error);
      if (!dev) {
        expect(out.message).toBe('An error occurred');
        expect(typeof out.digest).toBe('string');
      }
    }
  });

  it.each(hostileRows)('redactBoundaryErrorForDisplay never throws: %s', (_, makeHostile) => {
    expect(redactBoundaryErrorForDisplay(makeHostile(), false)).toBeInstanceOf(Error);
  });

  it.each(hostileRows)(
    'markBoundaryErrored absorbs it and still stores an Error: %s',
    (_, makeHostile) => {
      const store: ErrorBoundaryStore = { error: undefined };
      expect(() => markBoundaryErrored(store, makeHostile())).not.toThrow();
      expect(store.error).toBeInstanceOf(Error);
    }
  );

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

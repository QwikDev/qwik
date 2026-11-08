import {
  $,
  component$,
  Slot,
  Catch,
  useTask$,
  useVisibleTask$,
  useOn,
  useOnDocument,
  useOnWindow,
  useSignal,
  sync$,
} from '@qwik.dev/core';
import { describe, expect, it, onTestFinished } from 'vitest';
import { testRenderer } from '../test-utils';
import { triggerAll } from './test-hooks';
import { trigger } from '@qwik.dev/core/testing';

const useClick = (handler: any): void => {
  useOn('click', handler);
};

const debug = false;

const { name, render } = testRenderer;

describe(`${name}: useOn`, () => {
  it('keeps element useOn on a component returning Catch content', async () => {
    const App = component$(() => {
      const count = useSignal(0);
      useOn(
        'click',
        $(() => {
          count.value++;
        })
      );
      return (
        <Catch fallback$={() => <button id="catch-click">{count.value}</button>}>
          <button id="catch-click">{count.value}</button>
        </Catch>
      );
    });
    const { container, cleanup, qwikLoader } = await render(App, { debug });
    try {
      const button = container.querySelector('#catch-click')!;
      expect(button.textContent).toBe('0');
      await qwikLoader?.dispatch(button, 'click');
      expect(button.textContent).toBe('1');
    } finally {
      cleanup();
    }
  });

  it.runIf(name === 'ssrRender')(
    'keeps element useOn on a component returning Catch fallback',
    async () => {
      const Throw = component$(() => {
        throw new Error('failed');
        return null;
      });
      const App = component$(() => {
        const count = useSignal(0);
        useOn(
          'click',
          $(() => {
            count.value++;
          })
        );
        return (
          <Catch fallback$={() => <button id="catch-click">{count.value}</button>}>
            <Throw />
          </Catch>
        );
      });
      const { container, cleanup, qwikLoader } = await render(App, { debug });
      try {
        const button = container.querySelector('#catch-click')!;
        expect(button.textContent).toBe('0');
        await qwikLoader?.dispatch(button, 'click');
        expect(button.textContent).toBe('1');
      } finally {
        cleanup();
      }
    }
  );

  it('attaches element events to the first rendered element', async () => {
    const App = component$(() => {
      const count = useSignal(0);

      useOn(
        'click',
        $(() => {
          count.value++;
        })
      );

      return <button>{count.value}</button>;
    });

    const { container, cleanup, qwikLoader } = await render(App, { debug });
    const button = container.querySelector('button')!;

    expect(button.textContent).toBe('0');
    await qwikLoader?.dispatch(button, 'click');
    expect(button.textContent).toBe('1');

    cleanup();
  });

  it('records useOn from a custom hook', async () => {
    const App = component$(() => {
      const count = useSignal(0);
      useClick(
        $(() => {
          count.value++;
        })
      );
      return <button>{count.value}</button>;
    });

    const { container, cleanup, qwikLoader } = await render(App, { debug });
    const button = container.querySelector('button')!;

    await qwikLoader?.dispatch(button, 'click');
    expect(button.textContent).toBe('1');

    cleanup();
  });

  it('updates for passive option', async () => {
    const App = component$(() => {
      const count = useSignal(0);

      useOn(
        'click',
        $(() => {
          count.value++;
        }),
        { passive: true }
      );

      return <button>{count.value}</button>;
    });

    const { container, cleanup, qwikLoader } = await render(App, { debug });
    const button = container.querySelector('button')!;

    await qwikLoader?.dispatch(button, 'click');
    expect(button.textContent).toBe('1');

    cleanup();
  });

  it('supports multiple event names', async () => {
    const App = component$(() => {
      const count = useSignal(0);

      useOn(
        ['click', 'focus'],
        $(() => {
          count.value++;
        })
      );

      return <button>{count.value}</button>;
    });

    const { container, cleanup, qwikLoader } = await render(App, { debug });
    const button = container.querySelector('button')!;

    await qwikLoader?.dispatch(button, 'click');
    await qwikLoader?.dispatch(button, 'focus');
    expect(button.textContent).toBe('2');

    cleanup();
  });

  it('supports capture option', async () => {
    (globalThis as any).__useOnLogs = [];

    const App = component$(() => {
      useOn(
        'click',
        $(() => {
          (globalThis as any).__useOnLogs.push('parent capture');
        }),
        { capture: true }
      );

      return (
        <div>
          <button
            onClick$={() => {
              (globalThis as any).__useOnLogs.push('button bubble');
            }}
          />
        </div>
      );
    });

    const { container, cleanup, qwikLoader } = await render(App, { debug });
    await qwikLoader?.dispatch(container.querySelector('button')!, 'click');
    expect((globalThis as any).__useOnLogs).toEqual(['parent capture', 'button bubble']);

    cleanup();
    delete (globalThis as any).__useOnLogs;
  });

  it('merges handlers and modifiers for the same event', async () => {
    (globalThis as any).__useOnLogs = [];

    const App = component$(() => {
      useOn(
        'click',
        $(() => {
          (globalThis as any).__useOnLogs.push('first');
        }),
        { capture: true }
      );
      useOn(
        'click',
        $(() => {
          (globalThis as any).__useOnLogs.push('second');
        }),
        { preventdefault: true, stoppropagation: true }
      );

      return (
        <div>
          <button
            onClick$={() => {
              (globalThis as any).__useOnLogs.push('button bubble');
            }}
          />
        </div>
      );
    });

    const { container, cleanup, qwikLoader } = await render(App, { debug });
    const div = container.querySelector('div')!;

    expect(div.hasAttribute('capture:click')).toBe(true);
    expect(div.hasAttribute('preventdefault:click')).toBe(true);
    expect(div.hasAttribute('stoppropagation:click')).toBe(true);

    const event = await qwikLoader?.dispatch(container.querySelector('button')!, 'click');
    expect((globalThis as any).__useOnLogs).toEqual(['first', 'second']);
    expect(event?.defaultPrevented).toBe(true);
    expect(event?.cancelBubble).toBe(true);

    cleanup();
    delete (globalThis as any).__useOnLogs;
  });

  it('merges with JSX listeners for the same element event', async () => {
    const App = component$(() => {
      const count = useSignal(0);

      useOn(
        'click',
        $(() => {
          count.value++;
        })
      );

      return <button onClick$={() => (count.value += 2)}>{count.value}</button>;
    });

    const { container, cleanup, qwikLoader } = await render(App, { debug });
    const button = container.querySelector('button')!;

    await qwikLoader?.dispatch(button, 'click');
    expect(button.textContent).toBe('3');

    cleanup();
  });

  it('updates with mixed listeners', async () => {
    const App = component$(() => {
      const count = useSignal(0);

      useOn(
        'click',
        $(() => {
          count.value++;
        })
      );

      return <button onFocus$={() => (count.value += 2)}>{count.value}</button>;
    });

    const { container, cleanup, qwikLoader } = await render(App, { debug });
    const button = container.querySelector('button')!;

    await qwikLoader?.dispatch(button, 'click');
    await qwikLoader?.dispatch(button, 'focus');
    expect(button.textContent).toBe('3');

    cleanup();
  });

  // Structural useOn roots currently have no event carrier.
  it('moves the carrier when a structural root is replaced', async () => {
    const App = component$(() => {
      const button = useSignal(true);
      useOn(
        'click',
        $(() => {
          button.value = !button.value;
        })
      );
      return <>{button.value ? <button>button</button> : <a>link</a>}</>;
    });

    const { container, cleanup, qwikLoader } = await render(App, { debug });
    onTestFinished(cleanup);
    await qwikLoader?.dispatch(container.querySelector('button')!, 'click');
    const link = container.querySelector('a')!;
    expect(link).toBeTruthy();

    await qwikLoader?.dispatch(link, 'click');
    expect(container.querySelector('button')).not.toBeNull();

    cleanup();
  });

  describe('useOnDocument', () => {
    it('updates value', async () => {
      const App = component$(() => {
        const count = useSignal(0);

        useOnDocument(
          'click',
          $(() => {
            count.value++;
          })
        );

        return <button>{count.value}</button>;
      });

      const { container, cleanup, qwikLoader } = await render(App, { debug });
      const button = container.querySelector('button')!;

      await qwikLoader?.dispatch(button, 'd:click');
      expect(button.textContent).toBe('1');

      cleanup();
    });

    it('updates value with multiple events', async () => {
      const App = component$(() => {
        const count = useSignal(0);

        useOnDocument(
          'click',
          $(() => {
            count.value++;
          })
        );
        useOnDocument(
          'focus',
          $(() => {
            count.value += 2;
          })
        );

        return <button>{count.value}</button>;
      });

      const { container, cleanup, qwikLoader } = await render(App, { debug });
      const button = container.querySelector('button')!;

      await qwikLoader?.dispatch(button, 'd:click');
      await qwikLoader?.dispatch(button, 'focus');
      expect(button.textContent).toBe('3');

      cleanup();
    });

    it('supports DOMContentLoaded event', async () => {
      const App = component$(() => {
        const count = useSignal(0);

        useOnDocument(
          'DOMContentLoaded',
          $(() => {
            count.value++;
          })
        );

        return <button>{count.value}</button>;
      });

      const { container, cleanup, qwikLoader } = await render(App, { debug });
      const button = container.querySelector('button')!;

      await qwikLoader?.dispatch(button, 'DOMContentLoaded');
      expect(button.textContent).toBe('1');

      cleanup();
    });

    it('supports modifiers on hidden script carriers', async () => {
      const App = component$(() => {
        useOnDocument(
          'click',
          $(() => {}),
          { preventdefault: true }
        );

        return <>headless</>;
      });

      const { container, document, cleanup } = await render(App, { debug });
      const script = (name === 'ssrRender' ? document : container).querySelector('script[hidden]')!;

      expect(script.hasAttribute('preventdefault:click')).toBe(true);

      cleanup();
    });
  });

  describe('useOnWindow', () => {
    it('updates value', async () => {
      const App = component$(() => {
        const count = useSignal(0);

        useOnWindow(
          'click',
          $(() => {
            count.value++;
          })
        );

        return <button>{count.value}</button>;
      });

      const { container, cleanup, qwikLoader } = await render(App, { debug });
      const button = container.querySelector('button')!;

      await qwikLoader?.dispatch(button, 'w:click');
      expect(button.textContent).toBe('1');

      cleanup();
    });

    it('attaches events to components rendered after resume', async () => {
      const Listener = component$(() => {
        const count = useSignal(0);

        useOnWindow(
          'click',
          $(() => {
            count.value++;
          })
        );

        return <p id="conditional-listener">{count.value}</p>;
      });
      const App = component$(() => {
        const visible = useSignal(false);

        return (
          <>
            <button onClick$={() => (visible.value = true)}>Show</button>
            {visible.value && <Listener />}
          </>
        );
      });

      const { container, cleanup, qwikLoader } = await render(App, { debug });
      const button = container.querySelector('button')!;

      expect(container.querySelector('#conditional-listener')).toBeFalsy();
      await qwikLoader?.dispatch(button, 'click');

      const listener = container.querySelector('#conditional-listener')!;
      expect(listener.hasAttribute('q-w:click')).toBe(true);
      await qwikLoader?.dispatch(listener, 'w:click');
      expect(listener.textContent).toBe('1');

      cleanup();
    });

    it('supports modifiers on hidden script carriers', async () => {
      const App = component$(() => {
        useOnWindow(
          'resize',
          $(() => {}),
          { stoppropagation: true }
        );

        return <>headless</>;
      });

      const { container, document, cleanup } = await render(App, { debug });
      const script = (name === 'ssrRender' ? document : container).querySelector('script[hidden]')!;

      expect(script.hasAttribute('stoppropagation:resize')).toBe(true);

      cleanup();
    });

    it('merges with JSX listeners for the same window event', async () => {
      const App = component$(() => {
        const count = useSignal(0);

        useOnWindow(
          'dblclick',
          $(() => {
            count.value++;
          })
        );

        return <button window:onDblClick$={() => count.value++}>{count.value}</button>;
      });

      const { container, cleanup, qwikLoader } = await render(App, { debug });
      const button = container.querySelector('button')!;

      await qwikLoader?.dispatch(button, 'w:dblclick');
      expect(button.textContent).toBe('2');

      cleanup();
    });
  });

  describe('custom events', () => {
    it('updates for useOn custom event', async () => {
      const App = component$(() => {
        const count = useSignal(0);

        useOn(
          'SomeCustomEvent',
          $(() => {
            count.value++;
          })
        );

        return <button>{count.value}</button>;
      });

      const { container, cleanup, qwikLoader } = await render(App, { debug });
      const button = container.querySelector('button')!;

      await qwikLoader?.dispatch(button, 'SomeCustomEvent');
      expect(button.textContent).toBe('1');

      cleanup();
    });
  });

  it('updates with element, document, window, and JSX listeners together', async () => {
    const App = component$(() => {
      const count = useSignal(0);

      useOn(
        'click',
        $(() => {
          count.value++;
        })
      );
      useOnWindow(
        'focus',
        $(() => {
          count.value += 2;
        })
      );
      useOnDocument(
        'blur',
        $(() => {
          count.value += 3;
        })
      );

      return <button onResize$={() => (count.value += 4)}>{count.value}</button>;
    });

    const { container, cleanup, qwikLoader } = await render(App, { debug });
    const button = container.querySelector('button')!;

    await qwikLoader?.dispatch(button, 'click');
    await qwikLoader?.dispatch(button, 'w:focus');
    await qwikLoader?.dispatch(button, 'd:blur');
    await qwikLoader?.dispatch(button, 'resize');
    expect(button.textContent).toBe('10');

    cleanup();
  });

  it('does not add a hidden script carrier for headless element events', async () => {
    const App = component$(() => {
      useOn(
        'click',
        $(() => {})
      );

      return <>headless</>;
    });

    const { container, document, cleanup } = await render(App, { debug });

    expect(
      (name === 'ssrRender' ? document : container).querySelector('script[hidden]')
    ).toBeFalsy();

    cleanup();
  });

  it('uses a hidden script carrier for headless document events', async () => {
    const App = component$(() => {
      useOnDocument(
        'qinit',
        $(() => {
          (globalThis as any).__useOnDocument = ((globalThis as any).__useOnDocument ?? 0) + 1;
        })
      );

      return <>headless</>;
    });

    (globalThis as any).__useOnDocument = 0;
    const { container, document, cleanup, qwikLoader } = await render(App, { debug });
    const script = (name === 'ssrRender' ? document : container).querySelector('script[hidden]')!;

    expect(container.innerHTML).toContain('headless');
    expect(script).not.toBeNull();
    await qwikLoader?.dispatch(script, 'qinit');
    expect((globalThis as any).__useOnDocument).toBe(1);

    cleanup();
    delete (globalThis as any).__useOnDocument;
  });

  it('executes multiple headless document and window events from one carrier', async () => {
    const App = component$(() => {
      useOnDocument(
        'click',
        $(() => {
          (globalThis as any).__useOnGlobal++;
        })
      );
      useOnWindow(
        'resize',
        $(() => {
          (globalThis as any).__useOnGlobal++;
        })
      );

      return <>headless</>;
    });

    (globalThis as any).__useOnGlobal = 0;
    const { container, document, cleanup, qwikLoader } = await render(App, { debug });
    const script = (name === 'ssrRender' ? document : container).querySelector('script[hidden]')!;

    expect(script.hasAttribute('q-d:click')).toBe(true);
    expect(script.hasAttribute('q-w:resize')).toBe(true);

    await qwikLoader?.dispatch(script, 'click');
    await qwikLoader?.dispatch(script, 'w:resize');
    expect((globalThis as any).__useOnGlobal).toBe(2);

    cleanup();
    delete (globalThis as any).__useOnGlobal;
  });
  // Dynamic roots have no useOn carrier yet: the emitters never set `useOnRoot` (group 12, item 9).
  it('attaches to the element a promise resolves to', async () => {
    const App = component$(() => {
      const label = useSignal('empty');
      useOn(
        'click',
        $(() => {
          label.value = 'run';
        })
      );
      return <>{Promise.resolve(<div>{label.value}</div>)}</>;
    });

    const { container, cleanup, qwikLoader } = await render(App, { debug });
    onTestFinished(cleanup);
    const div = container.querySelector('div')!;
    await qwikLoader?.dispatch(div, 'click');
    expect(div.textContent).toBe('run');

    cleanup();
  });

  it('attaches to the element a signal holds', async () => {
    const App = component$(() => {
      const label = useSignal('empty');
      const content = useSignal(<div>{label.value}</div>);
      useOn(
        'click',
        $(() => {
          label.value = 'run';
        })
      );
      return <>{content.value}</>;
    });

    const { container, cleanup, qwikLoader } = await render(App, { debug });
    onTestFinished(cleanup);
    const div = container.querySelector('div')!;
    await qwikLoader?.dispatch(div, 'click');
    expect(div.textContent).toBe('run');

    cleanup();
  });

  it('adds the event once across task-driven rerenders', async () => {
    const App = component$(() => {
      const count = useSignal(0);
      useOn(
        'click',
        $(() => {
          count.value++;
        })
      );
      useTask$(async () => {
        count.value;
        await Promise.resolve();
        await Promise.resolve();
      });
      return <>{Promise.resolve(<div>{count.value}</div>)}</>;
    });

    const { container, cleanup, qwikLoader } = await render(App, { debug });
    onTestFinished(cleanup);
    await qwikLoader?.dispatch(container.querySelector('div')!, 'click');
    expect(container.querySelector('div')?.textContent).toBe('1');

    cleanup();
  });

  it('attaches document events through a component root', async () => {
    const Label = (props: { count: number }) => <>Count: {props.count}!</>;
    const App = component$(() => {
      const count = useSignal(123);
      useOnDocument(
        'click',
        $(() => count.value++)
      );
      return <Label count={count.value} />;
    });

    const { container, document, cleanup, qwikLoader } = await render(App, { debug });
    const script = (name === 'ssrRender' ? document : container).querySelector('script[hidden]')!;
    expect(container.textContent).toContain('Count: 123!');
    await qwikLoader?.dispatch(script, 'click');
    expect(container.textContent).toContain('Count: 124!');

    cleanup();
  });

  it('#7230 runs document, window and visible events of a component that only projects', async () => {
    const Layout = component$(() => {
      useOnDocument(
        'click',
        $(() => {
          (globalThis as any).__useOnHeadless++;
        })
      );
      useOnWindow(
        'resize',
        $(() => {
          (globalThis as any).__useOnHeadless++;
        })
      );
      useVisibleTask$(() => {
        (globalThis as any).__useOnHeadless++;
      });
      return <Slot />;
    });
    const App = component$(() => (
      <Layout>
        <div>test</div>
      </Layout>
    ));

    (globalThis as any).__useOnHeadless = 0;
    const { container, document, cleanup, qwikLoader } = await render(App, { debug });
    const script = (name === 'ssrRender' ? document : container).querySelector('script[hidden]')!;
    expect(script).not.toBeNull();
    await qwikLoader?.dispatch(script, 'qinit');
    await qwikLoader?.dispatch(script, 'click');
    await qwikLoader?.dispatch(script, 'w:resize');
    expect((globalThis as any).__useOnHeadless).toBe(3);

    cleanup();
    delete (globalThis as any).__useOnHeadless;
  });

  // Fired from a task mid-render, before the old carrier detaches (group 12, item 9).
  it('does not run a document event of a component removed in the same render', async () => {
    (globalThis as any).__dispatchChild = () => {};
    (globalThis as any).__receivedChild = [];
    const Dispatch = component$(() => {
      useTask$(() => {
        (globalThis as any).__dispatchChild();
      });
      return <></>;
    });
    const Receive = component$(() => {
      const toggle = useSignal(true);
      useOnDocument(
        'child',
        $(() => {
          toggle.value = false;
          (globalThis as any).__receivedChild.push('child event');
        })
      );
      return <></>;
    });
    const App = component$(() => {
      const toggle = useSignal(true);
      return (
        <>
          <button onClick$={() => (toggle.value = !toggle.value)}></button>
          {toggle.value ? (
            <>
              <Dispatch key={1} />
              <Receive key={2} />
            </>
          ) : (
            <>
              <Dispatch key={3} />
              <Receive key={3} />
            </>
          )}
        </>
      );
    });

    const { container, document, cleanup, qwikLoader } = await render(App, { debug });
    onTestFinished(cleanup);
    (globalThis as any).__dispatchChild = () => {
      // fire without awaiting: the removed carrier must not answer
      void qwikLoader?.dispatch(document.body, 'child');
    };
    await qwikLoader?.dispatch(container.querySelector('button')!, 'click');
    expect((globalThis as any).__receivedChild).toEqual([]);

    cleanup();
    delete (globalThis as any).__dispatchChild;
    delete (globalThis as any).__receivedChild;
  });

  describe('qvisible', () => {
    it('marks the element so the loader observes a JSX qvisible listener', async () => {
      const App = component$(() => {
        const text = useSignal('pending');
        return <button onQVisible$={() => (text.value = 'seen')}>{text.value}</button>;
      });

      const { container, cleanup, qwikLoader } = await render(App, { debug });
      const button = container.querySelector('button')!;
      expect(button.hasAttribute('q-e:qvisible')).toBe(true);
      await qwikLoader?.dispatch(button, 'qvisible');
      expect(button.textContent).toBe('seen');

      cleanup();
    });

    it('marks the element so the loader observes a useOn qvisible listener', async () => {
      const App = component$(() => {
        const text = useSignal('pending');
        useOn(
          'qvisible',
          $(() => (text.value = 'seen'))
        );
        return <button>{text.value}</button>;
      });

      const { container, cleanup, qwikLoader } = await render(App, { debug });
      const button = container.querySelector('button')!;
      expect(button.hasAttribute('q-e:qvisible')).toBe(true);
      await qwikLoader?.dispatch(button, 'qvisible');
      expect(button.textContent).toBe('seen');

      cleanup();
    });
  });
});

describe(`${name}: events`, () => {
  it('should render event value', async () => {
    (globalThis as any).logs = [];
    const Cmp = component$(() => {
      return (
        <button
          onClick$={() => {
            (globalThis as any).logs.push('clicked');
          }}
        ></button>
      );
    });

    const { container, cleanup, flush } = await render(Cmp, { debug });
    onTestFinished(cleanup);

    expect(container.querySelectorAll('button')).toHaveLength(1);
    expect(container.querySelector('button')!.textContent).toBe('');
    await triggerAll(container, 'button', 'click');
    await flush();
    expect((globalThis as any).logs).toEqual(['clicked']);
    (globalThis as any).logs = undefined;
  });
  it('should render event falsy value', async () => {
    const Cmp = component$(() => {
      return <button onClick$={undefined}></button>;
    });

    const { container, cleanup } = await render(Cmp, { debug });
    onTestFinished(cleanup);

    expect(container.querySelectorAll('button')).toHaveLength(1);
    expect(container.querySelector('button')!.textContent).toBe('');
  });
  it('should render events array of falsy value', async () => {
    const Cmp = component$(() => {
      return <button onClick$={[undefined, undefined]}></button>;
    });

    const { container, cleanup } = await render(Cmp, { debug });
    onTestFinished(cleanup);

    expect(container.querySelectorAll('button')).toHaveLength(1);
    expect(container.querySelector('button')!.textContent).toBe('');
  });

  it('should not throw if event handler is array with undefined value', async () => {
    const Cmp = component$(() => {
      return <button onClick$={[undefined]}></button>;
    });

    const { container, cleanup, flush } = await render(Cmp, { debug });
    onTestFinished(cleanup);
    await triggerAll(container, 'button', 'click');
    await flush();

    expect(container.querySelectorAll('button')).toHaveLength(1);
    expect(container.querySelector('button')!.textContent).toBe('');
  });

  it('registers touchmove as passive', async () => {
    const Cmp = component$(() => {
      return (
        // @qwik-disable-next-line preventdefault-passive-check
        <div passive:touchmove preventdefault:touchmove onTouchMove$={() => {}}></div>
      );
    });

    const { container, cleanup, flush } = await render(Cmp, { debug });
    onTestFinished(cleanup);

    const ev = await trigger(container, 'div', 'touchmove');
    await flush();

    expect(ev!.defaultPrevented).toBe(false);
  });

  it('dispatches capture handlers before bubbling handlers', async () => {
    (globalThis as any).logs = [];
    const Cmp = component$(() => {
      return (
        <div
          capture:click
          onClick$={() => {
            (globalThis as any).logs.push('parent capture');
          }}
        >
          <button
            onClick$={() => {
              (globalThis as any).logs.push('button bubble');
            }}
          ></button>
        </div>
      );
    });

    const { container, cleanup, flush } = await render(Cmp, { debug });
    onTestFinished(cleanup);

    await triggerAll(container, 'button', 'click');
    await flush();
    expect((globalThis as any).logs).toEqual(['parent capture', 'button bubble']);
    (globalThis as any).logs = undefined;
  });

  it('stops bubbling after capture stoppropagation', async () => {
    (globalThis as any).logs = [];
    const Cmp = component$(() => {
      return (
        <div
          capture:click
          stoppropagation:click
          onClick$={() => {
            (globalThis as any).logs.push('parent capture');
          }}
        >
          <button
            onClick$={() => {
              (globalThis as any).logs.push('button bubble');
            }}
          ></button>
        </div>
      );
    });

    const { container, cleanup, flush } = await render(Cmp, { debug });
    onTestFinished(cleanup);

    await triggerAll(container, 'button', 'click');
    await flush();
    expect((globalThis as any).logs).toEqual(['parent capture']);
    (globalThis as any).logs = undefined;
  });

  it('applies parent preventdefault when a child button click bubbles through an anchor', async () => {
    (globalThis as any).logs = [];
    const Cmp = component$(() => {
      return (
        <a
          href="https://qwik.dev"
          preventdefault:click
          onClick$={() => {
            (globalThis as any).logs.push('parent');
          }}
        >
          <button
            onClick$={async () => {
              (globalThis as any).logs.push('child');
            }}
          ></button>
        </a>
      );
    });

    const { container, cleanup, flush } = await render(Cmp, { debug });
    onTestFinished(cleanup);
    const ev = await trigger(container, 'button', 'click');
    await flush();

    expect(ev?.defaultPrevented).toBe(true);
    expect((globalThis as any).logs).toEqual(['child', 'parent']);
    (globalThis as any).logs = undefined;
  });
});

describe(`${name}: sync-qrl`, () => {
  it('should prevent updates the checkbox', async () => {
    const Cmp = component$(() => {
      return (
        <input
          type="checkbox"
          onClick$={[
            sync$((e: Event, target: Element) => {
              if (target.getAttribute('shouldPreventDefault')) {
                e.preventDefault();
              }
              target.setAttribute('prevented', String(e.defaultPrevented));
            }),
          ]}
        />
      );
    });

    const { container, cleanup, flush } = await render(Cmp, { debug });
    onTestFinished(cleanup);
    const input = container.querySelector('input')!;

    await trigger(container, input, 'click');
    await flush();
    expect(input?.getAttribute('prevented')).toBe('false');

    input?.setAttribute('shouldPreventDefault', 'true');
    await trigger(container, input, 'click');
    await flush();
    expect(input?.getAttribute('prevented')).toBe('true');
  });

  it('should run parent sync qrls when a child async click bubbles', async () => {
    const Cmp = component$(() => {
      return (
        <div
          onClick$={[
            sync$((_event: Event, target: Element) => {
              target.setAttribute('parent-sync', 'true');
            }),
          ]}
        >
          <button
            onClick$={async (_event: Event, target: Element) => {
              target.setAttribute('child-async', 'true');
            }}
          ></button>
        </div>
      );
    });

    const { container, cleanup, flush } = await render(Cmp, { debug });
    onTestFinished(cleanup);
    const button = container.querySelector('button')!;
    const parent = container.querySelector('div')!;

    await trigger(container, button, 'click');
    await flush();

    expect(button?.getAttribute('child-async')).toBe('true');
    expect(parent?.getAttribute('parent-sync')).toBe('true');
  });
});

const InlineComponentNoChildren = (props: { count: number }) => <>Count: {props.count}!</>;

describe(`${name}: useOn`, () => {
  it('should support preventdefault option when listener is not passive', async () => {
    const Counter = component$(() => {
      useOn(
        'touchmove',
        $(() => {}),
        {
          preventdefault: true,
        }
      );
      return <div></div>;
    });

    const { container, cleanup, flush } = await render(Counter, { debug });
    onTestFinished(cleanup);
    const event = await trigger(container, 'div', 'touchmove');
    await flush();
    expect(event!.defaultPrevented).toBe(true);
  });

  describe('useOnDocument', () => {
    it('should work with inline component not rendering children', async () => {
      const Counter = component$((props: { initial: number }) => {
        const count = useSignal(props.initial);
        useOnDocument(
          'click',
          $(() => count.value++)
        );
        return <InlineComponentNoChildren count={count.value} />;
      });

      const { container, cleanup, flush } = await render(Counter, {
        ...{ debug },
        props: { initial: 123 },
      });
      onTestFinished(cleanup);
      expect(container.textContent).toContain('Count: 123!');

      await trigger(container, container, 'd:click');
      await flush();
      expect(container.textContent).toContain('Count: 124!');
    });
  });
});

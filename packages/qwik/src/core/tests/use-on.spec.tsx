import {
  $,
  Fragment as Awaited,
  Fragment as Component,
  Fragment as InlineComponent,
  Fragment as Projection,
  component$,
  Fragment,
  Fragment as Signal,
  Slot,
  useOn,
  useOnDocument,
  useOnWindow,
  useSignal,
  useTask$,
  useVisibleTask$,
} from '@qwik.dev/core';
import { domRender, ssrRenderToDom, trigger } from '@qwik.dev/core/testing';
import { describe, expect, it } from 'vitest';

const debug = false; //true;
Error.stackTraceLimit = 100;

const InlineComponentNoChildren = (props: { count: number }) => <>Count: {props.count}!</>;

describe.each([
  { render: ssrRenderToDom }, //
  { render: domRender }, //
])('$render.name: useOn', ({ render }) => {
  it('should update value', async () => {
    const Counter = component$((props: { initial: number }) => {
      const count = useSignal(props.initial);
      useOn(
        'click',
        $(() => count.value++)
      );
      return <button>Count: {count.value}!</button>;
    });

    const { vNode, container } = await render(<Counter initial={123} />, { debug });
    expect(vNode).toMatchVDOM(
      <Component>
        <button>
          Count: <Signal ssr-required>{'123'}</Signal>!
        </button>
      </Component>
    );
    await trigger(container.element, 'button', 'click');
    expect(vNode).toMatchVDOM(
      <>
        <button>
          Count: <Signal ssr-required>{'124'}</Signal>!
        </button>
      </>
    );
  });

  it('should update value for passive option', async () => {
    const Counter = component$((props: { initial: number }) => {
      const count = useSignal(props.initial);
      useOn(
        'click',
        $(() => count.value++),
        {
          passive: true,
        }
      );
      return <button>Count: {count.value}!</button>;
    });

    const { vNode, container } = await render(<Counter initial={123} />, { debug });
    expect(vNode).toMatchVDOM(
      <Component>
        <button>
          Count: <Signal ssr-required>{'123'}</Signal>!
        </button>
      </Component>
    );
    await trigger(container.element, 'button', 'click');
    expect(vNode).toMatchVDOM(
      <>
        <button>
          Count: <Signal ssr-required>{'124'}</Signal>!
        </button>
      </>
    );
  });

  it('should support capture option', async () => {
    (globalThis as any).logs = [];
    const Counter = component$(() => {
      useOn(
        'click',
        $(() => {
          (globalThis as any).logs.push('parent capture');
        }),
        {
          capture: true,
        }
      );
      return (
        <div>
          <button
            onClick$={() => {
              (globalThis as any).logs.push('button bubble');
            }}
          ></button>
        </div>
      );
    });

    const { container } = await render(<Counter />, { debug });
    await trigger(container.element, 'button', 'click');
    expect((globalThis as any).logs).toEqual(['parent capture', 'button bubble']);
    (globalThis as any).logs = undefined;
  });

  it('should merge useOn handlers and modifiers for the same event', async () => {
    (globalThis as any).logs = [];
    const Counter = component$(() => {
      useOn(
        'click',
        $(() => {
          (globalThis as any).logs.push('first');
        }),
        {
          capture: true,
        }
      );
      useOn(
        'click',
        $(() => {
          (globalThis as any).logs.push('second');
        }),
        {
          preventdefault: true,
          stoppropagation: true,
        }
      );
      return (
        <div>
          <button
            onClick$={() => {
              (globalThis as any).logs.push('button bubble');
            }}
          ></button>
        </div>
      );
    });

    const { container } = await render(<Counter />, { debug });
    const event = await trigger(container.element, 'button', 'click');
    expect((globalThis as any).logs).toEqual(['first', 'second']);
    expect(event!.defaultPrevented).toBe(true);
    expect(event!.cancelBubble).toBe(true);
    (globalThis as any).logs = undefined;
  });

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

    const { container } = await render(<Counter />, { debug });
    const event = await trigger(container.element, 'div', 'touchmove');
    expect(event!.defaultPrevented).toBe(true);
  });

  it('should update value with multiple useOn', async () => {
    const Counter = component$((props: { initial: number }) => {
      const count = useSignal(props.initial);
      useOn(
        'click',
        $(() => count.value++)
      );
      useOn(
        'focus',
        $(() => {
          count.value += 2;
        })
      );
      useVisibleTask$(() => {
        count.value += 2;
      });
      return <button>Count: {count.value}!</button>;
    });

    const { vNode, container } = await render(<Counter initial={123} />, { debug });
    if (render === ssrRenderToDom) {
      expect(vNode).toMatchVDOM(
        <Component>
          <button>
            Count: <Signal ssr-required>{'123'}</Signal>!
          </button>
        </Component>
      );
      await trigger(container.element, 'button', 'qvisible');
    }
    expect(vNode).toMatchVDOM(
      <Component>
        <button>
          Count: <Signal ssr-required>{'125'}</Signal>!
        </button>
      </Component>
    );
    await trigger(container.element, 'button', 'click');
    expect(vNode).toMatchVDOM(
      <Component>
        <button>
          Count: <Signal ssr-required>{'126'}</Signal>!
        </button>
      </Component>
    );
    await trigger(container.element, 'button', 'focus');
    expect(vNode).toMatchVDOM(
      <Component>
        <button>
          Count: <Signal ssr-required>{'128'}</Signal>!
        </button>
      </Component>
    );
  });

  it('should update value with mixed listeners', async () => {
    const Counter = component$((props: { initial: number }) => {
      const count = useSignal(props.initial);
      useOn(
        'click',
        $(() => count.value++)
      );
      return <button onFocus$={() => (count.value += 2)}>Count: {count.value}!</button>;
    });

    const { vNode, container } = await render(<Counter initial={123} />, { debug });
    expect(vNode).toMatchVDOM(
      <Component>
        <button>
          Count: <Signal ssr-required>{'123'}</Signal>!
        </button>
      </Component>
    );
    await trigger(container.element, 'button', 'click');
    expect(vNode).toMatchVDOM(
      <Component>
        <button>
          Count: <Signal ssr-required>{'124'}</Signal>!
        </button>
      </Component>
    );
    await trigger(container.element, 'button', 'focus');
    expect(vNode).toMatchVDOM(
      <Component>
        <button>
          Count: <Signal ssr-required>{'126'}</Signal>!
        </button>
      </Component>
    );
  });

  describe('useOnDocument', () => {
    it('should update value', async () => {
      const Counter = component$((props: { initial: number }) => {
        const count = useSignal(props.initial);
        useOnDocument(
          'click',
          $(() => count.value++)
        );
        return <button>Count: {count.value}!</button>;
      });

      const { vNode, container } = await render(<Counter initial={123} />, { debug });
      expect(vNode).toMatchVDOM(
        <Component>
          <button>
            Count: <Signal ssr-required>{'123'}</Signal>!
          </button>
        </Component>
      );

      await trigger(container.element, 'button', 'd:click');
      expect(vNode).toMatchVDOM(
        <Component>
          <button>
            Count: <Signal ssr-required>{'124'}</Signal>!
          </button>
        </Component>
      );
    });

    it('should update value with multiple useOnDocument', async () => {
      const Counter = component$((props: { initial: number }) => {
        const count = useSignal(props.initial);
        useOnDocument(
          'click',
          $(() => count.value++)
        );
        useOnDocument(
          'focus',
          $(() => {
            count.value += 2;
          })
        );
        useVisibleTask$(() => {
          count.value += 2;
        });
        return <button>Count: {count.value}!</button>;
      });

      const { vNode, container } = await render(<Counter initial={123} />, { debug });
      if (render === ssrRenderToDom) {
        expect(vNode).toMatchVDOM(
          <Component>
            <button>
              Count: <Signal ssr-required>{'123'}</Signal>!
            </button>
          </Component>
        );
        await trigger(container.element, 'button', 'qvisible');
      }
      expect(vNode).toMatchVDOM(
        <Component>
          <button>
            Count: <Signal ssr-required>{'125'}</Signal>!
          </button>
        </Component>
      );
      await trigger(container.element, 'button', 'd:click');
      expect(vNode).toMatchVDOM(
        <Component>
          <button>
            Count: <Signal ssr-required>{'126'}</Signal>!
          </button>
        </Component>
      );
      await trigger(container.element, 'button', 'd:focus');
      expect(vNode).toMatchVDOM(
        <Component>
          <button>
            Count: <Signal ssr-required>{'128'}</Signal>!
          </button>
        </Component>
      );
    });

    it('should work with empty component', async () => {
      const Counter = component$((props: { initial: number }) => {
        const count = useSignal(props.initial);
        useOnDocument(
          'click',
          $(() => count.value++)
        );
        return <>Count: {count.value}!</>;
      });

      const { vNode, container } = await render(<Counter initial={123} />, { debug });
      expect(vNode).toMatchVDOM(
        <Component ssr-required>
          <Fragment ssr-required>
            Count: <Signal ssr-required>{'123'}</Signal>!<script hidden></script>
          </Fragment>
        </Component>
      );

      await trigger(container.element, 'script', 'd:click');
      expect(vNode).toMatchVDOM(
        <Component ssr-required>
          <Fragment ssr-required>
            Count: <Signal ssr-required>{'124'}</Signal>!<script hidden></script>
          </Fragment>
        </Component>
      );
    });

    it('should support modifiers on placeholder script nodes', async () => {
      const Counter = component$((props: { initial: number }) => {
        const count = useSignal(props.initial);
        useOnDocument(
          'click',
          $(() => count.value++),
          {
            preventdefault: true,
          }
        );
        return <>Count: {count.value}!</>;
      });

      const { container } = await render(<Counter initial={123} />, { debug });
      expect(container.element.querySelector('script')?.hasAttribute('preventdefault:click')).toBe(
        true
      );
      const event = await trigger(container.element, 'script', 'd:click');
      expect(event!.defaultPrevented).toBe(true);
    });

    it('should work with inline component not rendering children', async () => {
      const Counter = component$((props: { initial: number }) => {
        const count = useSignal(props.initial);
        useOnDocument(
          'click',
          $(() => count.value++)
        );
        return <InlineComponentNoChildren count={count.value} />;
      });

      const { vNode, container } = await render(<Counter initial={123} />, { debug });
      expect(vNode).toMatchVDOM(
        <Component ssr-required>
          <Fragment ssr-required>
            <InlineComponent ssr-required>
              <Fragment ssr-required>
                Count: <Signal ssr-required>{'123'}</Signal>!
              </Fragment>
            </InlineComponent>
            <script hidden />
          </Fragment>
        </Component>
      );

      await trigger(container.element, 'script', 'd:click');
      expect(vNode).toMatchVDOM(
        <Component ssr-required>
          <Fragment ssr-required>
            <InlineComponent ssr-required>
              <Fragment ssr-required>
                Count: <Signal ssr-required>{'124'}</Signal>!
              </Fragment>
            </InlineComponent>
            <script hidden />
          </Fragment>
        </Component>
      );
    });

    it('should update value with mixed listeners', async () => {
      const Counter = component$((props: { initial: number }) => {
        const count = useSignal(props.initial);
        useOnWindow(
          'click',
          $(() => count.value++)
        );
        return <button onFocus$={() => (count.value += 2)}>Count: {count.value}!</button>;
      });

      const { vNode, container } = await render(<Counter initial={123} />, { debug });
      expect(vNode).toMatchVDOM(
        <Component>
          <button>
            Count: <Signal ssr-required>{'123'}</Signal>!
          </button>
        </Component>
      );
      await trigger(container.element, 'button', 'w:click');
      expect(vNode).toMatchVDOM(
        <Component>
          <button>
            Count: <Signal ssr-required>{'124'}</Signal>!
          </button>
        </Component>
      );
      await trigger(container.element, 'button', 'focus');
      expect(vNode).toMatchVDOM(
        <Component>
          <button>
            Count: <Signal ssr-required>{'126'}</Signal>!
          </button>
        </Component>
      );
    });

    it('should update value for DOMContentLoaded event', async () => {
      const Counter = component$((props: { initial: number }) => {
        const count = useSignal(props.initial);
        useOnDocument(
          'DOMContentLoaded',
          $(() => count.value++)
        );
        return <button>Count: {count.value}!</button>;
      });

      const { vNode, container } = await render(<Counter initial={123} />, { debug });
      expect(vNode).toMatchVDOM(
        <Component>
          <button>
            Count: <Signal ssr-required>{'123'}</Signal>!
          </button>
        </Component>
      );
      await trigger(container.element, 'button', 'd:DOMContentLoaded');
      expect(vNode).toMatchVDOM(
        <Component>
          <button>
            Count: <Signal ssr-required>{'124'}</Signal>!
          </button>
        </Component>
      );
    });

    it('should update value for DOMContentLoaded jsx event', async () => {
      const Counter = component$((props: { initial: number }) => {
        const count = useSignal(props.initial);
        return (
          <button document:onDOMContentLoaded$={() => count.value++}>Count: {count.value}!</button>
        );
      });

      const { vNode, container } = await render(<Counter initial={123} />, { debug });
      expect(vNode).toMatchVDOM(
        <Component>
          <button>
            Count: <Signal ssr-required>{'123'}</Signal>!
          </button>
        </Component>
      );
      await trigger(container.element, 'button', 'd:DOMContentLoaded');
      expect(vNode).toMatchVDOM(
        <Component>
          <button>
            Count: <Signal ssr-required>{'124'}</Signal>!
          </button>
        </Component>
      );
    });

    it('should not execute custom event QRL for deleted vnode', async () => {
      (globalThis as any).dispatchCustomEvent = () => {};
      (globalThis as any).receivedLog = [];
      const DispatchChild = component$(() => {
        useTask$(() => {
          (globalThis as any).dispatchCustomEvent();
        });
        return <></>;
      });
      const ReceiveChild = component$(() => {
        const toggle = useSignal(true);
        useOnDocument(
          'child',
          $(() => {
            // grab some scope to go via scheduler
            toggle.value = false;
            (globalThis as any).receivedLog.push('child event');
          })
        );
        return <></>;
      });
      const Parent = component$(() => {
        const toggle = useSignal(true);
        return (
          <>
            <button onClick$={() => (toggle.value = !toggle.value)}></button>
            {toggle.value ? (
              <>
                <DispatchChild key={1} />
                <ReceiveChild key={2} />
              </>
            ) : (
              <>
                <DispatchChild key={3} />
                <ReceiveChild key={3} />
              </>
            )}
          </>
        );
      });

      const { container, document } = await render(<Parent />, { debug });
      (globalThis as any).dispatchCustomEvent = () => {
        // don't await for this event
        trigger(document.documentElement, '[on-document\\:child]', 'd:child');
      };
      // trigger the change
      await trigger(container.element, 'button', 'click');
      // event should not be executed for deleted vnodes
      expect((globalThis as any).receivedLog).toEqual([]);
    });
  });

  describe('useOnWindow', () => {
    it('should update value', async () => {
      const Counter = component$((props: { initial: number }) => {
        const count = useSignal(props.initial);
        useOnWindow(
          'click',
          $(() => count.value++)
        );
        return <button>Count: {count.value}!</button>;
      });

      const { vNode, container } = await render(<Counter initial={123} />, { debug });
      expect(vNode).toMatchVDOM(
        <Component>
          <button>
            Count: <Signal ssr-required>{'123'}</Signal>!
          </button>
        </Component>
      );

      await trigger(container.element, 'button', 'w:click');
      expect(vNode).toMatchVDOM(
        <Component>
          <button>
            Count: <Signal ssr-required>{'124'}</Signal>!
          </button>
        </Component>
      );
    });

    it('should work with empty component', async () => {
      const Counter = component$((props: { initial: number }) => {
        const count = useSignal(props.initial);
        useOnWindow(
          'click',
          $(() => count.value++)
        );
        return <>Count: {count.value}!</>;
      });

      const { vNode, container } = await render(<Counter initial={123} />, { debug });
      expect(vNode).toMatchVDOM(
        <Component ssr-required>
          <Fragment ssr-required>
            Count: <Signal ssr-required>{'123'}</Signal>!<script hidden></script>
          </Fragment>
        </Component>
      );

      await trigger(container.element, 'script', 'w:click');
      expect(vNode).toMatchVDOM(
        <Component ssr-required>
          <Fragment ssr-required>
            Count: <Signal ssr-required>{'124'}</Signal>!<script hidden></script>
          </Fragment>
        </Component>
      );
    });

    it('should support modifiers on placeholder script nodes', async () => {
      const Counter = component$((props: { initial: number }) => {
        const count = useSignal(props.initial);
        useOnWindow(
          'click',
          $(() => count.value++),
          {
            stoppropagation: true,
          }
        );
        return <>Count: {count.value}!</>;
      });

      const { container } = await render(<Counter initial={123} />, { debug });
      expect(container.element.querySelector('script')?.hasAttribute('stoppropagation:click')).toBe(
        true
      );
      const event = await trigger(container.element, 'script', 'w:click');
      expect(event!.cancelBubble).toBe(true);
    });

    it('should update value for window event on element and useOnWindow', async () => {
      const Counter = component$((props: { initial: number }) => {
        const count = useSignal(props.initial);
        useOnWindow(
          'dblclick',
          $(() => count.value++)
        );
        return <button window:onDblClick$={() => count.value++}>Count: {count.value}!</button>;
      });

      const { vNode, container } = await render(<Counter initial={123} />, { debug });
      expect(vNode).toMatchVDOM(
        <Component>
          <button>
            Count: <Signal ssr-required>{'123'}</Signal>!
          </button>
        </Component>
      );

      await trigger(container.element, 'button', 'w:dblclick');
      expect(vNode).toMatchVDOM(
        <Component>
          <button>
            Count: <Signal ssr-required>{'125'}</Signal>!
          </button>
        </Component>
      );
    });

    it('should update value with multiple useOnWindow', async () => {
      const Counter = component$((props: { initial: number }) => {
        const count = useSignal(props.initial);
        useOnWindow(
          'click',
          $(() => count.value++)
        );
        useOnWindow(
          'focus',
          $(() => {
            count.value += 2;
          })
        );
        useVisibleTask$(() => {
          count.value += 2;
        });
        return <button>Count: {count.value}!</button>;
      });

      const { vNode, container } = await render(<Counter initial={123} />, { debug });
      if (render === ssrRenderToDom) {
        expect(vNode).toMatchVDOM(
          <Component>
            <button>
              Count: <Signal ssr-required>{'123'}</Signal>!
            </button>
          </Component>
        );
        await trigger(container.element, 'button', 'qvisible');
      }
      expect(vNode).toMatchVDOM(
        <Component>
          <button>
            Count: <Signal ssr-required>{'125'}</Signal>!
          </button>
        </Component>
      );
      await trigger(container.element, 'button', 'w:click');
      expect(vNode).toMatchVDOM(
        <Component>
          <button>
            Count: <Signal ssr-required>{'126'}</Signal>!
          </button>
        </Component>
      );
      await trigger(container.element, 'button', 'w:focus');
      expect(vNode).toMatchVDOM(
        <Component>
          <button>
            Count: <Signal ssr-required>{'128'}</Signal>!
          </button>
        </Component>
      );
    });

    it('should update value with mixed listeners', async () => {
      const Counter = component$((props: { initial: number }) => {
        const count = useSignal(props.initial);
        useOnDocument(
          'click',
          $(() => count.value++)
        );
        return <button onFocus$={() => (count.value += 2)}>Count: {count.value}!</button>;
      });

      const { vNode, container } = await render(<Counter initial={123} />, { debug });
      expect(vNode).toMatchVDOM(
        <Component>
          <button>
            Count: <Signal ssr-required>{'123'}</Signal>!
          </button>
        </Component>
      );
      await trigger(container.element, 'button', 'd:click');
      expect(vNode).toMatchVDOM(
        <Component>
          <button>
            Count: <Signal ssr-required>{'124'}</Signal>!
          </button>
        </Component>
      );
      await trigger(container.element, 'button', 'focus');
      expect(vNode).toMatchVDOM(
        <Component>
          <button>
            Count: <Signal ssr-required>{'126'}</Signal>!
          </button>
        </Component>
      );
    });
  });

  describe('custom events', () => {
    it('should update counter for useOn', async () => {
      const Counter = component$((props: { initial: number }) => {
        const count = useSignal(props.initial);
        useOn(
          'SomeCustomEvent',
          $(() => count.value++)
        );
        return <button>Count: {count.value}!</button>;
      });

      const { vNode, container } = await render(<Counter initial={123} />, { debug });
      expect(vNode).toMatchVDOM(
        <Component>
          <button>
            Count: <Signal ssr-required>{'123'}</Signal>!
          </button>
        </Component>
      );

      await trigger(container.element, 'button', 'SomeCustomEvent');
      expect(vNode).toMatchVDOM(
        <Component>
          <button>
            Count: <Signal ssr-required>{'124'}</Signal>!
          </button>
        </Component>
      );
    });

    it('should update counter for jsx event', async () => {
      const Counter = component$((props: { initial: number }) => {
        const count = useSignal(props.initial);
        return <button on-SomeCustomEvent$={() => count.value++}>Count: {count.value}!</button>;
      });

      const { vNode, container } = await render(<Counter initial={123} />, { debug });
      expect(vNode).toMatchVDOM(
        <Component>
          <button>
            Count: <Signal ssr-required>{'123'}</Signal>!
          </button>
        </Component>
      );

      await trigger(container.element, 'button', 'SomeCustomEvent');
      expect(vNode).toMatchVDOM(
        <Component>
          <button>
            Count: <Signal ssr-required>{'124'}</Signal>!
          </button>
        </Component>
      );
    });
  });

  it('should update value with useOn, useOnDocument and useOnWindow', async () => {
    const Counter = component$((props: { initial: number }) => {
      const count = useSignal(props.initial);
      useOn(
        'click',
        $(() => count.value++)
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
      useVisibleTask$(() => {
        count.value += 2;
      });
      return <button onResize$={() => (count.value += 4)}>Count: {count.value}!</button>;
    });

    const { vNode, container } = await render(<Counter initial={123} />, { debug });
    if (render === ssrRenderToDom) {
      expect(vNode).toMatchVDOM(
        <Component>
          <button>
            Count: <Signal ssr-required>{'123'}</Signal>!
          </button>
        </Component>
      );
      await trigger(container.element, 'button', 'qvisible');
    }
    expect(vNode).toMatchVDOM(
      <Component>
        <button>
          Count: <Signal ssr-required>{'125'}</Signal>!
        </button>
      </Component>
    );
    await trigger(container.element, 'button', 'click');
    expect(vNode).toMatchVDOM(
      <Component>
        <button>
          Count: <Signal ssr-required>{'126'}</Signal>!
        </button>
      </Component>
    );
    await trigger(container.element, 'button', 'w:focus');
    expect(vNode).toMatchVDOM(
      <Component>
        <button>
          Count: <Signal ssr-required>{'128'}</Signal>!
        </button>
      </Component>
    );
    await trigger(container.element, 'button', 'd:blur');
    expect(vNode).toMatchVDOM(
      <Component>
        <button>
          Count: <Signal ssr-required>{'131'}</Signal>!
        </button>
      </Component>
    );
    await trigger(container.element, 'button', 'resize');
    expect(vNode).toMatchVDOM(
      <Component>
        <button>
          Count: <Signal ssr-required>{'135'}</Signal>!
        </button>
      </Component>
    );
  });

  it('should not add script node in empty components for specific events', async () => {
    const Cmp = component$(() => {
      const signal = useSignal('empty');
      useOn(
        'click',
        $(() => {
          signal.value = 'run';
        })
      );
      return <>{signal.value}</>;
    });
    const { vNode, document } = await render(<Cmp />, { debug });
    await trigger(document.body, 'script', 'click');
    expect(vNode).toMatchVDOM(
      <Component>
        <Fragment>
          <Signal>{'empty'}</Signal>
        </Fragment>
      </Component>
    );
  });

  it('should add event to element returned by promise', async () => {
    const Cmp = component$(() => {
      const signal = useSignal('empty');
      useOn(
        'click',
        $(() => {
          signal.value = 'run';
        })
      );
      return <>{Promise.resolve(<div>{signal.value}</div>)}</>;
    });
    const { vNode, document } = await render(<Cmp />, { debug });
    await trigger(document.body, 'div', 'click');
    expect(vNode).toMatchVDOM(
      <Component>
        <Fragment>
          <Awaited>
            <div>
              <Signal ssr-required>{'run'}</Signal>
            </div>
          </Awaited>
        </Fragment>
      </Component>
    );
  });

  it('should add event to element returned by signal', async () => {
    const Cmp = component$(() => {
      const signal = useSignal('empty');
      const jsx = useSignal(<div>{signal.value}</div>);
      useOn(
        'click',
        $(() => {
          signal.value = 'run';
        })
      );
      return <>{jsx.value}</>;
    });
    const { vNode, document } = await render(<Cmp />, { debug });
    await trigger(document.body, 'div', 'click');
    expect(vNode).toMatchVDOM(
      <Component>
        <Fragment>
          <Awaited>
            <div>
              <Signal ssr-required>{'run'}</Signal>
            </div>
          </Awaited>
        </Fragment>
      </Component>
    );
  });

  it('should add only one event', async () => {
    const Cmp = component$(() => {
      const signal = useSignal(0);
      useOn(
        'click',
        $(() => {
          signal.value++;
        })
      );

      useTask$(async ({ track }) => {
        track(() => signal);
        // rerender component twice
        await Promise.resolve();
        await Promise.resolve();
      });
      return <>{Promise.resolve(<div>{signal.value}</div>)}</>;
    });
    const { document } = await render(<Cmp />, { debug });
    await trigger(document.body, 'div', 'click');
    await expect(document.querySelector('div')).toMatchDOM(<div>1</div>);
  });

  describe('regression', () => {
    it('#7230 - when multiple useOn are used in a component that is headless, it should still execute the events', async () => {
      (globalThis as any).counter = 0;

      const Cmp = component$(() => {
        useOnDocument(
          'click',
          $(() => {
            (globalThis as any).counter++;
          })
        );

        useOnWindow(
          'resize',
          $(() => {
            (globalThis as any).counter++;
          })
        );

        useVisibleTask$(() => {
          (globalThis as any).counter++;
        });

        return <Slot />;
      });

      const LayoutTest = component$(() => {
        return (
          <Cmp>
            <div>test</div>
          </Cmp>
        );
      });
      const { vNode, document } = await render(<LayoutTest />, { debug });
      if (render === ssrRenderToDom) {
        await trigger(document.body, 'script', 'd:qinit');
      }
      await trigger(document.body, 'script', 'd:click');
      await trigger(document.body, 'script', 'w:resize');
      expect((globalThis as any).counter).toBe(3);

      (globalThis as any).counter = undefined;
      expect(vNode).toMatchVDOM(
        <Component ssr-required>
          <Component ssr-required>
            <Component ssr-required>
              <Component ssr-required>
                <div>test</div>
              </Component>
              <script hidden></script>
            </Component>
          </Component>
        </Component>
      );
    });
    it('#7230 - when useOnDocument is used in a component that is not rendered, it should add a script node', async () => {
      const BreakpointProvider = component$(() => {
        useOnDocument(
          'click',
          $(() => {})
        );

        return <Slot />;
      });

      const Layout = component$(() => {
        return (
          <BreakpointProvider>
            <div>test</div>
          </BreakpointProvider>
        );
      });
      const { vNode } = await render(<Layout />, { debug });
      expect(vNode).toMatchVDOM(
        <Component ssr-required>
          <Component ssr-required>
            <Component ssr-required>
              <Projection ssr-required>
                <div>test</div>
              </Projection>
              <script hidden></script>
            </Component>
          </Component>
        </Component>
      );
    });
  });
});

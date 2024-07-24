import {
  $,
  Fragment as Component,
  Fragment,
  Fragment as Signal,
  Fragment as Awaited,
  component$,
  useOn,
  useOnDocument,
  useOnWindow,
  useSignal,
  useVisibleTask$,
  useTask$,
} from '@builder.io/qwik';
import { describe, expect, it } from 'vitest';
import { trigger } from '../../../testing/element-fixture';
import { domRender, ssrRenderToDom } from '../../../testing/rendering.unit-util';
import '../../../testing/vdom-diff.unit-util';

const debug = false; //true;
Error.stackTraceLimit = 100;

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
          Count: <Signal>{'123'}</Signal>!
        </button>
      </Component>
    );
    await trigger(container.element, 'button', 'click');
    expect(vNode).toMatchVDOM(
      <>
        <button>
          Count: <Signal>{'124'}</Signal>!
        </button>
      </>
    );
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
            Count: <Signal>{'123'}</Signal>!
          </button>
        </Component>
      );
      await trigger(container.element, 'button', 'qvisible');
    }
    expect(vNode).toMatchVDOM(
      <Component>
        <button>
          Count: <Signal>{'125'}</Signal>!
        </button>
      </Component>
    );
    await trigger(container.element, 'button', 'click');
    expect(vNode).toMatchVDOM(
      <Component>
        <button>
          Count: <Signal>{'126'}</Signal>!
        </button>
      </Component>
    );
    await trigger(container.element, 'button', 'focus');
    expect(vNode).toMatchVDOM(
      <Component>
        <button>
          Count: <Signal>{'128'}</Signal>!
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
          Count: <Signal>{'123'}</Signal>!
        </button>
      </Component>
    );
    await trigger(container.element, 'button', 'click');
    expect(vNode).toMatchVDOM(
      <Component>
        <button>
          Count: <Signal>{'124'}</Signal>!
        </button>
      </Component>
    );
    await trigger(container.element, 'button', 'focus');
    expect(vNode).toMatchVDOM(
      <Component>
        <button>
          Count: <Signal>{'126'}</Signal>!
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
            Count: <Signal>{'123'}</Signal>!
          </button>
        </Component>
      );

      await trigger(container.element, 'button', ':document:click');
      expect(vNode).toMatchVDOM(
        <Component>
          <button>
            Count: <Signal>{'124'}</Signal>!
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
              Count: <Signal>{'123'}</Signal>!
            </button>
          </Component>
        );
        await trigger(container.element, 'button', 'qvisible');
      }
      expect(vNode).toMatchVDOM(
        <Component>
          <button>
            Count: <Signal>{'125'}</Signal>!
          </button>
        </Component>
      );
      await trigger(container.element, 'button', ':document:click');
      expect(vNode).toMatchVDOM(
        <Component>
          <button>
            Count: <Signal>{'126'}</Signal>!
          </button>
        </Component>
      );
      await trigger(container.element, 'button', ':document:focus');
      expect(vNode).toMatchVDOM(
        <Component>
          <button>
            Count: <Signal>{'128'}</Signal>!
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
        <Component>
          <Fragment>
            Count: <Signal>{'123'}</Signal>!<script type="placeholder" hidden></script>
          </Fragment>
        </Component>
      );

      await trigger(container.element, 'script', ':document:click');
      expect(vNode).toMatchVDOM(
        <Component>
          <Fragment>
            Count: <Signal>{'124'}</Signal>!<script type="placeholder" hidden></script>
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
            Count: <Signal>{'123'}</Signal>!
          </button>
        </Component>
      );
      await trigger(container.element, 'button', ':window:click');
      expect(vNode).toMatchVDOM(
        <Component>
          <button>
            Count: <Signal>{'124'}</Signal>!
          </button>
        </Component>
      );
      await trigger(container.element, 'button', 'focus');
      expect(vNode).toMatchVDOM(
        <Component>
          <button>
            Count: <Signal>{'126'}</Signal>!
          </button>
        </Component>
      );
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
            Count: <Signal>{'123'}</Signal>!
          </button>
        </Component>
      );

      await trigger(container.element, 'button', ':window:click');
      expect(vNode).toMatchVDOM(
        <Component>
          <button>
            Count: <Signal>{'124'}</Signal>!
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
        <Component>
          <Fragment>
            Count: <Signal>{'123'}</Signal>!<script type="placeholder" hidden></script>
          </Fragment>
        </Component>
      );

      await trigger(container.element, 'script', ':window:click');
      expect(vNode).toMatchVDOM(
        <Component>
          <Fragment>
            Count: <Signal>{'124'}</Signal>!<script type="placeholder" hidden></script>
          </Fragment>
        </Component>
      );
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
            Count: <Signal>{'123'}</Signal>!
          </button>
        </Component>
      );

      await trigger(container.element, 'button', ':window:dblclick');
      expect(vNode).toMatchVDOM(
        <Component>
          <button>
            Count: <Signal>{'125'}</Signal>!
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
              Count: <Signal>{'123'}</Signal>!
            </button>
          </Component>
        );
        await trigger(container.element, 'button', 'qvisible');
      }
      expect(vNode).toMatchVDOM(
        <Component>
          <button>
            Count: <Signal>{'125'}</Signal>!
          </button>
        </Component>
      );
      await trigger(container.element, 'button', ':window:click');
      expect(vNode).toMatchVDOM(
        <Component>
          <button>
            Count: <Signal>{'126'}</Signal>!
          </button>
        </Component>
      );
      await trigger(container.element, 'button', ':window:focus');
      expect(vNode).toMatchVDOM(
        <Component>
          <button>
            Count: <Signal>{'128'}</Signal>!
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
            Count: <Signal>{'123'}</Signal>!
          </button>
        </Component>
      );
      await trigger(container.element, 'button', ':document:click');
      expect(vNode).toMatchVDOM(
        <Component>
          <button>
            Count: <Signal>{'124'}</Signal>!
          </button>
        </Component>
      );
      await trigger(container.element, 'button', 'focus');
      expect(vNode).toMatchVDOM(
        <Component>
          <button>
            Count: <Signal>{'126'}</Signal>!
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
            Count: <Signal>{'123'}</Signal>!
          </button>
        </Component>
      );
      await trigger(container.element, 'button', 'qvisible');
    }
    expect(vNode).toMatchVDOM(
      <Component>
        <button>
          Count: <Signal>{'125'}</Signal>!
        </button>
      </Component>
    );
    await trigger(container.element, 'button', 'click');
    expect(vNode).toMatchVDOM(
      <Component>
        <button>
          Count: <Signal>{'126'}</Signal>!
        </button>
      </Component>
    );
    await trigger(container.element, 'button', ':window:focus');
    expect(vNode).toMatchVDOM(
      <Component>
        <button>
          Count: <Signal>{'128'}</Signal>!
        </button>
      </Component>
    );
    await trigger(container.element, 'button', ':document:blur');
    expect(vNode).toMatchVDOM(
      <Component>
        <button>
          Count: <Signal>{'131'}</Signal>!
        </button>
      </Component>
    );
    await trigger(container.element, 'button', 'resize');
    expect(vNode).toMatchVDOM(
      <Component>
        <button>
          Count: <Signal>{'135'}</Signal>!
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
              <Signal>{'run'}</Signal>
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
              <Signal>{'run'}</Signal>
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
});

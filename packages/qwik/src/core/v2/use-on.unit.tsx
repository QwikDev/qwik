import { describe, expect, it } from 'vitest';
import { trigger } from '../../testing/element-fixture';
import {
  $,
  Fragment as Component,
  Fragment as Signal,
  component$,
  useOn,
  useOnDocument,
  useOnWindow,
  useSignal,
  useVisibleTask$,
} from '@builder.io/qwik';
import { domRender, ssrRenderToDom } from './rendering.unit-util';
import './vdom-diff.unit-util';

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
});

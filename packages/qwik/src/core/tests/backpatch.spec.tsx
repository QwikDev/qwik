import {
  createContextId,
  useContext,
  useContextProvider,
  useSignal,
  useTask$,
  type Signal,
  Fragment as Component,
} from '@qwik.dev/core';
import { ssrRenderToDom } from '@qwik.dev/core/testing';
import { describe, expect, it } from 'vitest';
import { component$ } from '../shared/component.public';
import { vi } from 'vitest';
import * as logUtils from '../shared/utils/log';
import { ELEMENT_BACKPATCH_DATA } from '../../server/qwik-copy';

const debug = false; //true;
Error.stackTraceLimit = 100;

describe('SSR Backpatching', () => {
  it('should handle basic backpatching', async () => {
    const Ctx = createContextId<{ descId: Signal<string> }>('bp-ctx-1');

    const Child = component$(() => {
      const context = useContext(Ctx);
      useTask$(() => {
        context.descId.value = 'final-id';
      });
      return <div>child</div>;
    });

    const Root = component$(() => {
      const descId = useSignal('initial-id');
      useContextProvider(Ctx, { descId });
      return (
        <>
          <input aria-describedby={descId.value} />
          <Child />
        </>
      );
    });

    const { document } = await ssrRenderToDom(<Root />, { debug });

    expect(document.body.innerHTML).toContain(ELEMENT_BACKPATCH_DATA);

    const backpatchedInput = document.querySelector('input');

    expect(backpatchedInput?.outerHTML).toContain('aria-describedby="final-id"');
  });

  it('should not log a warning if backpatching is used', async () => {
    const logWarnSpy = vi.spyOn(logUtils, 'logWarn').mockImplementation(() => {});
    const Ctx = createContextId<{ descId: Signal<string> }>('bp-ctx-1');

    const Child = component$(() => {
      const context = useContext(Ctx);
      useTask$(() => {
        context.descId.value = 'final-id';
      });
      return <div>child</div>;
    });

    const Root = component$(() => {
      const descId = useSignal('initial-id');
      useContextProvider(Ctx, { descId });
      return (
        <>
          <input aria-describedby={descId.value} />
          <Child />
        </>
      );
    });

    const { document } = await ssrRenderToDom(<Root />, { debug });

    expect(document.body.innerHTML).toContain(ELEMENT_BACKPATCH_DATA);

    expect(logWarnSpy).toHaveBeenCalledTimes(0);
  });

  it('should apply multiple patches for the same element', async () => {
    const Ctx = createContextId<{ id: Signal<string>; label: Signal<string> }>('ctx');

    const Label = component$(() => {
      const context = useContext(Ctx);
      useTask$(() => {
        context.label.value = 'final-label';
        context.id.value = 'final-id';
      });
      return <label>Label</label>;
    });

    const Input = component$(() => {
      const context = useContext(Ctx);
      return <input aria-labelledby={context.label.value} id={context.id.value} />;
    });

    const Root = component$(() => {
      const id = useSignal('initial-id');
      const label = useSignal('initial-label');
      useContextProvider(Ctx, { id, label });
      return (
        <div>
          <Input />
          <Label />
        </div>
      );
    });

    const { document, vNode } = await ssrRenderToDom(<Root />, { debug });

    expect(document.body.innerHTML).toContain(ELEMENT_BACKPATCH_DATA);

    expect(vNode).toMatchVDOM(
      <Component>
        <div>
          <Component>
            <input aria-labelledby="final-label" id="final-id" />
          </Component>
          <Component>
            <label>Label</label>
          </Component>
        </div>
      </Component>
    );

    const backpatchedInput = document.querySelector('input');
    expect(backpatchedInput?.outerHTML).toContain('aria-labelledby="final-label"');
    expect(backpatchedInput?.outerHTML).toContain('id="final-id"');
  });

  it('should apply multiple patches for different elements', async () => {
    const Ctx = createContextId<{ id: Signal<string>; label: Signal<string> }>('ctx');

    const Child = component$(() => {
      const context = useContext(Ctx);
      useTask$(() => {
        context.label.value = 'final-label';
        context.id.value = 'final-id';
      });
      return <div>Child</div>;
    });

    const Label = component$(() => {
      const context = useContext(Ctx);
      return (
        <label aria-labelledby={context.label.value} id={context.id.value}>
          Label
        </label>
      );
    });

    const Input = component$(() => {
      const context = useContext(Ctx);
      return <input aria-labelledby={context.label.value} id={context.id.value} />;
    });

    const Root = component$(() => {
      const id = useSignal('initial-id');
      const label = useSignal('initial-label');
      useContextProvider(Ctx, { id, label });
      return (
        <div>
          <Input />
          <Label />
          <Child />
        </div>
      );
    });

    const { document, vNode } = await ssrRenderToDom(<Root />, { debug });

    expect(document.body.innerHTML).toContain(ELEMENT_BACKPATCH_DATA);

    expect(vNode).toMatchVDOM(
      <Component>
        <div>
          <Component>
            <input aria-labelledby="final-label" id="final-id" />
          </Component>
          <Component>
            <label aria-labelledby="final-label" id="final-id">
              Label
            </label>
          </Component>
          <Component>
            <div>Child</div>
          </Component>
        </div>
      </Component>
    );

    const backpatchedInput = document.querySelector('input');
    expect(backpatchedInput?.outerHTML).toContain('aria-labelledby="final-label"');
    expect(backpatchedInput?.outerHTML).toContain('id="final-id"');
    const backpatchedLabel = document.querySelector('label');
    expect(backpatchedLabel?.outerHTML).toContain('aria-labelledby="final-label"');
    expect(backpatchedLabel?.outerHTML).toContain('id="final-id"');
  });

  describe('removing attributes', () => {
    it('should remove attribute if the value is undefined', async () => {
      const Ctx = createContextId<{ descId: Signal<string | undefined> }>('bp-ctx-1');

      const Child = component$(() => {
        const context = useContext(Ctx);
        useTask$(() => {
          context.descId.value = undefined;
        });
        return <div>child</div>;
      });

      const Root = component$(() => {
        const descId = useSignal<string | undefined>('initial-id');
        useContextProvider(Ctx, { descId });
        return (
          <>
            <input id="input-id" aria-describedby={descId.value} />
            <Child />
          </>
        );
      });

      const { document } = await ssrRenderToDom(<Root />, { debug });

      expect(document.body.innerHTML).toContain(ELEMENT_BACKPATCH_DATA);

      const backpatchedInput = document.querySelector('input');

      expect(backpatchedInput?.outerHTML).not.toContain('aria-describedby');
      expect(backpatchedInput?.outerHTML).toContain('id="input-id"');
    });

    it('should remove attribute if the value is null', async () => {
      const Ctx = createContextId<{ descId: Signal<string | null> }>('bp-ctx-1');

      const Child = component$(() => {
        const context = useContext(Ctx);
        useTask$(() => {
          context.descId.value = null;
        });
        return <div>child</div>;
      });

      const Root = component$(() => {
        const descId = useSignal<string | null>('initial-id');
        useContextProvider(Ctx, { descId });
        return (
          <>
            <input id="input-id" aria-describedby={descId.value!} />
            <Child />
          </>
        );
      });

      const { document } = await ssrRenderToDom(<Root />, { debug });

      expect(document.body.innerHTML).toContain(ELEMENT_BACKPATCH_DATA);

      const backpatchedInput = document.querySelector('input');

      expect(backpatchedInput?.outerHTML).not.toContain('aria-describedby');
      expect(backpatchedInput?.outerHTML).toContain('id="input-id"');
    });

    it('should remove attribute if the value is false', async () => {
      const Ctx = createContextId<{ descId: Signal<boolean> }>('bp-ctx-1');

      const Child = component$(() => {
        const context = useContext(Ctx);
        useTask$(() => {
          context.descId.value = false;
        });
        return <div>child</div>;
      });

      const Root = component$(() => {
        const descId = useSignal<boolean>(true);
        useContextProvider(Ctx, { descId });
        return (
          <>
            <input id="input-id" disabled={descId.value!} />
            <Child />
          </>
        );
      });

      const { document } = await ssrRenderToDom(<Root />, { debug });

      expect(document.body.innerHTML).toContain(ELEMENT_BACKPATCH_DATA);

      const backpatchedInput = document.querySelector('input');

      expect(backpatchedInput?.outerHTML).not.toContain('disabled');
      expect(backpatchedInput?.outerHTML).toContain('id="input-id"');
    });
  });

  describe('adding attributes', () => {
    it('should add attribute if the value was removed', async () => {
      const Ctx = createContextId<{ descId: Signal<string | undefined> }>('bp-ctx-1');

      const Child = component$(() => {
        const context = useContext(Ctx);
        useTask$(() => {
          context.descId.value = 'final-id';
        });
        return <div>child</div>;
      });

      const Root = component$(() => {
        const descId = useSignal<string | undefined>(undefined);
        useContextProvider(Ctx, { descId });
        return (
          <>
            <input id="input-id" aria-describedby={descId.value} />
            <Child />
          </>
        );
      });

      const { document } = await ssrRenderToDom(<Root />, { debug });

      expect(document.body.innerHTML).toContain(ELEMENT_BACKPATCH_DATA);

      const backpatchedInput = document.querySelector('input');

      expect(backpatchedInput?.outerHTML).toContain('aria-describedby="final-id"');
      expect(backpatchedInput?.outerHTML).toContain('id="input-id"');
    });

    it('should add attribute if the value was false', async () => {
      const Ctx = createContextId<{ descId: Signal<boolean> }>('bp-ctx-1');

      const Child = component$(() => {
        const context = useContext(Ctx);
        useTask$(() => {
          context.descId.value = true;
        });
        return <div>child</div>;
      });

      const Root = component$(() => {
        const descId = useSignal<boolean>(false);
        useContextProvider(Ctx, { descId });
        return (
          <>
            <input id="input-id" disabled={descId.value!} />
            <Child />
          </>
        );
      });

      const { document } = await ssrRenderToDom(<Root />, { debug });

      expect(document.body.innerHTML).toContain(ELEMENT_BACKPATCH_DATA);

      const backpatchedInput = document.querySelector('input');

      expect(backpatchedInput?.outerHTML).toContain('disabled');
      expect(backpatchedInput?.outerHTML).toContain('id="input-id"');
    });
  });

  describe('with injected unknown nodes', () => {
    it('should handle backpatching when a single unknown node is injected', async () => {
      const Ctx = createContextId<{ descId: Signal<string> }>('bp-ctx-inject');

      const Child = component$(() => {
        const context = useContext(Ctx);
        useTask$(() => {
          context.descId.value = 'final-id';
        });
        return <div>child</div>;
      });

      const Root = component$(() => {
        const descId = useSignal('initial-id');
        useContextProvider(Ctx, { descId });
        return (
          <>
            <input aria-describedby={descId.value} />
            <div>some content</div>
            <Child />
          </>
        );
      });

      const { document } = await ssrRenderToDom(<Root />, {
        debug,
        onBeforeResume: (document) => {
          const container = document.querySelector('[q\\:container]');
          const firstChild = container?.firstChild || null;

          const injectedNode = document.createElement('div');
          injectedNode.className = 'injected-unknown-node';
          injectedNode.textContent = 'Unknown Node';

          container?.insertBefore(injectedNode, firstChild);
        },
      });

      const injectedNode = document.querySelector('.injected-unknown-node');
      expect(injectedNode).toBeTruthy();
      expect(injectedNode?.textContent).toBe('Unknown Node');

      const backpatchedInput = document.querySelector('input');

      expect(backpatchedInput?.outerHTML).toContain('aria-describedby="final-id"');
    });

    it('should handle backpatching when multiple unknown nodes are injected', async () => {
      const Ctx = createContextId<{ id: Signal<string>; label: Signal<string> }>('ctx-inject-2');

      const Child = component$(() => {
        const context = useContext(Ctx);
        useTask$(() => {
          context.label.value = 'final-label';
          context.id.value = 'final-id';
        });
        return <div>Child</div>;
      });

      const Input = component$(() => {
        const context = useContext(Ctx);
        return <input aria-labelledby={context.label.value} id={context.id.value} />;
      });

      const Root = component$(() => {
        const id = useSignal('initial-id');
        const label = useSignal('initial-label');
        useContextProvider(Ctx, { id, label });
        return (
          <div>
            <Input />
            <div>separator</div>
            <Child />
          </div>
        );
      });

      const { document } = await ssrRenderToDom(<Root />, {
        debug,
        onBeforeResume: (document) => {
          const container = document.querySelector('[q\\:container]');
          const firstChild = container?.firstChild || null;

          for (let i = 1; i <= 3; i++) {
            const injectedNode = document.createElement('div');
            injectedNode.className = `injected-${i}`;
            injectedNode.textContent = `Injected ${i}`;
            container?.insertBefore(injectedNode, firstChild);
          }
        },
      });

      expect(document.querySelector('.injected-1')).toBeTruthy();
      expect(document.querySelector('.injected-2')).toBeTruthy();
      expect(document.querySelector('.injected-3')).toBeTruthy();

      const backpatchedInput = document.querySelector('input');

      expect(backpatchedInput?.outerHTML).toContain('aria-labelledby="final-label"');
      expect(backpatchedInput?.outerHTML).toContain('id="final-id"');
    });
  });
});

import {
  createContextId,
  useContext,
  useAsync$,
  useContextProvider,
  useSignal,
  useTask$,
  type Signal,
  Fragment as Component,
} from '@qwik.dev/core';
import { createDocument, ssrRenderToDom } from '@qwik.dev/core/testing';
import { describe, expect, it } from 'vitest';
import { component$ } from '../shared/component.public';
import { vi } from 'vitest';
import * as logUtils from '../shared/utils/log';
import { ELEMENT_BACKPATCH_DATA } from '../../server/qwik-copy';
import { executeBackpatch } from '../../backpatch-executor-shared';

const debug = false; //true;
Error.stackTraceLimit = 100;

describe('SSR Backpatching', () => {
  it('should apply the latest backpatch data script', () => {
    const document = createDocument({
      html: `
        <div q:container="paused" :="">
          <input :="" id="initial">
          <script type="qwik/backpatch">[1,"id","first"]</script>
          <script type="qwik/backpatch">[1,"id","second",1,"aria-label","second"]</script>
        </div>
      `,
    });
    const container = document.querySelector('[q\\:container]')!;
    (globalThis as any).NodeFilter = {
      SHOW_ELEMENT: 1,
      SHOW_ALL: -1,
      SHOW_ATTRIBUTE: 2,
      SHOW_TEXT: 4,
      SHOW_CDATA_SECTION: 8,
      SHOW_ENTITY_REFERENCE: 16,
      SHOW_ENTITY: 32,
      SHOW_PROCESSING_INSTRUCTION: 64,
      SHOW_COMMENT: 128,
      SHOW_DOCUMENT: 256,
      SHOW_DOCUMENT_TYPE: 512,
      SHOW_DOCUMENT_FRAGMENT: 1024,
      SHOW_NOTATION: 2048,
    };
    executeBackpatch(document, container);

    const input = document.querySelector('input')!;
    expect(input.getAttribute('id')).toBe('second');
    expect(input.getAttribute('aria-label')).toBe('second');
  });

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

  it('should preserve script delimiters in backpatch values', async () => {
    const boundaryValue = '</script><template data-backpatch-marker></template>';
    const Ctx = createContextId<Signal<string>>('bp-script-boundary');

    const Child = component$(() => {
      const value = useContext(Ctx);
      useTask$(() => {
        value.value = boundaryValue;
      });
      return <div>child</div>;
    });

    const Root = component$(() => {
      const value = useSignal('initial');
      useContextProvider(Ctx, value);
      return (
        <>
          <input aria-label={value.value} />
          <Child />
        </>
      );
    });

    const { document } = await ssrRenderToDom(<Root />, { debug });
    const scripts = document.querySelectorAll(`script[type="${ELEMENT_BACKPATCH_DATA}"]`);

    expect(scripts).toHaveLength(1);
    expect(JSON.parse(scripts[0].textContent || '[]')).toContain(boundaryValue);
    expect(document.querySelector('input')?.getAttribute('aria-label')).toBe(boundaryValue);
    expect(document.querySelector('template[data-backpatch-marker]')).toBeFalsy();
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

  it('should apply patches queued in reverse document order (executor walks forward-only)', async () => {
    const CtxA = createContextId<{ early: Signal<string> }>('bp-rev-a');
    const CtxB = createContextId<{ late: Signal<string> }>('bp-rev-b');

    const MutateLate = component$(() => {
      const context = useContext(CtxB);
      useTask$(() => {
        context.late.value = 'late-final';
      });
      return <span>mutate-late</span>;
    });

    const MutateEarly = component$(() => {
      const context = useContext(CtxA);
      useTask$(() => {
        context.early.value = 'early-final';
      });
      return <span>mutate-early</span>;
    });

    const Root = component$(() => {
      const early = useSignal('early-initial');
      const late = useSignal('late-initial');
      useContextProvider(CtxA, { early });
      useContextProvider(CtxB, { late });
      return (
        <div>
          <input id="early" aria-label={early.value} />
          <input id="late" aria-label={late.value} />
          <MutateLate />
          <MutateEarly />
        </div>
      );
    });

    const { document } = await ssrRenderToDom(<Root />, { debug });

    expect(document.body.innerHTML).toContain(ELEMENT_BACKPATCH_DATA);
    expect(document.querySelector('#early')?.getAttribute('aria-label')).toBe('early-final');
    expect(document.querySelector('#late')?.getAttribute('aria-label')).toBe('late-final');
  });

  it('should not serialize backpatched attributes into vnode data', async () => {
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
      return (
        <article aria-labelledby={context.label.value} id={context.id.value}>
          <input />
        </article>
      );
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
            <article aria-labelledby="final-label" id="final-id">
              <input></input>
            </article>
          </Component>
          <Component>
            <label>Label</label>
          </Component>
        </div>
      </Component>
    );

    const backpatchedArticle = document.querySelector('article');
    expect(
      (backpatchedArticle?.ownerDocument as any).qVNodeData?.get(backpatchedArticle)
    ).not.toContain('aria');
  });

  it('should serialize async style objects before backpatching', async () => {
    const Child = component$<{ color: string }>(({ color }) => {
      return (
        <div id="style-target" style={{ color }}>
          Styled
        </div>
      );
    });

    const Parent = component$(() => {
      const color = useAsync$(() => Promise.resolve('red'));
      return <Child color={color.value} />;
    });

    const { document } = await ssrRenderToDom(<Parent />, { debug });
    const target = document.querySelector('#style-target');

    expect(document.body.innerHTML).toContain(ELEMENT_BACKPATCH_DATA);
    expect(target?.getAttribute('style')).toBe('color:red');
    expect(target?.outerHTML).not.toContain('[object Object]');
  });

  it('should serialize async class objects before backpatching', async () => {
    const Child = component$<{ isActive: boolean }>(({ isActive }) => {
      return (
        <div
          id="class-target"
          class={{
            active: isActive,
            inactive: !isActive,
          }}
        >
          Styled
        </div>
      );
    });

    const Parent = component$(() => {
      const isActive = useAsync$(() => Promise.resolve(true));
      return <Child isActive={isActive.value} />;
    });

    const { document } = await ssrRenderToDom(<Parent />, { debug });
    const target = document.querySelector('#class-target');

    expect(document.body.innerHTML).toContain(ELEMENT_BACKPATCH_DATA);
    expect(target?.getAttribute('class')).toBe('active');
    expect(target?.outerHTML).not.toContain('[object Object]');
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

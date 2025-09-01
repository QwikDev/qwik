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
import { SSRBackpatch } from '../shared/jsx/utils.public';
import { vi } from 'vitest';
import * as logUtils from '../shared/utils/log';

const debug = true;

describe('SSR Backpatching (attributes only, wrapper-scoped)', () => {
  it('emits marker and JSON blob when signal-derived attribute changes', async () => {
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
        <SSRBackpatch>
          <input aria-describedby={descId.value} />
          <Child />
        </SSRBackpatch>
      );
    });

    const { document, vNode } = await ssrRenderToDom(<Root />, { debug });

    expect(vNode).toMatchVDOM(
      <Component>
        <input aria-describedby="final-id" />
        <Component>
          <div>child</div>
        </Component>
      </Component>
    );

    const backpatchedInput = document.querySelector('input');

    expect(backpatchedInput).toMatchDOM(`<input aria-describedby="final-id" />`);
  });

  it('should not log a warning if we are backpatching', async () => {
    const logWarnSpy = vi.spyOn(logUtils, 'logWarn').mockImplementation(() => {});

    const rootContextId = createContextId<RootContext>('root-context');

    type RootContext = {
      isLabel: Signal<boolean>;
      isDescription: Signal<boolean>;
    };

    const Label = component$(() => {
      const context = useContext(rootContextId);

      useTask$(() => {
        context.isLabel.value = true;
      });

      return <div>Label</div>;
    });

    const Sibling = component$(() => {
      const context = useContext(rootContextId);

      return (
        <>
          <p>Does Sibling know about Label? {context.isLabel.value ? 'Yes' : 'No'}</p>
          <p>Does Sibling know about Description? {context.isDescription.value ? 'Yes' : 'No'} </p>
        </>
      );
    });

    const Description = component$(() => {
      const context = useContext(rootContextId);

      useTask$(() => {
        context.isDescription.value = true;
      });

      return <div>Description</div>;
    });

    const Cmp = component$(() => {
      const isLabel = useSignal(false);
      const isDescription = useSignal(false);

      const context: RootContext = {
        isLabel,
        isDescription,
      };

      useContextProvider(rootContextId, context);

      return (
        <SSRBackpatch>
          <Label />
          <Sibling />
          <Description />
        </SSRBackpatch>
      );
    });

    await ssrRenderToDom(<Cmp />, { debug });

    expect(logWarnSpy).toHaveBeenCalledTimes(0);
  });

  it('auto mode without SSRBackpatch: parent attr reads child-updated signal', async () => {
    const Ctx = createContextId<{ descId: Signal<string> }>('bp-ctx-2');

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
        <div>
          <input aria-describedby={descId.value} />
          <Child />
        </div>
      );
    });

    const { document, vNode } = await ssrRenderToDom(<Root />, { debug });

    expect(vNode).toMatchVDOM(
      <Component>
        <div>
          <input aria-describedby="final-id" />
          <Component>
            <div>child</div>
          </Component>
        </div>
      </Component>
    );

    const backpatchedInput = document.querySelector('input');
    expect(backpatchedInput).toMatchDOM(`<input aria-describedby="final-id" />`);
  });

  it('nested components: multiple patches for different elements', async () => {
    const Ctx = createContextId<{ inputId: Signal<string>; labelId: Signal<string> }>('bp-ctx-3');

    const Label = component$(() => {
      const context = useContext(Ctx);
      useTask$(() => {
        context.labelId.value = 'final-label-id';
      });
      return <label>Label</label>;
    });

    const Input = component$((props: { 'aria-labelledby': string; id: string }) => {
      const context = useContext(Ctx);
      useTask$(() => {
        context.inputId.value = 'final-input-id';
      });
      return <input aria-labelledby={props['aria-labelledby']} id={props.id} />;
    });

    const Root = component$(() => {
      const inputId = useSignal('initial-input-id');
      const labelId = useSignal('initial-label-id');
      useContextProvider(Ctx, { inputId, labelId });
      return (
        <div>
          <Label />
          <Input aria-labelledby={labelId.value} id={inputId.value} />
        </div>
      );
    });

    const { document, vNode } = await ssrRenderToDom(<Root />, { debug });

    expect(vNode).toMatchVDOM(
      <Component>
        <div>
          <Component>
            <label>Label</label>
          </Component>
          <Component>
            <input aria-labelledby="final-label-id" id="final-input-id" />
          </Component>
        </div>
      </Component>
    );

    const backpatchedInput = document.querySelector('input');
    expect(backpatchedInput).toMatchDOM(
      `<input aria-labelledby="final-label-id" id="final-input-id" />`
    );
  });
});

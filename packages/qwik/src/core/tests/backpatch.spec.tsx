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
import { ELEMENT_BACKPATCH_DATA } from '../shared/utils/markers';
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

    // this is the id of the input node in the stack. If you change the structure of the test, you need to change this.
    const ssrNodeId = '4';

    const { document, vNode } = await ssrRenderToDom(<Root />, { debug });

    expect(vNode).toMatchVDOM(
      <Component>
        {/* @ts-expect-error - q:bid is not a prop */}
        <input aria-describedby="final-id" q:bid={ssrNodeId} />
        <Component>
          <div>child</div>
        </Component>
        <script
          type={ELEMENT_BACKPATCH_DATA}
        >{`["${ssrNodeId}","aria-describedby","final-id"]`}</script>
      </Component>
    );

    const backpatchedInput = document.querySelector('input');

    expect(backpatchedInput).toMatchDOM(
      `<input aria-describedby="final-id" q:bid="${ssrNodeId}" />`
    );
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

  // We discussed another test where the warning is shown, however we haven't ran into a use case where this would happen yet to reproduce. Maybe when the Backpatch component is not present? Would require a change in the scheduler.
});

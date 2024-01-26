import { describe, expect, it } from 'vitest';
import { component$ } from '../component/component.public';
import { ssrRenderToDom } from './ssr-render.unit';
import './vdom-diff.unit';
import { createContextId, useContext, useContextProvider } from '../use/use-context';
import { Fragment as Component } from '@builder.io/qwik/jsx-runtime';
import { useSignal } from '../use/use-signal';
import { useLexicalScope } from '../use/use-lexical-scope.public';
import { trigger } from '../../testing/element-fixture';
import { inlinedQrl } from '../qrl/qrl';

describe('useContext', () => {
  it('should provide and retrieve a context', async () => {
    const contextId = createContextId<{ value: string }>('myTest');
    const Provider = component$(() => {
      useContextProvider(contextId, { value: 'CONTEXT_VALUE' });
      return <Consumer />;
    });
    const Consumer = component$(() => {
      const ctxValue = useContext(contextId);
      return <span>{ctxValue.value}</span>;
    });

    const { vNode } = await ssrRenderToDom(<Provider />, {
      // debug: true,
    });
    expect(vNode).toMatchVDOM(
      <Component>
        <Component>
          <span>CONTEXT_VALUE</span>
        </Component>
      </Component>
    );
  });
  it('should provide and retrieve a context on client change', async () => {
    const contextId = createContextId<{ value: string }>('myTest');
    const Provider = component$(() => {
      useContextProvider(contextId, { value: 'CONTEXT_VALUE' });
      const show = useSignal(false);
      return show.value ? (
        <Consumer />
      ) : (
        <button
          onClick$={inlinedQrl(() => (useLexicalScope()[0].value = true), 's_click', [show])}
        />
      );
    });
    const Consumer = component$(() => {
      const ctxValue = useContext(contextId);
      return <span>{ctxValue.value}</span>;
    });

    const { vNode, document } = await ssrRenderToDom(<Provider />, {
      // debug: true,
    });
    await trigger(document.body, 'button', 'click');
    expect(vNode).toMatchVDOM(
      <Component>
        <Component>
          <span>CONTEXT_VALUE</span>
        </Component>
      </Component>
    );
  });
});

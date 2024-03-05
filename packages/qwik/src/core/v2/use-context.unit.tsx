import { Fragment as Component } from '@builder.io/qwik/jsx-runtime';
import { describe, expect, it } from 'vitest';
import { trigger } from '../../testing/element-fixture';
import { component$ } from '../component/component.public';
import { inlinedQrl } from '../qrl/qrl';
import { createContextId, useContext, useContextProvider } from '../use/use-context';
import { useLexicalScope } from '../use/use-lexical-scope.public';
import { useSignal } from '../use/use-signal';
import { domRender, ssrRenderToDom } from './rendering.unit-util';
import './vdom-diff.unit-util';

const debug = false; //true;
Error.stackTraceLimit = 100;

[
  ssrRenderToDom, //
  domRender, //
].forEach((render) => {
  describe(render.name + 'useContext', () => {
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

      const { vNode } = await render(<Provider />, { debug });
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

      const { vNode, document } = await render(<Provider />, { debug });
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
});
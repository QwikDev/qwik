import { describe, expect, it } from 'vitest';
import { component$ } from '../component/component.public';
import { Fragment as Component } from '../render/jsx/jsx-runtime';
import { useSignal } from '../use/use-signal';
import { useVisibleTask$ } from '../use/use-task';
import { domRender, ssrRenderToDom } from './rendering.unit-util';
import './vdom-diff.unit-util';

const debug = false; //true;
Error.stackTraceLimit = 100;

[
  ssrRenderToDom, //
  domRender, //
].forEach((render) => {
  describe(render.name + ': useVisibleTask', () => {
    it('should execute visible task', async () => {
      const Counter = component$(() => {
        const count = useSignal('SSR');
        useVisibleTask$(() => {
          count.value = 'CSR';
        });
        return <span>{count.value}</span>;
      });

      const { vNode } = await render(<Counter />, { debug });
      expect(vNode).toMatchVDOM(
        <Component>
          <span>CSR</span>
        </Component>
      );
    });
  });
});

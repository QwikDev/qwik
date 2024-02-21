import { describe, expect, it } from 'vitest';
import { component$ } from '../component/component.public';
import { Fragment as Component, Fragment } from '../render/jsx/jsx-runtime';
import { domRender, ssrRenderToDom } from './rendering.unit-util';
import './vdom-diff.unit-util';

const debug = false; //true;
Error.stackTraceLimit = 100;

[
  ssrRenderToDom, //
  domRender, //
].forEach((render) => {
  describe(render.name + ': render promise', () => {
    it('should render promise', async () => {
      const TestCmp = component$(() => {
        const promise = Promise.resolve('PROMISE_VALUE');
        return <div>{promise}</div>;
      });

      const { vNode } = await render(<TestCmp />, { debug });
      expect(vNode).toMatchVDOM(
        <Component>
          <div>
            <Fragment>PROMISE_VALUE</Fragment>
          </div>
        </Component>
      );
    });
  });
});

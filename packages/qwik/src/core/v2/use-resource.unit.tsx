import { describe, expect, it } from 'vitest';
import { component$ } from '../component/component.public';
import { inlinedQrl } from '../qrl/qrl';
import {
  Fragment as Awaited,
  Fragment as Component,
  Fragment,
  Fragment as InlineComponent,
} from '../render/jsx/jsx-runtime';
import { Resource, useResourceQrl } from '../use/use-resource';
import { domRender, ssrRenderToDom } from './rendering.unit-util';
import './vdom-diff.unit-util';

const debug = false; //true;
Error.stackTraceLimit = 100;

[
  ssrRenderToDom, //
  domRender, //
].forEach((render) => {
  describe(render.name + ': useResource', () => {
    it('should execute visible task', async () => {
      const TestCmp = component$(() => {
        const rsrc = useResourceQrl(inlinedQrl(() => 'RESOURCE_VALUE', 's_resource'));
        return (
          <div>
            <Resource value={rsrc} onResolved={(v) => <span>{v}</span>} />
          </div>
        );
      });

      const { vNode } = await render(<TestCmp />, { debug });
      const result = <span>RESOURCE_VALUE</span>;
      expect(vNode).toMatchVDOM(
        <Component>
          <div>
            <InlineComponent>
              <Fragment>
                <Awaited>{result}</Awaited>
              </Fragment>
            </InlineComponent>
          </div>
        </Component>
      );
    });
  });
});

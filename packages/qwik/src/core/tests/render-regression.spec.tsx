import { Fragment as Component, component$, Fragment, useSignal } from '@qwik.dev/core';
import { trigger } from '@qwik.dev/core/testing';
import { describe, expect, it } from 'vitest';
import { domRender, ssrRenderToDom } from '../../testing/rendering.unit-util';
import '../../testing/vdom-diff.unit-util';

const debug = false; //true;
Error.stackTraceLimit = 100;

describe.each([
  { render: ssrRenderToDom }, //
  { render: domRender }, //
])('$render.name: render regression', ({ render }) => {
  describe('issue #2608', () => {
    it('same tag', async () => {
      const Issue2608 = component$(() => {
        const show = useSignal(false);
        return (
          <>
            <button onClick$={() => (show.value = !show.value)} />
            {show.value && <div>Content</div>}
            <div>
              <input type="text" />
            </div>
          </>
        );
      });

      const { vNode, container, document } = await render(<Issue2608 />, { debug });
      // const toggle = page.locator('#issue-2608-btn');
      const input = () => document.querySelector('input') as HTMLInputElement;
      expect(input().value).toBe('');
      expect(vNode).toMatchVDOM(
        <Component ssr-required>
          <Fragment ssr-required>
            <button />
            {''}
            <div>
              <input type="text"></input>
            </div>
          </Fragment>
        </Component>
      );
      input().value = 'some text';
      await trigger(container.element, 'button', 'click'); // show
      expect(input().value).toBe('some text');
      await trigger(container.element, 'button', 'click'); // hide
      expect(input().value).toBe('some text');
      await trigger(container.element, 'button', 'click'); // show
      expect(input().value).toBe('some text');
    });

    it('different tag', async () => {
      const Issue2608 = component$(() => {
        const show = useSignal(false);
        return (
          <>
            <button onClick$={() => (show.value = !show.value)} />
            {show.value && <span>Content</span>}
            <div>
              <input type="text" />
            </div>
          </>
        );
      });

      const { vNode, container, document } = await render(<Issue2608 />, { debug });
      // const toggle = page.locator('#issue-2608-btn');
      const input = () => document.querySelector('input') as HTMLInputElement;
      expect(input().value).toBe('');
      expect(vNode).toMatchVDOM(
        <Component ssr-required>
          <Fragment ssr-required>
            <button />
            {''}
            <div>
              <input type="text"></input>
            </div>
          </Fragment>
        </Component>
      );
      input().value = 'some text';
      await trigger(container.element, 'button', 'click'); // show
      expect(input().value).toBe('some text');
      await trigger(container.element, 'button', 'click'); // hide
      expect(input().value).toBe('some text');
      await trigger(container.element, 'button', 'click'); // show
      expect(input().value).toBe('some text');
    });
  });
});

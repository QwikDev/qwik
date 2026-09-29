import {
  $,
  Fragment as Component,
  component$,
  Fragment,
  useSignal,
  useStore,
  useTask$,
  type QRL,
} from '@qwik.dev/core';
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

  describe('issue #9009', () => {
    it('should notify a task tracking a wrapped prop after repeated parent renders', async () => {
      // Module-scope log: a captured array would be serialized, so SSR would push into a copy
      const taskLog: boolean[] = ((globalThis as any).log = []);

      const Panel = component$<{ open?: boolean; onClose$?: QRL<() => void> }>((props) => {
        useTask$(({ track }) => {
          (globalThis as any).log.push(track(() => props.open) === true);
        });
        return (
          <dialog open={props.open === true}>
            <button id="close" onClick$={props.onClose$} />
          </dialog>
        );
      });

      const Issue9009 = component$(() => {
        const store = useStore<{ action?: string; loading: boolean }>({ loading: false });
        return (
          <main>
            <button id="reload" onClick$={() => (store.loading = !store.loading)} />
            <button id="open" onClick$={() => (store.action = 'FILTERS')} />
            {store.loading ? <p>Loading</p> : <p>Loaded</p>}
            <Panel
              open={store.action === 'FILTERS'}
              onClose$={$(() => {
                store.action = undefined;
              })}
            />
          </main>
        );
      });

      const { container } = await render(<Issue9009 />, { debug });
      expect(taskLog).toEqual([false]);

      // Two parent renders without the task running in between create newer, equivalent wrappers
      await trigger(container.element, '#reload', 'click');
      await trigger(container.element, '#reload', 'click');
      expect(taskLog).toEqual([false]);

      await trigger(container.element, '#open', 'click');
      expect(taskLog).toEqual([false, true]);

      await trigger(container.element, '#close', 'click');
      expect(taskLog).toEqual([false, true, false]);
    });
  });
});

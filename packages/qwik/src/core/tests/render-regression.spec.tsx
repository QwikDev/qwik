import {
  $,
  Fragment as Component,
  component$,
  Fragment,
  Slot,
  useComputed$,
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

  describe('issue #9189', () => {
    it('should keep updating attributes of an element after a component is inserted before it', async () => {
      const Alert = component$<{ message: string }>((props) => (
        <div role="alert">{props.message}</div>
      ));

      const Issue9189 = component$(() => {
        const error = useSignal('');
        const busy = useSignal(false);
        return (
          <section>
            {!!error.value && <Alert message={error.value} />}
            <button
              id="pay"
              aria-busy={busy.value || undefined}
              class={['pay', busy.value && 'busy']}
              onClick$={() => {
                error.value = '';
                busy.value = true;
              }}
            />
            <button
              id="decline"
              onClick$={() => {
                error.value = 'Card declined';
                busy.value = false;
              }}
            />
          </section>
        );
      });

      const { container, document } = await render(<Issue9189 />, { debug });
      const pay = () => document.querySelector('#pay')!;

      await trigger(container.element, '#pay', 'click');
      expect(pay().getAttribute('class')).toBe('pay busy');
      expect(pay().getAttribute('aria-busy')).toBe('true');

      await trigger(container.element, '#decline', 'click');
      expect(document.querySelector('[role=alert]')!.textContent).toBe('Card declined');
      expect(pay().getAttribute('class')).toBe('pay');
      expect(pay().hasAttribute('aria-busy')).toBe(false);

      await trigger(container.element, '#pay', 'click');
      expect(document.querySelectorAll('[role=alert]')).toHaveLength(0);
      expect(pay().getAttribute('class')).toBe('pay busy');
      expect(pay().getAttribute('aria-busy')).toBe('true');
    });
  });

  describe('conditional siblings', () => {
    it('should insert a conditional element in place before an empty conditional', async () => {
      const Cmp = component$(() => {
        const first = useSignal(false);
        const second = useSignal(false);
        return (
          <div>
            <button id="first" onClick$={() => (first.value = true)} />
            {first.value && <i id="a" />}
            {second.value && <i id="b" />}
            <button id="second" onClick$={() => (second.value = true)} />
          </div>
        );
      });

      const { container, document } = await render(<Cmp />, { debug });
      const ids = () => Array.from(document.querySelectorAll('[id]'), (el) => el.id);

      await trigger(container.element, '#first', 'click');
      expect(ids()).toEqual(['first', 'a', 'second']);

      await trigger(container.element, '#second', 'click');
      expect(ids()).toEqual(['first', 'a', 'b', 'second']);
    });

    it('should insert a projected conditional in place before an empty conditional', async () => {
      const Wrapper = component$(() => (
        <div>
          <Slot />
          <span id="after" />
        </div>
      ));
      const Cmp = component$(() => {
        const first = useSignal(false);
        const second = useSignal(false);
        return (
          <>
            <button id="first" onClick$={() => (first.value = true)} />
            <Wrapper>
              {first.value && <i id="a" />}
              {second.value && <i id="b" />}
            </Wrapper>
          </>
        );
      });

      const { container, document } = await render(<Cmp />, { debug });
      const ids = () => Array.from(document.querySelectorAll('[id]'), (el) => el.id);

      await trigger(container.element, '#first', 'click');
      expect(ids()).toEqual(['first', 'a', 'after']);
    });
  });

  describe('props derived from render-local values', () => {
    const Child = component$<{ open?: boolean }>((props) => {
      const computedOpen = useComputed$(() => props.open === true);
      const trackedOpen = useSignal(false);
      useTask$(({ track }) => {
        trackedOpen.value = track(() => props.open) === true;
      });
      return (
        <p>
          {String(props.open)} {String(computedOpen.value)} {String(trackedOpen.value)}
        </p>
      );
    });

    it('should update subscribers of an expression prop', async () => {
      const Parent = component$(() => {
        const items = useSignal<string[]>([]);
        const visible = items.value.slice(0, 5);
        return (
          <>
            <button onClick$={() => (items.value = [...items.value, 'item'])} />
            <Child open={visible.length > 0} />
          </>
        );
      });

      const { container, document } = await render(<Parent />, { debug });
      expect(document.querySelector('p')!.textContent).toBe('false false false');

      await trigger(container.element, 'button', 'click');
      expect(document.querySelector('p')!.textContent).toBe('true true true');
    });

    it('should update subscribers of a member prop', async () => {
      const Parent = component$(() => {
        const items = useSignal<string[]>([]);
        const state = { open: items.value.length > 0 };
        return (
          <>
            <button onClick$={() => (items.value = [...items.value, 'item'])} />
            <Child open={state.open} />
          </>
        );
      });

      const { container, document } = await render(<Parent />, { debug });
      expect(document.querySelector('p')!.textContent).toBe('false false false');

      await trigger(container.element, 'button', 'click');
      expect(document.querySelector('p')!.textContent).toBe('true true true');
    });
  });
});

import { component$, useSignal } from '@qwik.dev/core';
import { domRender, trigger, waitForDrain } from '@qwik.dev/core/testing';
import { describe, expect, it } from 'vitest';
import { _useHmr } from '../internal';
import { OnRenderProp } from '../shared/utils/markers';
import { SERIALIZABLE_STATE } from '../shared/component.public';

const debug = false;

async function triggerHmr(container: any, files: string[]) {
  const t = Date.now();
  container.document.__hmrT = t;
  await trigger(container.element, null, 'd:q-hmr', {
    detail: { files, t },
  });
  await true;
  await waitForDrain(container);
}

describe('domRender: HMR const attr (module-reload simulation)', () => {
  const render = domRender;

  it('updates a nested const attr after an HMR source edit', async () => {
    const Comp = component$(() => {
      _useHmr('c.tsx');
      useSignal(0);
      return (
        <div key="root" data-qwik-inspector="c.tsx:1:1">
          <span class="a">x</span>
        </div>
      );
    });
    const CompEdited = component$(() => {
      _useHmr('c.tsx');
      useSignal(0);
      return (
        <div key="root" data-qwik-inspector="c.tsx:1:1">
          <span class="b">x</span>
        </div>
      );
    });

    const { vNode, container } = await render(<Comp />, { debug });
    const before = container.element.querySelector('span');
    expect(before?.getAttribute('class')).toBe('a');

    const editedFn = await (CompEdited as any)[SERIALIZABLE_STATE][0].resolve();
    const qrl: any = (container as any).getHostProp(vNode, OnRenderProp);
    qrl.resolved = editedFn;

    await triggerHmr(container, ['c.tsx']);

    const after = container.element.querySelector('span');
    expect(before === after).toBe(true);
    expect(after?.getAttribute('class')).toBe('b');
  });

  it('keeps an HMR-applied const attr through a later reactive re-render', async () => {
    const Comp = component$(() => {
      _useHmr('c.tsx');
      const count = useSignal(0);
      return (
        <div key="root" data-qwik-inspector="c.tsx:1:1">
          <span class="a" id={`n${count.value}`}>
            x
          </span>
          <button onClick$={() => count.value++}>+</button>
        </div>
      );
    });
    const CompEdited = component$(() => {
      _useHmr('c.tsx');
      const count = useSignal(0);
      return (
        <div key="root" data-qwik-inspector="c.tsx:1:1">
          <span class="b" id={`n${count.value}`}>
            x
          </span>
          <button onClick$={() => count.value++}>+</button>
        </div>
      );
    });

    const { vNode, container } = await render(<Comp />, { debug });
    const qrl: any = (container as any).getHostProp(vNode, OnRenderProp);
    qrl.resolved = await (CompEdited as any)[SERIALIZABLE_STATE][0].resolve();
    await triggerHmr(container, ['c.tsx']);
    expect(container.element.querySelector('span')?.getAttribute('class')).toBe('b');

    await trigger(container.element, 'button', 'click');
    await waitForDrain(container);
    const span = container.element.querySelector('span');
    expect(span?.getAttribute('id')).toBe('n1');
    expect(span?.getAttribute('class')).toBe('b');
  });

  it('updates the const attr on every instance in a list', async () => {
    const Item = component$(() => {
      _useHmr('item.tsx');
      return (
        <div key="root" data-qwik-inspector="item.tsx:1:1">
          <span class="a">x</span>
        </div>
      );
    });
    const ItemEdited = component$(() => {
      _useHmr('item.tsx');
      return (
        <div key="root" data-qwik-inspector="item.tsx:1:1">
          <span class="b">x</span>
        </div>
      );
    });
    const List = component$(() => (
      <div>
        <Item />
        <Item />
        <Item />
      </div>
    ));

    const { container } = await render(<List />, { debug });
    const classes = () =>
      Array.from(container.document.querySelectorAll('span') as ArrayLike<Element>, (s) =>
        s.getAttribute('class')
      );
    expect(classes()).toEqual(['a', 'a', 'a']);

    (Item as any)[SERIALIZABLE_STATE][0].resolved = await (ItemEdited as any)[
      SERIALIZABLE_STATE
    ][0].resolve();
    await triggerHmr(container, ['item.tsx']);

    expect(classes()).toEqual(['b', 'b', 'b']);
  });

  it('updates a const textarea value on HMR', async () => {
    const Comp = component$(() => {
      _useHmr('t.tsx');
      return (
        <div key="root" data-qwik-inspector="t.tsx:1:1">
          <textarea value="a" />
        </div>
      );
    });
    const CompEdited = component$(() => {
      _useHmr('t.tsx');
      return (
        <div key="root" data-qwik-inspector="t.tsx:1:1">
          <textarea value="b" />
        </div>
      );
    });

    const { vNode, container } = await render(<Comp />, { debug });
    const textarea = () => container.element.querySelector('textarea') as HTMLTextAreaElement;
    expect(textarea().value).toBe('a');

    const qrl: any = (container as any).getHostProp(vNode, OnRenderProp);
    qrl.resolved = await (CompEdited as any)[SERIALIZABLE_STATE][0].resolve();
    await triggerHmr(container, ['t.tsx']);

    expect(textarea().value).toBe('b');
  });

  it('clears a const boolean attr toggled off on HMR', async () => {
    const Comp = component$(() => {
      _useHmr('b.tsx');
      return (
        <div key="root" data-qwik-inspector="b.tsx:1:1">
          <button disabled={true}>x</button>
        </div>
      );
    });
    const CompEdited = component$(() => {
      _useHmr('b.tsx');
      return (
        <div key="root" data-qwik-inspector="b.tsx:1:1">
          <button disabled={false}>x</button>
        </div>
      );
    });

    const { vNode, container } = await render(<Comp />, { debug });
    const button = () => container.element.querySelector('button') as HTMLButtonElement;
    expect(button().disabled).toBe(true);

    const qrl: any = (container as any).getHostProp(vNode, OnRenderProp);
    qrl.resolved = await (CompEdited as any)[SERIALIZABLE_STATE][0].resolve();
    await triggerHmr(container, ['b.tsx']);

    expect(button().disabled).toBe(false);
  });
});

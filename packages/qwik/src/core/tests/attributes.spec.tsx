import { domRender, ssrRenderToDom, trigger } from '@qwik.dev/core/testing';
import { describe, expect, it } from 'vitest';
import { component$, useSignal, useStore, Fragment as Component, Fragment } from '@qwik.dev/core';

const debug = false; //true;
Error.stackTraceLimit = 100;

describe.each([
  { render: ssrRenderToDom }, //
  { render: domRender }, //
])('$render.name: attributes', ({ render }) => {
  it('should render boolean and number attributes', async () => {
    const AttrComp = component$(() => {
      const required = useSignal(false);
      const state = useStore({
        dataAria: true,
      });

      return (
        <>
          <button id="req" onClick$={() => (required.value = !required.value)}></button>
          <input
            id="input"
            required={required.value}
            aria-hidden={state.dataAria}
            aria-required="false"
            draggable={required.value}
            spellcheck={required.value}
            tabIndex={-1}
          />
        </>
      );
    });

    const { vNode, document } = await render(<AttrComp />, { debug });

    await expect(document.body.querySelector('input')).toMatchDOM(
      <input
        id="input"
        aria-hidden="true"
        aria-required="false"
        draggable={false}
        spellcheck={false}
        tabIndex={-1}
      />
    );
    expect(vNode).toMatchVDOM(
      <Component>
        <Fragment>
          <button id="req"></button>
          <input
            id="input"
            aria-hidden="true"
            aria-required="false"
            draggable={false}
            spellcheck={false}
            tabIndex={-1}
          />
        </Fragment>
      </Component>
    );

    await trigger(document.body, '#req', 'click');

    await expect(document.body.querySelector('input')).toMatchDOM(
      <input
        id="input"
        required={true}
        aria-hidden="true"
        aria-required="false"
        draggable={true}
        spellcheck={true}
        tabIndex={-1}
      />
    );
    expect(vNode).toMatchVDOM(
      <Component>
        <Fragment>
          <button id="req"></button>
          <input
            id="input"
            required={true}
            aria-hidden="true"
            aria-required="false"
            draggable={true}
            spellcheck={true}
            tabIndex={-1}
          />
        </Fragment>
      </Component>
    );

    await trigger(document.body, '#req', 'click');

    await expect(document.body.querySelector('input')).toMatchDOM(
      <input
        id="input"
        aria-hidden="true"
        aria-required="false"
        draggable={false}
        spellcheck={false}
        tabIndex={-1}
      />
    );
    expect(vNode).toMatchVDOM(
      <Component>
        <Fragment>
          <button id="req"></button>
          <input
            id="input"
            aria-hidden="true"
            aria-required="false"
            draggable={false}
            spellcheck={false}
            tabIndex={-1}
          />
        </Fragment>
      </Component>
    );
  });

  it('should bind checked attribute', async () => {
    const BindCmp = component$(() => {
      const show = useSignal(false);
      return (
        <>
          <label for="toggle">
            <input type="checkbox" bind:checked={show} />
            Show conditional
          </label>
          <div>{show.value.toString()}</div>
        </>
      );
    });

    const { vNode, document } = await render(<BindCmp />, { debug });

    expect(vNode).toMatchVDOM(
      <Component ssr-required>
        <Fragment ssr-required>
          <label for="toggle">
            <input type="checkbox" checked={false} />
            {'Show conditional'}
          </label>
          <div>false</div>
        </Fragment>
      </Component>
    );

    // simulate checkbox click
    const input = document.querySelector('input')!;
    input.checked = true;
    await trigger(document.body, 'input', 'input');

    expect(vNode).toMatchVDOM(
      <Component>
        <Fragment>
          <label for="toggle">
            <input type="checkbox" checked={true} />
            {'Show conditional'}
          </label>
          <div>true</div>
        </Fragment>
      </Component>
    );
  });

  it('should render preventdefault attribute', async () => {
    const Cmp = component$(() => {
      const show = useSignal(false);
      return (
        <>
          <button onClick$={() => (show.value = !show.value)}></button>
          <span preventdefault:click></span>
          {show.value && <div preventdefault:click></div>}
        </>
      );
    });

    const { vNode, document } = await render(<Cmp />, { debug });

    expect(vNode).toMatchVDOM(
      <Component ssr-required>
        <Fragment ssr-required>
          <button></button>
          <span preventdefault:click></span>
          {''}
        </Fragment>
      </Component>
    );
    await expect(document.querySelector('span')).toMatchDOM(
      // @ts-ignore-next-line
      <span preventdefault:click=""></span>
    );

    await trigger(document.body, 'button', 'click');

    expect(vNode).toMatchVDOM(
      <Component ssr-required>
        <Fragment ssr-required>
          <button></button>
          <span preventdefault:click></span>
          <div preventdefault:click></div>
        </Fragment>
      </Component>
    );

    await expect(document.querySelector('span')).toMatchDOM(
      // @ts-ignore-next-line
      <span preventdefault:click=""></span>
    );

    await expect(document.querySelector('div')).toMatchDOM(
      // @ts-ignore-next-line
      <div preventdefault:click=""></div>
    );
  });

  it('should update var prop attribute', async () => {
    const Cmp = component$(() => {
      const counter = useSignal(0);
      const props = { 'data-bar': counter.value };
      return <button data-foo={counter.value} {...props} onClick$={() => counter.value++}></button>;
    });

    const { vNode, document } = await render(<Cmp />, { debug });
    expect(vNode).toMatchVDOM(
      <Component ssr-required>
        <button data-foo="0" data-bar="0"></button>
      </Component>
    );
    await trigger(document.body, 'button', 'click');
    await trigger(document.body, 'button', 'click');
    expect(vNode).toMatchVDOM(
      <Component ssr-required>
        <button data-foo="2" data-bar="2"></button>
      </Component>
    );
  });
});

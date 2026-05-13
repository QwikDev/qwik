import { domRender, ssrRenderToDom, trigger } from '@qwik.dev/core/testing';
import { describe, expect, it } from 'vitest';
import { component$, Fragment, Show, useSignal } from '@qwik.dev/core';

const debug = false; //true;
Error.stackTraceLimit = 100;

describe.each([
  { render: ssrRenderToDom }, //
  { render: domRender }, //
])('$render.name: Show', ({ render }) => {
  it('should render the true branch', async () => {
    const Cmp = component$(() => (
      <div id="show">
        <Show when$={() => true} then$={() => <span>Then</span>} else$={() => <span>Else</span>} />
      </div>
    ));

    const { document } = await render(<Cmp />, { debug });

    await expect(document.getElementById('show')).toMatchDOM(
      <div id="show">
        <span>Then</span>
      </div>
    );
  });

  it('should render the false branch', async () => {
    const Cmp = component$(() => (
      <div id="show">
        <Show when$={() => false} then$={() => <span>Then</span>} else$={() => <span>Else</span>} />
      </div>
    ));

    const { document } = await render(<Cmp />, { debug });

    await expect(document.getElementById('show')).toMatchDOM(
      <div id="show">
        <span>Else</span>
      </div>
    );
  });

  it('should render empty content without else$', async () => {
    const Cmp = component$(() => (
      <div id="show">
        <Show when$={() => false} then$={() => <span>Then</span>} />
      </div>
    ));

    const { document } = await render(<Cmp />, { debug });

    await expect(document.getElementById('show')).toMatchDOM(<div id="show" />);
  });

  it('should update when the condition changes', async () => {
    const Cmp = component$(() => {
      const visible = useSignal(true);
      return (
        <Fragment>
          <div id="show">
            <Show
              when$={() => visible.value}
              then$={() => <span>Then</span>}
              else$={() => <span>Else</span>}
            />
          </div>
          <button onClick$={() => (visible.value = !visible.value)}>Toggle</button>
        </Fragment>
      );
    });

    const { document } = await render(<Cmp />, { debug });

    await expect(document.getElementById('show')).toMatchDOM(
      <div id="show">
        <span>Then</span>
      </div>
    );

    await trigger(document.body, 'button', 'click');
    await expect(document.getElementById('show')).toMatchDOM(
      <div id="show">
        <span>Else</span>
      </div>
    );

    await trigger(document.body, 'button', 'click');
    await expect(document.getElementById('show')).toMatchDOM(
      <div id="show">
        <span>Then</span>
      </div>
    );
  });

  it('should only invoke the selected branch', async () => {
    (globalThis as any).showBranchCalls = [];
    const Cmp = component$(() => {
      const visible = useSignal(false);
      return (
        <Fragment>
          <div id="show">
            <Show
              when$={() => visible.value}
              then$={() => {
                (globalThis as any).showBranchCalls.push('then');
                return <span>Then</span>;
              }}
              else$={() => {
                (globalThis as any).showBranchCalls.push('else');
                return <span>Else</span>;
              }}
            />
          </div>
          <button onClick$={() => (visible.value = !visible.value)}>Toggle</button>
        </Fragment>
      );
    });

    const { document } = await render(<Cmp />, { debug });

    expect((globalThis as any).showBranchCalls).toEqual(['else']);
    await expect(document.getElementById('show')).toMatchDOM(
      <div id="show">
        <span>Else</span>
      </div>
    );

    await trigger(document.body, 'button', 'click');
    expect((globalThis as any).showBranchCalls).toEqual(['else', 'then']);
    await expect(document.getElementById('show')).toMatchDOM(
      <div id="show">
        <span>Then</span>
      </div>
    );
  });

  it('should pass the when$ value to then$', async () => {
    const Cmp = component$(() => (
      <div id="show">
        <Show when$={() => 'hello'} then$={(v) => <span>{v}</span>} />
      </div>
    ));

    const { document } = await render(<Cmp />, { debug });

    await expect(document.getElementById('show')).toMatchDOM(
      <div id="show">
        <span>hello</span>
      </div>
    );
  });

  it('should pass the when$ value to else$', async () => {
    const Cmp = component$(() => (
      <div id="show">
        <Show
          when$={() => null as string | null}
          then$={() => <span>Then</span>}
          else$={(v) => <span>{String(v)}</span>}
        />
      </div>
    ));

    const { document } = await render(<Cmp />, { debug });

    await expect(document.getElementById('show')).toMatchDOM(
      <div id="show">
        <span>null</span>
      </div>
    );
  });

  it('should pass the updated when$ value to then$ after signal change', async () => {
    const Cmp = component$(() => {
      const item = useSignal('first');
      return (
        <Fragment>
          <div id="show">
            <Show when$={() => item.value} then$={(v) => <span>{v}</span>} />
          </div>
          <button onClick$={() => (item.value = 'second')}>Change</button>
        </Fragment>
      );
    });

    const { document } = await render(<Cmp />, { debug });

    await expect(document.getElementById('show')).toMatchDOM(
      <div id="show">
        <span>first</span>
      </div>
    );

    await trigger(document.body, 'button', 'click');
    await expect(document.getElementById('show')).toMatchDOM(
      <div id="show">
        <span>second</span>
      </div>
    );
  });
});

import { domRender, ssrRenderToDom, trigger } from '@qwik.dev/core/testing';
import { describe, expect, it } from 'vitest';
import { $, component$, Fragment as Component, inlinedQrl, type QRL } from '@qwik.dev/core';

const debug = false; //true;
Error.stackTraceLimit = 100;

const delayQrl = <T extends Function>(qrl: QRL<T>): QRL<T> => {
  return inlinedQrl(
    Promise.resolve((qrl as any).resolve()),
    'd_' + (qrl as any).$symbol$,
    (qrl as any).$captures$ as any
  ) as any;
};

describe.each([
  { render: ssrRenderToDom }, //
  { render: domRender }, //
])('$render.name: events', ({ render }) => {
  it('should render event value', async () => {
    (globalThis as any).logs = [];
    const Cmp = component$(() => {
      return (
        <button
          onClick$={() => {
            (globalThis as any).logs.push('clicked');
          }}
        ></button>
      );
    });

    const { vNode, document } = await render(<Cmp />, { debug });

    expect(vNode).toMatchVDOM(
      <Component>
        <button></button>
      </Component>
    );
    await trigger(document.body, 'button', 'click');
    expect((globalThis as any).logs).toEqual(['clicked']);
    (globalThis as any).logs = undefined;
  });
  it('should render event falsy value', async () => {
    const Cmp = component$(() => {
      return <button onClick$={undefined}></button>;
    });

    const { vNode } = await render(<Cmp />, { debug });

    expect(vNode).toMatchVDOM(
      <Component>
        <button></button>
      </Component>
    );
  });
  it('should render events array of falsy value', async () => {
    const Cmp = component$(() => {
      return <button onClick$={[undefined, undefined]}></button>;
    });

    const { vNode } = await render(<Cmp />, { debug });

    expect(vNode).toMatchVDOM(
      <Component>
        <button></button>
      </Component>
    );
  });

  it('should not throw if event handler is array with undefined value', async () => {
    const Cmp = component$(() => {
      return <button onClick$={[undefined]}></button>;
    });

    const { vNode, document } = await render(<Cmp />, { debug });
    await trigger(document.body, 'button', 'click');

    expect(vNode).toMatchVDOM(
      <Component>
        <button></button>
      </Component>
    );
  });

  it('registers touchmove as passive', async () => {
    const Cmp = component$(() => {
      return (
        // @qwik-disable-next-line preventdefault-passive-check
        <div passive:touchmove preventdefault:touchmove onTouchMove$={() => {}}></div>
      );
    });

    const { document } = await render(<Cmp />, { debug });

    const ev = await trigger(document.body, 'div', 'touchmove');

    expect(ev!.defaultPrevented).toBe(false);
  });

  it('dispatches capture handlers before bubbling handlers', async () => {
    (globalThis as any).logs = [];
    const Cmp = component$(() => {
      return (
        <div
          capture:click
          onClick$={() => {
            (globalThis as any).logs.push('parent capture');
          }}
        >
          <button
            onClick$={() => {
              (globalThis as any).logs.push('button bubble');
            }}
          ></button>
        </div>
      );
    });

    const { document } = await render(<Cmp />, { debug });

    await trigger(document.body, 'button', 'click');
    expect((globalThis as any).logs).toEqual(['parent capture', 'button bubble']);
    (globalThis as any).logs = undefined;
  });

  it('stops bubbling after capture stoppropagation', async () => {
    (globalThis as any).logs = [];
    const Cmp = component$(() => {
      return (
        <div
          capture:click
          stoppropagation:click
          onClick$={() => {
            (globalThis as any).logs.push('parent capture');
          }}
        >
          <button
            onClick$={() => {
              (globalThis as any).logs.push('button bubble');
            }}
          ></button>
        </div>
      );
    });

    const { document } = await render(<Cmp />, { debug });

    await trigger(document.body, 'button', 'click');
    expect((globalThis as any).logs).toEqual(['parent capture']);
    (globalThis as any).logs = undefined;
  });

  it('applies parent preventdefault when a child button click bubbles through an anchor', async () => {
    (globalThis as any).logs = [];
    const Cmp = component$(() => {
      return (
        <a
          href="https://qwik.dev"
          preventdefault:click
          onClick$={() => {
            (globalThis as any).logs.push('parent');
          }}
        >
          <button
            onClick$={async () => {
              (globalThis as any).logs.push('child');
            }}
          ></button>
        </a>
      );
    });

    const { document } = await render(<Cmp />, { debug });
    const ev = await trigger(document.body, 'button', 'click');

    expect(ev?.defaultPrevented).toBe(true);
    expect((globalThis as any).logs).toEqual(['child', 'parent']);
    (globalThis as any).logs = undefined;
  });
});

// delayed handlers can be only for ssr
it('preserves mouseleave and mouseover execution order when delayed qrls resolve out of order', async () => {
  (globalThis as any).logs = [];
  (globalThis as any).leavePromise = new Promise<void>((resolve) => {
    (globalThis as any).resolveLeave = resolve;
  });
  (globalThis as any).overPromise = new Promise<void>((resolve) => {
    (globalThis as any).resolveOver = resolve;
  });

  const leaveQrl = delayQrl(
    $(async () => {
      await (globalThis as any).leavePromise;
      (globalThis as any).logs.push('red mouse out');
    })
  );
  const overQrl = delayQrl(
    $(async () => {
      await (globalThis as any).overPromise;
      (globalThis as any).logs.push('blue mouse in');
    })
  );

  const Cmp = component$(() => {
    return (
      <div>
        <div onMouseLeave$={leaveQrl}></div>
        <div onMouseOver$={overQrl}></div>
      </div>
    );
  });

  const { document } = await ssrRenderToDom(<Cmp />, { debug });
  const divs = document.querySelectorAll('div');
  const red = divs[1]!;
  const blue = divs[2]!;

  const leave = trigger(document.body, red, 'mouseleave', {}, { waitForIdle: false });
  const over = trigger(document.body, blue, 'mouseover', {}, { waitForIdle: false });

  (globalThis as any).resolveOver();
  await Promise.resolve();
  expect((globalThis as any).logs).toEqual([]);

  (globalThis as any).resolveLeave();
  await Promise.all([leave, over]);
  expect((globalThis as any).logs).toEqual(['red mouse out', 'blue mouse in']);

  (globalThis as any).logs = undefined;
  (globalThis as any).leavePromise = undefined;
  (globalThis as any).overPromise = undefined;
  (globalThis as any).resolveLeave = undefined;
  (globalThis as any).resolveOver = undefined;
});

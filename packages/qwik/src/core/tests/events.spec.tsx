import { domRender, ssrRenderToDom, trigger } from '@qwik.dev/core/testing';
import { describe, expect, it } from 'vitest';
import { component$, Fragment as Component } from '@qwik.dev/core';
import { dispatch, ElementFixture } from '../../testing/element-fixture';

const debug = false; //true;
Error.stackTraceLimit = 100;

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

  it('sets defaultPrevented before async child handlers resume', async () => {
    (globalThis as any).logs = [];
    const Cmp = component$(() => {
      return (
        <a href="/" preventdefault:click>
          <button
            onClick$={async (ev) => {
              (globalThis as any).logs.push(`child start ${ev.defaultPrevented}`);
              await Promise.resolve();
              (globalThis as any).logs.push('child end');
            }}
          ></button>
        </a>
      );
    });

    const { document } = await render(<Cmp />, { debug });

    trigger(document.body, 'button', 'click', {}, { waitForIdle: false });
    await Promise.resolve();
    await Promise.resolve();
    expect((globalThis as any).logs).toEqual(['child start true', 'child end']);
    (globalThis as any).logs = undefined;
  });

  it('sets cancelBubble before async child handlers resume', async () => {
    (globalThis as any).logs = [];
    const Cmp = component$(() => {
      return (
        <div
          onClick$={() => {
            (globalThis as any).logs.push('root bubble');
          }}
        >
          <div stoppropagation:click>
            <button
              onClick$={async (ev) => {
                (globalThis as any).logs.push(`child start ${ev.cancelBubble}`);
                await Promise.resolve();
                (globalThis as any).logs.push('child end');
              }}
            ></button>
          </div>
        </div>
      );
    });

    const { document } = await render(<Cmp />, { debug });

    trigger(document.body, 'button', 'click', {}, { waitForIdle: false });
    await Promise.resolve();
    await Promise.resolve();
    expect((globalThis as any).logs).toEqual(['child start true', 'child end']);
    (globalThis as any).logs = undefined;
  });
});

describe('element fixture dispatch', () => {
  it('keeps later sync work immediate while queuing later async continuations', async () => {
    const fixture = new ElementFixture();
    const logs: string[] = [];
    let resolveFirst!: () => void;
    const firstPromise = new Promise<void>((resolve) => {
      resolveFirst = resolve;
    });
    let resolveSecond!: () => void;
    const secondPromise = new Promise<void>((resolve) => {
      resolveSecond = resolve;
    });

    const firstParent = fixture.document.createElement('div');
    const firstButton = fixture.document.createElement('button');
    firstParent.appendChild(firstButton);
    fixture.host.appendChild(firstParent);
    (firstParent as any)._qDispatch = {
      'e:click': () => logs.push('first parent'),
    };
    (firstButton as any)._qDispatch = {
      'e:click': async () => {
        logs.push('first start');
        await firstPromise;
      },
    };

    const secondParent = fixture.document.createElement('div');
    const secondButton = fixture.document.createElement('button');
    secondParent.appendChild(secondButton);
    fixture.host.appendChild(secondParent);
    (secondParent as any)._qDispatch = {
      'e:click': () => logs.push('second parent'),
    };
    (secondButton as any)._qDispatch = {
      'e:click': [() => logs.push('second sync'), () => secondPromise],
    };

    const firstResult = dispatch(
      firstButton,
      new Event('click', { bubbles: true }),
      'e:click',
      'click'
    );
    const secondResult = dispatch(
      secondButton,
      new Event('click', { bubbles: true }),
      'e:click',
      'click'
    );

    await Promise.resolve();
    expect(logs).toEqual(['first start', 'second sync']);

    resolveSecond();
    await Promise.resolve();
    expect(logs).toEqual(['first start', 'second sync']);

    resolveFirst();
    await firstResult;
    await secondResult;

    expect(logs).toEqual(['first start', 'second sync', 'first parent', 'second parent']);
  });
});

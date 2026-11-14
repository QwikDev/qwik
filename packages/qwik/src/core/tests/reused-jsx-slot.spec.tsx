import { component$, Slot, useConstant, useSignal, type JSXOutput } from '@qwik.dev/core';
import { domRender, ssrRenderToDom, trigger } from '@qwik.dev/core/testing';
import { describe, expect, it } from 'vitest';

describe.each([{ render: domRender }, { render: ssrRenderToDom }])(
  '$render.name: reused JSXOutput slot (#9350)',
  ({ render }) => {
    it('preserves projected text after two keyed remounts', async () => {
      const Leaf = component$(() => (
        <span id="leaf">
          <Slot />
        </span>
      ));
      const Panel = component$<{ content: JSXOutput }>((props) => (
        <div id="panel">Panel content: "{props.content}"</div>
      ));
      const Parent = component$(() => {
        const content = useConstant((): JSXOutput => <Leaf>hello</Leaf>);
        const gen = useSignal(1);
        return (
          <div>
            <button id="remount" onClick$={() => gen.value++}>
              Remount {gen.value}
            </button>
            <Panel key={gen.value} content={content} />
          </div>
        );
      });
      const { document } = await render(<Parent />);
      expect(document.querySelector('#leaf')?.textContent).toBe('hello');
      for (let generation = 2; generation <= 3; generation++) {
        await trigger(document.body, '#remount', 'click');
        expect.soft(document.querySelector('#remount')?.textContent).toBe(`Remount ${generation}`);
        expect.soft(document.querySelector('#leaf')?.textContent).toBe('hello');
        expect.soft(document.querySelector('#panel')?.textContent).toBe('Panel content: "hello"');
      }
    });
  }
);
